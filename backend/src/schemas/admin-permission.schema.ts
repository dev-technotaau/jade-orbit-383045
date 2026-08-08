import { z } from 'zod';
import { isKnownPermission } from '../config/permissions';

/**
 * Validation for the admin control centre.
 *
 * `permissionKey` is checked against the live registry here so a malformed
 * key is rejected at the edge with a field-level message, before the
 * service layer's `assertGrantable` (which also enforces the
 * super-admin-only carve-out). Two checks, different jobs: this one catches
 * typos, that one catches privilege escalation.
 */

const permissionKey = z.string().min(1).max(120).refine(isKnownPermission, {
  message: 'Unknown permission key — it is not defined in the permission registry',
});

const effect = z.enum(['ALLOW', 'DENY']).optional();

/**
 * ISO timestamp for time-boxed grants. Must be in the future: a grant that
 * expires in the past is silently inert (resolution filters on the live
 * window), which reads as "the grant didn't work" rather than "you set a
 * bad date".
 */
const futureIso = z
  .string()
  .datetime({ offset: true })
  .refine((v) => new Date(v).getTime() > Date.now(), {
    message: 'expiresAt must be in the future',
  });

const grantEntry = z.object({
  permissionKey,
  effect,
  expiresAt: futureIso.optional(),
  reason: z.string().max(500).optional(),
});

export const setGrantsSchema = z.object({
  body: z.object({
    // An empty array is meaningful: it strips every direct grant.
    grants: z.array(grantEntry).max(500),
  }),
});

export const grantPermissionSchema = z.object({
  body: grantEntry,
});

export const setRolesSchema = z.object({
  body: z.object({
    roleIds: z.array(z.string().uuid()).max(50),
  }),
});

export const cloneGrantsSchema = z.object({
  body: z.object({
    sourceAdminId: z.string().uuid(),
    includeRoles: z.boolean().optional(),
  }),
});

export const assignRoleSchema = z.object({
  body: z.object({
    adminId: z.string().uuid(),
    expiresAt: futureIso.optional(),
  }),
});

const rolePermissions = z.array(z.object({ permissionKey, effect })).max(500);

export const roleSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60),
    description: z.string().max(500).nullish(),
    color: z.string().max(20).nullish(),
    permissions: rolePermissions,
  }),
});

export const roleUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(500).nullish(),
    color: z.string().max(20).nullish(),
    permissions: rolePermissions.optional(),
  }),
});

// ── Resource locks ─────────────────────────────────────────────────────

export const lockAcquireSchema = z.object({
  body: z.object({
    resourceType: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
    mode: z.enum(['VIEWING', 'EDITING']).optional(),
    takeover: z.boolean().optional(),
  }),
});

export const lockBodySchema = z.object({
  body: z.object({
    resourceType: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
  }),
});

export const lockQuerySchema = z.object({
  query: z.object({
    resourceType: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
  }),
});

export const lockBatchSchema = z.object({
  body: z.object({
    resourceType: z.string().min(1).max(64),
    resourceIds: z.array(z.string().min(1).max(128)).max(200),
  }),
});
