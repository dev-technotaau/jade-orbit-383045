import type { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { BillingNotificationKind, EntitlementStatus, SubscriptionStatus } from '@prisma/client';
import logger from '../config/logger';

/**
 * 7-day / 3-day / 1-day renewal reminder sweep.
 *
 * For every active subscription / entitlement, check if it falls into a
 * reminder window today and emit a multi-channel notification (deduped via
 * `BillingNotification`).
 *
 * Notification content stays generic in Phase 4 — Phase 12/13 will polish
 * the templates with plan-specific copy + deeplink.
 */
const REMINDER_WINDOWS: Array<{
  days: number;
  kind: BillingNotificationKind;
}> = [
  { days: 7, kind: BillingNotificationKind.REMINDER_7 },
  { days: 3, kind: BillingNotificationKind.REMINDER_3 },
  { days: 1, kind: BillingNotificationKind.REMINDER_1 },
];

const CHANNELS = ['IN_APP', 'EMAIL', 'WHATSAPP', 'FCM'] as const;

interface NotifyArgs {
  userId: string;
  refType: 'SUBSCRIPTION' | 'ENTITLEMENT';
  refId: string;
  kind: BillingNotificationKind;
  daysLeft: number;
  planName: string;
}

async function notify(args: NotifyArgs): Promise<void> {
  // Lazy import to avoid circular notification-service deps at boot
  const { notificationService } = await import('../services/notification.service');

  for (const channel of CHANNELS) {
    // Atomic dedup — second send for same (user, kind, ref, channel) is a no-op
    const existing = await prisma.billingNotification.findUnique({
      where: {
        userId_kind_refType_refId_channel: {
          userId: args.userId,
          kind: args.kind,
          refType: args.refType,
          refId: args.refId,
          channel,
        },
      },
    });
    if (existing) continue;

    try {
      await prisma.billingNotification.create({
        data: {
          userId: args.userId,
          kind: args.kind,
          refType: args.refType,
          refId: args.refId,
          channel,
        },
      });
    } catch {
      // unique violation race — already sent
      continue;
    }
  }

  // Single dispatch via notification service (it picks per-user channels)
  await notificationService
    .send({
      userId: args.userId,
      title: `Your ${args.planName} plan renews in ${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'}`,
      message:
        args.daysLeft === 1
          ? `Tomorrow your ${args.planName} plan auto-renews. Manage auto-renew in your billing dashboard.`
          : `Your ${args.planName} plan renews in ${args.daysLeft} days. Manage from billing → subscriptions.`,
      type: 'INFO',
      category: 'billing',
      link:
        args.refType === 'SUBSCRIPTION'
          ? `/billing/subscriptions/${args.refId}`
          : '/billing/orders',
      channels: ['in_app', 'email', 'fcm', 'whatsapp'],
    })
    .catch((err) => logger.error('Billing reminder notification failed', { err }));
}

export async function handleBillingReminder(job: Job): Promise<{ sent: number }> {
  const TIMEOUT_MS = 120_000;
  let sent = 0;
  logger.info(`Processing billing reminder cron ${job.id}`);

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  await Promise.race([
    (async () => {
      for (const { days, kind } of REMINDER_WINDOWS) {
        const windowStart = new Date(todayStart.getTime() + days * 24 * 60 * 60 * 1000);
        const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

        // Subscriptions
        const subs = await prisma.subscription.findMany({
          where: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AUTHENTICATED] },
            autoRenew: true,
            nextChargeAt: { gte: windowStart, lt: windowEnd },
          },
          select: {
            id: true,
            userId: true,
            plan: { select: { name: true } },
          },
          take: 500,
        });
        for (const s of subs) {
          await notify({
            userId: s.userId,
            refType: 'SUBSCRIPTION',
            refId: s.id,
            kind,
            daysLeft: days,
            planName: s.plan.name,
          });
          sent += 1;
        }

        // One-time entitlements with auto-renew flag set
        const ents = await prisma.entitlement.findMany({
          where: {
            status: EntitlementStatus.ACTIVE,
            autoRenew: true,
            validUntil: { gte: windowStart, lt: windowEnd },
          },
          select: {
            id: true,
            userId: true,
            plan: { select: { name: true } },
          },
          take: 500,
        });
        for (const e of ents) {
          await notify({
            userId: e.userId,
            refType: 'ENTITLEMENT',
            refId: e.id,
            kind,
            daysLeft: days,
            planName: e.plan.name,
          });
          sent += 1;
        }
      }
    })(),
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('Billing reminder worker timeout after 120s')), TIMEOUT_MS)
    ),
  ]);

  logger.info(`Billing reminders sent: ${sent}`);
  return { sent };
}
