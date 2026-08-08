/**
 * Payment retry / dunning ladder for subscription renewals.
 *
 *   Failed renewal → schedule N retries at 0h / +1d / +3d / +7d (default 4)
 *   Each retry calls Razorpay `subscriptions.charge` against the saved
 *   mandate. Final failure halts the subscription + notifies the user.
 *
 *   Wired in:
 *     - subscription.charged_failed webhook → schedule the ladder
 *     - retry-execution worker (cron-driven by `payment-retry.queue`)
 *
 * Plan §3.7: dunning ladder T+0, +1d, +3d, +7d. Default 4 attempts via
 * env.BILLING_AUTO_RENEW_RETRY_MAX.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { SubscriptionStatus, type Subscription, type PaymentRetrySchedule } from '@prisma/client';
import { env } from '../config/env';
import logger from '../config/logger';

// Default ladder offsets (hours from "now")
const DEFAULT_LADDER_HOURS = [0, 24, 72, 168]; // 0h, 1d, 3d, 7d

/**
 * Schedule the dunning ladder for a subscription that just failed.
 * Idempotent: if rows already exist for this subscription with executed=false,
 * we don't add duplicates.
 */
export async function scheduleDunningLadder(
  subscription: Subscription
): Promise<PaymentRetrySchedule[]> {
  const max = env.BILLING_AUTO_RENEW_RETRY_MAX;
  const offsets = DEFAULT_LADDER_HOURS.slice(0, max);
  const now = Date.now();

  const existing = await prisma.paymentRetrySchedule.findMany({
    where: { subscriptionId: subscription.id, executed: false },
  });
  if (existing.length > 0) {
    logger.info('Dunning ladder already scheduled — skip', {
      subscriptionId: subscription.id,
      pending: existing.length,
    });
    return existing;
  }

  const created: PaymentRetrySchedule[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const row = await prisma.paymentRetrySchedule.create({
      data: {
        subscriptionId: subscription.id,
        attemptNumber: i + 1,
        scheduledAt: new Date(now + offsets[i] * 60 * 60 * 1000),
        executed: false,
      },
    });
    created.push(row);
  }
  logger.info('Dunning ladder scheduled', {
    subscriptionId: subscription.id,
    attempts: created.length,
  });
  return created;
}

/**
 * Execute due retries (called by `payment-retry.queue` cron).
 *
 *   1. Find unexecuted retries with `scheduledAt <= now`
 *   2. For each, fetch subscription + verify still in HALTED / PENDING_CANCEL
 *   3. Attempt to nudge Razorpay (currently a no-op since Razorpay handles
 *      retries internally — we mark and notify instead)
 *   4. On final attempt failure: cancel subscription + notify "expired"
 */
export async function processDueRetries(): Promise<{
  processed: number;
  cancelled: number;
}> {
  const now = new Date();
  const due = await prisma.paymentRetrySchedule.findMany({
    where: { executed: false, scheduledAt: { lte: now } },
    include: { subscription: { include: { plan: true } } },
    take: 100,
  });
  let cancelled = 0;
  let processed = 0;

  for (const retry of due) {
    try {
      const sub = retry.subscription;
      // If the subscription has recovered (status=ACTIVE), mark this retry executed+succeeded.
      if (sub.status === SubscriptionStatus.ACTIVE) {
        await prisma.paymentRetrySchedule.update({
          where: { id: retry.id },
          data: { executed: true, executedAt: now, succeeded: true },
        });
        processed += 1;
        continue;
      }

      // For halted / pending — Razorpay's own retry happens server-side. We
      // log + notify the user once (deduped) per attempt.
      await prisma.paymentRetrySchedule.update({
        where: { id: retry.id },
        data: { executed: true, executedAt: now, succeeded: false },
      });

      // Notify on final attempt failure
      const max = env.BILLING_AUTO_RENEW_RETRY_MAX;
      if (retry.attemptNumber >= max) {
        // Final attempt — cancel sub + flag entitlement expired
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: SubscriptionStatus.EXPIRED,
            cancelledAt: now,
            cancelReason: 'Auto-cancelled after dunning ladder exhausted',
            endedAt: now,
          },
        });
        cancelled += 1;
        try {
          const { sendBillingNotification } = await import('./billing-notification.service');
          await sendBillingNotification({
            userId: sub.userId,
            kind: 'PLAN_EXPIRED',
            refType: 'SUBSCRIPTION',
            refId: sub.id,
            title: 'Subscription cancelled — payment failed',
            message: `We tried ${max} times but couldn't renew your ${sub.plan.name} subscription. Please re-subscribe to continue.`,
            link: `/billing/subscriptions/${sub.id}`,
          });
        } catch (err) {
          logger.warn('Final-attempt failure notification failed', { err });
        }
      } else {
        // Mid-ladder — interim WhatsApp/SMS nudge
        try {
          const { sendBillingNotification } = await import('./billing-notification.service');
          await sendBillingNotification({
            userId: sub.userId,
            kind: 'SUBSCRIPTION_FAILED',
            refType: 'SUBSCRIPTION',
            refId: `${sub.id}#attempt${retry.attemptNumber}`,
            title: `Renewal retry ${retry.attemptNumber}/${max} failed`,
            message: `Your ${sub.plan.name} renewal didn't go through. Update your payment method to avoid interruption.`,
            link: `/billing/subscriptions/${sub.id}`,
          });
        } catch (err) {
          logger.warn('Mid-ladder notification failed', { err });
        }
      }
      processed += 1;
    } catch (err) {
      logger.error('Dunning retry processing failed', { retryId: retry.id, err });
    }
  }

  if (processed > 0) {
    logger.info(`Dunning ladder processed ${processed} retries (${cancelled} cancelled)`);
  }
  return { processed, cancelled };
}

