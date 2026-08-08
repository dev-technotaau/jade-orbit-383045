import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { isBridgeEnabled } from './whatsapp-bridge.service';

/**
 * Aggregate metrics for the super-admin WhatsApp analytics dashboard.
 * All counts are computed live (cheap, indexed). Rates are vs. outbound total.
 */
export async function getOverview() {
  const [
    totalContacts,
    optedIn,
    optedOut,
    blocked,
    totalConversations,
    openConversations,
    msgInbound,
    msgOutbound,
    msgDelivered,
    msgRead,
    msgFailed,
    templatesByStatus,
    campaignsByStatus,
    channel,
  ] = await Promise.all([
    prisma.waContact.count(),
    prisma.waContact.count({ where: { optInStatus: 'OPTED_IN' } }),
    prisma.waContact.count({ where: { optInStatus: 'OPTED_OUT' } }),
    prisma.waContact.count({ where: { isBlocked: true } }),
    prisma.waConversation.count(),
    prisma.waConversation.count({ where: { status: 'OPEN' } }),
    prisma.waMessage.count({ where: { direction: 'INBOUND' } }),
    prisma.waMessage.count({ where: { direction: 'OUTBOUND' } }),
    prisma.waMessage.count({
      where: { direction: 'OUTBOUND', status: { in: ['DELIVERED', 'READ'] } },
    }),
    prisma.waMessage.count({ where: { direction: 'OUTBOUND', status: 'READ' } }),
    prisma.waMessage.count({ where: { direction: 'OUTBOUND', status: 'FAILED' } }),
    prisma.waTemplate.groupBy({ by: ['status'], _count: true }),
    prisma.waCampaign.groupBy({ by: ['status'], _count: true }),
    prisma.waChannel.findFirst({ where: { isDefault: true } }),
  ]);

  const outboundDenom = msgOutbound || 1;
  const pct = (n: number) => Math.round((n / outboundDenom) * 100);

  return {
    contacts: { total: totalContacts, optedIn, optedOut, blocked },
    conversations: { total: totalConversations, open: openConversations },
    messages: {
      inbound: msgInbound,
      outbound: msgOutbound,
      delivered: msgDelivered,
      read: msgRead,
      failed: msgFailed,
      deliveryRate: pct(msgDelivered),
      readRate: pct(msgRead),
      failRate: pct(msgFailed),
    },
    templates: templatesByStatus.map((t) => ({ status: t.status, count: t._count })),
    campaigns: campaignsByStatus.map((c) => ({ status: c.status, count: c._count })),
    channel: channel
      ? {
          displayPhone: channel.displayPhone,
          qualityRating: channel.qualityRating,
          messagingTier: channel.messagingTier,
          isActive: channel.isActive,
        }
      : null,
    bridge: { enabled: isBridgeEnabled() },
  };
}

/** Clamp a requested day window to a sane, index-friendly range. */
function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 30;
  return Math.min(Math.max(Math.trunc(days), 1), 365);
}

export interface WaTimeSeriesPoint {
  date: string;
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}

/**
 * Daily message buckets for the last N days. One row per day (date_trunc), with
 * inbound / outbound / delivered / read / failed counts. Postgres-side aggregation
 * over an indexed createdAt; the window is a parameterized interval (injection-safe).
 */
export async function getTimeSeries(days = 30): Promise<WaTimeSeriesPoint[]> {
  const n = clampDays(days);
  const rows = await prisma.$queryRaw<
    {
      date: Date;
      inbound: bigint;
      outbound: bigint;
      delivered: bigint;
      read: bigint;
      failed: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      date_trunc('day', "createdAt") AS date,
      COUNT(*) FILTER (WHERE "direction" = 'INBOUND') AS inbound,
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND') AS outbound,
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" IN ('DELIVERED', 'READ')) AS delivered,
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'READ') AS read,
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'FAILED') AS failed
    FROM "WaMessage"
    WHERE "createdAt" >= date_trunc('day', now()) - make_interval(days => ${n})
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    inbound: Number(r.inbound),
    outbound: Number(r.outbound),
    delivered: Number(r.delivered),
    read: Number(r.read),
    failed: Number(r.failed),
  }));
}

export interface WaSlaMetrics {
  avgFirstResponseMins: number | null;
  avgResolutionMins: number | null;
  openCount: number;
  resolvedCount: number;
}

/**
 * Conversation SLA metrics: average first-response and resolution times (in
 * minutes) plus open / resolved counts. Time deltas are averaged in Postgres
 * via EPOCH extraction; nulls (no responses/resolutions yet) yield null.
 */
