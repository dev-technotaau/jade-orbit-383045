'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldAlert, Users2, ExternalLink, Ban } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { adminPermissionService } from '@/services/admin-permission.service';
import { roleColorClass } from '@/constants/permissions';
import { flattenRegistry } from '@/types/permissions';
import { cn } from '@/lib/utils';

/**
 * The access matrix: every admin against every permission domain.
 *
 * ── Why domains, not leaves ────────────────────────────────────────────
 * A true admin × permission grid would be 40 × 400 cells — unreadable and
 * unusable. What a super-admin actually asks is "who has Billing?" or "who
 * can touch Email?", so the grid is rolled up to the 19 top-level domains
 * with a coverage indicator (none / partial / full) per cell.
 *
 * Drilling into a specific key is the reverse lookup below the grid, which
 * answers the other real question: "which admins hold THIS permission?"
 */
export default function AccessMatrixTab() {
  const [search, setSearch] = useState('');
  const [lookupKey, setLookupKey] = useState('');

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['admin-control', 'matrix'],
    queryFn: () => adminPermissionService.getMatrix(),
  });

  const { data: registry } = useQuery({
    queryKey: ['admin-control', 'registry'],
    queryFn: () => adminPermissionService.getRegistry(),
    staleTime: Infinity,
  });

  const domains = useMemo(() => {
    if (!registry) return [];
    return registry.tree
      .filter((n) => n.superAdminOnly !== true)
      .map((n) => {
        const leaves = flattenRegistry([n])
          .filter((e) => !e.node.children?.length)
          .map((e) => e.key);
        return { key: n.segment, label: n.label, leaves, leafCount: leaves.length };
      });
  }, [registry]);

  /**
   * Leaves of `domain` actually reachable by this allow set.
   *
   * Counting the admin's granted KEYS instead produced impossible fractions
   * like "23 of 14": a grant list holds branch keys as well as leaves, so the
   * numerator was drawn from a different population than the denominator.
   * Resolving each leaf through the same prefix rule the server uses makes
   * both sides count the same thing.
   */
  const coveredLeaves = (allowed: Set<string>, leaves: string[]): number =>
    leaves.filter((leaf) => {
      if (allowed.has(leaf)) return true;
      let cut = leaf.lastIndexOf('.');
      while (cut > 0) {
        if (allowed.has(leaf.slice(0, cut))) return true;
        cut = leaf.lastIndexOf('.', cut - 1);
      }
      return false;
    }).length;

  const rows = useMemo(() => {
    if (!matrix) return [];
    const q = search.trim().toLowerCase();
    if (!q) return matrix;
    return matrix.filter((r) => {
      const name = [r.admin.firstName, r.admin.lastName].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || r.admin.email.toLowerCase().includes(q);
    });
  }, [matrix, search]);

  /* Typing `billing.refunds.process` fired 24 lookups, each a full resolve
     across every admin. Settle first, then ask once. */
  const [debouncedKey, setDebouncedKey] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(lookupKey.trim()), 300);
    return () => clearTimeout(t);
  }, [lookupKey]);

  const lookupActive = debouncedKey.length > 2;
  const {
    data: holders,
    isFetching: holdersFetching,
    isError: holdersError,
    error: holdersErrorObj,
    refetch: refetchHolders,
  } = useQuery({
    queryKey: ['admin-control', 'holders', debouncedKey],
    queryFn: () => adminPermissionService.getHolders(debouncedKey),
    enabled: lookupActive,
  });

  if (isLoading) {
    return (
      <Card>
        <Skeleton />
      </Card>
    );
  }

  if (!matrix?.length) {
    return (
      <EmptyState
        icon={Users2}
        title="No admin accounts yet"
        description="Create an admin from Manage Admins, then grant them permissions here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Coverage by domain</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {matrix.length} admin{matrix.length === 1 ? '' : 's'} ·{' '}
              {registry?.grantableCount ?? 0} grantable permissions
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter admins…"
              aria-label="Filter admins"
              className="focus:border-primary focus:ring-primary/20 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>

        {/* Wide grid scrolls inside its own container so the page never
            scrolls horizontally. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-[var(--text)]">
                  Admin
                </th>
                {domains.map((d) => (
                  <th
                    key={d.key}
                    className="px-2 py-2 text-center text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    <span className="block max-w-[72px] truncate" title={d.label}>
                      {d.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const allowed = new Set(row.allowed);
                return (
                  <tr
                    key={row.admin.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <Link
                        href={`/super-admin/admins/${row.admin.id}`}
                        className="group flex items-center gap-2"
                      >
                        <Avatar
                          src={row.admin.avatar}
                          firstName={row.admin.firstName}
                          lastName={row.admin.lastName}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="group-hover:text-primary block truncate font-medium text-[var(--text)]">
                            {[row.admin.firstName, row.admin.lastName].filter(Boolean).join(' ') ||
                              row.admin.email}
                          </span>
                          <span className="block truncate text-xs text-[var(--text-muted)]">
                            {row.admin.email}
                          </span>
                        </span>
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.roles.map((r) => (
                          <span
                            key={r.id}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1',
                              roleColorClass(r.color),
                            )}
                          >
                            {r.name}
                          </span>
                        ))}
                        {row.denyCount > 0 && (
                          <Tooltip content={`${row.denyCount} explicit deny rule(s)`}>
                            <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              <Ban className="h-2.5 w-2.5" />
                              {row.denyCount}
                            </span>
                          </Tooltip>
                        )}
                        {row.admin.isSuspended && (
                          <Badge variant="error" size="sm">
                            Suspended
                          </Badge>
                        )}
                      </div>
                    </td>
                    {domains.map((d) => {
                      const full = allowed.has(d.key);
                      const held = full ? d.leafCount : coveredLeaves(allowed, d.leaves);
                      const level =
                        full || (held > 0 && held === d.leafCount)
                          ? 'full'
                          : held > 0
                            ? 'partial'
                            : 'none';
                      return (
                        <td key={d.key} className="px-2 py-2 text-center">
                          <Tooltip
                            content={
                              level === 'full'
                                ? `Full access to ${d.label}`
                                : level === 'partial'
                                  ? `${held} of ${d.leafCount} permissions in ${d.label}`
                                  : `No access to ${d.label}`
                            }
                          >
                            <span
                              className={cn(
                                'inline-block h-6 w-6 rounded-md',
                                level === 'full' && 'bg-primary',
                                level === 'partial' &&
                                  'bg-primary/30 ring-primary/40 ring-1 ring-inset',
                                level === 'none' && 'bg-[var(--bg-tertiary)]',
                              )}
                              aria-label={`${d.label}: ${level}`}
                            />
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary inline-block h-3 w-3 rounded" /> Full domain
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary/30 ring-primary/40 inline-block h-3 w-3 rounded ring-1 ring-inset" />{' '}
            Partial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-[var(--bg-tertiary)]" /> None
          </span>
        </div>
      </Card>

      {/* ── Reverse lookup ── */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--text)]">Who holds a permission?</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The question you ask during an incident: paste a permission key to see exactly which
          admins can use it right now.
        </p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={lookupKey}
            onChange={(e) => setLookupKey(e.target.value)}
            placeholder="e.g. billing.refunds.process"
            aria-label="Permission key"
            className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-9 font-mono text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {lookupActive && (
          <div className="mt-4">
            {holdersError ? (
              /* Silence here read as "nobody holds it" — the most dangerous
                 possible misreading of an access lookup during an incident. */
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  {(holdersErrorObj as unknown as { message?: string } | undefined)?.message ||
                    'Could not load holders for this permission.'}{' '}
                  This is <strong>not</strong> a result — do not read it as “no one has access”.
                </span>
                <button
                  type="button"
                  onClick={() => void refetchHolders()}
                  className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100"
                >
                  Retry
                </button>
              </div>
            ) : !holders || holdersFetching ? (
              <Skeleton />
            ) : holders.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 text-sm text-[var(--text-muted)]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                No admin holds this permission. (Super-admins always can — they hold everything by
                role.)
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {holders.map((h) => (
                  <li key={h.admin.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar
                      src={h.admin.avatar}
                      firstName={h.admin.firstName}
                      lastName={h.admin.lastName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {[h.admin.firstName, h.admin.lastName].filter(Boolean).join(' ') ||
                          h.admin.email}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{h.admin.email}</p>
                    </div>
                    <div className="hidden gap-1 sm:flex">
                      {h.roles.map((r) => (
                        <span
                          key={r.id}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1',
                            roleColorClass(r.color),
                          )}
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={`/super-admin/admins/${h.admin.id}`}
                      className="text-primary hover:text-primary-hover shrink-0 p-1"
                      aria-label="Open admin"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