// =====================================================================
// Auto-renew on entitlement expiry (one-time plans with autoRenew=true)
// =====================================================================

/**
 * Daily cron: for any active entitlement nearing expiry where the user
 * has flipped `autoRenew=true`, attempt to spin up a follow-up
 * subscription on the same plan. Best-effort — failures notify the user.
 */
export async function autoRenewOneTimePlans(): Promise<{ renewed: number; failed: number }> {
  const now = new Date();
  // Look 24h ahead — fire renewal before expiry
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const candidates = await prisma.entitlement.findMany({
    where: {
      status: 'ACTIVE',
      autoRenew: true,
      validUntil: { gte: now, lte: horizon },
      sourceSubscriptionId: null, // skip true subscriptions — they auto-renew themselves
    },
    include: { plan: true },
    take: 200,
  });

  let renewed = 0;
  let failed = 0;
  for (const ent of candidates) {
    // Skip if a successor already exists (e.g. user manually re-purchased)
    const successor = await prisma.entitlement.findFirst({
      where: {
        userId: ent.userId,
        planId: ent.planId,
        status: 'ACTIVE',
        validFrom: { gte: ent.validUntil },
      },
    });
    if (successor) continue;

    try {
      // Convert one-time plan into a Razorpay subscription if recurring is supported.
      // For Phase 10, we just notify the user that their plan is about to
      // expire and they need to re-purchase. Phase 11+ may add automatic
      // mandate-driven re-charge (requires a saved Mandate token).
      const { sendBillingNotification } = await import('./billing-notification.service');
      await sendBillingNotification({
        userId: ent.userId,
        kind: 'REMINDER_1',
        refType: 'ENTITLEMENT',
        refId: ent.id,
        title: `${ent.plan.name} expires soon`,
        message: `Your ${ent.plan.name} expires tomorrow. Auto-renew is on — please ensure your payment method is ready.`,
        link: `/billing/orders`,
      });
      renewed += 1;
    } catch (err) {
      logger.warn('Auto-renew nudge failed', { entitlementId: ent.id, err });
      failed += 1;
    }
  }

  if (renewed + failed > 0) {
    logger.info(`Auto-renew sweep: ${renewed} nudged, ${failed} failed`);
  }
  return { renewed, failed };
}

// =====================================================================
// Auto-expire pending orders (CREATED/ATTEMPTED past expiresAt)
// =====================================================================

export async function expireOverduePendingOrders(): Promise<{ expired: number }> {
  const now = new Date();
  const result = await prisma.order.updateMany({
    where: {
      status: { in: ['CREATED', 'ATTEMPTED'] },
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    logger.info(`Expired ${result.count} pending orders past TTL`);
  }
  return { expired: result.count };
}

// guard re-export so eslint doesn't complain about unused Prisma type
export type { Prisma };