export async function getSlaMetrics(): Promise<WaSlaMetrics> {
  const [agg, openCount, resolvedCount] = await Promise.all([
    prisma.$queryRaw<{ first_response_secs: number | null; resolution_secs: number | null }[]>(
      Prisma.sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")))
            FILTER (WHERE "firstResponseAt" IS NOT NULL) AS first_response_secs,
          AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
            FILTER (WHERE "resolvedAt" IS NOT NULL) AS resolution_secs
        FROM "WaConversation"
      `
    ),
    prisma.waConversation.count({ where: { status: 'OPEN' } }),
    prisma.waConversation.count({ where: { status: 'RESOLVED' } }),
  ]);

  const row = agg[0] ?? { first_response_secs: null, resolution_secs: null };
  const toMins = (secs: number | null) =>
    secs === null || secs === undefined ? null : Math.round(Number(secs) / 60);

  return {
    avgFirstResponseMins: toMins(row.first_response_secs),
    avgResolutionMins: toMins(row.resolution_secs),
    openCount,
    resolvedCount,
  };
}

export interface WaAgentProductivity {
  userId: string;
  name: string;
  messagesSent: number;
  conversationsAssigned: number;
}

/**
 * Per-staff productivity: outbound messages sent (by sentByUserId) and
 * conversations assigned (by assignedTo), joined to User for display labels.
 * Returned for the union of staff ids that appear in either dimension.
 */
export async function getAgentProductivity(): Promise<WaAgentProductivity[]> {
  const [bySender, byAssignee] = await Promise.all([
    prisma.waMessage.groupBy({
      by: ['sentByUserId'],
      where: { direction: 'OUTBOUND', sentByUserId: { not: null } },
      _count: { _all: true },
    }),
    prisma.waConversation.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const messagesByUser = new Map<string, number>();
  for (const r of bySender) {
    if (r.sentByUserId) messagesByUser.set(r.sentByUserId, r._count._all);
  }
  const convosByUser = new Map<string, number>();
  for (const r of byAssignee) {
    if (r.assignedTo) convosByUser.set(r.assignedTo, r._count._all);
  }

  const userIds = Array.from(new Set([...messagesByUser.keys(), ...convosByUser.keys()])).slice(
    0,
    50
  );
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return userIds
    .map((id) => {
      const u = userById.get(id);
      const name =
        [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || 'Unknown';
      return {
        userId: id,
        name,
        messagesSent: messagesByUser.get(id) ?? 0,
        conversationsAssigned: convosByUser.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.messagesSent - a.messagesSent);
}

export interface WaCostSummary {
  totalActualCostPaise: number;
  totalEstimatedCostPaise: number;
  byCategory: Array<{ category: string; costPaise: number }>;
}

/**
 * Spend summary: actual billed cost (summed WaMessage.costPaise), estimated
 * campaign spend (summed WaCampaign.estimatedCostPaise), and actual cost broken
 * down by Meta pricing category.
 */
export async function getCostSummary(): Promise<WaCostSummary> {
  const [actualAgg, estimatedAgg, byCategory] = await Promise.all([
    prisma.waMessage.aggregate({ _sum: { costPaise: true } }),
    prisma.waCampaign.aggregate({ _sum: { estimatedCostPaise: true } }),
    prisma.waMessage.groupBy({
      by: ['pricingCategory'],
      where: { pricingCategory: { not: null }, costPaise: { not: null } },
      _sum: { costPaise: true },
    }),
  ]);

  return {
    totalActualCostPaise: actualAgg._sum.costPaise ?? 0,
    totalEstimatedCostPaise: estimatedAgg._sum.estimatedCostPaise ?? 0,
    byCategory: byCategory
      .map((c) => ({
        category: c.pricingCategory ?? 'unknown',
        costPaise: c._sum.costPaise ?? 0,
      }))
      .sort((a, b) => b.costPaise - a.costPaise),
  };
}

export interface WaOptOutPoint {
  date: string;
  count: number;
}

/**
 * Daily opt-out counts (WaContact.optOutAt) over the last N days. Window is a
 * parameterized interval (injection-safe); one row per day with at least one opt-out.
 */
export async function getOptOutTrend(days = 30): Promise<WaOptOutPoint[]> {
  const n = clampDays(days);
  const rows = await prisma.$queryRaw<{ date: Date; count: bigint }[]>(Prisma.sql`
    SELECT
      date_trunc('day', "optOutAt") AS date,
      COUNT(*) AS count
    FROM "WaContact"
    WHERE "optOutAt" IS NOT NULL
      AND "optOutAt" >= date_trunc('day', now()) - make_interval(days => ${n})
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    count: Number(r.count),
  }));
}

