import { Router } from 'express';
import * as recommendationController from '../controllers/recommendation.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { cache } from '../middleware/cache';
import { Role } from '@prisma/client';

const router = Router();

router.use(protect);

router.get(
  '/jobs',
  restrictTo(Role.CANDIDATE),
  cache({ ttl: 300, perUser: true }),
  recommendationController.getRecommendedJobs
);
router.post(
  '/jobs/:jobId/dismiss',
  restrictTo(Role.CANDIDATE),
  recommendationController.dismissRecommendation
);
router.get(
  '/candidates',
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  cache({ ttl: 300, perUser: true }),
  recommendationController.getRecommendedCandidatesForEmployer
);
router.get(
  '/candidates/:jobId',
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  cache({ ttl: 300, perUser: true }),
  recommendationController.getRecommendedCandidates
);

export default router;
