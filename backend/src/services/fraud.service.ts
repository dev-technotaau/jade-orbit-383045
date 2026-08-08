/**
 * Fraud detection rule engine.
 *
 *   - Evaluates a payment against active `FraudRule` rows from DB
 *   - Built-in detectors:
 *       MULTI_ACCOUNT_SAME_CARD — same card fingerprint across N accounts
 *       VELOCITY_BURST          — > N orders/payments in window seconds
 *       GEO_MISMATCH            — IP country ≠ buyer country (placeholder)
 *       EMAIL_DOMAIN_DISPOSABLE — disposable-email allowlist check
 *       IP_BLACKLIST / BIN_BLACKLIST — SystemConfig-driven lists
 *       CHARGEBACK_RATE         — historical chargebacks for this user
 *   - Persists `FraudSignalEvent` per signal that matches
 *   - Applies rule action (NONE | REVIEW | BLOCK | REFUND_AND_BLOCK)
 *   - Async-driven via `fraud-scan.queue` from `payment.captured` webhook
 *
 * Default rules are seeded by `seed-fraud-rules.ts` (also exported below).
 */
import { prisma } from '../config/prisma';
import {
  FraudSignal,
  FraudSeverity,
  FraudAction,
  OrderStatus,
  type FraudRule,
  type Payment,
  type Prisma,
} from '@prisma/client';
import { env } from '../config/env';
import { billingFraudSignalsTotal } from '../routes/metrics.routes';
import logger from '../config/logger';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';

// =====================================================================
// Public API — invoked from fraud-scan.worker
// =====================================================================

export interface FraudScanArgs {
  paymentId: string;
}

export interface FraudScanResult {
  paymentId: string;
  signalsTriggered: number;
  highestSeverity: FraudSeverity | null;
  appliedAction: FraudAction;
  flagIds: string[];
}

