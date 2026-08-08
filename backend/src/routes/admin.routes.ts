import { Role } from '@prisma/client';
import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import * as adminController from '../controllers/admin.controller';
import * as emailPreviewController from '../controllers/email-preview.controller';
import * as permissionController from '../controllers/admin-permission.controller';
import * as lockController from '../controllers/resource-lock.controller';
import { audit } from '../middleware/audit';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requireMfaEnabled } from '../middleware/require-mfa';
import {
  requireAnyPermission,
  requirePermission,
  requireSubjectPermission,
  superAdminOnly,
} from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import {
  lockAcquireSchema,
  lockBatchSchema,
  lockBodySchema,
  lockQuerySchema,
} from '../schemas/admin-permission.schema';
import {
  analyticsQuerySchema,
  auditLogQuerySchema,
  flagJobSchema,
  suspendUserSchema,
  updateUserRoleSchema,
} from '../schemas/admin.schema';
import { firestoreCountersService } from '../services/firestore-counters.service';
import { kafkaEventsService } from '../services/kafka-events.service';
import { validate } from '../validators/validate';

// Import all BullMQ queues for Bull Board monitoring
import { emailQueue } from '../jobs/email.queue';
import { smsQueue } from '../jobs/sms.queue';
import { fcmQueue } from '../jobs/fcm.queue';
import { webPushQueue } from '../jobs/web-push.queue';
import { inAppQueue } from '../jobs/in-app.queue';
import { whatsappQueue } from '../jobs/whatsapp.queue';
import { whatsappInboundQueue } from '../jobs/whatsapp-inbound.queue';
import { whatsappMediaQueue } from '../jobs/whatsapp-media.queue';
import { whatsappCampaignQueue } from '../jobs/whatsapp-campaign.queue';
import { webhookQueue } from '../jobs/webhook.queue';
import { matchingQueue } from '../jobs/matching.queue';
import { geocodingQueue } from '../jobs/geocoding.queue';
import { resumeParseQueue } from '../jobs/resume-parse.queue';
import { esReindexQueue } from '../jobs/es-reindex.queue';
import { schedulerQueue } from '../jobs/scheduler.queue';
import { onboardingDripQueue } from '../jobs/onboarding-drip.queue';
import { imageProcessingQueue } from '../jobs/image-processing.queue';

// Bull Board setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/v1/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(smsQueue),
    new BullMQAdapter(fcmQueue),
    new BullMQAdapter(webPushQueue),
    new BullMQAdapter(inAppQueue),
    new BullMQAdapter(whatsappQueue),
    new BullMQAdapter(whatsappInboundQueue),
    new BullMQAdapter(whatsappMediaQueue),
    new BullMQAdapter(whatsappCampaignQueue),
    new BullMQAdapter(webhookQueue),
    new BullMQAdapter(matchingQueue),
    new BullMQAdapter(geocodingQueue),
    new BullMQAdapter(resumeParseQueue),
    new BullMQAdapter(esReindexQueue),
    new BullMQAdapter(schedulerQueue),
    new BullMQAdapter(onboardingDripQueue),
    new BullMQAdapter(imageProcessingQueue),
  ],
  serverAdapter,
});

const router = Router();

// Protect all admin routes
router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(requireMfaEnabled);
// Passive activity capture — must sit after `protect` (needs req.user) and
// before the handlers (hooks the response lifecycle).
router.use(trackAdminActivity);

// ── Self-service: the caller's own effective permissions ───────────────
// Deliberately ungated beyond "is an admin": reading your OWN permission
// set leaks nothing, and the frontend needs it before it can render any
// permission-aware chrome at all.
router.get('/me/permissions', permissionController.getMyPermissions);

// ── Soft locks / presence ──────────────────────────────────────────────
// Open to every admin. Holding a lock grants no access to the underlying
// record — see resource-lock.controller.ts for why these carry no
// permission gate.
router.get('/locks', validate(lockQuerySchema), lockController.getLockState);
router.post('/locks', validate(lockAcquireSchema), lockController.acquireLock);
router.post('/locks/heartbeat', validate(lockBodySchema), lockController.heartbeatLock);
router.post('/locks/release', validate(lockBodySchema), lockController.releaseLock);
router.post('/locks/batch', validate(lockBatchSchema), lockController.getLockStates);

