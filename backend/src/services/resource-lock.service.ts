import type { ResourceLockMode } from '@prisma/client';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { AppError } from '../middleware/error';

/**
 * Advisory soft locks + presence for concurrently-edited admin surfaces.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Two admins opening the same job post should SEE each other. One of them
 * starting to type should make that visible to the other before they waste
 * ten minutes on an edit that is about to 409.
 *
 * This service provides both halves:
 *   • VIEWING — presence. Any number of admins per resource. Renders as
 *     "Priya is also viewing this".
 *   • EDITING — intent. At most one live holder per resource. Renders as
 *     "Priya is editing this" and puts everyone else's form in read-only
 *     until they explicitly take over.
 *
 * ── Advisory, deliberately ─────────────────────────────────────────────
 * Nothing here can prevent a write. The correctness boundary is optimistic
 * locking on `updatedAt` (utils/optimistic-lock.ts), which catches a stale
 * overwrite even when the lock expired, the tab crashed, or the request
 * came from a script that never asked for a lock at all.
 *
 * Building it the other way round — enforcing locks server-side — produces
 * the classic failure where a closed laptop strands a record for an hour
 * and someone has to go into the database. Hence: heartbeats, short TTL,
 * and a takeover path that is always available.
 *
 * ── Expiry ─────────────────────────────────────────────────────────────
 * Rows carry `expiresAt` and are treated as dead once passed. Reads filter
 * on it, so a stale row is invisible the moment it lapses regardless of
 * whether the sweeper has run. The sweeper is pure hygiene.
 */

/** How long a lock survives without a heartbeat. */
const LOCK_TTL_MS = 45_000;
/** Clients should heartbeat at roughly a third of the TTL. */
export const LOCK_HEARTBEAT_MS = 15_000;

export interface LockHolder {
  adminId: string;
  mode: ResourceLockMode;
  acquiredAt: string;
  expiresAt: string;
  admin: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
  };
}

export interface LockState {
  resourceType: string;
  resourceId: string;
  /** Live EDITING holder, if any. */
  editor: LockHolder | null;
  /** Live VIEWING holders (excludes the editor). */
  viewers: LockHolder[];
  /** True when the caller holds the edit lock. */
  heldByMe: boolean;
  heartbeatMs: number;
}

const holderSelect = {
  adminId: true,
  mode: true,
  acquiredAt: true,
  expiresAt: true,
  admin: {
    select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
  },
} as const;

type RawHolder = {
  adminId: string;
  mode: ResourceLockMode;
  acquiredAt: Date;
  expiresAt: Date;
  admin: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
  };
};

function toHolder(row: RawHolder): LockHolder {
  return {
    adminId: row.adminId,
    mode: row.mode,
    acquiredAt: row.acquiredAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    admin: row.admin,
  };
}

function assertResource(resourceType: string, resourceId: string): void {
  if (!resourceType || !resourceId) {
    throw new AppError('resourceType and resourceId are required', 400, 'INVALID_RESOURCE');
  }
  if (resourceType.length > 64 || resourceId.length > 128) {
    throw new AppError('resourceType or resourceId is too long', 400, 'INVALID_RESOURCE');
  }
}

/** Current live state for a resource. */
export async function getState(
  resourceType: string,
  resourceId: string,
  callerId: string
): Promise<LockState> {
  assertResource(resourceType, resourceId);

  const rows = await prisma.resourceLock.findMany({
    where: { resourceType, resourceId, expiresAt: { gt: new Date() } },
    select: holderSelect,
    orderBy: { acquiredAt: 'asc' },
  });

  const editorRow = rows.find((r) => r.mode === 'EDITING');
  return {
    resourceType,
    resourceId,
    editor: editorRow ? toHolder(editorRow) : null,
    viewers: rows.filter((r) => r.mode === 'VIEWING').map(toHolder),
    heldByMe: editorRow?.adminId === callerId,
    heartbeatMs: LOCK_HEARTBEAT_MS,
  };
}

/**
 * Acquire or refresh a lock. Idempotent — the same admin calling repeatedly
 * just extends their own hold, which is exactly what the heartbeat does.
 *
 * Requesting EDITING while someone else holds it is REFUSED (409) unless
 * `takeover` is set. The refusal is what makes the UI honest; the takeover
 * escape hatch is what stops it becoming a trap.
 */
