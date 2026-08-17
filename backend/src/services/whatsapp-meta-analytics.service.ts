import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { graphVersion } from './whatsapp.service';
import { invalidateObservedRates } from './whatsapp-pricing';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Official Meta Graph analytics for the WhatsApp Business Account (WABA). These
 * complement our own DB-computed analytics with Meta's authoritative numbers:
 *  - template_analytics: per-template SENT/DELIVERED/READ/CLICKED
 *  - conversation_analytics: conversation count + cost by category (CBP)
 *  - pricing_analytics: per-message volume + cost by category/type (PMP)
 *  - analytics: messages SENT/DELIVERED per day, per number — Meta's own volume
 *    ground truth, which is what our DB-derived counts drift from whenever a
 *    status webhook is missed
 *
 * All calls degrade gracefully: missing WABA/token, an unsupported field for the
 * account, or a missing `whatsapp_business_management` permission yield
 * `{ available: false, error }` for that section rather than failing the page.
 * Results are cached in Redis (30 min) because these endpoints are slow + rate-
 * limited.
 */

const GRAPH = 'https://graph.facebook.com';
const CACHE_TTL = 1800; // 30 min

/**
 * Meta's analytics edges only retain about 90 days, and an out-of-range window
 * is a 400 for the WHOLE panel rather than a truncated one.
 */
const META_MAX_DAYS = 90;

/**
 * Clamp a requested window to what Meta will actually answer.
 *
 * Also the reason the Redis key space stays finite: the cache key below is per
 * `days`, so an unbounded value mints an unbounded number of 30-minute entries.
 */
export function clampMetaDays(days: number): number {
  if (!Number.isFinite(days)) return 30;
  return Math.min(Math.max(Math.trunc(days), 1), META_MAX_DAYS);
}

export interface MetaTemplateRow {
  templateId: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
}
export interface MetaConversationRow {
  category: string;
  conversations: number;
  cost: number;
}
export interface MetaPricingRow {
  category: string;
  type: string;
  volume: number;
  cost: number;
}
/** One day of Meta's own messaging volume for the WABA. */
export interface MetaVolumeRow {
  /** YYYY-MM-DD (UTC), from the data point's own `start`. */
  date: string;
  sent: number;
  delivered: number;
}
/**
 * One day × category (× pricing type) of Meta's own billed volume and cost.
 * Collapsing the daily data points into a single total is what made the figures
 * unreconcilable — a total cannot be compared with a windowed estimate, and it
 * cannot be stored without overwriting the previous window.
 */
export interface MetaCostDailyRow {
  /** YYYY-MM-DD (UTC), from the data point's own `start`. */
  date: string;
  category: string;
  type: string | null;
  source: 'pricing' | 'conversation';
  volume: number;
  cost: number;
  currency?: string | null;
}
interface Section<T> {
  available: boolean;
  data: T[];
  error?: string;
}
export interface MetaAnalytics {
  configured: boolean;
  range: { start: number; end: number; days: number };
  /**
   * The WABA's billing currency (ISO 4217), or null when Meta will not tell us.
   * The cost columns used to be rendered as bare numbers next to ₹ figures from
   * our own estimate, so two different currencies sat unlabelled on one page.
   */
  currency: string | null;
  templates: Section<MetaTemplateRow>;
  /**
   * How many synced templates the template block actually covers, and how many
   * exist. Meta caps `template_analytics` at 10 ids per call, so this used to be
   * an arbitrary handful presented as the whole picture — an under-delivering
   * template could simply be invisible. They are batched now, but a partial
   * answer (a failed batch, or a catalogue past the fan-out ceiling) still has to
   * declare itself rather than look complete.
   */
  templatesCovered: number;
  templatesTotal: number;
  conversations: Section<MetaConversationRow> & { totalConversations: number; totalCost: number };
  pricing: Section<MetaPricingRow> & { totalVolume: number; totalCost: number };
  volume: Section<MetaVolumeRow> & { totalSent: number; totalDelivered: number };
}

function creds(): { waba: string; token: string } | null {
  const waba = env.META_WHATSAPP_WABA_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!waba || !token) return null;
  return { waba, token };
}

