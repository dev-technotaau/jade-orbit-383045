'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tag, TrendingUp, Users, Banknote } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import MetricCard from '@/components/super-admin/billing/MetricCard';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

interface Analytics {
  totalCoupons: number;
  activeCoupons: number;
  totalRedemptions: number;
  totalDiscountPaise: number;
  topCoupons: Array<{ code: string; name: string; redemptions: number; discountPaise: number }>;
}

export default function CouponAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    superAdminBillingService
      .getCouponAnalytics()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.coupons.analytics"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="coupons" />

        <header>
          <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Coupon analytics</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Aggregate redemption stats — total discount given, best-performing codes, active funnel.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : error ? (
          <Card padding="lg">
            <p className="text-sm text-red-600">{error}</p>
          </Card>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total coupons" value={data.totalCoupons.toLocaleString('en-IN')} />
              <MetricCard
                label="Active coupons"
                value={data.activeCoupons.toLocaleString('en-IN')}
                intent="positive"
              />
              <MetricCard
                label="Total redemptions"
                value={data.totalRedemptions.toLocaleString('en-IN')}
              />
              <MetricCard
                label="Total discount given"
                value={formatPaise(data.totalDiscountPaise)}
                subtitle="across all-time redemptions"
                intent={data.totalDiscountPaise > 50_000_00 ? 'warning' : 'default'}
              />
            </div>

            <Card padding="lg">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
                <TrendingUp size={16} /> Top 10 coupons by redemptions
              </h2>
              {data.topCoupons.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No coupon redemptions yet"
                    description="Once users start applying coupons, the leaderboard appears here."
                    icon={Tag}
                  />
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Code</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3 text-right">Redemptions</th>
                        <th className="py-2 pr-3 text-right">Total discount</th>
                        <th className="py-2 pr-3 text-right">Avg discount / use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCoupons.map((c, i) => (
                        <tr
                          key={c.code}
                          className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                        >
                          <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                            {i + 1}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-xs">
                            <Link
                              href={`/super-admin/billing/coupons?search=${encodeURIComponent(c.code)}`}
                              className="text-blue-600 hover:underline"
                            >
                              {c.code}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">{c.name}</td>
                          <td className="py-2.5 pr-3 text-right font-medium">
                            {c.redemptions.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium text-emerald-700">
                            {formatPaise(c.discountPaise)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-xs text-[var(--text-secondary)]">
                            {c.redemptions > 0
                              ? formatPaise(Math.round(c.discountPaise / c.redemptions))
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card padding="lg">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <Users size={14} /> Average redemption value
                </h3>
                <p className="mt-3 text-3xl font-bold">
                  {data.totalRedemptions > 0
                    ? formatPaise(Math.round(data.totalDiscountPaise / data.totalRedemptions))
                    : '₹0'}
                </p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Average discount across {data.totalRedemptions.toLocaleString('en-IN')}{' '}
                  redemptions.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <Banknote size={14} /> Coupon catalog health
                </h3>
                <p className="mt-3 text-3xl font-bold">
                  {data.totalCoupons > 0
                    ? Math.round((data.activeCoupons / data.totalCoupons) * 100)
                    : 0}
                  %
                </p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {data.activeCoupons} of {data.totalCoupons} coupons currently accepting
                  redemptions.
                </p>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
