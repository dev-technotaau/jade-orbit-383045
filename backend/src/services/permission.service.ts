import type { PermissionEffect, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import {
  ALL_PERMISSION_KEYS,
  GRANTABLE_PERMISSION_KEYS,
  PERMISSION_REGISTRY_VERSION,
  PERMISSION_TREE,
  ancestorsOf,
  expandKeys,
  getPermission,
  isGrantablePermission,
  isKnownPermission,
} from '../config/permissions';

/**
 * Admin permission resolution.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── The resolution rule ────────────────────────────────────────────────
 * An admin's effective grants are the union of their direct grants and the
 * grants of every role they hold. To answer "can they do X?" we find the
 * LONGEST grant key that is a prefix of X, and take its effect.
 *
 *   ALLOW email
 *   DENY  email.settings
 *   → email.campaigns.send  ⇒ longest match is `email`          ⇒ ALLOW
 *   → email.settings.edit   ⇒ longest match is `email.settings` ⇒ DENY
 *
 * Ties are broken in this order:
 *   1. DENY beats ALLOW at equal specificity — a deny is a deliberate
 *      carve-out and must not be silently outvoted by a broad allow.
 *   2. Direct grants beat role grants at equal specificity — the
 *      super-admin's per-admin override is the more specific intent.
 *
 * The rule is prefix-only, never expansion. That matters: when a new
 * sub-permission ships, every admin holding the parent branch picks it up
 * without a backfill. The inverse safety property is that a DENY on a
 * branch likewise covers everything added beneath it later.
 *
 * ── SUPER_ADMIN ────────────────────────────────────────────────────────
 * Authorised by role, never by grant. `getEffectivePermissions` short-
 * circuits and `can()` returns true unconditionally. There is deliberately
 * no way to grant, deny or revoke a super-admin's access through this
 * system — otherwise a bad row could lock the platform owner out.
 *
 * ── Caching ────────────────────────────────────────────────────────────
 * Resolution is on the hot path of every admin request, so the compiled
 * grant list is cached in Redis for 5 minutes under a key that includes
 * the registry version (a deploy that changes the tree invalidates every
 * cached entry for free). Every mutation calls `invalidate()`.
 *
 * Redis is optional in this codebase (`redis` can be a stub), so all cache
 * paths degrade to a direct DB read rather than failing.
 */

export type { PermissionEffect };

/** One resolved grant, with provenance for the "why?" view. */
export interface ResolvedGrant {
  permissionKey: string;
  effect: PermissionEffect;
  /** Where it came from — a direct grant or a named role. */
  source: 'direct' | 'role';
  /** Role name when `source === 'role'`. */
  roleName?: string;
  roleId?: string;
  expiresAt?: string | null;
  reason?: string | null;
}

export interface EffectivePermissions {
  /** SUPER_ADMIN holds every permission implicitly. */
  isSuperAdmin: boolean;
  /** The compiled grant list used for checks. */
  grants: ResolvedGrant[];
  /**
   * Convenience projection: every ALLOW key with no overriding DENY,
   * fully expanded to leaves. Used by the frontend for nav gating so the
   * client never has to re-implement prefix resolution.
   */
  allowed: string[];
  roles: { id: string; name: string; slug: string; color: string | null }[];
  registryVersion: string;
}

const CACHE_TTL_SECONDS = 300;
const cacheKey = (adminId: string) => `admin_perms:${PERMISSION_REGISTRY_VERSION}:${adminId}`;

// ───────────────────────────────────────────────────────────────────────
// Matching
// ───────────────────────────────────────────────────────────────────────

/**
 * Does `grantKey` cover `wanted`?
 *
 * Exact match, or `grantKey` is a proper dot-boundary ancestor. The
 * boundary check is what stops `email` from matching `emailer.send` — a
 * naive `startsWith` would grant an unrelated domain.
 */
function covers(grantKey: string, wanted: string): boolean {
  return wanted === grantKey || wanted.startsWith(`${grantKey}.`);
}

/** Specificity = segment count. `a.b.c` (3) beats `a.b` (2). */
function specificity(key: string): number {
  let n = 1;
  for (let i = 0; i < key.length; i++) if (key.charCodeAt(i) === 46 /* '.' */) n++;
  return n;
}

/**
 * Apply the resolution rule to a compiled grant list.
 * Exported so the middleware, the API and the "simulate" preview all share
 * one implementation — a second copy is how permission systems drift into
 * "the UI says yes but the server says no".
 */
export function resolve(grants: ResolvedGrant[], wanted: string): boolean {
  let bestDepth = -1;
  let bestEffect: PermissionEffect | null = null;
  let bestIsDirect = false;

  for (const g of grants) {
    // A time-boxed grant must stop authorising the moment it lapses.
    // `liveWindow()` filters expired rows at LOAD time, but the compiled
    // list is cached for 5 minutes — so a grant that expired mid-window
    // kept working until the cache turned over. Re-checking here is a no-op
    // on a fresh list and closes that tail for every caller: the
    // middleware, `can()`, `projectAllowed()` and the explain preview.
    if (g.expiresAt && Date.parse(g.expiresAt) <= Date.now()) continue;

    if (!covers(g.permissionKey, wanted)) continue;
    const depth = specificity(g.permissionKey);
    const isDirect = g.source === 'direct';

    if (depth > bestDepth) {
      bestDepth = depth;
      bestEffect = g.effect;
      bestIsDirect = isDirect;
      continue;
    }
    if (depth < bestDepth) continue;

    // ── Equal specificity ──
    // 1. DENY wins outright.
    if (g.effect === 'DENY' && bestEffect === 'ALLOW') {
      bestEffect = 'DENY';
      bestIsDirect = isDirect;
      continue;
    }
    if (g.effect === 'ALLOW' && bestEffect === 'DENY') continue;
    // 2. Same effect — prefer the direct grant so provenance is accurate.
    if (isDirect && !bestIsDirect) bestIsDirect = true;
  }

  return bestEffect === 'ALLOW';
}

/** Expand a grant list into the flat allow-set the frontend consumes. */
function projectAllowed(grants: ResolvedGrant[]): string[] {
  const allowKeys = grants.filter((g) => g.effect === 'ALLOW').map((g) => g.permissionKey);
  const candidates = expandKeys(allowKeys);
  const out: string[] = [];
  for (const key of candidates) if (resolve(grants, key)) out.push(key);
  return out.sort();
}

// ───────────────────────────────────────────────────────────────────────
// Loading
// ───────────────────────────────────────────────────────────────────────

/** `expiresAt` null (never expires) or still in the future. */
function liveWindow() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

async function loadFromDb(adminId: string): Promise<Omit<EffectivePermissions, 'isSuperAdmin'>> {
  const [direct, assignments] = await Promise.all([
    prisma.adminPermissionGrant.findMany({
      where: { adminId, ...liveWindow() },
      // Stable ordering so React Query's structural sharing preserves object
      // identity across refetches. The grant editor reseeds on identity
      // change, and unstable row order made it reseed spuriously.
      orderBy: { permissionKey: 'asc' },
      select: {
        permissionKey: true,
        effect: true,
        expiresAt: true,
        reason: true,
      },
    }),
    prisma.adminRoleAssignment.findMany({
      where: { adminId, ...liveWindow() },
      select: {
        expiresAt: true,
        role: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            permissions: { select: { permissionKey: true, effect: true } },
          },
        },
      },
    }),
  ]);

  const grants: ResolvedGrant[] = [];

  for (const a of assignments) {
    for (const p of a.role.permissions) {
      // A stale key (registry node deleted in a later deploy) is dropped
      // rather than trusted — an unknown string must never authorise.
      if (!isKnownPermission(p.permissionKey)) continue;
      grants.push({
        permissionKey: p.permissionKey,
        effect: p.effect,
        source: 'role',
        roleName: a.role.name,
        roleId: a.role.id,
        expiresAt: a.expiresAt?.toISOString() ?? null,
      });
    }
  }

  for (const g of direct) {
    if (!isKnownPermission(g.permissionKey)) continue;
    grants.push({
      permissionKey: g.permissionKey,
      effect: g.effect,
      source: 'direct',
      expiresAt: g.expiresAt?.toISOString() ?? null,
      reason: g.reason,
    });
  }

  return {
    grants,
    allowed: projectAllowed(grants),
    roles: assignments.map((a) => ({
      id: a.role.id,
      name: a.role.name,
      slug: a.role.slug,
      color: a.role.color,
    })),
    registryVersion: PERMISSION_REGISTRY_VERSION,
  };
}