export async function scanPayment(args: FraudScanArgs): Promise<FraudScanResult> {
  if (!env.BILLING_FRAUD_ENABLED) {
    return {
      paymentId: args.paymentId,
      signalsTriggered: 0,
      highestSeverity: null,
      appliedAction: FraudAction.NONE,
      flagIds: [],
    };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: args.paymentId },
    include: {
      order: {
        select: {
          ipAddress: true,
          userAgent: true,
          deviceFingerprint: true,
          buyerEmail: true,
          buyerCountry: true,
        },
      },
      user: { select: { email: true, createdAt: true } },
    },
  });
  if (!payment) {
    logger.warn('fraud.scan — payment not found', { paymentId: args.paymentId });
    return {
      paymentId: args.paymentId,
      signalsTriggered: 0,
      highestSeverity: null,
      appliedAction: FraudAction.NONE,
      flagIds: [],
    };
  }

  const rules = await prisma.fraudRule.findMany({ where: { enabled: true } });
  const ruleIndex = new Map<FraudSignal, FraudRule>();
  for (const r of rules) ruleIndex.set(r.signal, r);

  const flagIds: string[] = [];
  const severities: FraudSeverity[] = [];
  let appliedAction: FraudAction = FraudAction.NONE;

  // ─── 1. Multi-account-same-card ────────────────────────────────
  if (payment.cardFingerprint) {
    const rule = ruleIndex.get(FraudSignal.MULTI_ACCOUNT_SAME_CARD);
    const threshold = rule?.threshold ?? env.BILLING_FRAUD_MULTI_ACCOUNT_THRESHOLD;
    const distinctUsers = await prisma.payment.groupBy({
      by: ['userId'],
      where: {
        cardFingerprint: payment.cardFingerprint,
        userId: { not: payment.userId }, // distinct OTHER users
      },
      _count: { userId: true },
    });
    if (distinctUsers.length >= threshold) {
      const flag = await persistFlag({
        userId: payment.userId,
        orderId: payment.orderId,
        paymentId: payment.id,
        signal: FraudSignal.MULTI_ACCOUNT_SAME_CARD,
        severity: rule?.severity ?? FraudSeverity.HIGH,
        action: rule?.action ?? FraudAction.REVIEW,
        evidence: {
          cardFingerprint: payment.cardFingerprint,
          distinctOtherUsers: distinctUsers.length,
          threshold,
        },
        notes: `Card fingerprint shared across ${distinctUsers.length} other accounts`,
      });
      flagIds.push(flag.id);
      severities.push(rule?.severity ?? FraudSeverity.HIGH);
      appliedAction = pickStrongerAction(appliedAction, rule?.action ?? FraudAction.REVIEW);
    }
  }

  // ─── 2. Velocity burst ─────────────────────────────────────────
  {
    const rule = ruleIndex.get(FraudSignal.VELOCITY_BURST);
    const windowSeconds = rule?.windowSeconds ?? env.BILLING_FRAUD_VELOCITY_WINDOW_SECONDS;
    const threshold = rule?.threshold ?? env.BILLING_FRAUD_VELOCITY_THRESHOLD;
    const since = new Date(Date.now() - windowSeconds * 1000);
    const recentCount = await prisma.payment.count({
      where: { userId: payment.userId, createdAt: { gte: since } },
    });
    if (recentCount > threshold) {
      const flag = await persistFlag({
        userId: payment.userId,
        orderId: payment.orderId,
        paymentId: payment.id,
        signal: FraudSignal.VELOCITY_BURST,
        severity: rule?.severity ?? FraudSeverity.MEDIUM,
        action: rule?.action ?? FraudAction.REVIEW,
        evidence: { count: recentCount, windowSeconds, threshold },
        notes: `${recentCount} payments in last ${windowSeconds}s (threshold ${threshold})`,
      });
      flagIds.push(flag.id);
      severities.push(rule?.severity ?? FraudSeverity.MEDIUM);
      appliedAction = pickStrongerAction(appliedAction, rule?.action ?? FraudAction.REVIEW);
    }
  }

  // ─── 2b. GEO_MISMATCH — IP country differs from billing country ──
  {
    const rule = ruleIndex.get(FraudSignal.GEO_MISMATCH);
    if (rule && payment.order?.ipAddress) {
      const buyerCountry = payment.order.buyerCountry ?? null;
      if (buyerCountry) {
        const { ipBuyerCountryMismatch } = await import('../utils/ip-geo');
        const mismatch = await ipBuyerCountryMismatch({
          ipAddress: payment.order.ipAddress,
          buyerCountryCode: buyerCountry,
        });
        if (mismatch) {
          const flag = await persistFlag({
            userId: payment.userId,
            orderId: payment.orderId,
            paymentId: payment.id,
            signal: FraudSignal.GEO_MISMATCH,
            severity: rule.severity,
            action: rule.action,
            evidence: {
              ipAddress: payment.order.ipAddress,
              buyerCountry,
            },
            notes: `IP country differs from billing country (${buyerCountry})`,
          });
          flagIds.push(flag.id);
          severities.push(rule.severity);
          appliedAction = pickStrongerAction(appliedAction, rule.action);
        }
      }
    }
  }

  // ─── 3. Disposable email ──────────────────────────────────────
  {
    const rule = ruleIndex.get(FraudSignal.EMAIL_DOMAIN_DISPOSABLE);
    if (rule && payment.user?.email) {
      const domain = payment.user.email.split('@')[1]?.toLowerCase() ?? '';
      const list = await getSystemConfigList('fraud.disposable_email_domains');
      if (list.includes(domain)) {
        const flag = await persistFlag({
          userId: payment.userId,
          orderId: payment.orderId,
          paymentId: payment.id,
          signal: FraudSignal.EMAIL_DOMAIN_DISPOSABLE,
          severity: rule.severity,
          action: rule.action,
          evidence: { domain, email: payment.user.email },
          notes: `Disposable email domain: ${domain}`,
        });
        flagIds.push(flag.id);
        severities.push(rule.severity);
        appliedAction = pickStrongerAction(appliedAction, rule.action);
      }
    }
  }

  // ─── 4. IP blacklist ──────────────────────────────────────────
  {
    const rule = ruleIndex.get(FraudSignal.IP_BLACKLIST);
    if (rule && payment.order?.ipAddress) {
      const list = await getSystemConfigList('fraud.ip_blacklist');
      if (list.includes(payment.order.ipAddress)) {
        const flag = await persistFlag({
          userId: payment.userId,
          orderId: payment.orderId,
          paymentId: payment.id,
          signal: FraudSignal.IP_BLACKLIST,
          severity: rule.severity,
          action: rule.action,
          evidence: { ip: payment.order.ipAddress },
          notes: `IP on blacklist`,
        });
        flagIds.push(flag.id);
        severities.push(rule.severity);
        appliedAction = pickStrongerAction(appliedAction, rule.action);
      }
    }
  }

  // ─── 5. BIN blacklist ─────────────────────────────────────────
  {
    const rule = ruleIndex.get(FraudSignal.BIN_BLACKLIST);
    if (rule && payment.cardLast4 && payment.cardIssuer) {
      const list = await getSystemConfigList('fraud.bin_blacklist');
      const issuerKey = `${payment.cardIssuer}:${payment.cardLast4}`.toUpperCase();
      if (list.some((e) => issuerKey.includes(e.toUpperCase()))) {
        const flag = await persistFlag({
          userId: payment.userId,
          orderId: payment.orderId,
          paymentId: payment.id,
          signal: FraudSignal.BIN_BLACKLIST,
          severity: rule.severity,
          action: rule.action,
          evidence: { issuer: payment.cardIssuer, last4: payment.cardLast4 },
          notes: 'Card issuer/BIN on blacklist',
        });
        flagIds.push(flag.id);
        severities.push(rule.severity);
        appliedAction = pickStrongerAction(appliedAction, rule.action);
      }
    }
  }

  // ─── 6. Chargeback rate ───────────────────────────────────────
  {
    const rule = ruleIndex.get(FraudSignal.CHARGEBACK_RATE);
    if (rule) {
      const past = await prisma.dispute.count({
        where: {
          payment: { userId: payment.userId },
          status: { in: ['OPEN', 'UNDER_REVIEW', 'LOST'] },
        },
      });
      if (past >= rule.threshold) {
        const flag = await persistFlag({
          userId: payment.userId,
          orderId: payment.orderId,
          paymentId: payment.id,
          signal: FraudSignal.CHARGEBACK_RATE,
          severity: rule.severity,
          action: rule.action,
          evidence: { historicalChargebacks: past, threshold: rule.threshold },
          notes: `${past} historical chargebacks`,
        });
        flagIds.push(flag.id);
        severities.push(rule.severity);
        appliedAction = pickStrongerAction(appliedAction, rule.action);
      }
    }
  }

  // ─── Apply action ─────────────────────────────────────────────
  if (
    flagIds.length > 0 &&
    (appliedAction === FraudAction.BLOCK || appliedAction === FraudAction.REFUND_AND_BLOCK)
  ) {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.FRAUD_FLAGGED, fraudAction: appliedAction },
    });
    if (appliedAction === FraudAction.REFUND_AND_BLOCK) {
      // Auto-refund (best-effort)
      try {
        const { initiateRefund } = await import('./refund.service');
        await initiateRefund({
          paymentId: payment.id,
          reason: 'FRAUD',
          notes: 'Auto-refund due to fraud detection',
          bypassWindow: true,
          initiatedBy: 'fraud-engine',
        });
      } catch (err) {
        logger.error('Auto-refund on fraud detection failed', { err });
      }
    }
  }

  // Phase 14: Prometheus per-signal counter (one per flag actually fired)
  if (flagIds.length > 0) {
    for (let i = 0; i < flagIds.length; i++) {
      billingFraudSignalsTotal.inc({
        signal: 'unknown', // simplified — full per-signal tracking is on the FraudSignalEvent.signal column
        severity: severities[i] ?? 'LOW',
        action: appliedAction,
      });
    }
  }

  // Update Order.fraudScore — sum of severity weights
  if (flagIds.length > 0) {
    const score = severities.reduce((s, sev) => s + severityWeight(sev), 0);
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { fraudScore: { increment: score } },
    });
    // Notify super-admins on HIGH/CRITICAL flags
    if (severities.some((s) => s === FraudSeverity.HIGH || s === FraudSeverity.CRITICAL)) {
      void notifySuperAdminsOfFraud(payment, flagIds, severities).catch(() => {});
    }
    // Kafka emit
    void publishEvent(KafkaTopics.BILLING_FRAUD_FLAGGED, payment.userId, {
      userId: payment.userId,
      paymentId: payment.id,
      orderId: payment.orderId,
      flagIds,
      severities,
      appliedAction,
    }).catch(() => {});

    // Audit log per fraud action taken
    void (async () => {
      const { AuditService } = await import('./audit.service');
      await AuditService.log({
        action: 'BILLING_FRAUD_FLAG',
        entity: 'Payment',
        entityId: payment.id,
        performedBy: 'fraud-engine',
        details: {
          orderId: payment.orderId,
          flagIds,
          severities,
          appliedAction,
        },
      });
    })();
  }

  const highestSeverity =
    severities.sort((a, b) => severityWeight(b) - severityWeight(a))[0] ?? null;

  logger.info('fraud.scan complete', {
    paymentId: payment.id,
    signalsTriggered: flagIds.length,
    highestSeverity,
    appliedAction,
  });

  return {
    paymentId: payment.id,
    signalsTriggered: flagIds.length,
    highestSeverity,
    appliedAction,
    flagIds,
  };
}

