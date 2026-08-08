import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { AppError } from '../middleware/error';
import { permissionService } from '../services/permission.service';
import { adminActivityService } from '../services/admin-activity.service';
import { resourceLockService } from '../services/resource-lock.service';
import { getIO } from '../socket';
import logger from '../config/logger';

/**
 * The admin control centre API.
 *
 * Everything under `/super-admin/admin-control` is SUPER_ADMIN-only (see
 * `superAdminOnly` on the router) — the permission system must never be
 * reachable by the accounts it governs.
 *
 * `/admin/me/permissions` is the one exception: an admin reading their OWN
 * effective permissions, which is what the frontend nav and page guards
 * consume.
 */

/** Broadcast a grant change so an affected admin's UI re-gates immediately. */
function notifyPermissionChange(adminId: string): void {
  try {
    getIO().to(`user:${adminId}`).emit('admin:permissions-changed', { adminId });
  } catch (err) {
    // Socket layer is optional (tests, worker processes) — a missed nudge
    // just means the admin re-gates on their next 5-minute cache expiry.
    logger.debug('Permission-change broadcast skipped:', (err as Error).message);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Self
// ───────────────────────────────────────────────────────────────────────

/**
 * The caller's own effective permissions. Drives sidebar filtering and
 * client-side page guards.
 *
 * Client-side gating is a UX affordance, never the enforcement boundary —
 * every endpoint independently re-checks via `requirePermission`. A user
 * who forges this response gains nothing but a nav item that 403s.
 */
export const getMyPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const effective = await permissionService.getEffectivePermissions(req.user.id, req.user.role);
    res.status(200).json({ status: 'success', data: effective });
  } catch (error) {
    next(error);
  }
};

// ───────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────

export const getRegistry = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: permissionService.getRegistry() });
  } catch (error) {
    next(error);
  }
};

// ───────────────────────────────────────────────────────────────────────
// Per-admin grants
// ───────────────────────────────────────────────────────────────────────

export const getAdminPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.id as string;
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true, avatar: true },
    });
    if (!admin) throw new AppError('Admin not found', 404, 'NOT_FOUND');

    const [effective, direct, assignments] = await Promise.all([
      permissionService.getEffectivePermissions(adminId, admin.role),
      prisma.adminPermissionGrant.findMany({
        where: { adminId },
        orderBy: { permissionKey: 'asc' },
      }),
      prisma.adminRoleAssignment.findMany({
        where: { adminId },
        include: { role: { include: { permissions: true } } },
      }),
    ]);

    res.status(200).json({
      status: 'success',
      data: { admin, effective, direct, assignments },
    });
  } catch (error) {
    next(error);
  }
};

/** Whole-set replace of an admin's direct grants. */
export const setAdminPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const adminId = req.params.id as string;
    const { grants } = req.body as {
      grants: {
        permissionKey: string;
        effect?: 'ALLOW' | 'DENY';
        expiresAt?: string;
        reason?: string;
      }[];
    };

    const resolved = await permissionService.setDirectGrants(
      adminId,
      (grants ?? []).map((g) => ({
        permissionKey: g.permissionKey,
        effect: g.effect,
        expiresAt: g.expiresAt ? new Date(g.expiresAt) : null,
        reason: g.reason ?? null,
      })),
      req.user.id
    );

    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', data: { grants: resolved } });
  } catch (error) {
    next(error);
  }
};

export const grantPermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const adminId = req.params.id as string;
    const { permissionKey, effect, expiresAt, reason } = req.body as {
      permissionKey: string;
      effect?: 'ALLOW' | 'DENY';
      expiresAt?: string;
      reason?: string;
    };

    await permissionService.upsertGrant(
      adminId,
      {
        permissionKey,
        effect,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason: reason ?? null,
      },
      req.user.id
    );

    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'Permission granted' });
  } catch (error) {
    next(error);
  }
};

export const revokePermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.id as string;
    const permissionKey = req.params.key as string;
    await permissionService.revokeGrant(adminId, permissionKey);
    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'Permission revoked' });
  } catch (error) {
    next(error);
  }
};

export const revokeAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.id as string;
    await permissionService.revokeAllGrants(adminId);
    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'All permissions and roles revoked' });
  } catch (error) {
    next(error);
  }
};

/**
 * Copy one admin's full access to another. The single most-requested
 * operation in any real admin estate ("make them like Priya") and the one
 * most likely to be done wrong by hand.
 */
