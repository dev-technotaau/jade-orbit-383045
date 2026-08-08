import { z } from 'zod';
import { KafkaTopics } from './topics';
import logger from '../config/logger';

/**
 * Zod schemas for Kafka event validation.
 * Uses .passthrough() for loose validation — extra fields allowed,
 * only required fields are enforced.
 */

const baseEventSchema = z
  .object({
    eventType: z.string(),
    timestamp: z.string(),
    source: z.string().optional(),
  })
  .passthrough();

// ─── User Events ──────────────────────────────────────────────
const userRegisteredSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

const userLoginSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

const profileUpdatedSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

// ─── Job Events ───────────────────────────────────────────────
const jobPostedSchema = baseEventSchema
  .extend({
    jobId: z.string(),
  })
  .passthrough();

const jobUpdatedSchema = baseEventSchema
  .extend({
    jobId: z.string(),
  })
  .passthrough();

const jobClosedSchema = baseEventSchema
  .extend({
    jobId: z.string(),
  })
  .passthrough();

// ─── Application Events ──────────────────────────────────────
const applicationSubmittedSchema = baseEventSchema
  .extend({
    applicationId: z.string(),
  })
  .passthrough();

const applicationStatusChangedSchema = baseEventSchema
  .extend({
    applicationId: z.string(),
  })
  .passthrough();

// ─── Notification Events ─────────────────────────────────────
const notificationSentSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

// ─── New Event Schemas (Session 3) ───────────────────────────
const companyVerifiedSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

const companyProfileUpdatedSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

const searchPerformedSchema = baseEventSchema
  .extend({
    searchType: z.enum(['jobs', 'candidates']),
  })
  .passthrough();

const verificationSubmittedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    requestId: z.string(),
  })
  .passthrough();

const verificationReviewedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    requestId: z.string(),
    status: z.string(),
  })
  .passthrough();

const adminUserSuspendedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    suspendedBy: z.string(),
  })
  .passthrough();

const adminJobRejectedSchema = baseEventSchema
  .extend({
    jobId: z.string(),
  })
  .passthrough();

const adminRoleChangedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    newRole: z.string(),
  })
  .passthrough();

const sessionCreatedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    sessionId: z.string(),
  })
  .passthrough();

const sessionRevokedSchema = baseEventSchema
  .extend({
    userId: z.string(),
    sessionId: z.string(),
  })
  .passthrough();

const resumeUploadedSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

const avatarChangedSchema = baseEventSchema
  .extend({
    userId: z.string(),
  })
  .passthrough();

// ─── Billing Events ───────────────────────────────────────────
// Loose validation — all billing events carry { userId, refType, refId,
// amountPaise? } in addition to the base envelope. Fraud-scan, BigQuery
// sync and analytics consumers all read these as passthrough JSON.
const billingEventSchema = baseEventSchema
  .extend({
    userId: z.string().optional(),
    refType: z.string().optional(),
    refId: z.string().optional(),
    amountPaise: z.number().optional(),
    currency: z.string().optional(),
    planCode: z.string().optional(),
  })
  .passthrough();

// ─── WhatsApp Events ──────────────────────────────────────────
// Loose validation — WA events carry contact/campaign/message identifiers plus
// the base envelope; analytics + event-viewer consumers read them as passthrough.
const whatsappEventSchema = baseEventSchema.passthrough();

/**
 * Maps each event type to its Zod schema for validation.
 */
