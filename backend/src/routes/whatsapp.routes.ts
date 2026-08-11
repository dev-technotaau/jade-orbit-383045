import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { requireAppPassword } from '../middleware/app-password';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { redis } from '../config/redis';
import * as ctrl from '../controllers/whatsapp-inbox.controller';
import * as tplCtrl from '../controllers/whatsapp-template.controller';
import * as contactCtrl from '../controllers/whatsapp-contact.controller';
import * as campaignCtrl from '../controllers/whatsapp-campaign.controller';
import * as settingsCtrl from '../controllers/whatsapp-settings.controller';
import * as keywordRuleCtrl from '../controllers/whatsapp-keyword-rule.controller';
import * as noteCtrl from '../controllers/whatsapp-notes.controller';
import * as analyticsCtrl from '../controllers/whatsapp-analytics.controller';
import * as auditCtrl from '../controllers/audit.controller';
import * as scheduledMsgCtrl from '../controllers/whatsapp-scheduled-message.controller';
import * as suppressionCtrl from '../controllers/whatsapp-suppression.controller';
import * as segmentCtrl from '../controllers/whatsapp-segment.controller';
import * as conversionCtrl from '../controllers/whatsapp-conversion.controller';
import {
  waSendMessageSchema,
  waAssignSchema,
  waStatusSchema,
  waCreateTemplateSchema,
  waSendTemplateSchema,
  waStartConversationSchema,
  waUpdateContactSchema,
  waImportContactsSchema,
  waCreateCampaignSchema,
  waUpdateCampaignSchema,
  waTestSendSchema,
  waSaveAsTemplateSchema,
  waUseTemplateSchema,
  waCannedReplySchema,
  waInteractiveSchema,
  waSettingsSchema,
  waKeywordRuleSchema,
  waNoteSchema,
  waLabelsSchema,
  waSnoozeSchema,
  waSequenceStepsSchema,
  waCampaignVariantsSchema,
  waShortLinkSchema,
  waScheduledMessageSchema,
  waReactionSchema,
  waArchiveSchema,
  waBulkConversationsSchema,
  waBulkContactsSchema,
  waSuppressionSchema,
  waSegmentSchema,
  waConversionSchema,
} from '../schemas/whatsapp.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

/**
 * Outbound-send limiter — caps how fast a single admin token can fire messages
 * at Meta (per-message sends, template sends, interactive, media, and campaign
 * launch/send). Keyed per-admin so one compromised/buggy session can't blast
 * Meta and burn the messaging tier / trip Meta's own rate limits. Redis-backed
 * so the cap holds across all backend instances (mirrors middleware/rate-limit).
 */
const waSendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 outbound send actions per admin per minute
  standardHeaders: true,
  legacyHeaders: false,
  // Single-tenant: every caller is the same operator, so this is effectively a
  // global send limit rather than a per-user one. Kept keyed on the actor so
  // the shape still works if per-operator labels are introduced later.
  keyGenerator: (req) => req.user?.id ?? 'operator',
  store: new RedisStore({
    prefix: 'rl:wa-send:',
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  }),
  message: {
    status: 'fail',
    message: 'Too many WhatsApp send requests. Please slow down.',
  },
});

// Every route below is gated by the single app password.
//
// This replaces the host application's five-layer gate (protect + restrictTo +
// requireMfaEnabled + trackAdminActivity + enforcePermissionMap). There are no
// users, roles or per-route permissions in this module: whoever holds the
// password can do everything. `requireAppPassword` also sets the synthetic
// `req.user` the controllers stamp onto createdBy / actorUserId.
router.use(requireAppPassword);

router.get('/channels', ctrl.getChannels);
router.get('/agents', ctrl.getAgents);
router.post('/channels/sync', audit('WA_CHANNEL_SYNC', 'WaChannel'), ctrl.syncChannel);
router.get('/analytics', ctrl.getAnalytics);
router.get('/analytics/timeseries', analyticsCtrl.getMessageTimeSeries);
router.get('/analytics/sla', analyticsCtrl.getSla);
router.get('/analytics/agents', analyticsCtrl.getAgents);
router.get('/analytics/cost', analyticsCtrl.getCost);
router.get('/analytics/optout', analyticsCtrl.getOptOut);
router.get('/analytics/heatmap', analyticsCtrl.getHeatmap);
router.get('/analytics/keywords', analyticsCtrl.getKeywords);
router.get('/analytics/health-history', analyticsCtrl.getHealthHistory);
router.get('/analytics/csat', analyticsCtrl.getCsat);
router.get('/analytics/meta', analyticsCtrl.getMeta);