async function graphGet(url: string, token: string): Promise<any> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Graph error ${res.status}`);
  return json;
}

async function fetchTemplates(
  waba: string,
  token: string,
  start: number,
  end: number,
  ids: string[],
  names: Map<string, string>
): Promise<Section<MetaTemplateRow>> {
  if (ids.length === 0) return { available: true, data: [] };
  try {
    const url =
      `${GRAPH}/${graphVersion()}/${waba}/template_analytics` +
      `?start=${start}&end=${end}&granularity=DAILY` +
      `&metric_types=${encodeURIComponent(JSON.stringify(['SENT', 'DELIVERED', 'READ', 'CLICKED']))}` +
      // Meta hard-caps this at 10 ids per call. The CALLER batches across every
      // synced template now; this slice is just a defensive floor.
      `&template_ids=${encodeURIComponent(JSON.stringify(ids.slice(0, 10)))}`;
    const json = await graphGet(url, token);
    const agg = new Map<string, MetaTemplateRow>();
    for (const block of json.data ?? []) {
      for (const p of block.data_points ?? []) {
        const id = String(p.template_id ?? '');
        if (!id) continue;
        const row =
          agg.get(id) ??
          ({
            templateId: id,
            name: names.get(id) ?? id,
            sent: 0,
            delivered: 0,
            read: 0,
            clicked: 0,
          } as MetaTemplateRow);
        row.sent += Number(p.sent ?? 0);
        row.delivered += Number(p.delivered ?? 0);
        row.read += Number(p.read ?? 0);
        row.clicked += Array.isArray(p.clicked)
          ? p.clicked.reduce((s: number, x: any) => s + Number(x.count ?? 0), 0)
          : Number(p.clicked ?? 0);
        agg.set(id, row);
      }
    }
    return { available: true, data: [...agg.values()].sort((a, b) => b.sent - a.sent) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta template_analytics failed: ${msg}`);
    return { available: false, data: [], error: msg };
  }
}

