import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { audit } from '../middleware/audit';
import * as vendorsController from '../controllers/super-admin-vendors.controller';

const router = Router();

router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

// Combined teams + vendors analytics for the SA dashboard tile.
// Mounted under /vendors/analytics rather than /teams/analytics so the
// existing super-admin top-level group stays clean.
router.get('/analytics', requirePermission('vendors.analytics'), vendorsController.analytics);

router.get('/', requirePermission('vendors.view'), vendorsController.list);
// Review deletion is matched BEFORE `/:id` would otherwise claim it —
// Express matches in declaration order, and `/reviews/:reviewId` is two
// segments so it cannot collide, but keeping it adjacent to its siblings
// makes the ordering intent explicit.
router.delete(
  '/reviews/:reviewId',
  requirePermission('vendors.reviews.delete'),
  audit('VENDOR_REVIEW_DELETE', 'VendorReview'),
  vendorsController.deleteReview
);
router.get('/:id', requirePermission('vendors.view'), vendorsController.detail);
router.patch(
  '/:id/verify',
  requirePermission('vendors.verify'),
  audit('VENDOR_VERIFY', 'VendorProfile'),
  vendorsController.setVerified
);
router.patch(
  '/:id/visibility',
  requirePermission('vendors.visibility'),
  audit('VENDOR_VISIBILITY', 'VendorProfile'),
  vendorsController.setVisibility
);

export default router;
