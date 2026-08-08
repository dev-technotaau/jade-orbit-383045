'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, ShieldOff } from 'lucide-react';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useBillingStore } from '@/store/billing.store';
import { usePricingHref } from '@/lib/pricing-href';
import Tooltip from '@/components/ui/Tooltip';

/**
 * Header-mounted billing alert dot.
 *
 * Shows a small icon + count next to Notifications when:
 *   - any active entitlement expires in ≤ 3 days
 *   - the user has no active plan (CTA to /pricing)
 *   - a renewal recently failed (from billing store: hasFailingRenewal)
 *
 * Tap navigates to the most-relevant billing page.
 */
export default function BillingAlertBadge() {
  const { snapshot: snap } = useEntitlements();
  const hasFailingRenewal = useBillingStore((s) => s.hasFailingRenewal);
  const pricingHref = usePricingHref();

  const alert = useMemo<{
    href: string;
    icon: typeof Clock;
    tone: 'warning' | 'danger' | 'info';
    label: string;
  } | null>(() => {
    if (!snap) return null;

    if (hasFailingRenewal) {
      return {
        href: '/billing/payment-methods',
        icon: AlertTriangle,
        tone: 'danger',
        label: 'Renewal failed — update payment method',
      };
    }

    if (!snap.hasAnyActive) {
      return {
        // Route to the role-scoped pricing surface — derived from the
        // auth store via `usePricingHref()` so a candidate lands on
        // /pricing/candidate and an employer on /pricing/employer.
        href: pricingHref,
        icon: ShieldOff,
        tone: 'info',
        label: 'No active plan — explore plans',
      };
    }

    if (snap.nextExpiryAt) {
      const daysLeft = Math.ceil(
        // eslint-disable-next-line react-hooks/purity
        (new Date(snap.nextExpiryAt).getTime() - Date.now()) / 86_400_000,
      );
      if (daysLeft <= 0) {
        return {
          href: '/billing/subscriptions',
          icon: AlertTriangle,
          tone: 'danger',
          label: 'A plan has expired',
        };
      }
      if (daysLeft <= 3) {
        return {
          href: '/billing/subscriptions',
          icon: Clock,
          tone: 'warning',
          label: `Plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        };
      }
    }
    return null;
  }, [snap, hasFailingRenewal, pricingHref]);

  if (!alert) return null;

  const Icon = alert.icon;
  const toneClass =
    alert.tone === 'danger'
      ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
      : alert.tone === 'warning'
        ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
        : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20';

  // On desktop (lg+), the QuotaBar pill already surfaces the
  // "No active plan — Upgrade →" CTA in the same header row. Showing
  // this shield icon alongside it duplicates the affordance — same
  // destination, same trigger condition. Hide the icon on lg+ ONLY
  // for that specific state so the other 3 alert states (warning =
  // expiring, danger = expired / failing renewal) still surface on
  // every viewport, since QuotaBar doesn't render them at all.
  const hideOnDesktop = alert.tone === 'info';

  return (
    <Tooltip content={alert.label}>
      <Link
        href={alert.href}
        className={`relative inline-flex items-center justify-center rounded-lg p-2.5 transition-colors ${toneClass} ${
          hideOnDesktop ? 'lg:hidden' : ''
        }`}
        aria-label={alert.label}
      >
        <Icon size={18} />
        <span
          className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${
            alert.tone === 'danger'
              ? 'bg-red-500'
              : alert.tone === 'warning'
                ? 'bg-amber-500'
                : 'bg-blue-500'
          } animate-pulse`}
        />
      </Link>
    </Tooltip>
  );
}
