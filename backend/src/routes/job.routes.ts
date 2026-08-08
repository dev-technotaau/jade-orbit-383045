import { Router } from 'express';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { cache } from '../middleware/cache';
import { etagCache } from '../middleware/etag';
import * as jobController from '../controllers/job.controller';
import { validate } from '../validators/validate';
import {
  createJobSchema,
  updateJobSchema,
  updateApplicationStatusSchema,
  updateOfflineHiresSchema,
  applyToJobSchema,
} from '../schemas/job.schema';
import { searchJobsSchema } from '../schemas/search.schema';
import { Role } from '@prisma/client';
import { audit } from '../middleware/audit';
import { planGate } from '../middleware/plan-gate';

const router = Router();

// Public: Search jobs (cached 60s — high-volume, query-string based, ETag for 304)
router.get(
  '/',
  validate(searchJobsSchema),
  etagCache({ ttl: 60 }),
  cache({ ttl: 60 }),
  jobController.searchJobs
);

// --- Static paths MUST be registered before /:id to avoid route conflicts ---

// Candidate: Get Saved Jobs
router.get('/saved', protect, restrictTo(Role.CANDIDATE), jobController.getSavedJobs);

// Candidate: Get Applied Jobs
router.get('/applications/me', protect, restrictTo(Role.CANDIDATE), jobController.getAppliedJobs);

// Employer: Get my posted jobs
router.get('/employer/my-jobs', protect, restrictTo(Role.EMPLOYER), jobController.getMyJobs);

// Application management (static multi-segment paths)
router.get('/applications/:applicationId', protect, jobController.getApplicationDetail);
router.patch(
  '/applications/:applicationId/withdraw',
  protect,
  restrictTo(Role.CANDIDATE),
  jobController.withdrawApplication
);
router.patch(
  '/applications/:applicationId',
  protect,
  restrictTo(Role.EMPLOYER),
  validate(updateApplicationStatusSchema),
  jobController.updateApplicationStatus
);

// Employer: record hires made off-platform for a posting. Declared BEFORE the
// public `/:id` GET for readability; it is a PATCH so there is no clash.
router.patch(
  '/:id/offline-hires',
  protect,
  restrictTo(Role.EMPLOYER),
  validate(updateOfflineHiresSchema),
  jobController.updateOfflineHires
);

// Public: View single job (cached 5min, ETag — must come AFTER static paths like /saved, /applications/me)
router.get('/:id', etagCache({ ttl: 300 }), cache({ ttl: 300 }), jobController.getJob);

// --- Dynamic /:id routes (all protected) ---

// Candidate actions
router.post(
  '/:id/apply',
  protect,
  restrictTo(Role.CANDIDATE),
  validate(applyToJobSchema),
  jobController.applyToJob
);
router.post('/:id/save', protect, restrictTo(Role.CANDIDATE), jobController.toggleSaveJob);

// Employer actions
router.post(
  '/:id/clone',
  protect,
  restrictTo(Role.EMPLOYER),
  audit('JOB_CREATE', 'JobPost'),
  jobController.cloneJob
);
router.get(
  '/:id/applications',
  protect,
  restrictTo(Role.EMPLOYER),
  jobController.getJobApplications
);
router.put(
  '/:id',
  protect,
  restrictTo(Role.EMPLOYER),
  validate(updateJobSchema),
  audit('JOB_UPDATE', 'JobPost'),
  jobController.updateJob
);
router.patch(
  '/:id/deactivate',
  protect,
  restrictTo(Role.EMPLOYER),
  audit('JOB_CLOSE', 'JobPost'),
  jobController.deactivateJob
);

// Employer: Create job
router.post(
  '/',
  protect,
  restrictTo(Role.EMPLOYER),
  planGate({
    require: ['feature.job_post'],
    minResource: { unit: 'JOB_POST', amount: 1 },
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
  }),
  validate(createJobSchema),
  audit('JOB_CREATE', 'JobPost'),
  jobController.createJob
);

export default router;
