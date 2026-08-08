'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Upload, Download, X, Search, Ban, BadgeCheck, Pencil, FileUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Checkbox from '@/components/ui/Checkbox';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { parseContactsText, parseContactsFile, type ImportRow } from '@/lib/parse-contacts';
import ContactDpdpActions from '@/components/whatsapp/ContactDpdpActions';
import ContactBulkActionBar from '@/components/whatsapp/ContactBulkActionBar';
import ContactSegmentBar from '@/components/whatsapp/ContactSegmentBar';
import Pagination from '@/components/ui/Pagination';
import { ROLE_LABELS } from '@/constants/enums';
import type { WaContact } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const OPT_IN_OPTIONS = [
  { value: '', label: 'All opt-in states' },
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'OPTED_OUT', label: 'Opted out' },
  { value: 'UNKNOWN', label: 'Unknown' },
];
const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'CANDIDATE', label: ROLE_LABELS.CANDIDATE },
  { value: 'EMPLOYER', label: ROLE_LABELS.EMPLOYER },
  { value: 'ADMIN', label: ROLE_LABELS.ADMIN },
  { value: 'SUPER_ADMIN', label: ROLE_LABELS.SUPER_ADMIN },
];
const PLATFORM_OPTIONS = [
  { value: '', label: 'On & off-platform' },
  { value: 'on', label: 'On-platform' },
  { value: 'off', label: 'Off-platform' },
];
const OPT_IN_STYLE: Record<string, string> = {
  OPTED_IN: 'bg-emerald-100 text-emerald-700',
  OPTED_OUT: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [fileRows, setFileRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A parsed file takes precedence over the paste box; otherwise parse the
  // textarea live so the count stays in sync as you type.
  const rows = fileRows ?? parseContactsText(csv);

  const mutation = useMutation({
    mutationFn: () => svc.importContacts({ optIn, contacts: rows }),
    onSuccess: (res) => {
      const d = res.data;
      showToast.success(
        `Imported: ${d?.created ?? 0} new, ${d?.updated ?? 0} updated, ${d?.skipped ?? 0} skipped`,
      );
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Import failed'),
  });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseContactsFile(file);
      if (parsed.length === 0) {
        showToast.error('No contacts found in that file');
        clearFile();
        return;
      }
      setFileRows(parsed);
      setFileName(file.name);
    } catch (err) {
      showToast.error((err as Error).message || 'Could not parse that file');
      clearFile();
    } finally {
      setParsing(false);
    }
  };

  const clearFile = () => {
    setFileRows(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Import contacts</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Upload a CSV, Excel (.xlsx), JSON, or vCard (.vcf) file — or paste below. Up to 5,000
          contacts.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.vcf,text/csv,application/json,text/vcard"
          onChange={onFileChange}
          className="hidden"
        />
        {fileRows ? (
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

        <div className="my-4 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or paste
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <p className="mb-2 text-xs text-[var(--text-muted)]">
          One contact per line: <code>phone,name,tag1;tag2</code> (name &amp; tags optional).
        </p>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          disabled={!!fileRows}
          placeholder={'+919876543210,Asha Verma,leads;mumbai\n+14155550123,John'}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Mark these contacts as opted-in (you have consent)
        </label>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">{rows.length} rows detected</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              isLoading={mutation.isPending}
              disabled={!rows.length}
            >
              Import {rows.length || ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModal({ contact, onClose }: { contact: WaContact; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(contact.name ?? '');
  const [tags, setTags] = useState(contact.tags.join(', '));

  const mutation = useMutation({
    mutationFn: () =>
      svc.updateContact(contact.id, {
        name: name.trim() || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      showToast.success('Contact updated');
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Edit contact</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">{contact.phone}</p>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="leads, mumbai"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminWhatsappContactsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [optInStatus, setOptInStatus] = useState('');
  const [role, setRole] = useState(''); // on-platform user role (implies on-platform)
  const [onPlatform, setOnPlatform] = useState(''); // '' | 'on' | 'off'
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<WaContact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all N matching the filter" (acts via backend filters, not the id list).
  const [allMatchingContacts, setAllMatchingContacts] = useState(false);

  const onPlatformBool = onPlatform === 'on' ? true : onPlatform === 'off' ? false : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['wa-contacts', { search, optInStatus, role, onPlatform, tag, page, limit }],
    queryFn: () =>
      svc.listContacts({
        q: search,
        optInStatus: optInStatus || undefined,
        role: role || undefined,
        onPlatform: onPlatformBool,
        tag: tag || undefined,
        page,
        limit,
      }),
  });
  const contacts = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const totalMatching = data?.data?.total ?? contacts.length;

  // Reset all-matching when the filter (not the page) changes.
  const contactFilterKey = `${search}|${optInStatus}|${role}|${onPlatform}|${tag}`;
  const [prevContactFilterKey, setPrevContactFilterKey] = useState(contactFilterKey);
  if (contactFilterKey !== prevContactFilterKey) {
    setPrevContactFilterKey(contactFilterKey);
    setAllMatchingContacts(false);
  }

  // Drop any selected ids no longer present on the page (after paging, filtering,
  // erasing, or invalidation). Render-time + keyed by the actual id set so it
  // only runs when the visible contacts change (no setState-in-effect).
  const contactIdsKey = contacts.map((c) => c.id).join(',');
  const [prunedKey, setPrunedKey] = useState(contactIdsKey);
  if (contactIdsKey !== prunedKey) {
    setPrunedKey(contactIdsKey);
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(contacts.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (present.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }

  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)),
    );
    setAllMatchingContacts(false);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setAllMatchingContacts(false);
  };

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof svc.updateContact>[1] }) =>
      svc.updateContact(vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-contacts'] }),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.contacts.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Users className="h-6 w-6 text-emerald-600" /> WhatsApp Contacts
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() =>
                svc.exportContacts({
                  optInStatus: optInStatus || undefined,
                  role: role || undefined,
                  onPlatform: onPlatformBool,
                  tag: tag || undefined,
                  q: search || undefined,
                })
              }
            >
              Export
            </Button>
            <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
              Import
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or number…"
              className="pl-9"
            />
          </div>
          <div className="min-w-[160px]">
            <Select
              options={OPT_IN_OPTIONS}
              value={optInStatus}
              onChange={(v) => {
                setOptInStatus(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[150px]">
            <Select
              options={ROLE_OPTIONS}
              value={role}
              clearable={false}
              onChange={(v) => {
                setRole(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[150px]">
            <Select
              options={PLATFORM_OPTIONS}
              value={onPlatform}
              clearable={false}
              onChange={(v) => {
                setOnPlatform(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[150px]">
            <Input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by tag…"
            />
          </div>
          <ContactSegmentBar
            current={{ optInStatus, role, onPlatform, tag }}
            onApply={(c) => {
              setOptInStatus(c.optInStatus ?? '');
              setRole(c.role ?? '');
              setOnPlatform(c.onPlatform ?? '');
              setTag(c.tag ?? '');
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && contacts.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No contacts. Import a list, or they appear automatically when people message you.
            </p>
          )}
          {!isLoading && contacts.length > 0 && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
              <Checkbox
                aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all on page'}
              </span>
            </div>
          )}
          {contacts.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3',
                selectedIds.has(c.id) && 'bg-[var(--info-light)]',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Checkbox
                  aria-label={`Select ${c.name || c.phone}`}
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-[var(--text)]">
                      {c.name || c.phone}
                    </span>
                    {c.userId && <BadgeCheck className="h-3.5 w-3.5 text-[var(--primary)]" />}
                    {c.isBlocked && <Ban className="h-3.5 w-3.5 text-[var(--error)]" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.phone} · {c.userId ? 'on-platform' : 'off-platform'}
                    {c.tags.length > 0 && ` · ${c.tags.join(', ')}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    OPT_IN_STYLE[c.optInStatus],
                  )}
                >
                  {c.optInStatus.replace('_', ' ')}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateMut.mutate({
                      id: c.id,
                      body: {
                        optInStatus: c.optInStatus === 'OPTED_OUT' ? 'OPTED_IN' : 'OPTED_OUT',
                      },
                    })
                  }
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)]"
                >
                  {c.optInStatus === 'OPTED_OUT' ? 'Opt in' : 'Opt out'}
                </button>
                <button
                  type="button"
                  onClick={() => updateMut.mutate({ id: c.id, body: { isBlocked: !c.isBlocked } })}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)]"
                >
                  {c.isBlocked ? 'Unblock' : 'Block'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  aria-label="Edit contact"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <ContactDpdpActions contact={c} />
              </div>
            </div>
          ))}
        </div>

        {(selectedIds.size > 0 || allMatchingContacts) && (
          <ContactBulkActionBar
            ids={[...selectedIds]}
            totalMatching={totalMatching}
            allMatching={allMatchingContacts}
            filters={{
              q: search || undefined,
              optInStatus: optInStatus || undefined,
              role: role || undefined,
              onPlatform: onPlatformBool,
              tag: tag || undefined,
            }}
            onSelectAllMatching={() => setAllMatchingContacts(true)}
            onClear={clearSelection}
            onDone={clearSelection}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={totalMatching}
          pageSize={limit}
          onPageSizeChange={(s) => {
            setLimit(s);
            setPage(1);
          }}
        />
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {editing && <EditModal contact={editing} onClose={() => setEditing(null)} />}
    </DashboardLayout>
  );
}