/** UTC day key for a Graph data point (`start` is a unix timestamp). */
function dayKey(startSeconds: unknown): string | null {
  const n = Number(startSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

/**
 * The WABA's billing currency. Meta returns cost as a bare number, so without
 * this the dashboard printed an unlabelled figure next to our ₹ estimates and
 * left the operator to guess which was which.
 */
async function fetchWabaCurrency(waba: string, token: string): Promise<string | null> {
  try {
    const json = await graphGet(`${GRAPH}/${graphVersion()}/${waba}?fields=currency`, token);
    const cur = json?.currency;
    return typeof cur === 'string' && cur ? cur : null;
  } catch (err) {
    // Not fatal — the numbers are still worth showing, just unlabelled.
    logger.warn(
      `Meta WABA currency lookup failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function fetchConversations(
  waba: string,
  token: string,
  start: number,
  end: number
): Promise<
  Section<MetaConversationRow> & {
    totalConversations: number;
    totalCost: number;
    daily: MetaCostDailyRow[];
  }
> {
  try {
    const fields = `conversation_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(["CONVERSATION_CATEGORY"])`;
    const url = `${GRAPH}/${graphVersion()}/${waba}?fields=${encodeURIComponent(fields)}`;
    const json = await graphGet(url, token);
    const points: any[] = json?.conversation_analytics?.data?.[0]?.data_points ?? [];
    const agg = new Map<string, MetaConversationRow>();
    // Keyed by day+category as well, so the same points that build the summary
    // can be persisted per day rather than collapsed into one unstorable total.
    const byDay = new Map<string, MetaCostDailyRow>();
    let totalConversations = 0;
    let totalCost = 0;
    for (const p of points) {
      const cat = String(p.conversation_category ?? 'UNKNOWN');
      const row = agg.get(cat) ?? { category: cat, conversations: 0, cost: 0 };
      const conv = Number(p.conversation ?? 0);
      const cost = Number(p.cost ?? 0);
      row.conversations += conv;
      row.cost += cost;
      totalConversations += conv;
      totalCost += cost;
      agg.set(cat, row);

      const date = dayKey(p.start);
      if (date) {
        const key = `${date}|${cat}`;
        const day = byDay.get(key) ?? {
          date,
          category: cat,
          type: null,
          source: 'conversation' as const,
          volume: 0,
          cost: 0,
        };
        day.volume += conv;
        day.cost += cost;
        byDay.set(key, day);
      }
    }
    return {
      available: true,
      data: [...agg.values()],
      totalConversations,
      totalCost,
      daily: [...byDay.values()],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta conversation_analytics failed: ${msg}`);
    return {
      available: false,
      data: [],
      totalConversations: 0,
      totalCost: 0,
      daily: [],
      error: msg,
    };
  }
}

async function fetchPricing(
  waba: string,
  token: string,
  start: number,
  end: number
): Promise<
  Section<MetaPricingRow> & { totalVolume: number; totalCost: number; daily: MetaCostDailyRow[] }
> {
  try {
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`;
    const url = `${GRAPH}/${graphVersion()}/${waba}?fields=${encodeURIComponent(fields)}`;
    const json = await graphGet(url, token);
    const points: any[] = json?.pricing_analytics?.data?.[0]?.data_points ?? [];
    const agg = new Map<string, MetaPricingRow>();
    const byDay = new Map<string, MetaCostDailyRow>();
    let totalVolume = 0;
    let totalCost = 0;
    for (const p of points) {
      const cat = String(p.pricing_category ?? 'UNKNOWN');
      const type = String(p.pricing_type ?? 'UNKNOWN');
      const key = `${cat}|${type}`;
      const row = agg.get(key) ?? { category: cat, type, volume: 0, cost: 0 };
      const vol = Number(p.volume ?? 0);
      const cost = Number(p.cost ?? 0);
      row.volume += vol;
      row.cost += cost;
      totalVolume += vol;
      totalCost += cost;
      agg.set(key, row);

      const date = dayKey(p.start);
      if (date) {
        const dayKeyStr = `${date}|${cat}|${type}`;
        const day = byDay.get(dayKeyStr) ?? {
          date,
          category: cat,
          type,
          source: 'pricing' as const,
          volume: 0,
          cost: 0,
        };
        day.volume += vol;
        day.cost += cost;
        byDay.set(dayKeyStr, day);
      }
    }
    return {
      available: true,
      data: [...agg.values()],
      totalVolume,
      totalCost,
      daily: [...byDay.values()],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta pricing_analytics failed: ${msg}`);
    return { available: false, data: [], totalVolume: 0, totalCost: 0, daily: [], error: msg };
  }
}

/**
 * Meta's own messages-sent / messages-delivered per day for the WABA.
 *
 * Every volume figure in this product is counted from our own message rows, so
 * it drifts silently downward whenever a status webhook is dropped — and there
 * was nothing to compare it against. This is the authoritative series.
 */
async function fetchMessagingVolume(
  waba: string,
  token: string,
  start: number,
  end: number
): Promise<Section<MetaVolumeRow> & { totalSent: number; totalDelivered: number }> {
  try {
    const fields = `analytics.start(${start}).end(${end}).granularity(DAY)`;
    const url = `${GRAPH}/${graphVersion()}/${waba}?fields=${encodeURIComponent(fields)}`;
    const json = await graphGet(url, token);
    const points: any[] = json?.analytics?.data_points ?? [];
    // Keyed by day rather than pushed, because Meta returns one point per
    // (day, number) once a WABA carries more than one number — appending them
    // would draw the same date twice instead of the day's total.
    const byDay = new Map<string, MetaVolumeRow>();
    let totalSent = 0;
    let totalDelivered = 0;
    for (const p of points) {
      const date = dayKey(p.start);
      if (!date) continue;
      const row = byDay.get(date) ?? { date, sent: 0, delivered: 0 };
      const sent = Number(p.sent ?? 0);
      const delivered = Number(p.delivered ?? 0);
      row.sent += sent;
      row.delivered += delivered;
      totalSent += sent;
      totalDelivered += delivered;
      byDay.set(date, row);
    }
    return {
      available: true,
      data: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      totalSent,
      totalDelivered,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta analytics (messaging volume) failed: ${msg}`);
    return { available: false, data: [], totalSent: 0, totalDelivered: 0, error: msg };
  }
}

export async function getMetaAnalytics(requestedDays = 30): Promise<MetaAnalytics> {
  // Clamped here as well as at the route: every caller reaches Graph and the
  // Redis key through this function, so this is the one place that cannot be
  // bypassed. `range.days` reports the window actually used, not the one asked
  // for, so the panel never labels 90 days of data as a year.
  const days = clampMetaDays(requestedDays);
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const range = { start, end, days };

  const c = creds();
  if (!c) {
    return {
      configured: false,
      range,
      currency: null,
      templates: { available: false, data: [] },
      templatesCovered: 0,
      templatesTotal: 0,
      conversations: { available: false, data: [], totalConversations: 0, totalCost: 0 },
      pricing: { available: false, data: [], totalVolume: 0, totalCost: 0 },
      volume: { available: false, data: [], totalSent: 0, totalDelivered: 0 },
    };
  }

  // Versioned key. The cached value is a whole `MetaAnalytics` blob with a 30-min
  // TTL, so a deploy that adds a section would otherwise serve the OLD shape to
  // the new page for half an hour — and the page reads `volume.available`
  // directly, which on a pre-volume blob is a crash, not a degraded panel.
  const cacheKey = `wa:meta-analytics:v2:${days}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as MetaAnalytics;
    } catch {
      /* stale/corrupt cache — recompute */
    }
  }

  // EVERY synced template, not the 10 most recently updated.
  //
  // Meta caps template_analytics at 10 ids per CALL, and that cap was applied by
  // simply taking 10 templates — so the panel silently reported on an arbitrary
  // handful and presented it as the whole picture. A deployment with 40 templates
  // saw 30 of them as though they had never been sent. The cap is a batching
  // constraint, not a coverage limit.
  const [tplRows, templatesTotal] = await Promise.all([
    prisma.waTemplate.findMany({
      where: { metaId: { not: null } },
      select: { metaId: true, name: true },
      orderBy: { updatedAt: 'desc' },
      // Bounded so a runaway template count cannot fan out unboundedly against Meta.
      take: 200,
    }),
    // The denominator for the coverage label. Without it a report on 200 of 340
    // templates looks exactly like a report on all of them.
    prisma.waTemplate.count({ where: { metaId: { not: null } } }),
  ]);
  const names = new Map(tplRows.map((t) => [t.metaId as string, t.name]));
  const ids = tplRows.map((t) => t.metaId as string);

  // Batches of 10, merged. Sequential rather than parallel: this is a rate-limited
  // Graph endpoint and a burst of concurrent calls is how a WABA earns a throttle.
  const BATCH = 10;
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

  const [currency, conversations, pricing, volume] = await Promise.all([
    fetchWabaCurrency(c.waba, c.token),
    fetchConversations(c.waba, c.token, start, end),
    fetchPricing(c.waba, c.token, start, end),
    fetchMessagingVolume(c.waba, c.token, start, end),
  ]);

  // Write the daily rows through on every dashboard load, not only on the cron.
  // These are the numbers the ₹0.78-per-marketing-message estimate is checked
  // against, and an operator opening the page is the moment they most want them
  // current. Fire-and-forget: a persistence failure must not fail the panel.
  void persistMetaCosts(
    [...conversations.daily, ...pricing.daily].map((r) => ({ ...r, currency }))
  ).catch(() => {});

  let templates: Section<MetaTemplateRow> = { available: true, data: [] };
  // Counted from the batches that actually came back, NOT from ids.length: a
  // batch that failed halfway leaves the report covering fewer templates than
  // were asked for, and the label has to say the true number.
  let templatesCovered = 0;
  for (const batch of batches) {
    const part = await fetchTemplates(c.waba, c.token, start, end, batch, names);
    if (!part.available) {
      // One failed batch must not silently halve the report — surface it.
      templates = { ...part, data: [...(templates.data ?? []), ...(part.data ?? [])] };
      break;
    }
    templatesCovered += batch.length;
    templates = {
      available: true,
      data: [...(templates.data ?? []), ...(part.data ?? [])],
    };
  }

  const result: MetaAnalytics = {
    configured: true,
    range,
    currency,
    templates,
    templatesCovered,
    templatesTotal,
    conversations,
    pricing,
    volume,
  };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL).catch(() => {});
  return result;
}

