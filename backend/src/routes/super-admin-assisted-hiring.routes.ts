import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import * as ctrl from '../controllers/assisted-hiring.controller';

const router = Router();

router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

router.get('/', requirePermission('assisted_hiring.view'), ctrl.queue);
router.get('/:id', requirePermission('assisted_hiring.view'), ctrl.detail);
router.patch('/:id/claim', requirePermission('assisted_hiring.claim'), ctrl.claim);
router.patch(
  '/:id/schedule-call',
  requirePermission('assisted_hiring.workflow.schedule_call'),
  ctrl.scheduleCall
);
router.patch('/:id/start', requirePermission('assisted_hiring.workflow.start'), ctrl.startSourcing);
router.post('/:id/profiles', requirePermission('assisted_hiring.profiles.add'), ctrl.addProfile);
router.delete(
  '/profiles/:profileId',
  requirePermission('assisted_hiring.profiles.remove'),
  ctrl.removeProfile
);
router.post('/:id/deliver', requirePermission('assisted_hiring.workflow.deliver'), ctrl.deliver);
router.patch(
  '/:id/complete',
  requirePermission('assisted_hiring.workflow.complete'),
  ctrl.complete
);
router.patch('/:id/cancel', requirePermission('assisted_hiring.workflow.cancel'), ctrl.cancel);

export default router;
