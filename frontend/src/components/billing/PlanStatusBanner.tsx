'use client';

import Link from 'next/link';
import { Sparkles, AlertCircle, Repeat, ArrowRight, Crown } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useEntitlements } from '@/hooks/use-entitlements';
import QuotaIndicator from '@/components/billing/QuotaIndicator';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import type { ResourceUnit } from '@/types/entitlement';

interface PlanStatusBannerProps {
  /** Resource units the role typically uses — drives the inline pills. */
  highlightUnits?: ResourceUnit[];
  /** When set, the no-plan CTA links here. */
  pricingHref?: string;
  className?: string;
}

/**
 * Top-of-dashboard banner that shows:
 *   - A "Choose a plan" CTA when the user has no active entitlement
 *   - Quota pills + auto-renew + expiry warning when a plan is active
 *
 * Auto-hides if `useEntitlements` is still loading.
 *
 * Usage:
 *   <PlanStatusBanner highlightUnits={['CV_UNLOCK', 'JOB_POST', 'APPLICATIONS']} />
 */
export default function PlanStatusBanner({
  highlightUnits = ['CV_UNLOCK', 'JOB_POST'],
  pricingHref = '/pricing',
  className,
}: PlanStatusBannerProps) {
  const { snapshot, isLoading, hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();

  if (isLoading) return null;

  // No active plan — show the buy-plan CTA card
  if (!snapshot?.hasAnyActive) {
    return (
      <Card padding="lg" className={`border-yellow-300 bg-yellow-50 ${className ?? ''}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-12 w-12 flex-none items-center justify-center rounded-xl">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">No active plan</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Pick a plan to unlock CV access, post jobs, and reach candidates.
              </p>
            </div>
          </div>
          <Link href={pricingHref}>
            <Button variant="primary">
              View plans <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Active — surface the most-used quotas + expiry warning
  const nextExpiry = snapshot.nextExpiryAt ? new Date(snapshot.nextExpiryAt) : null;
  const daysLeft = nextExpiry
    ? // eslint-disable-next-line react-hooks/purity
      Math.max(0, Math.ceil((nextExpiry.getTime() - Date.now()) / 86_400_000))
    : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 7;

  // Names of currently-active plans (max 2 for compact display)
  const planNames = snapshot.entitlements
    .slice(0, 2)
    .map((e) => e.planName)
    .join(' + ');
  const moreCount = Math.max(0, snapshot.entitlements.length - 2);

  // Employer-side upgrade nudge — surface when the user doesn't yet have
  // the EMP_PREMIUM-only flags. Cheap, hides automatically once they upgrade.
  const showEmployerUpgrade =
    !hasFeature('feature.urgent_hiring_badge') && !hasFeature('feature.unlimited_applications');

  return (
    <Card padding="md" className={className}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 flex-none items-center justify-center rounded-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">
              Active: {planNames}
              {moreCount > 0 && (
                <span className="ml-1 text-[var(--text-muted)]">+{moreCount} more</span>
              )}
            </p>
            <p className="inline-flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              {nextExpiry && (
                <span
                  className={
                    expiringSoon
                      ? 'inline-flex items-center gap-1 font-semibold text-yellow-800'
                      : ''
                  }
                >
                  {expiringSoon && <AlertCircle className="h-3 w-3" />}
                  Renews / expires in {daysLeft} days
                </span>
              )}
              {snapshot.entitlements.some((e) => e.autoRenew) && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Repeat className="h-3 w-3" /> auto-renew on
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {highlightUnits.map((unit) => (
            <QuotaIndicator key={unit} unit={unit} compact />
          ))}
          {showEmployerUpgrade && (
            <button
              type="button"
              onClick={() => upgrade.open({ feature: 'feature.urgent_hiring_badge' })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
            >
              <Crown className="h-4 w-4" /> Upgrade to Premium
            </button>
          )}
          <Link href="/billing/credits">
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </Link>
        </div>
      </div>
      {upgrade.modal}
    </Card>
  );
}
