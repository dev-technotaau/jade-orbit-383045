'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import BillingNav from '@/components/super-admin/billing/BillingNav';

/**
 * Users billing landing — admin enters a user ID/email and is forwarded to
 * `/super-admin/billing/users/<id>`. Per-user details live there.
 *
 * (The backend exposes `/super-admin/billing/users/:userId/summary`; we don't
 * have a list-all endpoint to keep the surface scoped — admins reach a user
 * either from a transaction/order link or by entering the ID here.)
 */
export default function SuperAdminUsersBillingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userId.trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(trimmed)) {
      setError('Please enter a valid user UUID');
      return;
    }
    router.push(`/super-admin/billing/users/${trimmed}`);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.orders.view"
    >
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="users" />

        <header>
          <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
            <Users className="mr-2 inline" size={24} /> Per-user billing
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Look up a user&apos;s entitlements, orders, subscriptions, refunds, ledger, and fraud
            history — plus god-mode actions like granting a plan manually.
          </p>
        </header>

        <Card padding="lg">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
                User UUID
              </span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-secondary)]"
                  size={16}
                />
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 4e8f3a12-44f7-4d8b-9c0e-25c1b8c5f7a8"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-2 pr-3 pl-9 font-mono text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Tip: copy a user ID from any transaction or order detail page.
              </p>
            </label>

            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                Look up user <ArrowRight size={14} />
              </Button>
            </div>
          </form>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-semibold text-[var(--text)]">What you can do here</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-secondary)]">
            <li>• View active entitlements (which plans + remaining quota).</li>
            <li>• Browse the user&apos;s last 20 orders, all subscriptions, and refunds.</li>
            <li>• See the money ledger (charges + refunds + manual credits).</li>
            <li>• Review fraud signal history and prior chargebacks.</li>
            <li>
              • <strong>Grant a plan manually</strong> — bonus / promotional / VIP.
            </li>
            <li>
              • <strong>Mark an order as paid</strong> for offline payments.
            </li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