// Bull Board queue monitor dashboard. SUPER_ADMIN only and NOT grantable —
// the queue UI can drain, retry and delete live jobs across every system,
// so `platform.queues` is marked superAdminOnly in the registry.
router.use('/queues', superAdminOnly, serverAdapter.getRouter());

router.get('/stats', requirePermission('analytics.overview'), adminController.getDashboardStats);
router.get('/activity', requirePermission('analytics.overview'), adminController.getRecentActivity);

// ── User management ────────────────────────────────────────────────────
// The LIST legitimately serves both subjects, so it admits either view
// permission and `adminController.getUsers` narrows the result set to the
// subjects the caller actually holds (a candidates-only admin never sees an
// employer row).
//
// The per-record routes use `requireSubjectPermission`, which picks
// `users.candidates.*` or `users.employers.*` from the TARGET's role. A
// plain `requireAnyPermission` here would let a candidates-only admin
// suspend an employer — collapsing the subject split the registry exists to
// express. It also folds in the admin-target refusal, so none of these can
// be pointed at a peer admin.
router.get(
  '/users',
  requireAnyPermission('users.candidates.account.view', 'users.employers.account.view'),
  adminController.getUsers
);
router.get('/users/:id', requireSubjectPermission('account.view'), adminController.getUserDetails);
router.delete(
  '/users/:id',
  requireSubjectPermission('account.delete'),
  audit('DELETE_USER', 'User'),
  adminController.deleteUser
);
router.patch(
  '/users/:id/suspend',
  requireSubjectPermission('account.suspend'),
  validate(suspendUserSchema),
  audit('SUSPEND_USER', 'User'),
  adminController.suspendUser
);
router.patch(
  '/users/:id/activate',
  requireSubjectPermission('account.activate'),
  audit('ACTIVATE_USER', 'User'),
  adminController.activateUser
);
// Changing a role can mint an admin, so this stays super-admin-only
// regardless of any grant.
router.patch(
  '/users/:id/role',
  superAdminOnly,
  validate(updateUserRoleSchema),
  audit('UPDATE_USER_ROLE', 'User'),
  adminController.updateUserRole
);

router.get('/jobs', requirePermission('jobs.listing.view'), adminController.getAllJobs);
router.delete(
  '/jobs/:id',
  requirePermission('jobs.moderation.delete'),
  audit('DELETE_JOB', 'Job'),
  adminController.deleteJob
);
router.patch(
  '/jobs/:id/status',
  requirePermission('jobs.moderation.approve'),
  audit('MODERATE_JOB', 'Job'),
  adminController.moderateJob
);
router.patch(
  '/jobs/:id/flag',
  requirePermission('jobs.moderation.flag'),
  validate(flagJobSchema),
  audit('FLAG_JOB', 'Job'),
  adminController.flagJob
);

router.get(
  '/stats/comprehensive',
  requirePermission('analytics.overview'),
  adminController.getComprehensiveStats
);
router.get(
  '/stats/daily-active-users',
  requirePermission('analytics.users'),
  adminController.getDailyActiveUsers
);
router.get(
  '/analytics',
  requirePermission('analytics.overview'),
  validate(analyticsQuerySchema),
  adminController.getDetailedAnalytics
);
// Either the platform-wide key OR a per-subject activity key gets you in;
// the controller then decides which one this particular query needs (a
// `performedBy`-pinned read of one candidate/employer only needs the
// narrow key, an unfiltered read of the whole trail needs the platform one).
router.get(
  '/audit-logs',
  requireAnyPermission(
    'platform.audit_logs.view',
    'users.candidates.activity.audit',
    'users.employers.activity.audit'
  ),
  validate(auditLogQuerySchema),
  adminController.getAuditLogs
);

