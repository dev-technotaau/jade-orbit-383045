import { Router } from 'express';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import * as ctrl from '../controllers/assisted-hiring.controller';

const router = Router();

router.use(protect);
router.use(restrictTo(Role.EMPLOYER));

// Employer can see + edit their own request (intake form).
router.get('/me', ctrl.getMine);
router.patch('/:id/requirement', ctrl.updateRequirement);

export default router;