/**
 * Effective permissions for a user. Cached; safe to call per-request.
 * `role` is passed in (the auth middleware already has it) to avoid a
 * second User lookup on every admin request.
 */
export async function getEffectivePermissions(
  adminId: string,
  role: string
): Promise<EffectivePermissions> {
  if (role === 'SUPER_ADMIN') {
    return {
      isSuperAdmin: true,
      grants: [],
      // Super-admins bypass every check, so the projection is only used
      // for UI rendering — hand it the full registry.
      allowed: ALL_PERMISSION_KEYS,
      roles: [],
      registryVersion: PERMISSION_REGISTRY_VERSION,
    };
  }

  if (redis) {
    try {
      const cached = await redis.get(cacheKey(adminId));
      if (cached) {
        return {
          isSuperAdmin: false,
          ...(JSON.parse(cached) as Omit<EffectivePermissions, 'isSuperAdmin'>),
        };
      }
    } catch (err) {
      logger.debug('Permission cache read failed:', (err as Error).message);
    }
  }

  const fresh = await loadFromDb(adminId);

  if (redis) {
    try {
      await redis.set(cacheKey(adminId), JSON.stringify(fresh), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      logger.debug('Permission cache write failed:', (err as Error).message);
    }
  }

  return { isSuperAdmin: false, ...fresh };
}

/** Drop the cached grant list for one admin. Call after every mutation. */
export async function invalidate(adminId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(cacheKey(adminId));
  } catch (err) {
    logger.debug('Permission cache invalidation failed:', (err as Error).message);
  }
}

