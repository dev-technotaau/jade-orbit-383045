/**
 * Settlement sync.
 *
 *   - `syncSettlements()` — daily cron at 02:00 IST. Fetches via Razorpay
 *     settlements API + persists Settlement + SettlementTransaction rows.
 *   - Webhook `settlement.processed` / `payout.processed` are persisted by
 *     the same upsert helper.
 *
 * Used by super-admin financial center to reconcile money flowing into the
 * Hire Adda bank account.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { SettlementStatus, type Settlement } from '@prisma/client';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';
import { NotFoundError } from '../exceptions';
import logger from '../config/logger';
import type { RazorpayWebhookPayload } from './razorpay-webhook.service';

interface RazorpaySettlementEntity {
  id: string;
  amount: number;
  fees?: number;
  tax?: number;
  utr?: string;
  created_at?: number;
  status?: 'created' | 'processed' | 'failed' | 'partially_processed';
}

const STATUS_MAP: Record<string, SettlementStatus> = {
  created: SettlementStatus.SCHEDULED,
  processed: SettlementStatus.PROCESSED,
  failed: SettlementStatus.FAILED,
  partially_processed: SettlementStatus.PROCESSED,
};

async function upsertSettlement(entity: RazorpaySettlementEntity): Promise<Settlement> {
  const status = STATUS_MAP[entity.status ?? ''] ?? SettlementStatus.PROCESSED;
  const settledOn = entity.created_at ? new Date(entity.created_at * 1000) : new Date();
  const amount = entity.amount ?? 0;
  const fees = entity.fees ?? 0;
  const tax = entity.tax ?? 0;
  return prisma.settlement.upsert({
    where: { razorpaySettlementId: entity.id },
    create: {
      razorpaySettlementId: entity.id,
      settledOnDate: settledOn,
      amountPaise: amount,
      feesPaise: fees,
      taxPaise: tax,
      netPaise: amount - fees - tax,
      utr: entity.utr ?? null,
      status,
      raw: entity as unknown as Prisma.InputJsonValue,
    },
    update: {
      settledOnDate: settledOn,
      amountPaise: amount,
      feesPaise: fees,
      taxPaise: tax,
      netPaise: amount - fees - tax,
      utr: entity.utr ?? undefined,
      status,
      raw: entity as unknown as Prisma.InputJsonValue,
    },
  });
}

// =====================================================================
// Cron-driven sync
// =====================================================================

export async function syncSettlements(): Promise<{ synced: number }> {
  const client = getRazorpayClient();
  if (!client) {
    logger.warn('Razorpay not configured — skipping settlement sync');
    return { synced: 0 };
  }

  const result = (await withRazorpaySpan(
    'settlements.all',
    async () => client.settlements.all({ count: 100 }),
    {}
  )) as { items?: RazorpaySettlementEntity[]; count?: number };

  const items = result?.items ?? [];
  let synced = 0;
  for (const entity of items) {
    try {
      await upsertSettlement(entity);
      synced += 1;
    } catch (err) {
      logger.error('Failed to upsert settlement', { id: entity.id, err });
    }
  }
  logger.info(`Synced ${synced}/${items.length} settlements from Razorpay`);
  return { synced };
}

// =====================================================================
// Webhook handler
// =====================================================================

export async function handleSettlementEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  // Razorpay sends settlement entity under different keys — try both.
  const settlementEntity =
    (payload.payload?.settlement?.entity as RazorpaySettlementEntity | undefined) ??
    (
      (payload.payload as Record<string, unknown>).payout as
        | { entity?: RazorpaySettlementEntity }
        | undefined
    )?.entity;
  if (!settlementEntity?.id) {
    logger.debug(`Settlement event ${event} — no entity to persist`);
    return;
  }
  await upsertSettlement(settlementEntity);
}

// =====================================================================
// Read APIs
// =====================================================================

export async function listSettlementsAdmin(args: {
  page?: number;
  limit?: number;
  status?: SettlementStatus;
}): Promise<{ items: Settlement[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.SettlementWhereInput = {};
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.settlement.findMany({
      where,
      orderBy: { settledOnDate: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.settlement.count({ where }),
  ]);
  return { items, total };
}

export async function getSettlementAdmin(id: string): Promise<Settlement> {
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { id: 'asc' },
        include: {
          payment: { select: { razorpayPaymentId: true } },
          refund: { select: { razorpayRefundId: true } },
        },
      },
    },
  });
  if (!settlement) throw new NotFoundError('Settlement not found');
  return settlement;
}
