import logger from '../config/logger';
import { webhookService } from './webhook.service';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';

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
/** Maps a WA event name → its Kafka event type. The subset here flows onto the
 *  platform's Kafka backbone (BigQuery analytics, admin event viewer, replay, DLQ)
 *  alongside every other domain; events not in the map are webhook-only. */
const WA_EVENT_TO_KAFKA: Record<string, KafkaTopics> = {
  'whatsapp.message.inbound': KafkaTopics.WHATSAPP_MESSAGE_INBOUND,
  'whatsapp.contact.created': KafkaTopics.WHATSAPP_CONTACT_CREATED,
  'whatsapp.contact.opted_out': KafkaTopics.WHATSAPP_CONTACT_OPTED_OUT,
  'whatsapp.campaign.completed': KafkaTopics.WHATSAPP_CAMPAIGN_COMPLETED,
};

export async function emitWaEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  // 1) External webhook subscribers (CRM/Zapier/no-code). Done directly here so
  //    it stays resilient even when Kafka is disabled/unavailable.
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

  // 2) Platform Kafka event backbone — analytics (BigQuery), the admin event
  //    viewer, replay + DLQ, like every other domain. Fire-and-forget;
  //    publishEvent() is a no-op when the Kafka producer isn't available.
  const kafkaType = WA_EVENT_TO_KAFKA[event];
  if (kafkaType) {
    const key = String(payload.contactId ?? payload.campaignId ?? payload.conversationId ?? 'wa');
    void publishEvent(kafkaType, key, payload).catch(() => {});
  }
}
