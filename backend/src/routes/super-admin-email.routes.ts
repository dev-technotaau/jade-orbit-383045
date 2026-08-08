import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Role } from '@prisma/client';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requireMfaEnabled } from '../middleware/require-mfa';
import { enforcePermissionMap } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { EMAIL_FALLBACK, EMAIL_PERMISSION_RULES } from '../config/permission-maps';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { redis } from '../config/redis';
import * as ctrl from '../controllers/email.controller';
import * as mbox from '../controllers/email-mailbox.controller';
import {
  emailSenderCreateSchema,
  emailSenderUpdateSchema,
  emailTemplateCreateSchema,
  emailTemplateUpdateSchema,
  emailPreviewSchema,
  emailTestSendSchema,
  emailCampaignCreateSchema,
  emailCampaignUpdateSchema,
  emailCampaignVariantsSchema,
  emailCampaignStepsSchema,
  emailCampaignTestSendSchema,
  emailSaveAsBlueprintSchema,
  emailUseBlueprintSchema,
  emailContactCreateSchema,
  emailContactUpdateSchema,
  emailImportSchema,
  emailImportRowsSchema,
  emailBulkTagSchema,
  emailBulkUpdateSchema,
  emailBulkDeleteSchema,
  emailSegmentSchema,
  emailSetSchema,
  emailSetMembersSchema,
  emailSetAudienceSchema,
  emailSetBulkDeleteSchema,
  emailThreadBulkSchema,
  emailCampaignBulkSchema,
  emailCampaignArchiveSchema,
  emailTemplateBulkDeleteSchema,
  emailTemplateBulkStatusSchema,
  emailTemplateBulkDuplicateSchema,
  emailSuppressionImportSchema,
  emailSuppressionBulkDeleteSchema,
  emailUnsubscribeBulkSchema,
  emailSuppressionSchema,
  emailSettingsSchema,
  emailReplySchema,
  emailScheduleReplySchema,
  emailThreadStatusSchema,
  emailThreadLabelsSchema,
  emailThreadAssignSchema,
  emailThreadSnoozeSchema,
  emailThreadArchiveSchema,
  emailNoteSchema,
  emailCannedReplySchema,
  emailRuleSchema,
  emailSnippetSchema,
  emailSnippetUpdateSchema,
  emailAccountCreateSchema,
  emailAccountUpdateSchema,
  emailAccountTestSchema,
  emailMailboxSendSchema,
  emailMailboxDraftSchema,
  emailMailboxFlagsSchema,
  emailMailboxMoveSchema,
  emailMailboxDeleteSchema,
  emailFolderCreateSchema,
  emailFolderRenameSchema,
  emailFolderDeleteSchema,
  emailMailboxForwardSchema,
} from '../schemas/email.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
// Personal-mail attachments get more headroom than template assets (Gmail-like).
const mailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/** Per-admin outbound-send limiter (campaign launch / test / reply). Redis-backed. */
const emailSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: new RedisStore({
    prefix: 'rl:email-send:',
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  }),
  message: { status: 'fail', message: 'Too many email send requests. Please slow down.' },
});

// All routes: an authenticated admin with MFA, holding the Email
// permission the specific route requires. See config/permission-maps.ts —
// EMAIL_PERMISSION_RULES is the readable statement of this domain's access
// model, including the webmail/campaign split.
router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(requireMfaEnabled);
router.use(trackAdminActivity);
router.use(enforcePermissionMap(EMAIL_PERMISSION_RULES, EMAIL_FALLBACK));

// ── Senders ──
router.get('/senders', ctrl.listSenders);
router.post(
  '/senders',
  validate(emailSenderCreateSchema),
  audit('EMAIL_SENDER_CREATE', 'EmailSender'),
  ctrl.createSender
);
router.put(
  '/senders/:id',
  validate(emailSenderUpdateSchema),
  audit('EMAIL_SENDER_UPDATE', 'EmailSender'),
  ctrl.updateSender
);
router.delete('/senders/:id', audit('EMAIL_SENDER_DELETE', 'EmailSender'), ctrl.deleteSender);
router.post('/senders/:id/verify', audit('EMAIL_SENDER_VERIFY', 'EmailSender'), ctrl.verifySender);

