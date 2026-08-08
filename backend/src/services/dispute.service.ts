/**
 * Dispute / chargeback handler. Persists Razorpay dispute events.
 * Super-admin reads them to take action (provide evidence, accept loss).
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { DisputeStatus, type Dispute } from '@prisma/client';
import { NotFoundError } from '../exceptions';
import logger from '../config/logger';
import type { RazorpayWebhookPayload } from './razorpay-webhook.service';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';

interface RazorpayDisputeEntity {
  id: string;
  payment_id: string;
  amount: number;
  status?: string;
  reason_code?: string;
  reason_description?: string;
  respond_by?: number;
  created_at?: number;
}

const STATUS_MAP: Record<string, DisputeStatus> = {
  open: DisputeStatus.OPEN,
  under_review: DisputeStatus.UNDER_REVIEW,
  won: DisputeStatus.WON,
  lost: DisputeStatus.LOST,
  closed: DisputeStatus.LOST, // closed is treated as a loss by default
  accepted: DisputeStatus.ACCEPTED,
};

export async function handleDisputeEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  const entity = payload.payload?.dispute?.entity as RazorpayDisputeEntity | undefined;
  if (!entity?.id) {
    logger.warn(`Dispute event ${event} missing entity`);
    return;
  }
  const payment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: entity.payment_id },
  });
  if (!payment) {
    logger.warn('Dispute webhook for unknown payment — ignoring', {
      razorpayPaymentId: entity.payment_id,
    });
    return;
  }

  const status = STATUS_MAP[(entity.status ?? '').toLowerCase()] ?? DisputeStatus.OPEN;
  await prisma.dispute.upsert({
    where: { razorpayDisputeId: entity.id },
    create: {
      paymentId: payment.id,
      razorpayDisputeId: entity.id,
      status,
      reasonCode: entity.reason_code ?? null,
      reasonDescription: entity.reason_description ?? null,
      amountPaise: entity.amount,
      dueByAt: entity.respond_by ? new Date(entity.respond_by * 1000) : null,
      raw: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      status,
      reasonCode: entity.reason_code ?? undefined,
      reasonDescription: entity.reason_description ?? undefined,
      amountPaise: entity.amount,
      dueByAt: entity.respond_by ? new Date(entity.respond_by * 1000) : undefined,
      raw: payload as unknown as Prisma.InputJsonValue,
    },
  });

  // Mark order as DISPUTED on first open; leave alone on subsequent updates
  if (status === DisputeStatus.OPEN) {
    await prisma.order.updateMany({
      where: { id: payment.orderId },
      data: { status: 'DISPUTED' },
    });
  }
  if (status === DisputeStatus.WON) {
    await prisma.order.updateMany({
      where: { id: payment.orderId, status: 'DISPUTED' },
      data: { status: 'PAID' },
    });
  }

  // Notify all super-admins on new disputes
  if (event === 'dispute.created') {
    void notifySuperAdminsOfDispute(payment.id, entity).catch(() => {});
  }

  logger.info('Dispute event processed', {
    event,
    razorpayDisputeId: entity.id,
    status,
  });
}

async function notifySuperAdminsOfDispute(
  paymentId: string,
  entity: RazorpayDisputeEntity
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true, isSuspended: false },
    select: { id: true },
  });
  const { notificationService } = await import('./notification.service');
  for (const a of admins) {
    await notificationService
      .send({
        userId: a.id,
        title: 'New chargeback / dispute',
        message: `Dispute ${entity.id} — ₹${entity.amount / 100}. Reason: ${entity.reason_description ?? entity.reason_code ?? 'unknown'}. Respond by ${entity.respond_by ? new Date(entity.respond_by * 1000).toLocaleDateString() : 'soon'}.`,
        type: 'WARNING',
        category: 'billing',
        link: `/super-admin/billing/disputes/${entity.id}`,
        channels: ['in_app', 'email', 'fcm', 'whatsapp'],
      })
      .catch(() => {});
    void paymentId;
  }
}

export async function listDisputesAdmin(args: {
  status?: DisputeStatus;
  page?: number;
  limit?: number;
}): Promise<{ items: Dispute[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.DisputeWhereInput = {};
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.dispute.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueByAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: { payment: { include: { order: true } } },
    }),
    prisma.dispute.count({ where }),
  ]);
  return { items, total };
}

export async function getDisputeAdmin(id: string): Promise<Dispute> {
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { payment: { include: { order: true } } },
  });
  if (!dispute) throw new NotFoundError('Dispute not found');
  return dispute;
}

// =====================================================================
// Cron-driven sync — fetches the last 100 disputes from Razorpay
// and reconciles open/won/lost states. Idempotent via razorpayDisputeId.
// =====================================================================

export async function syncDisputes(): Promise<{ synced: number }> {
  const client = getRazorpayClient();
  if (!client) {
    logger.warn('Razorpay not configured — skipping dispute sync');
    return { synced: 0 };
  }

  // The Razorpay SDK exposes disputes under client.disputes (v2.9+).
  // Some older SDKs do not have a typed all() — fall back to fetch.
  const result = (await withRazorpaySpan(
    'disputes.all',
    async () => {
      const disputesApi = (
        client as unknown as {
          disputes?: { all?: (args: Record<string, unknown>) => Promise<unknown> };
        }
      ).disputes;
      if (!disputesApi?.all) return { items: [] };
      return await disputesApi.all({ count: 100 });
    },
    {}
  )) as { items?: RazorpayDisputeEntity[]; count?: number };

  const items = result?.items ?? [];
  let synced = 0;
  for (const entity of items) {
    try {
      const payment = await prisma.payment.findUnique({
        where: { razorpayPaymentId: entity.payment_id },
      });
      if (!payment) continue;
      const status = STATUS_MAP[(entity.status ?? '').toLowerCase()] ?? DisputeStatus.OPEN;
      await prisma.dispute.upsert({
        where: { razorpayDisputeId: entity.id },
        create: {
          paymentId: payment.id,
          razorpayDisputeId: entity.id,
          status,
          reasonCode: entity.reason_code ?? null,
          reasonDescription: entity.reason_description ?? null,
          amountPaise: entity.amount,
          dueByAt: entity.respond_by ? new Date(entity.respond_by * 1000) : null,
          raw: entity as unknown as Prisma.InputJsonValue,
        },
        update: {
          status,
          reasonCode: entity.reason_code ?? undefined,
          reasonDescription: entity.reason_description ?? undefined,
          amountPaise: entity.amount,
          dueByAt: entity.respond_by ? new Date(entity.respond_by * 1000) : undefined,
          raw: entity as unknown as Prisma.InputJsonValue,
        },
      });
      synced += 1;
    } catch (err) {
      logger.error('Dispute sync upsert failed', { id: entity.id, err });
    }
  }
  logger.info(`Synced ${synced}/${items.length} disputes from Razorpay`);
  return { synced };
}