/** Drop cached grants for every admin holding a role (used on role edits). */
export async function invalidateRole(roleId: string): Promise<void> {
  const assignments = await prisma.adminRoleAssignment.findMany({
    where: { roleId },
    select: { adminId: true },
  });
  await Promise.all(assignments.map((a) => invalidate(a.adminId)));
}

/** The single authorisation question. */
export async function can(userId: string, role: string, permissionKey: string): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  if (role !== 'ADMIN') return false;
  const effective = await getEffectivePermissions(userId, role);
  return resolve(effective.grants, permissionKey);
}

// ───────────────────────────────────────────────────────────────────────
// Mutation
// ───────────────────────────────────────────────────────────────────────

/**
 * Reject anything that isn't a real, admin-grantable key.
 *
 * This is the chokepoint that keeps `users.admins.*` and
 * `admin_control.*` out of every admin's grant list — no admin may mint a
 * peer or widen their own access, so those subtrees are refused here
 * regardless of who is asking.
 */
export function assertGrantable(permissionKey: string): void {
  if (!isKnownPermission(permissionKey)) {
    throw new AppError(`Unknown permission: "${permissionKey}"`, 400, 'UNKNOWN_PERMISSION');
  }
  if (!isGrantablePermission(permissionKey)) {
    throw new AppError(
      `"${getPermission(permissionKey)!.label}" is reserved for super-admins and cannot be granted.`,
      400,
      'PERMISSION_NOT_GRANTABLE'
    );
  }
}

async function assertIsAdmin(adminId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: adminId },
    select: { role: true },
  });
  if (!user) throw new AppError('Admin not found', 404, 'NOT_FOUND');
  if (user.role !== 'ADMIN') {
    throw new AppError(
      user.role === 'SUPER_ADMIN'
        ? 'Super-admins hold every permission by role and cannot be granted individual permissions.'
        : 'Permissions can only be granted to admin accounts.',
      400,
      'NOT_AN_ADMIN'
    );
  }
}

export interface GrantInput {
  permissionKey: string;
  effect?: PermissionEffect;
  expiresAt?: Date | null;
  reason?: string | null;
}

/**
 * Replace an admin's ENTIRE direct grant set in one transaction.
 *
 * The editor is a tree of checkboxes, so a whole-set replace is both the
 * natural fit and the safe one: a partial patch stream can interleave with
 * a concurrent edit and leave a half-applied permission set, which is the
 * one outcome an access-control system must never produce.
 */