// ── Templates ──
router.get('/templates', ctrl.listTemplates);
router.get('/templates/:id', ctrl.getTemplate);
router.post(
  '/templates',
  validate(emailTemplateCreateSchema),
  audit('EMAIL_TEMPLATE_CREATE', 'EmailTemplate'),
  ctrl.createTemplate
);
router.put(
  '/templates/:id',
  validate(emailTemplateUpdateSchema),
  audit('EMAIL_TEMPLATE_UPDATE', 'EmailTemplate'),
  ctrl.updateTemplate
);
router.delete(
  '/templates/:id',
  audit('EMAIL_TEMPLATE_DELETE', 'EmailTemplate'),
  ctrl.deleteTemplate
);
router.post(
  '/templates/bulk-delete',
  validate(emailTemplateBulkDeleteSchema),
  audit('EMAIL_TEMPLATE_BULK_DELETE', 'EmailTemplate'),
  ctrl.bulkDeleteTemplates
);
router.post(
  '/templates/bulk-status',
  validate(emailTemplateBulkStatusSchema),
  audit('EMAIL_TEMPLATE_BULK_STATUS', 'EmailTemplate'),
  ctrl.bulkTemplateStatus
);
router.post(
  '/templates/bulk-duplicate',
  validate(emailTemplateBulkDuplicateSchema),
  audit('EMAIL_TEMPLATE_BULK_DUPLICATE', 'EmailTemplate'),
  ctrl.bulkDuplicateTemplates
);
router.post('/templates/preview', validate(emailPreviewSchema), ctrl.previewTemplate);
router.post('/templates/lint', ctrl.lintTemplateHandler);
router.post('/templates/plain-text', ctrl.plainText);
router.post(
  '/templates/test',
  emailSendLimiter,
  validate(emailTestSendSchema),
  audit('EMAIL_TEMPLATE_TEST', 'EmailTemplate'),
  ctrl.testSendTemplate
);
router.post(
  '/templates/:id/duplicate',
  audit('EMAIL_TEMPLATE_DUPLICATE', 'EmailTemplate'),
  ctrl.duplicateTemplate
);
router.get('/templates/:id/versions', ctrl.templateVersions);
router.post(
  '/templates/:id/restore',
  audit('EMAIL_TEMPLATE_RESTORE', 'EmailTemplate'),
  ctrl.restoreTemplate
);

// ── Snippets (reusable content blocks) ──
router.get('/snippets', ctrl.listSnippets);
router.post('/snippets', validate(emailSnippetSchema), ctrl.createSnippet);
router.put('/snippets/:id', validate(emailSnippetUpdateSchema), ctrl.updateSnippet);
router.delete('/snippets/:id', ctrl.deleteSnippet);

// ── Asset upload (template images → R2) ──
router.post(
  '/assets',
  upload.single('file'),
  audit('EMAIL_ASSET_UPLOAD', 'EmailAsset'),
  ctrl.uploadAsset
);
// Outbound attachment staging (campaign + reply sends) — larger limit than images.
router.post('/attachments', mailUpload.single('file'), ctrl.uploadOutboundAttachment);

