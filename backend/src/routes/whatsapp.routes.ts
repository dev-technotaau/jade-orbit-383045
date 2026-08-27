import { Router, type Request } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { requireAppPassword, requireConversionApiKey } from '../middleware/app-password';
import { idempotent } from '../middleware/idempotency';
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
import * as botFlowCtrl from '../controllers/whatsapp-botflow.controller';
import * as suppressionCtrl from '../controllers/whatsapp-suppression.controller';
import * as segmentCtrl from '../controllers/whatsapp-segment.controller';
import * as webhookCtrl from '../controllers/webhook.controller';
import * as metaWebhookCtrl from '../controllers/whatsapp-webhook.controller';
import * as statusCtrl from '../controllers/whatsapp-status.controller';
import * as flowCtrl from '../controllers/whatsapp-flow.controller';
import * as conversionCtrl from '../controllers/whatsapp-conversion.controller';
import {
  waSendMessageSchema,
  waAssignSchema,
  waStatusSchema,
  waCreateTemplateSchema,
  waSendTemplateSchema,
  waStartConversationSchema,
  waForwardMessageSchema,
  waUpdateContactSchema,
  waMergeContactSchema,
  waImportContactsSchema,
  waCreateCampaignSchema,
  waPreviewAudienceSchema,
  waUpdateCampaignSchema,
  waTestSendSchema,
  waSaveAsTemplateSchema,
  waUseTemplateSchema,
  waCannedReplySchema,
  waInteractiveSchema,
  waSettingsSchema,
  waKeywordRuleSchema,
  waBotFlowSchema,
  waBotFlowUpdateSchema,
  waBotStepSchema,
  waBotStepUpdateSchema,
  waKeywordRuleUpdateSchema,
  waNoteSchema,
  waNoteUpdateSchema,
  waFaqSchema,
  waFaqUpdateSchema,
  waFaqReorderSchema,
  waLabelsSchema,
  waSnoozeSchema,
  waBotPauseSchema,
  waSequenceStepsSchema,
  waCampaignVariantsSchema,
  waAbWinnerSchema,
  waShortLinkSchema,
  waScheduledMessageSchema,
  waReactionSchema,
  waArchiveSchema,
  waBulkConversationsSchema,
  waBulkContactsSchema,
  waSuppressionSchema,
  waSuppressionImportSchema,
  waSegmentSchema,
  waUpdateSegmentSchema,
  waConversionSchema,
  waConversionIngestSchema,
  waWebhookCreateSchema,
  waWebhookUpdateSchema,
  waEditTemplateSchema,
  waDraftTemplateSchema,
  waLibraryTemplateSchema,
  waFlowCreateSchema,
  waFlowJsonSchema,
  waChannelCreateSchema,
  waChannelUpdateSchema,
  waBusinessProfileSchema,
  waPhoneRegisterSchema,
  waCommerceSettingsSchema,
  waConversationalAutomationSchema,
} from '../schemas/whatsapp.schema';

const router = Router();
/**
 * 100 MB — Meta's document ceiling, and the largest thing any per-kind limit in
 * `whatsapp-inbox.controller` allows. It used to be 16 MB, which silently
 * overrode the 100 MB document branch. The real ceiling for each file is checked
 * per kind in the controller; this is only the outer guard.
 *
 * Note that a file this large only ever arrives here from a server-side caller
 * or a self-hosted console: the browser stages anything over the BFF proxy's
 * body limit in R2 and sends the key instead (`POST /uploads/sign`).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

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

/**
 * Template-creation limiter — 20 submissions per hour.
 *
 * Creating a template is not a local write: it claims the name at Meta
 * permanently and spends against Meta's own per-WABA template-creation cap,
 * which is enforced by THROTTLING THE WHOLE WABA rather than the one request.
 * So a stuck client or a scripted loop here does not just waste our CPU — it can
 * lock the account out of authoring templates for hours. Nothing but the global
 * /api limiter (100 req/15min, and keyed per browser) stood in front of it.
 *
 * An hour window rather than a minute: a human authoring templates does a
 * handful a day, and the failure mode being guarded against is a loop, not a
 * burst.
 */
const waTemplateCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'operator',
  store: new RedisStore({
    prefix: 'rl:wa-tpl-create:',
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  }),
  message: {
    status: 'fail',
    message:
      'Too many template submissions. Meta rate-limits template creation per WABA — wait a while before submitting more.',
  },
});