export async function setDirectGrants(
  adminId: string,
  grants: GrantInput[],
  grantedBy: string
): Promise<ResolvedGrant[]> {
  await assertIsAdmin(adminId);

  const seen = new Set<string>();
  for (const g of grants) {
    assertGrantable(g.permissionKey);
    if (seen.has(g.permissionKey)) {
      throw new AppError(
        `Duplicate permission in payload: "${g.permissionKey}"`,
        400,
        'DUPLICATE_PERMISSION'
      );
    }
    seen.add(g.permissionKey);
  }

  await prisma.$transaction([
    prisma.adminPermissionGrant.deleteMany({ where: { adminId } }),
    prisma.adminPermissionGrant.createMany({
      data: grants.map((g) => ({
        adminId,
        permissionKey: g.permissionKey,
        effect: g.effect ?? 'ALLOW',
        expiresAt: g.expiresAt ?? null,
        reason: g.reason ?? null,
        grantedBy,
      })),
    }),
  ]);

  await invalidate(adminId);
  const effective = await loadFromDb(adminId);
  return effective.grants;
}

/** Add or update a single grant without touching the rest. */
export async function upsertGrant(
  adminId: string,
  input: GrantInput,
  grantedBy: string
): Promise<void> {
  await assertIsAdmin(adminId);
  assertGrantable(input.permissionKey);

  await prisma.adminPermissionGrant.upsert({
    where: { adminId_permissionKey: { adminId, permissionKey: input.permissionKey } },
    create: {
      adminId,
      permissionKey: input.permissionKey,
      effect: input.effect ?? 'ALLOW',
      expiresAt: input.expiresAt ?? null,
      reason: input.reason ?? null,
      grantedBy,
    },
    update: {
      effect: input.effect ?? 'ALLOW',
      expiresAt: input.expiresAt ?? null,
      reason: input.reason ?? null,
      grantedBy,
    },
  });

  await invalidate(adminId);
}

export async function revokeGrant(adminId: string, permissionKey: string): Promise<void> {
  await prisma.adminPermissionGrant.deleteMany({ where: { adminId, permissionKey } });
  await invalidate(adminId);
}

export async function revokeAllGrants(adminId: string): Promise<void> {
  await prisma.$transaction([
    prisma.adminPermissionGrant.deleteMany({ where: { adminId } }),
    prisma.adminRoleAssignment.deleteMany({ where: { adminId } }),
  ]);
  await invalidate(adminId);
}

// ───────────────────────────────────────────────────────────────────────
// Roles
// ───────────────────────────────────────────────────────────────────────

export interface RoleInput {
  name: string;
  description?: string | null;
  color?: string | null;
  permissions: { permissionKey: string; effect?: PermissionEffect }[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createRole(input: RoleInput, createdBy: string) {
  for (const p of input.permissions) assertGrantable(p.permissionKey);

  const slug = slugify(input.name);
  if (!slug) {
    throw new AppError(
      'Role name must contain at least one letter or digit',
      400,
      'INVALID_ROLE_NAME'
    );
  }

  return prisma.adminRole.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      color: input.color ?? 'blue',
      createdBy,
      permissions: {
        create: input.permissions.map((p) => ({
          permissionKey: p.permissionKey,
          effect: p.effect ?? 'ALLOW',
        })),
      },
    },
    include: { permissions: true, _count: { select: { assignments: true } } },
  });
}

