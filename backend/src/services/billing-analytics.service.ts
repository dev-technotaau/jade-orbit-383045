/**
 * Super-admin financial analytics — feeds the KPI dashboard.
 *
 *   - MRR (currently-active subscription monthly run-rate)
 *   - ARR (MRR × 12)
 *   - ARPU (last 30d revenue / paying users)
 *   - Churn % (cancelled subs last 30d / active subs at period start)
 *   - LTV (ARPU × avg subscriber lifetime in months — uses ARPU * 12 as floor)
 *   - Daily revenue series (last 30 days)
 *   - Top plans by revenue
 *   - Payment success rate
 *   - Refund rate
 *   - Settlement balance (sum of last 30d settlements)
 *   - Open action queue counts (refunds pending, disputes open, fraud flags
 *     unreviewed, quote requests new)
 *
 * Reads only — no writes. Cache via the existing `cache()` middleware
 * on the route (5-minute TTL).
 */
import { prisma } from '../config/prisma';
import { OrderStatus, PlanBillingCycle, SubscriptionStatus } from '@prisma/client';

const MONTH_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function startOfDayUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// =====================================================================
// MRR / ARR
// =====================================================================

async function computeMRRPaise(): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AUTHENTICATED] },
    },
    include: {
      plan: { select: { basePricePaise: true, billingCycle: true } },
    },
  });
  let mrr = 0;
  for (const s of subs) {
    const price = s.plan.basePricePaise;
    switch (s.plan.billingCycle) {
      case PlanBillingCycle.MONTHLY:
        mrr += price;
        break;
      case PlanBillingCycle.QUARTERLY:
        mrr += price / 3;
        break;
      case PlanBillingCycle.HALF_YEARLY:
        mrr += price / 6;
        break;
      case PlanBillingCycle.YEARLY:
        mrr += price / 12;
        break;
      default:
        // ONE_TIME / CUSTOM — not part of MRR
        break;
    }
  }
  return Math.round(mrr);
}

// =====================================================================
// Revenue + ARPU + churn
// =====================================================================

async function totalRevenuePaiseSince(since: Date): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: {
      status: 'CAPTURED',
      capturedAt: { gte: since },
    },
    _sum: { capturedPaise: true },
  });
  return result._sum.capturedPaise ?? 0;
}

async function payingUsersSince(since: Date): Promise<number> {
  const distinct = await prisma.payment.findMany({
    where: {
      status: 'CAPTURED',
      capturedAt: { gte: since },
    },
    distinct: ['userId'],
    select: { userId: true },
  });
  return distinct.length;
}

async function computeChurnPercent(): Promise<number> {
  const periodStart = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const cancelledLast30d = await prisma.subscription.count({
    where: {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: { gte: periodStart },
    },
  });
  const activeAtStart = await prisma.subscription.count({
    where: {
      OR: [
        { createdAt: { lt: periodStart } },
        { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] } },
      ],
      currentEnd: { gte: periodStart },
    },
  });
  if (activeAtStart === 0) return 0;
  return Math.round((cancelledLast30d / activeAtStart) * 1000) / 10; // 1 decimal place
}

// =====================================================================
// Per-day revenue series (last 30 days)
// =====================================================================

interface RevenuePoint {
  date: string; // YYYY-MM-DD
  paise: number;
  count: number;
}

async function dailyRevenueSeries(days: number = 30): Promise<RevenuePoint[]> {
  const series: RevenuePoint[] = [];
  const today = startOfDayUTC();
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(today.getTime() - i * MS_PER_DAY);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const agg = await prisma.payment.aggregate({
      where: {
        status: 'CAPTURED',
        capturedAt: { gte: dayStart, lt: dayEnd },
      },
      _sum: { capturedPaise: true },
      _count: { _all: true },
    });
    series.push({
      date: dayStart.toISOString().slice(0, 10),
      paise: agg._sum.capturedPaise ?? 0,
      count: agg._count._all ?? 0,
    });
  }
  return series;
}

// =====================================================================
// Top plans
// =====================================================================

interface TopPlan {
  planId: string;
  planCode: string;
  planName: string;
  revenuePaise: number;
  orderCount: number;
}

async function topPlansLast30d(limit = 5): Promise<TopPlan[]> {
  const since = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const grouped = await prisma.order.groupBy({
    by: ['planId'],
    where: { status: OrderStatus.PAID, paidAt: { gte: since } },
    _sum: { totalPaise: true },
    _count: { _all: true },
  });
  grouped.sort((a, b) => (b._sum.totalPaise ?? 0) - (a._sum.totalPaise ?? 0));
  const top = grouped.slice(0, limit);
  if (top.length === 0) return [];
  const plans = await prisma.plan.findMany({
    where: { id: { in: top.map((g) => g.planId) } },
    select: { id: true, code: true, name: true },
  });
  const planMap = new Map(plans.map((p) => [p.id, p]));
  return top.map((g) => ({
    planId: g.planId,
    planCode: planMap.get(g.planId)?.code ?? 'unknown',
    planName: planMap.get(g.planId)?.name ?? 'unknown',
    revenuePaise: g._sum.totalPaise ?? 0,
    orderCount: g._count._all ?? 0,
  }));
}

// =====================================================================
// Success rate + refund rate
// =====================================================================

