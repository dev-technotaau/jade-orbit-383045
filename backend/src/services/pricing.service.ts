/**
 * Pricing engine — tax computation, proration math, half-up rounding,
 * coupon application, all centralized so order / subscription / refund flows
 * share one source of truth.
 *
 * **All amounts are integer paise** (1 INR = 100 paise) until display time.
 *
 * Phase 3 wires the order-creation path. Phase 5 (proration) and Phase 6
 * (coupons) extend the helpers below.
 */
import { TaxRegion, type Plan, type Coupon } from '@prisma/client';
import { env } from '../config/env';

export interface PricingInput {
  /** Plan being purchased — may be a one-time or subscription plan. */
  plan: Pick<Plan, 'basePricePaise' | 'gstRatePercent' | 'gstInclusive' | 'currency'>;
  /** Buyer's GST state code (`'03'` = Punjab). Used to pick CGST/SGST vs IGST. */
  buyerStateCode?: string | null;
  /** Buyer is an Indian customer? `false` = international (export of services). */
  buyerIsIndian?: boolean;
  /** Optional pro-ration credit (positive paise) deducted before tax computation. */
  prorationCreditPaise?: number;
  /** Optional coupon to apply. */
  coupon?: Pick<Coupon, 'type' | 'valuePaise' | 'valuePercent' | 'maxDiscountPaise'> | null;
  /** Optional manual override of seller's state code (defaults to env). */
  sellerStateCode?: string;
  /**
   * Units of the plan purchased (default 1). Multiplies the base price
   * BEFORE coupon discount, proration and the GST split, so the whole
   * breakdown reflects the full order amount.
   */
  quantity?: number;
}

export interface PricingBreakdown {
  /** Plan price before any deductions, paise. */
  originalAmountPaise: number;
  /** Discount applied (coupon, paise). */
  discountPaise: number;
  /** Pro-ration credit applied (paise). */
  prorationPaise: number;
  /** Pre-tax amount (after discount + proration). */
  taxableAmountPaise: number;
  /** CGST (intra-state). 0 if inter-state or international. */
  cgstPaise: number;
  /** SGST (intra-state). 0 if inter-state or international. */
  sgstPaise: number;
  /** IGST (inter-state). 0 if intra-state or international. */
  igstPaise: number;
  /** Cess. Currently always 0; placeholder for future luxury/health-cess rules. */
  cessPaise: number;
  /** Total tax = cgst + sgst + igst + cess. */
  taxPaise: number;
  /** Final payable amount (taxable + tax). */
  totalPaise: number;
  /** Region classification. */
  taxRegion: TaxRegion;
  /** GST percent applied (snapshot for invoice). */
  gstPercent: number;
  /** Currency code (snapshot for invoice). */
  currency: string;
}

/** Banker's rounding alternative — we use half-up at paise level per user's decision. */
export function roundPaise(value: number): number {
  return Math.round(value);
}

/** Convert rupees to paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert paise to rupees (number). */
export function toRupees(paise: number): number {
  return paise / 100;
}

/**
 * Determine the GST tax region for a transaction.
 *
 *   IN_INTRA_STATE  — buyer state == seller state, India
 *   IN_INTER_STATE  — different states within India
 *   INTERNATIONAL   — buyer outside India (export of services, GST = 0% with LUT)
 *   EXEMPT          — explicitly exempt (e.g. ₹0 free plan)
 */
export function classifyTaxRegion(args: {
  buyerStateCode?: string | null;
  buyerIsIndian?: boolean;
  sellerStateCode: string;
}): TaxRegion {
  if (args.buyerIsIndian === false) return TaxRegion.INTERNATIONAL;
  const buyer = (args.buyerStateCode ?? '').padStart(2, '0');
  const seller = args.sellerStateCode.padStart(2, '0');
  if (!buyer) return TaxRegion.IN_INTRA_STATE; // fallback — assume seller state
  return buyer === seller ? TaxRegion.IN_INTRA_STATE : TaxRegion.IN_INTER_STATE;
}