export async function acquire(
  resourceType: string,
  resourceId: string,
  adminId: string,
  mode: ResourceLockMode = 'VIEWING',
  takeover = false
): Promise<LockState> {
  assertResource(resourceType, resourceId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  if (mode === 'EDITING') {
    const rival = await prisma.resourceLock.findFirst({
      where: {
        resourceType,
        resourceId,
        mode: 'EDITING',
        adminId: { not: adminId },
        expiresAt: { gt: now },
      },
      select: holderSelect,
    });

    if (rival && !takeover) {
      const name =
        [rival.admin.firstName, rival.admin.lastName].filter(Boolean).join(' ') ||
        rival.admin.email;
      const err = new AppError(
        `${name} is currently editing this. You can open it read-only, or take over the edit.`,
        409,
        'RESOURCE_LOCKED'
      );
      (err as AppError & { details?: unknown }).details = { holder: toHolder(rival) };
      throw err;
    }

    if (rival && takeover) {
      // Demote the previous editor to a viewer rather than evicting them —
      // their tab keeps its presence badge and immediately learns it lost
      // the lock on its next poll, instead of silently going stale.
      await prisma.resourceLock.updateMany({
        where: { resourceType, resourceId, mode: 'EDITING', adminId: { not: adminId } },
        data: { mode: 'VIEWING' },
      });
      logger.info(
        `Resource lock taken over: ${resourceType}/${resourceId} from ${rival.adminId} by ${adminId}`
      );
    }
  }

  await prisma.resourceLock.upsert({
    where: { resourceType_resourceId_adminId: { resourceType, resourceId, adminId } },
    create: { resourceType, resourceId, adminId, mode, expiresAt, heartbeatAt: now },
    update: { mode, expiresAt, heartbeatAt: now },
  });

  return getState(resourceType, resourceId, adminId);
}

/** Extend an existing hold without changing its mode. */
export async function heartbeat(
  resourceType: string,
  resourceId: string,
  adminId: string
): Promise<LockState> {
  assertResource(resourceType, resourceId);

  const now = new Date();
  const { count } = await prisma.resourceLock.updateMany({
    where: { resourceType, resourceId, adminId },
    data: { expiresAt: new Date(now.getTime() + LOCK_TTL_MS), heartbeatAt: now },
  });

  // Lapsed while the tab was backgrounded — re-establish presence rather
  // than reporting an error the UI can do nothing useful with.
  if (count === 0) {
    return acquire(resourceType, resourceId, adminId, 'VIEWING');
  }

  return getState(resourceType, resourceId, adminId);
}

export async function release(
  resourceType: string,
  resourceId: string,
  adminId: string
): Promise<void> {
  assertResource(resourceType, resourceId);
  await prisma.resourceLock.deleteMany({ where: { resourceType, resourceId, adminId } });
}

/** Drop every lock held by an admin — used on sign-out and on suspension. */
export async function releaseAllFor(adminId: string): Promise<void> {
  await prisma.resourceLock.deleteMany({ where: { adminId } });
}

/**
 * Force-release someone else's lock. SUPER_ADMIN only (enforced at the
 * route); exposed in the control centre for the rare case where a lock is
 * held by an account that has been suspended mid-edit.
 */
export async function forceRelease(lockId: string): Promise<void> {
  await prisma.resourceLock.deleteMany({ where: { id: lockId } });
}

/** Every live lock across the platform — the control centre's lock table. */
export async function listActive() {
  const rows = await prisma.resourceLock.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { id: true, resourceType: true, resourceId: true, ...holderSelect },
    orderBy: { acquiredAt: 'desc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    ...toHolder(r),
  }));
}

/**
 * Batch presence for a list view — "which of these 50 rows is someone
 * else on right now?". One query instead of 50.
 */
export async function getStateForMany(
  resourceType: string,
  resourceIds: string[],
  callerId: string
): Promise<Record<string, { editor: LockHolder | null; viewerCount: number }>> {
  if (resourceIds.length === 0) return {};

  const rows = await prisma.resourceLock.findMany({
    where: {
      resourceType,
      resourceId: { in: resourceIds.slice(0, 200) },
      expiresAt: { gt: new Date() },
      adminId: { not: callerId },
    },
    select: { resourceId: true, ...holderSelect },
  });

  const out: Record<string, { editor: LockHolder | null; viewerCount: number }> = {};
  for (const row of rows) {
    const bucket = (out[row.resourceId] ??= { editor: null, viewerCount: 0 });
    if (row.mode === 'EDITING') bucket.editor = toHolder(row);
    else bucket.viewerCount += 1;
  }
  return out;
}

/** Delete lapsed rows. Hygiene only — reads already ignore them. */
export async function sweepExpired(): Promise<number> {
  const { count } = await prisma.resourceLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (count > 0) logger.debug(`Resource-lock sweep: removed ${count} expired lock(s)`);
  return count;
}

export const resourceLockService = {
  getState,
  getStateForMany,
  acquire,
  heartbeat,
  release,
  releaseAllFor,
  forceRelease,
  listActive,
  sweepExpired,
  LOCK_HEARTBEAT_MS,
};
