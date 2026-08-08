'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useEntitlements } from '@/hooks/use-entitlements';
import Spinner from '@/components/ui/Spinner';

/**
 * Employer plan guard — wraps every employer/* page so users without an
 * active employer-side entitlement are pushed back to /pricing.
 *
 * Per payment.md spec:
 *   "employer shouldn't get access to dashboard or any employer page until
 *    he purchase a plan and give access only based on what plan he choose"
 *
 * New employers are auto-granted EMP_FREE on signup (auth.service.ts), so
 * this gate fires only when:
 *   - the EMP_FREE plan expired (7 days) and they didn't renew
 *   - super-admin revoked their entitlement
 *   - the auto-grant fallback failed silently for some reason
 *
 * Leaves the dashboard accessible the moment ANY active entitlement is
 * present — feature-level gating (e.g. CV-DB access) lives separately
 * inside `PlanGate` per page.
 *
 * Pages allow-list: pages the user must reach to GET a plan are excluded
 * from the redirect (they'd otherwise loop). The gate also bypasses for
 * SUPER_ADMIN / ADMIN impersonation.
 */
interface Props {
  children: ReactNode;
  /** Skip the gate entirely — useful for the /billing/* and /pricing pages. */
  skip?: boolean;
}

const ALWAYS_ALLOWED_PREFIXES = [
  '/billing',
  '/pricing',
  '/employer/help',
  '/employer/settings',
  '/employer/profile',
  '/employer/onboarding',
  '/employer/verification',
];

export default function EmployerPlanGuard({ children, skip = false }: Props) {
  const { snapshot, isLoading } = useEntitlements();
  const router = useRouter();
  const pathname = usePathname();

  const allowedPath = ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
  const blocked = !skip && !allowedPath && !isLoading && snapshot != null && !snapshot.hasAnyActive;

  useEffect(() => {
    if (blocked) {
      const reason = encodeURIComponent('no_active_plan');
      router.replace(`/pricing?from=${reason}&redirect=${encodeURIComponent(pathname)}`);
    }
  }, [blocked, router, pathname]);

  if (isLoading || blocked) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
