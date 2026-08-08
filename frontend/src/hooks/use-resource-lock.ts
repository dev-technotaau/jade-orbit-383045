'use client';

import { useCallback, useEffect, useState } from 'react';
import { resourceLockService } from '@/services/admin-permission.service';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/store/auth.store';
import type { LockState, ResourceLockMode } from '@/types/permissions';
import type { ApiError } from '@/types/api';

/**
 * Presence + advisory edit locking for a shared admin record.
 *
 *     const lock = useResourceLock('JobPost', jobId);
 *     …
 *     <LockBanner lock={lock} />
 *     <fieldset disabled={lock.isReadOnly}> … </fieldset>
 *
 * ── What this does and does not guarantee ──────────────────────────────
 * It stops two admins UNKNOWINGLY typing over each other. It does not
 * prevent the overwrite — that is optimistic locking on `updatedAt`
 * (`expectedUpdatedAt` in the mutation payload → 409), which catches the
 * stale write even when the lock expired, the tab crashed, or the request
 * came from somewhere that never asked for a lock.
 *
 * Building it the other way round — enforcing locks server-side — produces
 * the classic failure where a closed laptop strands a record and someone
 * has to go into the database. Hence: short TTL, heartbeats, and a takeover
 * path that is always available.
 *
 * ── Lifecycle ──────────────────────────────────────────────────────────
 * Mount acquires VIEWING. Calling `beginEdit()` upgrades to EDITING, which
 * is refused (409) if someone else holds it — the caller can retry with
 * `beginEdit(true)` to take over. Unmount releases. A heartbeat keeps the
 * hold alive; the server treats a lapsed row as dead, so a hard crash
 * self-heals in well under a minute.
 */