// Email template preview
router.get(
  '/email-templates',
  requirePermission('platform.email_templates.view'),
  emailPreviewController.listTemplates
);
router.post(
  '/email-templates/preview',
  requirePermission('platform.email_templates.preview'),
  emailPreviewController.previewTemplate
);
router.post(
  '/email-templates/test',
  requirePermission('platform.email_templates.test_send'),
  emailPreviewController.sendTestEmail
);

// ── Kafka ──────────────────────────────────────────────────────────────
// These four routes were previously commented "SUPER_ADMIN only" but
// carried NO guard beyond the router-level `restrictTo(ADMIN, SUPER_ADMIN)`
// — any admin could read the event stream and replay arbitrary time ranges
// back into it. `platform.kafka` is marked superAdminOnly in the registry
// and `superAdminOnly` is now actually applied here.
router.get('/kafka-events', superAdminOnly, async (_req, res) => {
  const limit = Number(_req.query.limit) || 20;
  const events = await kafkaEventsService.getRecentEvents(limit);
  res.status(200).json({ status: 'success', data: events });
});

router.get('/kafka-dlq', superAdminOnly, async (req, res, next) => {
  try {
    const { kafkaReplayService } = await import('../services/kafka-replay.service');
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const replayed =
      req.query.replayed === 'true' ? true : req.query.replayed === 'false' ? false : undefined;
    const data = await kafkaReplayService.getDlqMessages(page, limit, replayed);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
});

router.post('/kafka-dlq/:id/replay', superAdminOnly, async (req, res, next) => {
  try {
    const { kafkaReplayService } = await import('../services/kafka-replay.service');
    await kafkaReplayService.replayDlqMessage(req.params.id as string);
    res.status(200).json({ status: 'success', message: 'DLQ message replayed' });
  } catch (error) {
    next(error);
  }
});

router.post('/kafka-replay', superAdminOnly, async (req, res, next) => {
  try {
    const { kafkaReplayService } = await import('../services/kafka-replay.service');
    const { startTime, endTime, eventTypes } = req.body;
    if (!startTime || !endTime) {
      res
        .status(400)
        .json({ status: 'error', error: { message: 'startTime and endTime required' } });
      return;
    }
    const result = await kafkaReplayService.replayEvents(
      new Date(startTime),
      new Date(endTime),
      eventTypes
    );
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Firestore live counters
router.get('/live-counters', requirePermission('analytics.live'), async (_req, res, next) => {
  try {
    const counters = await firestoreCountersService.getCounters();
    res.status(200).json({ status: 'success', data: counters });
  } catch (error) {
    next(error);
  }
});

// Content Moderation
router.get(
  '/moderation/keywords',
  requirePermission('moderation.keywords.view'),
  adminController.getModerationKeywords
);
router.post(
  '/moderation/keywords',
  requirePermission('moderation.keywords.add'),
  audit('ADD_MODERATION_KEYWORD', 'Moderation'),
  adminController.addModerationKeyword
);
router.delete(
  '/moderation/keywords/:keyword',
  requirePermission('moderation.keywords.remove'),
  audit('REMOVE_MODERATION_KEYWORD', 'Moderation'),
  adminController.removeModerationKeyword
);

// Application Monitoring
router.get(
  '/applications',
  requirePermission('jobs.applications.view'),
  adminController.getApplications
);
router.get(
  '/applications/stats',
  requirePermission('jobs.applications.stats'),
  adminController.getApplicationStats
);

// Export Job Monitoring
router.get(
  '/export-jobs',
  requirePermission('reports.jobs_monitor.view'),
  adminController.getExportJobs
);
router.delete(
  '/export-jobs/:jobId',
  requirePermission('reports.jobs_monitor.cancel'),
  audit('CANCEL_EXPORT_JOB', 'ExportJob'),
  adminController.cancelExportJob
);

// Online users & trending
router.get('/online-stats', requirePermission('analytics.live'), adminController.getOnlineStats);
router.get('/trending', requirePermission('analytics.trending'), adminController.getTrending);

// Note: Verification routes are under /verifications/pending and /verifications/:id/review
// which are also admin restricted.

export default router;