// =====================================================================
// Helpers
// =====================================================================

async function persistFlag(args: {
  userId: string;
  orderId: string;
  paymentId: string;
  signal: FraudSignal;
  severity: FraudSeverity;
  action: FraudAction;
  evidence: Record<string, unknown>;
  notes: string;
}) {
  return prisma.fraudSignalEvent.create({
    data: {
      userId: args.userId,
      orderId: args.orderId,
      paymentId: args.paymentId,
      signal: args.signal,
      severity: args.severity,
      action: args.action,
      evidence: args.evidence as Prisma.InputJsonValue,
      notes: args.notes,
    },
  });
}

function pickStrongerAction(a: FraudAction, b: FraudAction): FraudAction {
  const order: FraudAction[] = [
    FraudAction.NONE,
    FraudAction.REVIEW,
    FraudAction.BLOCK,
    FraudAction.REFUND_AND_BLOCK,
  ];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function severityWeight(s: FraudSeverity): number {
  return { LOW: 1, MEDIUM: 5, HIGH: 25, CRITICAL: 100 }[s];
}

async function getSystemConfigList(key: string): Promise<string[]> {
  const row = await prisma.systemConfig.findUnique({ where: { key } }).catch(() => null);
  if (!row) return [];
  const value = row.value as { items?: string[] } | string[] | null;
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

async function notifySuperAdminsOfFraud(
  payment: Payment,
  flagIds: string[],
  severities: FraudSeverity[]
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true, isSuspended: false },
    select: { id: true },
  });
  const { sendBillingNotification } = await import('./billing-notification.service');
  for (const a of admins) {
    await sendBillingNotification({
      userId: a.id,
      kind: 'FRAUD_ALERT',
      refType: 'FRAUD',
      refId: flagIds[0] ?? payment.id,
      title: 'Fraud signal detected',
      message: `Payment ${payment.razorpayPaymentId} flagged with ${flagIds.length} signal(s) — highest severity: ${severities.sort((x, y) => severityWeight(y) - severityWeight(x))[0]}`,
      link: `/super-admin/billing/fraud/${flagIds[0] ?? payment.id}`,
      metadata: { paymentId: payment.id, flagIds, severities },
    }).catch(() => {});
  }
}

