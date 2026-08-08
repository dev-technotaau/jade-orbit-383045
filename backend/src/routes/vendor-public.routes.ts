import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect, optionalAuth } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import * as vendorController from '../controllers/vendor.controller';

const router = Router();

// Employer's own sent-requests view (must precede the `/:slug` routes so
// "me" isn't captured as a vendor slug). Any employer can send leads, so
// this is NOT behind the vendor-capability plan gate.
router.get(
  '/me/sent-leads',
  protect,
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  vendorController.listSentLeads
);

// Public read endpoints — anyone can browse the directory.
router.get('/', optionalAuth, vendorController.listPublic);
router.get('/:slug', optionalAuth, vendorController.getPublicBySlug);
router.get('/:slug/reviews', optionalAuth, vendorController.listReviews);

// Sending a lead requires an authenticated employer.
router.post(
  '/:slug/leads',
  protect,
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  vendorController.sendLead
);

// Auto-routing — preview the top-N matches (read-only, creates no leads).
router.post(
  '/match-preview',
  protect,
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  vendorController.matchPreview
);

// Auto-routing — fan out a single requirement to top-N matching vendors,
// optionally restricting to an explicit `vendorIds` list from the
// preview-then-confirm UI.
router.post(
  '/match-and-send',
  protect,
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  vendorController.matchAndSend
);

// Posting / updating a review requires an authenticated employer.
router.post(
  '/:slug/reviews',
  protect,
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  vendorController.upsertReview
);

export default router;