/**
 * Header-sample upload limiter — 30 uploads per minute.
 *
 * `POST /templates/media-handle` buffers a file of up to 100 MB in memory and
 * forwards the whole thing to Meta's resumable-upload API. Unlimited, a loop
 * here is both an outbound-bandwidth amplifier and a way to push this process
 * into an OOM, and neither costs the caller anything. Deliberately placed BEFORE
 * `upload.single('file')` on the route so a 429 is answered without the body
 * ever being buffered.
 */
const waTemplateMediaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'operator',
  store: new RedisStore({
    prefix: 'rl:wa-tpl-media:',
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  }),
  message: {
    status: 'fail',
    message: 'Too many header-sample uploads. Please slow down.',
  },
});

/**
 * Typing-indicator limiter — 120 calls per minute.
 *
 * The composer fires this on a 10s throttle per conversation, so a single agent
 * working several threads at once is well inside it. It gets its OWN counter
 * rather than sharing `waSendLimiter`: a cosmetic signal must never be able to
 * consume the budget that real customer replies need, and vice versa.
 */
const waTypingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'operator',
  store: new RedisStore({
    prefix: 'rl:wa-typing:',
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
  }),
  message: {
    status: 'fail',
    message: 'Too many typing updates. Please slow down.',
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

// ── Channels (connected WhatsApp business numbers) ──
//
// Read-only until now: the default sender came from META_WHATSAPP_PHONE_ID and
// the only mutating route refreshed quality from Meta, so connecting a second
// number or rotating an expired token meant redeploying the backend. Every write
// here is audited — these routes change which number the platform sends from and
// which credential it sends with.
router.get('/channels', ctrl.getChannels);
router.get('/agents', ctrl.getAgents);
router.post('/channels/sync', audit('WA_CHANNEL_SYNC', 'WaChannel'), ctrl.syncChannel);
router.post(
  '/channels',
  validate(waChannelCreateSchema),
  audit('WA_CHANNEL_CREATE', 'WaChannel'),
  ctrl.createChannelHandler
);
router.patch(
  '/channels/:id',
  validate(waChannelUpdateSchema),
  audit('WA_CHANNEL_UPDATE', 'WaChannel'),
  ctrl.updateChannelHandler
);
router.post(
  '/channels/:id/default',
  audit('WA_CHANNEL_SET_DEFAULT', 'WaChannel'),
  ctrl.setDefaultChannelHandler
);
router.post('/channels/:id/test', audit('WA_CHANNEL_TEST', 'WaChannel'), ctrl.testChannelHandler);
// ── Number identity: business profile, registration, two-step PIN, commerce ──
//
// None of this existed. The customer-facing identity of the number — the about
// line, description, address, email, websites, category and photo — plus
// registering the number and setting its mandatory six-digit two-step PIN could
// only be done in Meta Business Manager, which is precisely the work this
// console is supposed to replace. Every write is audited: they change what
// customers see and the credential that guards the number.
router.get('/business-profile', ctrl.getBusinessProfileHandler);
router.post(
  '/business-profile',
  validate(waBusinessProfileSchema),
  audit('WA_PROFILE_UPDATE', 'WaChannel'),
  ctrl.updateBusinessProfileHandler
);
// Served from this origin so `img-src 'self'` covers it. The Meta CDN host is
// deliberately neither allowlisted in the CSP nor exposed to the browser.
router.get('/business-profile/photo', ctrl.getProfilePhoto);
router.post(
  '/business-profile/photo',
  upload.single('file'),
  audit('WA_PROFILE_PHOTO', 'WaChannel'),
  ctrl.uploadProfilePhoto
);
router.post(
  '/channels/register',
  validate(waPhoneRegisterSchema),
  audit('WA_NUMBER_REGISTER', 'WaChannel'),
  ctrl.registerNumber
);
router.post(
  '/channels/two-step-pin',
  validate(waPhoneRegisterSchema),
  audit('WA_NUMBER_PIN', 'WaChannel'),
  ctrl.updateTwoStepPin
);
router.post(
  '/channels/deregister',
  audit('WA_NUMBER_DEREGISTER', 'WaChannel'),
  ctrl.deregisterNumber
);
// Meta's native conversational components. Audited like the profile writes: they
// change the first thing a customer is offered when they open the thread.
router.get('/conversational-automation', ctrl.getConversationalAutomationHandler);
router.post(
  '/conversational-automation',
  validate(waConversationalAutomationSchema),
  audit('WA_CONVERSATIONAL_AUTOMATION_UPDATE', 'WaChannel'),
  ctrl.updateConversationalAutomationHandler
);
router.get('/commerce-settings', ctrl.getCommerce);
router.post(
  '/commerce-settings',
  validate(waCommerceSettingsSchema),
  audit('WA_COMMERCE_UPDATE', 'WaChannel'),
  ctrl.updateCommerce
);
router.get('/analytics', ctrl.getAnalytics);
router.get('/analytics/timeseries', analyticsCtrl.getMessageTimeSeries);
router.get('/analytics/sla', analyticsCtrl.getSla);
router.get('/analytics/agents', analyticsCtrl.getAgents);
router.get('/analytics/cost', analyticsCtrl.getCost);
router.get('/analytics/optout', analyticsCtrl.getOptOut);
router.get('/analytics/optout-summary', analyticsCtrl.getOptOutSummaryReport);
router.get('/analytics/clicks', analyticsCtrl.getClicks);
router.get('/analytics/ctwa', analyticsCtrl.getCtwa);
// Declared BEFORE nothing in particular, but kept next to its JSON sibling so a
// reader sees the pair. Audited like every other export: a CTWA export carries
// phone numbers and Meta click ids.
router.get(
  '/analytics/ctwa/export',
  audit('WA_CTWA_EXPORT', 'WaContact'),
  analyticsCtrl.exportCtwa
);
router.get('/analytics/heatmap', analyticsCtrl.getHeatmap);
router.get('/analytics/keywords', analyticsCtrl.getKeywords);
router.get('/analytics/health-history', analyticsCtrl.getHealthHistory);
// Per-audience reporting: saved segments side by side, and contacts followed by
// the month they were acquired. Every other aggregate here is global or
// per-number, so neither question had an answer before.
router.get('/analytics/segments', analyticsCtrl.getSegments);
router.get('/analytics/cohorts', analyticsCtrl.getCohorts);
router.get('/analytics/csat', analyticsCtrl.getCsat);
router.get('/analytics/meta', analyticsCtrl.getMeta);
// Whole-dashboard export (CSV or JSON). Audited: it is a bulk read of every
// figure in the module.
router.get(
  '/analytics/export',
  audit('WA_ANALYTICS_EXPORT', 'WaAnalytics'),
  analyticsCtrl.exportAnalytics
);

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
  validate(waKeywordRuleUpdateSchema),
  audit('WA_KEYWORD_RULE_UPDATE', 'WaKeywordRule'),
  keywordRuleCtrl.update
);
router.delete(
  '/keyword-rules/:id',
  audit('WA_KEYWORD_RULE_DELETE', 'WaKeywordRule'),
  keywordRuleCtrl.remove
);