/**
 * Place-of-supply fallback chain (§5.1):
 *   1. explicit billingAddress.stateCode
 *   2. user IP geo (best-effort, returns null if not Indian / can't resolve)
 *   3. company GST state code (first 2 chars of GSTIN)
 *   4. seller's HA_PLACE_OF_SUPPLY_DEFAULT_STATE
 *
 * Returns a 2-digit GST state code string or null if unresolvable (caller
 * treats null as "use seller state" → INTRA_STATE).
 */
export async function resolvePlaceOfSupplyState(args: {
  billingAddressStateCode?: string | null;
  ipAddress?: string | null;
  companyGstin?: string | null;
}): Promise<string | null> {
  // 1. billing address — most authoritative
  if (args.billingAddressStateCode && /^[0-9]{2}$/.test(args.billingAddressStateCode)) {
    return args.billingAddressStateCode;
  }
  // 2. IP geo — best-effort lookup; only honoured if it resolves to India
  if (args.ipAddress) {
    try {
      const { lookupIpCountryAndState } = await import('../utils/ip-geo');
      const geo = await lookupIpCountryAndState(args.ipAddress);
      if (geo?.country === 'IN' && geo.gstStateCode) {
        return geo.gstStateCode;
      }
    } catch {
      // ip-geo is optional — fall through
    }
  }
  // 3. Company GSTIN — first 2 chars are state code
  if (args.companyGstin && args.companyGstin.length >= 2) {
    const code = args.companyGstin.slice(0, 2);
    if (/^[0-9]{2}$/.test(code)) return code;
  }
  // 4. Default
  return env.HA_PLACE_OF_SUPPLY_DEFAULT_STATE ?? null;
}

/**
 * Resolve the LUT toggle for export-of-services GST treatment (§5.1):
 *   - SystemConfig key `gst.export.with_lut` (boolean) — if true, 0% GST on exports
 *   - Falls back to env HA_GST_EXPORT_WITH_LUT (default true)
 */
export async function exportWithLut(): Promise<boolean> {
  try {
    const { prisma } = await import('../config/prisma');
    const row = await prisma.systemConfig.findUnique({
      where: { key: 'gst.export.with_lut' },
    });
    if (row && row.value !== null && row.value !== undefined) {
      const v = row.value as unknown;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'object' && v !== null && 'enabled' in v) {
        return Boolean((v as { enabled?: unknown }).enabled);
      }
      if (typeof v === 'string') return v === 'true' || v === '1';
    }
  } catch {
    /* SystemConfig optional */
  }
  return env.HA_GST_EXPORT_WITH_LUT !== 'false';
}

/**
 * Apply a coupon to a base price. Returns the discount amount in paise (always positive).
 * Pure function — caller decides whether to actually apply it (after coupon validation).
 */
export function computeCouponDiscount(
  basePricePaise: number,
  coupon: Pick<Coupon, 'type' | 'valuePaise' | 'valuePercent' | 'maxDiscountPaise'>
): number {
  if (basePricePaise <= 0) return 0;
  switch (coupon.type) {
    case 'FLAT':
      return Math.min(coupon.valuePaise ?? 0, basePricePaise);
    case 'PERCENT': {
      const pct = coupon.valuePercent ?? 0;
      const raw = roundPaise((basePricePaise * pct) / 100);
      const capped = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
      return Math.min(capped, basePricePaise);
    }
    case 'FREE_PLAN':
      return basePricePaise;
    case 'FIRST_MONTH_FREE':
      // Subscription-specific — caller handles it in subscription service.
      return basePricePaise;
    case 'TRIAL_EXTEND':
      // Doesn't reduce price; extends trial validity.
      return 0;
    default:
      return 0;
  }
}

/**
 * Core pricing computation. Produces a fully-broken-down line for an order
 * or invoice. Tax-inclusive prices (the default for Hire Adda) are reverse-
 * computed: given an inclusive price `P` at rate `r%`, the taxable base is
 * `P / (1 + r/100)` and tax is `P - base`.
 *
 * For LUT-aware international export pricing, prefer `computePricingAsync()`
 * which reads the SystemConfig `gst.export.with_lut` toggle. The sync version
 * defaults to LUT=true (0% on exports) per the plan's V1 default.
 */