export async function updateRole(roleId: string, input: Partial<RoleInput>) {
  const existing = await prisma.adminRole.findUnique({ where: { id: roleId } });
  if (!existing) throw new AppError('Role not found', 404, 'NOT_FOUND');

  if (input.permissions) {
    for (const p of input.permissions) assertGrantable(p.permissionKey);
  }

  const data: Prisma.AdminRoleUpdateInput = {};
  if (input.name !== undefined) {
    data.name = input.name.trim();
    // ── A SYSTEM role's slug is its identity, and must never move ──
    // `ensureSystemRoles()` reconciles the baseline roles on every boot by
    // looking each one up by slug and CREATING it when absent. Re-slugging
    // "Support Agent" to `tier-1-support` therefore made the original row
    // invisible to that lookup, so the next process start silently minted a
    // second, empty "Support Agent" — leaving two roles with the same
    // apparent name, one of which held all the real assignments.
    // Renaming stays allowed (it is just a display label); only the slug is
    // pinned.
    if (!existing.isSystem) data.slug = slugify(input.name);
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.color !== undefined) data.color = input.color;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.permissions) {
      await tx.adminRolePermission.deleteMany({ where: { roleId } });
      await tx.adminRolePermission.createMany({
        data: input.permissions.map((p) => ({
          roleId,
          permissionKey: p.permissionKey,
          effect: p.effect ?? 'ALLOW',
        })),
      });
    }
    return tx.adminRole.update({
      where: { id: roleId },
      data,
      include: { permissions: true, _count: { select: { assignments: true } } },
    });
  });

  // Roles are live-linked, so a permission edit changes what every holder
  // can do right now — their caches must go with it.
  await invalidateRole(roleId);
  return updated;
}

export async function deleteRole(roleId: string): Promise<void> {
  const role = await prisma.adminRole.findUnique({
    where: { id: roleId },
    select: { isSystem: true },
  });
  if (!role) throw new AppError('Role not found', 404, 'NOT_FOUND');
  if (role.isSystem) {
    throw new AppError(
      'System roles ship with the platform and cannot be deleted. Clone it instead.',
      400,
      'SYSTEM_ROLE'
    );
  }
  await invalidateRole(roleId);
  await prisma.adminRole.delete({ where: { id: roleId } });
}

export async function listRoles() {
  return prisma.adminRole.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: {
      permissions: { select: { permissionKey: true, effect: true } },
      _count: { select: { assignments: true } },
    },
  });
}

export async function assignRole(
  roleId: string,
  adminId: string,
  assignedBy: string,
  expiresAt?: Date | null
) {
  await assertIsAdmin(adminId);
  const assignment = await prisma.adminRoleAssignment.upsert({
    where: { roleId_adminId: { roleId, adminId } },
    create: { roleId, adminId, assignedBy, expiresAt: expiresAt ?? null },
    update: { assignedBy, expiresAt: expiresAt ?? null },
  });
  await invalidate(adminId);
  return assignment;
}

export async function unassignRole(roleId: string, adminId: string): Promise<void> {
  await prisma.adminRoleAssignment.deleteMany({ where: { roleId, adminId } });
  await invalidate(adminId);
}

/** Replace the full role set on one admin. */
export async function setRoles(
  adminId: string,
  roleIds: string[],
  assignedBy: string
): Promise<void> {
  await assertIsAdmin(adminId);
  await prisma.$transaction([
    prisma.adminRoleAssignment.deleteMany({ where: { adminId } }),
    prisma.adminRoleAssignment.createMany({
      data: roleIds.map((roleId) => ({ roleId, adminId, assignedBy })),
      skipDuplicates: true,
    }),
  ]);
  await invalidate(adminId);
}

// ───────────────────────────────────────────────────────────────────────
// Introspection (control centre)
// ───────────────────────────────────────────────────────────────────────

/** The registry, for the tree editor. */
export function getRegistry() {
  return {
    tree: PERMISSION_TREE,
    version: PERMISSION_REGISTRY_VERSION,
    grantableCount: GRANTABLE_PERMISSION_KEYS.length,
    totalCount: ALL_PERMISSION_KEYS.length,
  };
}

/**
 * The access matrix: every admin × their effective allow-set. Powers the
 * control centre's "who can do what" grid and the reverse lookup ("which
 * admins hold billing.refunds.process?").
 */
export async function getAccessMatrix() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      isActive: true,
      isSuspended: true,
      lastActiveAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const rows = await Promise.all(
    admins.map(async (admin) => {
      const effective = await loadFromDb(admin.id);
      return {
        admin,
        roles: effective.roles,
        allowed: effective.allowed,
        directGrantCount: effective.grants.filter((g) => g.source === 'direct').length,
        denyCount: effective.grants.filter((g) => g.effect === 'DENY').length,
      };
    })
  );

  return rows;
}