// ── Campaigns ──
router.get('/campaigns', ctrl.listCampaigns);
router.post(
  '/campaigns/bulk',
  validate(emailCampaignBulkSchema),
  audit('EMAIL_CAMPAIGN_BULK', 'EmailCampaign'),
  ctrl.bulkCampaigns
);
router.get('/campaigns/:id', ctrl.getCampaign);
router.post(
  '/campaigns',
  validate(emailCampaignCreateSchema),
  audit('EMAIL_CAMPAIGN_CREATE', 'EmailCampaign'),
  ctrl.createCampaign
);
router.put(
  '/campaigns/:id',
  validate(emailCampaignUpdateSchema),
  audit('EMAIL_CAMPAIGN_UPDATE', 'EmailCampaign'),
  ctrl.updateCampaign
);
router.post(
  '/campaigns/:id/launch',
  emailSendLimiter,
  audit('EMAIL_CAMPAIGN_LAUNCH', 'EmailCampaign'),
  ctrl.launchCampaign
);
router.post(
  '/campaigns/:id/pause',
  audit('EMAIL_CAMPAIGN_PAUSE', 'EmailCampaign'),
  ctrl.pauseCampaign
);
router.post(
  '/campaigns/:id/resume',
  emailSendLimiter,
  audit('EMAIL_CAMPAIGN_RESUME', 'EmailCampaign'),
  ctrl.resumeCampaign
);
router.post(
  '/campaigns/:id/cancel',
  audit('EMAIL_CAMPAIGN_CANCEL', 'EmailCampaign'),
  ctrl.cancelCampaign
);
router.post(
  '/campaigns/:id/retry-failed',
  emailSendLimiter,
  audit('EMAIL_CAMPAIGN_RETRY', 'EmailCampaign'),
  ctrl.retryFailed
);
router.post(
  '/campaigns/:id/duplicate',
  audit('EMAIL_CAMPAIGN_DUPLICATE', 'EmailCampaign'),
  ctrl.duplicateCampaign
);
router.post(
  '/campaigns/:id/archive',
  validate(emailCampaignArchiveSchema),
  audit('EMAIL_CAMPAIGN_ARCHIVE', 'EmailCampaign'),
  ctrl.archiveCampaign
);
router.post(
  '/campaigns/:id/materialize',
  audit('EMAIL_CAMPAIGN_MATERIALIZE', 'EmailCampaign'),
  ctrl.materializeCampaign
);
router.post(
  '/campaigns/:id/reconcile',
  audit('EMAIL_CAMPAIGN_RECONCILE', 'EmailCampaign'),
  ctrl.reconcileCampaign
);
router.get('/campaigns/:id/links', ctrl.getCampaignLinks);
router.post(
  '/campaigns/:id/stop-recurrence',
  audit('EMAIL_CAMPAIGN_STOP_RECURRENCE', 'EmailCampaign'),
  ctrl.stopRecurrence
);
router.delete(
  '/campaigns/:id',
  audit('EMAIL_CAMPAIGN_DELETE', 'EmailCampaign'),
  ctrl.deleteCampaign
);
router.get('/campaigns/:id/audience', ctrl.previewAudience);
router.put('/campaigns/:id/variants', validate(emailCampaignVariantsSchema), ctrl.setVariants);
router.put('/campaigns/:id/steps', validate(emailCampaignStepsSchema), ctrl.setSteps);
router.get('/campaigns/:id/recipients', ctrl.getRecipients);
router.get('/campaigns/:id/recipients/export', ctrl.exportRecipients);
router.post(
  '/campaigns/:id/test-send',
  emailSendLimiter,
  validate(emailCampaignTestSendSchema),
  audit('EMAIL_CAMPAIGN_TEST', 'EmailCampaign'),
  ctrl.testSendCampaign
);
router.post(
  '/campaigns/:id/save-as-template',
  validate(emailSaveAsBlueprintSchema),
  ctrl.saveAsBlueprint
);
router.get('/campaigns/:id/analytics', ctrl.campaignAnalytics);

// ── Blueprints (campaign-templates) ──
router.get('/campaign-templates', ctrl.listBlueprints);
router.post('/campaign-templates/:id/use', validate(emailUseBlueprintSchema), ctrl.useBlueprint);
router.delete('/campaign-templates/:id', ctrl.deleteBlueprint);

// ── Contacts ──
router.get('/contacts', ctrl.listContacts);
router.get('/contacts/export', ctrl.exportContacts);
router.get('/contacts/:id', ctrl.getContact);
router.post(
  '/contacts',
  validate(emailContactCreateSchema),
  audit('EMAIL_CONTACT_CREATE', 'EmailContact'),
  ctrl.createContact
);
router.put(
  '/contacts/:id',
  validate(emailContactUpdateSchema),
  audit('EMAIL_CONTACT_UPDATE', 'EmailContact'),
  ctrl.updateContact
);
router.delete('/contacts/:id', audit('EMAIL_CONTACT_DELETE', 'EmailContact'), ctrl.deleteContact);
router.post('/contacts/:id/block', audit('EMAIL_CONTACT_BLOCK', 'EmailContact'), ctrl.blockContact);
router.post('/contacts/:id/erase', audit('EMAIL_CONTACT_ERASE', 'EmailContact'), ctrl.eraseContact);
router.post(
  '/contacts/bulk-tag',
  validate(emailBulkTagSchema),
  audit('EMAIL_CONTACT_BULK_TAG', 'EmailContact'),
  ctrl.bulkTagContacts
);
router.post(
  '/contacts/bulk-update',
  validate(emailBulkUpdateSchema),
  audit('EMAIL_CONTACT_BULK_UPDATE', 'EmailContact'),
  ctrl.bulkUpdateContacts
);
router.post(
  '/contacts/bulk-delete',
  validate(emailBulkDeleteSchema),
  audit('EMAIL_CONTACT_BULK_DELETE', 'EmailContact'),
  ctrl.bulkDeleteContacts
);
router.post(
  '/contacts/import',
  validate(emailImportSchema),
  audit('EMAIL_CONTACT_IMPORT', 'EmailContact'),
  ctrl.importContacts
);
router.post(
  '/contacts/import-rows',
  validate(emailImportRowsSchema),
  audit('EMAIL_CONTACT_IMPORT', 'EmailContact'),
  ctrl.importContactRows
);
router.get('/contacts/:id/timeline', ctrl.contactTimeline);
router.get(
  '/contacts/:id/data-export',
  audit('EMAIL_CONTACT_DATA_EXPORT', 'EmailContact'),
  ctrl.contactDataExport
);

