import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { planGate } from '../middleware/plan-gate';
import { vendorRevealLimiter } from '../middleware/rate-limit';
import * as vendorController from '../controllers/vendor.controller';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    }
  },
});

const router = Router();

// ── Vendor capability routes (employers with the VENDOR_CONNECT plan) ──
// Vendor is no longer a separate role: any employer can manage a vendor
// profile, while the lead inbox + job board are plan-gated.

router.use(protect);
router.use(restrictTo(Role.EMPLOYER, Role.SUPER_ADMIN));

router.get('/me', vendorController.getMyProfile);
router.put('/me', vendorController.upsertMyProfile);
router.post('/me/logo', imageUpload.single('logo'), vendorController.uploadLogo);
router.patch('/me/visibility', vendorController.setPublicFlag);

// Lead inbox — gated by feature.vendor_leads (active VENDOR_CONNECT plan).
router.get(
  '/me/leads',
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.listMyLeads
);
router.patch(
  '/me/leads/:id',
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.respondToLead
);

// Job board — other employers' open postings. The listing shows jobs +
// reveal/saved state; employer contacts are only embedded once revealed.
// Same gate as the lead inbox: the "Receive Hiring Requirements from
// Companies" plan promise.
router.get(
  '/jobs',
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.listJobBoard
);

// Reveal a posting employer's contact details — consumes 1 VENDOR_LEAD
// (deduped per job) and writes an audit-log entry. Rate-limited to blunt
// scraping bursts on top of the quota ledger.
router.post(
  '/jobs/:jobId/reveal',
  vendorRevealLimiter,
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.revealJobContact
);

// Bookmark / un-bookmark a posting to pitch later (free, no contact access).
router.post(
  '/jobs/:jobId/save',
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.saveJob
);
router.delete(
  '/jobs/:jobId/save',
  planGate({ require: ['feature.vendor_leads'], skipForRoles: ['SUPER_ADMIN'] }),
  vendorController.unsaveJob
);

export default router;
