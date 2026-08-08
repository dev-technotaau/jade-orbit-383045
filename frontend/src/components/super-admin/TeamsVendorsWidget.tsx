'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, Building2, ArrowRight, Star, Crown, CheckCircle, MailOpen } from 'lucide-react';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { superAdminVendorsService } from '@/services/super-admin-vendors.service';

/**
 * Stat-cards row + top-N tables for the super-admin dashboard.
 * Pulls combined teams + vendors metrics from
 * `GET /super-admin/vendors/analytics` (single endpoint, both surfaces).
 *
 * Self-contained — drop into the SA dashboard layout once and it
 * fetches its own data.
 */
export default function TeamsVendorsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'teams-vendors-analytics'],
    queryFn: () => superAdminVendorsService.analytics(),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card padding="lg" className="flex items-center justify-center">
        <Spinner />
      </Card>
    );
  }

  const t = data.teams;
  const v = data.vendors;
  const totalLeads = Object.values(v.leadsByStatus).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">Teams &amp; Vendors</h3>
          <div className="flex gap-3 text-xs">
            <Link href="/super-admin/teams" className="text-primary underline underline-offset-2">
              All teams →
            </Link>
            <Link href="/super-admin/vendors" className="text-primary underline underline-offset-2">
              All vendors →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            icon={Users}
            label="Companies w/ multi-seat"
            value={t.companiesWithMultiSeat}
            sub={`${t.totalCompanies} total`}
          />
          <StatCard
            icon={Crown}
            label="Active seats"
            value={t.activeSeats}
            sub={
              t.pendingInvites > 0 ? `${t.pendingInvites} invites pending` : 'No pending invites'
            }
          />
          <StatCard
            icon={Building2}
            label="Vendors with active sub"
            value={v.activeSubscriptions}
            sub={`${v.totalVendors} total · ${v.verifiedVendors} verified`}
          />
          <StatCard
            icon={Star}
            label="Vendor rating"
            value={v.avgRating != null ? v.avgRating.toFixed(1) : '—'}
            sub={`${v.reviewCount} review${v.reviewCount === 1 ? '' : 's'} · ${totalLeads} leads`}
          />
          <StatCard
            icon={MailOpen}
            label="Contact reveals"
            value={v.totalLeadReveals}
            sub="Job board employer contacts"
          />
        </div>
      </div>

      {/* Top tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top consuming teams */}
        <Card padding="md">
          <h4 className="text-sm font-semibold text-[var(--text)]">Top quota consumers (30d)</h4>
          {t.topByConsumption.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">No consumption recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {t.topByConsumption.slice(0, 5).map((row, i) => (
                <li key={row.userId} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] tabular-nums">{i + 1}.</span>
                    <span className="truncate text-[var(--text)]">{row.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-[var(--text)] tabular-nums">
                    {row.consumed}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Top vendors by lead volume */}
        <Card padding="md">
          <h4 className="text-sm font-semibold text-[var(--text)]">Top vendors by leads</h4>
          {v.topByLeads.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">No leads yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {v.topByLeads.slice(0, 5).map((row, i) => (
                <li
                  key={row.vendorProfileId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)] tabular-nums">{i + 1}.</span>
                    <Link
                      href={`/super-admin/vendors/${row.vendorProfileId}`}
                      className="hover:text-primary truncate text-[var(--text)] hover:underline"
                    >
                      {row.businessName}
                    </Link>
                    {row.isVerified && (
                      <CheckCircle className="h-3 w-3 text-blue-600" aria-label="Verified" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[var(--text)] tabular-nums">
                    {row.leadCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs tracking-wider text-[var(--text-muted)] uppercase">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-bold text-[var(--text)]">{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{sub}</p>}
        </div>
        <ArrowRight className="h-3 w-3 flex-none text-[var(--text-muted)]" />
      </div>
    </Card>
  );
}
