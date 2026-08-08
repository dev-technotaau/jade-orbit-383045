import type { Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';

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
 * (`req.rawBody` is augmented onto Express.Request in
 * `razorpay-webhook-rawbody.ts`; we reuse that global augmentation here.)
 */
export function whatsappWebhookRawBody(): RequestHandler[] {
  const rawParser = express.raw({ type: '*/*', limit: '1mb' });

  const promote: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    if (Buffer.isBuffer(req.body)) {
      const buf = req.body as Buffer;
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
      try {
        req.body = buf.length > 0 ? JSON.parse(buf.toString('utf8')) : {};
      } catch {
        req.body = {};
      }
    }
    next();
  };

  return [rawParser, promote];
}