export interface WaHeatmapCell {
  dow: number; // 0 = Sunday … 6 = Saturday (Postgres EXTRACT(DOW))
  hour: number; // 0 … 23
  count: number;
}

/**
 * Message-volume heatmap: counts of messages bucketed by weekday (0-6) × hour
 * (0-23) over the last N days. Aggregated Postgres-side over an indexed
 * createdAt; window is a parameterized interval (injection-safe). Returns a flat
 * array of populated cells (empty buckets are omitted; the UI fills the grid).
 */
export async function getHourlyHeatmap(days = 30): Promise<WaHeatmapCell[]> {
  const n = clampDays(days);
  const rows = await prisma.$queryRaw<{ dow: number; hour: number; count: bigint }[]>(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM "createdAt")::int AS dow,
      EXTRACT(HOUR FROM "createdAt")::int AS hour,
      COUNT(*) AS count
    FROM "WaMessage"
    WHERE "createdAt" >= date_trunc('day', now()) - make_interval(days => ${n})
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);

  return rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.count),
  }));
}

export interface WaKeywordCount {
  word: string;
  count: number;
}

/**
 * Common stopwords dropped from the inbound-keyword breakdown. Kept small and
 * lowercased; includes generic English filler plus a few WhatsApp greetings.
 */
const KEYWORD_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'so',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'i',
  'me',
  'my',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'this',
  'that',
  'these',
  'those',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'shall',
  'may',
  'might',
  'must',
  'not',
  'no',
  'yes',
  'ok',
  'okay',
  'pls',
  'please',
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank',
  'thankyou',
  'from',
  'as',
  'about',
  'how',
  'what',
  'when',
  'where',
  'who',
  'why',
  'which',
  'there',
  'here',
]);

/**
 * Top words from recent INBOUND message text. Fetches the most recent inbound
 * texts (capped at a few thousand for bounded memory), tokenizes in JS, drops
 * short tokens / pure numbers / stopwords, and returns the top N by frequency.
 */
export async function getKeywordBreakdown(days = 30, limit = 20): Promise<WaKeywordCount[]> {
  const n = clampDays(days);
  const top = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const rows = await prisma.waMessage.findMany({
    where: { direction: 'INBOUND', text: { not: null }, createdAt: { gte: since } },
    select: { text: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.text) continue;
    for (const raw of row.text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      const token = raw.trim();
      if (token.length < 3) continue; // drop 1-2 char noise
      if (/^\d+$/.test(token)) continue; // drop pure numbers
      if (KEYWORD_STOPWORDS.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

export interface WaChannelHealthPoint {
  date: string;
  quality: string;
  tier: string | null;
}

/**
 * Channel-health snapshots (WaChannelHealthSnapshot) over the last N days, in
 * ascending time order — drives the quality-rating / messaging-tier history
 * chart. Window is a parameterized createdAt cutoff (injection-safe).
 */
export async function getChannelHealthHistory(days = 30): Promise<WaChannelHealthPoint[]> {
  const n = clampDays(days);
  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const rows = await prisma.waChannelHealthSnapshot.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, quality: true, tier: true },
  });

  return rows.map((r) => ({
    date: r.createdAt.toISOString(),
    quality: r.quality,
    tier: r.tier,
  }));
}

export interface WaCsatSummary {
  averageScore: number | null;
  ratedCount: number;
  distribution: Array<{ score: number; count: number }>;
}

/**
 * CSAT summary across conversations that carry a rating: average score, the
 * number of rated conversations, and a 1-5 distribution (every bucket present,
 * zero-filled). Reads only WaConversation rows where csatScore is set.
 */
export async function getCsatSummary(): Promise<WaCsatSummary> {
  const [agg, byScore] = await Promise.all([
    prisma.waConversation.aggregate({
      where: { csatScore: { not: null } },
      _avg: { csatScore: true },
      _count: { csatScore: true },
    }),
    prisma.waConversation.groupBy({
      by: ['csatScore'],
      where: { csatScore: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByScore = new Map<number, number>();
  for (const r of byScore) {
    if (r.csatScore != null) countByScore.set(r.csatScore, r._count._all);
  }

  const distribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: countByScore.get(score) ?? 0,
  }));

  const avg = agg._avg.csatScore;

  return {
    averageScore: avg == null ? null : Math.round(avg * 100) / 100,
    ratedCount: agg._count.csatScore,
    distribution,
  };
}