/** Which admins hold a given permission — the reverse of the matrix. */
export async function getHolders(permissionKey: string) {
  if (!isKnownPermission(permissionKey)) {
    throw new AppError(`Unknown permission: "${permissionKey}"`, 400, 'UNKNOWN_PERMISSION');
  }
  const matrix = await getAccessMatrix();
  return matrix
    .filter((row) => row.allowed.includes(permissionKey))
    .map((row) => ({ admin: row.admin, roles: row.roles }));
}

/**
 * Explain a decision: which grant actually decided it, and why. Backs the
 * "why can/can't this admin do X?" popover — an access-control system that
 * cannot explain itself gets worked around instead of used.
 */
export async function explain(adminId: string, permissionKey: string) {
  if (!isKnownPermission(permissionKey)) {
    throw new AppError(`Unknown permission: "${permissionKey}"`, 400, 'UNKNOWN_PERMISSION');
  }
  const { grants } = await loadFromDb(adminId);
  const matching = grants
    .filter((g) => covers(g.permissionKey, permissionKey))
    .sort((a, b) => specificity(b.permissionKey) - specificity(a.permissionKey));

  const allowed = resolve(grants, permissionKey);
  const decisive = matching.find(
    (g) =>
      specificity(g.permissionKey) ===
        (matching[0] ? specificity(matching[0].permissionKey) : -1) &&
      g.effect === (allowed ? 'ALLOW' : 'DENY')
  );

  return {
    permissionKey,
    allowed,
    /** The grant that won, or null when nothing matched (implicit deny). */
    decisive: decisive ?? null,
    /** Every grant that touched this key, most specific first. */
    considered: matching,
    /** Ancestor keys a super-admin could grant to widen this in one step. */
    ancestors: ancestorsOf(permissionKey),
  };
}

/**
 * Sweep expired grants and role assignments.
 *
 * Purely hygienic — resolution already filters on the live window, so an
 * un-swept expired row authorises nothing. This just stops the tables
 * accumulating dead rows and keeps the control-centre counts honest.
 */