export function computePricing(
  input: PricingInput & { exportWithLut?: boolean }
): PricingBreakdown {
  const sellerState = input.sellerStateCode ?? env.HA_BILLING_STATE_CODE ?? '03';
  const taxRegion = classifyTaxRegion({
    buyerStateCode: input.buyerStateCode,
    buyerIsIndian: input.buyerIsIndian ?? true,
    sellerStateCode: sellerState,
  });

  // NaN/Infinity-safe clamp — zod guards the route, but this function is
  // the defense for internal callers too.
  const quantity = Number.isFinite(input.quantity)
    ? Math.max(1, Math.floor(input.quantity as number))
    : 1;
  const original = input.plan.basePricePaise * quantity;
  const gstPercent = input.plan.gstRatePercent;

  // Free plan → zero tax. International export → 0% with LUT, 18% without.
  const lut = input.exportWithLut ?? true;
  const effectiveGstPercent =
    original === 0
      ? 0
      : taxRegion === TaxRegion.INTERNATIONAL
        ? lut
          ? 0
          : gstPercent
        : gstPercent;

  const discount = input.coupon ? computeCouponDiscount(original, input.coupon) : 0;
  const prorationRequested = Math.max(0, input.prorationCreditPaise ?? 0);
  // Clamp the RECORDED proration to what is actually consumable — credit
  // beyond the payable amount is forfeited, and persisting the requested
  // (larger) figure would break the order identity
  // original − discount − proration = taxable and overstate ledger credits.
  const proration = Math.min(prorationRequested, Math.max(0, original - discount));

  // Apply discount + proration to the original. We cap at zero to avoid negatives.
  const afterDeductions = Math.max(0, original - discount - proration);

  let taxableAmount: number;
  let totalTax: number;

  if (input.plan.gstInclusive && effectiveGstPercent > 0) {
    // Reverse-compute taxable from inclusive price
    taxableAmount = roundPaise((afterDeductions * 100) / (100 + effectiveGstPercent));
    totalTax = afterDeductions - taxableAmount;
  } else {
    // Exclusive — tax added on top of taxable
    taxableAmount = afterDeductions;
    totalTax = roundPaise((afterDeductions * effectiveGstPercent) / 100);
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (taxRegion === TaxRegion.IN_INTRA_STATE) {
    // Split equally between CGST + SGST
    cgst = roundPaise(totalTax / 2);
    sgst = totalTax - cgst; // ensure exact sum
  } else if (taxRegion === TaxRegion.IN_INTER_STATE) {
    igst = totalTax;
  }

  const total =
    input.plan.gstInclusive && effectiveGstPercent > 0 ? afterDeductions : taxableAmount + totalTax;

  return {
    originalAmountPaise: original,
    discountPaise: discount,
    prorationPaise: proration,
    taxableAmountPaise: taxableAmount,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    cessPaise: 0,
    taxPaise: totalTax,
    totalPaise: total,
    taxRegion,
    gstPercent: effectiveGstPercent,
    currency: input.plan.currency,
  };
}

/**
 * Async wrapper that reads the LUT toggle from SystemConfig before computing
 * pricing. Use this for production paths (order create / upgrade / quote) so
 * super-admin's LUT toggle is respected. Tests + simple callers can stay on
 * the sync `computePricing()`.
 */
export async function computePricingAsync(input: PricingInput): Promise<PricingBreakdown> {
  const lut = await exportWithLut();
  return computePricing({ ...input, exportWithLut: lut });
}

/**
 * Return current Indian financial year as `YYYY-YY` (e.g. `2026-27`).
 * FY runs April to March in India.
 */
export function getFinancialYear(now: Date = new Date()): string {
  const fyStartMonth = env.HA_FY_START_MONTH; // 4 (April)
  const month = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();
  if (month >= fyStartMonth) {
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}
