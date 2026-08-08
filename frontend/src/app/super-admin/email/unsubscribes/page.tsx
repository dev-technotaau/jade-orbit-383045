'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailX, Search, RotateCcw, Trash2, Download } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { handleBulkResult } from '@/lib/email-bulk';
import { useBulkSelect, downloadBlob } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';

/** Opt-out methods recorded by the backend. */
const METHOD_OPTIONS = ['link', 'one_click', 'reply_stop', 'manual'] as const;

export default function SuperAdminEmailUnsubscribesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const sel = useBulkSelect();
  const [confirmResubscribe, setConfirmResubscribe] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-unsubscribes', q, method, page, limit],
    queryFn: () =>
      svc.listUnsubscribes({
        q: q || undefined,
        method: method || undefined,
        page,
        limit,
      }),
  });

  const rows = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const pageIds = rows.map((r) => r.id);

  /** Current list filter (no pagination) — used for select-all-across-filter + export. */
  function currentFilter(): { q?: string; method?: string } {
    return { q: q || undefined, method: method || undefined };
  }
  /** Bulk scope: whole filter when "select all matching" is engaged, else the checked ids. */
  function scope(): { ids?: string[]; filter?: { q?: string; method?: string } } {
    return sel.allMatching ? { filter: currentFilter() } : { ids: sel.ids };
  }

  function clearAndRefresh() {
    sel.clear();
    qc.invalidateQueries({ queryKey: ['email-unsubscribes'] });
  }

  async function bulkResubscribe() {
    try {
      const res = await svc.bulkResubscribe(scope());
      handleBulkResult(res.data, { qc, label: 'Re-subscribed' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not re-subscribe');
    } finally {
      setConfirmResubscribe(false);
    }
  }

  async function bulkDelete() {
    try {
      const res = await svc.bulkDeleteUnsubscribes(scope());
      handleBulkResult(res.data, { qc, label: 'Deleted unsubscribe records' });
      clearAndRefresh();
    } catch {
      showToast.error('Delete failed');
    } finally {
      setConfirmDelete(false);
    }
  }

  async function exportCsv() {
    try {
      downloadBlob(await svc.exportUnsubscribes(currentFilter()), 'email-unsubscribes.csv');
    } catch {
      showToast.error('Export failed');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.unsubscribes.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <MailX className="h-6 w-6 text-red-600" /> Unsubscribes
          </h1>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
          >
            Export
          </Button>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Recipients who opted out of email. Records the opt-out method and, when available, the
          campaign that triggered it.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search email…"
              className="w-64 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
          <div className="w-44">
            <Select
              options={METHOD_OPTIONS.map((m) => ({ value: m, label: m }))}
              value={method}
              onChange={(v) => {
                setMethod(v);
                setPage(1);
              }}
              placeholder="All methods"
            />
          </div>
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={sel.allMatching}
            totalMatching={total}
            allOnPage={sel.allOnPage(pageIds)}
            entity="unsubscribes"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
          >
            <BulkButton icon={RotateCcw} onClick={() => setConfirmResubscribe(true)}>
              Re-subscribe
            </BulkButton>
            <BulkButton icon={Download} onClick={exportCsv}>
              Export
            </BulkButton>
            <BulkButton icon={Trash2} danger onClick={() => setConfirmDelete(true)}>
              Delete records
            </BulkButton>
          </BulkBar>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[var(--text-muted)]">
                <th className="px-4 py-2.5">
                  <HeaderCheckbox
                    checked={sel.allMatching || sel.allOnPage(pageIds)}
                    indeterminate={sel.someOnPage(pageIds)}
                    onChange={(on) => sel.setPage(pageIds, on)}
                    title="Select page"
                  />
                </th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 font-semibold">Campaign</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No unsubscribes yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                >
                  <td className="px-4 py-2.5">
                    <RowCheckbox checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[var(--text)]">{r.email}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{r.method}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                    {r.campaignId ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          pageSize={limit}
          onPageSizeChange={(s) => {
            setLimit(s);
            setPage(1);
          }}
        />
      </div>

      <ConfirmDialog
        isOpen={confirmResubscribe}
        onClose={() => setConfirmResubscribe(false)}
        onConfirm={bulkResubscribe}
        title="Re-subscribe recipients"
        message={
          sel.allMatching
            ? `Re-subscribe all ${total.toLocaleString()} recipients matching the current filter? This opts them back in, lifts their suppression, and removes these unsubscribe records.`
            : `Re-subscribe ${sel.count} recipient${sel.count === 1 ? '' : 's'}? This opts them back in, lifts their suppression, and removes these unsubscribe records.`
        }
        confirmLabel="Re-subscribe"
      />
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkDelete}
        title="Delete unsubscribe records"
        message={
          sel.allMatching
            ? `Permanently delete all ${total.toLocaleString()} unsubscribe records matching the current filter? This cannot be undone.`
            : `Permanently delete ${sel.count} unsubscribe record${sel.count === 1 ? '' : 's'}? This cannot be undone.`
        }
        confirmLabel="Delete"
      />
    </DashboardLayout>
  );
}
