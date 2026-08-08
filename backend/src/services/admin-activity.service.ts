import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { getPermission } from '../config/permissions';

/**
 * Queries over the admin activity feed.
 *
 * Read side of `middleware/admin-activity.ts`. Powers the control centre's
 * "who is doing what" view, the per-admin activity tab, and the collision
 * heuristics that warn when two admins are converging on one record.
 */

export interface ActivityFilter {
  adminId?: string;
  domain?: string;
  entity?: string;
  entityId?: string;
  method?: string;
  /** Only failures (>= 400). Cheap way to spot an admin hitting walls. */
  errorsOnly?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

const adminSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
} as const;

function buildWhere(filter: ActivityFilter): Prisma.AdminActivityLogWhereInput {
  const where: Prisma.AdminActivityLogWhereInput = {};
  if (filter.adminId) where.adminId = filter.adminId;
  if (filter.domain) where.domain = filter.domain;
  if (filter.entity) where.entity = filter.entity;
  if (filter.entityId) where.entityId = filter.entityId;
  if (filter.method) where.method = filter.method.toUpperCase();
  if (filter.errorsOnly) where.statusCode = { gte: 400 };
  if (filter.from || filter.to) {
    where.createdAt = {};
    if (filter.from) where.createdAt.gte = filter.from;
    if (filter.to) where.createdAt.lte = filter.to;
  }
  return where;
}

export async function listActivity(filter: ActivityFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 25));
  const where = buildWhere(filter);

  const [items, total] = await Promise.all([
    prisma.adminActivityLog.findMany({
      where,
      include: { admin: { select: adminSelect } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminActivityLog.count({ where }),
  ]);

  return {
    items: items.map((row) => ({
      ...row,
      // The raw key is opaque in a feed; the registry label is what a human
      // is actually scanning for.
      permissionLabel: row.permissionKey ? (getPermission(row.permissionKey)?.label ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Rollup for the control-centre header: volume, error rate and the busiest
 * admins/domains over a window.
 */
export async function getActivityStats(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [total, errors, byAdmin, byDomain] = await Promise.all([
    prisma.adminActivityLog.count({ where: { createdAt: { gte: since } } }),
    prisma.adminActivityLog.count({
      where: { createdAt: { gte: since }, statusCode: { gte: 400 } },
    }),
    prisma.adminActivityLog.groupBy({
      by: ['adminId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { adminId: 'desc' } },
      take: 10,
    }),
    prisma.adminActivityLog.groupBy({
      by: ['domain'],
      where: { createdAt: { gte: since }, domain: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { domain: 'desc' } },
      take: 12,
    }),
  ]);

  // groupBy returns ids only — resolve them in one query rather than N.
  const admins = await prisma.user.findMany({
    where: { id: { in: byAdmin.map((r) => r.adminId) } },
    select: adminSelect,
  });
  const adminMap = new Map(admins.map((a) => [a.id, a]));

  return {
    windowHours: hours,
    total,
    errors,
    errorRate: total > 0 ? Number(((errors / total) * 100).toFixed(1)) : 0,
    topAdmins: byAdmin.map((r) => ({
      admin: adminMap.get(r.adminId) ?? null,
      count: r._count._all,
    })),
    topDomains: byDomain.map((r) => ({ domain: r.domain, count: r._count._all })),
  };
}

/**
 * Who else has touched this exact record recently.
 *
 * Rendered on edit screens next to the live presence badge: presence says
 * "someone is here now", this says "someone changed this twenty minutes
 * ago" — which is the case optimistic locking is about to catch.
 */
export async function getRecentEditors(entityId: string, excludeAdminId?: string, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.adminActivityLog.findMany({
    where: {
      entityId,
      createdAt: { gte: since },
      statusCode: { lt: 400 },
      ...(excludeAdminId ? { adminId: { not: excludeAdminId } } : {}),
    },
    include: { admin: { select: adminSelect } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Collapse to one entry per admin, keeping their most recent touch.
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      if (seen.has(r.adminId)) return false;
      seen.add(r.adminId);
      return true;
    })
    .map((r) => ({
      admin: r.admin,
      at: r.createdAt,
      method: r.method,
      route: r.route,
    }));
}

/** Retention trim. Activity is operational telemetry, not a compliance record. */
export async function pruneOlderThan(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.adminActivityLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

export const adminActivityService = {
  listActivity,
  getActivityStats,
  getRecentEditors,
  pruneOlderThan,
};
