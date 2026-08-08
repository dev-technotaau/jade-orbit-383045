'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Search, RefreshCw, FolderPlus, Plus, Download } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { useBulkSelect, downloadBlob } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';

const ROLES = ['CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'];

export default function SuperAdminEmailPlatformUsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [syncing, setSyncing] = useState(false);
  const [syncingSel, setSyncingSel] = useState(false);
  const [addToSetOpen, setAddToSetOpen] = useState(false);
  const [addSelToSetOpen, setAddSelToSetOpen] = useState(false);
  const sel = useBulkSelect();

  const rolesParam = roles.join(',') || undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['email-platform-users', q, rolesParam, verifiedOnly, page, limit],
    queryFn: () =>
      svc.listPlatformUsers({
        q: q || undefined,
        roles: rolesParam,
        verifiedOnly,
        page,
        limit,
      }),
  });
  const { data: countData } = useQuery({
    queryKey: ['email-platform-users-count', rolesParam, verifiedOnly],
    queryFn: () => svc.countPlatformUsers({ roles: rolesParam, verifiedOnly }),
  });
  const users = data?.data?.items ?? [];
  const matchCount = countData?.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(matchCount / limit));
  const pageIds = users.map((u) => u.id);

  function toggleRole(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
    setPage(1);
  }

  async function syncToContacts() {
    setSyncing(true);
    try {
      const res = await svc.syncPlatformUsers({
        roles: rolesParam,
        verifiedOnly,
        q: q || undefined,
      });
      showToast.success(`Synced ${res.data?.count ?? 0} users into contacts`);
      qc.invalidateQueries({ queryKey: ['email-contacts'] });
    } catch {
      showToast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function syncSelectedToContacts() {
    setSyncingSel(true);
    try {
      const res = await svc.syncPlatformUsers({ userIds: sel.ids });
      showToast.success(`Synced ${res.data?.count ?? 0}`);
      qc.invalidateQueries({ queryKey: ['email-contacts'] });
      sel.clear();
    } catch {
      showToast.error('Sync failed');
    } finally {
      setSyncingSel(false);
    }
  }

  async function exportUsers() {
    try {
      downloadBlob(
        await svc.exportPlatformUsers({ roles: rolesParam, verifiedOnly, q: q || undefined }),
        'platform-users.csv',
      );
    } catch {
      showToast.error('Export failed');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.contacts.platform_users"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <UserCheck className="h-6 w-6 text-blue-600" /> Platform Users
          </h1>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportUsers}
          >
            Export
          </Button>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          On-platform users eligible for a role-targeted campaign. Use these as a{' '}
          <strong>platform</strong> audience when creating a campaign.
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
              placeholder="Search…"
              className="w-56 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => toggleRole(r)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                roles.includes(r)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}
            >
              {r}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Verified only
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span className="font-medium">{matchCount.toLocaleString()} users match this filter</span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              isLoading={syncing}
              onClick={syncToContacts}
            >
              Sync to contacts
            </Button>
            <Button
              size="sm"
              leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
              onClick={() => setAddToSetOpen(true)}
            >
              Add to set
            </Button>
          </div>
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={sel.allMatching}
            totalMatching={matchCount}
            allOnPage={sel.allOnPage(pageIds)}
            entity="users"
            allowSelectAll={false}
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
          >
            <BulkButton icon={RefreshCw} disabled={syncingSel} onClick={syncSelectedToContacts}>
              Sync selected to contacts
            </BulkButton>
            <BulkButton icon={FolderPlus} onClick={() => setAddSelToSetOpen(true)}>
              Add selected to set
            </BulkButton>
          </BulkBar>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {users.length > 0 && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
              <HeaderCheckbox
                checked={sel.allOnPage(pageIds)}
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
          {!isLoading && users.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">No users found.</p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5"
            >
              <RowCheckbox checked={sel.isSelected(u.id)} onChange={() => sel.toggle(u.id)} />
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium text-[var(--text)]">{u.email}</span>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                </p>
              </div>
              <Badge variant="neutral" size="sm">
                {u.role}
              </Badge>
              {u.isEmailVerified ? (
                <Badge variant="success" size="sm">
                  Verified
                </Badge>
              ) : (
                <Badge variant="warning" size="sm">
                  Unverified
                </Badge>
              )}
            </div>
          ))}
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={matchCount}
          pageSize={limit}
          onPageSizeChange={(s) => {
            setLimit(s);
            setPage(1);
          }}
        />
      </div>

      {addToSetOpen && (
        <AddToSetModal
          roles={roles}
          verifiedOnly={verifiedOnly}
          onClose={() => setAddToSetOpen(false)}
        />
      )}
      {addSelToSetOpen && (
        <AddToSetModal
          roles={roles}
          verifiedOnly={verifiedOnly}
          userIds={sel.ids}
          onDone={() => sel.clear()}
          onClose={() => setAddSelToSetOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}

function AddToSetModal({
  roles,
  verifiedOnly,
  userIds,
  onDone,
  onClose,
}: {
  roles: string[];
  verifiedOnly: boolean;
  /** When present, adds these specific users instead of the whole filter. */
  userIds?: string[];
  /** Fired after a successful add (e.g. to clear the row selection). */
  onDone?: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-sets'],
    queryFn: () => svc.listSets(),
  });
  const sets = data?.data ?? [];

  const bySelection = !!userIds && userIds.length > 0;
  const audienceFilter = bySelection
    ? { userIds }
    : { roles: roles.length ? roles : undefined, verifiedOnly };

  async function addToSet(setId: string) {
    setBusy(setId);
    try {
      const res = await svc.addSetMembersByAudience(setId, {
        audienceType: 'platform',
        audienceFilter,
      });
      showToast.success(`Added ${res.data?.added ?? 0} to set`);
      onDone?.();
      onClose();
    } catch {
      showToast.error('Could not add to set');
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy('new');
    try {
      const created = await svc.createSet({ name });
      const setId = created.data?.id;
      if (!setId) throw new Error('missing set id');
      const res = await svc.addSetMembersByAudience(setId, {
        audienceType: 'platform',
        audienceFilter,
      });
      qc.invalidateQueries({ queryKey: ['email-sets'] });
      showToast.success(`Added ${res.data?.added ?? 0} to set`);
      onDone?.();
      onClose();
    } catch {
      showToast.error('Could not create set');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--text)]">Add to set</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {bySelection ? (
            `Adds the ${userIds!.length} selected user${userIds!.length === 1 ? '' : 's'} into the chosen set.`
          ) : (
            <>
              Adds every contact matching the current filter
              {roles.length ? ` (${roles.join(', ')})` : ''}
              {verifiedOnly ? ', verified only' : ''} into the chosen set.
            </>
          )}
        </p>

        <div
          className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)]"
          data-lenis-prevent
        >
          {isLoading && (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading sets…</p>
          )}
          {!isLoading && sets.length === 0 && (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">
              No sets yet. Create one below.
            </p>
          )}
          {sets.map((s) => (
            <button
              key={s.id}
              disabled={busy !== null}
              onClick={() => addToSet(s.id)}
              className="flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                {s.name}
              </span>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {busy === s.id ? 'Adding…' : `${s.memberCount} members`}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <Input
            label="New set name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Verified employers"
            className="flex-1"
          />
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            isLoading={busy === 'new'}
            disabled={!newName.trim() || busy !== null}
            onClick={createAndAdd}
          >
            Create &amp; add
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" disabled={busy !== null} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
