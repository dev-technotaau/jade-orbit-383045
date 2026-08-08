import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { audit } from '../middleware/audit';
import * as teamsController from '../controllers/super-admin-teams.controller';

const router = Router();

router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

router.get('/', requirePermission('teams.view'), teamsController.list);
// Force-revoke a member — bypasses owner-side RBAC for compliance. Declared
// before `/:companyId` so the literal `members` segment is not swallowed by
// the parameterised route.
router.delete(
  '/members/:memberId',
  requirePermission('teams.revoke'),
  audit('TEAM_MEMBER_FORCE_REVOKE', 'EmployerTeamMember'),
  teamsController.forceRevoke
);
router.get('/:companyId', requirePermission('teams.view'), teamsController.detail);

export default router;