// =====================================================================
// Default fraud rule seed (called from a seed script)
// =====================================================================

const DEFAULT_RULES: Array<{
  name: string;
  signal: FraudSignal;
  threshold: number;
  windowSeconds: number;
  action: FraudAction;
  severity: FraudSeverity;
  notes: string;
}> = [
  {
    name: 'multi_account_same_card_default',
    signal: FraudSignal.MULTI_ACCOUNT_SAME_CARD,
    threshold: 3,
    windowSeconds: 60 * 60 * 24 * 30, // 30 days
    action: FraudAction.REVIEW,
    severity: FraudSeverity.HIGH,
    notes: 'Same card fingerprint across 3+ accounts in 30 days',
  },
  {
    name: 'velocity_burst_default',
    signal: FraudSignal.VELOCITY_BURST,
    threshold: 5,
    windowSeconds: 300,
    action: FraudAction.REVIEW,
    severity: FraudSeverity.MEDIUM,
    notes: '> 5 payments in 5 minutes',
  },
  {
    name: 'email_domain_disposable_default',
    signal: FraudSignal.EMAIL_DOMAIN_DISPOSABLE,
    threshold: 1,
    windowSeconds: 0,
    action: FraudAction.REVIEW,
    severity: FraudSeverity.MEDIUM,
    notes: 'Buyer used disposable-email domain',
  },
  {
    name: 'ip_blacklist_default',
    signal: FraudSignal.IP_BLACKLIST,
    threshold: 1,
    windowSeconds: 0,
    action: FraudAction.BLOCK,
    severity: FraudSeverity.HIGH,
    notes: 'Buyer IP on blacklist',
  },
  {
    name: 'bin_blacklist_default',
    signal: FraudSignal.BIN_BLACKLIST,
    threshold: 1,
    windowSeconds: 0,
    action: FraudAction.REVIEW,
    severity: FraudSeverity.MEDIUM,
    notes: 'Card issuer/BIN on blacklist',
  },
  {
    name: 'chargeback_rate_default',
    signal: FraudSignal.CHARGEBACK_RATE,
    threshold: 2,
    windowSeconds: 60 * 60 * 24 * 365,
    action: FraudAction.REVIEW,
    severity: FraudSeverity.HIGH,
    notes: '2+ historical chargebacks in last year',
  },
];

