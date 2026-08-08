import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { WATERMARK_POSITIONS } from '../services/resume-watermark.service';
import * as Ctrl from '../controllers/super-admin-resume-watermark.controller';

const router = Router();
router.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

// ── multipart upload (memory storage → R2) ────────────────────────────────────
const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 }, // 10 MB/file, up to 50 files
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_RESUME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Invalid file type. Allowed: PDF, DOC, DOCX.`));
  },
});

// ── validation schemas ────────────────────────────────────────────────────────
const idParams = z.object({ id: z.string().uuid() });
const resumeParams = z.object({ id: z.string().uuid(), resumeId: z.string().uuid() });
const configBody = z
  .object({
    enabled: z.boolean().optional(),
    position: z.enum(WATERMARK_POSITIONS as [string, ...string[]]).optional(),
    opacity: z.number().min(0.02).max(1).optional(),
    scale: z.number().min(0.05).max(1).optional(),
    rotation: z.number().min(-90).max(90).optional(),
  })
  .strict();
const bulkIdsBody = z.object({ ids: z.array(z.string().uuid()).min(1) });

// ── watermark config ──────────────────────────────────────────────────────────
router.get('/config', requirePermission('resume_watermark.config.view'), Ctrl.getConfig);
router.put(
  '/config',
  requirePermission('resume_watermark.config.edit'),
  validate({ body: configBody }),
  audit('UPDATE_WATERMARK_CONFIG', 'SystemConfig'),
  Ctrl.updateConfig
);

// ── on-platform candidates ────────────────────────────────────────────────────
router.get(
  '/on-platform',
  requirePermission('resume_watermark.on_platform.view'),
  Ctrl.listOnPlatform
);
router.post(
  '/on-platform/bulk-download',
  requirePermission('resume_watermark.on_platform.bulk_download'),
  Ctrl.bulkDownloadOnPlatform
);
router.get(
  '/on-platform/:id/download',
  requirePermission('resume_watermark.on_platform.download'),
  validate({ params: idParams }),
  Ctrl.downloadOnPlatform
);

// ── off-platform candidates ───────────────────────────────────────────────────
router.get(
  '/off-platform',
  requirePermission('resume_watermark.off_platform.view'),
  Ctrl.listOffPlatform
);
router.post(
  '/off-platform',
  requirePermission('resume_watermark.off_platform.create'),
  upload.array('files', 50),
  audit('CREATE_OFF_PLATFORM_CANDIDATE', 'OffPlatformCandidate'),
  Ctrl.createOffPlatform
);
router.post(
  '/off-platform/bulk-download',
  requirePermission('resume_watermark.off_platform.bulk_download'),
  Ctrl.bulkDownloadOffPlatform
);
router.post(
  '/off-platform/bulk-delete',
  requirePermission('resume_watermark.off_platform.delete'),
  validate({ body: bulkIdsBody }),
  audit('BULK_DELETE_OFF_PLATFORM', 'OffPlatformCandidate'),
  Ctrl.bulkDeleteOffPlatform
);
router.get(
  '/off-platform/:id',
  requirePermission('resume_watermark.off_platform.view'),
  validate({ params: idParams }),
  Ctrl.getOffPlatform
);
router.patch(
  '/off-platform/:id',
  requirePermission('resume_watermark.off_platform.edit'),
  validate({ params: idParams }),
  audit('UPDATE_OFF_PLATFORM_CANDIDATE', 'OffPlatformCandidate'),
  Ctrl.updateOffPlatform
);
router.delete(
  '/off-platform/:id',
  requirePermission('resume_watermark.off_platform.delete'),
  validate({ params: idParams }),
  audit('DELETE_OFF_PLATFORM_CANDIDATE', 'OffPlatformCandidate'),
  Ctrl.removeOffPlatform
);
router.post(
  '/off-platform/:id/resumes',
  requirePermission('resume_watermark.off_platform.upload'),
  validate({ params: idParams }),
  upload.array('files', 50),
  audit('ADD_OFF_PLATFORM_RESUMES', 'OffPlatformResume'),
  Ctrl.addResumes
);
router.get(
  '/off-platform/:id/resumes/:resumeId/download',
  requirePermission('resume_watermark.off_platform.download'),
  validate({ params: resumeParams }),
  Ctrl.downloadOffPlatformResume
);
router.delete(
  '/off-platform/:id/resumes/:resumeId',
  requirePermission('resume_watermark.off_platform.delete'),
  validate({ params: resumeParams }),
  audit('DELETE_OFF_PLATFORM_RESUME', 'OffPlatformResume'),
  Ctrl.removeOffPlatformResume
);

export default router;
