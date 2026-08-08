'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, Lock, Copy } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import PermissionTree, {
  fromSelection,
  toSelection,
  type PermissionSelection,
} from '@/components/admin/PermissionTree';
import { adminPermissionService } from '@/services/admin-permission.service';
import { ROLE_COLOR_OPTIONS, roleColorClass } from '@/constants/permissions';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@/types/permissions';
import type { ApiError } from '@/types/api';

/**
 * Role management.
 *
 * Roles are LIVE-LINKED, not copied at assignment time: editing one changes
 * what every holder can do immediately. That is what makes a large admin
 * estate maintainable — "Support Agent needs ticket deletion" is one edit,
 * not forty — and it is why the editor states the blast radius before you
 * save.
 *
 * System roles ship with the product and cannot be deleted, only cloned.
 * Without that, an estate can lose its baseline roles to a stray click and
 * has no way back short of a redeploy.
 */
export default function RolesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: ['admin-control', 'roles'],
    queryFn: () => adminPermissionService.listRoles(),
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => adminPermissionService.deleteRole(roleId),
    onSuccess: () => {
      showToast.success('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-control'] });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to delete role');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <Skeleton />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Permission roles</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Reusable bundles. Editing a role instantly changes every admin who holds it.
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New role
        </Button>
      </div>

      {!roles?.length ? (
        <EmptyState
          icon={Users}
          title="No roles yet"
          description="Create a role to grant a coherent job description in one click."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs font-semibold ring-1',
                        roleColorClass(role.color),
                      )}
                    >
                      {role.name}
                    </span>
                    {role.isSystem && (
                      <Tooltip content="Ships with the platform — clone it to customise">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          <Lock className="h-2.5 w-2.5" />
                          System
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{role.description}</p>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--bg-secondary)] px-2 py-1.5">
                  <dt className="text-[var(--text-muted)]">Permissions</dt>
                  <dd className="font-semibold text-[var(--text)]">{role.permissions.length}</dd>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] px-2 py-1.5">
                  <dt className="text-[var(--text-muted)]">Admins</dt>
                  <dd className="font-semibold text-[var(--text)]">
                    {role._count?.assignments ?? 0}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setEditing(role)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() =>
                    setEditing({ ...role, id: '', name: `${role.name} (copy)`, isSystem: false })
                  }
                >
                  Clone
                </Button>
                {!role.isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-[var(--error)]"
                    onClick={() => setDeleteTarget(role)}
                    aria-label={`Delete ${role.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RoleEditorModal
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-control'] });
            setEditing(null);
          }}
        />
      )}

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete role?"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          <strong>{deleteTarget?.name}</strong> will be removed from{' '}
          {deleteTarget?._count?.assignments ?? 0} admin
          {(deleteTarget?._count?.assignments ?? 0) === 1 ? '' : 's'}. They keep any permissions
          granted to them directly, but lose everything this role provided.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Delete role
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function RoleEditorModal({
  role,
  onClose,
  onSaved,
}: {
  role: AdminRole | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // `role.id === ''` marks a clone: pre-filled from an existing role but
  // saved as a brand-new one.
  const isCreate = !role || role.id === '';

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [color, setColor] = useState(role?.color ?? 'blue');
  const [selection, setSelection] = useState<PermissionSelection>(() =>
    toSelection(role?.permissions ?? []),
  );

  const { data: registry } = useQuery({
    queryKey: ['admin-control', 'registry'],
    queryFn: () => adminPermissionService.getRegistry(),
    staleTime: Infinity,
  });

  const holderCount = role?._count?.assignments ?? 0;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        permissions: fromSelection(selection),
      };
      if (isCreate) return adminPermissionService.createRole(payload);
      return adminPermissionService.updateRole(role!.id, payload);
    },
    onSuccess: () => {
      showToast.success(isCreate ? 'Role created' : 'Role updated');
      onSaved();
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to save role');
    },
  });

  const grantCount = useMemo(() => selection.allow.size + selection.deny.size, [selection]);

  return (
    <Modal isOpen onClose={onClose} title={isCreate ? 'New role' : `Edit ${role?.name}`} size="xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Role name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Escalations Lead"
            required
          />
          <div>
            <label
              htmlFor="role-color"
              className="mb-1.5 block text-sm font-medium text-[var(--text)]"
            >
              Colour
            </label>
            <div id="role-color" className="flex flex-wrap gap-2">
              {ROLE_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  className={cn(
                    'h-8 w-8 rounded-lg ring-1 transition-transform',
                    roleColorClass(c),
                    color === c && 'ring-primary scale-110 ring-2',
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What job does this role do? Shown wherever the role is assigned."
          rows={2}
        />

        {!isCreate && holderCount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              <strong>{holderCount}</strong> admin{holderCount === 1 ? '' : 's'} currently hold this
              role. Saving changes what they can do <strong>immediately</strong> — their sessions
              re-gate within seconds, no re-login needed.
            </p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">Permissions</h3>
            <span className="text-xs text-[var(--text-muted)]">
              {grantCount} rule{grantCount === 1 ? '' : 's'} selected
            </span>
          </div>
          {registry ? (
            <PermissionTree tree={registry.tree} selection={selection} onChange={setSelection} />
          ) : (
            <Skeleton />
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={name.trim().length < 2}
            onClick={() => save.mutate()}
          >
            {isCreate ? 'Create role' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
