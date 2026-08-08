import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { classifyUserAgent } from '../utils/email-ua';

/**
 * Read-only analytics over the email system: funnels, engagement rates, A/B
 * comparison, deliverability posture, an open heatmap, and top links. All
 * derived from the recipient table + EmailEvent (the source of truth).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface Range {
  from?: Date;
  to?: Date;
}

function resolveRange(range?: Range): { from: Date; to: Date } {
  const to = range?.to ?? new Date();
  const from = range?.from ?? new Date(to.getTime() - 30 * DAY_MS);
  return { from, to };
}

const rate = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 10000) / 100 : 0;

/** Guard an IANA timezone before it reaches raw SQL (Postgres throws on garbage). */
function safeTz(tz?: string): string {
  if (tz && /^[A-Za-z][A-Za-z0-9_+\-/]{1,63}$/.test(tz)) {
    try {
      // Validates the zone name via the runtime's tz database.
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
      return tz;
    } catch {
      /* fall through */
    }
  }
  return 'UTC';
}

/** Chronological YYYY-MM-DD day keys across [from,to] in the given timezone. */
function enumerateDays(from: Date, to: Date, tz: string): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const endKey = fmt.format(to);
  const keys: string[] = [];
  const seen = new Set<string>();
  // Step every 12h so a DST transition can never skip a calendar day.
  for (let t = from.getTime(); t <= to.getTime() + DAY_MS; t += DAY_MS / 2) {
    const k = fmt.format(new Date(t));
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    if (k >= endKey && t >= to.getTime()) break;
  }
  return keys.sort();
}

/**
 * System-wide overview scoped by ACTIVITY in [from,to] (not campaign creation
 * date): sends/deliveries/opens/clicks come from per-recipient timestamps, and
 * bounces/complaints/unsubscribes from the event log — so the range picker means
 * "what happened in this window". Opens/clicks are unique (per recipient).
 */
export async function overview(range?: Range) {
  const { from, to } = resolveRange(range);
  const win = { gte: from, lte: to };
  const [
    sent,
    delivered,
    opened,
    clicked,
    failed,
    evGroups,
    machineOpens,
    campaigns,
    contacts,
    suppressed,
    templates,
  ] = await Promise.all([
    prisma.emailCampaignRecipient.count({ where: { isSeed: false, sentAt: win } }),
    prisma.emailCampaignRecipient.count({ where: { isSeed: false, deliveredAt: win } }),
    prisma.emailCampaignRecipient.count({ where: { isSeed: false, openedAt: win } }),
    prisma.emailCampaignRecipient.count({ where: { isSeed: false, clickedAt: win } }),
    prisma.emailCampaignRecipient.count({
      where: { isSeed: false, status: 'FAILED', campaign: { createdAt: win } },
    }),
    prisma.emailEvent.groupBy({
      by: ['eventType'],
      where: { createdAt: win, eventType: { in: ['BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE'] } },
      _count: { _all: true },
    }),
    prisma.emailEvent.count({ where: { eventType: 'OPEN', machineOpen: true, createdAt: win } }),
    prisma.emailCampaign.count(),
    prisma.emailContact.count(),
    prisma.emailSuppression.count(),
    prisma.emailTemplate.count(),
  ]);
  const ev: Record<string, number> = {};
  for (const g of evGroups) ev[g.eventType] = g._count._all;
  const bounced = ev.BOUNCE ?? 0;
  const complained = ev.COMPLAINT ?? 0;
  const unsubscribed = ev.UNSUBSCRIBE ?? 0;

  return {
    totals: { sent, delivered, opened, clicked, bounced, complained, unsubscribed, failed },
    rates: {
      delivery: rate(delivered, sent),
      open: rate(opened, delivered || sent),
      click: rate(clicked, delivered || sent),
      clickToOpen: rate(clicked, opened),
      bounce: rate(bounced, sent),
      complaint: rate(complained, sent),
      unsubscribe: rate(unsubscribed, delivered || sent),
    },
    counts: { campaigns, contacts, suppressed, templates },
    // Opens from prefetch/proxy UAs — recorded but excluded from engagement metrics.
    machineOpens,
  };
}

/**
 * Zero-filled daily series in the admin's timezone: send/deliver volume (from
 * recipient timestamps) alongside engagement events (machine opens excluded).
 * Every day in [from,to] is present so the chart never draws across gaps.
 */
