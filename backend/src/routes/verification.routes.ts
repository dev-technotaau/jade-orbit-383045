import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { trackAdminActivity } from '../middleware/admin-activity';
import { requireAnyPermission } from '../middleware/require-permission';
import * as verificationController from '../controllers/verification.controller';
import { Role } from '@prisma/client';
import { validate } from '../validators/validate';
import {
  requestVerificationSchema,
  reviewVerificationSchema,
  escalateVerificationSchema,
  listVerificationsSchema,
} from '../schemas/verification.schema';
import { audit } from '../middleware/audit';

const router = Router();

// Records admin mutations for the control centre's activity feed. The
// middleware resolves the caller's role at RESPONSE time, so it is safe
// here even though this router applies `protect` per-route.
router.use(trackAdminActivity);

// Configure Multer
const storage = multer.memoryStorage();
const ALLOWED_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`));
    }
  },
});

// Public: Employer response to employment verification (no auth required)
router.post('/employment-response/:token', verificationController.processEmploymentResponse);

router.use(protect);

// User: Request Verification
router.post(
  '/request',
  upload.single('document'),
  validate(requestVerificationSchema),
  verificationController.requestVerification
);

// Admin: Get Pending
router.get(
  '/pending',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.view', 'verifications.employer.view'),
  verificationController.getPendingVerifications
);

// Admin: Review Request
router.post(
  '/:id/review',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  validate(reviewVerificationSchema),
  verificationController.reviewVerification
);

// User: Get my verifications
router.get('/mine', verificationController.getMyVerifications);

// Admin: Get all verifications (not just pending)
router.get(
  '/all',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.view', 'verifications.employer.view'),
  validate(listVerificationsSchema),
  verificationController.getAllVerifications
);

// Admin: Verification stats
router.get(
  '/stats',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.view', 'verifications.employer.view'),
  verificationController.getVerificationStats
);

// Admin: Escalate verification
router.post(
  '/:id/escalate',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  validate(escalateVerificationSchema),
  audit('VERIFICATION_ESCALATE', 'Verification'),
  verificationController.escalateVerification
);

// Admin: Send employment verification contact email
router.post(
  '/:id/employment-contact',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  audit('EMPLOYMENT_VERIFICATION_CONTACT', 'Verification'),
  verificationController.sendEmploymentContact
);

// Admin: SLA & Approval Chain
router.patch(
  '/:id/sla',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  verificationController.setSlaDeadline
);
router.post(
  '/:id/approval-chain',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  verificationController.setApprovalChain
);
router.post(
  '/:id/approve-level',
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN),
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  audit('VERIFICATION_LEVEL_APPROVE', 'Verification'),
  verificationController.approveAtLevel
);

export default router;
