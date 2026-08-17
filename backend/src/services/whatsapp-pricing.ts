import { prisma } from '../config/prisma';
import { env } from '../config/env';
import type { WaTemplateCategory } from '@prisma/client';

/**
 * Per-message price used for campaign cost previews.
 *
 * Lives in its own dependency-free module (like whatsapp-error-codes) so the
 * analytics service can price a category without importing the campaign
 * service's whole dependency tree — and so the reconciliation report and the
 * estimate it reconciles are guaranteed to be using the same numbers.
 */

/** The hardcoded fallback: three env constants, one per Meta pricing category. */
export function envRatePaise(category?: WaTemplateCategory | null): number {
  if (category === 'MARKETING') return parseInt(env.WHATSAPP_PRICE_MARKETING_PAISE, 10) || 78;
  if (category === 'AUTHENTICATION') return parseInt(env.WHATSAPP_PRICE_AUTH_PAISE, 10) || 30;
  return parseInt(env.WHATSAPP_PRICE_UTILITY_PAISE, 10) || 30;
}

/**
 * The currency every paise figure in this console is denominated in.
 *
 * WHATSAPP_PRICE_*_PAISE, WaCampaign.estimatedCostPaise, WaMessage.costPaise and
 * every ₹ the UI prints are all INR minor units. Meta's observed cost is in the
 * WABA's OWN billing currency, so it can only stand in for the estimate when the
 * two agree — see observedRatesMinor.
 */
export const ESTIMATE_CURRENCY = 'INR';

/** How far back the observed rate is averaged, and how long it is cached. */
const OBSERVED_WINDOW_DAYS = 30;
const OBSERVED_CACHE_MS = 15 * 60 * 1000;

let observedCache: { at: number; rates: Map<string, number> } | null = null;

/**
 * Meta's OWN cost ÷ volume per category, from the persisted daily pricing rows.
 *
 * The three env constants are guesses — one deployment's ₹0.78 marketing rate is
 * another's, in another country, on another pricing tier, simply wrong, and
 * nothing ever checked. Once WaMetaCostDaily has real rows for a category, that
 * category's estimate is derived from what Meta actually billed instead.
 *
 * INR rows ONLY. costMinor is in the WABA's billing currency, and this value is
 * written straight into WaCampaign.estimatedCostPaise and printed behind a ₹
 * sign — so on a WABA billed in USD an unfiltered observed rate turned the
 * campaign cost preview into US cents wearing a rupee sign, which is worse than
 * the consistent guess it replaced. A row whose currency Meta never told us is
 * treated the same way: unknown is not INR.
 *
 * Cached in-process for 15 minutes: this is on the campaign-preview path, and
 * the underlying table only changes once a day.
 */
export async function observedRatesMinor(): Promise<Map<string, number>> {
  if (observedCache && Date.now() - observedCache.at < OBSERVED_CACHE_MS) {
    return observedCache.rates;
  }
  const since = new Date(Date.now() - OBSERVED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.waMetaCostDaily
    .groupBy({
      // Currency comes back alongside the category so a mixed table (a WABA
      // whose billing currency changed) contributes only its INR half.
      by: ['category', 'currency'],
      // 'pricing' rows only: conversation_analytics counts 24h conversations,
      // not messages, so mixing the two would price a message at a conversation
      // rate and roughly double every estimate.
      where: { source: 'pricing', date: { gte: since } },
      _sum: { volume: true, costMinor: true },
    })
    .catch(() => []);
  const totals = new Map<string, { volume: number; cost: number }>();
  for (const r of rows) {
    if ((r.currency ?? '').toUpperCase() !== ESTIMATE_CURRENCY) continue;
    const key = r.category.toUpperCase();
    const acc = totals.get(key) ?? { volume: 0, cost: 0 };
    acc.volume += r._sum.volume ?? 0;
    acc.cost += r._sum.costMinor ?? 0;
    totals.set(key, acc);
  }
  const rates = new Map<string, number>();
  for (const [category, t] of totals) {
    if (t.volume > 0 && t.cost > 0) rates.set(category, Math.round(t.cost / t.volume));
  }
  observedCache = { at: Date.now(), rates };
  return rates;
}

/** Drop the memoized observed rates (called after a Meta cost sync writes new rows). */
export function invalidateObservedRates(): void {
  observedCache = null;
}

/**
 * The rate a cost preview should use: Meta's observed figure when we have one,
 * otherwise the env constant.
 */
export async function resolveRatePaise(category?: WaTemplateCategory | null): Promise<number> {
  const key = category ?? 'UTILITY';
  const observed = await observedRatesMinor();
  return observed.get(String(key).toUpperCase()) ?? envRatePaise(category);
}
