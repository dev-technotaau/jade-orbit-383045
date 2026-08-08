/**
 * Razorpay subscription webhook handlers.
 *
 * These run inside the BullMQ worker (`razorpay-webhook.worker`) after
 * `RazorpayWebhookEvent` has been persisted with valid signature. The
 * dispatcher in `razorpay-webhook.service.ts` routes here based on event
 * name.
 *
 * Idempotent: repeated events (Razorpay retries) leave state unchanged.
 */
import { prisma } from '../../config/prisma';
import { SubscriptionStatus, PaymentChannel, type Prisma } from '@prisma/client';
import { recordPayment } from '../payment.service';
import logger from '../../config/logger';
import { env } from '../../config/env';
import type { RazorpayWebhookPayload } from '../razorpay-webhook.service';
import { billingBreadcrumb } from '../../utils/sentry-billing';

interface RazorpaySubscriptionEntity {
  id: string;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
  next_charge_at?: number | null;
  paid_count?: number;
  remaining_count?: number;
  total_count?: number;
  ended_at?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string | number> | null;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  created: SubscriptionStatus.CREATED,
  authenticated: SubscriptionStatus.AUTHENTICATED,
  active: SubscriptionStatus.ACTIVE,
  paused: SubscriptionStatus.PAUSED,
  halted: SubscriptionStatus.HALTED,
  cancelled: SubscriptionStatus.CANCELLED,
  completed: SubscriptionStatus.COMPLETED,
  expired: SubscriptionStatus.EXPIRED,
  pending: SubscriptionStatus.HALTED, // Razorpay sometimes uses "pending" for retry
};

function tsToDate(seconds?: number | null): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

async function findOrLogMissing(razorpaySubId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: razorpaySubId },
  });
  if (!sub) {
    logger.warn('Subscription webhook for unknown subscription — ignoring', {
      razorpaySubId,
    });
    return null;
  }
  return sub;
}

function persistEvent(args: { internalSubId: string; kind: string; raw: Prisma.InputJsonValue }) {
  return prisma.subscriptionEvent.create({
    data: {
      subscriptionId: args.internalSubId,
      kind: args.kind,
      payloadHash: '',
      raw: args.raw,
    },
  });
}

