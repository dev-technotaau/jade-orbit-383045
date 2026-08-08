'use client';

import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';
import { PERM } from '@/constants/permissions';

interface BillingNavProps {
  active: string;
}

/**
 * The billing sub-nav, filtered by permission.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This strip is the ONLY route to Orders, Subscriptions, Ledger, Webhooks,
 * Audit and Users — those are not duplicated in the main sidebar. It used to
 * render all 17 tabs unconditionally while every destination page carries
 * its own guard, so an admin granted only `billing.refunds.view` saw 17 tabs
 * of which 16 dead-ended on the permission wall.
 *
 * Each entry now declares the key that unlocks its page — the same key the
 * destination checks — so the strip shows exactly where this admin can go.
 * Super-admins see everything (`can()` short-circuits on role).
 */
export default function BillingNav({ active }: BillingNavProps) {
  const { can } = usePermissions();

  const items: { key: string; label: string; href: string; permission: string }[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      href: '/super-admin/billing',
      permission: PERM.BILLING_DASHBOARD,
    },
    {
      key: 'orders',
      label: 'Orders',
      href: '/super-admin/billing/orders',
      permission: PERM.BILLING_ORDERS_VIEW,
    },
    {
      key: 'transactions',
      label: 'Transactions',
      href: '/super-admin/billing/transactions',
      permission: PERM.BILLING_TRANSACTIONS_VIEW,
    },
    {
      key: 'subscriptions',
      label: 'Subscriptions',
      href: '/super-admin/billing/subscriptions',
      permission: PERM.BILLING_SUBSCRIPTIONS_VIEW,
    },
    // Requests come before Refunds: a request is the decision, a refund is
    // the money that already moved.
    {
      key: 'refund-requests',
      label: 'Refund requests',
      href: '/super-admin/billing/refund-requests',
      permission: PERM.BILLING_REFUNDS_VIEW,
    },
    {
      key: 'refunds',
      label: 'Refunds',
      href: '/super-admin/billing/refunds',
      permission: PERM.BILLING_REFUNDS_VIEW,
    },
    {
      key: 'settlements',
      label: 'Settlements',
      href: '/super-admin/billing/settlements',
      permission: PERM.BILLING_SETTLEMENTS_VIEW,
    },
    {
      key: 'disputes',
      label: 'Disputes',
      href: '/super-admin/billing/disputes',
      permission: PERM.BILLING_DISPUTES_VIEW,
    },
    {
      key: 'plans',
      label: 'Plans',
      href: '/super-admin/billing/plans',
      permission: PERM.BILLING_PLANS_VIEW,
    },
    {
      key: 'coupons',
      label: 'Coupons',
      href: '/super-admin/billing/coupons',
      permission: PERM.BILLING_COUPONS_VIEW,
    },
    {
      key: 'quotes',
      label: 'Quotes',
      href: '/super-admin/billing/quotes',
      permission: PERM.BILLING_QUOTES_VIEW,
    },
    {
      key: 'fraud',
      label: 'Fraud',
      href: '/super-admin/billing/fraud',
      permission: PERM.BILLING_FRAUD_VIEW,
    },
    {
      key: 'webhooks',
      label: 'Webhooks',
      href: '/super-admin/billing/webhooks',
      permission: PERM.BILLING_WEBHOOKS_VIEW,
    },
    {
      key: 'audit',
      label: 'Audit',
      href: '/super-admin/billing/audit',
      permission: PERM.BILLING_AUDIT,
    },
    {
      key: 'ledger',
      label: 'Ledger',
      href: '/super-admin/billing/ledger',
      permission: PERM.BILLING_LEDGER_VIEW,
    },
    // The per-user billing summary reads orders, so it rides the orders key —
    // the same one `GET /billing/users/:userId/summary` is mapped to.
    {
      key: 'users',
      label: 'Users',
      href: '/super-admin/billing/users',
      permission: PERM.BILLING_ORDERS_VIEW,
    },
    {
      key: 'settings',
      label: 'Settings',
      href: '/super-admin/billing/settings',
      permission: PERM.BILLING_SETTINGS_VIEW,
    },
  ];

  // The ACTIVE tab stays visible even if its key is not held: the page guard
  // has already decided whether this admin may be here, and dropping the
  // current tab would leave the strip with no indication of where you are.
  const visible = items.filter((it) => it.key === active || can(it.permission));

  if (visible.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
      {visible.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            active === it.key
              ? 'bg-primary text-white'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
