'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ShieldCheck, Download, Search, X, AlertTriangle, ExternalLink } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import AuditEntryDetail, { IntegrityBadge } from '@/components/whatsapp/AuditEntryDetail';
import { auditService, type AuditEntry, type AuditFilters } from '@/services/audit.service';
import type { ApiError } from '@/types/api';

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/**
 * Audit trail viewer.
 *
 * The module records 71 distinct actions and, until this page existed, had no
 * way to read any of them back — the only consumer of the table was the cron
 * that deletes from it. So the trail was write-only: the failed-unlock history,
 * every campaign launch, every contact erasure, all reachable only through a
 * database client.
 *
 * The integrity column is the part that makes it an *audit* log rather than an
 * activity feed. Every row carries a checksum over its immutable fields; this
 * page re-hashes on read and says so, and the toolbar can sweep the whole
 * filtered range at once.
 */
export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  // The inputs stay instant; the query runs on a settled value. Every keystroke
  // otherwise fires a LIKE across five indexed columns.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setFilters((f) => ({ ...f, q: search || undefined }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const listQuery = useQuery({
    queryKey: ['audit', filters, page, limit],
    queryFn: () => auditService.list(filters, page, limit),
  });

  const statsQuery = useQuery({
    queryKey: ['audit-stats', filters],
    queryFn: () => auditService.stats(filters),
  });

  const facetsQuery = useQuery({
    queryKey: ['audit-facets'],
    queryFn: () => auditService.facets(),
    staleTime: 5 * 60 * 1000,
  });

  const verifyMut = useMutation({
    mutationFn: () => auditService.verify(filters),
    onSuccess: (r) => {
      if (r.tampered) {
        showToast.error(
          `${r.invalid} of ${r.checked} entries FAILED integrity verification. The trail has been altered.`,
        );
      } else {
        showToast.success(
          `${r.valid} of ${r.checked} entries verified` +
            (r.unverifiable ? ` (${r.unverifiable} predate checksums)` : ''),
        );
      }
    },
    onError: (e) => showToast.error(errText(e, 'Verification failed')),
  });

  const exportMut = useMutation({
    mutationFn: () => auditService.exportCsv(filters),
    onError: (e) => showToast.error(errText(e, 'Export failed')),
  });

  const setFilter = (key: keyof AuditFilters, value: string | boolean | undefined) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
    setPage(1);
  };

  const clearAll = () => {
    setFilters({});
    setSearch('');
    setPage(1);
  };

  const activeCount = Object.values(filters).filter(Boolean).length;
  const rows = listQuery.data?.items ?? [];
  const stats = statsQuery.data;

  return (
    <DashboardLayout requiredRole={['ADMIN']}>
      <div className="space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]">Audit trail</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Every action taken through the console. Append-only — entries cannot be edited or
              deleted. The retention sweep archives them at 90 days (tick “Include archived” to see
              those) and removes them at 180.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              isLoading={verifyMut.isPending}
              onClick={() => verifyMut.mutate()}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
            >
              Verify integrity
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={exportMut.isPending}
              onClick={() => exportMut.mutate()}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Export CSV
            </Button>
          </div>
        </header>

        {/* A failed verification is not a toast-and-forget event. */}
        {verifyMut.data?.tampered && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">
                {verifyMut.data.invalid} entr
                {verifyMut.data.invalid === 1 ? 'y' : 'ies'} failed integrity verification.
              </p>
              <p className="mt-1">
                Their contents no longer match the checksum recorded when they were written —
                someone has modified this table directly. Treat the trail as untrustworthy from here
                and investigate database access.
              </p>
              {/* An id is the only handle an investigation has on an altered
                  row, and none of the filters above search by it — so each one
                  links to its entry instead of being text to copy out. */}
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs break-all">
                {verifyMut.data.invalidIds.slice(0, 8).map((id) => (
                  <Link
                    key={id}
                    href={`/whatsapp/audit/${id}`}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    {id}
                  </Link>
                ))}
                {verifyMut.data.invalidIds.length > 8 && <span>…</span>}
              </p>
            </div>
          </div>
        )}

        {/* ── Stats ─────────────────────────────────────────────────── */}
        {stats && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Entries" value={stats.total.toLocaleString('en-IN')} />
            <StatTile
              label="Distinct actions"
              value={String(facetsQuery.data?.actions.length ?? stats.byAction.length)}
            />
            <StatTile label="Actors" value={String(stats.byActor.length)} />
            <StatTile
              label="Oldest retained"
              value={stats.oldest ? new Date(stats.oldest).toLocaleDateString() : '—'}
            />
          </section>
        )}

        {/* ── Filters ───────────────────────────────────────────────── */}
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <Input
                aria-label="Search the audit trail"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action, entity, id, actor or IP…"
                className="pl-9"
              />
            </div>

            <Select
              label="Action"
              value={filters.action ?? ''}
              onChange={(v) => setFilter('action', v)}
              placeholder="All actions"
              options={[
                { value: '', label: 'All actions' },
                ...(facetsQuery.data?.actions ?? []).map((a) => ({ value: a, label: a })),
              ]}
            />

            <Select
              label="Entity"
              value={filters.entity ?? ''}
              onChange={(v) => setFilter('entity', v)}
              placeholder="All entities"
              options={[
                { value: '', label: 'All entities' },
                ...(facetsQuery.data?.entities ?? []).map((e) => ({ value: e, label: e })),
              ]}
            />

            <Select
              label="Actor"
              value={filters.performedBy ?? ''}
              onChange={(v) => setFilter('performedBy', v)}
              placeholder="Anyone"
              options={[
                { value: '', label: 'Anyone' },
                ...(facetsQuery.data?.actors ?? []).map((a) => ({ value: a, label: a })),
              ]}
            />

            <Input
              type="date"
              label="From"
              value={filters.from ?? ''}
              onChange={(e) => setFilter('from', e.target.value)}
            />
            <Input
              type="date"
              label="To"
              value={filters.to ?? ''}
              onChange={(e) => setFilter('to', e.target.value)}
            />

            {/* Entries older than 90 days are archived by the retention sweep and
                drop out of the working trail. They are still here, and still
                verifiable, until the 180-day delete — this is the only way to
                reach them, so without it "no results" would be indistinguishable
                from "that period has been archived". */}
            <label className="flex h-10 items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={!!filters.includeArchived}
                onChange={(e) => setFilter('includeArchived', e.target.checked)}
              />
              Include archived
            </label>
          </div>

          {activeCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                {activeCount} filter{activeCount === 1 ? '' : 's'} active
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
              >
                <X className="h-3 w-3" aria-hidden="true" /> Clear
              </button>
            </div>
          )}
        </section>

        {/* ── Table ─────────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {listQuery.isLoading && (
            <div className="flex justify-center p-10">
              <Spinner />
            </div>
          )}

          {listQuery.isError && (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--error)]">Could not load the audit trail.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void listQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}

          {!listQuery.isLoading && !listQuery.isError && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              {activeCount > 0
                ? 'No entries match these filters.'
                : 'No audit entries yet. Actions taken in the console will appear here.'}
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Audit trail entries, newest first</caption>
                <thead className="bg-[var(--bg-secondary)] text-left text-xs text-[var(--text-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      When
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Entity
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Actor
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      IP
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Integrity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(row);
                        }
                      }}
                      className="focus-visible:ring-primary/40 cursor-pointer hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-[var(--text-muted)]">
                        {new Date(row.createdAt).toLocaleString()}
                        {row.isArchived && (
                          <span
                            title="Archived by the retention sweep — kept, but out of the default view"
                            className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600"
                          >
                            ARCHIVED
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-medium text-[var(--text)]">{row.action}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {row.entity}
                        {row.entityId && (
                          <span className="ml-1 font-mono text-xs text-[var(--text-muted)]">
                            {row.entityId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {row.performedBy ?? '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-[var(--text-muted)]">
                        {row.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <IntegrityBadge state={row.integrity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(listQuery.data?.totalPages ?? 1) > 1 && (
            <div className="px-4 py-3">
              <Pagination
                currentPage={page}
                totalPages={listQuery.data?.totalPages ?? 1}
                onPageChange={setPage}
                totalItems={listQuery.data?.total ?? 0}
                pageSize={limit}
                onPageSizeChange={(n) => {
                  setLimit(n);
                  setPage(1);
                }}
              />
            </div>
          )}
        </section>

        {/* ── Activity over time ────────────────────────────────────── */}
        {stats && stats.perDay.length > 0 && (
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Activity, last 30 days</h2>
              {stats.perDayTruncated && (
                <span className="text-xs text-[var(--text-muted)]">
                  partial — capped at 20,000 entries
                </span>
              )}
            </div>
            <ActivityChart data={stats.perDay} />
          </section>
        )}

        {/* ── Busiest actions ───────────────────────────────────────── */}
        {stats && stats.byAction.length > 0 && (
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Most frequent actions</h2>
            <ul className="space-y-2">
              {stats.byAction.map((a) => {
                const pct = stats.total ? Math.round((a.count / stats.total) * 100) : 0;
                return (
                  <li key={a.action} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFilter('action', a.action)}
                      className="text-primary w-56 shrink-0 truncate text-left text-xs hover:underline"
                    >
                      {a.action}
                    </button>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-[var(--text-muted)]">
                      {a.count.toLocaleString('en-IN')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* ── Detail ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title="Audit entry"
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <AuditEntryDetail entry={selected} />

            {/* The modal is reachable only from a row the current filter happened
                to return; the page behind this link is the address to paste into
                a ticket or an incident write-up. */}
            <div className="flex justify-end border-t border-[var(--border)] pt-3">
              <Link
                href={`/whatsapp/audit/${selected.id}`}
                className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
              >
                Open this entry on its own page
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

/**
 * Day-by-day volume as a plain CSS bar strip.
 *
 * No charting dependency: this is one series of non-negative integers, and a
 * flex row of divs renders it accurately at every width. The table below is the
 * accessible representation — the bars are decorative and hidden from readers.
 */
function ActivityChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((n, d) => n + d.count, 0);

  return (
    <div>
      <div className="flex h-24 items-end gap-1" aria-hidden="true">
        {data.map((d) => (
          <div
            key={d.day}
            title={`${new Date(d.day).toLocaleDateString()} — ${d.count.toLocaleString('en-IN')}`}
            className="bg-primary/70 hover:bg-primary min-w-[3px] flex-1 rounded-t transition-colors"
            style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {total.toLocaleString('en-IN')} entries across {data.length} day
        {data.length === 1 ? '' : 's'}, peak {max.toLocaleString('en-IN')} in a day.
      </p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}