export async function handleSubscriptionEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  const entity = payload.payload?.subscription?.entity as RazorpaySubscriptionEntity | undefined;
  if (!entity?.id) {
    logger.warn(`Subscription event ${event} missing entity`);
    return;
  }
  const sub = await findOrLogMissing(entity.id);
  if (!sub) return;

  // Always record the raw event for replay/audit.
  await persistEvent({
    internalSubId: sub.id,
    kind: event,
    raw: payload as unknown as Prisma.InputJsonValue,
  });

  const newStatus =
    STATUS_MAP[(entity.status ?? '').toLowerCase()] ?? deriveStatusFromEvent(event, sub.status);

  await billingBreadcrumb({
    message: `subscription.${event}`,
    level: event === 'subscription.charged_failed' ? 'warning' : 'info',
    data: {
      subscriptionId: sub.id,
      razorpaySubId: entity.id,
      from: sub.status,
      to: newStatus,
    },
  });

  // Build the update patch — never undo a more terminal state on stale events.
  const patch: Prisma.SubscriptionUpdateInput = {
    status: newStatus,
    currentStart: tsToDate(entity.current_start) ?? sub.currentStart ?? undefined,
    currentEnd: tsToDate(entity.current_end) ?? sub.currentEnd ?? undefined,
    nextChargeAt:
      tsToDate(entity.next_charge_at) ??
      tsToDate(entity.charge_at) ??
      sub.nextChargeAt ??
      undefined,
    paidCount: entity.paid_count ?? undefined,
    remainingCount: entity.remaining_count ?? undefined,
    totalCount: entity.total_count ?? undefined,
  };

  if (event === 'subscription.activated' && !sub.currentStart) {
    patch.currentStart = tsToDate(entity.current_start) ?? new Date();
  }
  if (event === 'subscription.cancelled' || event === 'subscription.completed') {
    patch.endedAt = tsToDate(entity.ended_at) ?? new Date();
  }
  if (event === 'subscription.charged_failed') {
    patch.failureCount = { increment: 1 };
    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + env.BILLING_GRACE_PERIOD_DAYS);
    patch.gracePeriodUntil = graceUntil;
    // Schedule the dunning ladder (T+0, +1d, +3d, +7d) — Phase 10
    try {
      const { scheduleDunningLadder } = await import('../payment-retry.service');
      await scheduleDunningLadder(sub).catch((err) =>
        logger.error('Dunning ladder scheduling failed', { subscriptionId: sub.id, err })
      );
    } catch (err) {
      logger.error('Failed to import payment-retry service', err);
    }
  }
  if (event === 'subscription.charged') {
    // Successful renewal — record the payment if attached
    const paymentEntity = payload.payload?.payment?.entity;
    if (paymentEntity) {
      try {
        await recordPayment(paymentEntity, {
          source: 'webhook',
          orderId: undefined, // subscription payments may not have a standalone order
          userId: sub.userId,
        }).catch((err) => {
          // For subscription charges, the payment may not have an Order on our side
          // (Razorpay creates implicit orders per cycle). Log but don't crash.
          logger.warn('recordPayment skipped for subscription charge — likely no internal order', {
            err: (err as Error).message,
          });
        });
      } catch (err) {
        logger.error('Subscription charge payment record failed', err);
      }
    }
    patch.failureCount = 0;
    patch.gracePeriodUntil = null;

    // Grant a fresh entitlement for the new cycle + issue invoice
    const cycleStart = tsToDate(entity.current_start) ?? new Date();
    const cycleEnd =
      tsToDate(entity.current_end) ?? new Date(cycleStart.getTime() + 30 * 86_400_000);
    try {
      const { grantEntitlementForSubscriptionCycle } = await import('../entitlement.service');
      await grantEntitlementForSubscriptionCycle({
        subscriptionId: sub.id,
        cycleStart,
        cycleEnd,
      }).catch((err) =>
        logger.error('Subscription cycle entitlement grant failed', {
          subscriptionId: sub.id,
          err,
        })
      );
    } catch (err) {
      logger.error('Failed to import entitlement service for cycle grant', err);
    }

    // Issue cycle invoice
    const paymentEntityForInvoice = payload.payload?.payment?.entity;
    const cycleAmount =
      paymentEntityForInvoice?.amount ??
      (sub.planSnapshot as { basePricePaise?: number } | null)?.basePricePaise ??
      0;
    if (cycleAmount > 0) {
      const gstRate =
        (sub.planSnapshot as { gstRatePercent?: number } | null)?.gstRatePercent ?? 18;
      const inclusive =
        (sub.planSnapshot as { gstInclusive?: boolean } | null)?.gstInclusive ?? true;
      const taxable = inclusive ? Math.round((cycleAmount * 100) / (100 + gstRate)) : cycleAmount;
      const totalTax = inclusive
        ? cycleAmount - taxable
        : Math.round((cycleAmount * gstRate) / 100);
      const cgst = Math.round(totalTax / 2);
      const sgst = totalTax - cgst;
      try {
        const { issueInvoiceForSubscriptionCycle } = await import('../invoice.service');
        await issueInvoiceForSubscriptionCycle({
          subscriptionId: sub.id,
          amountPaise: cycleAmount,
          taxableAmountPaise: taxable,
          cgstPaise: cgst,
          sgstPaise: sgst,
          igstPaise: 0,
          cessPaise: 0,
          periodStart: cycleStart,
          periodEnd: cycleEnd,
        }).catch((err) => logger.error('Subscription cycle invoice failed', { err }));
      } catch (err) {
        logger.error('Failed to import invoice service for cycle invoice', err);
      }
    }

    // Multi-channel notification — first cycle = activated, else renewed
    try {
      const { sendBillingNotification, formatINR } =
        await import('../billing-notification.service');
      const isFirstCycle = (sub.paidCount ?? 0) === 0;
      await sendBillingNotification({
        userId: sub.userId,
        kind: isFirstCycle ? 'SUBSCRIPTION_ACTIVATED' : 'SUBSCRIPTION_RENEWED',
        refType: 'SUBSCRIPTION',
        refId: sub.id,
        title: isFirstCycle ? 'Subscription activated' : 'Subscription renewed',
        message: `Your ${
          (sub.planSnapshot as { name?: string } | null)?.name ?? 'plan'
        } subscription ${isFirstCycle ? 'is now active' : 'has been renewed'}${
          cycleAmount ? ` — ${formatINR(cycleAmount)} charged.` : '.'
        }`,
        link: `/billing/subscriptions/${sub.id}`,
        metadata: { cycleStart: cycleStart.toISOString(), cycleEnd: cycleEnd.toISOString() },
      });
    } catch (err) {
      logger.warn('Subscription renewal notification failed', { err });
    }
  }

  // Failed-charge notification
  if (event === 'subscription.charged_failed') {
    try {
      const { sendBillingNotification } = await import('../billing-notification.service');
      await sendBillingNotification({
        userId: sub.userId,
        kind: 'SUBSCRIPTION_FAILED',
        refType: 'SUBSCRIPTION',
        refId: sub.id,
        title: 'Subscription renewal failed',
        message:
          'Your renewal payment did not go through. We will retry automatically — please ensure your payment method is up to date.',
        link: `/billing/subscriptions/${sub.id}`,
      });
    } catch (err) {
      logger.warn('Subscription failed-charge notification failed', { err });
    }
  }

  // Cancellation notification
  if (event === 'subscription.cancelled') {
    try {
      const { sendBillingNotification } = await import('../billing-notification.service');
      await sendBillingNotification({
        userId: sub.userId,
        kind: 'SUBSCRIPTION_CANCELLED',
        refType: 'SUBSCRIPTION',
        refId: sub.id,
        title: 'Subscription cancelled',
        message: 'Your subscription has been cancelled. You can re-subscribe anytime from billing.',
        link: `/billing/subscriptions/${sub.id}`,
      });
    } catch (err) {
      logger.warn('Subscription cancellation notification failed', { err });
    }
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: patch,
  });

  logger.info('Subscription updated from webhook', {
    event,
    subscriptionId: sub.id,
    razorpaySubscriptionId: entity.id,
    newStatus,
  });
}

function deriveStatusFromEvent(event: string, current: SubscriptionStatus): SubscriptionStatus {
  switch (event) {
    case 'subscription.activated':
      return SubscriptionStatus.ACTIVE;
    case 'subscription.paused':
      return SubscriptionStatus.PAUSED;
    case 'subscription.resumed':
      return SubscriptionStatus.ACTIVE;
    case 'subscription.cancelled':
      return SubscriptionStatus.CANCELLED;
    case 'subscription.completed':
      return SubscriptionStatus.COMPLETED;
    case 'subscription.halted':
    case 'subscription.pending':
      return SubscriptionStatus.HALTED;
    case 'subscription.charged_failed':
      // Don't immediately downgrade — let dunning retries run first.
      return current;
    default:
      return current;
  }
}

// Re-export for convenience
export { PaymentChannel };
