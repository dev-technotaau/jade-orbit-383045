import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import * as employerController from '../controllers/employer.controller';
import * as jobTemplateController from '../controllers/job-template.controller';
import * as jobController from '../controllers/job.controller';
import { Role } from '@prisma/client';
import { validate } from '../validators/validate';
import { updateCompanyProfileSchema } from '../schemas/employer.schema';
import { createJobTemplateSchema, updateJobTemplateSchema } from '../schemas/job-template.schema';
import { audit } from '../middleware/audit';
import { cache } from '../middleware/cache';
import { exportLimiter } from '../middleware/rate-limit';
import { planGate } from '../middleware/plan-gate';

const router = Router();

// Configure Multer
const storage = multer.memoryStorage();
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    }
  },
});

// --- Public routes (no auth required) ---
router.get('/:id/public', cache({ ttl: 300 }), employerController.getPublicCompany);

// All routes require authentication and EMPLOYER role
router.use(protect);
router.use(restrictTo(Role.EMPLOYER));

router.get('/dashboard', employerController.getDashboard);
router.get('/engagement-metrics', employerController.getEngagementMetrics);
router.get('/analytics', employerController.getAnalytics);
router.get('/analytics/export', employerController.exportAnalytics);

router.get('/me/completeness', employerController.getProfileCompleteness);
router.get('/me', employerController.getMyCompany);
router.put(
  '/me',
  validate(updateCompanyProfileSchema),
  audit('PROFILE_UPDATE', 'CompanyProfile'),
  employerController.updateMyCompany
);

router.post('/me/logo', upload.single('logo'), employerController.uploadLogo);
router.delete('/me/logo', employerController.removeLogo);
router.post('/me/cover-image', upload.single('coverImage'), employerController.uploadCoverImage);
router.delete('/me/cover-image', employerController.removeCoverImage);

router.get('/me/profile-views', employerController.getProfileViews);

router.get(
  '/candidates/search',
  planGate({
    require: ['feature.cv_db_access'],
    minResource: { unit: 'SEARCH_RESULT', amount: 1 },
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
    optional: false,
  }),
  cache({ ttl: 60, perUser: true }),
  employerController.searchCandidates
);

router.post(
  '/candidates/bulk-export',
  exportLimiter,
  planGate({
    require: ['feature.bulk_download'],
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
  }),
  audit('BULK_EXPORT_CANDIDATES', 'CandidateProfile'),
  employerController.bulkExportCandidates
);
router.post(
  '/candidates/bulk-export-resumes',
  exportLimiter,
  planGate({
    require: ['feature.bulk_download'],
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
  }),
  audit('BULK_EXPORT_RESUMES', 'CandidateProfile'),
  employerController.bulkExportResumes
);

// Candidate management
router.get(
  '/applications',
  planGate({
    require: ['feature.job_post'],
    skipForRoles: ['SUPER_ADMIN', 'ADMIN'],
    optional: true, // soft gate — read-only listing always allowed; UI handles upsell
  }),
  jobController.getAllEmployerApplications
);
router.post(
  '/candidates/:candidateId/shortlist',
  audit('APPLICATION_SHORTLIST', 'JobApplication'),
  jobController.shortlistCandidateForJob
);
router.post(
  '/candidates/:candidateId/select',
  audit('APPLICATION_SELECT', 'JobApplication'),
  jobController.selectCandidateForJob
);
router.get(
  '/candidates/:candidateId/match/:jobId',
  cache({ ttl: 300, perUser: true }),
  employerController.getCandidateMatchScore
);
router.get(
  '/candidates/:candidateId/similar',
  cache({ ttl: 300, perUser: true }),
  employerController.getSimilarCandidates
);

// Job Templates CRUD
router.get('/job-templates', jobTemplateController.getTemplates);
router.post(
  '/job-templates',
  validate(createJobTemplateSchema),
  jobTemplateController.createTemplate
);
router.put(
  '/job-templates/:id',
  validate(updateJobTemplateSchema),
  jobTemplateController.updateTemplate
);
router.delete('/job-templates/:id', jobTemplateController.deleteTemplate);

export default router;
