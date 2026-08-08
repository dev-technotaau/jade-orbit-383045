/**
 * Admin PBAC types + the client-side resolution logic.
 *
 * The canonical permission tree lives in the BACKEND
 * (`backend/src/config/permissions.ts`) and is fetched at runtime for the
 * grant editor. It is deliberately not duplicated here: two copies of a
 * 400-node tree drift, and a drifted access model is worse than no model.
 *
 * What IS defined here is the small set of keys the UI itself references
 * (nav gating, page guards) plus the resolution algorithm, which must match
 * the server's byte for byte — see `resolvePermission` below.
 */

export type PermissionEffect = 'ALLOW' | 'DENY';

export interface PermissionNode {
  segment: string;
  label: string;
  description?: string;
  superAdminOnly?: true;
  sensitive?: true;
  children?: PermissionNode[];
}

export interface ResolvedGrant {
  permissionKey: string;
  effect: PermissionEffect;
  source: 'direct' | 'role';
  roleName?: string;
  roleId?: string;
  expiresAt?: string | null;
  reason?: string | null;
}

export interface AdminRoleSummary {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface EffectivePermissions {
  isSuperAdmin: boolean;
  grants: ResolvedGrant[];
  /** Flat allow-set, fully expanded to leaves. What nav gating reads. */
  allowed: string[];
  roles: AdminRoleSummary[];
  registryVersion: string;
}

export interface PermissionRegistry {
  tree: PermissionNode[];
  version: string;
  grantableCount: number;
  totalCount: number;
}

export interface AdminRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  permissions: { permissionKey: string; effect: PermissionEffect }[];
  _count?: { assignments: number };
}

export interface AdminPermissionGrantRow {
  id: string;
  adminId: string;
  permissionKey: string;
  effect: PermissionEffect;
  expiresAt: string | null;
  reason: string | null;
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixAdmin {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isActive: boolean;
  isSuspended: boolean;
  lastActiveAt: string | null;
}

export interface MatrixRow {
  admin: MatrixAdmin;
  roles: AdminRoleSummary[];
  allowed: string[];
  directGrantCount: number;
  denyCount: number;
}

export interface PermissionExplanation {
  permissionKey: string;
  allowed: boolean;
  decisive: ResolvedGrant | null;
  considered: ResolvedGrant[];
  ancestors: string[];
}

export interface AdminActivityRow {
  id: string;
  adminId: string;
  permissionKey: string | null;
  permissionLabel: string | null;
  domain: string | null;
  method: string;
  route: string;
  entity: string | null;
  entityId: string | null;
  statusCode: number;
  durationMs: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
  };
}

export interface AdminActivityStats {
  windowHours: number;
  total: number;
  errors: number;
  errorRate: number;
  topAdmins: { admin: MatrixAdmin | null; count: number }[];
  topDomains: { domain: string | null; count: number }[];
}

// ── Resource locks ─────────────────────────────────────────────────────

export type ResourceLockMode = 'VIEWING' | 'EDITING';

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

export interface RecentEditor {
  admin: LockHolder['admin'];
  at: string;
  method: string;
  route: string;
}

export interface LockState {
  resourceType: string;
  resourceId: string;
  editor: LockHolder | null;
  viewers: LockHolder[];
  heldByMe: boolean;
  heartbeatMs: number;
  recentEditors?: RecentEditor[];
}

export interface ActiveLockRow extends LockHolder {
  id: string;
  resourceType: string;
  resourceId: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Resolution — MUST mirror backend/src/services/permission.service.ts
// ═══════════════════════════════════════════════════════════════════════

/**
 * Does `grantKey` cover `wanted`? Exact match or a dot-boundary ancestor.
 *
 * The boundary check matters: a plain `startsWith` would let a grant on
 * `email` satisfy `emailer.send`, silently widening access across an
 * unrelated domain.
 */
function covers(grantKey: string, wanted: string): boolean {
  return wanted === grantKey || wanted.startsWith(`${grantKey}.`);
}

function specificity(key: string): number {
  let n = 1;
  for (let i = 0; i < key.length; i++) if (key.charCodeAt(i) === 46) n++;
  return n;
}

/**
 * Longest-prefix-wins with DENY breaking ties.
 *
 * This is a faithful port of the server's `resolve()`. Keeping them in sync
 * is what stops the UI showing a button the API will refuse — but note the
 * client copy is a CONVENIENCE, never the boundary. Every endpoint re-checks
 * independently, so a tampered client gains nothing but a nav item that 403s.
 */
export function resolvePermission(grants: ResolvedGrant[], wanted: string): boolean {
  let bestDepth = -1;
  let bestEffect: PermissionEffect | null = null;

  for (const g of grants) {
    if (!covers(g.permissionKey, wanted)) continue;
    const depth = specificity(g.permissionKey);

    if (depth > bestDepth) {
      bestDepth = depth;
      bestEffect = g.effect;
      continue;
    }
    if (depth < bestDepth) continue;
    if (g.effect === 'DENY') bestEffect = 'DENY';
  }

  return bestEffect === 'ALLOW';
}

/** Flatten a registry tree into `{ key, node }` pairs in tree order. */
export function flattenRegistry(
  nodes: PermissionNode[],
  parent: string | null = null,
  inheritedSuperAdminOnly = false,
): { key: string; node: PermissionNode; depth: number; superAdminOnly: boolean }[] {
  const out: { key: string; node: PermissionNode; depth: number; superAdminOnly: boolean }[] = [];
  for (const node of nodes) {
    const key = parent ? `${parent}.${node.segment}` : node.segment;
    const superAdminOnly = inheritedSuperAdminOnly || node.superAdminOnly === true;
    out.push({ key, node, depth: key.split('.').length, superAdminOnly });
    if (node.children?.length) {
      out.push(...flattenRegistry(node.children, key, superAdminOnly));
    }
  }
  return out;
}

/** Every descendant key of `key` within the tree (not including itself). */
export function descendantKeys(tree: PermissionNode[], key: string): string[] {
  return flattenRegistry(tree)
    .map((e) => e.key)
    .filter((k) => k.startsWith(`${key}.`));
}