// ── Settings ──
router.get('/settings', settingsCtrl.getSettings);
router.put(
  '/settings',
  validate(waSettingsSchema),
  audit('WA_SETTINGS_UPDATE', 'WaSettings'),
  settingsCtrl.updateSettings
);

// ── Keyword auto-responder rules ──
router.get('/keyword-rules', keywordRuleCtrl.list);
router.post(
  '/keyword-rules',
  validate(waKeywordRuleSchema),
  audit('WA_KEYWORD_RULE_CREATE', 'WaKeywordRule'),
  keywordRuleCtrl.create
);
router.patch(
  '/keyword-rules/:id',
  audit('WA_KEYWORD_RULE_UPDATE', 'WaKeywordRule'),
  keywordRuleCtrl.update
);
router.delete(
  '/keyword-rules/:id',
  audit('WA_KEYWORD_RULE_DELETE', 'WaKeywordRule'),
  keywordRuleCtrl.remove
);

// ── Canned replies ──
router.get('/canned-replies', ctrl.listCannedReplies);
router.post(
  '/canned-replies',
  validate(waCannedReplySchema),
  audit('WA_CANNED_CREATE', 'WaCannedReply'),
  ctrl.createCannedReply
);
router.patch(
  '/canned-replies/:id',
  validate(waCannedReplySchema),
  audit('WA_CANNED_UPDATE', 'WaCannedReply'),
  ctrl.updateCannedReply
);
router.delete(
  '/canned-replies/:id',
  audit('WA_CANNED_DELETE', 'WaCannedReply'),
  ctrl.deleteCannedReply
);

// ── FAQ menu (interactive list shown to customers) ──
router.get('/faqs', ctrl.listFaqs);
router.post('/faqs', audit('WA_FAQ_CREATE', 'WaFaq'), ctrl.createFaq);
router.post('/faqs/reorder', audit('WA_FAQ_REORDER', 'WaFaq'), ctrl.reorderFaqs);
router.patch('/faqs/:id', audit('WA_FAQ_UPDATE', 'WaFaq'), ctrl.updateFaq);
router.delete('/faqs/:id', audit('WA_FAQ_DELETE', 'WaFaq'), ctrl.deleteFaq);

// ── Templates ──
router.get('/templates', tplCtrl.listTemplates);
router.post(
  '/templates',
  validate(waCreateTemplateSchema),
  audit('WA_TEMPLATE_CREATE', 'WaTemplate'),
  tplCtrl.createTemplate
);
router.post('/templates/sync', audit('WA_TEMPLATE_SYNC', 'WaTemplate'), tplCtrl.syncTemplates);
router.post('/templates/media-handle', upload.single('file'), tplCtrl.uploadHeaderSample);
router.get('/templates/:id', tplCtrl.getTemplate);
router.get('/templates/:id/analytics', tplCtrl.getAnalytics);

// ── Contacts / audiences ──
router.get('/contacts', contactCtrl.listContacts);
router.post(
  '/contacts/import',
  validate(waImportContactsSchema),
  audit('WA_IMPORT_CONTACTS', 'WaContact'),
  contactCtrl.importContacts
);
router.get('/contacts/export', audit('WA_CONTACTS_EXPORT', 'WaContact'), ctrl.exportContacts);
router.post(
  '/contacts/bulk',
  validate(waBulkContactsSchema),
  audit('WA_BULK_CONTACTS', 'WaContact'),
  contactCtrl.bulkContacts
);
// DPDP data-subject access — single-contact data bundle (JSON download). Declared
// before `/contacts/:id` GET so it is matched as a distinct, more-specific route.
router.get(
  '/contacts/:id/export',
  audit('WA_CONTACT_EXPORT', 'WaContact'),
  contactCtrl.exportContact
);
router.get('/contacts/:id', contactCtrl.getContact);
router.patch(
  '/contacts/:id',
  validate(waUpdateContactSchema),
  audit('WA_UPDATE_CONTACT', 'WaContact'),
  contactCtrl.updateContact
);
// DPDP right-to-erasure — anonymize + scrub PII, keep an audit tombstone.
router.delete('/contacts/:id', audit('WA_CONTACT_ERASE', 'WaContact'), contactCtrl.eraseContact);

