import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { AppError } from '../exceptions';

const TTL_SECONDS = 24 * 60 * 60; // 24h
const MAX_KEY_LENGTH = 256;
const KEY_REGEX = /^[A-Za-z0-9_\-:.]{6,256}$/;

/**
 * Idempotency-Key middleware (RFC 9457-flavoured).
 *
 * Behaviour:
 *   - Required header `Idempotency-Key`. Format: 6–256 chars, [A-Za-z0-9_\-:.].
 *   - On first request: caches a placeholder for TTL_SECONDS, calls next().
 *     The route handler is responsible for calling `commitIdempotency(req, payload)`
 *     once the response is ready, which stores the response body so future
 *     duplicate requests get the same response without re-executing.
 *   - On duplicate request with same key + same userId + same path:
 *     returns the cached response immediately with `X-Idempotent-Replay: true`.
 *   - On duplicate request with **mismatched** body hash, returns 409 to prevent
 *     accidental reuse of the same key for different payloads.
 *
 * Designed for: `POST /api/v1/billing/orders`, `POST /api/v1/billing/refunds`,
 * any `POST` that creates money-touching resources.
 */
export interface IdempotentResponse {
  status: number;
  body: unknown;
  bodyHash: string;
  createdAt: number;
}

function buildKey(req: Request): string | null {
  const headerKey = (req.get('Idempotency-Key') || '').trim();
  if (!headerKey) return null;
  if (headerKey.length > MAX_KEY_LENGTH || !KEY_REGEX.test(headerKey)) return null;
  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? 'anon';
  const route = req.method + ':' + (req.baseUrl || '') + (req.route?.path || req.path);
  return `idem:${userId}:${route}:${headerKey}`;
}

function bodyHash(req: Request): string {
  const json = JSON.stringify(req.body ?? {});
  return crypto.createHash('sha256').update(json).digest('hex');
}

export function requireIdempotencyKey(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = buildKey(req);
    if (!key) {
      return next(
        new AppError(
          'Missing or invalid Idempotency-Key header. Header must be 6-256 chars matching /^[A-Za-z0-9_\\-:.]+$/.',
          400,
          'IDEMPOTENCY_KEY_REQUIRED'
        )
      );
    }
    const hash = bodyHash(req);
    try {
      const cached = await redis.get(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as IdempotentResponse;
          // body hash must match the original request — otherwise reject
          if (parsed.bodyHash && parsed.bodyHash !== hash) {
            return next(
              new AppError(
                'Idempotency-Key reuse with different request body is forbidden.',
                409,
                'IDEMPOTENCY_BODY_MISMATCH'
              )
            );
          }
          // Replay
          res.setHeader('X-Idempotent-Replay', 'true');
          return res.status(parsed.status).json(parsed.body);
        } catch {
          // corrupt cache entry — ignore and fall through
        }
      }
    } catch (err) {
      logger.warn('Idempotency redis read failed — proceeding without cache', { err });
    }

    // Tag request so the route handler can call commitIdempotency at end
    (req as Request & { __idemKey?: string; __idemBodyHash?: string }).__idemKey = key;
    (req as Request & { __idemKey?: string; __idemBodyHash?: string }).__idemBodyHash = hash;
    return next();
  };
}

/**
 * Call from inside the route handler AFTER the response body is finalised.
 * Stores the response keyed by Idempotency-Key for TTL_SECONDS.
 */
export async function commitIdempotency(
  req: Request,
  status: number,
  body: unknown
): Promise<void> {
  const augmented = req as Request & { __idemKey?: string; __idemBodyHash?: string };
  const key = augmented.__idemKey;
  const hash = augmented.__idemBodyHash;
  if (!key || !hash) return;
  const payload: IdempotentResponse = {
    status,
    body,
    bodyHash: hash,
    createdAt: Date.now(),
  };
  try {
    await redis.set(key, JSON.stringify(payload), 'EX', TTL_SECONDS);
  } catch (err) {
    logger.warn('Idempotency redis write failed', { err, key });
  }
}

/**
 * Convenience helper that wraps a Promise-returning handler so commit is
 * automatic. Use when the handler returns the response body.
 */
export async function withIdempotency(
  req: Request,
  res: Response,
  status: number,
  body: unknown
): Promise<void> {
  await commitIdempotency(req, status, body);
  res.status(status).json(body);
}