export async function timeseries(range?: Range, tz?: string) {
  const { from, to } = resolveRange(range);
  const zone = safeTz(tz);

  const [evRows, sentRows, delivRows] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; eventtype: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day,
             "eventType"::text AS eventtype, count(*)::int AS count
      FROM "EmailEvent"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        AND NOT ("eventType" = 'OPEN' AND "machineOpen" = true)
      GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "sentAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "EmailCampaignRecipient"
      WHERE "sentAt" >= ${from} AND "sentAt" <= ${to} AND "isSeed" = false
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "deliveredAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "EmailCampaignRecipient"
      WHERE "deliveredAt" >= ${from} AND "deliveredAt" <= ${to} AND "isSeed" = false
      GROUP BY 1`,
  ]);

  const byDay: Record<string, Record<string, number>> = {};
  for (const r of evRows) (byDay[r.day] ??= {})[r.eventtype.toLowerCase()] = Number(r.count);
  for (const r of sentRows) (byDay[r.day] ??= {}).sent = Number(r.count);
  for (const r of delivRows) (byDay[r.day] ??= {}).delivered = Number(r.count);

  return enumerateDays(from, to, zone).map((date) => {
    const ev = byDay[date] ?? {};
    return {
      date,
      sent: ev.sent ?? 0,
      delivered: ev.delivered ?? 0,
      open: ev.open ?? 0,
      click: ev.click ?? 0,
      bounce: ev.bounce ?? 0,
      complaint: ev.complaint ?? 0,
      unsubscribe: ev.unsubscribe ?? 0,
    };
  });
}

/** Per-campaign funnel + rates + A/B variants + tracked links + status breakdown. */
export async function campaignAnalytics(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  const [statusGroups, variants, links, bounceTypeGroups] = await Promise.all([
    prisma.emailCampaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    }),
    prisma.emailCampaignVariant.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
    prisma.emailLink.findMany({ where: { campaignId }, orderBy: { clickCount: 'desc' }, take: 25 }),
    prisma.emailCampaignRecipient.groupBy({
      by: ['bounceType'],
      where: { campaignId, bouncedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count._all;
  const bounceSplit = { hard: 0, soft: 0 };
  for (const g of bounceTypeGroups) {
    if (g.bounceType === 'soft') bounceSplit.soft = g._count._all;
    else bounceSplit.hard += g._count._all;
  }

  const sent = campaign.sentCount;
  const delivered = campaign.deliveredCount;
  return {
    campaign,
    funnel: {
      total: campaign.totalRecipients,
      sent,
      delivered,
      opened: campaign.openedCount,
      clicked: campaign.clickedCount,
      replied: campaign.repliedCount,
      bounced: campaign.bouncedCount,
      complained: campaign.complainedCount,
      unsubscribed: campaign.unsubscribedCount,
      failed: campaign.failedCount,
      skipped: campaign.skippedCount,
    },
    rates: {
      delivery: rate(delivered, sent),
      open: rate(campaign.openedCount, delivered || sent),
      click: rate(campaign.clickedCount, delivered || sent),
      clickToOpen: rate(campaign.clickedCount, campaign.openedCount),
      bounce: rate(campaign.bouncedCount, sent),
      complaint: rate(campaign.complainedCount, sent),
      unsubscribe: rate(campaign.unsubscribedCount, delivered || sent),
    },
    bounceSplit,
    byStatus,
    variants: variants.map((v) => ({
      id: v.id,
      label: v.label,
      sent: v.sentCount,
      opened: v.openedCount,
      clicked: v.clickedCount,
      bounced: v.bouncedCount,
      openRate: rate(v.openedCount, v.sentCount),
      clickRate: rate(v.clickedCount, v.sentCount),
    })),
    links: links.map((l) => ({ id: l.id, url: l.targetUrl, label: l.label, clicks: l.clickCount })),
  };
}

/** Deliverability posture: sender DNS health + bounce/complaint + suppression mix. */
export async function deliverability(range?: Range) {
  const { from, to } = resolveRange(range);
  const [senders, suppressionGroups, agg] = await Promise.all([
    prisma.emailSender.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }),
    prisma.emailSuppression.groupBy({ by: ['reason'], _count: { _all: true } }),
    prisma.emailCampaign.aggregate({
      _sum: { sentCount: true, bouncedCount: true, complainedCount: true },
      where: { createdAt: { gte: from, lte: to } },
    }),
  ]);
  const sent = agg._sum.sentCount ?? 0;
  const suppressionByReason: Record<string, number> = {};
  for (const g of suppressionGroups) suppressionByReason[g.reason ?? 'unknown'] = g._count._all;

  return {
    senders: senders.map((s) => ({
      id: s.id,
      fromEmail: s.fromEmail,
      fromName: s.fromName,
      domain: s.domain,
      dkimVerified: s.dkimVerified,
      spfVerified: s.spfVerified,
      dmarcVerified: s.dmarcVerified,
      mtaStsVerified: s.mtaStsVerified,
      tlsRptVerified: s.tlsRptVerified,
      reputationScore: s.reputationScore,
      isDefault: s.isDefault,
      isActive: s.isActive,
      lastVerifiedAt: s.lastVerifiedAt,
    })),
    rates: {
      bounce: rate(agg._sum.bouncedCount ?? 0, sent),
      complaint: rate(agg._sum.complainedCount ?? 0, sent),
    },
    suppression: {
      total: Object.values(suppressionByReason).reduce((a, b) => a + b, 0),
      byReason: suppressionByReason,
    },
  };
}

/** Opens by weekday × hour (in the admin's timezone) for the send-timing heatmap. */
export async function openHeatmap(range?: Range, tz?: string) {
  const { from, to } = resolveRange(range);
  const zone = safeTz(tz);
  const rows = await prisma.$queryRaw<Array<{ dow: number; hour: number; count: number }>>`
    SELECT extract(dow from ("createdAt" AT TIME ZONE ${zone}))::int AS dow,
           extract(hour from ("createdAt" AT TIME ZONE ${zone}))::int AS hour,
           count(*)::int AS count
    FROM "EmailEvent"
    WHERE "eventType" = 'OPEN' AND "machineOpen" = false AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY 1, 2`;
  // 7×24 matrix (row 0 = Sunday).
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) matrix[Number(r.dow)][Number(r.hour)] = Number(r.count);
  return { matrix, tz: zone };
}

/** Top clicked links in the window, with total + unique (per-recipient) clicks. */
export async function topLinks(range?: Range, limit = 20) {
  const { from, to } = resolveRange(range);
  const rows = await prisma.$queryRaw<
    Array<{ url: string; clicks: number; unique_clicks: number }>
  >`
    SELECT "url" AS url, count(*)::int AS clicks, count(DISTINCT "recipientId")::int AS unique_clicks
    FROM "EmailEvent"
    WHERE "eventType" = 'CLICK' AND "url" IS NOT NULL AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY 1
    ORDER BY clicks DESC
    LIMIT ${limit}`;
  const urls = rows.map((r) => r.url);
  const links = urls.length
    ? await prisma.emailLink.findMany({
        where: { targetUrl: { in: urls } },
        select: { id: true, targetUrl: true, label: true, campaignId: true },
      })
    : [];
  const byUrl = new Map(links.map((l) => [l.targetUrl, l]));
  return rows.map((r) => {
    const l = byUrl.get(r.url);
    return {
      id: l?.id ?? r.url,
      url: r.url,
      label: l?.label ?? null,
      campaignId: l?.campaignId ?? null,
      clicks: Number(r.clicks),
      uniqueClicks: Number(r.unique_clicks),
    };
  });
}

/** Deliverability drill-down: individual bounce/complaint events (who + why). */
export async function bounceComplaintEvents(opts: {
  campaignId?: string;
  type?: 'BOUNCE' | 'COMPLAINT';
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, opts.limit ?? 50);
  const where: Prisma.EmailEventWhereInput = {
    eventType: opts.type ?? { in: ['BOUNCE', 'COMPLAINT'] },
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
  };
  const [events, total] = await Promise.all([
    prisma.emailEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventType: true,
        campaignId: true,
        contactId: true,
        bounceType: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.emailEvent.count({ where }),
  ]);
  const contactIds = [...new Set(events.map((e) => e.contactId).filter(Boolean) as string[])];
  const contacts = contactIds.length
    ? await prisma.emailContact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(contacts.map((c) => [c.id, c.email]));
  return {
    items: events.map((e) => ({
      ...e,
      email: e.contactId ? (emailById.get(e.contactId) ?? null) : null,
    })),
    total,
    page,
    limit,
  };
}

/** Raw event feed (open/click/bounce/complaint/unsubscribe) — a read API for external consumers. */
export async function listEvents(opts: {
  eventType?: string;
  campaignId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(500, opts.limit ?? 100);
  const where: Prisma.EmailEventWhereInput = {
    ...(opts.eventType
      ? { eventType: opts.eventType as Prisma.EmailEventWhereInput['eventType'] }
      : {}),
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.emailEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailEvent.count({ where }),
  ]);
  return { items, total, page, limit };
}

/** Side-by-side comparison of several campaigns' headline rates. */
export async function compareCampaigns(ids: string[]) {
  const wanted = ids.slice(0, 10);
  const campaigns = await prisma.emailCampaign.findMany({
    where: { id: { in: wanted } },
    select: {
      id: true,
      name: true,
      sentCount: true,
      deliveredCount: true,
      openedCount: true,
      clickedCount: true,
      bouncedCount: true,
      complainedCount: true,
      unsubscribedCount: true,
    },
  });
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  // Preserve the caller's selection order; silently drop unknown ids.
  return wanted
    .map((id) => byId.get(id))
    .filter((c): c is (typeof campaigns)[number] => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      sent: c.sentCount,
      deliveryRate: rate(c.deliveredCount, c.sentCount),
      openRate: rate(c.openedCount, c.deliveredCount || c.sentCount),
      clickRate: rate(c.clickedCount, c.deliveredCount || c.sentCount),
      clickToOpenRate: rate(c.clickedCount, c.openedCount),
      bounceRate: rate(c.bouncedCount, c.sentCount),
      complaintRate: rate(c.complainedCount, c.sentCount),
      unsubscribeRate: rate(c.unsubscribedCount, c.deliveredCount || c.sentCount),
    }));
}

/** Open/click client (mailbox provider / browser) + device split, from userAgent. */
export async function clientBreakdown(range?: Range) {
  const { from, to } = resolveRange(range);
  const rows = await prisma.$queryRaw<Array<{ ua: string; et: string; count: number }>>`
    SELECT "userAgent" AS ua, "eventType"::text AS et, count(*)::int AS count
    FROM "EmailEvent"
    WHERE "eventType" IN ('OPEN', 'CLICK') AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      AND "userAgent" IS NOT NULL AND "userAgent" <> ''
    GROUP BY 1, 2`;
  const clients: Record<string, number> = {};
  const devices: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.count);
    total += n;
    const { client, device } = classifyUserAgent(r.ua);
    clients[client] = (clients[client] ?? 0) + n;
    // Device is only meaningful for real clicks (opens are proxied).
    if (r.et === 'CLICK') devices[device] = (devices[device] ?? 0) + n;
  }
  const toSorted = (rec: Record<string, number>) =>
    Object.entries(rec)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  return { clients: toSorted(clients), devices: toSorted(devices), total };
}

/** Per recipient-domain (mailbox provider) send/engagement/bounce breakdown. */
export async function domainBreakdown(range?: Range, limit = 15) {
  const { from, to } = resolveRange(range);
  const rows = await prisma.$queryRaw<
    Array<{
      domain: string;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
    }>
  >`
    SELECT lower(split_part("email", '@', 2)) AS domain,
           count(*)::int AS sent,
           count("deliveredAt")::int AS delivered,
           count("openedAt")::int AS opened,
           count("clickedAt")::int AS clicked,
           count("bounceType")::int AS bounced
    FROM "EmailCampaignRecipient"
    WHERE "sentAt" >= ${from} AND "sentAt" <= ${to} AND "isSeed" = false AND "email" LIKE '%@%'
    GROUP BY 1
    ORDER BY sent DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    domain: r.domain,
    sent: Number(r.sent),
    delivered: Number(r.delivered),
    opened: Number(r.opened),
    clicked: Number(r.clicked),
    bounced: Number(r.bounced),
    openRate: rate(Number(r.opened), Number(r.delivered) || Number(r.sent)),
    clickRate: rate(Number(r.clicked), Number(r.delivered) || Number(r.sent)),
    bounceRate: rate(Number(r.bounced), Number(r.sent)),
  }));
}