// ── Conversations / inbox ──
// Lightweight total-unread aggregate for the sidebar badge (single SUM query).
router.get('/unread-total', ctrl.getUnreadTotal);
router.get('/conversations', ctrl.getConversations);
router.post(
  '/conversations/bulk',
  validate(waBulkConversationsSchema),
  audit('WA_BULK_CONVERSATIONS', 'WaConversation'),
  ctrl.bulkConversations
);
router.post(
  '/conversations',
  validate(waStartConversationSchema),
  audit('WA_START_CONVERSATION', 'WaConversation'),
  ctrl.startConversation
);
router.get('/conversations/:id', ctrl.getConversation);
router.get('/conversations/:id/messages', ctrl.getMessages);
// "Delete for me" — soft-delete one or more messages from the inbox view.
router.post(
  '/conversations/:id/messages/delete',
  audit('WA_DELETE_MESSAGES', 'WaConversation'),
  ctrl.deleteMessages
);
// "Clear chat history" — soft-delete every message in the conversation (our side).
router.post(
  '/conversations/:id/clear',
  audit('WA_CLEAR_CONVERSATION', 'WaConversation'),
  ctrl.clearConversation
);
router.post(
  '/conversations/:id/messages',
  waSendLimiter,
  validate(waSendMessageSchema),
  audit('WA_SEND_MESSAGE', 'WaConversation'),
  ctrl.sendMessage
);
router.post(
  '/conversations/:id/template',
  waSendLimiter,
  validate(waSendTemplateSchema),
  audit('WA_SEND_TEMPLATE', 'WaConversation'),
  ctrl.sendTemplate
);
router.post(
  '/conversations/:id/interactive',
  waSendLimiter,
  validate(waInteractiveSchema),
  audit('WA_SEND_INTERACTIVE', 'WaConversation'),
  ctrl.sendInteractive
);
router.post(
  '/conversations/:id/media',
  waSendLimiter,
  upload.single('file'),
  audit('WA_SEND_MEDIA', 'WaConversation'),
  ctrl.sendMedia
);
router.post('/conversations/:id/read', audit('WA_MARK_READ', 'WaConversation'), ctrl.markRead);
router.post(
  '/conversations/:id/assign',
  validate(waAssignSchema),
  audit('WA_ASSIGN_CONVERSATION', 'WaConversation'),
  ctrl.assignConversation
);
router.post(
  '/conversations/:id/status',
  validate(waStatusSchema),
  audit('WA_SET_CONVERSATION_STATUS', 'WaConversation'),
  ctrl.setConversationStatus
);
router.put(
  '/conversations/:id/labels',
  validate(waLabelsSchema),
  audit('WA_SET_LABELS', 'WaConversation'),
  ctrl.setLabels
);
router.post(
  '/conversations/:id/snooze',
  validate(waSnoozeSchema),
  audit('WA_SNOOZE_CONVERSATION', 'WaConversation'),
  ctrl.setSnooze
);
// ── Conversation notes (agent-only) ──
router.get('/conversations/:id/notes', noteCtrl.list);
router.post(
  '/conversations/:id/notes',
  validate(waNoteSchema),
  audit('WA_NOTE_CREATE', 'WaConversationNote'),
  noteCtrl.create
);
router.delete(
  '/conversations/:id/notes/:noteId',
  audit('WA_NOTE_DELETE', 'WaConversationNote'),
  noteCtrl.remove
);