async function paymentSuccessRate(): Promise<number> {
  const since = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const [captured, failed] = await prisma.$transaction([
    prisma.payment.count({ where: { status: 'CAPTURED', createdAt: { gte: since } } }),
    prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
  ]);
  const total = captured + failed;
  if (total === 0) return 100;
  return Math.round((captured / total) * 1000) / 10;
}

async function refundRatePercent(): Promise<number> {
  const since = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const [paid, refunded] = await prisma.$transaction([
    prisma.order.count({ where: { status: 'PAID', paidAt: { gte: since } } }),
    prisma.order.count({
      where: { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] }, refundedAt: { gte: since } },
    }),
  ]);
  if (paid === 0) return 0;
  return Math.round((refunded / paid) * 1000) / 10;
}

// =====================================================================
// Settlement balance (last 30d)
// =====================================================================

async function settlementSumLast30d(): Promise<number> {
  const since = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const agg = await prisma.settlement.aggregate({
    where: { settledOnDate: { gte: since } },
    _sum: { netPaise: true },
  });
  return agg._sum.netPaise ?? 0;
}

// =====================================================================
// Open action queue
// =====================================================================

interface ActionQueueCounts {
  refundsPending: number;
  disputesOpen: number;
  fraudFlagsUnreviewed: number;
  quotesNew: number;
  webhooksFailed: number;
}

async function openActionQueueCounts(): Promise<ActionQueueCounts> {
  const [refundsPending, disputesOpen, fraudFlagsUnreviewed, quotesNew, webhooksFailed] =
    await prisma.$transaction([
      prisma.refund.count({ where: { status: 'PENDING' } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      prisma.fraudSignalEvent.count({
        where: {
          reviewedAt: null,
          severity: { in: ['HIGH', 'CRITICAL'] },
        },
      }),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.razorpayWebhookEvent.count({ where: { status: 'FAILED' } }),
    ]);
  return { refundsPending, disputesOpen, fraudFlagsUnreviewed, quotesNew, webhooksFailed };
}

// =====================================================================
// Public API — single dashboard call
// =====================================================================

export interface FinancialDashboard {
  revenue: {
    last30dPaise: number;
    todayPaise: number;
    yesterdayPaise: number;
    series: RevenuePoint[];
  };
  recurring: {
    mrrPaise: number;
    arrPaise: number;
    activeSubscriptions: number;
    churnPercentLast30d: number;
  };
  unitEconomics: {
    arpuPaise: number;
    payingUsersLast30d: number;
    ltvPaise: number; // ARPU × 12 (rough floor)
    paymentSuccessRatePercent: number;
    refundRatePercent: number;
  };
  settlement: {
    last30dNetPaise: number;
  };
  topPlans: TopPlan[];
  actionQueue: ActionQueueCounts;
  generatedAt: string;
}

export async function getFinancialDashboard(): Promise<FinancialDashboard> {
  const since30d = new Date(Date.now() - MONTH_DAYS * MS_PER_DAY);
  const [
    last30dPaise,
    series,
    payingUsers,
    mrrPaise,
    activeSubs,
    churn,
    successRate,
    refundRate,
    settlements,
    topPlans,
    queue,
  ] = await Promise.all([
    totalRevenuePaiseSince(since30d),
    dailyRevenueSeries(30),
    payingUsersSince(since30d),
    computeMRRPaise(),
    prisma.subscription.count({
      where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AUTHENTICATED] } },
    }),
    computeChurnPercent(),
    paymentSuccessRate(),
    refundRatePercent(),
    settlementSumLast30d(),
    topPlansLast30d(),
    openActionQueueCounts(),
  ]);

  const todayPaise = series.length > 0 ? series[series.length - 1].paise : 0;
  const yesterdayPaise = series.length > 1 ? series[series.length - 2].paise : 0;
  const arpuPaise = payingUsers === 0 ? 0 : Math.round(last30dPaise / payingUsers);
  const ltvPaise = arpuPaise * 12; // crude floor — Phase 14 with BigQuery improves this

  return {
    revenue: {
      last30dPaise,
      todayPaise,
      yesterdayPaise,
      series,
    },
    recurring: {
      mrrPaise,
      arrPaise: mrrPaise * 12,
      activeSubscriptions: activeSubs,
      churnPercentLast30d: churn,
    },
    unitEconomics: {
      arpuPaise,
      payingUsersLast30d: payingUsers,
      ltvPaise,
      paymentSuccessRatePercent: successRate,
      refundRatePercent: refundRate,
    },
    settlement: { last30dNetPaise: settlements },
    topPlans,
    actionQueue: queue,
    generatedAt: new Date().toISOString(),
  };
}

// =====================================================================
// Transactions list (payments view, joinable to orders)
// =====================================================================

export async function listPaymentsAdmin(args: {
  status?: 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  method?:
    | 'CARD'
    | 'UPI'
    | 'NETBANKING'
    | 'WALLET'
    | 'EMI'
    | 'PAYLATER'
    | 'BANK_TRANSFER'
    | 'INTERNATIONAL'
    | 'UNKNOWN';
  userId?: string;
  search?: string; // razorpayPaymentId or order receipt
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.method) where.method = args.method;
  if (args.userId) where.userId = args.userId;
  if (args.search) {
    where.OR = [
      { razorpayPaymentId: { contains: args.search, mode: 'insensitive' } },
      { order: { receiptNumber: { contains: args.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        order: {
          select: {
            receiptNumber: true,
            totalPaise: true,
            plan: { select: { code: true, name: true } },
          },
        },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return { items, total, page, limit };
}
