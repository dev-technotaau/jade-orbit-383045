'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Upload,
  Download,
  Search,
  Tag,
  Ban,
  Trash2,
  UserPlus,
  Pencil,
  Filter,
  Save,
  FileUp,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { API } from '@/constants/api';
import { ROUTES } from '@/constants/routes';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { handleBulkResult } from '@/lib/email-bulk';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import { parseEmailContactsFile, type EmailImportRow } from '@/lib/parse-contacts-email';
import type { EmailContact, EmailSubscribeStatus, EmailSegment } from '@/types/email';

const STATUS_STYLE: Record<string, string> = {
  SUBSCRIBED: 'bg-emerald-100 text-emerald-700',
  UNSUBSCRIBED: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-amber-100 text-amber-700',
  CLEANED: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-500',
};

const SUBSCRIBE_STATUSES: EmailSubscribeStatus[] = [
  'SUBSCRIBED',
  'UNSUBSCRIBED',
  'PENDING',
  'CLEANED',
  'UNKNOWN',
];

export default function SuperAdminEmailContactsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EmailSubscribeStatus | ''>('');
  const [onPlatform, setOnPlatform] = useState<'' | 'true' | 'false'>('');
  const [tag, setTag] = useState('');
  const [setId, setSetId] = useState('');
  const [segmentSel, setSegmentSel] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const sel = useBulkSelect();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EmailContact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-contacts', q, status, onPlatform, tag, setId, page, limit],
    queryFn: () =>
      svc.listContacts({
        q: q || undefined,
        subscribeStatus: status || undefined,
        onPlatform: onPlatform === '' ? undefined : onPlatform === 'true',
        tag: tag || undefined,
        setId: setId || undefined,
        page,
        limit,
      }),
  });
  const contacts = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);

  const { data: segData } = useQuery({
    queryKey: ['email-segments'],
    queryFn: () => svc.listSegments(),
  });
  const segments = segData?.data ?? [];

  const { data: setData } = useQuery({
    queryKey: ['email-sets'],
    queryFn: () => svc.listSets(),
  });
  const sets = setData?.data ?? [];

  const pageIds = contacts.map((c) => c.id);

  /** Current list filter (no pagination) — used for select-all-across-filter + export. */
  function currentFilter(): Record<string, unknown> {
    return {
      q: q || undefined,
      subscribeStatus: status || undefined,
      tag: tag || undefined,
      onPlatform: onPlatform === '' ? undefined : onPlatform === 'true',
      setId: setId || undefined,
    };
  }
  /** Bulk scope: whole filter when "select all matching" is engaged, else the checked ids. */
  function scope(): { contactIds?: string[]; filter?: Record<string, unknown> } {
    return sel.allMatching ? { filter: currentFilter() } : { contactIds: sel.ids };
  }

  function clearAndRefresh() {
    sel.clear();
    qc.invalidateQueries({ queryKey: ['email-contacts'] });
  }

  async function bulkTag(add: boolean) {
    const t = await promptDialog({
      title: add ? 'Add tag' : 'Remove tag',
      label: add ? 'Tag to add' : 'Tag to remove',
    });
    if (!t) return;
    try {
      const res = await svc.bulkTag({
        ...scope(),
        ...(add ? { addTags: [t] } : { removeTags: [t] }),
      });
      handleBulkResult(res.data, { qc, label: add ? 'Tagged' : 'Untagged' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not update tags');
    }
  }

  async function bulkSetStatus(s: EmailSubscribeStatus) {
    try {
      const res = await svc.bulkUpdateContacts({ ...scope(), subscribeStatus: s });
      handleBulkResult(res.data, { qc, label: 'Status updated' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not update status');
    }
  }

  async function bulkBlock(isBlocked: boolean) {
    try {
      const res = await svc.bulkUpdateContacts({ ...scope(), isBlocked });
      handleBulkResult(res.data, { qc, label: isBlocked ? 'Blocked' : 'Unblocked' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not update contacts');
    }
  }

  async function bulkDelete() {
    try {
      const res = await svc.bulkDeleteContacts(scope());
      handleBulkResult(res.data, { qc, label: 'Deleted contacts' });
      clearAndRefresh();
    } catch {
      showToast.error('Delete failed');
    } finally {
      setConfirmDelete(false);
    }
  }

  async function bulkAddToSet(targetSetId: string) {
    try {
      const res = sel.allMatching
        ? await svc.addSetMembersByAudience(targetSetId, {
            audienceType: 'upload',
            audienceFilter: currentFilter(),
          })
        : await svc.addSetMembers(targetSetId, sel.ids);
      showToast.success(`Added ${res.data?.added ?? 0} to set`);
      clearAndRefresh();
    } catch {
      showToast.error('Could not add to set');
    }
  }

  async function bulkRemoveFromSet(targetSetId: string) {
    if (sel.allMatching) {
      // Removing a whole filter from a set is unusual; resolve the ids via the set filter.
      showToast.error('Select specific contacts to remove from a set');
      return;
    }
    try {
      const res = await svc.removeSetMembers(targetSetId, sel.ids);
      handleBulkResult(res.data, { qc, label: 'Removed from set' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not remove from set');
    }
  }

  function applySegment(seg: EmailSegment) {
    const f = (seg.filter ?? {}) as Record<string, unknown>;
    const rawStatus = f.subscribeStatus;
    setStatus(
      typeof rawStatus === 'string' && (SUBSCRIBE_STATUSES as string[]).includes(rawStatus)
        ? (rawStatus as EmailSubscribeStatus)
        : '',
    );
    const op = f.onPlatform;
    if (op === true || op === 'true') setOnPlatform('true');
    else if (op === false || op === 'false') setOnPlatform('false');
    else setOnPlatform('');
    setTag(typeof f.tag === 'string' ? f.tag : '');
    setPage(1);
  }

  function onSegmentChange(value: string) {
    setSegmentSel(value);
    if (!value) return;
    const seg = segments.find((s) => s.id === value);
    if (seg) applySegment(seg);
  }

  async function saveSegment() {
    const name = await promptDialog({ title: 'Save segment', label: 'Name this segment' });
    if (!name?.trim()) return;
    const filter: Record<string, unknown> = {};
    if (tag) filter.tag = tag;
    if (status) filter.subscribeStatus = status;
    if (onPlatform) filter.onPlatform = onPlatform === 'true';
    try {
      await svc.createSegment({ name: name.trim(), filter });
      showToast.success('Segment saved');
      qc.invalidateQueries({ queryKey: ['email-segments'] });
    } catch {
      showToast.error('Could not save segment');
    }
  }

  async function download(selectedOnly = false) {
    try {
      const params =
        selectedOnly && !sel.allMatching
          ? { ids: sel.ids.join(',') }
          : {
              q: q || undefined,
              subscribeStatus: status || undefined,
              tag: tag || undefined,
              onPlatform: onPlatform === '' ? undefined : onPlatform,
              setId: setId || undefined,
            };
      const res = await api.get(API.SUPER_ADMIN.EMAIL_CONTACTS_EXPORT, {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedOnly ? 'email-contacts-selected.csv' : 'email-contacts.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast.error('Export failed');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.contacts.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Users className="h-6 w-6 text-blue-600" /> Email Contacts
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => download(false)}
            >
              Export
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              Add contact
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search email or name…"
              className="w-64 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
          <div className="w-44">
            <Select
              placeholder="All statuses"
              options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
              value={status}
              onChange={(v) => {
                setStatus(v as EmailSubscribeStatus | '');
                setPage(1);
              }}
            />
          </div>
          <div className="w-48">
            <Select
              options={[
                { value: '', label: 'On + off platform' },
                { value: 'true', label: 'On-platform' },
                { value: 'false', label: 'Off-platform' },
              ]}
              value={onPlatform}
              onChange={(v) => {
                setOnPlatform(v as '' | 'true' | 'false');
                setPage(1);
              }}
              clearable={false}
            />
          </div>
          <div className="relative">
            <Tag className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by tag…"
              className="w-44 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
            <Filter className="h-4 w-4" /> Segments &amp; sets
          </span>
          <div className="w-52">
            <Select
              size="sm"
              placeholder="Apply saved segment…"
              options={segments.map((s) => ({ value: s.id, label: s.name }))}
              value={segmentSel}
              onChange={(v) => onSegmentChange(v)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Save className="h-3.5 w-3.5" />}
            onClick={saveSegment}
          >
            Save current filter
          </Button>
          <div className="w-52">
            <Select
              size="sm"
              placeholder="All sets"
              options={sets.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.memberCount})`,
              }))}
              value={setId}
              onChange={(v) => {
                setSetId(v);
                setPage(1);
              }}
            />
          </div>
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={sel.allMatching}
            totalMatching={total}
            allOnPage={sel.allOnPage(pageIds)}
            entity="contacts"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
          >
            <BulkButton icon={Tag} onClick={() => bulkTag(true)}>
              Add tag
            </BulkButton>
            <BulkButton icon={Tag} onClick={() => bulkTag(false)}>
              Remove tag
            </BulkButton>
            <div className="w-40">
              <Select
                size="sm"
                placeholder="Set status…"
                options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
                value=""
                onChange={(v) => {
                  if (v) bulkSetStatus(v as EmailSubscribeStatus);
                }}
              />
            </div>
            <BulkButton icon={Ban} onClick={() => bulkBlock(true)}>
              Block
            </BulkButton>
            <BulkButton onClick={() => bulkBlock(false)}>Unblock</BulkButton>
            <div className="w-44">
              <Select
                size="sm"
                placeholder="＋ Add to set…"
                options={sets.map((s) => ({ value: s.id, label: s.name }))}
                value=""
                onChange={(v) => {
                  if (v) bulkAddToSet(v);
                }}
              />
            </div>
            {!sel.allMatching && (
              <div className="w-48">
                <Select
                  size="sm"
                  placeholder="－ Remove from set…"
                  options={sets.map((s) => ({ value: s.id, label: s.name }))}
                  value=""
                  onChange={(v) => {
                    if (v) bulkRemoveFromSet(v);
                  }}
                />
              </div>
            )}
            <BulkButton icon={Download} onClick={() => download(true)}>
              Export
            </BulkButton>
            <BulkButton icon={Trash2} danger onClick={() => setConfirmDelete(true)}>
              Delete
            </BulkButton>
          </BulkBar>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {contacts.length > 0 && (
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
          {!isLoading && contacts.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">No contacts found.</p>
          )}
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 hover:bg-[var(--bg-secondary)]"
            >
              <RowCheckbox checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={ROUTES.SUPER_ADMIN.EMAIL_CONTACT_DETAIL(c.id)}
                    className="truncate font-medium text-blue-600 hover:underline"
                  >
                    {c.email}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[c.subscribeStatus]}`}
                  >
                    {c.subscribeStatus}
                  </span>
                  {c.userId && (
                    <Badge variant="info" size="sm">
                      Platform
                    </Badge>
                  )}
                  {c.isBlocked && (
                    <Badge variant="error" size="sm">
                      Blocked
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {c.name ?? '—'} {c.tags.length > 0 && `· ${c.tags.join(', ')}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Tooltip content="Edit">
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </Tooltip>
                <Tooltip content="Block">
                  <button
                    onClick={async () => {
                      await svc.blockContact(c.id, !c.isBlocked);
                      qc.invalidateQueries({ queryKey: ['email-contacts'] });
                    }}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </Tooltip>
                <Tooltip content="Delete">
                  <button
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Delete contact',
                          message: 'Delete this contact permanently?',
                          confirmLabel: 'Delete',
                          variant: 'danger',
                        }))
                      )
                        return;
                      await svc.deleteContact(c.id);
                      showToast.success('Contact deleted');
                      qc.invalidateQueries({ queryKey: ['email-contacts'] });
                    }}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
                <Tooltip content="Erase (DPDP)">
                  <button
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Erase contact',
                          message: 'Erase this contact (DPDP right-to-erasure)?',
                          confirmLabel: 'Erase',
                          variant: 'danger',
                        }))
                      )
                        return;
                      await svc.eraseContact(c.id);
                      showToast.success('Contact erased');
                      qc.invalidateQueries({ queryKey: ['email-contacts'] });
                    }}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
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

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {addOpen && <AddContactModal onClose={() => setAddOpen(false)} />}
      {editing && <EditContactModal contact={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkDelete}
        title="Delete contacts"
        message={
          sel.allMatching
            ? `Permanently delete all ${total.toLocaleString()} contacts matching the current filter? This cannot be undone.`
            : `Permanently delete ${sel.count} contact${sel.count === 1 ? '' : 's'}? This cannot be undone.`
        }
        confirmLabel="Delete"
      />
    </DashboardLayout>
  );
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function AddContactModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<EmailSubscribeStatus>('SUBSCRIBED');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await svc.createContact({
        email: email.trim(),
        name: name.trim() || null,
        tags: parseTags(tags),
        subscribeStatus: status,
      });
      showToast.success('Contact added');
      qc.invalidateQueries({ queryKey: ['email-contacts'] });
      onClose();
    } catch {
      showToast.error('Could not add contact');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Add contact</h2>
        <div className="space-y-3">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <Select
            label="Subscribe status"
            options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
            value={status}
            onChange={(v) => setStatus(v as EmailSubscribeStatus)}
            clearable={false}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={busy} onClick={submit}>
            Add contact
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditContactModal({ contact, onClose }: { contact: EmailContact; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(contact.name ?? '');
  const [tags, setTags] = useState(contact.tags.join(', '));
  const [status, setStatus] = useState<EmailSubscribeStatus>(contact.subscribeStatus);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await svc.updateContact(contact.id, {
        name: name.trim() || null,
        tags: parseTags(tags),
        subscribeStatus: status,
      });
      showToast.success('Contact updated');
      qc.invalidateQueries({ queryKey: ['email-contacts'] });
      onClose();
    } catch {
      showToast.error('Could not update contact');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Edit contact</h2>
        <p className="mb-3 truncate text-xs text-[var(--text-muted)]">{contact.email}</p>
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <Select
            label="Subscribe status"
            options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
            value={status}
            onChange={(v) => setStatus(v as EmailSubscribeStatus)}
            clearable={false}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={busy} onClick={submit}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [csv, setCsv] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<EmailSubscribeStatus>('SUBSCRIBED');
  const [doubleOptIn, setDoubleOptIn] = useState(false);
  const [mapEmail, setMapEmail] = useState('');
  const [mapName, setMapName] = useState('');
  const [mapTags, setMapTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Array<{ row: number; email: string; reason: string }>>([]);

  // Upload mode state
  const [rows, setRows] = useState<EmailImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setParsing(true);
    setParseError('');
    setFileName(file.name);
    try {
      const parsed = await parseEmailContactsFile(file);
      setRows(parsed);
      if (parsed.length === 0) setParseError('No valid contacts found in that file.');
    } catch (err) {
      setRows([]);
      setParseError(err instanceof Error ? err.message : 'Could not parse that file.');
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'upload') {
        if (rows.length === 0) {
          setBusy(false);
          return;
        }
        const res = await svc.importContactRows({
          rows,
          tags: tags ? parseTags(tags) : undefined,
          subscribeStatus: status,
        });
        showToast.success(`Imported ${res.data?.imported ?? 0}, skipped ${res.data?.skipped ?? 0}`);
        qc.invalidateQueries({ queryKey: ['email-contacts'] });
        if (res.data?.errors?.length) {
          setErrors(res.data.errors);
        } else {
          onClose();
        }
      } else {
        if (!csv.trim()) {
          setBusy(false);
          return;
        }
        const mapping: Record<string, string> = {};
        if (mapEmail.trim()) mapping.email = mapEmail.trim();
        if (mapName.trim()) mapping.name = mapName.trim();
        if (mapTags.trim()) mapping.tags = mapTags.trim();
        const res = await svc.importContacts({
          csv,
          tags: tags ? parseTags(tags) : undefined,
          subscribeStatus: status,
          doubleOptIn,
          mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
        });
        showToast.success(`Imported ${res.data?.imported ?? 0}, skipped ${res.data?.skipped ?? 0}`);
        qc.invalidateQueries({ queryKey: ['email-contacts'] });
        if (res.data?.errors?.length) {
          setErrors(res.data.errors);
        } else {
          onClose();
        }
      }
    } catch {
      showToast.error('Import failed');
    } finally {
      setBusy(false);
    }
  }

  function csvField(value: string | number): string {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadRejected() {
    const lines = [
      'row,email,reason',
      ...errors.map((e) => `${csvField(e.row)},${csvField(e.email)},${csvField(e.reason)}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rejected-contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const importDisabled = busy || (mode === 'upload' ? rows.length === 0 : !csv.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Import contacts</h2>
        {errors.length > 0 ? (
          <>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Import finished, but {errors.length} row{errors.length === 1 ? ' was' : 's were'}{' '}
              rejected.
            </p>
            <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">Rejected rows</h3>
            <ul
              className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]"
              data-lenis-prevent
            >
              {errors.map((e, i) => (
                <li
                  key={`${e.row}-${i}`}
                  className="border-b border-[var(--border)] px-3 py-1.5 text-xs last:border-b-0"
                >
                  <span className="font-semibold text-[var(--text)]">Row {e.row}</span>{' '}
                  <span className="text-[var(--text-secondary)]">{e.email}</span>{' '}
                  <span className="text-[var(--text-muted)]">— {e.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={downloadRejected}
              >
                Download rejected CSV
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
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

            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Supports CSV, XLSX, JSON, and vCard. Rows need an <code>email</code> (optional{' '}
              <code>name</code>, <code>tags</code>).
            </p>

            {mode === 'paste' ? (
              <>
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={8}
                  placeholder="email,name,tags&#10;alex@example.com,Alex,vip|newsletter"
                  className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
                />
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                    Column mapping (optional — source header names)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Email column"
                      value={mapEmail}
                      onChange={(e) => setMapEmail(e.target.value)}
                      placeholder="email"
                    />
                    <Input
                      label="Name column"
                      value={mapName}
                      onChange={(e) => setMapName(e.target.value)}
                      placeholder="name"
                    />
                    <Input
                      label="Tags column"
                      value={mapTags}
                      onChange={(e) => setMapTags(e.target.value)}
                      placeholder="tags"
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={doubleOptIn}
                    onChange={(e) => setDoubleOptIn(e.target.checked)}
                  />
                  Send confirmation (double opt-in)
                </label>
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
                {rows.length > 0 && !parsing && (
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-xs">
                    <p className="font-medium text-emerald-700">Parsed {rows.length} contacts</p>
                    <p className="mt-1 truncate text-[var(--text-muted)]">
                      {rows
                        .slice(0, 5)
                        .map((r) => r.email)
                        .join(', ')}
                      {rows.length > 5 ? ` +${rows.length - 5} more` : ''}
                    </p>
                  </div>
                )}
              </>
            )}

            <Input
              label="Extra tags (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-2"
            />
            <div className="mt-2">
              <Select
                label="Subscribe status"
                options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
                value={status}
                onChange={(v) => setStatus(v as EmailSubscribeStatus)}
                clearable={false}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button isLoading={busy} disabled={importDisabled} onClick={submit}>
                Import
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
