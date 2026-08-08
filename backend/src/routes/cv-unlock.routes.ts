import { Router } from 'express';
import { z } from 'zod';
import * as CvUnlockController from '../controllers/cv-unlock.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { Role } from '@prisma/client';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { planGate } from '../middleware/plan-gate';

const router = Router();

router.use(protect, restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN));

router.post(
  '/:id/unlock',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  planGate({
    require: ['feature.cv_db_access', 'feature.contact_details'],
    requireAll: false, // either suffices — Standard plan has contact_details, CV-DB has cv_db_access
    minResource: { unit: 'CV_UNLOCK', amount: 1 },
    skipForRoles: ['ADMIN', 'SUPER_ADMIN'],
  }),
  audit('UNLOCK_CV_CONTACT', 'CandidateProfile'),
  CvUnlockController.unlock
);

router.get('/me/unlocked', CvUnlockController.listUnlocked);

export default router;