/** Most-engaged contacts (lifetime opens + clicks) + a never-engaged count. */
export async function engagementLeaderboard(limit = 20) {
  const rows = await prisma.$queryRaw<
    Array<{ contactid: string; opens: number; clicks: number; campaigns: number }>
  >`
    SELECT "contactId" AS contactid, sum("openCount")::int AS opens, sum("clickCount")::int AS clicks, count(*)::int AS campaigns
    FROM "EmailCampaignRecipient"
    WHERE "isSeed" = false AND "contactId" IS NOT NULL
    GROUP BY 1
    ORDER BY (sum("openCount") + sum("clickCount")) DESC
    LIMIT ${limit}`;
  const neverRows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM (
      SELECT "contactId" FROM "EmailCampaignRecipient"
      WHERE "isSeed" = false AND "contactId" IS NOT NULL AND "sentAt" IS NOT NULL
      GROUP BY "contactId"
      HAVING sum("openCount") + sum("clickCount") = 0
    ) x`;
  const ids = rows.map((r) => r.contactid);
  const contacts = ids.length
    ? await prisma.emailContact.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return {
    top: rows.map((r) => ({
      contactId: r.contactid,
      email: byId.get(r.contactid)?.email ?? null,
      name: byId.get(r.contactid)?.name ?? null,
      opens: Number(r.opens),
      clicks: Number(r.clicks),
      campaigns: Number(r.campaigns),
    })),
    neverEngaged: Number(neverRows[0]?.count ?? 0),
  };
}

/** Daily list growth: new contacts vs unsubscribes (zero-filled, tz-aware). */
export async function listGrowth(range?: Range, tz?: string) {
  const { from, to } = resolveRange(range);
  const zone = safeTz(tz);
  const [addedRows, unsubRows] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "EmailContact"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "EmailUnsubscribe"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1`,
  ]);
  const added: Record<string, number> = {};
  const unsub: Record<string, number> = {};
  for (const r of addedRows) added[r.day] = Number(r.count);
  for (const r of unsubRows) unsub[r.day] = Number(r.count);
  return enumerateDays(from, to, zone).map((date) => {
    const a = added[date] ?? 0;
    const u = unsub[date] ?? 0;
    return { date, added: a, unsubscribed: u, net: a - u };
  });
}

