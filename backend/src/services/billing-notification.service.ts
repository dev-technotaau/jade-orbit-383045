/**
 * Multi-channel billing notification dispatcher with dedup.
 *
 * Wraps `notification.service.send()` with the `BillingNotification` table
 * which guarantees one send per `(userId, kind, refType, refId, channel)`
 * tuple. Plan §8.2:
 *   "BillingNotification (userId, kind, refType, refId) unique → second
 *    send swallowed."
 *
 * Used by every billing service — order/payment/subscription/refund/
 * invoice/expiry/upgrade — so notifications survive webhook retries
 * without spamming users.
 *
 * Also emits a corresponding Kafka event on the `ha.billing` consolidated
 * topic so analytics + BigQuery sync see every state transition.
 */
import { prisma } from '../config/prisma';
import { BillingNotificationKind, type Prisma } from '@prisma/client';
import logger from '../config/logger';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';
import { env } from '../config/env';
import * as billingEmail from '../templates/email/billing';
import * as billingWa from '../templates/whatsapp';

// =====================================================================
// Channel mapping
// =====================================================================

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'FCM' | 'WEBPUSH' | 'INAPP';

interface ChannelMap {
  email: 'EMAIL';
  whatsapp: 'WHATSAPP';
  fcm: 'FCM';
  web_push: 'WEBPUSH';
  in_app: 'INAPP';
}

const CHANNEL_NAME: ChannelMap = {
  email: 'EMAIL',
  whatsapp: 'WHATSAPP',
  fcm: 'FCM',
  web_push: 'WEBPUSH',
  in_app: 'INAPP',
};

type NotificationChannel = keyof ChannelMap;

// =====================================================================
// Per-kind defaults
// =====================================================================

interface KindConfig {
  channels: NotificationChannel[];
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

const KIND_CONFIG: Record<BillingNotificationKind, KindConfig> = {
  ORDER_PLACED: { channels: ['in_app', 'email', 'whatsapp'], type: 'INFO' },
  PAYMENT_CAPTURED: {
    channels: ['in_app', 'email', 'whatsapp', 'fcm', 'web_push'],
    type: 'SUCCESS',
  },
  PAYMENT_FAILED: {
    channels: ['in_app', 'email', 'whatsapp', 'fcm', 'web_push'],
    type: 'ERROR',
  },
  SUBSCRIPTION_ACTIVATED: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'SUCCESS' },
  SUBSCRIPTION_RENEWED: { channels: ['in_app', 'email', 'whatsapp'], type: 'SUCCESS' },
  SUBSCRIPTION_FAILED: {
    channels: ['in_app', 'email', 'whatsapp', 'fcm', 'web_push'],
    type: 'ERROR',
  },
  SUBSCRIPTION_CANCELLED: { channels: ['in_app', 'email', 'whatsapp'], type: 'INFO' },
  REMINDER_7: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'INFO' },
  REMINDER_3: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'INFO' },
  REMINDER_1: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'WARNING' },
  PLAN_EXPIRED: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'WARNING' },
  // Customer raised a refund request — an acknowledgement, not money moving,
  // so it stays in-app + email (no SMS/WhatsApp spend on a "we got it").
  REFUND_REQUESTED: { channels: ['in_app', 'email'], type: 'INFO' },
  REFUND_REJECTED: { channels: ['in_app', 'email'], type: 'WARNING' },
  REFUND_PROCESSED: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'SUCCESS' },
  CUSTOM_PLAN_OFFER: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'INFO' },
  FRAUD_ALERT: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'ERROR' },
  QUOTE_RECEIVED: { channels: ['in_app', 'email', 'whatsapp', 'fcm'], type: 'INFO' },
  UPGRADED: { channels: ['in_app', 'email', 'whatsapp'], type: 'SUCCESS' },
  DOWNGRADED: { channels: ['in_app', 'email', 'whatsapp'], type: 'INFO' },
};

// =====================================================================
// Send
// =====================================================================

export interface SendBillingNotificationArgs {
  userId: string;
  kind: BillingNotificationKind;
  /** ORDER | SUBSCRIPTION | INVOICE | REFUND | ENTITLEMENT | QUOTE | OFFER */
  refType: string;
  refId: string;
  title: string;
  message: string;
  link?: string;
  /** Override channel set from KIND_CONFIG. */
  channels?: NotificationChannel[];
  /** Skip dedup check (super-admin force-resend). */
  force?: boolean;
  /** Extra structured data for the in-app/email payload. */
  metadata?: Record<string, unknown>;
}

