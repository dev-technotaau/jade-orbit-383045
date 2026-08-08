'use client';

import Link from 'next/link';
import { Crown } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { useEntitlements } from '@/hooks/use-entitlements';
import { usePricingHref } from '@/lib/pricing-href';
import type { ResolvedEntitlement, ResourceUnit } from '@/types/entitlement';

interface Props {
  /** Resource units to show in the bar. Defaults to JOB_POST + CV_UNLOCK + APPLICATIONS. */
  units?: ResourceUnit[];
  className?: string;
}

const UNIT_LABEL: Partial<Record<ResourceUnit, string>> = {
  JOB_POST: 'Job posts',
  CV_UNLOCK: 'CV unlocks',
  APPLICATIONS: 'Applications',
  SEARCH_RESULT: 'Searches',
  SEAT: 'Seats',
};

/**
 * Pick the "primary" entitlement to show as the user's active plan.
 *
 * A user can hold multiple active entitlements simultaneously (base
 * plan + add-on, paid plan + free trial credits, etc.). For the
 * dashboard header pill we want ONE name that answers "what plan am
 * I on?" — the convention is:
 *
 *   - prefer entitlements with status === ACTIVE over GRACE/PAUSED
 *   - among those, pick the one with the LATEST validUntil
 *     (most recently purchased / longest-lived is the user's
 *     primary subscription in practice)
 *
 * Falls back to the first entitlement if none are strictly ACTIVE
 * (rare — hasAnyActive would be false in that case anyway).
 */
function pickPrimaryEntitlement(entitlements: ResolvedEntitlement[]): ResolvedEntitlement | null {
  if (entitlements.length === 0) return null;
  const active = entitlements.filter((e) => e.status === 'ACTIVE');
  const pool = active.length > 0 ? active : entitlements;
  return [...pool].sort(
    (a, b) => new Date(b.validUntil).getTime() - new Date(a.validUntil).getTime(),
  )[0];
}

export default function QuotaBar({
  units = ['JOB_POST', 'CV_UNLOCK', 'APPLICATIONS'],
  className,
}: Props) {
  const { snapshot: snap, isLoading } = useEntitlements();
  const pricingHref = usePricingHref();
  if (isLoading || !snap) return null;
  if (!snap.hasAnyActive) {
    return (
      <Link
        href={pricingHref}
        // White-on-saturated-amber matches the shared upsell-banner
        // visual language (see candidate-page banner). Earlier attempts
        // at light-warm + dark-warm text washed out against the
        // similarly warm-toned dashboard chrome.
        className={`inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 ${className ?? ''}`}
      >
        No active plan — Upgrade →
      </Link>
    );
  }

  // Mirror the "no active plan" surface with a positive equivalent —
  // a vibrant pill that names the user's current plan and links to
  // /billing/subscriptions for renewal / cancel / upgrade actions.
  // Earlier this branch only rendered usage counters, which left the
  // header silent on WHICH plan the user was paying for.
  const primary = pickPrimaryEntitlement(snap.entitlements);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {primary && (
        <Tooltip
          content={`Active plan: ${primary.planName} · ends ${new Date(primary.validUntil).toLocaleDateString()}`}
          inline
        >
          <Link
            // /billing/credits is the universal "your active plan + live
            // quotas" page (titled "Active plans" inside). It's the only
            // billing page guaranteed to be in EVERY role's sidebar.
            // /billing/subscriptions is hidden for candidate/employer
            // since their plans are ONE_TIME (no subscription to manage)
            // — see Sidebar.tsx buildBillingNav comment.
            href="/billing/credits"
            // Solid brand-primary background so it reads as a positive
            // status pill (mirrors the amber "no plan" CTA visually but
            // in the brand colour). No `dark:` variants — the recently-
            // fixed verified badge / whatsapp card established that
            // pattern reliably renders in both light and prefers-dark
            // browser modes.
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--primary)]/20 shadow-sm transition-colors hover:bg-[var(--primary-hover)]"
          >
            <Crown className="h-3.5 w-3.5" />
            {primary.planName}
          </Link>
        </Tooltip>
      )}
      {units.map((unit) => {
        const r = snap.resources[unit];
        if (!r) return null;
        const remaining = r.totalRemaining;
        const tone =
          remaining === 0
            ? 'bg-red-50 text-red-700'
            : remaining <= Math.max(1, Math.floor((r.totalAllocated ?? 0) * 0.2))
              ? 'bg-amber-50 text-amber-800'
              : 'bg-blue-50 text-blue-700';
        return (
          <Tooltip key={unit} content={`${r.totalRemaining} remaining of ${r.totalAllocated}`}>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
              {UNIT_LABEL[unit] ?? unit}: <strong>{remaining}</strong>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
