'use client';

import Link from 'next/link';
import { useEntitlements } from '@/hooks/use-entitlements';
import type { ResourceUnit } from '@/types/entitlement';

interface QuotaIndicatorProps {
  unit: ResourceUnit;
  label?: string;
  /** When `true`, render compact pill (e.g. for sidebar). */
  compact?: boolean;
  /** Show progress bar (default true). */
  showBar?: boolean;
  className?: string;
}

const UNIT_LABELS: Partial<Record<ResourceUnit, string>> = {
  CV_UNLOCK: 'CV unlocks',
  JOB_POST: 'job posts',
  APPLICATIONS: 'applications',
  SEARCH_RESULT: 'searches',
  SEAT: 'seats',
  BOOST_DAYS: 'boost days',
  VENDOR_LEAD: 'leads',
  MATCHED_PROFILE_EMAIL: 'matched CVs',
};

/**
 *   <QuotaIndicator unit="CV_UNLOCK" />
 *
 * Shows "X of Y CV unlocks remaining" with a thin progress bar. Auto-hides
 * if no entitlement grants this resource.
 */
export default function QuotaIndicator({
  unit,
  label,
  compact,
  showBar = true,
  className,
}: QuotaIndicatorProps) {
  const { snapshot, allocated, consumed, remaining } = useEntitlements();
  const resource = snapshot?.resources?.[unit];
  if (!resource || resource.totalAllocated === 0) return null;

  const total = allocated(unit);
  const used = consumed(unit);
  const left = remaining(unit);
  const pct = total === 0 ? 0 : Math.round((used / total) * 100);
  const niceLabel = label ?? UNIT_LABELS[unit] ?? unit.toLowerCase().replace(/_/g, ' ');

  if (compact) {
    return (
      <Link
        href="/billing/credits"
        className={`inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2 py-1 text-xs ${className ?? ''}`}
      >
        <span className="font-semibold text-[var(--text)]">{left}</span>
        <span className="text-[var(--text-muted)]">{niceLabel}</span>
      </Link>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-muted)]">{niceLabel}</span>
        <span className="font-medium text-[var(--text)]">
          {left} <span className="text-[var(--text-muted)]">of {total} left</span>
        </span>
      </div>
      {showBar && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
            aria-valuenow={left}
            aria-valuemin={0}
            aria-valuemax={total}
            role="progressbar"
            aria-label={`${left} of ${total} ${niceLabel} remaining`}
          />
        </div>
      )}
    </div>
  );
}
