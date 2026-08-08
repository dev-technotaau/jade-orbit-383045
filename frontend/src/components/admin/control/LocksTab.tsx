'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Eye, Unlock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { adminPermissionService } from '@/services/admin-permission.service';
import { formatRelativeDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';

/**
 * Live editing locks and presence across the platform.
 *
 * ── Why a force-release button exists ──────────────────────────────────
 * Locks are advisory and short-lived (~45s TTL with a client heartbeat), so
 * they normally clean themselves up — a closed laptop releases within a
 * minute. This table is for the residual case: an account suspended
 * mid-edit, or a super-admin who needs to see at a glance who is holding
 * what during an incident.
 *
 * Force-releasing does NOT grant anyone write access they lacked, and does
 * not risk data loss: optimistic locking on `updatedAt` still refuses a
 * stale overwrite independently of any lock.
 */
export default function LocksTab() {
  const queryClient = useQueryClient();

  const { data: locks, isLoading } = useQuery({
    queryKey: ['admin-control', 'locks'],
    queryFn: () => adminPermissionService.listLocks(),
    // Locks turn over in under a minute, so a slow poll would show mostly
    // ghosts. 10s keeps the table honest without hammering the API.
    refetchInterval: 10_000,
  });

  const release = useMutation({
    mutationFn: (lockId: string) => adminPermissionService.forceReleaseLock(lockId),
    onSuccess: () => {
      showToast.success('Lock released');
      queryClient.invalidateQueries({ queryKey: ['admin-control', 'locks'] });
    },
    onError: (err: unknown) => {
      showToast.error((err as unknown as ApiError)?.message || 'Failed to release lock');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <Skeleton />
      </Card>
    );
  }

  const editing = locks?.filter((l) => l.mode === 'EDITING') ?? [];
  const viewing = locks?.filter((l) => l.mode === 'VIEWING') ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">Active editing locks</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Records an admin currently has open for editing. Others see these read-only until
            released or taken over.
          </p>
        </div>

        {editing.length === 0 ? (
          <EmptyState
            icon={Unlock}
            title="Nobody is editing anything"
            description="Edit locks appear here the moment an admin starts changing a shared record."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {editing.map((lock) => (
              <li key={lock.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Lock className="h-4 w-4" />
                </span>
                <Avatar
                  src={lock.admin.avatar}
                  firstName={lock.admin.firstName}
                  lastName={lock.admin.lastName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {[lock.admin.firstName, lock.admin.lastName].filter(Boolean).join(' ') ||
                      lock.admin.email}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    <span className="font-medium">{lock.resourceType}</span>
                    <span className="mx-1">·</span>
                    <code className="font-mono">{lock.resourceId}</code>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant="warning" size="sm">
                    Editing
                  </Badge>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    since {formatRelativeDate(lock.acquiredAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  /* Scoped to the row actually being released — keying on
                     `isPending` alone put every button in the table into a
                     spinner, which reads as "all locks are being released". */
                  isLoading={release.isPending && release.variables === lock.id}
                  disabled={release.isPending}
                  onClick={() => release.mutate(lock.id)}
                >
                  Force release
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">Presence</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Admins currently viewing a shared record without editing it.
          </p>
        </div>

        {viewing.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            No admins are viewing shared records right now.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {viewing.map((lock) => (
              <li key={lock.id} className="flex items-center gap-3 py-2.5">
                <Eye className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <Avatar
                  src={lock.admin.avatar}
                  firstName={lock.admin.firstName}
                  lastName={lock.admin.lastName}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text)]">
                    {[lock.admin.firstName, lock.admin.lastName].filter(Boolean).join(' ') ||
                      lock.admin.email}
                  </p>
                </div>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {lock.resourceType} · <code className="font-mono">{lock.resourceId}</code>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
