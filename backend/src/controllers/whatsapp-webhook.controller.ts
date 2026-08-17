import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';
import {
  ingestWhatsappWebhook,
  recordSignatureFailure,
  getWebhookHealth,
  listWebhookEvents,
  getWebhookEvent as loadWebhookEvent,
  resetWebhookEventForReprocess,
} from '../services/whatsapp-webhook.service';
import { fanOutInboundToChatwoot } from '../services/whatsapp-bridge.service';
import { AppError } from '../middleware/error';
import { addWhatsappInboundJob, requeueWhatsappInboundJob } from '../jobs/whatsapp-inbound.queue';
import {
  waWebhookEventsTotal,
  waWebhookLastEventTimestamp,
  waWebhookRejectedTotal,
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
 * retry storm and can disable the webhook); the signature is verified before
 * anything is written, an unverified request is counted + logged and dropped
 * without a database row, and valid events are enqueued for async processing by
 * the inbound worker.
 */
export async function handleWhatsappWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get('x-hub-signature-256') ?? undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  // Set by whatsappWebhookRawBody() when the bytes would not parse as JSON. It
  // has to travel to ingestion: the signature is over the RAW body and still
  // verifies, so without this the empty `req.body` was persisted as the payload
  // and the delivery was recorded as a successful, empty, processed event.
  const parseError = (req as Request & { rawBodyParseError?: string }).rawBodyParseError;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    // 200, NOT 400. A missing raw body means OUR middleware order is wrong, so
    // it is wrong for EVERY delivery — and a 400 on every delivery is precisely
    // the sustained failure Meta disables a subscription for. A disabled
    // subscription does not come back when the deploy is fixed; someone has to
    // re-subscribe by hand, and everything Meta tried to send meanwhile is gone.
    // Dropping quietly and letting the counter raise the alarm keeps the blast
    // radius at "inbound is broken until we notice" instead of "inbound is
    // broken and the webhook is now switched off".
    logger.warn('WhatsApp webhook arrived without raw body — middleware misconfigured');
    waWebhookRejectedTotal.inc({ reason: 'raw_body_missing' });
    res.status(200).json({ ok: false, dropped: 'raw body missing' });
    return;
  }

  try {
    const result = await ingestWhatsappWebhook({
      rawBody,
      signature,
      parsed: req.body,
      parseError,
    });

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
      logger.warn('WhatsApp webhook signature invalid/unconfigured — dropped (nothing persisted)');
      // Counted in Redis as well as the metric. An app-secret rotation that never
      // reached META_WHATSAPP_APP_SECRET drops 100% of inbound traffic while
      // still answering 200 — with no row and no log an operator was reading,
      // that is invisible from the console. This is what the Webhook panel shows.
      void recordSignatureFailure();
      res.status(200).json({ ok: false, dropped: 'invalid signature' });
      return;
    }

    // Meta redelivered bytes we already hold — its usual trigger is our own slow
    // response, i.e. the moment we can least afford the duplicate work. Ingestion
    // collapsed it onto the original row; the only thing left to decide is
    // whether that row still needs processing. Already processed means the reply
    // is in the inbox and the status has been reconciled: re-running it would
    // re-walk the payload and re-schedule the campaign counter recompute for
    // nothing. Still unprocessed means the first job is queued (or died and the
    // recovery cron will want it), so enqueue — `addWhatsappInboundJob` pins the
    // job id to the row id, so a live job absorbs this without a second run.
    const enqueued = Boolean(result.id) && !result.alreadyProcessed;
    if (result.id && enqueued) {
      await addWhatsappInboundJob({ eventRowId: result.id }).catch((err) => {
        logger.error('Failed to enqueue WhatsApp inbound job', { err });
      });
    }
    if (result.duplicate) {
      logger.debug('WhatsApp webhook redelivery collapsed onto the stored event', {
        eventId: result.id,
        eventType: result.eventType,
        enqueued,
      });
    } else {
      // Mirrored only on first sight: Chatwoot has no dedup of its own, so a
      // retry would post the customer's message into the agent thread twice.
      void fanOutInboundToChatwoot(rawBody); // optional Chatwoot mirror (no-op if disabled)
    }

    res.status(200).json({ ok: true, enqueued, ...(result.duplicate ? { duplicate: true } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('WhatsApp webhook handler crashed', { err: message });
    void captureWaException(err);

    // 500, NOT 200.
    //
    // The try block spans the only durable write of the payload. Answering 200
    // when that write threw told Meta the message was delivered, and Meta does
    // not send it again — so a Prisma pool timeout (P2024) or a Postgres blip
    // silently and PERMANENTLY destroyed real customer messages, with nothing but
    // a log line to show for it.
    //
    // A retry is exactly what we want here: the payload is signature-verified and
    // ingestion is idempotent on Meta’s event id, so a redelivery either lands or
    // is de-duplicated. The forced-200 is kept where it belongs and is genuinely
    // needed — invalid signatures and unparseable bodies, above, which retrying
    // could never fix and which would otherwise get the webhook disabled.
    res.status(500).json({ ok: false, error: message });
  }
}

/**
 * `GET /whatsapp/webhook-health` — is inbound delivery actually alive?
 *
 * Meta disables a subscription after sustained delivery failures, and also stops
 * delivering when the callback URL's TLS certificate expires. Either way the
 * inbox simply goes quiet: no error, no banner, `/health` still green. Meta does
 * not backfill, so this is the control that turns silence into a signal.
 */
export const getHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // The Graph round trip is opt-in — the settings page asks for it, polling
    // callers do not.
    const checkSubscription = req.query.checkSubscription === 'true';
    const data = await getWebhookHealth({ checkSubscription });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/**
 * `GET /whatsapp/webhook-events` — raw events Meta delivered, newest first.
 *
 * The table was write-only, so "the message never arrived" could not be told
 * apart from "it arrived and the worker choked on it" without a psql session.
 * Payloads are excluded here (they carry message bodies); the detail route below
 * serves them and is audited for exactly that reason.
 */
export const listEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { eventType, state, from, to, page, limit } = req.query;
    const data = await listWebhookEvents({
      eventType: (eventType as string) || undefined,
      state: (state as string) || undefined,
      from: from ? new Date(String(from)) : undefined,
      to: to ? new Date(String(to)) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** `GET /whatsapp/webhook-events/:id` — one event including its raw payload. */
export const getEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const event = await loadWebhookEvent(String(req.params.id));
    if (!event) throw new AppError('Webhook event not found', 404, 'WA_WEBHOOK_EVENT_NOT_FOUND');
    res.json({ success: true, data: event });
  } catch (e) {
    next(e);
  }
};

/**
 * `POST /whatsapp/webhook-events/:id/reprocess` — replay one event.
 *
 * Seeing that an event is stuck was already possible; doing anything about it
 * was not. An event that failed for a reason since fixed sat unprocessed
 * forever — the recovery cron gives up after a bounded number of attempts — and
 * the customer message inside it never reached the inbox. Clearing the state
 * before the requeue matters: the worker returns early on `processedAt`, so a
 * bare re-enqueue would be a no-op.
 *
 * `requeued: false` means a job for this event is already waiting or running, so
 * nothing new was scheduled — it is about to be processed either way.
 */
export const reprocessEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const event = await resetWebhookEventForReprocess(id);
    if (!event) throw new AppError('Webhook event not found', 404, 'WA_WEBHOOK_EVENT_NOT_FOUND');
    const job = await requeueWhatsappInboundJob(id);
    res.json({ success: true, data: { ...event, requeued: job !== null } });
  } catch (e) {
    next(e);
  }
};
