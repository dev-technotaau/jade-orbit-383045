import logger from '../config/logger';
import { webhookService } from './webhook.service';

/**
 * Outbound-webhook emitter for WhatsApp domain events.
 *
 * This fans WhatsApp events into the platform's EXISTING webhook delivery
 * pipeline so external CRMs / Zapier / no-code tools can subscribe. It does NOT
 * implement its own delivery — it reuses `webhookService.dispatch(event, payload)`
 * (services/webhook.service.ts), which:
 *   - looks up active `WebhookEndpoint`s whose `events` array `has` the event name,
 *   - enqueues each onto the BullMQ `webhook-delivery` queue (jobs/webhook.queue.ts),
 *   - signs + delivers (HMAC) via the worker (jobs/webhook.worker.ts) with retries.
 *
 * The webhook subscription convention is free-form string event names stored on
 * `WebhookEndpoint.events` (String[]) — there is no DB enum — so the WA event
 * names below are passed straight through.
 *
 * Suggested WA event names the integration layer emits:
 *   - 'whatsapp.message.inbound'
 *   - 'whatsapp.contact.created'
 *   - 'whatsapp.contact.opted_out'
 *   - 'whatsapp.campaign.completed'
 */

/**
 * Emit a WhatsApp domain event to all subscribed external webhook endpoints.
 *
 * Best-effort: any failure is logged and swallowed — this function NEVER throws,
 * so callers in hot inbound/campaign paths can fire it without a try/catch.
 *
 * @param event   Webhook event name (e.g. 'whatsapp.message.inbound').
 * @param payload Arbitrary JSON-serializable payload delivered to subscribers.
 */
export async function emitWaEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  // External webhook subscribers (CRM/Zapier/no-code).
  //
  // The host platform also fanned a subset of these onto a Kafka backbone for
  // BigQuery analytics, an admin event viewer and replay/DLQ. That backbone was
  // infrastructure for a multi-domain product; a standalone module deployed to
  // Vercel/Render has no use for it, so Kafka was removed entirely and webhooks
  // are now the single fan-out path.
  try {
    await webhookService.dispatch(event, {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });
  } catch (error) {
    // Never let webhook fan-out break the WhatsApp flow that triggered it.
    logger.error(`Failed to emit WhatsApp webhook event "${event}"`, error);
  }
}