const BOUNCE_CATEGORIES: { name: string; re: RegExp }[] = [
  {
    name: 'Invalid recipient',
    re: /no such user|user unknown|does not exist|invalid recipient|unknown user|550.*5\.1\.1|recipient.*not found|no mailbox/i,
  },
  {
    name: 'Mailbox full',
    re: /mailbox full|over quota|quota exceeded|insufficient storage|452.*4\.2\.2/i,
  },
  {
    name: 'Blocked / spam',
    re: /spam|blocked|blacklist|denylist|reputation|policy|rejected due|554|access denied|not allowed/i,
  },
  { name: 'Message too large', re: /too large|message size|552.*5\.3\.4|exceeds.*size/i },
  {
    name: 'Temporary / greylisted',
    re: /greylist|try again|temporar|deferred|timed out|connection|4\.\d\.\d/i,
  },
  { name: 'Domain error', re: /domain.*not found|no mx|dns|nxdomain|host unknown/i },
];

function categorizeBounce(reason: string | null): string {
  if (!reason) return 'Other';
  return BOUNCE_CATEGORIES.find((c) => c.re.test(reason))?.name ?? 'Other';
}

/** Categorized bounce reasons + hard/soft split for deliverability triage. */
export async function bounceReasons(range?: Range) {
  const { from, to } = resolveRange(range);
  const rows = await prisma.$queryRaw<
    Array<{ bouncetype: string | null; reason: string | null; count: number }>
  >`
    SELECT "bounceType" AS bouncetype, "reason" AS reason, count(*)::int AS count
    FROM "EmailEvent"
    WHERE "eventType" = 'BOUNCE' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY 1, 2`;
  const categories: Record<string, number> = {};
  const split = { hard: 0, soft: 0 };
  let total = 0;
  for (const r of rows) {
    const n = Number(r.count);
    total += n;
    categories[categorizeBounce(r.reason)] = (categories[categorizeBounce(r.reason)] ?? 0) + n;
    if (r.bouncetype === 'soft') split.soft += n;
    else split.hard += n;
  }
  return {
    total,
    split,
    categories: Object.entries(categories)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Export the overview + daily time-series as a CSV report. */
export async function overviewCsv(range?: Range): Promise<string> {
  const [ov, ts] = await Promise.all([overview(range), timeseries(range)]);
  const head = [
    'Metric,Value',
    `Sent,${ov.totals.sent}`,
    `Delivered,${ov.totals.delivered}`,
    `Opened,${ov.totals.opened}`,
    `Clicked,${ov.totals.clicked}`,
    `Bounced,${ov.totals.bounced}`,
    `Complained,${ov.totals.complained}`,
    `Unsubscribed,${ov.totals.unsubscribed}`,
    `Delivery rate %,${ov.rates.delivery}`,
    `Open rate %,${ov.rates.open}`,
    `Click rate %,${ov.rates.click}`,
    `Bounce rate %,${ov.rates.bounce}`,
    `Complaint rate %,${ov.rates.complaint}`,
    `Unsubscribe rate %,${ov.rates.unsubscribe}`,
    '',
    'Date,Sent,Delivered,Opens,Clicks,Bounces,Complaints,Unsubscribes',
    ...ts.map(
      (r) =>
        `${r.date},${r.sent},${r.delivered},${r.open},${r.click},${r.bounce},${r.complaint},${r.unsubscribe}`
    ),
  ];
  return head.join('\n');
}
