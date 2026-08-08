import { Router } from 'express';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import * as reportController from '../controllers/report.controller';
import { Role } from '@prisma/client';
import { validate } from '../validators/validate';
import {
  exportReportSchema,
  generateReportSchema,
  previewReportSchema,
} from '../schemas/report.schema';
import { audit } from '../middleware/audit';

/**
 * `/api/v1/reports/*` — SUPER_ADMIN ONLY, all of it.
 *
 * This used to admit ADMIN as well. It no longer does: reporting can now select
 * arbitrary columns across every dataset on the platform — contact details,
 * payment identifiers, audit trails — which is a materially bigger capability
 * than it was when it meant three fixed exports.
 *
 * Consequences of that change, so nobody is surprised:
 *   · `/admin/reports` is gated to SUPER_ADMIN and dropped from the ADMIN nav.
 *   · The export buttons on `/admin/analytics` render for SUPER_ADMIN only, so
 *     an ADMIN never clicks a button that would 403.
 *
 * PII is opt-in per run and every run is written to the audit log
 * (`ADMIN_REPORT_GENERATED`) with that decision recorded.
 */
const router = Router();

router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);

/* ─── Quick exports — now filterable by range + segment ──────────── */
router.get(
  '/users/export',
  requirePermission('reports.exports.users'),
  validate(exportReportSchema),
  reportController.exportUsersExcel
);
router.get(
  '/jobs/export',
  requirePermission('reports.exports.jobs'),
  validate(exportReportSchema),
  reportController.exportJobsExcel
);
router.get(
  '/analytics/export',
  requirePermission('reports.exports.analytics'),
  reportController.exportAnalyticsPdf
);

/* ─── Custom builder ─────────────────────────────────────────────── */

router.get('/datasets', requirePermission('reports.view'), reportController.listReportDatasets);

router.post(
  '/preview',
  requirePermission('reports.preview'),
  validate(previewReportSchema),
  reportController.previewReport
);

router.post(
  '/generate',
  requirePermission('reports.generate'),
  validate(generateReportSchema),
  // Route-level audit records the attempt with IP/user-agent; the service adds a
  // second, richer entry with row count and the resolved PII columns.
  audit('ADMIN_REPORT_REQUESTED', 'Report'),
  reportController.generateReport
);

export default router;