/**
 * Persist Meta's daily volume + cost so the estimate can be checked against it.
 *
 * getMetaAnalytics only ever Redis-cached the blob for 30 minutes, so the
 * authoritative figures were fetched and thrown away: an operator saw two
 * unreconciled money numbers, in two currencies, one of them derived from a
 * hardcoded ₹0.78 guess that nothing had ever validated. Upsert keyed on
 * (date, category, type, source) so a re-sync of an overlapping window corrects
 * rather than doubles.
 */
export async function persistMetaCosts(rows: MetaCostDailyRow[]): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) continue;
    // Minor units (paise/cents) so it can be compared with our paise estimates
    // without a float round-trip. Rounded once, after the day's points for a
    // category have been summed.
    const costMinor = Math.round(row.cost * 100);
    // `type ?? ''` rather than null on BOTH sides of the key: Postgres treats two
    // NULLs as distinct in a unique index, so a null pricing type would defeat the
    // upsert entirely and every conversation-based sync would append a duplicate
    // row for the same day.
    await prisma.waMetaCostDaily.upsert({
      where: {
        date_category_type_source: {
          date,
          category: row.category,
          type: row.type ?? '',
          source: row.source,
        },
      },
      create: {
        date,
        category: row.category,
        type: row.type ?? '',
        source: row.source,
        volume: Math.round(row.volume),
        costMinor,
        currency: row.currency ?? null,
      },
      update: {
        volume: Math.round(row.volume),
        costMinor,
        currency: row.currency ?? null,
      },
    });
    written += 1;
  }
  if (written > 0) invalidateObservedRates();
  return written;
}

/**
 * Cron entry point: pull the last `days` of Meta pricing + conversation
 * analytics and write them to WaMetaCostDaily. Degrades to 0 (never throws)
 * when the WABA is unconfigured or the account cannot serve these fields.
 */
export async function syncMetaCosts(days = 7): Promise<number> {
  const c = creds();
  if (!c) return 0;
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const [currency, conversations, pricing] = await Promise.all([
    fetchWabaCurrency(c.waba, c.token),
    fetchConversations(c.waba, c.token, start, end),
    fetchPricing(c.waba, c.token, start, end),
  ]);
  const rows = [...conversations.daily, ...pricing.daily].map((r) => ({
    ...r,
    currency: currency ?? r.currency ?? null,
  }));
  const written = await persistMetaCosts(rows);
  logger.info(
    `Meta cost sync: ${written} daily row(s) over ${days}d (currency ${currency ?? '—'})`
  );
  return written;
}
