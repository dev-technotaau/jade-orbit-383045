import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { AppError } from './error';

/**
 * How long a completed response stays replayable. Long enough to cover an
 * operator who retried after lunch, short enough that the keys expire on their
 * own.
 */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/** Marker stored while the original request is still running. */
const IN_FLIGHT = '\u0000in-flight';

/**
 * Keys are echoed back into Redis key names, so they get the same treatment as
 * any other client-supplied identifier: a bounded, boring charset.
 */
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

interface StoredResponse {
  status: number;
  body: unknown;
}

/**
 * Idempotent replay for expensive, non-repeatable POSTs.
 *
 * The media send is the reason this exists. It is a chain of BFF buffer → multer
 * parse → virus scan → a full multipart upload of the file to graph.facebook.com
 * → the send itself, and on a slow uplink that can outlast any client timeout.
 * When it did, the browser aborted and the operator pressed send again — while
 * the first attempt was still running and went on to deliver the file. The
 * customer got the attachment twice and the account was billed twice, and
 * nothing existed that could have collapsed the two: the second request looked
 * identical to a genuine second send.
 *
 * With a key, the retry either replays the first response (already finished) or
 * is refused with 409 (still running), so the duplicate can never reach Meta.
 *
 * Degrades open. If the dedup store is unavailable the request proceeds — a send
 * that works and might duplicate beats a send that cannot happen at all.
 */
export const idempotent = (opts: {
  /** Namespace so two routes cannot collide on the same client key. */
  scope: string;
  /** Reject the request outright when the header is missing. */
  required?: boolean;
  ttlSeconds?: number;
}) => {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.get('Idempotency-Key');
    const key = typeof header === 'string' ? header.trim() : '';

    if (!key) {
      if (opts.required) {
        next(
          new AppError(
            'An Idempotency-Key header is required for this request',
            400,
            'IDEMPOTENCY_KEY_REQUIRED'
          )
        );
        return;
      }
      next();
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      next(
        new AppError(
          'Idempotency-Key must be 8-200 characters of [A-Za-z0-9._:-]',
          400,
          'IDEMPOTENCY_KEY_INVALID'
        )
      );
      return;
    }

    // REDIS_ENABLED=false swaps in a mock whose every command resolves null,
    // which would read as "some other request holds this key" and 409 every
    // send. Nothing can be deduped without a store, so don't pretend otherwise.
    if ((redis.status as string) === 'disabled') {
      next();
      return;
    }

    const redisKey = `idem:${opts.scope}:${key}`;
    let claimed = false;
    try {
      claimed = (await redis.set(redisKey, IN_FLIGHT, 'EX', ttl, 'NX')) === 'OK';
      if (!claimed) {
        const stored = await redis.get(redisKey);
        if (stored === null) {
          // Expired between SET NX and GET — treat as a fresh request.
          claimed = true;
        } else if (stored === IN_FLIGHT) {
          next(
            new AppError(
              'An identical request is still being processed',
              409,
              'IDEMPOTENT_REQUEST_IN_FLIGHT'
            )
          );
          return;
        } else {
          const replay = JSON.parse(stored) as StoredResponse;
          res.setHeader('Idempotent-Replay', 'true');
          res.status(replay.status).json(replay.body);
          return;
        }
      }
    } catch (err) {
      logger.error('Idempotency store unavailable — proceeding without dedup:', err);
      next();
      return;
    }

    // Capture the response so a later retry can be answered with it verbatim.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      if (status >= 200 && status < 400) {
        void redis
          .set(redisKey, JSON.stringify({ status, body } satisfies StoredResponse), 'EX', ttl)
          .catch(() => {});
      } else {
        // A failed attempt is not an outcome worth replaying — the operator
        // pressing send again after an error must actually send.
        void redis.del(redisKey).catch(() => {});
      }
      return originalJson(body);
    };
    // Aborted mid-flight (client hung up, handler threw past the JSON path):
    // release the claim, or the retry meets an IN_FLIGHT marker that nothing
    // will ever resolve and 409s for the whole TTL.
    // Deliberately NO release on 'close'.
    //
    // A disconnect does not cancel the handler -- uploadMediaToMeta keeps running
    // and still delivers. Releasing the claim here freed it at precisely the
    // moment the operator could retry (the send button is only re-enabled once
    // the request drops), so the retry won a fresh SET NX and sent the media a
    // second time: delivered twice, billed twice. That is the exact failure this
    // middleware exists to prevent, and it is reachable on the documented hosting
    // because the BFF proxy caps maxDuration at 60s, below the 120s upload
    // timeout. Genuine failures still release the key in the 4xx/5xx branch
    // above; leaving it held until TTL is the safe direction to err.

    next();
  };
};

export default idempotent;
