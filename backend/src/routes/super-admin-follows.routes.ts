/**
 * Super-admin follow routes — read-only insight into the follow graph.
 *
 *   GET /super-admin/follows/stats
 *   GET /super-admin/follows/companies/:companyId/followers
 *   GET /super-admin/follows/users/:userId/following
 *
 * All routes are SUPER_ADMIN-only. No mutations from this surface —
 * super-admins shouldn't follow/unfollow on behalf of users.
 */
import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requireAnyPermission, requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import * as ctrl from '../controllers/super-admin-follows.controller';

const router = Router();
router.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

const companyIdParams = z.object({ companyId: z.string().uuid() });
const userIdParams = z.object({ userId: z.string().uuid() });

// `follows.view` also opens this: the page's ONLY query is stats, so gating
// it on `follows.stats` alone meant an admin granted `follows.view` — the key
// the nav item advertises — saw an empty page. Aggregates are strictly less
// sensitive than the per-company follower lists `follows.view` already
// unlocks, so admitting either is correct rather than merely convenient.
router.get(
  '/stats',
  requireAnyPermission('follows.stats', 'follows.view'),
  audit('VIEW_FOLLOW_STATS', 'CompanyFollow'),
  ctrl.getStats
);
router.get(
  '/companies/:companyId/followers',
  requirePermission('follows.view'),
  validate({ params: companyIdParams }),
  audit('VIEW_COMPANY_FOLLOWERS', 'CompanyFollow'),
  ctrl.listCompanyFollowers
);
router.get(
  '/users/:userId/following',
  requirePermission('follows.view'),
  validate({ params: userIdParams }),
  audit('VIEW_USER_FOLLOWING', 'CompanyFollow'),
  ctrl.listUserFollowing
);

export default router;
