/**
 * plan-theme — the per-category accent tokens for every pricing / billing
 * plan surface (chips, accent bars, tick colours, background washes).
 *
 * Deliberately a PLAIN module (no `'use client'`) so Server Components can
 * call `getPlanTheme()` directly. The illustrations live in the sibling
 * `plan-visuals.tsx`, which must be a client module because it uses
 * `useId()` to namespace SVG gradient ids — a Server Component may render
 * `<PlanVisualBand />` as a component, but it can never CALL a function
 * exported from a client module, which is why these tokens live here.
 */

import type { PlanCategory } from '@/types/billing';

export interface PlanTheme {
  /** Tailwind gradient for a band / panel background wash. */
  wash: string;
  /** Blurred accent glow sitting behind an illustration. */
  glow: string;
  /** Accent bar / rule colour for this category. */
  bar: string;
  /** Soft accent surface (chips, tick tiles) for this category. */
  soft: string;
  /** Accent text colour for this category. */
  text: string;
}

/** Neutral slate theme — used for any category not in the map below, so a new
 *  backend PlanCategory can never break a pricing surface. */
const FALLBACK_THEME: PlanTheme = {
  wash: 'from-slate-100 to-white',
  glow: 'bg-slate-400/30',
  bar: 'bg-slate-500',
  soft: 'bg-slate-100',
  text: 'text-slate-700',
};

