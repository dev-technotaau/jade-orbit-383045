export enum KafkaTopics {
  // Original events
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  JOB_POSTED = 'job.posted',
  JOB_UPDATED = 'job.updated',
  JOB_CLOSED = 'job.closed',
  APPLICATION_SUBMITTED = 'application.submitted',
  APPLICATION_STATUS_CHANGED = 'application.status_changed',
  PROFILE_UPDATED = 'profile.updated',
  NOTIFICATION_SENT = 'notification.sent',

  // Company events
  COMPANY_VERIFIED = 'company.verified',
  COMPANY_PROFILE_UPDATED = 'company.profile_updated',

  // Search events
  SEARCH_PERFORMED = 'search.performed',

  // Verification events
  VERIFICATION_SUBMITTED = 'verification.submitted',
  VERIFICATION_APPROVED = 'verification.approved',
  VERIFICATION_REJECTED = 'verification.rejected',

  // Admin events
  ADMIN_USER_SUSPENDED = 'admin.user_suspended',
  ADMIN_JOB_REJECTED = 'admin.job_rejected',
  ADMIN_ROLE_CHANGED = 'admin.role_changed',

  // Session events
  SESSION_CREATED = 'session.created',
  SESSION_REVOKED = 'session.revoked',

  // File events
  RESUME_UPLOADED = 'resume.uploaded',
  AVATAR_CHANGED = 'avatar.changed',

  // Billing events (Phase 1+ — emitted by billing services)
  BILLING_ORDER_CREATED = 'billing.order.created',
  BILLING_ORDER_PAID = 'billing.order.paid',
  BILLING_ORDER_REFUNDED = 'billing.order.refunded',
  BILLING_PAYMENT_CAPTURED = 'billing.payment.captured',
  BILLING_PAYMENT_FAILED = 'billing.payment.failed',
  BILLING_SUBSCRIPTION_ACTIVATED = 'billing.subscription.activated',
  BILLING_SUBSCRIPTION_CHARGED = 'billing.subscription.charged',
  BILLING_SUBSCRIPTION_CANCELLED = 'billing.subscription.cancelled',
  BILLING_SUBSCRIPTION_FAILED = 'billing.subscription.charged_failed',
  BILLING_INVOICE_ISSUED = 'billing.invoice.issued',
  BILLING_ENTITLEMENT_GRANTED = 'billing.entitlement.granted',
  BILLING_ENTITLEMENT_CONSUMED = 'billing.entitlement.consumed',
  BILLING_ENTITLEMENT_EXPIRED = 'billing.entitlement.expired',
  BILLING_REFUND_PROCESSED = 'billing.refund.processed',
  BILLING_FRAUD_FLAGGED = 'billing.fraud.flagged',
  BILLING_COUPON_REDEEMED = 'billing.coupon.redeemed',
  BILLING_QUOTE_RECEIVED = 'billing.quote.received',
  BILLING_CUSTOM_OFFER_SENT = 'billing.custom_offer.sent',

  // WhatsApp events (emitted by the WhatsApp subsystem via emitWaEvent)
  WHATSAPP_MESSAGE_INBOUND = 'whatsapp.message.inbound',
  WHATSAPP_CONTACT_CREATED = 'whatsapp.contact.created',
  WHATSAPP_CONTACT_OPTED_OUT = 'whatsapp.contact.opted_out',
  WHATSAPP_CAMPAIGN_COMPLETED = 'whatsapp.campaign.completed',
}

export const ConsolidatedTopics = {
  USERS: 'ha.users',
  JOBS: 'ha.jobs',
  APPLICATIONS: 'ha.applications',
  NOTIFICATIONS: 'ha.notifications',
  BILLING: 'ha.billing',
  WHATSAPP: 'ha.whatsapp',
} as const;
