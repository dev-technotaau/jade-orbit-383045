/**
 * Billing constants mirrored from the backend (src/constants/index.ts).
 * Keep the two lists in sync — the backend enforces; this only drives UI.
 */

/**
 * Plans purchasable in multiple units per checkout (and re-purchasable
 * any time as a same-plan top-up). Quantity multiplies the price and the
 * plan's countable credits; listing durations and seats are unchanged.
 */
export const MULTI_QUANTITY_PLAN_CODES = [
  'EMP_STANDARD',
  'EMP_PREMIUM',
  'CVDB_LITE',
  'CVDB_PRO',
] as const;

/** Maximum plan units in a single checkout. */
export const MAX_PLAN_PURCHASE_QUANTITY = 3;

export function isMultiQuantityPlan(code: string | undefined | null): boolean {
  return !!code && (MULTI_QUANTITY_PLAN_CODES as readonly string[]).includes(code);
}

/**
 * Plan code → category (mirrors the seeded backend PlanCategory). Used by
 * upsell surfaces to decide whether the user already holds a paid plan in
 * the target's category — those must route through the pro-rata upgrade
 * flow, not full-price checkout.
 */
export const PLAN_CODE_CATEGORY: Record<string, string> = {
  CAND_PREMIUM: 'CANDIDATE_PREMIUM',
  EMP_FREE: 'EMPLOYER_JOB_POST',
  EMP_STANDARD: 'EMPLOYER_JOB_POST',
  EMP_PREMIUM: 'EMPLOYER_JOB_POST',
  CVDB_LITE: 'EMPLOYER_CV_DATABASE',
  CVDB_PRO: 'EMPLOYER_CV_DATABASE',
  CVDB_ENTERPRISE: 'EMPLOYER_CV_ENTERPRISE_CUSTOM',
  ASSIST_HIRING: 'EMPLOYER_ASSISTED_HIRING',
  VENDOR_CONNECT: 'VENDOR_CONNECT',
};
