'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Clock, Filter } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Select from '@/components/ui/Select';
import { adminPermissionService } from '@/services/admin-permission.service';
import { formatRelativeDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const WINDOWS = [
  { value: '1', label: 'Last hour' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
  { value: '720', label: 'Last 30 days' },
];

/**
 * The cross-admin activity feed.
 *
 * ── What is and isn't here ─────────────────────────────────────────────
 * MUTATIONS ONLY. Reads are ~90% of admin traffic and say almost nothing
 * about intent — logging them would bury the signal and grow the table by
 * millions of rows a week. If you need "who looked at this record", the
 * curated AuditLog is the place.
 *
 * Request bodies are never stored, only the shape of the call (method,
 * route pattern, status, duration). The route is a PATTERN, not a URL, so
 * grouping is meaningful and ids don't leak into a high-volume table.
 */
export default function ActivityTab() {
  const [hours, setHours] = useState('24');
  const [page, setPage] = useState(1);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [domain, setDomain] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['admin-control', 'activity-stats', hours],
    queryFn: () => adminPermissionService.getActivityStats(Number(hours)),
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-control', 'activity', { hours, page, errorsOnly, domain }],
    queryFn: () =>
      adminPermissionService.listActivity({
        page,
        limit: 25,
        errorsOnly: errorsOnly || undefined,
        domain: domain || undefined,
        from: new Date(Date.now() - Number(hours) * 3600_000).toISOString(),
      }),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* ── Rollup ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Actions" value={stats?.total ?? 0} icon={Activity} />
        <StatCard
          label="Failures"
          value={stats?.errors ?? 0}
          hint={stats ? `${stats.errorRate}% of all actions` : undefined}
          icon={AlertCircle}
          tone={stats && stats.errorRate > 10 ? 'warn' : 'default'}
        />
        <StatCard
          label="Most active"
          value={
            stats?.topAdmins[0]?.admin
              ? [stats.topAdmins[0].admin.firstName, stats.topAdmins[0].admin.lastName]
                  .filter(Boolean)
                  .join(' ') || stats.topAdmins[0].admin.email
              : '—'
          }
          hint={stats?.topAdmins[0] ? `${stats.topAdmins[0].count} actions` : undefined}
          icon={Clock}
        />
        <StatCard
          label="Busiest area"
          value={stats?.topDomains[0]?.domain ?? '—'}
          hint={stats?.topDomains[0] ? `${stats.topDomains[0].count} actions` : undefined}
          icon={Filter}
        />
      </div>

      {/* ── Filters ── */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Time window"
            value={hours}
            onChange={(v) => {
              setHours(v);
              setPage(1);
            }}
            options={WINDOWS}
            className="w-44"
          />
          <Select
            label="Area"
            value={domain}
            onChange={(v) => {
              setDomain(v);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All areas' },
              ...(stats?.topDomains ?? [])
                .filter((d) => d.domain)
                .map((d) => ({ value: d.domain as string, label: d.domain as string })),
            ]}
            className="w-44"
          />
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => {
                setErrorsOnly(e.target.checked);
                setPage(1);
              }}
              className="text-primary focus:ring-primary h-4 w-4 rounded border-[var(--border)]"
            />
            Failures only
          </label>
        </div>
      </Card>

      {/* ── Feed ── */}
      <Card>
        {isLoading ? (
          <Skeleton />
        ) : !data?.items.length ? (
          <EmptyState
            icon={Activity}
            title="No admin activity in this window"
            description="Only actions that change data are recorded — reads are deliberately excluded."
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)]">
              {data.items.map((row) => {
                const failed = row.statusCode >= 400;
                return (
                  <li key={row.id} className="flex items-start gap-3 py-3">
                    <Avatar
                      src={row.admin.avatar}
                      firstName={row.admin.firstName}
                      lastName={row.admin.lastName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-[var(--text)]">
                          {[row.admin.firstName, row.admin.lastName].filter(Boolean).join(' ') ||
                            row.admin.email}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                            row.method === 'DELETE'
                              ? 'bg-red-100 text-red-700'
                              : row.method === 'POST'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700',
                          )}
                        >
                          {row.method}
                        </span>
                        {row.permissionLabel && (
                          <Badge variant="neutral" size="sm">
                            {row.permissionLabel}
                          </Badge>
                        )}
                        {failed && (
                          <Badge variant="error" size="sm">
                            {row.statusCode}
                          </Badge>
                        )}
                      </div>
                      <code className="mt-0.5 block truncate font-mono text-xs text-[var(--text-muted)]">
                        {row.route}
                      </code>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatRelativeDate(row.createdAt)}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">{row.durationMs}ms</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {data.pagination.totalPages > 1 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <Pagination
                  currentPage={data.pagination.page}
                  totalPages={data.pagination.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Activity;
  tone?: 'default' | 'warn';
}) {
  return (
    <Card className="flex items-start gap-3">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tone === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-primary-light text-primary',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="truncate text-lg font-bold text-[var(--text)]">{value}</p>
        {hint && <p className="truncate text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
    </Card>
  );
}
