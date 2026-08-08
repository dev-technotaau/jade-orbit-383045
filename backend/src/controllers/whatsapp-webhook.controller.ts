import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';
import { ingestWhatsappWebhook } from '../services/whatsapp-webhook.service';
import { fanOutInboundToChatwoot } from '../services/whatsapp-bridge.service';
import { addWhatsappInboundJob } from '../jobs/whatsapp-inbound.queue';
import {
  waWebhookEventsTotal,
  waWebhookLastEventTimestamp,
  captureWaException,
} from '../utils/whatsapp-metrics';

/** Constant-time string compare (length-checked) — avoids leaking the verify
 *  token via response-timing on the subscription handshake. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * `GET /api/v1/webhooks/whatsapp` — Meta verification handshake.
 *
 * Meta calls with `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
 * When the verify token matches our secret, echo the raw `hub.challenge`.
 */
export function verifyWhatsappWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (
    mode === 'subscribe' &&
    typeof token === 'string' &&
    !!expected &&
    timingSafeEqualStr(token, expected)
  ) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  logger.warn('WhatsApp webhook verification failed (token mismatch or missing)');
  res.sendStatus(403);
}

/**
 * `POST /api/v1/webhooks/whatsapp` — inbound messages + delivery status.
 *
 * Mounted on `app` directly (NOT `apiV1Router`) BEFORE the global JSON parser,
 * with `whatsappWebhookRawBody()` capturing the raw bytes for HMAC. Returns
 * 200 fast (Meta retries non-2xx — a non-2xx on bad signature would cause a
 * retry storm and can disable the webhook); signature is verified, a minimal
 * audit stub is persisted on mismatch (real payload only when verified), and
 * valid events are enqueued for async processing by the inbound worker.
 */
export async function handleWhatsappWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get('x-hub-signature-256') ?? undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    logger.warn('WhatsApp webhook arrived without raw body — middleware misconfigured');
    res.status(400).json({ ok: false, error: 'raw body missing' });
    return;
  }

  try {
    const result = await ingestWhatsappWebhook({ rawBody, signature, parsed: req.body });

    waWebhookEventsTotal.inc({
      signature_ok: String(result.signatureOk),
      event_type: result.eventType ?? 'unknown',
    });
    if (result.signatureOk) waWebhookLastEventTimestamp.setToCurrentTime();

    if (!result.signatureOk) {
      // Invalid/unconfigured X-Hub-Signature-256: log + drop. We MUST return a
      // 2xx — a non-2xx makes Meta retry the same payload (retry storm) and can
      // disable the webhook. Only a minimal audit stub was persisted (no
      // attacker-controlled payload), and nothing is enqueued.
      logger.warn('WhatsApp webhook signature invalid/unconfigured — dropped (stub persisted)', {
        eventRowId: result.id,
      });
      res.status(200).json({ ok: false, dropped: 'invalid signature' });
      return;
    }

    await addWhatsappInboundJob({ eventRowId: result.id }).catch((err) => {
      logger.error('Failed to enqueue WhatsApp inbound job', { err });
    });
    void fanOutInboundToChatwoot(rawBody); // optional Chatwoot mirror (no-op if disabled)

    res.status(200).json({ ok: true, enqueued: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('WhatsApp webhook handler crashed', { err: message });
    void captureWaException(err);
    // Still 200 to prevent Meta's retry storm — investigate from logs.
    res.status(200).json({ ok: false, error: message });
  }
}
