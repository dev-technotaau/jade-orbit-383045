import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { planGate } from '../middleware/plan-gate';
import * as teamController from '../controllers/team.controller';

const router = Router();

router.use(protect);
router.use(restrictTo(Role.EMPLOYER));

// List team members — visible to all employers (owners see their actual
// team; non-owner employers see just themselves so the page never throws).
router.get('/', teamController.list);
router.get('/usage', teamController.usage);

// Invite a teammate — gated by feature.multi_seat (CV Enterprise tier).
router.post(
  '/invite',
  planGate({
    require: ['feature.multi_seat'],
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
  }),
  teamController.invite
);

// Accept an invitation — auth'd recipient hits this with the token from
// their email. No plan-gate (the invitee isn't paying).
router.post('/accept/:token', teamController.accept);

// Owner-only mutations.
router.delete('/:id', teamController.remove);
router.patch('/:id/role', teamController.changeRole);
router.post('/transfer-ownership', teamController.transferOwnership);

export default router;