export const clonePermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const targetId = req.params.id as string;
    const { sourceAdminId, includeRoles = true } = req.body as {
      sourceAdminId: string;
      includeRoles?: boolean;
    };

    if (!sourceAdminId) throw new AppError('sourceAdminId is required', 400, 'MISSING_SOURCE');
    if (sourceAdminId === targetId) {
      throw new AppError('Source and target admin are the same', 400, 'INVALID_SOURCE');
    }

    const source = await prisma.user.findUnique({
      where: { id: sourceAdminId },
      select: { role: true },
    });
    if (!source) throw new AppError('Source admin not found', 404, 'NOT_FOUND');
    if (source.role !== 'ADMIN') {
      throw new AppError(
        'Only an admin can be used as a clone source — super-admins hold every permission by role, so cloning one would be meaningless.',
        400,
        'INVALID_SOURCE'
      );
    }

    const sourceGrants = await prisma.adminPermissionGrant.findMany({
      where: { adminId: sourceAdminId },
    });

    await permissionService.setDirectGrants(
      targetId,
      sourceGrants.map((g) => ({
        permissionKey: g.permissionKey,
        effect: g.effect,
        expiresAt: g.expiresAt,
        reason: g.reason,
      })),
      req.user.id
    );

    if (includeRoles) {
      const sourceRoles = await prisma.adminRoleAssignment.findMany({
        where: { adminId: sourceAdminId },
        select: { roleId: true },
      });
      await permissionService.setRoles(
        targetId,
        sourceRoles.map((r) => r.roleId),
        req.user.id
      );
    }

    notifyPermissionChange(targetId);
    res.status(200).json({ status: 'success', message: 'Permissions cloned' });
  } catch (error) {
    next(error);
  }
};

/** Why can/can't this admin do X. */
export const explainPermission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.id as string;
    const key = req.query.key as string;
    if (!key) throw new AppError('key query parameter is required', 400, 'MISSING_KEY');
    const result = await permissionService.explain(adminId, key);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

// ───────────────────────────────────────────────────────────────────────
// Roles
// ───────────────────────────────────────────────────────────────────────

export const listRoles = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await permissionService.listRoles() });
  } catch (error) {
    next(error);
  }
};

export const createRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const role = await permissionService.createRole(req.body, req.user.id);
    res.status(201).json({ status: 'success', data: role });
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roleId = req.params.roleId as string;
    const role = await permissionService.updateRole(roleId, req.body);

    // Live-linked roles change what holders can do immediately.
    const holders = await prisma.adminRoleAssignment.findMany({
      where: { roleId },
      select: { adminId: true },
    });
    holders.forEach((h) => notifyPermissionChange(h.adminId));

    res.status(200).json({ status: 'success', data: role });
  } catch (error) {
    next(error);
  }
};

export const deleteRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roleId = req.params.roleId as string;
    const holders = await prisma.adminRoleAssignment.findMany({
      where: { roleId },
      select: { adminId: true },
    });
    await permissionService.deleteRole(roleId);
    holders.forEach((h) => notifyPermissionChange(h.adminId));
    res.status(200).json({ status: 'success', message: 'Role deleted' });
  } catch (error) {
    next(error);
  }
};

export const assignRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { adminId, expiresAt } = req.body as { adminId: string; expiresAt?: string };
    await permissionService.assignRole(
      req.params.roleId as string,
      adminId,
      req.user.id,
      expiresAt ? new Date(expiresAt) : null
    );
    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'Role assigned' });
  } catch (error) {
    next(error);
  }
};

export const unassignRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;
    await permissionService.unassignRole(req.params.roleId as string, adminId);
    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'Role unassigned' });
  } catch (error) {
    next(error);
  }
};

export const setAdminRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const adminId = req.params.id as string;
    const { roleIds } = req.body as { roleIds: string[] };
    await permissionService.setRoles(adminId, roleIds ?? [], req.user.id);
    notifyPermissionChange(adminId);
    res.status(200).json({ status: 'success', message: 'Roles updated' });
  } catch (error) {
    next(error);
  }
};

// ───────────────────────────────────────────────────────────────────────
// Matrix + oversight
// ───────────────────────────────────────────────────────────────────────

export const getMatrix = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await permissionService.getAccessMatrix() });
  } catch (error) {
    next(error);
  }
};

export const getHolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.query.key as string;
    if (!key) throw new AppError('key query parameter is required', 400, 'MISSING_KEY');
    res.status(200).json({ status: 'success', data: await permissionService.getHolders(key) });
  } catch (error) {
    next(error);
  }
};

export const listActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const data = await adminActivityService.listActivity({
      adminId: q.adminId,
      domain: q.domain,
      entity: q.entity,
      entityId: q.entityId,
      method: q.method,
      errorsOnly: q.errorsOnly === 'true',
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getActivityStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hours = req.query.hours ? Number(req.query.hours) : 24;
    res
      .status(200)
      .json({ status: 'success', data: await adminActivityService.getActivityStats(hours) });
  } catch (error) {
    next(error);
  }
};

export const listLocks = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await resourceLockService.listActive() });
  } catch (error) {
    next(error);
  }
};

export const forceReleaseLock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resourceLockService.forceRelease(req.params.lockId as string);
    res.status(200).json({ status: 'success', message: 'Lock released' });
  } catch (error) {
    next(error);
  }
};
