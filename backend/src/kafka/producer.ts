import { producer } from '../config/kafka';
import logger from '../config/logger';
import { validateEvent } from './schemas';
import { KafkaTopics, ConsolidatedTopics } from './topics';
import { injectTraceContext } from '../utils/trace-propagation';

/**
 * Maps each event type to its consolidated Aiven topic.
 */
const EVENT_TO_TOPIC: Record<KafkaTopics, string> = {
  [KafkaTopics.USER_REGISTERED]: ConsolidatedTopics.USERS,
  [KafkaTopics.USER_LOGIN]: ConsolidatedTopics.USERS,
  [KafkaTopics.PROFILE_UPDATED]: ConsolidatedTopics.USERS,
  [KafkaTopics.COMPANY_VERIFIED]: ConsolidatedTopics.USERS,
  [KafkaTopics.COMPANY_PROFILE_UPDATED]: ConsolidatedTopics.USERS,
  [KafkaTopics.VERIFICATION_SUBMITTED]: ConsolidatedTopics.USERS,
  [KafkaTopics.VERIFICATION_APPROVED]: ConsolidatedTopics.USERS,
  [KafkaTopics.VERIFICATION_REJECTED]: ConsolidatedTopics.USERS,
  [KafkaTopics.ADMIN_USER_SUSPENDED]: ConsolidatedTopics.USERS,
  [KafkaTopics.ADMIN_ROLE_CHANGED]: ConsolidatedTopics.USERS,
  [KafkaTopics.SESSION_CREATED]: ConsolidatedTopics.USERS,
  [KafkaTopics.SESSION_REVOKED]: ConsolidatedTopics.USERS,
  [KafkaTopics.RESUME_UPLOADED]: ConsolidatedTopics.USERS,
  [KafkaTopics.AVATAR_CHANGED]: ConsolidatedTopics.USERS,
  [KafkaTopics.JOB_POSTED]: ConsolidatedTopics.JOBS,
  [KafkaTopics.JOB_UPDATED]: ConsolidatedTopics.JOBS,
  [KafkaTopics.JOB_CLOSED]: ConsolidatedTopics.JOBS,
  [KafkaTopics.SEARCH_PERFORMED]: ConsolidatedTopics.JOBS,
  [KafkaTopics.ADMIN_JOB_REJECTED]: ConsolidatedTopics.JOBS,
  [KafkaTopics.APPLICATION_SUBMITTED]: ConsolidatedTopics.APPLICATIONS,
  [KafkaTopics.APPLICATION_STATUS_CHANGED]: ConsolidatedTopics.APPLICATIONS,
  [KafkaTopics.NOTIFICATION_SENT]: ConsolidatedTopics.NOTIFICATIONS,
  // Billing events flow into one consolidated topic for downstream
  // analytics consumers (BigQuery sync, fraud-scan, ad-hoc dashboards).
  [KafkaTopics.BILLING_ORDER_CREATED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_ORDER_PAID]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_ORDER_REFUNDED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_PAYMENT_CAPTURED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_PAYMENT_FAILED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_SUBSCRIPTION_ACTIVATED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_SUBSCRIPTION_CHARGED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_SUBSCRIPTION_CANCELLED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_SUBSCRIPTION_FAILED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_INVOICE_ISSUED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_ENTITLEMENT_GRANTED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_ENTITLEMENT_CONSUMED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_ENTITLEMENT_EXPIRED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_REFUND_PROCESSED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_FRAUD_FLAGGED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_COUPON_REDEEMED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_QUOTE_RECEIVED]: ConsolidatedTopics.BILLING,
  [KafkaTopics.BILLING_CUSTOM_OFFER_SENT]: ConsolidatedTopics.BILLING,
  // WhatsApp events flow into one consolidated topic for downstream analytics
  // consumers (BigQuery sync, admin event viewer, replay/DLQ).
  [KafkaTopics.WHATSAPP_MESSAGE_INBOUND]: ConsolidatedTopics.WHATSAPP,
  [KafkaTopics.WHATSAPP_CONTACT_CREATED]: ConsolidatedTopics.WHATSAPP,
  [KafkaTopics.WHATSAPP_CONTACT_OPTED_OUT]: ConsolidatedTopics.WHATSAPP,
  [KafkaTopics.WHATSAPP_CAMPAIGN_COMPLETED]: ConsolidatedTopics.WHATSAPP,
};

/**
 * Publish an event to the appropriate consolidated Kafka topic.
 * The eventType is embedded in the message payload for consumer-side routing.
 */
export const publishEvent = async (
  eventType: KafkaTopics,
  key: string,
  data: any
): Promise<void> => {
  if (!producer) {
    logger.debug(`Kafka producer not available - skipping event: ${eventType}`);
    return;
  }

  const topic = EVENT_TO_TOPIC[eventType];
  const payload = {
    ...data,
    eventType,
    timestamp: new Date().toISOString(),
    source: 'hire-adda-api',
  };

  // Schema validation — warn on failure but still publish
  const validation = validateEvent(eventType, payload);
  if (!validation.valid) {
    logger.warn(
      `Kafka producer schema validation failed for ${eventType}: ${validation.errors.join(', ')}`
    );
  }

  const message = {
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload),
        headers: injectTraceContext(),
      },
    ],
  };

  try {
    await producer.send(message);
    logger.debug(`Kafka event published: ${eventType} → ${topic} [${key}]`);

    // Store event for replay capability (fire-and-forget)
    void import('../services/kafka-replay.service')
      .then(({ kafkaReplayService }) => kafkaReplayService.storeEvent(eventType, key, payload))
      .catch(() => {});
  } catch (error: any) {
    // If disconnected, reconnect once and retry
    if (error?.name === 'KafkaJSError' && error?.message?.includes('disconnected')) {
      try {
        await producer.connect();
        await producer.send(message);
        logger.debug(`Kafka event published (after reconnect): ${eventType} → ${topic} [${key}]`);
        return;
      } catch (retryError) {
        logger.error(`Failed to publish Kafka event ${eventType} after reconnect:`, retryError);
        return;
      }
    }
    // Non-disconnection errors — log and move on
    logger.error(`Failed to publish Kafka event ${eventType}:`, error);
  }
};