export function useResourceLock(
  resourceType: string,
  resourceId: string | undefined,
  options: { enabled?: boolean; autoEdit?: boolean } = {},
) {
  const { enabled = true, autoEdit = false } = options;
  const { user } = useAuthStore();
  const { socket } = useSocket();

  const [state, setState] = useState<LockState | null>(null);
  const [mode, setMode] = useState<ResourceLockMode>(autoEdit ? 'EDITING' : 'VIEWING');
  const [conflict, setConflict] = useState<LockState['editor'] | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const active = enabled && isAdmin && Boolean(resourceId);

  // Note: the heartbeat deliberately does NOT depend on `mode`. It refreshes
  // whatever hold currently exists server-side, so toggling between viewing
  // and editing never resets the interval (which, under a fast toggle,
  // could let the lock lapse mid-edit).

  // ── Acquire on mount, release on unmount ──
  useEffect(() => {
    if (!active || !resourceId) return;
    let cancelled = false;

    resourceLockService
      .acquire(resourceType, resourceId, autoEdit ? 'EDITING' : 'VIEWING')
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((err: unknown) => {
        const apiErr = err as unknown as ApiError;
        // Someone else is editing — stay in read-only and surface who.
        if (apiErr?.code === 'RESOURCE_LOCKED') {
          const holder = (apiErr as unknown as { details?: { holder?: LockState['editor'] } })
            .details?.holder;
          if (!cancelled) {
            setConflict(holder ?? null);
            setMode('VIEWING');
          }
        }
      });

    return () => {
      cancelled = true;
      // Fire-and-forget: the row expires on its own if this never lands.
      resourceLockService.release(resourceType, resourceId).catch(() => {});
    };
  }, [active, resourceType, resourceId, autoEdit]);

  // ── Heartbeat ──
  useEffect(() => {
    if (!active || !resourceId || !state) return;
    const every = state.heartbeatMs || 15_000;
    const id = setInterval(() => {
      // A backgrounded tab is not editing; skipping the beat lets the lock
      // lapse naturally so a forgotten tab stops blocking a colleague.
      if (typeof document !== 'undefined' && document.hidden) return;
      resourceLockService
        .heartbeat(resourceType, resourceId)
        .then(setState)
        .catch(() => {});
    }, every);
    return () => clearInterval(id);
  }, [active, resourceType, resourceId, state]);

  // ── Live updates ──
  useEffect(() => {
    if (!active || !resourceId || !socket) return;
    socket.emit('lock:watch', { resourceType, resourceId });
    const onLock = (next: LockState) => {
      if (next?.resourceType === resourceType && next?.resourceId === resourceId) {
        // The broadcast is computed for whoever triggered it, so `heldByMe`
        // in the payload is not about US — recompute it locally.
        //
        // `recentEditors` is preserved from the previous state rather than
        // taken from the payload: the broadcast is caller-agnostic and
        // deliberately omits it (it is per-viewer, excluding yourself), so
        // spreading `next` wholesale would blank the "X changed this 20m
        // ago" note on every other admin's screen.
        setState((prev) => ({
          ...next,
          heldByMe: next.editor?.adminId === user?.id,
          recentEditors: prev?.recentEditors ?? [],
        }));
      }
    };
    socket.on('admin:lock', onLock);
    return () => {
      socket.off('admin:lock', onLock);
      socket.emit('lock:unwatch', { resourceType, resourceId });
    };
  }, [active, socket, resourceType, resourceId, user?.id]);

  /** Upgrade to an exclusive edit hold. Pass `true` to take over. */
  const beginEdit = useCallback(
    async (takeover = false): Promise<boolean> => {
      if (!active || !resourceId) return true;
      try {
        const next = await resourceLockService.acquire(
          resourceType,
          resourceId,
          'EDITING',
          takeover,
        );
        setState(next);
        setMode('EDITING');
        setConflict(null);
        return true;
      } catch (err: unknown) {
        const apiErr = err as unknown as ApiError;
        if (apiErr?.code === 'RESOURCE_LOCKED') {
          const holder = (apiErr as unknown as { details?: { holder?: LockState['editor'] } })
            .details?.holder;
          setConflict(holder ?? null);
        }
        return false;
      }
    },
    [active, resourceType, resourceId],
  );

  /** Drop back to presence-only (e.g. after a successful save). */
  const endEdit = useCallback(async () => {
    if (!active || !resourceId) return;
    try {
      const next = await resourceLockService.acquire(resourceType, resourceId, 'VIEWING');
      setState(next);
      setMode('VIEWING');
    } catch {
      /* lock will lapse on its own */
    }
  }, [active, resourceType, resourceId]);

  /**
   * Who holds the lock is decided by the SERVER, not by our local `mode`.
   *
   * Two bugs came from reading local state as truth:
   *   • When another admin took over, our `mode` was still 'EDITING', so
   *     `isReadOnly` stayed false and our form remained editable — the exact
   *     situation the takeover exists to resolve.
   *   • A `conflict` captured from a 409 outlived the conflict itself: once
   *     the other admin closed their tab the lock was free, but the stale
   *     `conflict` kept us read-only permanently.
   *
   * So: once live state exists it is authoritative, and `conflict` is only
   * the stand-in for the window before the first state arrives.
   */
  const liveOtherEditor = state?.editor && state.editor.adminId !== user?.id ? state.editor : null;
  const otherEditor = state ? liveOtherEditor : conflict;
  const otherViewers = (state?.viewers ?? []).filter((v) => v.adminId !== user?.id);

  return {
    state,
    /** Someone ELSE holds the edit lock. */
    otherEditor,
    otherViewers,
    /** Admins who changed this record recently (not necessarily here now). */
    recentEditors: state?.recentEditors ?? [],
    /**
     * Read-only exactly when someone else holds the lock.
     *
     * Deliberately NOT `&& mode !== 'EDITING'`: `otherEditor` is already
     * "the holder, if it isn't me", so the extra clause could only ever
     * re-enable our form after we had LOST the lock.
     */
    isReadOnly: Boolean(otherEditor),
    /** Server-confirmed hold, falling back to local intent pre-first-state. */
    isEditing: state ? Boolean(state.heldByMe) : mode === 'EDITING',
    beginEdit,
    endEdit,
    enabled: active,
  };
}

export type UseResourceLock = ReturnType<typeof useResourceLock>;
