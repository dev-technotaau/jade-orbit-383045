import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import { requireMfaEnabled } from '../middleware/require-mfa';
import { superAdminOnly } from '../middleware/require-permission';
import { audit } from '../middleware/audit';
import { validate } from '../validators/validate';
import * as ctrl from '../controllers/admin-permission.controller';
import {
  assignRoleSchema,
  cloneGrantsSchema,
  grantPermissionSchema,
  roleSchema,
  roleUpdateSchema,
  setGrantsSchema,
  setRolesSchema,
} from '../schemas/admin-permission.schema';

/**
 * Admin control centre — the permission system's own management surface.
 *
 * Mounted at `/api/v1/super-admin/admin-control`.
 *
 * THREE independent locks guard this router, because it is the one place
 * where a privilege-escalation bug would be unrecoverable:
 *   1. `restrictTo(SUPER_ADMIN)` — role gate.
 *   2. `superAdminOnly` — explicit re-check that does not depend on the
 *      route table being wired correctly above it.
 *   3. The registry marks `admin_control.*` and `users.admins.*`
 *      `superAdminOnly`, so even a grant row naming them is refused at
 *      write time by `assertGrantable`.
 *
 * Belt, braces and a second pair of braces is the right amount of paranoia
 * for "the endpoint that hands out permissions".
 */

const router = Router();

// Records admin mutations for the control centre's activity feed. The
// middleware resolves the caller's role at RESPONSE time, so it is safe
// here even though this router applies `protect` per-route.
router.use(trackAdminActivity);

router.use(protect);
router.use(restrictTo(Role.SUPER_ADMIN));
router.use(superAdminOnly);
router.use(requireMfaEnabled);

// ── Registry ───────────────────────────────────────────────────────────
router.get('/registry', ctrl.getRegistry);

// ── Access matrix + oversight ──────────────────────────────────────────
router.get('/matrix', ctrl.getMatrix);
router.get('/holders', ctrl.getHolders);
router.get('/activity', ctrl.listActivity);
router.get('/activity/stats', ctrl.getActivityStats);
router.get('/locks', ctrl.listLocks);
router.delete(
  '/locks/:lockId',
  audit('ADMIN_LOCK_FORCE_RELEASE', 'ResourceLock'),
  ctrl.forceReleaseLock
);

// ── Roles ──────────────────────────────────────────────────────────────
router.get('/roles', ctrl.listRoles);
router.post(
  '/roles',
  validate(roleSchema),
  audit('ADMIN_ROLE_CREATE', 'AdminRole'),
  ctrl.createRole
);
router.put(
  '/roles/:roleId',
  validate(roleUpdateSchema),
  audit('ADMIN_ROLE_UPDATE', 'AdminRole'),
  ctrl.updateRole
);
router.delete('/roles/:roleId', audit('ADMIN_ROLE_DELETE', 'AdminRole'), ctrl.deleteRole);
router.post(
  '/roles/:roleId/assign',
  validate(assignRoleSchema),
  audit('ADMIN_ROLE_ASSIGN', 'AdminRoleAssignment'),
  ctrl.assignRole
);
router.delete(
  '/roles/:roleId/assign/:adminId',
  audit('ADMIN_ROLE_UNASSIGN', 'AdminRoleAssignment'),
  ctrl.unassignRole
);

// ── Per-admin grants ───────────────────────────────────────────────────
router.get('/admins/:id', ctrl.getAdminPermissions);
router.get('/admins/:id/explain', ctrl.explainPermission);
router.put(
  '/admins/:id/permissions',
  validate(setGrantsSchema),
  audit('ADMIN_PERMISSIONS_SET', 'AdminPermissionGrant'),
  ctrl.setAdminPermissions
);
router.post(
  '/admins/:id/permissions',
  validate(grantPermissionSchema),
  audit('ADMIN_PERMISSION_GRANT', 'AdminPermissionGrant'),
  ctrl.grantPermission
);
router.delete(
  '/admins/:id/permissions/:key',
  audit('ADMIN_PERMISSION_REVOKE', 'AdminPermissionGrant'),
  ctrl.revokePermission
);
router.delete(
  '/admins/:id/permissions',
  audit('ADMIN_PERMISSIONS_REVOKE_ALL', 'AdminPermissionGrant'),
  ctrl.revokeAll
);
router.put(
  '/admins/:id/roles',
  validate(setRolesSchema),
  audit('ADMIN_ROLES_SET', 'AdminRoleAssignment'),
  ctrl.setAdminRoles
);
router.post(
  '/admins/:id/clone',
  validate(cloneGrantsSchema),
  audit('ADMIN_PERMISSIONS_CLONE', 'AdminPermissionGrant'),
  ctrl.clonePermissions
);

export default router;