// ── Conversational bot flows ──
//
// The stateful half of the automation tier: keyword rules answer one message,
// a flow holds a multi-step conversation (see whatsapp-botflow.service).
router.get('/bot-flows', botFlowCtrl.list);
router.get('/bot-flows/:id', botFlowCtrl.get);
router.post(
  '/bot-flows',
  validate(waBotFlowSchema),
  audit('WA_BOT_FLOW_CREATE', 'WaBotFlow'),
  botFlowCtrl.create
);
router.patch(
  '/bot-flows/:id',
  validate(waBotFlowUpdateSchema),
  audit('WA_BOT_FLOW_UPDATE', 'WaBotFlow'),
  botFlowCtrl.update
);
router.delete('/bot-flows/:id', audit('WA_BOT_FLOW_DELETE', 'WaBotFlow'), botFlowCtrl.remove);
router.post(
  '/bot-flows/:id/steps',
  validate(waBotStepSchema),
  audit('WA_BOT_STEP_CREATE', 'WaBotStep'),
  botFlowCtrl.createStep
);
router.patch(
  '/bot-flows/:id/steps/:stepId',
  validate(waBotStepUpdateSchema),
  audit('WA_BOT_STEP_UPDATE', 'WaBotStep'),
  botFlowCtrl.updateStep
);
router.delete(
  '/bot-flows/:id/steps/:stepId',
  audit('WA_BOT_STEP_DELETE', 'WaBotStep'),
  botFlowCtrl.removeStep
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
// Validated, unlike before: a question over WhatsApp's 24-char row-title limit
// reached the customer chopped, and an answer over the 4096-char body limit was
// rejected by Meta at send time — the customer tapped the row and got nothing.
router.post('/faqs', validate(waFaqSchema), audit('WA_FAQ_CREATE', 'WaFaq'), ctrl.createFaq);
router.post(
  '/faqs/reorder',
  validate(waFaqReorderSchema),
  audit('WA_FAQ_REORDER', 'WaFaq'),
  ctrl.reorderFaqs
);
router.patch(
  '/faqs/:id',
  validate(waFaqUpdateSchema),
  audit('WA_FAQ_UPDATE', 'WaFaq'),
  ctrl.updateFaq
);
router.delete('/faqs/:id', audit('WA_FAQ_DELETE', 'WaFaq'), ctrl.deleteFaq);

// ── Templates ──
router.get('/templates', tplCtrl.listTemplates);
// The limiter goes FIRST in the chain, before `validate` — a refused request
// should cost nothing but the counter increment.
router.post(
  '/templates',
  waTemplateCreateLimiter,
  validate(waCreateTemplateSchema),
  audit('WA_TEMPLATE_CREATE', 'WaTemplate'),
  tplCtrl.createTemplate
);
router.post('/templates/sync', audit('WA_TEMPLATE_SYNC', 'WaTemplate'), tplCtrl.syncTemplates);
// Audited like every other template write: this call spends our WABA's upload
// quota at Meta and produces a handle that ends up embedded in a submitted
// template, so "who staged this sample" belongs in the trail. The audit
// middleware goes AFTER multer so req.body carries the parsed multipart fields.
router.post(
  '/templates/media-handle',
  waTemplateMediaLimiter,
  upload.single('file'),
  audit('WA_TEMPLATE_MEDIA', 'WaTemplate'),
  tplCtrl.uploadHeaderSample
);
// Save without submitting. WaTemplateStatus.LOCAL was the column default and
// nothing ever wrote it, so a half-finished template could not be kept at all —
// closing the builder discarded it, uploaded header sample included.
router.post(
  '/templates/draft',
  validate(waDraftTemplateSchema),
  audit('WA_TEMPLATE_DRAFT', 'WaTemplate'),
  tplCtrl.saveDraft
);
// Meta's pre-approved catalogue. Declared BEFORE '/templates/:id' so 'library'
// is not swallowed as a template id.
router.get('/templates/library', tplCtrl.listLibrary);
// Shares the creation limiter: this reaches the same Meta endpoint and spends
// the same per-WABA creation cap, so limiting only POST /templates would leave
// the cap reachable through a route that looks like a read.
router.post(
  '/templates/library',
  waTemplateCreateLimiter,
  validate(waLibraryTemplateSchema),
  audit('WA_TEMPLATE_CREATE', 'WaTemplate'),
  tplCtrl.createFromLibrary
);
router.get('/templates/:id', tplCtrl.getTemplate);
// Submitting a draft is a create as far as Meta (and the audit trail) is
// concerned: it is the call that claims the template name permanently.
router.post(
  '/templates/:id/submit',
  waTemplateCreateLimiter,
  audit('WA_TEMPLATE_CREATE', 'WaTemplate'),
  tplCtrl.submitDraft
);
// Meta permits editing an APPROVED/REJECTED/PAUSED template (name and language are
// immutable). Without this a rejected template was a dead end: its name is taken
// forever, so it could not even be recreated.
router.patch(
  '/templates/:id',
  validate(waEditTemplateSchema),
  audit('WA_TEMPLATE_EDIT', 'WaTemplate'),
  tplCtrl.update
);
router.delete('/templates/:id', audit('WA_TEMPLATE_DELETE', 'WaTemplate'), tplCtrl.remove);
// Re-read ONE template from Meta. Audited as a sync because that is what it is —
// the same read the WABA-wide sync does, narrowed to a single row so checking on
// a just-submitted template doesn't mean re-pulling the whole catalogue.
router.post('/templates/:id/refresh', audit('WA_TEMPLATE_SYNC', 'WaTemplate'), tplCtrl.refresh);
router.get('/templates/:id/analytics', tplCtrl.getAnalytics);

// ── Contacts / audiences ──
router.get('/contacts', contactCtrl.listContacts);
// Accepts the file and hands back a WaImportJob (202). The work itself runs on
// the import queue — 5000 rows cannot be walked inside a request budget, and
// trying used to 408 the operator while the loop carried on writing.
router.post(
  '/contacts/import',
  validate(waImportContactsSchema),
  audit('WA_IMPORT_CONTACTS', 'WaContact'),
  contactCtrl.importContacts
);
// Progress for the modal. Declared before `/contacts/:id` so `import` is not
// swallowed by the wildcard.
router.get('/contacts/import/:jobId', contactCtrl.getImportJob);
router.get('/contacts/export', audit('WA_CONTACTS_EXPORT', 'WaContact'), ctrl.exportContacts);
// Possible-duplicate report. Declared before `/contacts/:id` so `duplicates` is
// not swallowed by the wildcard, like `import` above.
router.get('/contacts/duplicates', contactCtrl.listDuplicates);
router.post(
  '/contacts/bulk',
  validate(waBulkContactsSchema),
  audit('WA_BULK_CONTACTS', 'WaContact'),
  contactCtrl.bulkContacts
);
/**
 * The reference the data-subject request arrived under — a support ticket, a
 * regulator's case number — taken from `?ref=` or an `X-DSAR-Ref` header and
 * recorded in the audit details.
 *
 * Without it the trail shows that a contact's data was exported or erased but
 * nothing about what compelled it, which is exactly the question a DPDP audit
 * asks: an erasure with no request behind it is indistinguishable from one made
 * to destroy evidence.
 */
const dsarRef = (req: Request): Record<string, unknown> | undefined => {
  const raw = req.query.ref ?? req.get('X-DSAR-Ref');
  const ref = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
  return ref ? { dsarRef: ref } : undefined;
};

// DPDP data-subject access — single-contact data bundle (JSON download). Declared
// before `/contacts/:id` GET so it is matched as a distinct, more-specific route.
// `:id` accepts the contact's phone number as well as its id: a data-subject
// request arrives as a phone number and nothing else.
router.get(
  '/contacts/:id/export',
  audit('WA_CONTACT_EXPORT', 'WaContact', { extraDetails: dsarRef }),
  contactCtrl.exportContact
);
// ABOVE '/contacts/:id' — Express would otherwise match 'consent-events' as an id.
router.get('/contacts/:id/consent-events', contactCtrl.listConsentEvents);
router.get('/contacts/:id', contactCtrl.getContact);
router.patch(
  '/contacts/:id',
  validate(waUpdateContactSchema),
  audit('WA_UPDATE_CONTACT', 'WaContact'),
  contactCtrl.updateContact
);
// Fold a duplicate into `:id`. Audited like the erasure below: it moves one
// person's whole history onto another row, tightens their consent and retires
// the number they were reached on — none of which is reversible.
router.post(
  '/contacts/:id/merge',
  validate(waMergeContactSchema),
  audit('WA_CONTACT_MERGE', 'WaContact'),
  contactCtrl.mergeContact
);
// DPDP right-to-erasure — anonymize + scrub PII, keep an audit tombstone. Also
// accepts the contact's phone number in place of its id.
router.delete(
  '/contacts/:id',
  audit('WA_CONTACT_ERASE', 'WaContact', { extraDetails: dsarRef }),
  contactCtrl.eraseContact
);

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
// Declared BEFORE any '/conversations/:id/messages/:messageId' route would be,
// or Express matches 'search' as a message id.
router.get('/conversations/:id/messages/search', ctrl.searchThreadMessages);
// Media gallery. Distinct from the POST on the same path (which SENDS media):
// without this the gallery could only show whatever media happened to be in the
// thread page the client already held.
router.get('/conversations/:id/media', ctrl.getConversationMedia);
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
// The only route that REQUIRES an idempotency key. Uploading a file to Meta and
// sending it can outlast a client timeout, and the operator's natural response
// to "Failed to send media" is to press send again — which delivered (and billed)
// the same attachment twice. The key collapses the retry onto the first attempt.
router.post(
  '/conversations/:id/media',
  waSendLimiter,
  idempotent({ scope: 'wa-send-media', required: true }),
  upload.single('file'),
  audit('WA_SEND_MEDIA', 'WaConversation'),
  ctrl.sendMedia
);
router.post('/conversations/:id/read', audit('WA_MARK_READ', 'WaConversation'), ctrl.markRead);
// The inverse. Local only — Meta has no un-read call and a sent read receipt
// cannot be withdrawn, so this restores OUR queue, not the customer's view.
router.post(
  '/conversations/:id/unread',
  audit('WA_MARK_UNREAD', 'WaConversation'),
  ctrl.markUnread
);
// Cosmetic "typing…" signal to the customer. Rate-limited (it is keystroke-
// driven) and deliberately unaudited — see the controller.
router.post('/conversations/:id/typing', waTypingLimiter, ctrl.sendTyping);
// Dismissing Meta's identity-change warning is a security decision, so it leaves
// a trail — unlike the cosmetic typing signal above it.
router.post(
  '/conversations/:id/identity-ack',
  audit('WA_IDENTITY_ACK', 'WaConversation'),
  ctrl.acknowledgeIdentityChange
);
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
router.post(
  '/conversations/:id/bot-pause',
  validate(waBotPauseSchema),
  audit('WA_BOT_PAUSE', 'WaConversation'),
  ctrl.setBotPause
);
// ── Conversation notes (agent-only) ──
router.get('/conversations/:id/notes', noteCtrl.list);
router.post(
  '/conversations/:id/notes',
  validate(waNoteSchema),
  audit('WA_NOTE_CREATE', 'WaConversationNote'),
  noteCtrl.create
);
// Editing a note used to mean deleting it and retyping, which threw away its
// timestamp and author along with the typo.
router.patch(
  '/conversations/:id/notes/:noteId',
  validate(waNoteUpdateSchema),
  audit('WA_NOTE_UPDATE', 'WaConversationNote'),
  noteCtrl.patch
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
  '/conversations/:id/forward',
  waSendLimiter,
  validate(waForwardMessageSchema),
  audit('WA_FORWARD_MESSAGES', 'WaConversation'),
  ctrl.forwardMessages
);
router.post(
  '/conversations/:id/mute',
  audit('WA_MUTE_CONVERSATION', 'WaConversation'),
  ctrl.muteConversation
);
router.post(
  '/conversations/:id/messages/:messageId/star',
  audit('WA_STAR_MESSAGE', 'WaMessage'),
  ctrl.starMessage
);
router.post(
  '/conversations/:id/pin',
  audit('WA_PIN_CONVERSATION', 'WaConversation'),
  ctrl.pinConversation
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
//
// The global queue first: send-later messages used to be visible only inside the
// conversation that created them, so twelve follow-ups scheduled across twelve
// threads had no screen that listed them, and a FAILED one was invisible.
router.get('/scheduled', scheduledMsgCtrl.listAll);
router.get('/conversations/:id/scheduled', scheduledMsgCtrl.list);
// `upload.single('file')` ahead of validation so a scheduled ATTACHMENT can
// arrive as multipart, exactly like an immediate media send. Multer passes a
// JSON request straight through, so the text/template forms are unaffected.
router.post(
  '/conversations/:id/scheduled',
  upload.single('file'),
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
// Draft campaigns are deleted outright (the schema cascades recipients, steps and
// variants); cancelled/completed ones are archived so their numbers survive.
router.delete('/campaigns/:id', audit('WA_CAMPAIGN_DELETE', 'WaCampaign'), campaignCtrl.remove);
router.post(
  '/campaigns/:id/steps',
  validate(waSequenceStepsSchema),
  audit('WA_CAMPAIGN_STEPS', 'WaCampaign'),
  campaignCtrl.setSteps
);
router.get('/campaigns/:id/steps', campaignCtrl.getSteps);
router.get('/campaigns/:id/preview', campaignCtrl.preview);
// The same preview for an audience that has not been saved yet, so the builder
// can show size + cost while the filters are still being chosen. Declared before
// nothing in particular, but POST /campaigns/preview-audience cannot collide
// with POST /campaigns (exact paths).
router.post(
  '/campaigns/preview-audience',
  validate(waPreviewAudienceSchema),
  campaignCtrl.previewDraft
);
// Meta's own send eligibility for the number + template, asked before Launch.
// Its absence meant the first sign of an ineligible number or a paused template
// was a materialized audience and a screen of FAILED recipients.
router.get('/campaigns/:id/preflight', campaignCtrl.preflight);
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
// A/B decision: per-variant rates + significance, declaring the winner, and
// releasing the held-back remainder of the audience to it.
router.get('/campaigns/:id/ab-test', campaignCtrl.abTestReport);
router.post(
  '/campaigns/:id/ab-test/winner',
  validate(waAbWinnerSchema),
  audit('WA_CAMPAIGN_AB_WINNER', 'WaCampaign'),
  campaignCtrl.selectAbWinner
);
router.post(
  '/campaigns/:id/ab-test/remainder',
  waSendLimiter,
  audit('WA_CAMPAIGN_AB_REMAINDER', 'WaCampaign'),
  campaignCtrl.sendAbRemainder
);

// ── Campaign tracked short links ──
router.get('/campaigns/:id/links', campaignCtrl.linkStats);
router.get('/campaigns/:id/clicks', campaignCtrl.clickStats);
router.post(
  '/campaigns/:id/links',
  validate(waShortLinkSchema),
  audit('WA_CAMPAIGN_LINK', 'WaCampaign'),
  campaignCtrl.createLink
);

// ── Campaign conversions (funnel + ROI) ──
//
// The server-to-server ingest route is NOT here — it cannot be, because
// everything in this file sits behind the app password and the CSRF gate. See
// `conversionIngestRouter` at the bottom of this file.
router.post(
  '/conversions',
  validate(waConversionSchema),
  audit('WA_CONVERSION_RECORD', 'WaConversion'),
  conversionCtrl.record
);
// A mistyped value or a double-clicked button used to be permanent, and it
// inflated convertedCount and campaign revenue with no way to correct it.
router.delete(
  '/conversions/:id',
  audit('WA_CONVERSION_DELETE', 'WaConversion'),
  conversionCtrl.remove
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
// Declared before the wildcard-free literals below purely for readability; both
// are more specific than `/suppressions/:id`, which is DELETE-only anyway.
router.get(
  '/suppressions/export',
  audit('WA_SUPPRESSIONS_EXPORT', 'WaSuppression'),
  suppressionCtrl.exportList
);
router.post(
  '/suppressions/import',
  validate(waSuppressionImportSchema),
  audit('WA_SUPPRESSIONS_IMPORT', 'WaSuppression'),
  suppressionCtrl.importList
);
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
// Live member count for one segment, resolved with the SAME predicate a campaign
// audience uses. Declared before `/segments/:id` so it is not swallowed by it.
router.get('/segments/:id/count', segmentCtrl.count);
router.get('/segments/:id', segmentCtrl.get);
router.post(
  '/segments',
  validate(waSegmentSchema),
  audit('WA_SEGMENT_CREATE', 'WaSegment'),
  segmentCtrl.create
);
router.patch(
  '/segments/:id',
  validate(waUpdateSegmentSchema),
  audit('WA_SEGMENT_UPDATE', 'WaSegment'),
  segmentCtrl.update
);
router.delete('/segments/:id', audit('WA_SEGMENT_DELETE', 'WaSegment'), segmentCtrl.remove);

// ── Per-contact platform context (linked-user enrichment) ──

// ── WhatsApp Flows (native multi-screen forms) ──
//
// Sending a flow already worked. Managing them did not: without these an
// operator worked inside Meta's Flow Builder and copied ids across by hand,
// with no local record of what was deployed or which state it was in.
router.get('/flows', flowCtrl.list);
router.get('/flows/responses', flowCtrl.responses);
router.get('/flows/:id', flowCtrl.get);
router.get('/flows/:id/responses', flowCtrl.responses);
router.get('/flows/:id/preview', flowCtrl.preview);
router.post('/flows/sync', audit('WA_FLOW_SYNC', 'WaFlow'), flowCtrl.sync);
router.post(
  '/flows',
  validate(waFlowCreateSchema),
  audit('WA_FLOW_CREATE', 'WaFlow'),
  flowCtrl.create
);
router.put(
  '/flows/:id/json',
  validate(waFlowJsonSchema),
  audit('WA_FLOW_JSON_UPDATE', 'WaFlow'),
  flowCtrl.updateJson
);
router.post('/flows/:id/publish', audit('WA_FLOW_PUBLISH', 'WaFlow'), flowCtrl.publish);
router.post('/flows/:id/deprecate', audit('WA_FLOW_DEPRECATE', 'WaFlow'), flowCtrl.deprecate);
router.delete('/flows/:id', audit('WA_FLOW_DELETE', 'WaFlow'), flowCtrl.remove);

// ── Outbound webhooks (integration surface) ──
//
// The service, the signed delivery queue and the retry/DLQ path all already
// existed; nothing was routed to them, so subscribers could only be created with
// raw SQL and every emitted event fanned out to an empty list.
router.get('/webhooks', webhookCtrl.list);
router.get('/webhooks/:id', webhookCtrl.get);
router.get('/webhooks/:id/deliveries', webhookCtrl.deliveries);
router.post(
  '/webhooks',
  validate(waWebhookCreateSchema),
  audit('WA_WEBHOOK_CREATE', 'WebhookEndpoint'),
  webhookCtrl.create
);
router.patch(
  '/webhooks/:id',
  validate(waWebhookUpdateSchema),
  audit('WA_WEBHOOK_UPDATE', 'WebhookEndpoint'),
  webhookCtrl.update
);
router.delete('/webhooks/:id', audit('WA_WEBHOOK_DELETE', 'WebhookEndpoint'), webhookCtrl.remove);
router.post('/webhooks/:id/test', audit('WA_WEBHOOK_TEST', 'WebhookEndpoint'), webhookCtrl.test);
router.post(
  '/webhooks/:id/deliveries/:deliveryId/replay',
  audit('WA_WEBHOOK_REPLAY', 'WebhookDelivery'),
  webhookCtrl.replay
);

// ── Inbound webhook health + raw-event inspection (read-only) ──
//
// WaWebhookEvent was written and never read. With Meta able to disable the
// subscription silently, "did it arrive at all?" had no answer short of a psql
// session on the server. The detail route is audited because, unlike the list,
// it returns the raw payload — which contains customer message content.
router.get('/webhook-health', metaWebhookCtrl.getHealth);

// ── Operations status (read-only) ──
//
// Queue depth, worker leadership and webhook silence in one call, so the three
// ways sending stops without erroring are visible from the console itself and
// not only from a Prometheus this deployment may not have. Unaudited: it reads
// no customer data, and the settings page polls it.
router.get('/system-status', statusCtrl.getSystemStatus);
router.get('/webhook-events', metaWebhookCtrl.listEvents);
router.get(
  '/webhook-events/:id',
  audit('WA_WEBHOOK_EVENT_VIEW', 'WaWebhookEvent'),
  metaWebhookCtrl.getEvent
);
// Replay a stuck event. Audited: it re-runs inbound processing, which writes
// messages and moves delivery statuses.
router.post(
  '/webhook-events/:id/reprocess',
  audit('WA_WEBHOOK_EVENT_REPROCESS', 'WaWebhookEvent'),
  metaWebhookCtrl.reprocessEvent
);

// Mint a signed URL the browser PUTs a large attachment straight to, bypassing
// the BFF proxy's body limit — the reason a 6 MB PDF could not be sent at all
// while the code advertised a 100 MB document limit.
router.post('/uploads/sign', audit('WA_UPLOAD_SIGN', 'WaMessage'), ctrl.signMediaUpload);

// Stage a file at Meta and hand back the media id, without sending it. Media
// header templates could otherwise only be sent from a public URL the operator
// hosted themselves, re-fetched by Meta on every single send.
router.post(
  '/media',
  upload.single('file'),
  audit('WA_MEDIA_UPLOAD', 'WaMessage'),
  ctrl.uploadMedia
);

// One row per media id per day, not one per <img>. The inbox issues a separate
// GET for every media bubble on screen and the gallery grid fires one per tile,
// so an unconditional audit turned a scroll through a photo-heavy conversation
// into dozens of identical rows that then sat in the trail for the full 180-day
// retention window. The first view is still recorded — that is the part an
// investigation asks about.
// Failed archives, and the re-enqueue for one. Declared BEFORE `/media/:id` or
// the parameterised route would swallow `/media/failed` as a media id.
router.get('/media/failed', ctrl.listFailedMedia);
router.post(
  '/media/failed/:messageId/retry',
  audit('WA_MEDIA_ARCHIVE_RETRY', 'WaMessage'),
  ctrl.retryFailedMedia
);

router.get(
  '/media/:id',
  audit('WA_MEDIA_VIEW', 'WaMessage', { dedupeTtlSec: 24 * 60 * 60 }),
  ctrl.getMedia
);

/**
 * Server-to-server conversion ingest — a SEPARATE router, deliberately.
 *
 * A website or CRM reporting a conversion cannot present the app password (that
 * is the credential that unlocks the entire console) and cannot fetch a CSRF
 * token (it has no browser session). Both gates apply to everything in the
 * router above, so this one is mounted on `app` ahead of them — see app.ts,
 * next to the Chatwoot bridge proxy, which is public for the same reason.
 *
 * Its own gate is `requireConversionApiKey`, which fails closed when
 * WA_CONVERSION_API_KEY is unset.
 */
export const conversionIngestRouter = Router();
conversionIngestRouter.post(
  '/conversions',
  requireConversionApiKey,
  validate(waConversionIngestSchema),
  audit('WA_CONVERSION_INGEST', 'WaConversion'),
  conversionCtrl.ingest
);

export default router;
