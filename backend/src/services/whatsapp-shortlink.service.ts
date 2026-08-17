import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { env } from '../config/env';
import { dayMarkerBefore, reportingTz, todayInTz } from './whatsapp-reporting-tz';
import type { WaShortLink } from '@prisma/client';

/** Number of base36 characters in a generated short-link code. */
const CODE_LENGTH = 8;

/**
 * Generate a short, URL-safe code from cryptographically strong randomness
 * (NEVER Math.random). We pull a few extra random bytes and base36-encode them,
 * then slice to a fixed length so the code is compact and unguessable.
 */
function generateCode(): string {
  // 6 bytes -> a comfortably-large base36 string; slice to CODE_LENGTH chars.
  return BigInt('0x' + crypto.randomBytes(6).toString('hex'))
    .toString(36)
    .padStart(CODE_LENGTH, '0')
    .slice(0, CODE_LENGTH);
}

/**
 * Per-recipient tracking token.
 *
 * A campaign embeds ONE short code for every recipient, so a click told us that
 * somebody clicked and nothing else: no click→conversion funnel, no retargeting
 * of clickers, no per-variant CTR. Minting a code per recipient would multiply
 * the link table by the audience size; a signed suffix costs nothing and carries
 * the same information.
 *
 * Format: `<base64url(contactId)>.<10 hex chars of HMAC-SHA256(linkId:contactId)>`.
 * The signature is what stops a visitor from editing `?r=` and attributing their
 * click to somebody else's contact record — an unsigned id would make the whole
 * attribution table user-controlled.
 *
 * Keyed off CSRF_SECRET with an explicit domain-separation label rather than a
 * new env var: it is already required (min 32 chars) on every deployment, and a
 * label means this signature can never be confused with a CSRF token.
 */
const RECIPIENT_TOKEN_LABEL = 'wa-shortlink-recipient-v1';

function recipientTokenKey(): Buffer {
  return crypto.createHmac('sha256', env.CSRF_SECRET).update(RECIPIENT_TOKEN_LABEL).digest();
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** Signed `?r=` value binding one recipient to one short link. */
export function recipientToken(linkId: string, contactId: string): string {
  const sig = crypto
    .createHmac('sha256', recipientTokenKey())
    .update(`${linkId}:${contactId}`)
    .digest('hex')
    .slice(0, 10);
  return `${b64url(contactId)}.${sig}`;
}

/**
 * Recover the contact id from a `?r=` token, or null when it is absent,
 * malformed or not signed for THIS link. Never throws — a bad token must
 * degrade to an anonymous click, not a broken redirect.
 */
export function resolveRecipientToken(linkId: string, token?: string | null): string | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  let contactId: string;
  try {
    contactId = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!contactId) return null;
  const expected = recipientToken(linkId, contactId);
  // Length-equal by construction, but compare in constant time anyway.
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return contactId;
}

/**
 * Absolute URL a short code resolves to.
 *
 * Built HERE rather than in the browser. The UI previously assembled
 * `${window.location.origin}/l/${code}`, which on a split deploy is the Vercel
 * FRONTEND origin — a host with no `/l/` route, whose middleware then bounces
 * the visitor to /unlock. Every campaign link was dead and every click metric
 * read zero while looking correctly wired.
 *
 * PUBLIC_SHORT_LINK_BASE pins it explicitly; otherwise the caller passes the
 * origin of the request that reached this service, which is right whenever the
 * API is reachable on the same host that serves `/l/:code`.
 */
export function shortLinkUrl(
  code: string,
  requestOrigin?: string | null,
  /** Signed `?r=` token binding the URL to one recipient (see recipientToken). */
  token?: string | null
): string {
  let base = env.PUBLIC_SHORT_LINK_BASE || requestOrigin || '';
  while (base.endsWith('/')) base = base.slice(0, -1);
  const suffix = token ? `?r=${token}` : '';
  return base ? `${base}/l/${code}${suffix}` : `/l/${code}${suffix}`;
}

/**
 * Create a trackable short link. Retries on the (astronomically rare) unique
 * code collision so a caller never sees a spurious P2002.
 */