export async function sendBillingNotification(
  args: SendBillingNotificationArgs
): Promise<{ sent: boolean; deduplicated: boolean }> {
  const config = KIND_CONFIG[args.kind];
  const channels = args.channels ?? config.channels;

  // Dedup: short-circuit if all desired channels have already been sent.
  if (!args.force) {
    const existingChannelNames = channels.map((c) => CHANNEL_NAME[c]);
    const existing = await prisma.billingNotification.findMany({
      where: {
        userId: args.userId,
        kind: args.kind,
        refType: args.refType,
        refId: args.refId,
        channel: { in: existingChannelNames as Channel[] },
      },
      select: { channel: true },
    });
    if (existing.length >= channels.length) {
      return { sent: false, deduplicated: true };
    }
  }

  // Persist dedup rows up-front (best effort — unique violation = race; OK)
  const insertRows = channels.map((c) => ({
    userId: args.userId,
    kind: args.kind,
    refType: args.refType,
    refId: args.refId,
    channel: CHANNEL_NAME[c] as Channel,
    metadata: (args.metadata ?? null) as Prisma.InputJsonValue,
  }));
  for (const row of insertRows) {
    await prisma.billingNotification.create({ data: row }).catch(() => {
      /* unique violation is fine — already sent */
    });
  }

  // Render channel-specific templates from billing template files
  const rendered = await renderBillingTemplates({
    userId: args.userId,
    kind: args.kind,
    title: args.title,
    message: args.message,
    link: args.link,
    metadata: args.metadata ?? {},
  });

  // Dispatch via shared notification service
  const { notificationService } = await import('./notification.service');
  await notificationService
    .send({
      userId: args.userId,
      title: args.title,
      message: args.message,
      type: config.type,
      category: 'billing',
      link: args.link,
      metadata: args.metadata,
      channels,
      emailOptions: rendered.emailOptions,
      whatsappOptions: rendered.whatsappOptions,
    })
    .catch((err) => logger.error('billing notification send failed', { kind: args.kind, err }));

  // Kafka emission for analytics consumers
  const topic = mapKindToTopic(args.kind);
  void publishEvent(topic, args.userId, {
    userId: args.userId,
    kind: args.kind,
    refType: args.refType,
    refId: args.refId,
    metadata: args.metadata ?? null,
  }).catch(() => {});

  // BigQuery streaming — async via dedicated queue (retry + dead-letter)
  void (async () => {
    const { enqueueBillingBigQueryEvent } = await import('../jobs/bigquery-billing-sync.queue');
    const meta = (args.metadata ?? {}) as Record<string, unknown>;
    await enqueueBillingBigQueryEvent({
      eventType: topic,
      userId: args.userId,
      refType: args.refType,
      refId: args.refId,
      amountPaise: typeof meta.totalPaise === 'number' ? meta.totalPaise : undefined,
      currency: typeof meta.currency === 'string' ? meta.currency : undefined,
      planCode: typeof meta.planCode === 'string' ? meta.planCode : undefined,
      payload: meta,
    });
  })();

  return { sent: true, deduplicated: false };
}

function mapKindToTopic(kind: BillingNotificationKind): KafkaTopics {
  switch (kind) {
    case BillingNotificationKind.PAYMENT_CAPTURED:
      return KafkaTopics.BILLING_PAYMENT_CAPTURED;
    case BillingNotificationKind.PAYMENT_FAILED:
      return KafkaTopics.BILLING_PAYMENT_FAILED;
    case BillingNotificationKind.SUBSCRIPTION_ACTIVATED:
      return KafkaTopics.BILLING_SUBSCRIPTION_ACTIVATED;
    case BillingNotificationKind.SUBSCRIPTION_RENEWED:
      return KafkaTopics.BILLING_SUBSCRIPTION_CHARGED;
    case BillingNotificationKind.SUBSCRIPTION_FAILED:
      return KafkaTopics.BILLING_SUBSCRIPTION_FAILED;
    case BillingNotificationKind.SUBSCRIPTION_CANCELLED:
      return KafkaTopics.BILLING_SUBSCRIPTION_CANCELLED;
    case BillingNotificationKind.REFUND_PROCESSED:
      return KafkaTopics.BILLING_REFUND_PROCESSED;
    case BillingNotificationKind.QUOTE_RECEIVED:
      return KafkaTopics.BILLING_QUOTE_RECEIVED;
    case BillingNotificationKind.CUSTOM_PLAN_OFFER:
      return KafkaTopics.BILLING_CUSTOM_OFFER_SENT;
    case BillingNotificationKind.FRAUD_ALERT:
      return KafkaTopics.BILLING_FRAUD_FLAGGED;
    default:
      return KafkaTopics.BILLING_ORDER_CREATED; // generic fall-through
  }
}

// =====================================================================
// Helper: format paise as ₹ for notification copy
// =====================================================================

export function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

// =====================================================================
// Template rendering — pick channel-specific bodies per kind
// =====================================================================

interface RenderedTemplates {
  emailOptions?: { to: string; subject: string; html: string; text?: string };
  whatsappOptions?: {
    to: string;
    templateName: string;
    languageCode?: string;
    components?: unknown[];
  };
}

