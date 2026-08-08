'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Repeat,
  Users,
  CreditCard,
  AlertCircle,
  RefreshCw,
  Receipt,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type FinancialDashboard,
} from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.dashboard'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

export default function SuperAdminBillingDashboard() {
  const [data, setData] = useState<FinancialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    superAdminBillingService
      .dashboard()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.dashboard">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout requiredRole={ROLE} requiredPermission="billing.dashboard">
        <div className="px-6 py-8">
          <Card padding="lg">
            <p className="text-[var(--error)]">{error ?? 'Could not load dashboard.'}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const dod = data.revenue.yesterdayPaise
    ? Math.round(
        ((data.revenue.todayPaise - data.revenue.yesterdayPaise) / data.revenue.yesterdayPaise) *
          100,
      )
    : null;

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.dashboard">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="dashboard" />

        <div className="mt-6 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Financial control center</h1>
            <p className="text-sm text-[var(--text-muted)]">
              KPIs computed live · refreshed{' '}
              {new Date(data.generatedAt).toLocaleTimeString('en-IN')}
            </p>
          </div>
        </div>

        {/* Action queue */}
        <ActionQueue queue={data.actionQueue} />

        {/* KPI cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Revenue (30d)"
            value={formatPaise(data.revenue.last30dPaise)}
            sub={`Today ${formatPaise(data.revenue.todayPaise)}${dod !== null ? ` (${dod >= 0 ? '+' : ''}${dod}% vs yesterday)` : ''}`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="primary"
          />
          <KpiCard
            title="MRR"
            value={formatPaise(data.recurring.mrrPaise)}
            sub={`ARR ${formatPaise(data.recurring.arrPaise)}`}
            icon={<Repeat className="h-5 w-5" />}
            tone="green"
          />
          <KpiCard
            title="ARPU (30d)"
            value={formatPaise(data.unitEconomics.arpuPaise)}
            sub={`${data.unitEconomics.payingUsersLast30d} paying users · LTV ${formatPaise(data.unitEconomics.ltvPaise)}`}
            icon={<Users className="h-5 w-5" />}
            tone="purple"
          />
          <KpiCard
            title="Active subscriptions"
            value={data.recurring.activeSubscriptions.toString()}
            sub={`Churn ${data.recurring.churnPercentLast30d}%`}
            icon={<Activity className="h-5 w-5" />}
            tone="blue"
          />
          <KpiCard
            title="Payment success rate"
            value={`${data.unitEconomics.paymentSuccessRatePercent}%`}
            sub="Last 30 days"
            icon={<CreditCard className="h-5 w-5" />}
            tone={data.unitEconomics.paymentSuccessRatePercent >= 95 ? 'green' : 'yellow'}
          />
          <KpiCard
            title="Refund rate"
            value={`${data.unitEconomics.refundRatePercent}%`}
            sub="Last 30 days"
            icon={<RefreshCw className="h-5 w-5" />}
            tone={data.unitEconomics.refundRatePercent <= 2 ? 'green' : 'yellow'}
          />
          <KpiCard
            title="Settlement (30d)"
            value={formatPaise(data.settlement.last30dNetPaise)}
            sub="Net amount in Razorpay payouts"
            icon={<Receipt className="h-5 w-5" />}
            tone="primary"
          />
          <KpiCard
            title="Fraud signals"
            value={data.actionQueue.fraudFlagsUnreviewed.toString()}
            sub="HIGH/CRITICAL pending review"
            icon={<AlertCircle className="h-5 w-5" />}
            tone={data.actionQueue.fraudFlagsUnreviewed > 0 ? 'red' : 'neutral'}
          />
        </div>

        {/* Revenue chart */}
        <Card padding="lg" className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Daily revenue · last 30 days
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              Total {formatPaise(data.revenue.last30dPaise)}
            </span>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart
                data={data.revenue.series.map((p) => ({
                  date: p.date.slice(5),
                  rupees: Math.round(p.paise / 100),
                  count: p.count,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v);
                    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(v);
                  }}
                  labelFormatter={(l) => `Date: ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="rupees"
                  stroke="#1E5CAF"
                  strokeWidth={2}
                  dot={false}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top plans */}
        <Card padding="lg" className="mt-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
            Top plans · last 30 days
          </h2>
          {data.topPlans.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No paid orders in the last 30 days yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="py-2">Plan</th>
                  <th className="py-2 text-right">Orders</th>
                  <th className="py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topPlans.map((p) => (
                  <tr key={p.planId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5">
                      <span className="font-medium text-[var(--text)]">{p.planName}</span>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">{p.planCode}</span>
                    </td>
                    <td className="py-2.5 text-right">{p.orderCount}</td>
                    <td className="py-2.5 text-right font-semibold">
                      {formatPaise(p.revenuePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: 'primary' | 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'neutral';
}) {
  const TONE: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    neutral: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  };
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</p>}
        </div>
        <div
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${TONE[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

function ActionQueue({ queue }: { queue: FinancialDashboard['actionQueue'] }) {
  const items = [
    {
      label: 'Refunds pending',
      count: queue.refundsPending,
      href: '/super-admin/billing/refunds',
    },
    {
      label: 'Disputes open',
      count: queue.disputesOpen,
      href: '/super-admin/billing/disputes',
    },
    {
      label: 'Fraud flags',
      count: queue.fraudFlagsUnreviewed,
      href: '/super-admin/billing/fraud',
    },
    {
      label: 'New quotes',
      count: queue.quotesNew,
      href: '/super-admin/billing/quotes',
    },
    {
      label: 'Webhooks failed',
      count: queue.webhooksFailed,
      href: '/super-admin/billing/transactions',
    },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) return null;
  return (
    <Card padding="md" className="border-yellow-300 bg-yellow-50">
      <h2 className="mb-2 text-sm font-semibold text-yellow-900">Action queue</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {items.map((item) =>
          item.count > 0 ? (
            <Link key={item.label} href={item.href} className="block">
              <div className="rounded-lg border border-yellow-300 bg-white p-3 hover:bg-yellow-100">
                <p className="text-2xl font-bold text-yellow-900">{item.count}</p>
                <p className="text-xs text-yellow-800">{item.label}</p>
              </div>
            </Link>
          ) : null,
        )}
      </div>
    </Card>
  );
}
