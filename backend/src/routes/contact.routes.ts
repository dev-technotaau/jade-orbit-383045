import { Router } from 'express';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import { requirePermission } from '../middleware/require-permission';
import { validate } from '../validators/validate';
import { submitContactSchema } from '../schemas/contact.schema';
import * as contactController from '../controllers/contact.controller';
import { Role } from '@prisma/client';
import { publicLimiter } from '../middleware/rate-limit';

const router = Router();

// Records admin mutations for the control centre's activity feed. The
// middleware resolves the caller's role at RESPONSE time, so it is safe
// here even though this router applies `protect` per-route.
router.use(trackAdminActivity);

// Public: Submit a contact form message (rate-limited)
router.post(
  '/',
  publicLimiter,
  validate(submitContactSchema),
  contactController.submitContactMessage
);

// Admin: List all contact messages
router.get(
  '/',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.contact.view'),
  contactController.listContactMessages
);

// Admin: Mark message as read
router.patch(
  '/:id/read',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.contact.view'),
  contactController.markContactMessageRead
);

// Admin: Delete message
router.delete(
  '/:id',
  protect,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requirePermission('support.contact.delete'),
  contactController.deleteContactMessage
);

export default router;
