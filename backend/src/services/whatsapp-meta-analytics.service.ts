import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { graphVersion } from './whatsapp.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Official Meta Graph analytics for the WhatsApp Business Account (WABA). These
 * complement our own DB-computed analytics with Meta's authoritative numbers:
 *  - template_analytics: per-template SENT/DELIVERED/READ/CLICKED
 *  - conversation_analytics: conversation count + cost by category (CBP)
 *  - pricing_analytics: per-message volume + cost by category/type (PMP)
 *
 * All calls degrade gracefully: missing WABA/token, an unsupported field for the
 * account, or a missing `whatsapp_business_management` permission yield
 * `{ available: false, error }` for that section rather than failing the page.
 * Results are cached in Redis (30 min) because these endpoints are slow + rate-
 * limited.
 */

const GRAPH = 'https://graph.facebook.com';
const CACHE_TTL = 1800; // 30 min

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
interface Section<T> {
  available: boolean;
  data: T[];
  error?: string;
}
export interface MetaAnalytics {
  configured: boolean;
  range: { start: number; end: number; days: number };
  templates: Section<MetaTemplateRow>;
  conversations: Section<MetaConversationRow> & { totalConversations: number; totalCost: number };
  pricing: Section<MetaPricingRow> & { totalVolume: number; totalCost: number };
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

async function fetchConversations(
  waba: string,
  token: string,
  start: number,
  end: number
): Promise<Section<MetaConversationRow> & { totalConversations: number; totalCost: number }> {
  try {
    const fields = `conversation_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(["CONVERSATION_CATEGORY"])`;
    const url = `${GRAPH}/${graphVersion()}/${waba}?fields=${encodeURIComponent(fields)}`;
    const json = await graphGet(url, token);
    const points: any[] = json?.conversation_analytics?.data?.[0]?.data_points ?? [];
    const agg = new Map<string, MetaConversationRow>();
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
    }
    return { available: true, data: [...agg.values()], totalConversations, totalCost };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta conversation_analytics failed: ${msg}`);
    return { available: false, data: [], totalConversations: 0, totalCost: 0, error: msg };
  }
}

async function fetchPricing(
  waba: string,
  token: string,
  start: number,
  end: number
): Promise<Section<MetaPricingRow> & { totalVolume: number; totalCost: number }> {
  try {
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`;
    const url = `${GRAPH}/${graphVersion()}/${waba}?fields=${encodeURIComponent(fields)}`;
    const json = await graphGet(url, token);
    const points: any[] = json?.pricing_analytics?.data?.[0]?.data_points ?? [];
    const agg = new Map<string, MetaPricingRow>();
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
    }
    return { available: true, data: [...agg.values()], totalVolume, totalCost };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Meta pricing_analytics failed: ${msg}`);
    return { available: false, data: [], totalVolume: 0, totalCost: 0, error: msg };
  }
}

export async function getMetaAnalytics(days = 30): Promise<MetaAnalytics> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const range = { start, end, days };

  const c = creds();
  if (!c) {
    return {
      configured: false,
      range,
      templates: { available: false, data: [] },
      conversations: { available: false, data: [], totalConversations: 0, totalCost: 0 },
      pricing: { available: false, data: [], totalVolume: 0, totalCost: 0 },
    };
  }

  const cacheKey = `wa:meta-analytics:${days}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as MetaAnalytics;
    } catch {
      /* stale/corrupt cache — recompute */
    }
  }

  // Meta caps template_analytics at 10 template_ids per call — use the most
  // recently updated synced templates.
  const tplRows = await prisma.waTemplate.findMany({
    where: { metaId: { not: null } },
    select: { metaId: true, name: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  const names = new Map(tplRows.map((t) => [t.metaId as string, t.name]));
  const ids = tplRows.map((t) => t.metaId as string);

  const [templates, conversations, pricing] = await Promise.all([
    fetchTemplates(c.waba, c.token, start, end, ids, names),
    fetchConversations(c.waba, c.token, start, end),
    fetchPricing(c.waba, c.token, start, end),
  ]);

  const result: MetaAnalytics = { configured: true, range, templates, conversations, pricing };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL).catch(() => {});
  return result;
}