export const EventSchemaMap: Partial<Record<KafkaTopics, z.ZodSchema>> = {
  [KafkaTopics.USER_REGISTERED]: userRegisteredSchema,
  [KafkaTopics.USER_LOGIN]: userLoginSchema,
  [KafkaTopics.PROFILE_UPDATED]: profileUpdatedSchema,
  [KafkaTopics.JOB_POSTED]: jobPostedSchema,
  [KafkaTopics.JOB_UPDATED]: jobUpdatedSchema,
  [KafkaTopics.JOB_CLOSED]: jobClosedSchema,
  [KafkaTopics.APPLICATION_SUBMITTED]: applicationSubmittedSchema,
  [KafkaTopics.APPLICATION_STATUS_CHANGED]: applicationStatusChangedSchema,
  [KafkaTopics.NOTIFICATION_SENT]: notificationSentSchema,
  [KafkaTopics.COMPANY_VERIFIED]: companyVerifiedSchema,
  [KafkaTopics.COMPANY_PROFILE_UPDATED]: companyProfileUpdatedSchema,
  [KafkaTopics.SEARCH_PERFORMED]: searchPerformedSchema,
  [KafkaTopics.VERIFICATION_SUBMITTED]: verificationSubmittedSchema,
  [KafkaTopics.VERIFICATION_APPROVED]: verificationReviewedSchema,
  [KafkaTopics.VERIFICATION_REJECTED]: verificationReviewedSchema,
  [KafkaTopics.ADMIN_USER_SUSPENDED]: adminUserSuspendedSchema,
  [KafkaTopics.ADMIN_JOB_REJECTED]: adminJobRejectedSchema,
  [KafkaTopics.ADMIN_ROLE_CHANGED]: adminRoleChangedSchema,
  [KafkaTopics.SESSION_CREATED]: sessionCreatedSchema,
  [KafkaTopics.SESSION_REVOKED]: sessionRevokedSchema,
  [KafkaTopics.RESUME_UPLOADED]: resumeUploadedSchema,
  [KafkaTopics.AVATAR_CHANGED]: avatarChangedSchema,
  [KafkaTopics.BILLING_ORDER_CREATED]: billingEventSchema,
  [KafkaTopics.BILLING_ORDER_PAID]: billingEventSchema,
  [KafkaTopics.BILLING_ORDER_REFUNDED]: billingEventSchema,
  [KafkaTopics.BILLING_PAYMENT_CAPTURED]: billingEventSchema,
  [KafkaTopics.BILLING_PAYMENT_FAILED]: billingEventSchema,
  [KafkaTopics.BILLING_SUBSCRIPTION_ACTIVATED]: billingEventSchema,
  [KafkaTopics.BILLING_SUBSCRIPTION_CHARGED]: billingEventSchema,
  [KafkaTopics.BILLING_SUBSCRIPTION_CANCELLED]: billingEventSchema,
  [KafkaTopics.BILLING_SUBSCRIPTION_FAILED]: billingEventSchema,
  [KafkaTopics.BILLING_INVOICE_ISSUED]: billingEventSchema,
  [KafkaTopics.BILLING_ENTITLEMENT_GRANTED]: billingEventSchema,
  [KafkaTopics.BILLING_ENTITLEMENT_CONSUMED]: billingEventSchema,
  [KafkaTopics.BILLING_ENTITLEMENT_EXPIRED]: billingEventSchema,
  [KafkaTopics.BILLING_REFUND_PROCESSED]: billingEventSchema,
  [KafkaTopics.BILLING_FRAUD_FLAGGED]: billingEventSchema,
  [KafkaTopics.BILLING_COUPON_REDEEMED]: billingEventSchema,
  [KafkaTopics.BILLING_QUOTE_RECEIVED]: billingEventSchema,
  [KafkaTopics.BILLING_CUSTOM_OFFER_SENT]: billingEventSchema,
  [KafkaTopics.WHATSAPP_MESSAGE_INBOUND]: whatsappEventSchema,
  [KafkaTopics.WHATSAPP_CONTACT_CREATED]: whatsappEventSchema,
  [KafkaTopics.WHATSAPP_CONTACT_OPTED_OUT]: whatsappEventSchema,
  [KafkaTopics.WHATSAPP_CAMPAIGN_COMPLETED]: whatsappEventSchema,
};

/**
 * Validate a Kafka event payload against its schema.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateEvent(
  eventType: string,
  data: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const schema = EventSchemaMap[eventType as KafkaTopics];
  if (!schema) {
    // No schema defined for this event — allow by default
    return { valid: true };
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  logger.warn(`Kafka event validation failed for ${eventType}: ${errors.join(', ')}`);
  return { valid: false, errors };
}
