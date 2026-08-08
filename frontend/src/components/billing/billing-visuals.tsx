/**
 * billing-visuals — the shared visual language for billing RECORD cards
 * (orders, invoices, subscriptions) and the pro-rata upgrade panel.
 *
 * Distinct from `plan-visuals` on purpose: a plan card sells a category, so it
 * gets a category illustration. A record card reports the STATE of a
 * transaction, so its visual is driven by status/meaning instead — a gradient
 * status medallion plus a glyph specific to what the record actually is
 * (a tax document, a renewal cycle, an offsetting credit).
 *
 * Deliberately a plain module (no `'use client'`) so the existing
 * server-compatible cards stay server components. For the same reason the
 * glyphs use `currentColor` and solid fills instead of `<linearGradient id>`:
 * these cards render in long lists, and per-instance gradient ids would need
 * `useId()` (a hook) — the gradient richness comes from the CSS tile behind
 * the glyph, which needs no ids at all.
 */

/** Semantic tone families shared by every billing record status. */
export type BillingTone = 'success' | 'info' | 'pending' | 'danger' | 'neutral';

export interface BillingToneStyles {
  /** Gradient for the status medallion tile (glyph renders white on top). */
  tile: string;
  /** Accent bar colour revealed on hover. */
  bar: string;
  /** Soft accent surface. */
  soft: string;
  /** Accent text colour. */
  text: string;
  /** Hover border tint for the card shell. */
  border: string;
}

const TONES: Record<BillingTone, BillingToneStyles> = {
  success: {
    tile: 'from-emerald-500 to-teal-600',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'hover:border-emerald-400/60',
  },
  info: {
    tile: 'from-blue-500 to-indigo-600',
    bar: 'bg-blue-500',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'hover:border-blue-400/60',
  },
  pending: {
    tile: 'from-amber-500 to-orange-600',
    bar: 'bg-amber-500',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'hover:border-amber-400/60',
  },
  danger: {
    tile: 'from-red-500 to-rose-600',
    bar: 'bg-red-500',
    soft: 'bg-red-50',
    text: 'text-red-700',
    border: 'hover:border-red-400/60',
  },
  neutral: {
    tile: 'from-slate-400 to-slate-600',
    bar: 'bg-slate-400',
    soft: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'hover:border-slate-400/60',
  },
};

/** Styles for a tone, defaulting to neutral for anything unmapped. */
export function getBillingTone(tone: BillingTone | undefined): BillingToneStyles {
  return TONES[tone ?? 'neutral'] ?? TONES.neutral;
}

/**
 * Base shell for billing record cards: white surface, quiet border, room for
 * the accent bar. Deliberately has NO hover lift — a lift reads as "this is
 * clickable", which would be a lie on a static panel.
 */
export const BILLING_CARD_SHELL =
  'group relative overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm transition-all duration-300';

/**
 * Add to shells that are genuinely a single link/button target (whole-card
 * navigation) — those get the lift + deepened shadow.
 */
export const BILLING_CARD_INTERACTIVE = 'hover:-translate-y-1 hover:shadow-lg';

/**
 * Add to shells that merely CONTAIN actions (e.g. an invoice row with view /
 * download buttons). Depth response without implying the card itself
 * navigates.
 */
export const BILLING_CARD_STATIC_HOVER = 'hover:shadow-md';

/** Accent bar that wipes in on the card's hover. Pass a tone `bar` class. */
export function BillingAccentBar({ bar }: { bar: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 z-10 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${bar}`}
    />
  );
}

/**
 * Gradient status medallion. Holds either a lucide status icon or one of the
 * glyphs below, rendered white on the tone gradient. Scales on card hover.
 */
export function BillingMedallion({
  tile,
  size = 'md',
  children,
}: {
  tile: string;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}) {
  const box = size === 'sm' ? 'h-10 w-10 rounded-lg' : 'h-12 w-12 rounded-xl';
  return (
    <div
      aria-hidden="true"
      className={`flex flex-none items-center justify-center bg-gradient-to-br text-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110 ${box} ${tile}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record-specific glyphs — currentColor only, no gradient ids.        */
/* ------------------------------------------------------------------ */

/** A GST tax document: page + ruled lines + a ₹ total and a stamp corner. */
export function InvoiceGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* Page with a folded corner */}
      <path
        d="M6 2.5h8.5L19 7v14.5H6z"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14.5 2.5V7H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Ruled line items */}
      <path
        d="M8.75 11h6.5M8.75 14h6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Total rule + amount marker */}
      <path d="M8.75 17.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A renewal cycle: a circular arrow orbiting a billing period. */
export function RenewalGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* Cycle arc — deliberately open so the arrowhead reads as "repeats" */}
      <path
        d="M20 12a8 8 0 1 1-2.6-5.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M20 3.5V7.5h-4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Period core */}
      <circle cx="12" cy="12" r="3.4" fill="currentColor" fillOpacity="0.35" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Pro-rata credit: a full new-plan bar with the unused credit slice cut out
 * of it, so the "you only pay the difference" idea is visible at a glance.
 */
export function ProrataGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* Full charge bar */}
      <rect
        x="2.5"
        y="5"
        width="19"
        height="6"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.2"
      />
      {/* Credit applied — the slice you don't pay */}
      <rect x="2.5" y="5" width="8" height="6" rx="3" fill="currentColor" />
      {/* Net payable bar */}
      <rect x="10.5" y="14" width="11" height="6" rx="3" fill="currentColor" fillOpacity="0.55" />
      {/* Offset marker linking the two */}
      <path
        d="M10.5 11.5v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="1 2"
      />
    </svg>
  );
}