// ── Platform users ──
router.get('/platform-users', ctrl.listPlatformUsers);
router.get('/platform-users/count', ctrl.countPlatformUsers);
router.get('/platform-users/export', ctrl.exportPlatformUsers);
router.post(
  '/platform-users/sync',
  audit('EMAIL_PLATFORM_SYNC', 'EmailContact'),
  ctrl.syncPlatformUsers
);

// ── Segments ──
router.get('/segments', ctrl.listSegments);
router.get('/segments/:id', ctrl.getSegment);
router.get('/segments/:id/size', ctrl.segmentSize);
router.post('/segments', validate(emailSegmentSchema), ctrl.createSegment);
router.put('/segments/:id', validate(emailSegmentSchema), ctrl.updateSegment);
router.delete('/segments/:id', ctrl.deleteSegment);

// ── Static sets (named contact lists) ──
router.get('/sets', ctrl.listSets);
router.get('/sets/:id', ctrl.getSet);
router.get('/sets/:id/members', ctrl.listSetMembers);
router.get('/sets/:id/export', ctrl.exportSet);
router.post(
  '/sets',
  validate(emailSetSchema),
  audit('EMAIL_SET_CREATE', 'EmailContactSet'),
  ctrl.createSet
);
router.put(
  '/sets/:id',
  validate(emailSetSchema),
  audit('EMAIL_SET_UPDATE', 'EmailContactSet'),
  ctrl.updateSet
);
router.delete('/sets/:id', audit('EMAIL_SET_DELETE', 'EmailContactSet'), ctrl.deleteSet);
router.post(
  '/sets/bulk-delete',
  validate(emailSetBulkDeleteSchema),
  audit('EMAIL_SET_BULK_DELETE', 'EmailContactSet'),
  ctrl.bulkDeleteSets
);
router.post(
  '/sets/:id/members',
  validate(emailSetMembersSchema),
  audit('EMAIL_SET_MEMBERS_ADD', 'EmailContactSet'),
  ctrl.addSetMembers
);
router.delete(
  '/sets/:id/members',
  validate(emailSetMembersSchema),
  audit('EMAIL_SET_MEMBERS_REMOVE', 'EmailContactSet'),
  ctrl.removeSetMembers
);
router.post(
  '/sets/:id/audience',
  validate(emailSetAudienceSchema),
  audit('EMAIL_SET_MEMBERS_ADD', 'EmailContactSet'),
  ctrl.addSetMembersByAudience
);

// ── Suppression / unsubscribes ──
router.get('/suppressions', ctrl.listSuppressions);
router.get('/suppressions/export', ctrl.exportSuppressions);
router.post(
  '/suppressions',
  validate(emailSuppressionSchema),
  audit('EMAIL_SUPPRESSION_ADD', 'EmailSuppression'),
  ctrl.addSuppression
);
router.post(
  '/suppressions/import',
  validate(emailSuppressionImportSchema),
  audit('EMAIL_SUPPRESSION_IMPORT', 'EmailSuppression'),
  ctrl.importSuppressions
);
router.post(
  '/suppressions/bulk-delete',
  validate(emailSuppressionBulkDeleteSchema),
  audit('EMAIL_SUPPRESSION_BULK_REMOVE', 'EmailSuppression'),
  ctrl.bulkDeleteSuppressions
);
router.delete(
  '/suppressions/:id',
  audit('EMAIL_SUPPRESSION_REMOVE', 'EmailSuppression'),
  ctrl.removeSuppression
);
router.get('/unsubscribes', ctrl.listUnsubscribes);
router.get('/unsubscribes/export', ctrl.exportUnsubscribes);
router.post(
  '/unsubscribes/bulk-resubscribe',
  validate(emailUnsubscribeBulkSchema),
  audit('EMAIL_UNSUBSCRIBE_RESUBSCRIBE', 'EmailUnsubscribe'),
  ctrl.bulkResubscribe
);
router.post(
  '/unsubscribes/bulk-delete',
  validate(emailUnsubscribeBulkSchema),
  audit('EMAIL_UNSUBSCRIBE_BULK_DELETE', 'EmailUnsubscribe'),
  ctrl.bulkDeleteUnsubscribes
);

