import type { Request, Response } from 'express';
import { ingestWebhook } from '../services/razorpay-webhook.service';
import { razorpayWebhookQueue } from '../jobs/razorpay-webhook.queue';
import { billingWebhooksTotal } from '../routes/metrics.routes';
import logger from '../config/logger';

/**
 * `POST /api/v1/webhooks/razorpay`
 *
 * Mounted on `app` directly (NOT `apiV1Router`) BEFORE the global JSON
 * parser, with `razorpayWebhookRawBody()` capturing the raw bytes.
 *
 * Behaviour:
 *   - 200 OK is returned ASAP (Razorpay retries on non-2xx)
 *   - HMAC verified synchronously
 *   - Event persisted (deduped by `event.id`)
 *   - Async processing dispatched via BullMQ
 *   - Even invalid signatures get persisted (with `signatureValid=false`)
 *     so super-admin can investigate replay attempts.
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get('x-razorpay-signature') ?? '';
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    logger.warn('Razorpay webhook arrived without raw body — middleware misconfigured');
    res.status(400).json({ ok: false, error: 'raw body missing' });
    return;
  }
  if (!signature) {
    logger.warn('Razorpay webhook missing x-razorpay-signature header');
    res.status(400).json({ ok: false, error: 'missing signature' });
    return;
  }

  try {
    const result = await ingestWebhook({
      rawBody,
      signature,
      parsed: req.body,
    });

    const eventName = req.body?.event ?? 'unknown';

    // Always 200 — even on bad signature we've persisted the row for audit.
    if (!result.signatureValid) {
      logger.warn('Razorpay webhook signature invalid — persisted but not enqueued', {
        eventRowId: result.id,
      });
      billingWebhooksTotal.inc({ event: eventName, status: 'signature_invalid' });
      res.status(200).json({ ok: true, enqueued: false, reason: 'signature_invalid' });
      return;
    }

    if (!result.duplicate) {
      await razorpayWebhookQueue
        .add(
          'razorpay-webhook',
          { eventRowId: result.id, event: eventName },
          { jobId: result.id } // dedup at the queue layer too
        )
        .catch((err) => {
          logger.error('Failed to enqueue Razorpay webhook job', { err });
        });
      billingWebhooksTotal.inc({ event: eventName, status: 'enqueued' });
    } else {
      billingWebhooksTotal.inc({ event: eventName, status: 'duplicate' });
    }

    res.status(200).json({
      ok: true,
      enqueued: !result.duplicate,
      duplicate: result.duplicate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Razorpay webhook handler crashed', { err: message });
    // Still 200 to prevent Razorpay's retry storm — we'll fix from logs.
    res.status(200).json({ ok: false, error: message });
  }
}
