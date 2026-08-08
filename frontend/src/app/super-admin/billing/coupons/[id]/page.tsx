'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit3, Archive, Tag, Users, Calendar, TrendingUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import { superAdminBillingService, type AdminCoupon } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

export default function SuperAdminCouponDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [coupon, setCoupon] = useState<AdminCoupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await superAdminBillingService.getCouponAdmin(id);
      setCoupon(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupon');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onArchive = async () => {
    await superAdminBillingService.archiveCouponAdmin(id);
    setActionMsg('Coupon archived.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.coupons.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !coupon) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.coupons.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="coupons" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Coupon not found.'}</p>
            <Link
              href="/super-admin/billing/coupons"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const valueDisplay = (() => {
    switch (coupon.type) {
      case 'PERCENT':
        return `${coupon.valuePercent ?? 0}% off${coupon.maxDiscountPaise ? ` (cap ${formatPaise(coupon.maxDiscountPaise)})` : ''}`;
      case 'FLAT':
        return `${formatPaise(coupon.valuePaise ?? 0)} off`;
      case 'TRIAL_EXTEND':
        return `+${coupon.trialExtendDays ?? 0} trial days`;
      case 'FIRST_MONTH_FREE':
        return 'First month free';
      case 'FREE_PLAN':
        return 'Free plan';
    }
  })();

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.coupons.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="coupons" />

        <Link
          href="/super-admin/billing/coupons"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All coupons
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {coupon.code}
              </h1>
              <StatusBadge status={coupon.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{coupon.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/super-admin/billing/coupons/${coupon.id}/edit`}>
              <Button variant="outline">
                <Edit3 size={14} /> Edit
              </Button>
            </Link>
            {coupon.status !== 'ARCHIVED' ? (
              <Button variant="destructive" onClick={() => setArchiveOpen(true)}>
                <Archive size={14} /> Archive
              </Button>
            ) : null}
          </div>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Tag size={16} /> Discount
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Type</dt>
              <dd className="mt-1 text-base font-semibold">{coupon.type.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Value</dt>
              <dd className="mt-1 text-base font-semibold">{valueDisplay}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Min order</dt>
              <dd className="mt-1 text-base font-semibold">
                {coupon.minOrderAmountPaise > 0
                  ? formatPaise(coupon.minOrderAmountPaise)
                  : 'No minimum'}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Limits & redemptions"
            rows={[
              { label: 'Max redemptions', value: coupon.maxRedemptions ?? 'Unlimited' },
              {
                label: 'Used',
                value: `${coupon.redemptionsCount}${coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}`,
              },
              { label: 'Per user', value: coupon.maxRedemptionsPerUser },
              {
                label: 'Starts',
                value: coupon.startsAt
                  ? new Date(coupon.startsAt).toLocaleDateString('en-IN')
                  : 'Now',
              },
              {
                label: 'Ends',
                value: coupon.endsAt
                  ? new Date(coupon.endsAt).toLocaleDateString('en-IN')
                  : 'Never',
              },
            ]}
          />
          <AdminDetailCard
            title="Targeting & rules"
            rows={[
              { label: 'Scope', value: coupon.scope.replace(/_/g, ' ').toLowerCase() },
              {
                label: 'Allowed plans',
                value: coupon.allowedPlanIds.length === 0 ? 'All' : coupon.allowedPlanIds.length,
              },
              {
                label: 'Excluded plans',
                value: coupon.excludedPlanIds.length === 0 ? 'None' : coupon.excludedPlanIds.length,
              },
              {
                label: 'Allowed roles',
                value: coupon.allowedRoles.length === 0 ? 'All' : coupon.allowedRoles.join(', '),
              },
              {
                label: 'Allowed users',
                value: coupon.allowedUserIds.length === 0 ? 'All' : coupon.allowedUserIds.length,
              },
              { label: 'Stackable', value: coupon.stackable ? 'Yes' : 'No' },
              { label: 'Combo allowed', value: coupon.comboAllowed ? 'Yes' : 'No' },
              { label: 'Auto-apply', value: coupon.autoApply ? 'Yes' : 'No' },
            ]}
          />
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <TrendingUp size={16} /> Recent redemptions ({coupon.recentRedemptions?.length ?? 0})
          </h2>
          {coupon.recentRedemptions && coupon.recentRedemptions.length > 0 ? (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {coupon.recentRedemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      User {r.userId.slice(-8)}
                    </span>
                    <span className="ml-3 text-xs text-[var(--text-secondary)]">
                      {new Date(r.redeemedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-emerald-700">
                      − {formatPaise(r.discountPaise)}
                    </span>
                    <StatusBadge status={r.status} pretty />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No redemptions yet"
                description="When users apply this coupon at checkout, redemptions appear here."
                icon={Users}
              />
            </div>
          )}
        </Card>

        {coupon.descriptionHtml ? (
          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">Public description</h2>
            <div
              className="prose prose-sm dark:prose-invert mt-4 max-w-none text-[var(--text)]"
              dangerouslySetInnerHTML={{ __html: coupon.descriptionHtml }}
            />
          </Card>
        ) : null}

        {coupon.internalNotes ? (
          <Card padding="lg">
            <h2 className="text-base font-semibold text-[var(--text)]">Internal notes</h2>
            <p className="mt-3 text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
              {coupon.internalNotes}
            </p>
          </Card>
        ) : null}
      </div>

      <AdminConfirmModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={onArchive}
        title="Archive this coupon?"
        description="It will stop accepting new redemptions. Existing redemptions stay intact."
        confirmLabel="Archive"
        intent="danger"
      />
    </DashboardLayout>
  );
}