export async function sweepExpired(): Promise<{ grants: number; assignments: number }> {
  const now = new Date();
  const [grants, assignments] = await prisma.$transaction([
    prisma.adminPermissionGrant.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.adminRoleAssignment.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  if (grants.count || assignments.count) {
    logger.info(
      `PBAC sweep: removed ${grants.count} expired grant(s), ${assignments.count} expired role assignment(s)`
    );
  }
  return { grants: grants.count, assignments: assignments.count };
}

// ───────────────────────────────────────────────────────────────────────
// System roles
// ───────────────────────────────────────────────────────────────────────

/**
 * The baseline roles that ship with the product.
 *
 * These exist so a fresh install is USABLE on day one: a super-admin adding
 * their first help-desk hire should not have to reason about 400 permission
 * keys to get a working account. Each is a coherent job description, not a
 * grab-bag.
 *
 * They are `isSystem` (undeletable, cloneable) and are created ONLY if
 * absent — an operator who edits "Support Agent" keeps their edits across
 * every subsequent deploy. We never overwrite.
 *
 * Note what is deliberately absent: none of them include `billing.refunds.*`,
 * `platform.system_config.edit`, or anything that moves money or changes
 * platform behaviour. Those are grants a human should make consciously.
 */
const SYSTEM_ROLES: Array<{
  name: string;
  slug: string;
  description: string;
  color: string;
  keys: string[];
}> = [
  {
    name: 'Support Agent',
    slug: 'support-agent',
    description:
      'Front-line help desk: read users, work tickets and contact messages, no destructive or credential powers.',
    color: 'blue',
    keys: [
      'users.candidates.account.view',
      'users.candidates.activity.applications',
      'users.employers.account.view',
      'users.employers.activity.jobs',
      'support.tickets.view',
      'support.tickets.view_all',
      'support.tickets.reply',
      'support.tickets.notes',
      'support.tickets.assign',
      'support.tickets.status',
      'support.tickets.close',
      'support.contact.view',
      'jobs.listing.view',
      'analytics.overview',
    ],
  },
  {
    name: 'Content Moderator',
    slug: 'content-moderator',
    description:
      'Polices job posts, reviews and flagged content. Can approve, reject and flag — and delete reviews, but not accounts.',
    color: 'amber',
    keys: [
      'jobs.listing.view',
      'jobs.moderation',
      'moderation',
      'reviews',
      'verifications.candidate',
      'verifications.employer',
      'curated_listings',
      'analytics.overview',
    ],
  },
  {
    name: 'Growth / Marketing',
    slug: 'growth-marketing',
    description:
      'Runs the WhatsApp and Email campaign systems end to end, including sending. No settings or deliverability configuration.',
    color: 'violet',
    keys: [
      'whatsapp.inbox',
      'whatsapp.contacts',
      'whatsapp.templates',
      'whatsapp.campaigns',
      'whatsapp.segments',
      'whatsapp.automation',
      'whatsapp.analytics',
      'email.inbox',
      'email.contacts',
      'email.sets',
      'email.segments',
      'email.templates',
      'email.campaigns',
      'email.automation',
      'email.analytics',
      'email.bulk_jobs',
      'analytics.overview',
    ],
  },
  {
    name: 'Billing Operations',
    slug: 'billing-operations',
    description:
      'Reads the financial centre and works refunds, disputes and quotes. Cannot edit the plan catalogue or billing settings.',
    color: 'emerald',
    keys: [
      'billing.dashboard',
      'billing.orders',
      'billing.transactions',
      'billing.subscriptions.view',
      'billing.invoices',
      'billing.refunds',
      'billing.settlements',
      'billing.disputes',
      'billing.quotes',
      'billing.coupons.view',
      'billing.plans.view',
      'billing.ledger.view',
      'billing.audit',
    ],
  },
  {
    name: 'Read Only Auditor',
    slug: 'read-only-auditor',
    description:
      'Sees everything that can be seen and changes nothing. Useful for compliance reviews and onboarding.',
    color: 'slate',
    keys: [
      'users.candidates.account.view',
      'users.employers.account.view',
      'jobs.listing.view',
      'jobs.applications.view',
      'jobs.applications.stats',
      'verifications.candidate.view',
      'verifications.employer.view',
      'moderation.keywords.view',
      'reviews.view',
      'support.tickets.view',
      'support.tickets.view_all',
      'support.analytics',
      'whatsapp.inbox.view',
      'whatsapp.analytics.view',
      'email.inbox.view',
      'email.analytics.view',
      'billing.dashboard',
      'billing.audit',
      'vendors.view',
      'teams.view',
      'follows.view',
      'follows.stats',
      'analytics',
      'platform.audit_logs.view',
    ],
  },
];

/**
 * Create any missing system roles. Idempotent; safe to run on every boot.
 * Never updates an existing row — operator edits win.
 */
export async function ensureSystemRoles(createdBy = 'system'): Promise<number> {
  let created = 0;

  for (const spec of SYSTEM_ROLES) {
    const existing = await prisma.adminRole.findUnique({ where: { slug: spec.slug } });
    if (existing) continue;

    // A key that vanished from the registry in a later refactor must not
    // block the whole role from being created.
    const keys = spec.keys.filter(isGrantablePermission);
    const dropped = spec.keys.length - keys.length;
    if (dropped > 0) {
      logger.warn(
        `System role "${spec.name}": ${dropped} permission key(s) are no longer in the registry and were skipped.`
      );
    }

    await prisma.adminRole.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        color: spec.color,
        isSystem: true,
        createdBy,
        permissions: { create: keys.map((permissionKey) => ({ permissionKey })) },
      },
    });
    created += 1;
  }

  if (created > 0) logger.info(`PBAC: created ${created} system role(s)`);
  return created;
}

export const permissionService = {
  ensureSystemRoles,
  getEffectivePermissions,
  can,
  resolve,
  invalidate,
  invalidateRole,
  setDirectGrants,
  upsertGrant,
  revokeGrant,
  revokeAllGrants,
  assertGrantable,
  createRole,
  updateRole,
  deleteRole,
  listRoles,
  assignRole,
  unassignRole,
  setRoles,
  getRegistry,
  getAccessMatrix,
  getHolders,
  explain,
  sweepExpired,
};