// ── Analytics ──
router.get('/analytics/overview', ctrl.analyticsOverview);
router.get('/analytics/timeseries', ctrl.analyticsTimeseries);
router.get('/analytics/deliverability', ctrl.analyticsDeliverability);
router.get('/analytics/heatmap', ctrl.analyticsHeatmap);
router.get('/analytics/top-links', ctrl.analyticsTopLinks);
router.get('/analytics/clients', ctrl.analyticsClients);
router.get('/analytics/domains', ctrl.analyticsDomains);
router.get('/analytics/leaderboard', ctrl.analyticsLeaderboard);
router.get('/analytics/list-growth', ctrl.analyticsListGrowth);
router.get('/analytics/bounce-reasons', ctrl.analyticsBounceReasons);
router.get('/analytics/bounces', ctrl.analyticsBounces);
router.get('/analytics/events', ctrl.analyticsEvents);
router.get('/analytics/compare', ctrl.analyticsCompare);
router.get('/analytics/export', ctrl.analyticsExport);
router.get('/analytics/campaigns/:id', ctrl.campaignAnalytics); // plan-namespaced alias

// ── Bulk jobs (async progress) + undo ──
router.get('/bulk-jobs', ctrl.listBulkJobs);
router.get('/bulk-jobs/:id', ctrl.getBulkJob);
router.post('/undo/:id', audit('EMAIL_BULK_UNDO', 'EmailBulkUndo'), ctrl.restoreUndo);

// ── Settings ──
router.get('/settings', ctrl.getSettings);
router.put(
  '/settings',
  validate(emailSettingsSchema),
  audit('EMAIL_SETTINGS_UPDATE', 'EmailSettings'),
  ctrl.updateSettings
);

// ── Inbox (threads) ──
router.get('/threads', ctrl.listThreads);
router.get('/threads/unread-count', ctrl.unreadThreadCount);
router.post(
  '/threads/bulk',
  validate(emailThreadBulkSchema),
  audit('EMAIL_THREAD_BULK', 'EmailThread'),
  ctrl.bulkThreads
);
router.get('/threads/:id', ctrl.getThread);
router.post('/threads/:id/read', ctrl.markThreadRead);
router.post(
  '/threads/:id/assign',
  validate(emailThreadAssignSchema),
  audit('EMAIL_THREAD_ASSIGN', 'EmailThread'),
  ctrl.assignThread
);
router.post(
  '/threads/:id/status',
  validate(emailThreadStatusSchema),
  audit('EMAIL_THREAD_STATUS', 'EmailThread'),
  ctrl.setThreadStatus
);
router.post(
  '/threads/:id/labels',
  validate(emailThreadLabelsSchema),
  audit('EMAIL_THREAD_LABELS', 'EmailThread'),
  ctrl.setThreadLabels
);
router.post('/threads/:id/snooze', validate(emailThreadSnoozeSchema), ctrl.snoozeThread);
router.post(
  '/threads/:id/archive',
  validate(emailThreadArchiveSchema),
  audit('EMAIL_THREAD_ARCHIVE', 'EmailThread'),
  ctrl.archiveThread
);
router.post('/threads/:id/notes', validate(emailNoteSchema), ctrl.addThreadNote);
router.post(
  '/threads/:id/reply',
  emailSendLimiter,
  validate(emailReplySchema),
  audit('EMAIL_THREAD_REPLY', 'EmailThread'),
  ctrl.replyThread
);
router.post('/threads/:id/schedule', validate(emailScheduleReplySchema), ctrl.scheduleThreadReply);
router.get('/scheduled', ctrl.listScheduled);
router.delete('/scheduled/:id', ctrl.cancelScheduledReply);

