import { Router } from 'express';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import { requirePermission } from '../middleware/require-permission';
import { cache } from '../middleware/cache';
import { Role } from '@prisma/client';
import * as featureFlagController from '../controllers/feature-flag.controller';

const router = Router();

// Records admin mutations for the control centre's activity feed. The
// middleware resolves the caller's role at RESPONSE time, so it is safe
// here even though this router applies `protect` per-route.
router.use(trackAdminActivity);

// Public: client flags (no auth required — cached 60s, short TTL so maintenance toggle works quickly)
// ?fresh=true bypasses Redis cache entirely (used by maintenance page auto-refresh)
router.get(
  '/client',
  cache({ ttl: 60, bypassParam: 'fresh' }),
  featureFlagController.getClientFlags
);

// Admin only: all flags
router.get(
  '/',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('platform.feature_flags.view'),
  featureFlagController.getFlags
);

// Admin only: single flag
router.get(
  '/:key',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('platform.feature_flags.view'),
  featureFlagController.getFlagByKey
);

export default router;