interface RenderArgs {
  userId: string;
  kind: BillingNotificationKind;
  title: string;
  message: string;
  link?: string;
  metadata: Record<string, unknown>;
}

const APP_URL = env.FRONTEND_URL ?? 'https://hireadda.in';

async function renderBillingTemplates(args: RenderArgs): Promise<RenderedTemplates> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      mobileNumber: true,
      whatsappNumber: true,
      isWhatsappVerified: true,
      isEmailVerified: true,
    },
  });
  if (!user) return {};
  const name = user.firstName ?? 'there';
  const meta = args.metadata;

  const planName = String(meta.planName ?? 'your plan');
  const amountPaise =
    typeof meta.totalPaise === 'number'
      ? meta.totalPaise
      : typeof meta.amountPaise === 'number'
        ? meta.amountPaise
        : 0;
  const link = args.link ?? `${APP_URL}/billing`;
  const validUntilStr =
    typeof meta.validUntil === 'string' ? meta.validUntil : new Date().toISOString();

  const emailDest = user.isEmailVerified ? user.email : null;
  const waDest = user.isWhatsappVerified && user.whatsappNumber ? user.whatsappNumber : null;

  const out: RenderedTemplates = {};

  switch (args.kind) {
    case BillingNotificationKind.ORDER_PLACED: {
      const orderId = String(meta.orderId ?? meta.refId ?? '');
      const validityDays = typeof meta.validityDays === 'number' ? meta.validityDays : 30;
      const e = billingEmail.orderConfirmationEmail({
        name,
        planName,
        orderId,
        amountPaise,
        validityDays,
        payUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.orderPlacedWhatsapp(planName, amountPaise, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.PAYMENT_CAPTURED: {
      const e = billingEmail.paymentCapturedEmail({
        name,
        planName,
        amountPaise,
        paymentId: String(meta.paymentId ?? ''),
        invoiceUrl: typeof meta.invoiceUrl === 'string' ? meta.invoiceUrl : undefined,
        validUntil: validUntilStr,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.paymentSuccessWhatsapp(planName, amountPaise, validUntilStr);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.PAYMENT_FAILED: {
      const reason = typeof meta.reason === 'string' ? meta.reason : undefined;
      const e = billingEmail.paymentFailedEmail({
        name,
        planName,
        amountPaise,
        reason,
        retryUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.paymentFailedWhatsapp(planName, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.SUBSCRIPTION_ACTIVATED: {
      const cycle = typeof meta.cycle === 'string' ? meta.cycle : 'cycle';
      const e = billingEmail.subscriptionActivatedEmail({
        name,
        planName,
        amountPaise,
        cycle,
        nextChargeAt: typeof meta.nextChargeAt === 'string' ? meta.nextChargeAt : null,
        manageUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.subscriptionActivatedWhatsapp(planName, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.SUBSCRIPTION_RENEWED: {
      const e = billingEmail.subscriptionRenewedEmail({
        name,
        planName,
        amountPaise,
        invoiceUrl: typeof meta.invoiceUrl === 'string' ? meta.invoiceUrl : undefined,
        nextChargeAt: typeof meta.nextChargeAt === 'string' ? meta.nextChargeAt : null,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.subscriptionRenewedWhatsapp(
          planName,
          amountPaise,
          typeof meta.nextChargeAt === 'string' ? meta.nextChargeAt : ''
        );
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.SUBSCRIPTION_FAILED: {
      const e = billingEmail.subscriptionGraceEmail({
        name,
        planName,
        amountPaise,
        retryAt: typeof meta.retryAt === 'string' ? meta.retryAt : new Date().toISOString(),
        graceUntil:
          typeof meta.graceUntil === 'string' ? meta.graceUntil : new Date().toISOString(),
        updateMethodUrl:
          typeof meta.updateMethodUrl === 'string'
            ? meta.updateMethodUrl
            : `${APP_URL}/billing/payment-methods`,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.subscriptionFailedWhatsapp(
          planName,
          typeof meta.graceUntil === 'string' ? meta.graceUntil : '',
          `${APP_URL}/billing/payment-methods`
        );
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.SUBSCRIPTION_CANCELLED: {
      const e = billingEmail.subscriptionCancelledEmail({
        name,
        planName,
        validUntil: validUntilStr,
        reactivateUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.subscriptionCancelledWhatsapp(planName, validUntilStr);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.REMINDER_7:
    case BillingNotificationKind.REMINDER_3:
    case BillingNotificationKind.REMINDER_1: {
      const days =
        args.kind === BillingNotificationKind.REMINDER_7
          ? 7
          : args.kind === BillingNotificationKind.REMINDER_3
            ? 3
            : 1;
      const e =
        days === 7
          ? billingEmail.expiry7DayEmail({
              name,
              planName,
              expiresAt: validUntilStr,
              renewUrl: link,
            })
          : days === 3
            ? billingEmail.expiry3DayEmail({
                name,
                planName,
                expiresAt: validUntilStr,
                renewUrl: link,
              })
            : billingEmail.expiry1DayEmail({
                name,
                planName,
                expiresAt: validUntilStr,
                renewUrl: link,
              });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.renewalReminderWhatsapp(planName, days, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.PLAN_EXPIRED: {
      const e = billingEmail.planExpiredEmail({ name, planName, renewUrl: link });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.planExpiredWhatsapp(planName, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.REFUND_PROCESSED: {
      const e = billingEmail.refundProcessedEmail({
        name,
        amountPaise,
        refundId: String(meta.refundId ?? ''),
        paymentId: String(meta.paymentId ?? ''),
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.refundProcessedWhatsapp(amountPaise, String(meta.refundId ?? ''));
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.CUSTOM_PLAN_OFFER: {
      const e = billingEmail.customPlanOfferEmail({
        name,
        companyName: String(meta.companyName ?? ''),
        totalPaise: amountPaise,
        validityDays: typeof meta.validityDays === 'number' ? meta.validityDays : 30,
        cvUnlocks: typeof meta.cvUnlocks === 'number' ? meta.cvUnlocks : 0,
        seats: typeof meta.seats === 'number' ? meta.seats : 1,
        offerExpiresAt:
          typeof meta.offerExpiresAt === 'string' ? meta.offerExpiresAt : new Date().toISOString(),
        acceptUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.customQuoteReadyWhatsapp(
          String(meta.companyName ?? ''),
          amountPaise,
          link
        );
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.FRAUD_ALERT: {
      const signal = String(meta.signal ?? 'UNKNOWN');
      const severity = String(meta.severity ?? 'MED');
      const e = billingEmail.fraudAlertEmail({
        signal,
        severity,
        userId: typeof meta.targetUserId === 'string' ? meta.targetUserId : null,
        orderId: typeof meta.orderId === 'string' ? meta.orderId : null,
        paymentId: typeof meta.paymentId === 'string' ? meta.paymentId : null,
        reviewUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.fraudAlertWhatsapp(signal, severity, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.QUOTE_RECEIVED: {
      const e = billingEmail.quoteReceivedEmail({
        companyName: String(meta.companyName ?? ''),
        contactPerson: String(meta.contactPerson ?? ''),
        email: String(meta.contactEmail ?? ''),
        phone: String(meta.contactPhone ?? ''),
        hiringNeed: String(meta.hiringNeed ?? ''),
        cvCount: typeof meta.cvCount === 'number' ? meta.cvCount : 0,
        reviewUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.quoteReceivedWhatsapp(
          String(meta.companyName ?? ''),
          String(meta.contactPerson ?? ''),
          link
        );
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.UPGRADED: {
      const fromPlanName = String(meta.fromPlanName ?? 'previous plan');
      const prorationCreditPaise =
        typeof meta.prorationCreditPaise === 'number' ? meta.prorationCreditPaise : 0;
      const e = billingEmail.planUpgradedEmail({
        name,
        fromPlanName,
        toPlanName: planName,
        amountPaise,
        prorationCreditPaise,
        validUntil: validUntilStr,
        manageUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.planUpgradedWhatsapp(fromPlanName, planName, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.DOWNGRADED: {
      const fromPlanName = String(meta.fromPlanName ?? 'previous plan');
      const e = billingEmail.planDowngradedEmail({
        name,
        fromPlanName,
        toPlanName: planName,
        validUntil: validUntilStr,
        manageUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      if (waDest) {
        const w = billingWa.planDowngradedWhatsapp(fromPlanName, planName, link);
        out.whatsappOptions = {
          to: waDest,
          templateName: w.templateName,
          languageCode: w.languageCode,
          components: w.components,
        };
      }
      break;
    }
    case BillingNotificationKind.REFUND_REQUESTED: {
      const e = billingEmail.refundRequestReceivedEmail({
        name,
        planName,
        amountPaise,
        receiptNumber: String(meta.receiptNumber ?? ''),
        orderUrl: link,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      break;
    }
    case BillingNotificationKind.REFUND_REJECTED: {
      const e = billingEmail.refundRequestRejectedEmail({
        name,
        planName,
        amountPaise,
        receiptNumber: String(meta.receiptNumber ?? ''),
        reviewNotes: typeof meta.reviewNotes === 'string' ? meta.reviewNotes : null,
        supportUrl: `${APP_URL}/contact`,
      });
      if (emailDest) {
        out.emailOptions = { to: emailDest, subject: e.subject, html: e.html, text: e.text };
      }
      break;
    }
    default:
      // Unknown kind — fallback to plain title/message
      break;
  }

  return out;
}
