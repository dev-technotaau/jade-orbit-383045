'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Repeat, ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { subscriptionService } from '@/services/subscription.service';
import { usePricingHref } from '@/lib/pricing-href';
import { formatPaise } from '@/types/billing';
import type { SubscriptionListItem, SubscriptionStatus } from '@/types/subscription';

const TONE: Record<SubscriptionStatus, string> = {
  CREATED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  AUTHENTICATED: 'bg-blue-100 text-blue-900',
  ACTIVE: 'bg-green-100 text-green-900',
  PAUSED: 'bg-yellow-100 text-yellow-900',
  HALTED: 'bg-red-100 text-red-900',
  CANCELLED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  COMPLETED: 'bg-blue-100 text-blue-900',
  EXPIRED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  PENDING_CANCEL: 'bg-orange-100 text-orange-900',
};

export default function SubscriptionsPage() {
  const [items, setItems] = useState<SubscriptionListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pricingHref = usePricingHref();

  useEffect(() => {
    let active = true;
    subscriptionService
      .list()
      .then((res) => {
        if (active) setItems(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load subscriptions');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Subscriptions</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Manage auto-renewing plans, mandates and billing cycles.
            </p>
          </div>
          <Link href={pricingHref}>
            <Button variant="outline">Browse plans</Button>
          </Link>
        </div>

        {loading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </Card>
        )}

        {!loading && !error && (items?.length ?? 0) === 0 && (
          <Card padding="lg" className="text-center">
            <Repeat className="text-primary mx-auto h-10 w-10" />
            <h2 className="mt-3 text-lg font-semibold text-[var(--text)]">No subscriptions</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You don&apos;t have any active subscriptions. Vendor Connect (₹199/month) is our
              monthly plan — perfect for recruiting partners.
            </p>
            <Link href="/pricing#vendor_connect" className="mt-4 inline-block">
              <Button variant="primary">Subscribe to Vendor Connect</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && (items?.length ?? 0) > 0 && (
          <div className="space-y-3">
            {items!.map((sub) => (
              <SubscriptionRow key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SubscriptionRow({ sub }: { sub: SubscriptionListItem }) {
  const next = sub.nextChargeAt
    ? new Date(sub.nextChargeAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';
  const planName = sub.plan?.name ?? 'Subscription';
  const showWarn =
    sub.status === 'HALTED' ||
    sub.status === 'PAUSED' ||
    (sub.cancelAtCycleEnd && sub.status === 'ACTIVE');
  return (
    <Link href={`/billing/subscriptions/${sub.id}`} className="block">
      <Card padding="md" className="hover:border-[var(--border-hover)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 flex-none items-center justify-center rounded-lg">
              <Repeat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--text)]">{planName}</p>
              <p className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Calendar className="h-3 w-3" />
                Next charge: {next}
                {sub.cancelAtCycleEnd && ' · cancels at cycle end'}
              </p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-3">
            {sub.plan?.basePricePaise && (
              <span className="text-right text-sm font-semibold text-[var(--text)]">
                {formatPaise(sub.plan.basePricePaise, sub.plan.currency)}
                <span className="block text-[10px] font-normal text-[var(--text-muted)]">
                  / cycle
                </span>
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[sub.status]}`}
            >
              {showWarn && <AlertCircle className="h-3 w-3" />}
              {sub.status.replace(/_/g, ' ').toLowerCase()}
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
