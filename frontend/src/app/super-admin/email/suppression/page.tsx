'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Trash2, Search, Download, Upload, FileUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';
import { API } from '@/constants/api';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { useBulkSelect, downloadBlob } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import { parseEmailContactsFile } from '@/lib/parse-contacts-email';
import { handleBulkResult } from '@/lib/email-bulk';

const REASON_STYLE: Record<string, string> = {
  hard_bounce: 'bg-red-100 text-red-700',
  soft_bounce: 'bg-orange-100 text-orange-700',
  complaint: 'bg-red-100 text-red-700',
  unsubscribe: 'bg-gray-100 text-gray-600',
  manual: 'bg-blue-100 text-blue-700',
  erasure: 'bg-purple-100 text-purple-700',
};

const REASONS = Object.keys(REASON_STYLE);

export default function SuperAdminEmailSuppressionPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const sel = useBulkSelect();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-suppressions', q, reason],
    queryFn: () => svc.listSuppressions({ q: q || undefined, reason: reason || undefined }),
  });
  const rows = data?.data ?? [];
  const pageIds = rows.map((r) => r.id);

  /** Current list filter — used for select-all-across-filter bulk delete + export. */
  function currentFilter(): { q?: string; reason?: string } {
    return { q: q || undefined, reason: reason || undefined };
  }
  /** Bulk scope: whole filter when "select all matching" is engaged, else the checked ids. */
  function scope(): { ids?: string[]; filter?: { q?: string; reason?: string } } {
    return sel.allMatching ? { filter: currentFilter() } : { ids: sel.ids };
  }

  function clearAndRefresh() {
    sel.clear();
    qc.invalidateQueries({ queryKey: ['email-suppressions'] });
  }

  async function add() {
    if (!newEmail.trim()) return;
    try {
      await svc.addSuppression({ email: newEmail.trim(), reason: 'manual' });
      showToast.success('Added to suppression list');
      setNewEmail('');
      qc.invalidateQueries({ queryKey: ['email-suppressions'] });
    } catch {
      showToast.error('Could not add');
    }
  }

  async function bulkRemove() {
    try {
      const res = await svc.bulkDeleteSuppressions(scope());
      handleBulkResult(res.data, { qc, label: 'Removed suppressions' });
      clearAndRefresh();
    } catch {
      showToast.error('Remove failed');
    } finally {
      setConfirmDelete(false);
    }
  }

  async function exportSelected() {
    try {
      const res = await api.get(API.SUPER_ADMIN.EMAIL_SUPPRESSIONS_EXPORT, {
        params: currentFilter(),
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, 'email-suppressions.csv');
    } catch {
      showToast.error('Export failed');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.suppression.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Shield className="h-6 w-6 text-red-600" /> Suppression List
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={async () => {
                try {
                  const blob = await svc.suppressionsExport();
                  downloadBlob(blob, 'email-suppressions.csv');
                } catch {
                  showToast.error('Export failed');
                }
              }}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Emails here never receive a campaign — enforced pre-send. Populated by hard bounces,
          complaints, unsubscribes, and manual blocklisting.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <Input
              label="Add email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
            Suppress
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-56 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
          <div className="w-44">
            <Select
              options={REASONS.map((r) => ({ value: r, label: r }))}
              value={reason}
              onChange={(v) => setReason(v)}
              placeholder="All reasons"
            />
          </div>
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={sel.allMatching}
            totalMatching={rows.length}
            allOnPage={sel.allOnPage(pageIds)}
            entity="addresses"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
          >
            <BulkButton icon={Download} onClick={exportSelected}>
              Export
            </BulkButton>
            <BulkButton icon={Trash2} danger onClick={() => setConfirmDelete(true)}>
              Remove
            </BulkButton>
          </BulkBar>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {rows.length > 0 && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
              <HeaderCheckbox
                checked={sel.allMatching || sel.allOnPage(pageIds)}
                indeterminate={sel.someOnPage(pageIds)}
                onChange={(on) => sel.setPage(pageIds, on)}
                title="Select page"
              />
              <span>Email</span>
            </div>
          )}
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              Suppression list is empty.
            </p>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 hover:bg-[var(--bg-secondary)]"
            >
              <RowCheckbox checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} />
              <span className="flex-1 truncate font-medium text-[var(--text)]">{r.email}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REASON_STYLE[r.reason ?? 'manual'] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {r.reason ?? 'manual'}
              </span>
              <Tooltip content="Remove">
                <button
                  onClick={async () => {
                    if (
                      !(await confirmDialog({
                        title: 'Remove from suppression',
                        message: `Remove ${r.email} from the suppression list? It will be able to receive campaigns again.`,
                        confirmLabel: 'Remove',
                        variant: 'danger',
                      }))
                    )
                      return;
                    await svc.removeSuppression(r.id);
                    qc.invalidateQueries({ queryKey: ['email-suppressions'] });
                  }}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkRemove}
        title="Remove from suppression list"
        message={
          (sel.allMatching
            ? `Remove all ${rows.length.toLocaleString()} addresses matching the current filter from the suppression list? `
            : `Remove ${sel.count} address${sel.count === 1 ? '' : 'es'} from the suppression list? `) +
          'These addresses will be able to receive campaigns again. Re-enabling a hard-bounced or complained address can seriously damage sending reputation.'
        }
        confirmLabel="Remove"
      />
    </DashboardLayout>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [paste, setPaste] = useState('');
  const [reason, setReason] = useState('manual');
  const [busy, setBusy] = useState(false);

  // Upload mode state
  const [fileEmails, setFileEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const pastedEmails = paste
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setParsing(true);
    setParseError('');
    setFileName(file.name);
    try {
      const parsed = await parseEmailContactsFile(file);
      const emails = parsed.map((p) => p.email).filter(Boolean);
      setFileEmails(emails);
      if (emails.length === 0) setParseError('No valid emails found in that file.');
    } catch (err) {
      setFileEmails([]);
      setParseError(err instanceof Error ? err.message : 'Could not parse that file.');
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    const emails = mode === 'upload' ? fileEmails : pastedEmails;
    if (emails.length === 0) return;
    setBusy(true);
    try {
      const rows = emails.map((email) => ({ email, reason: reason || undefined }));
      const res = await svc.importSuppressions(rows);
      showToast.success(
        `Imported ${res.data?.imported ?? 0}, skipped ${res.data?.skipped ?? 0} of ${res.data?.total ?? emails.length}`,
      );
      qc.invalidateQueries({ queryKey: ['email-suppressions'] });
      onClose();
    } catch {
      showToast.error('Import failed');
    } finally {
      setBusy(false);
    }
  }

  const count = mode === 'upload' ? fileEmails.length : pastedEmails.length;
  const importDisabled = busy || count === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Import suppressions</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Bulk-add addresses that must never receive a campaign. Duplicates are skipped.
        </p>

        <div className="mb-3 inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
          <button
            onClick={() => setMode('paste')}
            className={`rounded-md px-3 py-1 font-medium ${
              mode === 'paste' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            Paste
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`rounded-md px-3 py-1 font-medium ${
              mode === 'upload' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            Upload file
          </button>
        </div>

        {mode === 'paste' ? (
          <>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={8}
              placeholder={'user@example.com\nother@example.com'}
              className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              One email per line, or separated by commas/semicolons.
            </p>
          </>
        ) : (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-[var(--border)] bg-[var(--bg-secondary)]'
              }`}
            >
              <FileUp className="h-6 w-6 text-blue-600" />
              <span className="font-medium text-[var(--text)]">
                {fileName || 'Drop a file here or click to browse'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                CSV, XLSX, JSON, or vCard (.vcf)
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.json,.vcf,text/csv,application/json"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            {parsing && <p className="mt-2 text-xs text-[var(--text-muted)]">Parsing…</p>}
            {parseError && <p className="mt-2 text-xs text-red-600">{parseError}</p>}
            {fileEmails.length > 0 && !parsing && (
              <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-xs">
                <p className="font-medium text-emerald-700">Parsed {fileEmails.length} emails</p>
                <p className="mt-1 truncate text-[var(--text-muted)]">
                  {fileEmails.slice(0, 5).join(', ')}
                  {fileEmails.length > 5 ? ` +${fileEmails.length - 5} more` : ''}
                </p>
              </div>
            )}
          </>
        )}

        <div className="mt-3">
          <Select
            label="Reason"
            options={REASONS.map((r) => ({ value: r, label: r }))}
            value={reason}
            onChange={(v) => setReason(v)}
            clearable={false}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-muted)]">
            {count > 0 ? `${count} address${count === 1 ? '' : 'es'} ready` : 'No addresses yet'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={busy} disabled={importDisabled} onClick={submit}>
              Import
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
