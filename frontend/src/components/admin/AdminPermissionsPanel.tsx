'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Copy, ShieldOff, Info, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import PermissionTree, {
  fromSelection,
  toSelection,
  type PermissionSelection,
} from '@/components/admin/PermissionTree';
import { adminPermissionService } from '@/services/admin-permission.service';
import { roleColorClass } from '@/constants/permissions';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/types/api';

/**
 * The per-admin grant editor, shown in the Permissions tab of an admin's
 * detail page.
 *
 * ── Roles vs direct grants ─────────────────────────────────────────────
 * An admin's effective access is the UNION of their assigned roles and
 * their direct grants. Both are edited here, deliberately kept visually
 * separate: roles are the maintainable path ("give them Support Agent"),
 * direct grants are the exception path ("…plus refund approval, just for
 * them"). Collapsing the two into one list is how estates end up with
 * forty bespoke permission sets and nothing reusable.
 *
 * Saving replaces the whole direct-grant set in one request — see the
 * service for why a diff/patch stream would be unsafe here.
 */
export default function AdminPermissionsPanel({
  adminId,
  adminRole,
}: {
  adminId: string;
  adminRole: string;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<PermissionSelection | null>(null);
  const [showClone, setShowClone] = useState(false);
  const [cloneSource, setCloneSource] = useState('');
  const [showRevokeAll, setShowRevokeAll] = useState(false);

  const isSuperAdminTarget = adminRole === 'SUPER_ADMIN';

  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin-control', 'admin', adminId],
    queryFn: () => adminPermissionService.getAdminPermissions(adminId),
  });

  const { data: registry } = useQuery({
    queryKey: ['admin-control', 'registry'],
    queryFn: () => adminPermissionService.getRegistry(),
    staleTime: Infinity,
  });

  const { data: roles } = useQuery({
    queryKey: ['admin-control', 'roles'],
    queryFn: () => adminPermissionService.listRoles(),
  });

  const { data: matrix } = useQuery({
    queryKey: ['admin-control', 'matrix'],
    queryFn: () => adminPermissionService.getMatrix(),
    enabled: showClone,
  });

  // Seed the editor from the server once loaded, and re-seed whenever the
  // server copy changes (e.g. after a clone, or a role change made
  // elsewhere).
  //
  // This is React's "adjusting state when props change" pattern — setState
  // DURING render, guarded by a marker of what we last seeded from. React
  // discards the in-progress render and immediately re-runs with the new
  // state, so nothing is painted twice. An effect would work too but paints
  // the stale (empty) tree first, which flashes an editor showing no
  // permissions for an admin who has plenty.
  const serverSelection = useMemo(() => (detail ? toSelection(detail.direct) : null), [detail]);
  const [seededFrom, setSeededFrom] = useState<typeof serverSelection>(null);

  const sameSet = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((k) => b.has(k));

  /**
   * Unsaved edits, measured against what we LAST SEEDED FROM — not against
   * `serverSelection`, which by definition is already the new copy when a
   * refetch lands.
   */
  const hasUnsaved = Boolean(
    selection &&
    seededFrom &&
    (!sameSet(selection.allow, seededFrom.allow) || !sameSet(selection.deny, seededFrom.deny)),
  );

  // Re-seed ONLY when there is nothing to lose. Previously any refetch
  // overwrote the tree: ticking six boxes and then clicking a role chip
  // invalidated `['admin-control']`, which prefix-matches this panel's own
  // query, and the six ticks vanished behind a "Roles updated" toast.
  if (serverSelection && serverSelection !== seededFrom && !hasUnsaved) {
    setSeededFrom(serverSelection);
    setSelection(serverSelection);
  }

  /** A server change arrived while the editor was dirty — offer, don't clobber. */
  const serverMovedWhileDirty = Boolean(
    hasUnsaved && serverSelection && serverSelection !== seededFrom,
  );

  const assignedRoleIds = useMemo(
    () => new Set((detail?.assignments ?? []).map((a) => a.roleId)),
    [detail],
  );

  const dirty = hasUnsaved;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-control'] });
    queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-detail', adminId] });
  };

  /**
   * Narrow invalidation for the role-toggle path. A role change does not
   * alter `detail.direct`, so refetching this panel's own query would only
   * risk stomping the in-progress tree edit for no benefit.
   */
  const invalidateRolesOnly = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-control', 'roles'] });
    queryClient.invalidateQueries({ queryKey: ['admin-control', 'matrix'] });
  };

  const save = useMutation({
    mutationFn: () =>
      adminPermissionService.setAdminPermissions(adminId, fromSelection(selection!)),
    onSuccess: () => {
      showToast.success('Permissions updated', 'Their access changes immediately.');
      // Adopt what we just saved as the new baseline BEFORE the refetch
      // lands. Without this the panel wedges: `seededFrom` would still hold
      // the pre-save copy, so `hasUnsaved` stayed true forever, the reseed
      // was blocked permanently, and the "changed elsewhere" banner showed
      // alongside the success toast.
      setSeededFrom(selection);
      invalidate();
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to save permissions');
    },
  });

  const toggleRole = useMutation({
    mutationFn: (roleIds: string[]) => adminPermissionService.setAdminRoles(adminId, roleIds),
    onSuccess: () => {
      showToast.success('Roles updated');
      // Narrow, so an in-progress direct-grant edit survives a role toggle.
      invalidateRolesOnly();
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to update roles');
    },
  });

  const revokeAll = useMutation({
    mutationFn: () => adminPermissionService.revokeAll(adminId),
    onSuccess: () => {
      showToast.success('All permissions and roles revoked');
      setShowRevokeAll(false);
      invalidate();
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to revoke');
    },
  });

  const clone = useMutation({
    mutationFn: (sourceAdminId: string) =>
      adminPermissionService.clonePermissions(adminId, sourceAdminId, true),
    onSuccess: () => {
      showToast.success('Permissions cloned');
      setShowClone(false);
      invalidate();
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to clone');
    },
  });

  if (isLoading || !detail) {
    return (
      <Card>
        <Skeleton />
      </Card>
    );
  }

  if (isSuperAdminTarget) {
    return (
      <Card>
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Super-admins hold every permission by role
            </p>
            <p className="mt-1 text-sm text-blue-800">
              Their access is unconditional and stores no grant rows, so the permission system can
              never lock the platform owner out. To reduce this account&apos;s access, change its
              role to Admin first — then permissions become editable here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const effectiveCount = detail.effective.allowed.length;

  return (
    <div className="space-y-6">
      {/* ── Summary ── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Effective access</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {effectiveCount} permission{effectiveCount === 1 ? '' : 's'} in total —{' '}
              {detail.direct.length} granted directly, {detail.assignments.length} role
              {detail.assignments.length === 1 ? '' : 's'} assigned.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => setShowClone(true)}
            >
              Copy from admin
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--error)]"
              leftIcon={<ShieldOff className="h-3.5 w-3.5" />}
              onClick={() => setShowRevokeAll(true)}
            >
              Revoke all
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Roles ── */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--text-muted)]" />
          <h3 className="text-lg font-semibold text-[var(--text)]">Roles</h3>
        </div>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          The maintainable way to grant access. A role stays live-linked — editing it later updates
          everyone who holds it.
        </p>

        {!roles?.length ? (
          <p className="text-sm text-[var(--text-muted)]">
            No roles defined yet. Create one in the Admin Control Centre.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const assigned = assignedRoleIds.has(role.id);
              return (
                <Tooltip
                  key={role.id}
                  content={role.description || `${role.permissions.length} permissions`}
                >
                  <button
                    type="button"
                    aria-pressed={assigned}
                    disabled={toggleRole.isPending}
                    onClick={() => {
                      const next = new Set(assignedRoleIds);
                      if (assigned) next.delete(role.id);
                      else next.add(role.id);
                      toggleRole.mutate([...next]);
                    }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all',
                      assigned
                        ? roleColorClass(role.color)
                        : 'bg-white text-[var(--text-muted)] ring-[var(--border)] hover:ring-[var(--border-hover)]',
                      assigned && 'ring-2',
                    )}
                  >
                    {role.name}
                    <span className="ml-1.5 text-[10px] opacity-70">{role.permissions.length}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Direct grants ── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Direct permissions</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Exceptions on top of their roles. Ticking a section grants everything inside it,
              including features added later.
            </p>
          </div>
          {dirty && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => {
                  setSeededFrom(serverSelection);
                  setSelection(serverSelection);
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                leftIcon={<Save className="h-3.5 w-3.5" />}
                isLoading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save changes
              </Button>
            </div>
          )}
        </div>

        {/* Someone changed this admin's grants elsewhere while this editor
            was dirty. We do NOT auto-reseed (that would discard the work in
            progress) — the choice is offered instead. */}
        {serverMovedWhileDirty && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 text-xs text-amber-800">
              These permissions were changed somewhere else while you were editing. Your unsaved
              changes are still here — saving will overwrite theirs.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSeededFrom(serverSelection);
                setSelection(serverSelection);
              }}
            >
              Load theirs
            </Button>
          </div>
        )}

        {registry && selection ? (
          <PermissionTree tree={registry.tree} selection={selection} onChange={setSelection} />
        ) : (
          <Skeleton />
        )}
      </Card>

      {/* ── Clone ── */}
      <Modal
        isOpen={showClone}
        onClose={() => setShowClone(false)}
        title="Copy access from another admin"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This <strong>replaces</strong> this admin&apos;s roles and direct permissions with the
          source admin&apos;s. Nothing is merged.
        </p>
        <div className="mt-4">
          <Select
            label="Source admin"
            value={cloneSource}
            options={[
              { value: '', label: 'Select an admin…' },
              ...(matrix ?? [])
                .filter((r) => r.admin.id !== adminId)
                .map((r) => ({
                  value: r.admin.id,
                  label:
                    [r.admin.firstName, r.admin.lastName].filter(Boolean).join(' ') ||
                    r.admin.email,
                })),
            ]}
            onChange={(v) => {
              setCloneSource(v);
              if (v) clone.mutate(v);
            }}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => setShowClone(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      {/* ── Revoke all ── */}
      <Modal
        isOpen={showRevokeAll}
        onClose={() => setShowRevokeAll(false)}
        title="Revoke all access?"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Every role and direct permission is removed. The account stays active and can still sign
          in, but will see an empty admin console until something is granted again.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowRevokeAll(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={revokeAll.isPending}
            onClick={() => revokeAll.mutate()}
          >
            Revoke everything
          </Button>
        </div>
      </Modal>
    </div>
  );
}