export async function createShortLink(input: {
  targetUrl: string;
  campaignId?: string | null;
  createdBy?: string | null;
}): Promise<WaShortLink> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.waShortLink.create({
        data: {
          code: generateCode(),
          targetUrl: input.targetUrl,
          campaignId: input.campaignId ?? null,
          createdBy: input.createdBy ?? null,
        },
      });
    } catch (err) {
      // P2002 = unique code collision; regenerate and retry. Anything else throws.
      if ((err as { code?: string })?.code === 'P2002') continue;
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique short-link code');
}

/**
 * Record a click on a short link and return its target URL for redirect, or
 * null when the code is unknown. Best-effort: a write failure (e.g. the click
 * row) never blocks the redirect, and this never throws.
 */
export async function recordClick(
  code: string,
  meta: {
    contactId?: string | null;
    /** Raw `?r=` query value; resolved + signature-checked against THIS link. */
    recipientToken?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<string | null> {
  try {
    const link = await prisma.waShortLink.findUnique({ where: { code } });
    if (!link) return null;
    // Resolved AFTER the lookup because the signature is bound to the link id —
    // a token minted for one campaign link cannot attribute a click on another.
    const contactId = meta.contactId ?? resolveRecipientToken(link.id, meta.recipientToken);
    await prisma.$transaction([
      prisma.waLinkClick.create({
        data: {
          shortLinkId: link.id,
          contactId,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      }),
      prisma.waShortLink.update({
        where: { id: link.id },
        data: { clickCount: { increment: 1 } },
      }),
      // Stamp the click onto the campaign recipient too, so "who clicked" is
      // answerable from the recipient list itself rather than only from an
      // aggregate over WaLinkClick — which the retention prune eventually
      // deletes, taking the per-person answer with it. `clickedAt: null` keeps
      // it FIRST-click: a recipient who opens the link five times is one clicker
      // with one timestamp, not a moving one.
      ...(contactId && link.campaignId
        ? [
            prisma.waCampaignRecipient.updateMany({
              where: { campaignId: link.campaignId, contactId, clickedAt: null },
              data: { clickedAt: new Date() },
            }),
          ]
        : []),
    ]);
    return link.targetUrl;
  } catch (err) {
    logger.warn(`WhatsApp short-link click record failed for ${code}: ${(err as Error).message}`);
    // Try to still resolve the target so the redirect works even if logging failed.
    const link = await prisma.waShortLink.findUnique({ where: { code } }).catch(() => null);
    return link?.targetUrl ?? null;
  }
}

/** All short links for a campaign with their click counts (CTR analytics). */
export async function getCampaignLinkStats(campaignId: string): Promise<WaShortLink[]> {
  return prisma.waShortLink.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
}
/**
 * Code → link id for every short link on a campaign.
 *
 * Loaded once per send batch so the worker can rewrite `/l/<code>` into
 * `/l/<code>?r=<token>` for the recipient it is about to message.
 */
export async function getCampaignLinkCodes(campaignId: string): Promise<Map<string, string>> {
  const links = await prisma.waShortLink.findMany({
    where: { campaignId },
    select: { id: true, code: true },
  });
  return new Map(links.map((l) => [l.code, l.id]));
}

/** Matches `/l/<code>` inside an arbitrary template parameter value. */
const SHORT_LINK_IN_TEXT = /\/l\/([0-9a-z]{4,16})/gi;

/**
 * Rewrite every campaign short link inside `value` to carry this recipient's
 * signed token. Values with no campaign short link are returned untouched, so
 * this is safe to run over every template parameter.
 */
export function appendRecipientToken(
  value: string,
  contactId: string,
  codes: Map<string, string>
): string {
  if (!value || codes.size === 0) return value;
  return value.replace(SHORT_LINK_IN_TEXT, (match, code: string) => {
    const linkId = codes.get(code);
    if (!linkId) return match;
    return `${match}?r=${recipientToken(linkId, contactId)}`;
  });
}

export interface WaCampaignLinkStat {
  id: string;
  code: string;
  targetUrl: string;
  clickCount: number;
  /** Clicks we could attribute to a contact (i.e. carried a valid `?r=`). */
  uniqueClickers: number;
  /** uniqueClickers / campaign deliveredCount, as a percentage (0 when unknown). */
  ctr: number;
  createdAt: Date;
}

export interface WaCampaignClickStats {
  totalClicks: number;
  /** Distinct contacts across every link on the campaign. */
  uniqueClickers: number;
  /** Denominator the CTRs are computed against (campaign deliveredCount). */
  delivered: number;
  ctr: number;
  /** Clickers who went on to convert, inside CLICK_ATTRIBUTION_WINDOW_MS. */
  convertedClickers: number;
  /** convertedClickers / uniqueClickers, as a percentage. */
  clickToConversionRate: number;
  links: WaCampaignLinkStat[];
}

/**
 * How long after a click a conversion can still be credited to it.
 *
 * 7 days: a click is an intent signal, and a purchase later that week is
 * plausibly the same journey, but an order next month is not. Bounded here
 * rather than left open-ended so the funnel cannot slowly credit itself with
 * everything a contact ever does.
 */
const CLICK_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Click-through for one campaign: totals, unique clickers and a per-link CTR
 * against what the campaign actually delivered.
 *
 * `clickCount` is a lifetime counter on the link and survives the retention
 * prune; unique clickers are counted from WaLinkClick rows, which do not — so on
 * a campaign older than the click TTL the unique figure decays toward zero while
 * the raw count stands. That is why both are returned rather than only a rate.
 */
export async function getCampaignClickStats(campaignId: string): Promise<WaCampaignClickStats> {
  const [links, campaign] = await Promise.all([
    prisma.waShortLink.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
    prisma.waCampaign.findUnique({
      where: { id: campaignId },
      select: { deliveredCount: true },
    }),
  ]);
  const delivered = campaign?.deliveredCount ?? 0;
  const pct = (n: number) => (delivered > 0 ? Math.round((n / delivered) * 1000) / 10 : 0);

  const linkIds = links.map((l) => l.id);
  // Unique CONTACTS per link. groupBy on (shortLinkId, contactId) then counting
  // the groups is the only way Prisma can express COUNT(DISTINCT contactId)
  // without dropping to raw SQL; anonymous clicks (contactId null) are excluded
  // by the filter so they cannot each look like a separate person.
  const groups = linkIds.length
    ? await prisma.waLinkClick.groupBy({
        by: ['shortLinkId', 'contactId'],
        where: { shortLinkId: { in: linkIds }, contactId: { not: null } },
      })
    : [];
  const uniqueByLink = new Map<string, number>();
  const allContacts = new Set<string>();
  for (const g of groups) {
    uniqueByLink.set(g.shortLinkId, (uniqueByLink.get(g.shortLinkId) ?? 0) + 1);
    if (g.contactId) allContacts.add(g.contactId);
  }

  // Click → conversion. This is the half of attribution the contactId column was
  // added for: knowing HOW MANY clicked is a vanity metric next to knowing how
  // many of those people then bought.
  const convertedClickers = await countConvertedClickers(campaignId, [...allContacts]);

  return {
    totalClicks: links.reduce((s, l) => s + l.clickCount, 0),
    uniqueClickers: allContacts.size,
    delivered,
    ctr: pct(allContacts.size),
    convertedClickers,
    clickToConversionRate:
      allContacts.size > 0 ? Math.round((convertedClickers / allContacts.size) * 1000) / 10 : 0,
    links: links.map((l) => {
      const unique = uniqueByLink.get(l.id) ?? 0;
      return {
        id: l.id,
        code: l.code,
        targetUrl: l.targetUrl,
        clickCount: l.clickCount,
        uniqueClickers: unique,
        ctr: pct(unique),
        createdAt: l.createdAt,
      };
    }),
  };
}

/**
 * Distinct clickers who recorded a conversion within the attribution window of
 * their FIRST click on one of this campaign's links.
 */
async function countConvertedClickers(campaignId: string, contactIds: string[]): Promise<number> {
  if (contactIds.length === 0) return 0;
  const links = await prisma.waShortLink.findMany({
    where: { campaignId },
    select: { id: true },
  });
  if (links.length === 0) return 0;
  const linkIds = links.map((l) => l.id);

  // First click per contact — groupBy with a MIN, so this stays one query
  // regardless of how many times each person clicked.
  const firstClicks = await prisma.waLinkClick.groupBy({
    by: ['contactId'],
    where: { shortLinkId: { in: linkIds }, contactId: { in: contactIds } },
    _min: { createdAt: true },
  });
  const firstClickAt = new Map<string, Date>();
  for (const c of firstClicks) {
    if (c.contactId && c._min.createdAt) firstClickAt.set(c.contactId, c._min.createdAt);
  }

  const conversions = await prisma.waConversion.findMany({
    where: { contactId: { in: contactIds } },
    select: { contactId: true, occurredAt: true, createdAt: true },
  });
  const converted = new Set<string>();
  for (const conv of conversions) {
    if (!conv.contactId) continue;
    const clickedAt = firstClickAt.get(conv.contactId);
    if (!clickedAt) continue;
    // occurredAt is when it actually happened; createdAt is when we heard about
    // it (a nightly CRM export posts yesterday's orders), so the former wins.
    const at = conv.occurredAt ?? conv.createdAt;
    const delta = at.getTime() - clickedAt.getTime();
    if (delta >= 0 && delta <= CLICK_ATTRIBUTION_WINDOW_MS) converted.add(conv.contactId);
  }
  return converted.size;
}

export interface WaVariantClickStat {
  variantId: string;
  clicks: number;
  uniqueClickers: number;
}

/**
 * Clicks per A/B variant, joined through WaCampaignRecipient.
 *
 * WaLinkClick knows the contact (via the recipient token) and the recipient row
 * knows which variant that contact was sent — without the join there is no way
 * to say which creative earned the click, which is the entire point of running
 * the test.
 */
export async function getCampaignVariantClicks(campaignId: string): Promise<WaVariantClickStat[]> {
  const links = await prisma.waShortLink.findMany({
    where: { campaignId },
    select: { id: true },
  });
  if (links.length === 0) return [];
  const clicks = await prisma.waLinkClick.findMany({
    where: { shortLinkId: { in: links.map((l) => l.id) }, contactId: { not: null } },
    select: { contactId: true },
  });
  if (clicks.length === 0) return [];

  const contactIds = [...new Set(clicks.map((c) => c.contactId as string))];
  const recipients = await prisma.waCampaignRecipient.findMany({
    where: { campaignId, contactId: { in: contactIds }, variantId: { not: null } },
    select: { contactId: true, variantId: true },
  });
  const variantByContact = new Map(recipients.map((r) => [r.contactId, r.variantId as string]));

  const totals = new Map<string, { clicks: number; uniques: Set<string> }>();
  for (const c of clicks) {
    const variantId = variantByContact.get(c.contactId as string);
    if (!variantId) continue;
    const row = totals.get(variantId) ?? { clicks: 0, uniques: new Set<string>() };
    row.clicks += 1;
    row.uniques.add(c.contactId as string);
    totals.set(variantId, row);
  }
  return [...totals.entries()].map(([variantId, v]) => ({
    variantId,
    clicks: v.clicks,
    uniqueClickers: v.uniques.size,
  }));
}

/**
 * How long raw WaLinkClick rows (which carry IP + user agent) are kept before
 * the nightly retention prune deletes them. Lives here rather than with the
 * other TTLs in the cron worker because the click series has to know exactly how
 * far back the raw rows can still be trusted.
 */
export const LINK_CLICK_TTL_DAYS = 180;

export interface WaClickPoint {
  date: string;
  clicks: number;
  uniqueClickers: number;
}

/**
 * How many days back the raw WaLinkClick rows are treated as the authoritative
 * source for the chart.
 *
 * Two days short of the retention TTL so the oldest day in the window can never
 * be one the nightly prune has already clipped halfway through.
 */
const RAW_CLICK_AUTHORITATIVE_DAYS = LINK_CLICK_TTL_DAYS - 2;

/**
 * Daily click series over the last N days.
 *
 * Raw clicks win for every day they still fully cover; the WaLinkClickDaily
 * rollup only fills in the deep history the retention prune has already emptied.
 *
 * It used to be the other way round — rolled rows first, then raw rows for
 * anything the rollup had not reached — and that quietly lost a day's clicks.
 * The rollup deliberately re-rolls the CURRENT day, so the moment a single click
 * landed before the 03:00 run there was a row for today, the raw top-up started
 * from TOMORROW, and every click for the rest of the day vanished from the
 * chart, the CSV export and the weekly digest. Reading raw-first also fixes two
 * smaller lies: the rollup buckets by UTC day while every other series on the
 * page buckets by the reporting timezone, and summing its per-link
 * `uniqueClickers` counted one person twice when they clicked two links.
 */
export async function getClickSeries(days: number, campaignId?: string): Promise<WaClickPoint[]> {
  const n = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const tz = await reportingTz();
  const today = todayInTz(tz);
  const rawDays = Math.min(n, RAW_CLICK_AUTHORITATIVE_DAYS);
  // Day markers, in the reporting timezone's calendar — the same days Postgres
  // labels the raw buckets with below, so the two halves meet without a gap or
  // an overlap.
  const since = dayMarkerBefore(today, n);
  const rawStart = dayMarkerBefore(today, rawDays);

  const byDate = new Map<string, WaClickPoint>();

  // Deep history: only the days raw clicks no longer cover. These are bucketed
  // by UTC day and their unique count is a sum over links, both inherent to the
  // aggregate — but by this age they are a trend line, not a number anyone
  // reconciles.
  if (rawStart.getTime() > since.getTime()) {
    const rolled = await prisma.waLinkClickDaily.groupBy({
      by: ['date'],
      where: { date: { gte: since, lt: rawStart }, ...(campaignId ? { campaignId } : {}) },
      _sum: { clicks: true, uniqueClickers: true },
    });
    for (const r of rolled) {
      const key = r.date.toISOString().slice(0, 10);
      byDate.set(key, {
        date: key,
        clicks: r._sum.clicks ?? 0,
        uniqueClickers: r._sum.uniqueClickers ?? 0,
      });
    }
  }

  // Recent history, straight from the raw rows. Aggregated Postgres-side: a
  // findMany over months of clicks would pull the whole table into memory, and
  // COUNT(DISTINCT) is the only way to dedupe a contact across links.
  const campaignFilter = campaignId ? Prisma.sql`AND l."campaignId" = ${campaignId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ date: Date; clicks: bigint; uniques: bigint }[]>(
    Prisma.sql`
    SELECT
      date_trunc('day', c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}) AS date,
      COUNT(*) AS clicks,
      COUNT(DISTINCT c."contactId") AS uniques
    FROM "WaLinkClick" c
    JOIN "WaShortLink" l ON l."id" = c."shortLinkId"
    WHERE c."createdAt" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${rawDays}))
            AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
      ${campaignFilter}
    GROUP BY 1
    ORDER BY 1 ASC
  `
  );
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    byDate.set(key, {
      date: key,
      clicks: Number(r.clicks),
      uniqueClickers: Number(r.uniques),
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Roll one day's raw clicks into WaLinkClickDaily.
 *
 * MUST run before the retention prune deletes the raw rows, or the trend for
 * that day is lost permanently. Idempotent (upsert on date+shortLinkId), so a
 * re-run after a partial failure corrects rather than doubles.
 *
 * Only ever read back for days older than RAW_CLICK_AUTHORITATIVE_DAYS —
 * getClickSeries prefers the raw rows while they last, because those can be
 * bucketed in the reporting timezone and deduped across links, and these cannot.
 */
export async function rollupLinkClicks(day: Date): Promise<number> {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const groups = await prisma.waLinkClick.groupBy({
    by: ['shortLinkId', 'contactId'],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  if (groups.length === 0) return 0;

  const perLink = new Map<string, { clicks: number; uniques: Set<string> }>();
  for (const g of groups) {
    const row = perLink.get(g.shortLinkId) ?? { clicks: 0, uniques: new Set<string>() };
    row.clicks += g._count._all;
    if (g.contactId) row.uniques.add(g.contactId);
    perLink.set(g.shortLinkId, row);
  }

  const links = await prisma.waShortLink.findMany({
    where: { id: { in: [...perLink.keys()] } },
    select: { id: true, campaignId: true },
  });
  const campaignByLink = new Map(links.map((l) => [l.id, l.campaignId]));

  let written = 0;
  for (const [shortLinkId, row] of perLink) {
    await prisma.waLinkClickDaily.upsert({
      where: { date_shortLinkId: { date: start, shortLinkId } },
      create: {
        date: start,
        shortLinkId,
        campaignId: campaignByLink.get(shortLinkId) ?? null,
        clicks: row.clicks,
        uniqueClickers: row.uniques.size,
      },
      update: {
        campaignId: campaignByLink.get(shortLinkId) ?? null,
        clicks: row.clicks,
        uniqueClickers: row.uniques.size,
      },
    });
    written += 1;
  }
  return written;
}
