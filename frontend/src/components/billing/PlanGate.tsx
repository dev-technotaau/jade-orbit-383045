'use client';

import { type ReactNode } from 'react';
import { useEntitlements } from '@/hooks/use-entitlements';
import UpgradePrompt from '@/components/billing/UpgradePrompt';
import Spinner from '@/components/ui/Spinner';
import type { ResourceUnit } from '@/types/entitlement';

interface PlanGateProps {
  /** Feature keys (`feature.*`). User must possess ALL by default. */
  require: string[];
  /** Optional resource quota check (must have ≥ N remaining). */
  minResource?: { unit: ResourceUnit; amount: number };
  /** When true, any-of semantics; default = all-of. */
  requireAll?: boolean;
  /** Custom fallback when the gate blocks; default = `<UpgradePrompt />`. */
  fallback?: ReactNode;
  /** Hide the loading spinner — use for sidebar/header items where flicker is bad. */
  hideLoadingState?: boolean;
  /** Featuring text passed to the default `<UpgradePrompt />`. */
  feature?: string;
  /**
   * Override the upgrade CTA target, forwarded to the default
   * `<UpgradePrompt href>`. Use it to send a gated employer to the
   * employer pricing page (and a specific plan section anchor) instead of
   * the generic `/pricing` page — e.g.
   * `/pricing/employer?from=cv_db_access#employer_cv_database`.
   * Ignored when a custom `fallback` is supplied.
   */
  upgradeHref?: string;
  children: ReactNode;
}

/**
 * Render `children` only if the authed user has the required entitlements.
 *
 *   <PlanGate require={['feature.cv_db_access']} feature="CV Database">
 *     <CvSearchUi />
 *   </PlanGate>
 *
 *   <PlanGate
 *     require={['feature.cv_unlock']}
 *     minResource={{ unit: 'CV_UNLOCK', amount: 1 }}
 *     feature="CV unlocks"
 *   >
 *     <UnlockButton />
 *   </PlanGate>
 */
export default function PlanGate({
  require,
  minResource,
  requireAll = true,
  fallback,
  hideLoadingState,
  feature,
  upgradeHref,
  children,
}: PlanGateProps) {
  const { snapshot, isLoading, hasFeature, remaining } = useEntitlements();

  if (isLoading && !snapshot) {
    if (hideLoadingState) return null;
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!snapshot?.hasAnyActive) {
    return (
      <>
        {fallback ?? (
          <UpgradePrompt
            feature={feature ?? require.join(', ')}
            reason="no_plan"
            href={upgradeHref}
          />
        )}
      </>
    );
  }

  const featureCheck = requireAll
    ? require.every((k) => hasFeature(k))
    : require.some((k) => hasFeature(k));

  if (!featureCheck) {
    return (
      <>
        {fallback ?? (
          <UpgradePrompt
            feature={feature ?? require.join(', ')}
            reason="feature_missing"
            href={upgradeHref}
          />
        )}
      </>
    );
  }

  if (minResource && remaining(minResource.unit) < minResource.amount) {
    return (
      <>
        {fallback ?? (
          <UpgradePrompt
            feature={feature ?? minResource.unit.toLowerCase().replace(/_/g, ' ')}
            reason="quota_exhausted"
            href={upgradeHref}
          />
        )}
      </>
    );
  }

  return <>{children}</>;
}
