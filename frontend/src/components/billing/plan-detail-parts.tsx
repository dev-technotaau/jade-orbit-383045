'use client';

/**
 * plan-detail-parts — the shared vocabulary for the "My Plans" surfaces
 * (`/billing/plans`, `/billing/plans/[category]`, `/billing/plans/[category]/[code]`).
 *
 * Pulled out so the three pages agree on unit labels, the "unlimited" proxy
 * threshold, date formatting and meter styling. Deliberately mirrors the
 * existing `/billing/credits` page rather than inventing a second visual
 * language for quotas — the credits page stays the live-usage view, these
 * pages add the plan context around it.
 */

import Link from 'next/link';
import { CheckCircle2, Minus } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { PLAN_CATEGORY_LABELS, type PlanCategory } from '@/types/billing';
import type {
  EntitlementStatus,
  ResolvedFeature,
  ResolvedResource,
  ResourceUnit,
} from '@/types/entitlement';

/* ------------------------------------------------------------------ */
/* Labels + thresholds — kept in step with /billing/credits             */
/* ------------------------------------------------------------------ */

export const UNIT_LABELS: Partial<Record<ResourceUnit, string>> = {
  CV_UNLOCK: 'CV unlocks',
  JOB_POST: 'job posts',
  APPLICATIONS: 'applications',
  SEARCH_RESULT: 'search results',
  SEAT: 'seats',
  BOOST_DAYS: 'boost days',
  VENDOR_LEAD: 'lead reveals',
  MATCHED_PROFILE_EMAIL: 'matched CVs',
  JOB_DAYS_LIVE: 'job listing days',
};

export function unitLabel(unit: ResourceUnit | string): string {
  return UNIT_LABELS[unit as ResourceUnit] ?? String(unit).toLowerCase().replace(/_/g, ' ');
}

/**
 * Some units (e.g. VENDOR_LEAD) are seeded with a very large allocation as an
 * "unlimited" proxy. Show them as Unlimited rather than a raw 1,000,000.
 * Same constant the credits page uses.
 */
export const UNLIMITED_THRESHOLD = 1_000_000;

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** Human date, or an em dash when the value is missing/unparseable. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Days remaining, floored at 0 so an expired plan never reads negative. */
export function daysLeft(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - now) / 86_400_000));
}

/* ------------------------------------------------------------------ */
/* Category slug <-> enum                                              */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYS = Object.keys(PLAN_CATEGORY_LABELS) as PlanCategory[];

/**
 * Route params carry the category lowercased (`ROUTES.BILLING.PLAN_CATEGORY`).
 * Resolve it back, returning null for anything unknown so the page can 404
 * rather than render an empty shell.
 */
export function parseCategorySlug(slug: string | undefined): PlanCategory | null {
  if (!slug) return null;
  const upper = decodeURIComponent(slug).toUpperCase();
  return CATEGORY_KEYS.find((k) => k === upper) ?? null;
}

export function categoryLabel(category: PlanCategory | string | undefined): string {
  if (!category) return 'Plan';
  return PLAN_CATEGORY_LABELS[category as PlanCategory] ?? category;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  EntitlementStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  EXHAUSTED: { label: 'Quota used up', variant: 'warning' },
  ON_HOLD: { label: 'On hold', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'error' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};

export function EntitlementStatusBadge({ status }: { status: EntitlementStatus }) {
  const meta = STATUS_META[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Quota meter                                                         */
/* ------------------------------------------------------------------ */

interface QuotaMeterProps {
  label: string;
  /** Units still available. Ignored when `unlimited`. */
  remaining: number;
  /** Allocated + carried-forward. */
  total: number;
  consumed: number;
  /** Carried-forward slice of `total`, surfaced in the sub-label when > 0. */
  carried?: number;
  /** ISO stamp of the last consume, shown as a footnote when present. */
  lastConsumedAt?: string | null;
}

/**
 * One resource row: label, remaining/total, and a bar that warms to amber at
 * 70% consumed and red at 90% — the same thresholds and colours as the
 * credits page, so a user comparing the two sees identical signals.
 */
export function QuotaMeter({
  label,
  remaining,
  total,
  consumed,
  carried = 0,
  lastConsumedAt,
}: QuotaMeterProps) {
  const unlimited = total >= UNLIMITED_THRESHOLD;
  const pct = unlimited || total === 0 ? 0 : Math.round((consumed / total) * 100);
  const barTone = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-medium text-[var(--text)]">
          {unlimited ? (
            <>
              Unlimited <span className="text-[var(--text-muted)]">({consumed} used)</span>
            </>
          ) : (
            <>
              {remaining}{' '}
              <span className="text-[var(--text-muted)]">
                of {total}
                {carried > 0 ? ` (incl. +${carried} carried)` : ''}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <div
          className={`h-full rounded-full transition-all ${barTone}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {lastConsumedAt && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">Last used {fmtDate(lastConsumedAt)}</p>
      )}
    </div>
  );
}

/** All of one entitlement's resources as meters, in the backend's order. */
export function EntitlementQuotas({ resources }: { resources: ResolvedResource[] }) {
  if (resources.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        This plan grants access rather than a counted quota.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {resources.map((r) => (
        <QuotaMeter
          key={r.unit}
          label={unitLabel(r.unit)}
          remaining={r.remaining}
          total={r.allocated + r.carriedForward}
          consumed={r.consumed}
          carried={r.carriedForward}
          lastConsumedAt={r.lastConsumedAt}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature list                                                        */
/* ------------------------------------------------------------------ */

/** Countable / enum / text features render their value; booleans just tick. */
function featureValue(f: ResolvedFeature): string | null {
  if (f.kind === 'COUNTABLE' && f.countableLimit != null) {
    return f.countableLimit >= UNLIMITED_THRESHOLD ? 'Unlimited' : String(f.countableLimit);
  }
  if (f.kind === 'ENUM' && f.enumValue) return f.enumValue;
  if (f.kind === 'TEXT' && f.textValue) return f.textValue;
  return null;
}

/**
 * What the plan includes, straight off the entitlement. Excluded features are
 * still listed (muted, dashed) so the list reads as the full plan sheet rather
 * than a curated highlight reel.
 */
export function FeatureList({ features }: { features: ResolvedFeature[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No feature flags on this plan.</p>;
  }
  return (
    <ul className="space-y-2">
      {features.map((f) => {
        const value = featureValue(f);
        return (
          <li key={f.key} className="flex items-start gap-2 text-sm">
            {f.included ? (
              <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            ) : (
              <Minus
                className="mt-0.5 h-4 w-4 flex-none text-[var(--text-muted)]"
                aria-hidden="true"
              />
            )}
            <span className={f.included ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}>
              {f.label}
              {value && <span className="text-[var(--text-muted)]"> — {value}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

/**
 * A card shell WITHOUT inner padding, so an illustration band can sit
 * flush against the top edge. `Card` always pads its children, which is why
 * these pages use this instead.
 */
export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-white ${className}`}
    >
      {children}
    </div>
  );
}

/** Label + value pair used across all three pages' summary grids. */
export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-[var(--text-muted)] uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}

/** Breadcrumb trail: My Plans › Category › Plan. */
export function PlanBreadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-muted)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-[var(--text-muted)]">
                /
              </span>
            )}
            {item.href ? (
              <Link href={item.href} className="hover:text-primary transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-[var(--text)]">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
