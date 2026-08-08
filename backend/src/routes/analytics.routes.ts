import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requireAnyPermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { Role } from '@prisma/client';

/**
 * Advanced platform analytics.
 *
 * This router was role-gated only, so any ADMIN — including one holding zero
 * grants — could read platform-wide growth, funnel, salary and job-trend
 * datasets. Each route now also requires the matching `analytics.*`
 * permission.
 *
 * `requireAnyPermission` rather than a single key: `analytics.overview` is
 * the broad "you may see the analytics dashboards" grant held by the seeded
 * Support Agent / Content Moderator / Growth roles, and the narrower keys
 * exist for admins scoped to one dataset. Either should open the endpoint.
 */
const router = Router();

router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

router.get(
  '/advanced/user-growth',
  requireAnyPermission('analytics.overview', 'analytics.users'),
  analyticsController.getUserGrowth
);
router.get(
  '/advanced/application-funnel',
  requireAnyPermission('analytics.overview', 'analytics.applications'),
  analyticsController.getApplicationFunnel
);
router.get(
  '/advanced/popular-skills',
  requireAnyPermission('analytics.overview', 'analytics.jobs', 'analytics.trending'),
  analyticsController.getPopularSkills
);
router.get(
  '/advanced/salary-trends',
  requireAnyPermission('analytics.overview', 'analytics.jobs'),
  analyticsController.getSalaryTrends
);
router.get(
  '/advanced/job-trends',
  requireAnyPermission('analytics.overview', 'analytics.jobs'),
  analyticsController.getJobTrends
);

export default router;