const PLAN_THEMES: Record<PlanCategory, PlanTheme> = {
  EMPLOYER_JOB_POST: {
    wash: 'from-blue-50 to-white',
    glow: 'bg-blue-400/35',
    bar: 'bg-blue-500',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
  },
  EMPLOYER_CV_DATABASE: {
    wash: 'from-emerald-50 to-white',
    glow: 'bg-emerald-400/35',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  EMPLOYER_ASSISTED_HIRING: {
    wash: 'from-amber-50 to-white',
    glow: 'bg-amber-400/35',
    bar: 'bg-amber-500',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
  },
  CANDIDATE_PREMIUM: {
    wash: 'from-violet-50 to-white',
    glow: 'bg-violet-400/35',
    bar: 'bg-violet-500',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
  },
  VENDOR_CONNECT: {
    wash: 'from-purple-50 to-white',
    glow: 'bg-purple-400/35',
    bar: 'bg-purple-500',
    soft: 'bg-purple-50',
    text: 'text-purple-700',
  },
  EMPLOYER_CV_ENTERPRISE_CUSTOM: {
    wash: 'from-indigo-50 to-white',
    glow: 'bg-indigo-400/35',
    bar: 'bg-indigo-500',
    soft: 'bg-indigo-50',
    text: 'text-indigo-700',
  },
};

/** Accent tokens for a plan category, with a safe neutral fallback. */
export function getPlanTheme(category: PlanCategory | string | undefined): PlanTheme {
  if (!category) return FALLBACK_THEME;
  return PLAN_THEMES[category as PlanCategory] ?? FALLBACK_THEME;
}

/* ------------------------------------------------------------------ */
/* Tier ladder                                                         */
/* ------------------------------------------------------------------ */

/**
 * Plans inside ONE category used to render identically — Free, Standard and
 * Premium all drew the same art in the same colour, so nothing signalled that
 * one was richer than the next. Tier adds that second axis: CATEGORY still
 * owns the illustration and hue family, TIER owns how rich the treatment is.
 *
 *   free → deliberately plain: neutral wash, desaturated art, no ornament.
 *   core → the established category theme, unchanged from before.
 *   pro  → a deeper two-hue wash from the same family, plus sheen + sparkles.
 *   apex → the richest treatment, for quote-based / enterprise tiers.
 */
export type PlanTier = 'free' | 'core' | 'pro' | 'apex';

/**
 * Explicit tier per seeded plan code. Mirrors PLAN_CODE_CATEGORY in
 * constants/billing.ts — keep the two in step when a plan is added.
 */
const PLAN_CODE_TIER: Record<string, PlanTier> = {
  EMP_FREE: 'free',
  EMP_STANDARD: 'core',
  EMP_PREMIUM: 'pro',
  CVDB_LITE: 'core',
  CVDB_PRO: 'pro',
  CVDB_ENTERPRISE: 'apex',
  ASSIST_HIRING: 'pro',
  VENDOR_CONNECT: 'pro',
  CAND_PREMIUM: 'pro',
};

/**
 * Tier for a plan. Falls back to price/quote shape for any code not in the
 * map, so a newly seeded backend plan gets a sensible tier instead of
 * breaking a pricing surface.
 */
export function getPlanTier(plan: {
  code?: string | null;
  basePricePaise?: number | null;
  requiresQuote?: boolean | null;
}): PlanTier {
  const mapped = plan.code ? PLAN_CODE_TIER[plan.code] : undefined;
  if (mapped) return mapped;
  if (plan.requiresQuote) return 'apex';
  if ((plan.basePricePaise ?? 0) === 0) return 'free';
  return 'core';
}

/** Entry-tier treatment — intentionally neutral so Free reads as the base rung. */
const FREE_THEME: PlanTheme = {
  wash: 'from-slate-100 to-white',
  glow: 'bg-slate-400/25',
  bar: 'bg-slate-400',
  soft: 'bg-slate-100',
  text: 'text-slate-600',
};

/**
 * Deeper, two-hue variants used by the `pro` and `apex` tiers. Each stays
 * inside its category's colour family (blue→indigo, emerald→teal, …) so the
 * card still reads as that category, just a richer rung of it.
 *
 * Depth is deliberately TWO shade steps above `core` (…-200/…-100 against
 * core's …-50). One step was measured side-by-side in a compiled preview and
 * core vs pro was indistinguishable — and the ornament layer only reads at all
 * once the wash is dark enough for white sparkles to contrast against it.
 * `bar` / `soft` / `text` stay put: PlanCard uses those for its outline and
 * tick colours, and those already read fine.
 */
const PLAN_THEMES_DEEP: Record<PlanCategory, PlanTheme> = {
  EMPLOYER_JOB_POST: {
    wash: 'from-blue-200 via-indigo-100 to-white',
    glow: 'bg-indigo-500/50',
    bar: 'bg-indigo-600',
    soft: 'bg-indigo-50',
    text: 'text-indigo-700',
  },
  EMPLOYER_CV_DATABASE: {
    wash: 'from-emerald-200 via-teal-100 to-white',
    glow: 'bg-teal-500/50',
    bar: 'bg-teal-600',
    soft: 'bg-teal-50',
    text: 'text-teal-700',
  },
  EMPLOYER_ASSISTED_HIRING: {
    wash: 'from-amber-200 via-orange-100 to-white',
    glow: 'bg-orange-500/50',
    bar: 'bg-orange-600',
    soft: 'bg-orange-50',
    text: 'text-orange-700',
  },
  CANDIDATE_PREMIUM: {
    wash: 'from-violet-200 via-fuchsia-100 to-white',
    glow: 'bg-fuchsia-500/50',
    bar: 'bg-fuchsia-600',
    soft: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
  },
  VENDOR_CONNECT: {
    wash: 'from-purple-200 via-violet-100 to-white',
    glow: 'bg-violet-500/50',
    bar: 'bg-violet-600',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
  },
  EMPLOYER_CV_ENTERPRISE_CUSTOM: {
    wash: 'from-indigo-200 via-blue-100 to-white',
    glow: 'bg-blue-600/50',
    bar: 'bg-indigo-700',
    soft: 'bg-indigo-50',
    text: 'text-indigo-800',
  },
};

export interface PlanTierVisual {
  /** Colour tokens for this (category, tier) pair. */
  theme: PlanTheme;
  /** Extra classes on the illustration wrapper — Free reads deliberately plainer. */
  art: string;
  /** Ornament richness of the band: 0 none · 1 base · 2 sheen+sparkles · 3 + rays. */
  ornament: 0 | 1 | 2 | 3;
}

/**
 * Resolve the full visual treatment for a (category, tier) pair.
 * `core` returns EXACTLY the pre-existing category theme, so every surface
 * that looked a certain way before this ladder existed still does.
 */
export function getPlanTierVisual(
  category: PlanCategory | string | undefined,
  tier: PlanTier,
): PlanTierVisual {
  if (tier === 'free') {
    return { theme: FREE_THEME, art: 'opacity-90 saturate-50', ornament: 0 };
  }
  if (tier === 'core') {
    return { theme: getPlanTheme(category), art: '', ornament: 1 };
  }
  const deep = (category && PLAN_THEMES_DEEP[category as PlanCategory]) || getPlanTheme(category);
  return { theme: deep, art: '', ornament: tier === 'apex' ? 3 : 2 };
}
