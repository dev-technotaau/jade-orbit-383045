'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ListChecks,
  ListPlus,
  ListMinus,
  Search,
  Pencil,
  Trash2,
  Download,
  Send,
  ArrowLeft,
  UserPlus,
  X,
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
import { ROUTES } from '@/constants/routes';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { handleBulkResult } from '@/lib/email-bulk';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import type { EmailContactSet, EmailSubscribeStatus } from '@/types/email';

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

const ROLE_OPTIONS = ['CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'] as const;

export default function SuperAdminEmailSetsPage() {
  const [selectedSet, setSelectedSet] = useState<EmailContactSet | null>(null);

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="email.sets.view">
      {selectedSet ? (
        <SetMembersView set={selectedSet} onBack={() => setSelectedSet(null)} />
      ) : (
        <SetsListView onOpen={setSelectedSet} />
      )}
    </DashboardLayout>
  );
}

// ── List view ──────────────────────────────────────────────────────────────

function SetsListView({ onOpen }: { onOpen: (set: EmailContactSet) => void }) {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<EmailContactSet | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-sets'],
    queryFn: () => svc.listSets(),
  });
  const sets = data?.data ?? [];

  const setSel = useBulkSelect();
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const pageIds = sets.map((s) => s.id);

  async function bulkDelete() {
    setBulkBusy(true);
    try {
      const res = await svc.bulkDeleteSets(setSel.ids);
      handleBulkResult(res.data, { qc, label: 'Deleted sets' });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      setSel.clear();
    } catch {
      showToast.error('Could not delete sets');
    } finally {
      setBulkBusy(false);
      setConfirmBulkDelete(false);
    }
  }

  async function download(set: EmailContactSet) {
    try {
      const res = await api.get(svc.setExportUrl(set.id), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `set-${set.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || set.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast.error('Export failed');
    }
  }

  async function remove(set: EmailContactSet) {
    if (
      !(await confirmDialog({
        title: 'Delete set',
        message: `Delete set "${set.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await svc.deleteSet(set.id);
      showToast.success('Set deleted');
      qc.invalidateQueries({ queryKey: ['email-sets'] });
    } catch {
      showToast.error('Could not delete set');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
          <ListChecks className="h-6 w-6 text-blue-600" /> Contact Sets
        </h1>
        <Button leftIcon={<ListPlus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
          New set
        </Button>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Static, named lists of contacts you can reuse as a campaign audience.
      </p>

      {setSel.active && (
        <BulkBar
          count={setSel.count}
          allMatching={setSel.allMatching}
          totalMatching={sets.length}
          allOnPage={setSel.allOnPage(pageIds)}
          entity="sets"
          allowSelectAll={false}
          onSelectAllMatching={setSel.selectAllMatching}
          onClear={setSel.clear}
        >
          <BulkButton icon={Trash2} danger onClick={() => setConfirmBulkDelete(true)}>
            Delete
          </BulkButton>
        </BulkBar>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {sets.length > 0 && (
          <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
            <HeaderCheckbox
              checked={setSel.allOnPage(pageIds)}
              indeterminate={setSel.someOnPage(pageIds)}
              onChange={(on) => setSel.setPage(pageIds, on)}
              title="Select page"
            />
            <span>Name</span>
          </div>
        )}
        {isLoading && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>}
        {!isLoading && sets.length === 0 && (
          <div className="p-10 text-center">
            <ListChecks className="mx-auto mb-2 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">
              No sets yet. Create one to group contacts into a reusable list.
            </p>
          </div>
        )}
        {sets.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 hover:bg-[var(--bg-secondary)]"
          >
            <RowCheckbox checked={setSel.isSelected(s.id)} onChange={() => setSel.toggle(s.id)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpen(s)}
                  className="truncate font-medium text-blue-600 hover:underline"
                >
                  {s.name}
                </button>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  {s.memberCount} {s.memberCount === 1 ? 'member' : 'members'}
                </span>
              </div>
              {s.description && (
                <p className="truncate text-xs text-[var(--text-muted)]">{s.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => onOpen(s)}>
                Open
              </Button>
              <Tooltip content="Use in campaign">
                <Link
                  href={`${ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGN_NEW}?audienceType=set&setId=${s.id}`}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                >
                  <Send className="h-3.5 w-3.5" /> Use in campaign
                </Link>
              </Tooltip>
              <Tooltip content="Edit">
                <button
                  onClick={() => setEditing(s)}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip content="Export">
                <button
                  onClick={() => download(s)}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
                >
                  <Download className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip content="Delete">
                <button
                  onClick={() => remove(s)}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      {newOpen && <SetFormModal onClose={() => setNewOpen(false)} />}
      {editing && <SetFormModal set={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        isLoading={bulkBusy}
        title="Delete sets"
        message={`Permanently delete ${setSel.count} set${setSel.count === 1 ? '' : 's'}? Contacts stay in your list — only the sets are removed. This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────────────

function SetFormModal({ set, onClose }: { set?: EmailContactSet; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(set?.name ?? '');
  const [description, setDescription] = useState(set?.description ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (set) {
        await svc.updateSet(set.id, { name: name.trim(), description: description.trim() || null });
        showToast.success('Set updated');
      } else {
        await svc.createSet({ name: name.trim(), description: description.trim() || null });
        showToast.success('Set created');
      }
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      onClose();
    } catch {
      showToast.error(set ? 'Could not update set' : 'Could not create set');
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
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
          {set ? 'Edit set' : 'New set'}
        </h2>
        <div className="space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q3 webinar leads"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes about this set…"
              className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={busy} disabled={!name.trim()} onClick={submit}>
            {set ? 'Save changes' : 'Create set'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Members view ─────────────────────────────────────────────────────────────

function SetMembersView({ set, onBack }: { set: EmailContactSet; onBack: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-set-members', set.id, q, page, limit],
    queryFn: () => svc.listSetMembers(set.id, { q: q || undefined, page, limit }),
  });
  const members = data?.data?.items ?? [];
  const total = data?.data?.total ?? set.memberCount;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);

  const memberSel = useBulkSelect();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const pageIds = members.map((c) => c.id);

  async function remove(contactId: string) {
    try {
      await svc.removeSetMembers(set.id, [contactId]);
      showToast.success('Removed from set');
      qc.invalidateQueries({ queryKey: ['email-set-members', set.id] });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
    } catch {
      showToast.error('Could not remove member');
    }
  }

  async function bulkRemove() {
    setBulkBusy(true);
    try {
      const res = await svc.removeSetMembers(set.id, memberSel.ids);
      handleBulkResult(res.data, { qc, label: 'Removed members' });
      qc.invalidateQueries({ queryKey: ['email-set-members', set.id] });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      memberSel.clear();
    } catch {
      showToast.error('Could not remove members');
    } finally {
      setBulkBusy(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip content="Back to sets">
            <button
              onClick={onBack}
              className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Tooltip>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-2xl font-bold text-[var(--text)]">
              <ListChecks className="h-6 w-6 shrink-0 text-blue-600" /> {set.name}
            </h1>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {total} {total === 1 ? 'member' : 'members'}
              {set.description ? ` · ${set.description}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            leftIcon={<ListPlus className="h-4 w-4" />}
            onClick={() => setPickOpen(true)}
          >
            Add contacts
          </Button>
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
            Add members
          </Button>
        </div>
      </div>

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

      {memberSel.active && (
        <BulkBar
          count={memberSel.count}
          allMatching={memberSel.allMatching}
          totalMatching={total}
          allOnPage={memberSel.allOnPage(pageIds)}
          entity="members"
          allowSelectAll={false}
          onSelectAllMatching={memberSel.selectAllMatching}
          onClear={memberSel.clear}
        >
          <BulkButton icon={ListMinus} danger onClick={() => setConfirmRemove(true)}>
            Remove selected
          </BulkButton>
        </BulkBar>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {members.length > 0 && (
          <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
            <HeaderCheckbox
              checked={memberSel.allOnPage(pageIds)}
              indeterminate={memberSel.someOnPage(pageIds)}
              onChange={(on) => memberSel.setPage(pageIds, on)}
              title="Select page"
            />
            <span>Email</span>
          </div>
        )}
        {isLoading && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>}
        {!isLoading && members.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            No members{q ? ' match your search' : ' yet'}.
          </p>
        )}
        {members.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0 hover:bg-[var(--bg-secondary)]"
          >
            <RowCheckbox
              checked={memberSel.isSelected(c.id)}
              onChange={() => memberSel.toggle(c.id)}
            />
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
            <Tooltip content="Remove from set">
              <button
                onClick={() => remove(c.id)}
                className="rounded p-1.5 text-red-500 hover:bg-red-50"
              >
                <X className="h-4 w-4" />
              </button>
            </Tooltip>
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

      {addOpen && <AddMembersModal set={set} onClose={() => setAddOpen(false)} />}
      {pickOpen && <ContactPickerModal set={set} onClose={() => setPickOpen(false)} />}
      <ConfirmDialog
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={bulkRemove}
        isLoading={bulkBusy}
        title="Remove members"
        message={`Remove ${memberSel.count} member${memberSel.count === 1 ? '' : 's'} from “${set.name}”? The contacts themselves are not deleted.`}
        confirmLabel="Remove"
      />
    </div>
  );
}

// ── Contact picker (add existing contacts to a set) ──────────────────────────

function ContactPickerModal({ set, onClose }: { set: EmailContactSet; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-contact-picker', set.id, q],
    queryFn: () => svc.listContacts({ q: q || undefined, limit: 50 }),
  });
  const contacts = data?.data?.items ?? [];

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const res = await svc.addSetMembers(set.id, [...picked]);
      const added = res.data?.added ?? 0;
      showToast.success(`Added ${added} member${added === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['email-set-members', set.id] });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      onClose();
    } catch {
      showToast.error('Could not add contacts');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-[var(--text)]">Add contacts</h2>
        <p className="mb-3 truncate text-xs text-[var(--text-muted)]">into “{set.name}”</p>

        <div className="relative mb-3">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name…"
            className="w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)]"
          data-lenis-prevent
        >
          {isLoading && (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && contacts.length === 0 && (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">No contacts found.</p>
          )}
          {contacts.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0 hover:bg-[var(--bg-secondary)]"
            >
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--text)]">{c.email}</span>
                {c.name && (
                  <span className="block truncate text-xs text-[var(--text-muted)]">{c.name}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">{picked.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={busy} disabled={picked.size === 0} onClick={submit}>
              Add {picked.size > 0 ? picked.size : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add members by audience ──────────────────────────────────────────────────

type AddMode = 'segment' | 'platform' | 'filter';

const ADD_MODES: { key: AddMode; label: string }[] = [
  { key: 'segment', label: 'From segment' },
  { key: 'platform', label: 'Platform roles' },
  { key: 'filter', label: 'From filter' },
];

function AddMembersModal({ set, onClose }: { set: EmailContactSet; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<AddMode>('segment');
  const [busy, setBusy] = useState(false);

  // From segment
  const [segmentId, setSegmentId] = useState('');
  const { data: segData, isLoading: segLoading } = useQuery({
    queryKey: ['email-segments'],
    queryFn: () => svc.listSegments(),
  });
  const segments = segData?.data ?? [];

  // From platform roles
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // From filter
  const [tag, setTag] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<EmailSubscribeStatus | ''>('');
  const [onPlatform, setOnPlatform] = useState<'' | 'true' | 'false'>('');

  function toggleRole(r: string) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function submit() {
    let body: Parameters<typeof svc.addSetMembersByAudience>[1];
    if (mode === 'segment') {
      if (!segmentId) {
        showToast.error('Choose a segment');
        return;
      }
      body = { audienceType: 'segment', segmentId };
    } else if (mode === 'platform') {
      if (roles.size === 0) {
        showToast.error('Choose at least one role');
        return;
      }
      body = { audienceType: 'platform', audienceFilter: { roles: [...roles], verifiedOnly } };
    } else {
      const filter: Record<string, unknown> = {};
      if (tag.trim()) filter.tag = tag.trim();
      if (subscribeStatus) filter.subscribeStatus = subscribeStatus;
      if (onPlatform) filter.onPlatform = onPlatform === 'true';
      body = { audienceType: 'upload', audienceFilter: filter };
    }

    setBusy(true);
    try {
      const res = await svc.addSetMembersByAudience(set.id, body);
      const added = res.data?.added ?? 0;
      showToast.success(`Added ${added} member${added === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['email-set-members', set.id] });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      onClose();
    } catch {
      showToast.error('Could not add members');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        data-lenis-prevent
      >
        <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Add members</h2>
        <p className="mb-3 truncate text-xs text-[var(--text-muted)]">into “{set.name}”</p>

        <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
          {ADD_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === m.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'segment' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Segment
            </label>
            {segLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading segments…</p>
            ) : segments.length === 0 ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-muted)]">
                No segments defined yet.
              </p>
            ) : (
              <Select
                options={segments.map((s) => ({ value: s.id, label: s.name }))}
                value={segmentId}
                onChange={(v) => setSegmentId(v)}
                placeholder="Select a segment…"
              />
            )}
            <p className="text-xs text-[var(--text-muted)]">
              Adds every contact that currently matches the chosen segment.
            </p>
          </div>
        )}

        {mode === 'platform' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  <input type="checkbox" checked={roles.has(r)} onChange={() => toggleRole(r)} />
                  {r}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 pt-1 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
              />
              Verified accounts only
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              Adds platform users with the selected roles as contacts.
            </p>
          </div>
        )}

        {mode === 'filter' && (
          <div className="space-y-3">
            <Input
              label="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. newsletter"
            />
            <Select
              label="Subscribe status"
              options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
              value={subscribeStatus}
              onChange={(v) => setSubscribeStatus(v as EmailSubscribeStatus | '')}
              placeholder="Any status"
            />
            <Select
              label="Platform"
              options={[
                { value: 'true', label: 'On-platform' },
                { value: 'false', label: 'Off-platform' },
              ]}
              value={onPlatform}
              onChange={(v) => setOnPlatform(v as '' | 'true' | 'false')}
              placeholder="On + off platform"
            />
            <p className="text-xs text-[var(--text-muted)]">
              Adds existing contacts that match all of the filters above.
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={busy} onClick={submit}>
            Add members
          </Button>
        </div>
      </div>
    </div>
  );
}