// ── Conversation transcript / CSAT / archive ──
router.get(
  '/conversations/:id/transcript',
  audit('WA_TRANSCRIPT_EXPORT', 'WaConversation'),
  ctrl.exportTranscript
);
router.post(
  '/conversations/:id/csat',
  audit('WA_REQUEST_CSAT', 'WaConversation'),
  ctrl.requestCsat
);
router.post(
  '/conversations/:id/archive',
  validate(waArchiveSchema),
  audit('WA_ARCHIVE_CONVERSATION', 'WaConversation'),
  ctrl.archiveConversation
);

// ── Rich outbound message types (reaction / location / contacts) ──
router.post(
  '/conversations/:id/reaction',
  waSendLimiter,
  validate(waReactionSchema),
  audit('WA_SEND_REACTION', 'WaConversation'),
  ctrl.sendReaction
);
router.post(
  '/conversations/:id/location',
  waSendLimiter,
  audit('WA_SEND_LOCATION', 'WaConversation'),
  ctrl.sendLocation
);
router.post(
  '/conversations/:id/contacts',
  waSendLimiter,
  audit('WA_SEND_CONTACTS', 'WaConversation'),
  ctrl.sendContacts
);

// ── Scheduled (send-later) messages ──
router.get('/conversations/:id/scheduled', scheduledMsgCtrl.list);
router.post(
  '/conversations/:id/scheduled',
  validate(waScheduledMessageSchema),
  audit('WA_SCHEDULE_MESSAGE', 'WaScheduledMessage'),
  scheduledMsgCtrl.schedule
);
router.delete(
  '/conversations/:id/scheduled/:msgId',
  audit('WA_CANCEL_SCHEDULED', 'WaScheduledMessage'),
  scheduledMsgCtrl.cancel
);

// ── Campaigns / bulk ──
router.get('/campaigns', campaignCtrl.list);
router.post(
  '/campaigns',
  validate(waCreateCampaignSchema),
  audit('WA_CAMPAIGN_CREATE', 'WaCampaign'),
  campaignCtrl.create
);
router.get('/campaigns/:id', campaignCtrl.get);
router.patch(
  '/campaigns/:id',
  validate(waUpdateCampaignSchema),
  audit('WA_CAMPAIGN_UPDATE', 'WaCampaign'),
  campaignCtrl.update
);
router.post(
  '/campaigns/:id/steps',
  validate(waSequenceStepsSchema),
  audit('WA_CAMPAIGN_STEPS', 'WaCampaign'),
  campaignCtrl.setSteps
);
router.get('/campaigns/:id/steps', campaignCtrl.getSteps);
router.get('/campaigns/:id/preview', campaignCtrl.preview);
router.get('/campaigns/:id/recipients', campaignCtrl.recipients);
router.get(
  '/campaigns/:id/recipients/export',
  audit('WA_RECIPIENTS_EXPORT', 'WaCampaign'),
  campaignCtrl.exportRecipients
);
router.post(
  '/campaigns/:id/launch',
  waSendLimiter,
  audit('WA_CAMPAIGN_LAUNCH', 'WaCampaign'),
  campaignCtrl.launch
);
// `/send` is an alias of `/launch` (plan §7.8 naming).
router.post(
  '/campaigns/:id/send',
  waSendLimiter,
  audit('WA_CAMPAIGN_LAUNCH', 'WaCampaign'),
  campaignCtrl.launch
);
router.post('/campaigns/:id/pause', audit('WA_CAMPAIGN_PAUSE', 'WaCampaign'), campaignCtrl.pause);
router.post(
  '/campaigns/:id/resume',
  audit('WA_CAMPAIGN_RESUME', 'WaCampaign'),
  campaignCtrl.resume
);
router.post(
  '/campaigns/:id/cancel',
  audit('WA_CAMPAIGN_CANCEL', 'WaCampaign'),
  campaignCtrl.cancel
);
router.post(
  '/campaigns/:id/retry-failed',
  audit('WA_CAMPAIGN_RETRY', 'WaCampaign'),
  campaignCtrl.retryFailed
);
// Manual Duplicate (clone → editable DRAFT), Test-send (preview-to-self), Save-as-Template.
router.post(
  '/campaigns/:id/duplicate',
  audit('WA_CAMPAIGN_DUPLICATE', 'WaCampaign'),
  campaignCtrl.duplicate
);
router.post(
  '/campaigns/:id/test-send',
  waSendLimiter,
  validate(waTestSendSchema),
  audit('WA_CAMPAIGN_TEST_SEND', 'WaCampaign'),
  campaignCtrl.testSend
);
router.post(
  '/campaigns/:id/save-as-template',
  validate(waSaveAsTemplateSchema),
  audit('WA_CAMPAIGN_SAVE_TEMPLATE', 'WaCampaignTemplate'),
  campaignCtrl.saveAsTemplate
);

