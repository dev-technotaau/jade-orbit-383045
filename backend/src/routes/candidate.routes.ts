import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import * as candidateController from '../controllers/candidate.controller';
import * as jobAlertController from '../controllers/job-alert.controller';
import { Role } from '@prisma/client';
import { validate } from '../validators/validate';
import { updateCandidateProfileSchema } from '../schemas/candidate.schema';
import { createJobAlertSchema, updateJobAlertSchema } from '../schemas/job-alert.schema';
import { audit } from '../middleware/audit';
import { cache } from '../middleware/cache';
import { apiLimiter } from '../middleware/rate-limit';

const router = Router();

const storage = multer.memoryStorage();

const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const resumeUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_RESUME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_RESUME_TYPES.join(', ')}`));
    }
  },
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    }
  },
});

router.use(protect);
// The CV-database routes below are ADMIN-reachable and now permission-gated,
// so admin access to candidate records belongs in the activity feed like every
// other admin surface. Non-admin traffic is ignored by the middleware.
router.use(trackAdminActivity);

// Candidate-only routes
router.get('/me/dashboard', restrictTo(Role.CANDIDATE), candidateController.getDashboard);
router.get(
  '/me/completeness',
  restrictTo(Role.CANDIDATE),
  candidateController.getProfileCompleteness
);
router.get(
  '/me/resume/readiness',
  restrictTo(Role.CANDIDATE),
  candidateController.getResumeReadiness
);
router.get(
  '/me/resume/templates',
  restrictTo(Role.CANDIDATE),
  candidateController.listResumeTemplates
);
router.get(
  '/me/resume/generate',
  restrictTo(Role.CANDIDATE),
  candidateController.generateResumePdf
);
router.post(
  '/me/resume/use-generated',
  restrictTo(Role.CANDIDATE),
  candidateController.useGeneratedResume
);
router.get('/me/profile-views', restrictTo(Role.CANDIDATE), candidateController.getProfileViews);

// Analytics
router.get('/me/analytics', restrictTo(Role.CANDIDATE), candidateController.getAnalytics);
router.get('/me/analytics/export', restrictTo(Role.CANDIDATE), candidateController.exportAnalytics);

// Job Alerts
router.get('/me/job-alerts', restrictTo(Role.CANDIDATE), jobAlertController.getAlerts);
router.post(
  '/me/job-alerts',
  restrictTo(Role.CANDIDATE),
  validate(createJobAlertSchema),
  jobAlertController.createAlert
);
router.put(
  '/me/job-alerts/:id',
  restrictTo(Role.CANDIDATE),
  validate(updateJobAlertSchema),
  jobAlertController.updateAlert
);
router.delete('/me/job-alerts/:id', restrictTo(Role.CANDIDATE), jobAlertController.deleteAlert);
router.get(
  '/me/job-alerts/:id/matches',
  restrictTo(Role.CANDIDATE),
  jobAlertController.getAlertMatches
);

router.get('/me', restrictTo(Role.CANDIDATE), candidateController.getMyProfile);
router.put(
  '/me',
  restrictTo(Role.CANDIDATE),
  validate(updateCandidateProfileSchema),
  audit('PROFILE_UPDATE', 'CandidateProfile'),
  candidateController.updateMyProfile
);

router.post(
  '/me/resume',
  restrictTo(Role.CANDIDATE),
  resumeUpload.single('resume'),
  audit('RESUME_UPLOAD', 'CandidateProfile'),
  candidateController.uploadResume
);
router.delete(
  '/me/resume',
  restrictTo(Role.CANDIDATE),
  audit('RESUME_DELETE', 'CandidateProfile'),
  candidateController.deleteResume
);
router.post('/me/resume/parse', restrictTo(Role.CANDIDATE), candidateController.triggerResumeParse);
router.get(
  '/me/resume/parsed',
  restrictTo(Role.CANDIDATE),
  candidateController.getParsedResumeData
);
router.post(
  '/me/avatar',
  restrictTo(Role.CANDIDATE),
  imageUpload.single('avatar'),
  candidateController.uploadAvatar
);
router.delete('/me/avatar', restrictTo(Role.CANDIDATE), candidateController.removeAvatar);

// Profile boost (Candidate Premium — 7-day BOOST_DAYS pool spent 1 day at a time)
router.get('/me/boost', restrictTo(Role.CANDIDATE), candidateController.getMyBoostStatus);
router.post(
  '/me/boost/activate',
  restrictTo(Role.CANDIDATE),
  apiLimiter,
  audit('PROFILE_BOOST_ACTIVATE', 'CandidateProfile'),
  candidateController.activateMyBoost
);

// Employer/Admin: Search & view candidates
router.get(
  '/',
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  cache({ ttl: 60, perUser: true }),
  candidateController.searchCandidates
);
router.get(
  '/:id',
  restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN),
  cache({ ttl: 300, perUser: true }),
  candidateController.getCandidateProfile
);
router.get(
  '/:id/resume',
  apiLimiter,
  audit('RESUME_DOWNLOAD', 'CandidateProfile'),
  candidateController.getResumeDownloadUrl
);

export default router;
