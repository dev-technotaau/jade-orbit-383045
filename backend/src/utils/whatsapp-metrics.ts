/**
 * Prometheus metrics + the WhatsApp exception funnel.
 *
 * Metrics auto-register to prom-client's global registry, so they appear at
 * `GET /metrics` (see `src/routes/metrics.routes.ts`) without any wiring there.
 */
import client from 'prom-client';
import logger from '../config/logger';

/**
 * `wa_messages_total` — every inbound/outbound message keyed by direction +
 * type + status. Source of truth for throughput + send-success dashboards.
 */
export const waMessagesTotal = new client.Counter({
  name: 'wa_messages_total',
  help: 'WhatsApp messages by direction + type + status',
  labelNames: ['direction', 'type', 'status'] as const,
});

/**
 * `wa_send_failures_total` — Cloud-API send failures keyed by Meta error code.
 * Drives the send-failure-spike alert.
 */
export const waSendFailuresTotal = new client.Counter({
  name: 'wa_send_failures_total',
  help: 'WhatsApp outbound send failures by Meta error code',
  labelNames: ['error_code'] as const,
});

/**
 * `wa_webhook_events_total` — every accepted webhook POST keyed by signature
 * outcome + classified event type. Catches signature failures + traffic shape.
 */
export const waWebhookEventsTotal = new client.Counter({
  name: 'wa_webhook_events_total',
  help: 'WhatsApp webhook events by signature outcome + event type',
  labelNames: ['signature_ok', 'event_type'] as const,
});

/**
 * `wa_send_duration_seconds` — Cloud-API send latency keyed by result.
 * result = ok | error
 */
export const waSendDuration = new client.Histogram({
  name: 'wa_send_duration_seconds',
  help: 'WhatsApp Cloud API send latency in seconds',
  labelNames: ['result'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * `wa_webhook_last_event_timestamp` — unix seconds of the last VALID (signed)
 * webhook we accepted. Drives the webhook-silence alert.
 */
export const waWebhookLastEventTimestamp = new client.Gauge({
  name: 'wa_webhook_last_event_timestamp',
  help: 'Unix timestamp (seconds) of the last accepted WhatsApp webhook',
});

/**
 * `wa_channel_quality` — the channel's Meta quality rating as a number:
 * 0 unknown, 1 green, 2 yellow, 3 red. Drives the quality-red alert.
 */
export const waChannelQuality = new client.Gauge({
  name: 'wa_channel_quality',
  help: 'WhatsApp channel quality rating (0 unknown, 1 green, 2 yellow, 3 red)',
});

/**
 * `wa_messaging_tier_limit` — the channel's daily unique-recipient cap parsed
 * to a number (0 when unknown).
 */
export const waMessagingTierLimit = new client.Gauge({
  name: 'wa_messaging_tier_limit',
  help: 'WhatsApp messaging tier daily unique-recipient cap (0 if unknown)',
});

/**
 * Report a WhatsApp-area exception.
 *
 * This forwarded to Sentry; with the error-reporting stack removed it logs
 * instead. Kept as a single funnel (7 call sites) so wiring a reporter back in
 * is a one-file change.
 */
export async function captureWaException(
  err: unknown,
  extra?: Record<string, unknown>
): Promise<void> {
  logger.error(`[whatsapp] ${(err as Error)?.message ?? String(err)}`, extra);
}
