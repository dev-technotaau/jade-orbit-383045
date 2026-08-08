import type { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { SubscriptionStatus, MandateStatus, BillingNotificationKind } from '@prisma/client';
import logger from '../config/logger';
import { fetchSubscription } from '../config/razorpay';
import { sendBillingNotification } from '../services/billing-notification.service';

/**
 * Pre-renewal validator — see `subscription-renewal.queue.ts` for context.
 *
 * Selects ACTIVE subscriptions whose nextChargeAt is within `[-2h, +24h]`
 * (so we catch both freshly-overdue charges and tomorrow's renewals) and
 * for each:
 *   - Reconciles the latest Razorpay status
 *   - Marks the sub HALTED if the mandate is FAILED / CANCELLED
 *   - Sends a 1-day reminder notification (de-duped via BillingNotification)
 */
export async function handleSubscriptionRenewal(
  job: Job
): Promise<{ checked: number; reminded: number; halted: number; reconciled: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  logger.info(`Subscription renewal pre-check ${job.id} starting`, {
    windowStart,
    windowEnd,
  });

  const upcoming = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AUTHENTICATED] },
      autoRenew: true,
      nextChargeAt: { gte: windowStart, lte: windowEnd },
    },
    include: { mandate: true, plan: { select: { name: true, code: true } } },
  });

  let reminded = 0;
  let halted = 0;
  let reconciled = 0;

  for (const sub of upcoming) {
    // 1. Reconcile with Razorpay (catches missed webhooks)
    if (sub.razorpaySubscriptionId) {
      try {
        const live = (await fetchSubscription(sub.razorpaySubscriptionId)) as {
          status?: string;
          next_charge_at?: number | null;
          paid_count?: number;
          remaining_count?: number;
        } | null;
        if (live) {
          const liveStatus = (live.status ?? '').toLowerCase();
          if (liveStatus === 'halted' && sub.status !== SubscriptionStatus.HALTED) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { status: SubscriptionStatus.HALTED },
            });
            halted += 1;
          }
          if (live.next_charge_at && live.next_charge_at * 1000 !== sub.nextChargeAt?.getTime()) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { nextChargeAt: new Date(live.next_charge_at * 1000) },
            });
            reconciled += 1;
          }
        }
      } catch (err) {
        logger.warn('Subscription renewal reconcile failed (non-fatal)', {
          subscriptionId: sub.id,
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    // 2. Mandate health check
    if (
      sub.mandate &&
      (sub.mandate.status === MandateStatus.FAILED ||
        sub.mandate.status === MandateStatus.CANCELLED)
    ) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.HALTED },
      });
      halted += 1;
      logger.warn('Subscription halted — underlying mandate not active', {
        subscriptionId: sub.id,
        mandateStatus: sub.mandate.status,
      });
    }

    // 3. T-1 reminder
    const hoursToCharge = sub.nextChargeAt
      ? (sub.nextChargeAt.getTime() - now.getTime()) / (60 * 60 * 1000)
      : null;
    if (hoursToCharge !== null && hoursToCharge > 12 && hoursToCharge < 36) {
      try {
        const result = await sendBillingNotification({
          userId: sub.userId,
          kind: BillingNotificationKind.REMINDER_1,
          refType: 'SUBSCRIPTION',
          refId: sub.id,
          title: 'Renewal tomorrow',
          message: `Your ${sub.plan?.name ?? 'subscription'} renews in ~24h. Make sure your payment method is up-to-date.`,
          link: '/billing/subscriptions',
          metadata: {
            planName: sub.plan?.name,
            planCode: sub.plan?.code,
            nextChargeAt: sub.nextChargeAt?.toISOString(),
          },
        });
        if (result.sent) reminded += 1;
      } catch (err) {
        logger.warn('Subscription renewal reminder failed', {
          subscriptionId: sub.id,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  logger.info('Subscription renewal pre-check complete', {
    checked: upcoming.length,
    reminded,
    halted,
    reconciled,
  });
  return { checked: upcoming.length, reminded, halted, reconciled };
}