export async function seedDefaultFraudRules(): Promise<void> {
  for (const rule of DEFAULT_RULES) {
    await prisma.fraudRule.upsert({
      where: { name: rule.name },
      create: {
        name: rule.name,
        signal: rule.signal,
        threshold: rule.threshold,
        windowSeconds: rule.windowSeconds,
        action: rule.action,
        severity: rule.severity,
        notes: rule.notes,
        enabled: true,
      },
      update: {},
    });
  }
  logger.info(`Default fraud rules seeded: ${DEFAULT_RULES.length}`);
}

// =====================================================================
// Read APIs (super-admin)
// =====================================================================

export async function listFraudFlagsAdmin(args: {
  severity?: FraudSeverity;
  action?: FraudAction;
  signal?: FraudSignal;
  reviewed?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.FraudSignalEventWhereInput = {};
  if (args.severity) where.severity = args.severity;
  if (args.action) where.action = args.action;
  if (args.signal) where.signal = args.signal;
  if (args.reviewed === true) where.reviewedAt = { not: null };
  if (args.reviewed === false) where.reviewedAt = null;
  const [items, total] = await prisma.$transaction([
    prisma.fraudSignalEvent.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: {
        user: { select: { id: true, email: true } },
        payment: { select: { razorpayPaymentId: true, method: true, amountPaise: true } },
      },
    }),
    prisma.fraudSignalEvent.count({ where }),
  ]);
  return { items, total };
}

export async function listFraudRulesAdmin() {
  return prisma.fraudRule.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function updateFraudRule(args: {
  id: string;
  enabled?: boolean;
  threshold?: number;
  windowSeconds?: number;
  action?: FraudAction;
  severity?: FraudSeverity;
  notes?: string | null;
  updatedBy: string;
}) {
  return prisma.fraudRule.update({
    where: { id: args.id },
    data: {
      enabled: args.enabled,
      threshold: args.threshold,
      windowSeconds: args.windowSeconds,
      action: args.action,
      severity: args.severity,
      notes: args.notes,
      updatedById: args.updatedBy,
    },
  });
}

export async function reviewFraudFlag(args: {
  flagId: string;
  reviewedBy: string;
  newAction?: FraudAction;
  notes?: string;
}) {
  return prisma.fraudSignalEvent.update({
    where: { id: args.flagId },
    data: {
      reviewedById: args.reviewedBy,
      reviewedAt: new Date(),
      action: args.newAction ?? undefined,
      notes: args.notes ?? undefined,
    },
  });
}