// ── Canned replies + rules ──
router.get('/canned-replies', ctrl.listCanned);
router.post('/canned-replies', validate(emailCannedReplySchema), ctrl.createCanned);
router.put('/canned-replies/:id', validate(emailCannedReplySchema), ctrl.updateCanned);
router.delete('/canned-replies/:id', ctrl.deleteCanned);
router.get('/rules', ctrl.listRules);
router.post('/rules', validate(emailRuleSchema), ctrl.createRule);
router.put('/rules/:id', validate(emailRuleSchema), ctrl.updateRule);
router.delete('/rules/:id', ctrl.deleteRule);

// ── One-on-one mailbox (webmail: personal IMAP/SMTP accounts) ──
// Accounts
router.get('/mailbox/accounts', mbox.listAccounts);
router.post(
  '/mailbox/accounts',
  validate(emailAccountCreateSchema),
  audit('EMAIL_ACCOUNT_CREATE', 'EmailAccount'),
  mbox.createAccount
);
router.post('/mailbox/accounts/test', validate(emailAccountTestSchema), mbox.testAccount);
router.get('/mailbox/accounts/:id', mbox.getAccount);
router.put(
  '/mailbox/accounts/:id',
  validate(emailAccountUpdateSchema),
  audit('EMAIL_ACCOUNT_UPDATE', 'EmailAccount'),
  mbox.updateAccount
);
router.delete(
  '/mailbox/accounts/:id',
  audit('EMAIL_ACCOUNT_DELETE', 'EmailAccount'),
  mbox.deleteAccount
);
router.post('/mailbox/accounts/:id/test', validate(emailAccountTestSchema), mbox.testAccount);

// Folders
router.get('/mailbox/accounts/:id/folders', mbox.listFolders);
router.get('/mailbox/accounts/:id/special', mbox.specialFolders);
router.post(
  '/mailbox/accounts/:id/folders',
  validate(emailFolderCreateSchema),
  audit('EMAIL_FOLDER_CREATE', 'EmailFolder'),
  mbox.createFolder
);
router.put(
  '/mailbox/accounts/:id/folders',
  validate(emailFolderRenameSchema),
  audit('EMAIL_FOLDER_RENAME', 'EmailFolder'),
  mbox.renameFolder
);
router.delete(
  '/mailbox/accounts/:id/folders',
  validate(emailFolderDeleteSchema),
  audit('EMAIL_FOLDER_DELETE', 'EmailFolder'),
  mbox.deleteFolder
);

// Messages
router.get('/mailbox/accounts/:id/messages', mbox.listMessages);
router.get('/mailbox/accounts/:id/threads', mbox.listThreads);
router.get('/mailbox/accounts/:id/thread', mbox.getThread);
router.get('/mailbox/accounts/:id/suggest', mbox.suggestRecipients);
router.get('/mailbox/accounts/:id/message', mbox.getMessage);
router.get('/mailbox/accounts/:id/attachment', mbox.getAttachment);
router.get('/mailbox/accounts/:id/raw', mbox.getRawMessage);
router.post(
  '/mailbox/accounts/:id/forward-attachments',
  validate(emailMailboxForwardSchema),
  mbox.forwardAttachments
);
router.post('/mailbox/accounts/:id/flags', validate(emailMailboxFlagsSchema), mbox.setFlags);
router.post('/mailbox/accounts/:id/move', validate(emailMailboxMoveSchema), mbox.moveMessages);
router.post('/mailbox/accounts/:id/copy', validate(emailMailboxMoveSchema), mbox.copyMessages);
router.post(
  '/mailbox/accounts/:id/delete',
  validate(emailMailboxDeleteSchema),
  mbox.deleteMessages
);

// Compose
router.post(
  '/mailbox/accounts/:id/send',
  emailSendLimiter,
  validate(emailMailboxSendSchema),
  audit('EMAIL_MAILBOX_SEND', 'EmailAccount'),
  mbox.sendMessage
);
router.post('/mailbox/accounts/:id/draft', validate(emailMailboxDraftSchema), mbox.saveDraft);
router.post('/mailbox/accounts/:id/attachments', mailUpload.single('file'), mbox.uploadAttachment);

export default router;
