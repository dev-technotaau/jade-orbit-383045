'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  Plus,
  Search,
  ShieldX,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import PhoneInput from '@/components/ui/PhoneInput';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/dialog-service';
import { formatDate } from '@/lib/utils';
import { parseContactsFile, parseContactsText } from '@/lib/parse-contacts';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSuppression } from '@/types/whatsapp';

/**
 * Bulk-load a supplied do-not-contact list.
 *
 * A legally supplied DNC list arrives as a file or a pasted column, never as
 * numbers typed one at a time — which was the only way in. Reuses the contact
 * import parsers (CSV / XLSX / JSON / vCard / paste) and keeps only the phone
 * column; names and tags are meaningless on a blocklist.
 */
function ImportSuppressionsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [filePhones, setFilePhones] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [reason, setReason] = useState('');

  const phones = filePhones ?? parseContactsText(pasted).rows.map((r) => r.phone);

  const clearFile = () => {
    setFilePhones(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseContactsFile(file);
      if (parsed.rows.length === 0) {
        showToast.error('No phone numbers found in that file');
        clearFile();
        return;
      }
      setFilePhones(parsed.rows.map((r) => r.phone));
      setFileName(file.name);
    } catch (err) {
      showToast.error((err as Error).message || 'Could not parse that file');
      clearFile();
    } finally {
      setParsing(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => svc.importSuppressions(phones, reason.trim() || undefined),
    onSuccess: (res) => {
      const result = res.data;
      showToast.success(
        `${result?.added ?? 0} number(s) suppressed` +
          (result?.duplicates ? `, ${result.duplicates} already on the list` : '') +
          (result?.skipped ? `, ${result.skipped} unusable` : ''),
      );
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
      onClose();
    },
    onError: (e) => showToast.error(errorMessage(e, 'Import failed')),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Import do-not-contact list"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={phones.length === 0}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Suppress {phones.length > 0 ? phones.length.toLocaleString('en-IN') : ''} number
            {phones.length === 1 ? '' : 's'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Upload a CSV, Excel (.xlsx), JSON or vCard file — or paste one number per line. Up to
          5,000 numbers. Every number is excluded from every campaign send, whatever their opt-in
          status says.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.vcf,text/csv,application/json,text/vcard"
          onChange={onFileChange}
          className="hidden"
        />
        {filePhones ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <FileUp className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate text-sm text-[var(--text)]">{fileName}</span>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="hover:border-primary flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-6 text-center transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileUp className="h-6 w-6 text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text)]">
              {parsing ? 'Parsing…' : 'Choose a file to upload'}
            </span>
            <span className="text-xs text-[var(--text-muted)]">CSV, XLSX, JSON, or vCard</span>
          </button>
        )}

        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or paste
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={5}
          disabled={!!filePhones}
          placeholder={'+919876543210\n+14155550123'}
        />
        <Input
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Regulator DNC list — Aug 2026"
        />
      </div>
    </Modal>
  );
}

/**
 * Suppression list — the global do-not-contact list. Numbers added here are
 * excluded from every campaign send. Supports adding a number (phone + optional
 * reason), bulk import, CSV export, search and removal. Backed by
 * listSuppressions / addSuppression / importSuppressions / removeSuppression;
 * invalidates `wa-suppressions`.
 */
export default function SuppressionListManager() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [importing, setImporting] = useState(false);

  // The input stays instant; the QUERY runs on a 300ms-settled value — every
  // keystroke is otherwise a LIKE across a table one bulk suppress can push six
  // figures of rows into. Same treatment the contacts page gives its filters.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-suppressions', { debouncedSearch, page, limit }],
    queryFn: () => svc.listSuppressions({ q: debouncedSearch || undefined, page, limit }),
  });
  const entries = data?.data?.items ?? [];
  const total = data?.data?.total ?? entries.length;
  const totalPages = data?.data?.totalPages ?? 1;

  const addMut = useMutation({
    mutationFn: () => svc.addSuppression(phone.trim(), reason.trim() || undefined),
    onSuccess: () => {
      showToast.success('Number added to suppression list');
      setPhone('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to add number')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => svc.removeSuppression(id),
    onSuccess: () => {
      showToast.success('Number removed from suppression list');
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to remove number')),
  });

  const submit = () => {
    if (!phone.trim()) return showToast.error('Enter a phone number');
    addMut.mutate();
  };

  const handleRemove = async (entry: WaSuppression) => {
    const ok = await confirmDialog({
      title: 'Remove from suppression list',
      message: `Remove ${entry.phone} from the suppression list?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (ok) {
      removeMut.mutate(entry.id);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <ShieldX className="h-4 w-4 text-red-600" /> Suppression list
            {total > 0 && (
              <span className="text-xs font-normal text-[var(--text-muted)]">
                {total.toLocaleString('en-IN')} number{total === 1 ? '' : 's'}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            A global do-not-contact list. Numbers added here are permanently excluded from every
            campaign send, regardless of audience or segment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => svc.exportSuppressions(debouncedSearch || undefined)}
          >
            Export
          </Button>
          <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
            Import
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {/* Add number form */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <PhoneInput
              label="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Bounced / spam complaint"
            />
          </div>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            isLoading={addMut.isPending}
            onClick={submit}
          >
            Add number
          </Button>
        </div>
      </div>

      {/* Search. Without it there was no way to answer "is this number
          suppressed?" once the list outgrew a single screen. */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search a number or reason…"
          className="pl-9"
        />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading suppression list…
          </p>
        )}
        {isError && (
          <p className="p-4 text-center text-sm text-red-600">Failed to load suppression list.</p>
        )}
        {!isLoading && !isError && entries.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            {debouncedSearch
              ? 'No suppressed number matches that search.'
              : 'No suppressed numbers yet.'}
          </p>
        )}

        {!isLoading && !isError && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium text-[var(--text)]">
                      {entry.phone}
                    </td>
                    {/* Who this number belongs to. The table showed a bare number
                        with nothing linking it back, so answering "which customer
                        is this, and why?" meant retyping the digits into the
                        contacts search. A number from a supplied DNC list has no
                        contact row at all, which is what the dash means. */}
                    <td className="px-4 py-2.5">
                      {entry.contactId ? (
                        <Link
                          href={`${ROUTES.SUPER_ADMIN.WHATSAPP_CONTACTS}?q=${encodeURIComponent(entry.phone)}`}
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          {entry.contactName || 'View contact'}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {entry.reason || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Remove"
                          isLoading={removeMut.isPending && removeMut.variables === entry.id}
                          onClick={() => handleRemove(entry)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
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
      )}

      {importing && <ImportSuppressionsModal onClose={() => setImporting(false)} />}
    </section>
  );
}
