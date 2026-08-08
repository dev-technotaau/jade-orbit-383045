import type { Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';

/**
 * Razorpay webhook raw-body capture middleware.
 *
 * Razorpay signs the **raw bytes** of the POST body with HMAC-SHA256 keyed
 * by the webhook secret. Once Express's `express.json()` parser has run,
 * the raw bytes are gone — so this middleware MUST be mounted on the
 * webhook route BEFORE any global JSON body parser.
 *
 * Captures the body as both:
 *   - `req.rawBody` (Buffer)         — for HMAC verification
 *   - `req.body`    (parsed JSON)    — for event handling
 *
 * Limit: 1 MiB (Razorpay payloads are < 30 KiB; large limit = future-proof).
 */
export function razorpayWebhookRawBody(): RequestHandler[] {
  const rawParser = express.raw({ type: '*/*', limit: '1mb' });

  const promote: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    if (Buffer.isBuffer(req.body)) {
      const buf = req.body as Buffer;
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
      try {
        const parsed = buf.length > 0 ? JSON.parse(buf.toString('utf8')) : {};
        req.body = parsed;
      } catch {
        req.body = {};
      }
    }
    next();
  };

  return [rawParser, promote];
}

/**
 * Express type augmentation. Allows controllers to read `req.rawBody`
 * without TypeScript complaints.
 */
declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}
