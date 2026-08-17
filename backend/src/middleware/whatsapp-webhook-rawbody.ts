import type { ErrorRequestHandler, Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';
import logger from '../config/logger';
import { waWebhookRejectedTotal } from '../utils/whatsapp-metrics';

/**
 * WhatsApp (Meta) webhook raw-body capture middleware.
 *
 * Meta signs the **raw bytes** of the POST body with HMAC-SHA256 keyed by the
 * App Secret (header `X-Hub-Signature-256`). Once Express's `express.json()`
 * parser has run, the raw bytes are gone — so this MUST be mounted on the
 * webhook route BEFORE any global JSON body parser.
 *
 * Captures the body as both:
 *   - `req.rawBody` (Buffer)       — for HMAC verification
 *   - `req.body`    (parsed JSON)  — for event handling
 *
 * A body that will not parse also sets `req.rawBodyParseError`, so ingestion can
 * tell "Meta sent nothing" apart from "Meta sent something we could not read".
 *
 * (`req.rawBody` is augmented onto Express.Request in
 * `razorpay-webhook-rawbody.ts`; we reuse that global augmentation here.)
 */
export function whatsappWebhookRawBody(): RequestHandler[] {
  // 5 MB, not the 1 MB this used to carry. Meta batches up to 100 entries into
  // a single POST, and a batch of long message bodies plus interactive/media
  // descriptors can approach a megabyte. Over the limit body-parser throws
  // `entity.too.large` BEFORE the controller runs, so the controller's
  // always-2xx contract never got a say — and because the oversized payload is
  // byte-identical on every Meta retry, it fails the same way every time:
  // exactly the sustained-failure pattern Meta disables a subscription for.
  const rawParser = express.raw({ type: '*/*', limit: '5mb' });

  const promote: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    if (Buffer.isBuffer(req.body)) {
      const buf = req.body as Buffer;
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
      try {
        req.body = buf.length > 0 ? JSON.parse(buf.toString('utf8')) : {};
      } catch (err) {
        // Flag it — do NOT let it look like an empty delivery. The HMAC is taken
        // over the raw bytes, so a truncated or otherwise malformed payload from
        // Meta still verifies; ingestion then persisted this `{}`, classified it
        // 'unknown' and the worker stamped it processed. Meta was answered 200,
        // never redelivered it, and the only copy of the content was discarded.
        // With the flag set, ingestion stores the raw bytes instead.
        req.body = {};
        (req as Request & { rawBodyParseError?: string }).rawBodyParseError =
          err instanceof Error ? err.message : String(err);
      }
    }
    next();
  };

  return [rawParser, promote];
}

/**
 * Route-scoped error handler for the Meta webhook path.
 *
 * The controller promises Meta a 2xx for anything a redelivery cannot fix, but
 * that promise only ever covered the controller body. Anything that threw
 * EARLIER in the route stack — the raw parser rejecting an oversized payload
 * with `entity.too.large` (413), a connection aborted mid-body — fell through
 * to the global error middleware, which faithfully answered `err.statusCode`.
 * Meta retries every non-2xx and counts sustained failures towards disabling
 * the subscription, and an oversized payload fails identically on every retry,
 * so one bad delivery could take the entire inbound feed offline until somebody
 * noticed the silence.
 *
 * Mounted AFTER the webhook routes so it sees their errors, and it converts
 * them into the logged, counted 200 the rest of the route already returns. The
 * controller handles its own failures and deliberately answers 500 when the
 * durable write throws (a redelivery is exactly what is wanted there), so
 * nothing from inside it reaches this handler.
 */
export const whatsappWebhookErrorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  // Headers already flushed — the status line is long gone, so the only correct
  // move is to hand it back to Express and let it destroy the socket.
  if (res.headersSent) {
    next(err);
    return;
  }

  const e = err as { type?: string; status?: number; statusCode?: number } | null;
  const status = Number(e?.status ?? e?.statusCode);
  const reason =
    e?.type === 'entity.too.large' || status === 413 ? 'payload_too_large' : 'malformed_request';

  waWebhookRejectedTotal.inc({ reason });
  logger.error(
    'WhatsApp webhook request rejected before ingestion — answered 200 to keep the subscription alive',
    {
      reason,
      err: err instanceof Error ? err.message : String(err),
    }
  );

  res.status(200).json({ ok: false, dropped: reason });
};
