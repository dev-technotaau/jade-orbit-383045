'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Repeat,
  RotateCw,
  Banknote,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import MetricCard from '@/components/super-admin/billing/MetricCard';
import RevenueChart from '@/components/super-admin/billing/RevenueChart';
import Sparkline from '@/components/super-admin/billing/Sparkline';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

export default function SuperAdminBillingAnalyticsPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof superAdminBillingService.dashboard>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    superAdminBillingService
      .dashboard()
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

  const series = useMemo(() => {
    if (!data) return [];
    return data.revenue.series.map((s) => ({
      day: new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      revenuePaise: s.paise,
    }));
  }, [data]);

  const sparkSeries = useMemo(() => {
    if (!data) return [];
    return data.revenue.series.map((s) => ({ x: s.date, y: s.paise }));
  }, [data]);

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.dashboard"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !data) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.dashboard"
      >
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Failed to load analytics.'}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const todayDelta =
    data.revenue.yesterdayPaise > 0
      ? Math.round(
          ((data.revenue.todayPaise - data.revenue.yesterdayPaise) / data.revenue.yesterdayPaise) *
            100,
        )
      : 0;

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="billing.dashboard">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="analytics" />

        <header>
          <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Billing analytics</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Revenue trends, recurring metrics (MRR/ARR/churn/LTV), unit economics, settlement
            balance, action queue.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Revenue last 30d"
            value={formatPaise(data.revenue.last30dPaise)}
            subtitle="vs prior period"
          />
          <MetricCard
            label="Today"
            value={formatPaise(data.revenue.todayPaise)}
            delta={
              todayDelta !== 0
                ? {
                    value: Math.abs(todayDelta),
                    direction: todayDelta >= 0 ? 'up' : 'down',
                  }
                : undefined
            }
            subtitle="vs yesterday"
            intent={todayDelta >= 0 ? 'positive' : 'negative'}
          />
          <MetricCard
            label="MRR"
            value={formatPaise(data.recurring.mrrPaise)}
            subtitle={`ARR ${formatPaise(data.recurring.arrPaise)}`}
          />
          <MetricCard
            label="Active subscriptions"
            value={data.recurring.activeSubscriptions.toLocaleString('en-IN')}
            subtitle={`Churn ${data.recurring.churnPercentLast30d.toFixed(1)}%`}
            intent={data.recurring.churnPercentLast30d > 5 ? 'warning' : 'positive'}
          />
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <TrendingUp size={16} /> Daily revenue (last 30 days)
          </h2>
          <div className="mt-4">
            <RevenueChart data={series} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="ARPU"
            value={formatPaise(data.unitEconomics.arpuPaise)}
            subtitle="last 30d"
          />
          <MetricCard
            label="Paying users"
            value={data.unitEconomics.payingUsersLast30d.toLocaleString('en-IN')}
          />
          <MetricCard
            label="LTV"
            value={formatPaise(data.unitEconomics.ltvPaise)}
            subtitle="estimate"
          />
          <MetricCard
            label="Settlement net"
            value={formatPaise(data.settlement.last30dNetPaise)}
            subtitle="last 30d to bank"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card padding="lg">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <CreditCard size={14} /> Payment success rate
            </h3>
            <p className="mt-3 text-4xl font-extrabold">
              {data.unitEconomics.paymentSuccessRatePercent.toFixed(1)}%
            </p>
            <Sparkline data={sparkSeries} color="#059669" height={50} />
          </Card>
          <Card padding="lg">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <RotateCw size={14} /> Refund rate
            </h3>
            <p className="mt-3 text-4xl font-extrabold">
              {data.unitEconomics.refundRatePercent.toFixed(2)}%
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Refunded amount as % of captured revenue (last 30d).
            </p>
          </Card>
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Banknote size={16} /> Top plans by revenue
          </h2>
          {data.topPlans.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No revenue yet.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3 text-right">Orders</th>
                  <th className="py-2 pr-3 text-right">Revenue</th>
                  <th className="py-2 pr-3 text-right">Avg order value</th>
                </tr>
              </thead>
              <tbody>
                {data.topPlans.map((p, i) => (
                  <tr key={p.planId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 text-xs">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{p.planName}</span>
                      <span className="ml-2 font-mono text-xs text-[var(--text-secondary)]">
                        {p.planCode}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-medium">
                      {p.orderCount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-emerald-700">
                      {formatPaise(p.revenuePaise)}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs text-[var(--text-secondary)]">
                      {p.orderCount > 0
                        ? formatPaise(Math.round(p.revenuePaise / p.orderCount))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <AlertTriangle size={16} /> Action queue
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <ActionStat
              label="Refunds pending"
              value={data.actionQueue.refundsPending}
              href="/super-admin/billing/refunds?status=PENDING"
            />
            <ActionStat
              label="Disputes open"
              value={data.actionQueue.disputesOpen}
              href="/super-admin/billing/disputes"
              tone="danger"
            />
            <ActionStat
              label="Fraud unreviewed"
              value={data.actionQueue.fraudFlagsUnreviewed}
              href="/super-admin/billing/fraud"
              tone="danger"
            />
            <ActionStat
              label="New quotes"
              value={data.actionQueue.quotesNew}
              href="/super-admin/billing/quotes"
              tone="info"
            />
            <ActionStat
              label="Webhooks failed"
              value={data.actionQueue.webhooksFailed}
              href="/super-admin/billing/webhooks?status=FAILED"
              tone="warning"
            />
          </dl>
        </Card>

        <p className="text-xs text-[var(--text-secondary)]">
          Generated {new Date(data.generatedAt).toLocaleString('en-IN')}
        </p>
      </div>
    </DashboardLayout>
  );
}

function ActionStat({
  label,
  value,
  href,
  tone = 'info',
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'info' | 'warning' | 'danger';
}) {
  const toneClass =
    value === 0
      ? 'text-[var(--text-secondary)]'
      : tone === 'danger'
        ? 'text-red-700'
        : tone === 'warning'
          ? 'text-amber-700'
          : 'text-blue-700';
  return (
    <a href={href} className="block rounded-lg p-3 text-center hover:bg-[var(--bg)]">
      <dt className="text-xs text-[var(--text-secondary)] uppercase">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</dd>
    </a>
  );
}