// ── Reusable campaign blueprints (save-as-template library) ──
router.get('/campaign-templates', campaignCtrl.listTemplates);
router.post(
  '/campaign-templates/:id/use',
  validate(waUseTemplateSchema),
  audit('WA_CAMPAIGN_TEMPLATE_USE', 'WaCampaign'),
  campaignCtrl.useTemplate
);
router.delete(
  '/campaign-templates/:id',
  audit('WA_CAMPAIGN_TEMPLATE_DELETE', 'WaCampaignTemplate'),
  campaignCtrl.removeTemplate
);

// ── Campaign A/B-test variants ──
router.get('/campaigns/:id/variants', campaignCtrl.getVariants);
router.post(
  '/campaigns/:id/variants',
  validate(waCampaignVariantsSchema),
  audit('WA_CAMPAIGN_VARIANTS', 'WaCampaign'),
  campaignCtrl.setVariants
);

// ── Campaign tracked short links ──
router.get('/campaigns/:id/links', campaignCtrl.linkStats);
router.post(
  '/campaigns/:id/links',
  validate(waShortLinkSchema),
  audit('WA_CAMPAIGN_LINK', 'WaCampaign'),
  campaignCtrl.createLink
);

// ── Campaign conversions (funnel + ROI) ──
router.post(
  '/conversions',
  validate(waConversionSchema),
  audit('WA_CONVERSION_RECORD', 'WaConversion'),
  conversionCtrl.record
);
router.get('/campaigns/:id/conversions', conversionCtrl.byCampaign);
router.get('/analytics/conversions', conversionCtrl.summary);

// ── Audit trail (read side) ──
//
// Every route is a READ. The trail is append-only by construction — there is no
// endpoint to edit or delete an entry, and deletion happens only through the
// retention cron. `/export` and `/verify` are themselves audited, because
// "who pulled the audit log" is exactly the kind of thing an audit log is for.
router.get('/audit', auditCtrl.listAudit);
router.get('/audit/stats', auditCtrl.auditStats);
router.get('/audit/facets', auditCtrl.auditFacets);
router.get('/audit/verify', audit('WA_AUDIT_VERIFY', 'AuditLog'), auditCtrl.verifyAudit);
router.get('/audit/export', audit('WA_AUDIT_EXPORT', 'AuditLog'), auditCtrl.exportAudit);
// Declared last so the literal paths above win over the :id wildcard.
router.get('/audit/:id', auditCtrl.getAuditEntry);

// ── Suppression (do-not-contact) list ──
router.get('/suppressions', suppressionCtrl.list);
router.post(
  '/suppressions',
  validate(waSuppressionSchema),
  audit('WA_SUPPRESSION_ADD', 'WaSuppression'),
  suppressionCtrl.add
);
router.delete(
  '/suppressions/:id',
  audit('WA_SUPPRESSION_REMOVE', 'WaSuppression'),
  suppressionCtrl.remove
);

// ── Saved audience segments ──
router.get('/segments', segmentCtrl.list);
router.get('/segments/:id', segmentCtrl.get);
router.post(
  '/segments',
  validate(waSegmentSchema),
  audit('WA_SEGMENT_CREATE', 'WaSegment'),
  segmentCtrl.create
);
router.patch('/segments/:id', segmentCtrl.update);
router.delete('/segments/:id', segmentCtrl.remove);

// ── Per-contact platform context (linked-user enrichment) ──

router.get('/media/:id', audit('WA_MEDIA_VIEW', 'WaMessage'), ctrl.getMedia);

export default router;
