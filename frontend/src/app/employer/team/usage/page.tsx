'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Crown, Users } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { teamService } from '@/services/team.service';

const WINDOWS: Array<{ key: number; label: string }> = [
  { key: 7, label: 'Last 7 days' },
  { key: 30, label: 'Last 30 days' },
  { key: 90, label: 'Last 90 days' },
];

/**
 * Per-member quota consumption breakdown — owner / admin sees how the
 * shared CV-unlock / search / job-post pool is being drained across
 * the team.
 *
 * Backend: GET /employer/team/usage. Source of truth is `ResourceLedger`
 * filtered to entitlements owned by the company billing user, grouped
 * by team-member userId.
 */
export default function TeamUsagePage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ['employer', 'team', 'usage', days],
    queryFn: () => teamService.getUsage(days),
  });

  const allUnits = Array.from(new Set((data?.rows ?? []).flatMap((r) => Object.keys(r.perUnit))));

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div>
          <Link
            href="/employer/team"
            className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to team
          </Link>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Team usage</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              How your shared quota pool is being used across the team.
            </p>
          </div>
          <div className="flex gap-2">
            {WINDOWS.map((w) => (
              <Button
                key={w.key}
                variant={days === w.key ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setDays(w.key)}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">
              {(error as Error).message ?? 'Failed to load usage'}
            </p>
          </Card>
        )}

        {data && (
          <Card padding="md">
            {data.rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No team usage yet"
                description="Once your team starts unlocking CVs or posting jobs, their consumption will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs tracking-wider text-[var(--text-muted)] uppercase">
                      <th className="pr-4 pb-2">Member</th>
                      <th className="pr-4 pb-2">Role</th>
                      {allUnits.map((u) => (
                        <th key={u} className="pr-4 pb-2">
                          {prettyUnit(u)}
                        </th>
                      ))}
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.userId} className="border-b border-[var(--border)]">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Avatar firstName={row.name} size="sm" />
                            <div>
                              <p className="font-medium text-[var(--text)]">
                                {row.name}
                                {row.isOwner && (
                                  <Crown className="ml-1.5 inline h-3 w-3 text-amber-500" />
                                )}
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              row.role === 'OWNER'
                                ? 'warning'
                                : row.role === 'ADMIN'
                                  ? 'info'
                                  : 'neutral'
                            }
                            size="sm"
                          >
                            {row.role.toLowerCase()}
                          </Badge>
                        </td>
                        {allUnits.map((u) => (
                          <td key={u} className="py-3 pr-4 text-[var(--text)]">
                            {row.perUnit[u] ?? 0}
                          </td>
                        ))}
                        <td className="py-3 text-right font-semibold text-[var(--text)]">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <BarChart3 className="h-3 w-3" /> Counts are CONSUME ledger entries against the
              company&apos;s entitlements over the selected window.
            </p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function prettyUnit(unit: string): string {
  return unit
    .toLowerCase()
    .split('_')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
}
