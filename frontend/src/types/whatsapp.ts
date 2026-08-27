export type WaDirection = 'INBOUND' | 'OUTBOUND';
export type WaMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type WaMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACTS'
  | 'INTERACTIVE'
  | 'BUTTON'
  | 'REACTION'
  | 'TEMPLATE'
  | 'SYSTEM'
  /** A cart submitted from a catalog / product message. */
  | 'ORDER'
  | 'UNSUPPORTED';
export type WaConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED';
export type WaOptInStatus = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT';

export interface WaContactLite {
  id: string;
  phone: string;
  /** Operator-given name. Written only by updateContact — never by an inbound. */
  name: string | null;
  /** The customer's own WhatsApp display name, refreshed on every inbound. */
  profileName?: string | null;
  optInStatus: WaOptInStatus;
  isBlocked: boolean;
  /** Null = this contact has never messaged us. */
  lastInboundAt?: string | null;
  /** Set when Meta deliberately refused a marketing message to this contact. */
  marketingRefusedAt?: string | null;
  /**
   * On the do-not-contact list. Every outbound is refused for this contact, so
   * the composer must say so BEFORE the operator types a reply that cannot land.
   */
  suppressedAt?: string | null;
  // `userId` and `user` linked a contact to a platform account, which is how
  // the UI showed a real avatar and an "on-platform" badge. That relation was
  // dropped from WaContact — avatars now always fall back to initials, since
  // the WhatsApp Cloud API does not expose customers' profile photos.
}

export interface WaConversation {
  id: string;
  channelId: string;
  contactId: string;
  status: WaConversationStatus;
  assignedTo: string | null;
  windowExpiresAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** Which way the last message went — drives the "You:" prefix on the row. */
  lastMessageDirection?: WaDirection | null;
  lastReadAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  /** Automated replies are suppressed on this thread until this time. */
  botPausedUntil?: string | null;
  /**
   * Meta reported that this customer's WhatsApp identity changed (a re-registered
   * device / new phone) and no agent has acknowledged it yet. It is the same
   * number and thread, and possibly a different person on the other end.
   */
  identityChangedAt?: string | null;
  labels: string[];
  archivedAt: string | null;
  csatRequestedAt: string | null;
  csatScore: number | null;
  /** The customer's free-text follow-up to their rating — the "why" behind a 1/5. */
  csatComment?: string | null;
  createdAt: string;
  updatedAt: string;
  contact: WaContactLite;
  /**
   * Set only by a message-body search (`searchMessages`): the newest message in
   * this conversation that matched, so the inbox can open the thread ON the hit
   * instead of at the bottom of a thread it may be thousands of messages above.
   */
  matchMessageId?: string;
  /** ~120 chars of that message centred on the search term. */
  matchSnippet?: string;
  matchCreatedAt?: string;
}

/**
 * One media message as the gallery lists it — a deliberate subset of WaMessage
 * (never the `payload` jsonb, which on a media row carries the whole Meta
 * callback) returned by GET /conversations/:id/media.
 */
export interface WaConversationMedia {
  id: string;
  type: WaMessageType;
  mediaId: string | null;
  mediaMime: string | null;
  /** PENDING | OK | SKIPPED | FAILED — see WaMessage.mediaArchiveStatus. */
  mediaArchiveStatus?: string | null;
  text: string | null;
  direction: WaDirection;
  createdAt: string;
}

/**
 * A single reaction on a message. `side: 'out'` is our (business) reaction,
 * `side: 'in'` is the customer's. Each message holds at most one per side, so
 * both can be shown together. `byName` is the display label of who reacted.
 */
export interface WaReaction {
  emoji: string;
  side: 'in' | 'out';
  from?: string;
  byName?: string;
  at?: string;
}

export interface WaMessage {
  id: string;
  wamid: string | null;
  conversationId: string;
  contactId: string;
  direction: WaDirection;
  type: WaMessageType;
  status: WaMessageStatus;
  text: string | null;
  payload?: unknown;
  mediaId: string | null;
  mediaUrl: string | null;
  /** R2 key of the small WebP derivative, when one was generated (images only). */
  mediaThumbUrl?: string | null;
  mediaMime: string | null;
  /**
   * Durable-archive state: PENDING | OK | SKIPPED | FAILED, null for a message
   * with no media. FAILED means the original is gone once Meta's own ~30-day
   * copy expires, which the bubble says out loud instead of showing the same
   * "couldn't load" placeholder a slow network produces.
   */
  mediaArchiveStatus?: string | null;
  templateName: string | null;
  contextWamid: string | null;
  errorCode: string | null;
  errorTitle: string | null;
  sentByUserId: string | null;
  campaignId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  costPaise: number | null;
  billable: boolean | null;
  templateLanguage: string | null;
  referral?: unknown;
  reactions?: unknown;
  createdAt: string;
}

export interface WaConversationsPage {
  items: WaConversation[];
  /** -1 when paging by cursor: the count is only computed for the first page. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  /** Feed back as `cursor` to fetch the next page. Null when this page is empty. */
  nextCursor?: string | null;
}

export interface WaChannel {
  id: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhone: string;
  displayName: string | null;
  isActive: boolean;
  isDefault: boolean;
  messagingTier: string | null;
  qualityRating: string;
  /**
   * Whether this number has its OWN access token. The token itself is never
   * returned — false means it sends with META_WHATSAPP_TOKEN.
   */
  hasToken: boolean;
  tokenUpdatedAt: string | null;
  /**
   * What Meta's `debug_token` says about the credential, refreshed by the
   * channel-health cron and by Test connections. `tokenExpiresAt` null with
   * `tokenValid` true is a never-expiring system-user token — the only kind that
   * should be in production. Anything with a date is a user token that will
   * silently stop every send on the day it lapses.
   */
  tokenExpiresAt?: string | null;
  tokenScopes?: string[];
  tokenValid?: boolean | null;
  tokenCheckedAt?: string | null;
  /** When the number was last registered with Meta, and its PIN last rotated. */
  registeredAt?: string | null;
  pinUpdatedAt?: string | null;
  /** Catalog bound to this number — required to send a product message. */
  catalogId?: string | null;
  /**
   * Meta's own send eligibility (`health_status`): AVAILABLE | LIMITED | BLOCKED.
   * Independent of the quality rating — Meta answers GREEN right up until it
   * refuses the send.
   */
  healthStatus?: string | null;
  healthEntities?: WaHealthEntity[] | null;
  healthCheckedAt?: string | null;
}

/** One entity in Meta's send-eligibility tree (the number, its WABA, the business). */
export interface WaHealthEntity {
  /** PHONE_NUMBER | WABA | BUSINESS | MESSAGE_TEMPLATE. */
  type: string;
  id: string | null;
  /** AVAILABLE | LIMITED | BLOCKED. */
  canSend: string;
  errors: Array<{ code: number | null; description: string; solution: string | null }>;
}

export interface WaHealthStatus {
  /** Did Meta answer at all — false means the CHECK failed, not that sending is blocked. */
  available: boolean;
  canSend: string | null;
  entities: WaHealthEntity[];
  checkedAt: string | null;
  error?: string;
}

export interface WaTokenHealth {
  /** Did `debug_token` answer at all. */
  ok: boolean;
  /** Meta's own verdict. False means every send is already failing with OAuth 190. */
  valid: boolean;
  /** Null for a never-expiring system-user token. */
  expiresAt: string | null;
  daysRemaining: number | null;
  scopes: string[];
  checkedAt: string | null;
  error?: string;
}

/**
 * Meta's customer-facing profile for a connected number — everything a customer
 * sees when they tap the business name in WhatsApp.
 */
export interface WaBusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
}

/** Meta's fixed industry list for the profile category. */
export const WA_PROFILE_VERTICALS = [
  'UNDEFINED',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'NOT_A_BIZ',
] as const;

/** Cart / catalog state for a number, plus the catalogs it can be bound to. */
/**
 * Meta's native conversational components for the number.
 *
 * `enableWelcomeMessage` asks Meta to notify us the moment a customer opens the
 * thread; `prompts` are the ice breakers shown on an empty chat; `commands` are
 * the slash-commands the composer offers. All three are what the customer sees
 * BEFORE they have written anything, which is the gap the in-thread greeting and
 * FAQ menu cannot fill.
 */
export interface WaConversationalAutomation {
  enableWelcomeMessage: boolean;
  prompts: string[];
  commands: Array<{ name: string; description: string }>;
}

/** Meta's own caps on the conversational-automation edge. */
export const WA_ICE_BREAKER_MAX = 4;
export const WA_ICE_BREAKER_TEXT_MAX = 80;
export const WA_COMMAND_MAX = 30;
export const WA_COMMAND_NAME_MAX = 32;
export const WA_COMMAND_DESCRIPTION_MAX = 256;

export interface WaCommerceSettings {
  isCartEnabled: boolean;
  isCatalogVisible: boolean;
  catalogId: string | null;
  catalogs: Array<{ id: string; name: string }>;
}

/** Result of a per-channel connection test against Meta. */
export interface WaChannelTestResult {
  ok: boolean;
  /** True when the test ran with META_WHATSAPP_TOKEN rather than a per-channel one. */
  usingEnvToken: boolean;
  displayPhone?: string;
  displayName?: string | null;
  qualityRating?: string;
  /**
   * A number that answers today is not a number that will still be sending next
   * week, so the test reports the credential's expiry and Meta's eligibility
   * verdict alongside the reachability it was originally asked about.
   */
  token?: WaTokenHealth;
  health?: WaHealthStatus;
  error?: string;
}

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WaTemplateStatus =
  'LOCAL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL';
export type WaTemplateQuality = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface WaTemplate {
  id: string;
  metaId: string | null;
  name: string;
  language: string;
  category: WaTemplateCategory;
  status: WaTemplateStatus;
  quality: WaTemplateQuality;
  components: unknown;
  variableSample?: unknown;
  rejectionReason: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One entry of Meta's pre-approved template library.
 *
 * A template created from one of these is approved instantly, so it is the
 * fastest route to a working template on a fresh WABA. The content is Meta's;
 * only the name, the language and the button inputs are ours.
 */
export interface WaLibraryTemplate {
  id?: string;
  name: string;
  language?: string;
  category?: string;
  header?: string;
  body?: string;
  footer?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
  body_params?: string[];
  topic?: string;
  usecase?: string;
  industry?: string[];
}

export interface WaTemplatesPage {
  items: WaTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Where a contact's consent came from, as the writers actually store it.
 *
 * Encrypted at rest and decrypted on every backend read path, so the drawer gets
 * the original object. Modelled rather than left as `unknown` because it is the
 * evidence an operator has to be able to read out during a Meta quality review
 * or a DPDP grievance — `at` and `source` are the answer to "when, and by what
 * route?".
 */
export type WaConsentEvidence =
  | {
      /** Click-to-WhatsApp: the customer arrived from an ad or post. */
      source: 'ctwa';
      at?: string;
      referral?: unknown;
      [key: string]: unknown;
    }
  | {
      source: 'import' | 'reply' | 'manual' | 'bulk' | 'api' | 'form' | 'meta_preference';
      at?: string;
      ip?: string;
      [key: string]: unknown;
    }
  | { source?: undefined; [key: string]: unknown };

export interface WaContact {
  id: string;
  phone: string;
  waId: string | null;
  name: string | null;
  // `userId` (the platform-account link) was dropped with the User model — see
  // the note on WaContactLite. The API no longer returns it.
  optInStatus: WaOptInStatus;
  optInAt: string | null;
  optInSource: string | null;
  optOutAt: string | null;
  /** reply | meta_preference | manual | bulk — kept apart from optInSource. */
  optOutSource?: string | null;
  tags: string[];
  attributes?: Record<string, unknown> | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMarketingAt: string | null;
  /** When Meta last refused a marketing message to this contact, and why. */
  marketingRefusedAt?: string | null;
  marketingRefusedCode?: string | null;
  consentEvidence?: WaConsentEvidence | null;
  isBlocked: boolean;
  /**
   * When Meta CONFIRMED the block, and what it said if it refused.
   *
   * `isBlocked` on its own only ever stopped our own outbound. These two say
   * whether Meta is also refusing the contact's INBOUND messages — the half that
   * actually stops a spammer or harasser reaching the inbox.
   */
  blockSyncedAt?: string | null;
  blockSyncError?: string | null;
  /**
   * On the global do-not-contact list.
   *
   * Suppression lives in its own table keyed by phone, so the contact row said
   * nothing about it: a suppressed person still showed a green OPTED IN badge
   * while every send to them came back FAILED with 131050. Resolved per page
   * from the suppression table itself, so it cannot lag behind.
   */
  suppressed?: boolean;
  /** Mirror of the same fact on the row; `suppressed` is the authoritative one. */
  suppressedAt?: string | null;
  /** Set on the losing row of a merge — it points at the surviving contact. */
  mergedIntoId?: string | null;
  mergedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One contact inside a possible-duplicate group. */
export interface WaDuplicateContact {
  id: string;
  phone: string;
  name: string | null;
  optInStatus: WaOptInStatus;
  tags: string[];
  lastInboundAt: string | null;
  createdAt: string;
  /** Messages held by this row — the cue for which copy to keep. */
  messageCount: number;
}

/**
 * Contacts that are probably the same person, keyed on their last nine digits.
 *
 * Phone is the sole identity, so a number stored before country-code prefixing
 * existed (or an inbound wa_id that differs from the stored phone) produces two
 * rows, each with its own conversation history and its own consent state.
 */
export interface WaDuplicateGroup {
  key: string;
  contacts: WaDuplicateContact[];
}

/** What a merge moved. */
export interface WaMergeResult {
  survivorId: string;
  mergedId: string;
  conversationsMoved: number;
  conversationsFolded: number;
  messagesMoved: number;
  campaignRecipientsMoved: number;
  campaignRecipientsDropped: number;
  /** True when the survivor came out OPTED_OUT because the merged row was. */
  consentTightened: boolean;
}

export type WaImportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * One bulk contact import. The endpoint answers with this rather than the
 * outcome: the work runs on a queue, and the modal polls this row for progress.
 */
export interface WaImportJob {
  id: string;
  status: WaImportJobStatus;
  total: number;
  processed: number;
  created: number;
  updated: number;
  /** Rows dropped for an unusable phone number. */
  skipped: number;
  /** Rows matching a contact who had explicitly opted out. Consent preserved. */
  skippedOptedOut: number;
  /** Rows naming a phone number already seen earlier in the same file. */
  duplicates: number;
  optIn: boolean;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface WaContactsPage {
  items: WaContact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * A platform User account reachable on WhatsApp. `resolvedNumber` prioritises
 * the profile WhatsApp number, falling back to the account mobile number
 * (`numberSource` says which). `contactId`/`conversationId` are set when a
 * WhatsApp contact/conversation already exists for this user.
 */
export type WaCampaignStatus =
  'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type WaCampaignRecipientStatus =
  'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED';

/** A reusable campaign blueprint (template + audience + settings). */
export interface WaCampaignTemplate {
  id: string;
  name: string;
  description: string | null;
  templateId: string;
  audienceType: string | null;
  type: string;
  isAbTest: boolean;
  recurrenceDays: number | null;
  createdAt: string;
}

export interface WaCampaign {
  id: string;
  name: string;
  description: string | null;
  channelId: string;
  templateId: string;
  status: WaCampaignStatus;
  audienceType: string;
  audienceFilter?: unknown;
  /** The saved segment the audience came from, when it came from one. */
  segmentId?: string | null;
  variableMapping?: unknown;
  scheduledAt: string | null;
  /** Hold sends (and drip steps) outside the configured business hours. */
  respectBusinessHours?: boolean;
  batchSize: number;
  throttlePerSec: number;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  estimatedCostPaise: number | null;
  type: 'BROADCAST' | 'SEQUENCE';
  repliedCount: number;
  convertedCount: number;
  actualCostPaise: number | null;
  isAbTest?: boolean;
  /** Launch to this % of the audience only, holding the rest back for the winner. */
  abTestSamplePct?: number | null;
  /** The rate the winner is judged on: 'delivered' | 'read' | 'replied'. */
  abTestMetric?: WaAbMetric | null;
  winnerVariantId?: string | null;
  abTestDecidedAt?: string | null;
  /** Soft-archived campaigns are hidden from the default list. */
  archivedAt?: string | null;
  recurrenceDays?: number | null;
  nextRunAt?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { name: string; language?: string; category: string; status?: string };
  /**
   * The campaign-wide send parameters. Returned by GET /campaigns/:id and
   * declared here so the editor can read them back — without it, opening a
   * campaign for editing started from blank header media, coupon code, offer
   * expiry and product SKUs, and saving would then wipe what was there.
   */
  templateParams?: WaCampaignTemplateParams | null;
}

export interface WaCampaignsPage {
  items: WaCampaign[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WaCampaignRecipient {
  id: string;
  status: WaCampaignRecipientStatus;
  wamid: string | null;
  errorCode: string | null;
  sentAt: string | null;
  /** First time this recipient opened a tracked link from the campaign. */
  clickedAt: string | null;
  createdAt: string;
  contact: { phone: string; name: string | null };
}

export interface WaRecipientsPage {
  items: WaCampaignRecipient[];
  /**
   * Only sent when it was cheap to answer — the campaign's own counter when the
   * list is unfiltered, one count for the first page when it is filtered. null
   * on a follow-on page means "unchanged", not "zero": counting a filtered
   * half-million-row campaign per page is the scan this paging exists to avoid.
   */
  total: number | null;
  limit: number;
  /** Pass back as `cursor` for the next page; null when this is the last one. */
  nextCursor: string | null;
}

export interface WaAnalyticsOverview {
  contacts: { total: number; optedIn: number; optedOut: number; blocked: number };
  conversations: { total: number; open: number };
  messages: {
    inbound: number;
    outbound: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    failRate: number;
  };
  templates: Array<{ status: string; count: number }>;
  campaigns: Array<{ status: string; count: number }>;
  channel: {
    displayPhone: string;
    qualityRating: string;
    messagingTier: string | null;
    isActive: boolean;
  } | null;
  bridge: { enabled: boolean };
  /**
   * The same five counts over the immediately preceding window, for the
   * period-over-period delta. null when no window was requested — a lifetime
   * total has nothing to compare against.
   */
  previousMessages: {
    inbound: number;
    outbound: number;
    delivered: number;
    read: number;
    failed: number;
  } | null;
  /** Echoes the window actually applied; `days: null` means lifetime. */
  window: { days: number | null; since: string | null };
  /** IANA zone every daily/hourly bucket on this dashboard is cut in. */
  tz: string;
}

export interface WaTimeSeriesPoint {
  date: string;
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface WaSlaMetrics {
  avgFirstResponseMins: number | null;
  avgResolutionMins: number | null;
  openCount: number;
  resolvedCount: number;
}

export interface WaAgentProductivity {
  userId: string;
  name: string;
  messagesSent: number;
  conversationsAssigned: number;
  /** Conversations this agent moved to RESOLVED inside the selected window. */
  conversationsResolved: number;
  /** Mean minutes to an agent reply, over every response on this agent's threads. */
  avgResponseMins: number | null;
  /** Median response time, in minutes. */
  p50ResponseMins: number | null;
  /** 90th-percentile response time, in minutes — the tail an SLA is written against. */
  p90ResponseMins: number | null;
  /** Mean minutes from the start of the current episode to resolution. */
  avgResolutionMins: number | null;
  /** Mean CSAT score (1-5) over this agent's rated conversations. */
  csatAvg: number | null;
  /** How many were rated — an average over two ratings is not a number. */
  csatCount: number;
}

export interface WaMetaRateRow {
  category: string;
  volume: number;
  costMinor: number;
  /** Meta's own cost ÷ volume, in minor units. null when volume is 0. */
  observedRateMinor: number | null;
  /** What the WHATSAPP_PRICE_*_PAISE constant claims for the same category. */
  estimatedRatePaise: number;
  /** (observed − estimated) / estimated, as a percentage. null when unknown. */
  variancePct: number | null;
}

/** Meta's authoritative billed figures, and how far our estimate is from them. */
export interface WaMetaCostReconciliation {
  available: boolean;
  currency: string | null;
  /** false when Meta bills this WABA in a currency our ₹ estimates cannot be compared with. */
  estimateComparable: boolean;
  lastSyncedAt: string | null;
  totalCostMinor: number;
  totalVolume: number;
  conversationCount: number;
  conversationCostMinor: number;
  byCategory: WaMetaRateRow[];
}

export interface WaCostSummary {
  /**
   * Meta's per-message amounts rounded to whole minor units. null when Meta
   * never reported a price on the status webhook (the usual case).
   *
   * Meta quotes 4-6 decimals (0.0383), so this rounds to 4 and is several
   * percent out per message — `totalActualCostAmount` is the exact figure.
   */
  totalActualCostPaise: number | null;
  /** The same total from the exact per-message decimals. */
  totalActualCostAmount?: string | null;
  /**
   * The currency Meta billed in, or 'MIXED' when the window spans more than
   * one. null when nothing reported a currency.
   */
  actualCurrency?: string | null;
  /**
   * Whether the actual figure is in the same currency as the ₹ estimate. false
   * means the two are different units and must not be compared or shown under
   * one symbol.
   */
  actualComparable?: boolean;
  totalEstimatedCostPaise: number;
  campaignCount: number;
  byCategory: Array<{ category: string; costPaise: number }>;
  meta: WaMetaCostReconciliation;
}

export interface WaOptOutPoint {
  date: string;
  /** Opt-OUT events on this day. */
  count: number;
  /** Opt-IN events the same day, so churn can be read against recovery. */
  optIns: number;
}

export interface WaOptOutCampaignRow {
  campaignId: string;
  name: string;
  optOuts: number;
  delivered: number;
  /** Opt-outs per 1,000 delivered messages. */
  ratePer1000: number;
}

export interface WaOptOutSummary {
  optOuts: number;
  optIns: number;
  delivered: number;
  ratePer1000: number;
  byCampaign: WaOptOutCampaignRow[];
  unattributed: number;
}

export interface WaClickPoint {
  date: string;
  clicks: number;
  uniqueClickers: number;
}

/** One click-to-WhatsApp ad source and what it produced. */
export interface WaCtwaRow {
  sourceId: string | null;
  sourceType: string | null;
  headline: string | null;
  contacts: number;
  conversations: number;
  conversions: number;
  conversionValuePaise: number;
}

export interface WaCtwaReport {
  totalContacts: number;
  rows: WaCtwaRow[];
}

/**
 * One saved segment's performance, as `/analytics/segments` returns it.
 *
 * Membership is resolved as of NOW through the same predicate the campaign
 * audience resolver uses, so `contacts` is the audience a launch would reach —
 * not a frozen cohort. Churn is attributed through the campaigns sent to the
 * segment, because opting out is what removes somebody from one.
 */
export interface WaSegmentPerformanceRow {
  segmentId: string;
  name: string;
  contacts: number;
  inbound: number;
  outbound: number;
  /** DELIVERED ∪ READ — already includes every read message. */
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  failRate: number;
  costPaise: number;
  conversions: number;
  conversionValuePaise: number;
  campaigns: number;
  campaignDelivered: number;
  optOuts: number;
  optOutsPer1000: number;
}

/** Campaign outcomes grouped by how the audience was chosen. */
export interface WaAudienceTypeRow {
  audienceType: string;
  campaigns: number;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  failRate: number;
}

export interface WaSegmentPerformance {
  window: { days: number | null };
  rows: WaSegmentPerformanceRow[];
  totalSegments: number;
  /** true when more segments exist than the report compares. */
  truncated: boolean;
  byAudienceType: WaAudienceTypeRow[];
}

/** One acquisition month followed through the funnel (`/analytics/cohorts`). */
export interface WaCohortRow {
  /** First day of the month, YYYY-MM-DD in the reporting timezone. */
  month: string;
  contacts: number;
  optedIn: number;
  optedOut: number;
  replied: number;
  activeLast30: number;
  inbound: number;
  outbound: number;
  conversions: number;
  conversionValuePaise: number;
  replyRate: number;
  retentionRate: number;
  churnRate: number;
}

export interface WaCohortReport {
  months: number;
  tz: string;
  rows: WaCohortRow[];
}

export interface WaCannedReply {
  id: string;
  title: string;
  text: string;
  createdAt: string;
}

export interface WaFaq {
  id: string;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A header above an interactive prompt: a title, or an image / video / document. */
export interface WaInteractiveHeader {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  /** Public URL for a media header — or `id` for something already uploaded. */
  link?: string;
  id?: string;
  filename?: string;
}

export interface WaInteractiveInput {
  kind:
    | 'button'
    | 'list'
    | 'cta_url'
    | 'flow'
    | 'product'
    | 'product_list'
    // Meta's two collection prompts. The first gets a customer's location with
    // one tap; the second collects a structured India/Singapore delivery address
    // instead of free text an agent has to re-key.
    | 'location_request_message'
    | 'address_message';
  bodyText: string;
  /**
   * Header above the prompt. Meta forbids one on the collection prompts and on a
   * single-product message, and allows only a text header on a list.
   */
  header?: WaInteractiveHeader;
  /** ISO country for an address_message; Meta supports IN and SG only. */
  addressCountry?: 'IN' | 'SG';
  buttons?: Array<{ id: string; title: string }>;
  listButton?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  ctaText?: string;
  ctaUrl?: string;
  // WhatsApp Flows (kind === 'flow'). The send path has always accepted these
  // (whatsapp-send.service.ts InteractiveInput) — the type stopped short of
  // 'flow', so the composer could not reach Meta's own form mechanism at all.
  /** Meta flow id (WaFlow.metaId), NOT our row id. */
  flowId?: string;
  /** Label on the button that opens the flow. */
  flowCta?: string;
  /** Correlates the submission back to this send; generated per message. */
  flowToken?: string;
  /** 'navigate' (static flow) | 'data_exchange' (endpoint-backed flow). */
  flowAction?: 'navigate' | 'data_exchange';
  /** Initial screen id — only meaningful for 'navigate'. */
  flowScreen?: string;
  /** Data handed to the initial screen. */
  flowActionPayload?: Record<string, unknown>;
  // Commerce (kind === 'product' | 'product_list'). `catalogId` is optional —
  // omitted, the backend uses the catalog bound to the sending number.
  catalogId?: string;
  /** Single-product message: the item's retailer id from the catalog. */
  productRetailerId?: string;
  /** Multi-product message: up to 30 items across up to 10 sections. */
  productSections?: Array<{ title?: string; productRetailerIds: string[] }>;
  /** Header text — Meta requires one on a multi-product message. */
  headerText?: string;
  footerText?: string;
}

export interface WaTemplateAnalytics {
  /** null = all time. Echoed back so the UI can label the window it is showing. */
  days?: number | null;
  language?: string;
  template: {
    id: string;
    name: string;
    language: string;
    category: WaTemplateCategory;
    status: WaTemplateStatus;
    quality: WaTemplateQuality;
    rejectionReason: string | null;
  };
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

/** One mapped {{n}} that resolves to nothing for part of the audience. */
export interface WaBlankVariable {
  /** 1-based placeholder position, i.e. `{{index}}` in the template body. */
  index: number;
  token: string;
  blankCount: number;
}

export interface WaAudiencePreview {
  count: number;
  estimatedCostPaise: number;
  /** Meta daily unique-recipient cap; null when the tier imposes none we can read. */
  tierLimit?: number | null;
  uniqueSentLast24h?: number;
  exceedsTier?: boolean;
  /**
   * Pre-launch personalisation check. Meta rejects an empty template parameter
   * and fails the WHOLE message, so a `{{name}}` mapping over an audience of
   * mostly nameless imported contacts hard-fails most of the send — this says so
   * before the money is spent.
   */
  blankVariables?: WaBlankVariable[];
}

/**
 * Meta's own answer to 'may this campaign send at all?', asked before Launch.
 *
 * An ineligible number and a paused template both report a perfectly normal
 * quality rating right up to the moment the send is refused, so without this the
 * first sign of either was a materialized audience and a screen of FAILED
 * recipients.
 */
export interface WaCampaignPreflight {
  /** AVAILABLE | LIMITED | BLOCKED, or null when neither check could be made. */
  canSend: string | null;
  /** True when at least one of the two checks answered. */
  checked: boolean;
  /** Only the entities that are NOT free to send — the actionable part. */
  blockers: WaHealthEntity[];
  errors: string[];
}

export interface WaSettings {
  id: string;
  businessHours: unknown;
  awayMessage: string | null;
  welcomeMessage: string | null;
  autoReplyEnabled: boolean;
  awayMode: boolean;
  marketingCapPer24h: number;
  retentionDays: number | null;
  optOutKeywords: string[];
  optInKeywords?: string[];
  /**
   * Minutes one away auto-reply silences the next on the same thread. Was a
   * hardcoded 30 in the engine — invisible and untunable, which is far too long
   * for a busy desk and far too short for a number staffed once a week.
   */
  awayDebounceMinutes?: number;
  /** Sent to a customer whose message opted them out; blank sends nothing. */
  optOutConfirmationMessage?: string | null;
  faqMenuEnabled: boolean;
  faqTriggerKeywords: string[];
  /** Sent when a customer taps an FAQ row that has since been retired. */
  faqFallbackMessage?: string | null;
  updatedAt: string;
}

/**
 * How a rule's keyword is compared against an inbound message. `substring` and
 * `regex` were implemented by the engine and documented on the model all along,
 * but were missing from the API enum and from this union, so the console could
 * neither offer nor display them.
 *
 * `contains` is word-boundary aware ("no" does not fire on "notes");
 * `substring` is the older permissive behaviour, kept as an explicit choice.
 */
export type WaMatchType = 'exact' | 'contains' | 'starts' | 'substring' | 'regex';

export interface WaKeywordRule {
  id: string;
  name: string;
  match: string;
  matchType: WaMatchType;
  replyText: string | null;
  replyTemplateId: string | null;
  /** {{n}} values for replyTemplateId; replies used to send none. */
  replyVariables?: string[] | null;
  /**
   * What a match DOES. 'reply' answers the customer; 'handoff' routes the thread
   * to a human — a rule could only ever say something, so "talk to a human" got a
   * canned sentence and escalated to nobody.
   */
  action?: 'reply' | 'handoff';
  /** Operator label to assign the thread to on handoff. */
  handoffAssignee?: string | null;
  /** Triage label to apply on handoff. */
  handoffLabel?: string | null;
  /** Status to move the conversation into on handoff. */
  handoffStatus?: 'OPEN' | 'PENDING' | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

export interface WaNote {
  id: string;
  conversationId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface WaSequenceStep {
  id?: string;
  stepOrder: number;
  templateId: string;
  delayHours: number;
  condition: 'any' | 'no_reply' | 'replied';
  /** Per-step {{n}} mapping, resolved per recipient at send time. */
  variableMapping?: string[];
}

export interface WaCampaignVariant {
  id?: string;
  campaignId?: string;
  label: string;
  templateId: string;
  weight: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
}

/** The rate an A/B test can be decided on. */
export type WaAbMetric = 'delivered' | 'read' | 'replied';

/** One variant's measured performance, as the A/B panel renders it. */
export interface WaAbVariantStat {
  id: string;
  label: string;
  templateId: string;
  weight: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  /** The decision metric over this variant's sends, 0-1; null when nothing sent. */
  rate: number | null;
  /** Percentage-point difference against the best OTHER variant. */
  liftPct: number | null;
  /** Two-proportion z against the best other variant. */
  z: number | null;
  /** True when the gap clears 95% two-sided — i.e. it is not just noise. */
  significant: boolean;
  isWinner: boolean;
}

/** Everything the A/B panel needs to decide a test and act on it. */
export interface WaAbTestReport {
  metric: WaAbMetric;
  samplePct: number | null;
  winnerVariantId: string | null;
  decidedAt: string | null;
  /** Best measured rate with any data — the suggested winner. */
  leaderVariantId: string | null;
  significant: boolean;
  /** Eligible contacts with no recipient row yet: what a remainder send adds. */
  remainingAudience: number;
  variants: WaAbVariantStat[];
}

/** Clicks attributed to one A/B variant (joined through the recipient rows). */
export interface WaVariantClickStat {
  variantId: string;
  clicks: number;
  uniqueClickers: number;
}

/** Campaign click-through: totals, the daily series and the per-variant split. */
export interface WaCampaignClickStats {
  totalClicks: number;
  uniqueClickers: number;
  delivered: number;
  /** uniqueClickers / delivered, as a percentage. */
  ctr: number;
  /** Clickers who converted within the 7-day click-attribution window. */
  convertedClickers: number;
  /** convertedClickers / uniqueClickers, as a percentage. */
  clickToConversionRate: number;
  series: WaClickPoint[];
  variants: WaVariantClickStat[];
}

/**
 * Template parameters that are constant across a campaign's audience.
 *
 * Body variables are per-recipient (variableMapping); these are not. A template
 * with a media header, a variable text header or a dynamic URL button needs
 * them at SEND time, and Meta rejects the whole send with (#131008) without.
 */
export interface WaCampaignTemplateParams {
  headerText?: string;
  /**
   * An uploaded Meta media id — the alternative to `headerMediaUrl`, produced by
   * the campaign form's Upload mode.
   *
   * Staged under the campaign's own channel, because a media id is scoped to the
   * number that uploaded it, and dropped by Meta after ~30 days — so a URL is
   * the better choice for a campaign scheduled further out than that.
   */
  headerMediaId?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  /**
   * DOCUMENT header: the filename the attachment shows on the handset.
   *
   * Campaign-wide like the URL itself. Without it every recipient's PDF is named
   * after the URL's last path segment rather than "Invoice-October.pdf".
   */
  headerMediaFilename?: string;
  /**
   * LOCATION header pin — one place for the whole audience, like the media above.
   *
   * A LOCATION-header template used to pass every check the wizard and the API
   * make and then be refused by Meta with (#131008) for every recipient, because
   * nothing on the campaign path carried the pin.
   */
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  /** Value for the FIRST dynamic URL button — the single-button shorthand. */
  buttonUrlParam?: string;
  /**
   * One value per dynamic URL button, in authored order.
   *
   * Meta allows two URL buttons and either may be dynamic. One scalar filled only
   * the first, so a two-link template launched clean and was then refused for the
   * whole audience with (#131008) for the button nothing addressed.
   */
  buttonUrlParams?: string[];
  /** COPY_CODE button value — one coupon shared by the whole audience. */
  couponCode?: string;
  /** LIMITED_TIME_OFFER countdown expiry, epoch ms. */
  ltoExpirationMs?: number;
  /**
   * Catalogue products, campaign-wide like the header media.
   *
   * The thumbnail SKU heads a CATALOG or MPM card (optional for CATALOG — Meta
   * falls back to the catalog's first item), the sections are a multi-product
   * template's product list, and the retailer id fills a single-product
   * template's PRODUCT header. All three are chosen per send: they exist nowhere
   * in the approved template.
   */
  catalogThumbnailProductId?: string;
  productSections?: WaTemplateProductSection[];
  productRetailerId?: string;
  /**
   * CAROUSEL cards, in card order — one entry per card the template carries.
   * Campaign-wide, like the header media above: the whole audience gets the same
   * card images and card text, and only the bubble's body is personalised.
   */
  carouselCards?: WaCarouselCardParams[];
}

/**
 * One carousel card's send values. Structurally the same shape the inbox composer
 * sends (`TemplateCarouselCardValues` in lib/whatsapp-template-vars) and the same
 * the API stores, because both end up in the one `carousel` component Meta takes.
 */
export interface WaCarouselCardParams {
  /** A media id already staged at Meta (preferred over a re-fetched link). */
  headerMediaId?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video';
  /** Positional values for this card's own {{n}} placeholders. */
  bodyParams?: string[];
  /** Value for this card's FIRST dynamic {{n}} URL-button suffix. */
  buttonUrlParam?: string;
  /** One value per dynamic URL button on this card, in authored order. */
  buttonUrlParams?: string[];
}

/** One section of a multi-product (MPM) template's product list. */
export interface WaTemplateProductSection {
  /** Section heading. Meta caps it at 24 characters. */
  title: string;
  /** The SKUs in this section, as they appear in the bound catalog. */
  productRetailerIds: string[];
}

export interface WaShortLink {
  id: string;
  code: string;
  targetUrl: string;
  clickCount: number;
  /** Distinct contacts that clicked (only clicks carrying a recipient token). */
  uniqueClickers: number;
  /** uniqueClickers / campaign deliveredCount, as a percentage. */
  ctr: number;
  createdAt: string;
  /**
   * Absolute, shareable URL resolved by the API.
   *
   * Optional only because older cached responses predate it. Never rebuild this
   * client-side from window.location.origin: the /l/:code redirect is served by
   * the API, which on a split deploy is a different origin from this app.
   */
  url?: string;
}

export type WaScheduledMessageStatus = 'PENDING' | 'SENT' | 'CANCELLED' | 'FAILED';

export interface WaScheduledMessage {
  id: string;
  conversationId: string;
  kind: 'text' | 'template' | 'media';
  text: string | null;
  templateId: string | null;
  /**
   * Media rows only. The bytes live in our own storage until the dispatch tick
   * uploads them to Meta — a Meta media id taken at schedule time expires after
   * 30 days, so anything scheduled further out would have failed silently.
   */
  mediaMime?: string | null;
  mediaFilename?: string | null;
  caption?: string | null;
  sendAt: string;
  status: WaScheduledMessageStatus;
  createdAt: string;
}

/** A row of the global scheduled queue: the message plus who it goes to. */
export interface WaScheduledMessageWithContact extends WaScheduledMessage {
  sentAt: string | null;
  error: string | null;
  contact: { id: string; phone: string; name: string | null } | null;
}

export interface WaHeatmapPoint {
  dow: number;
  hour: number;
  count: number;
}

export interface WaKeywordCount {
  word: string;
  count: number;
}

export interface WaHealthSnapshot {
  date: string;
  quality: string;
  tier: string | null;
}

export interface WaCsatSummary {
  // Named to match what the API actually returns. These were `average`/`count`,
  // which the backend has never sent, so the panel read undefined and rendered
  // blank for every deployment.
  averageScore: number | null;
  ratedCount: number;
  /** 1–5 rating buckets (every bucket present), as returned by the backend. */
  distribution: Array<{ score: number; count: number }>;
}

export interface WaAgent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface WaSuppression {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
  /**
   * The contact this number belongs to, when we hold one. Null for a number
   * loaded from a supplied DNC list that has never messaged us.
   */
  contactId?: string | null;
  contactName?: string | null;
}

export interface WaSuppressionsPage {
  items: WaSuppression[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Official Meta Graph analytics (templates / conversations / pricing) ──
export interface WaMetaTemplateRow {
  templateId: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
}
export interface WaMetaConversationRow {
  category: string;
  conversations: number;
  cost: number;
}
export interface WaMetaPricingRow {
  category: string;
  type: string;
  volume: number;
  cost: number;
}
/** A campaign's links with their click-through, as returned by /campaigns/:id/links. */
export interface WaCampaignLinkStats {
  totalClicks: number;
  uniqueClickers: number;
  /** The denominator the CTRs are computed against (campaign deliveredCount). */
  delivered: number;
  ctr: number;
  convertedClickers: number;
  clickToConversionRate: number;
  links: WaShortLink[];
}

export interface WaMetaAnalytics {
  configured: boolean;
  range: { start: number; end: number; days: number };
  /** ISO 4217 billing currency of the WABA; null when Meta will not say. */
  currency: string | null;
  templates: { available: boolean; data: WaMetaTemplateRow[]; error?: string };
  /**
   * How many synced templates the template block covers, out of how many exist.
   * Meta caps `template_analytics` at 10 ids per call; the backend batches, but a
   * partial answer still has to declare itself rather than look complete.
   */
  templatesCovered: number;
  templatesTotal: number;
  conversations: {
    available: boolean;
    data: WaMetaConversationRow[];
    totalConversations: number;
    totalCost: number;
    error?: string;
  };
  pricing: {
    available: boolean;
    data: WaMetaPricingRow[];
    totalVolume: number;
    totalCost: number;
    error?: string;
  };
  /** Meta's own per-day messaging volume — the ground truth our counts drift from. */
  volume: {
    available: boolean;
    data: WaMetaVolumeRow[];
    totalSent: number;
    totalDelivered: number;
    error?: string;
  };
}

/** One day of Meta's own messaging volume for the WABA. */
export interface WaMetaVolumeRow {
  /** YYYY-MM-DD (UTC). */
  date: string;
  sent: number;
  delivered: number;
}

/**
 * One condition inside an audience filter.
 *
 * `field` is a contact column (`tags`, `optInStatus`, `optInSource`,
 * `lastInboundAt` / `lastOutboundAt` / `lastMarketingAt`), an imported column as
 * `attr.<key>`, or the literal `campaign` whose value is a campaign id.
 */
export interface WaSegmentRule {
  field: string;
  operator: string;
  value?: string | number | string[];
}

/**
 * The stored audience predicate. `tags` / `optInStatus` / `attributes` are the
 * original flat keys (every segment saved before the rule grammar still carries
 * them); `rules` adds tag AND/NOT, recency windows and campaign engagement.
 */
export interface WaSegmentFilter {
  tags?: string[];
  optInStatus?: string;
  attributes?: Record<string, string>;
  op?: 'and' | 'or';
  rules?: WaSegmentRule[];
  /** Upload/manual campaigns only — never on a saved segment. */
  phones?: string[];
  /**
   * The same uploaded audience with the columns the file carried.
   *
   * `phones` can only hold numbers, so a one-off blast to a supplied list could
   * not be personalised at all — an order id or an appointment slot had nowhere
   * to live. `vars` is merged over the contact's own attributes for the length
   * of the send, so `{{attr.order_id}}` in the mapping resolves exactly as it
   * does for a segment audience. `phones` stays for campaigns created before it.
   */
  recipients?: Array<{ phone: string; name?: string; vars?: Record<string, string> }>;
}

export interface WaSegment {
  id: string;
  name: string;
  description: string | null;
  filter: WaSegmentFilter;
  createdAt: string;
}

export interface WaConversion {
  id: string;
  /** Idempotency key from the server-to-server ingest route; null for manual entries. */
  externalId: string | null;
  campaignId: string | null;
  contactId: string | null;
  valuePaise: number | null;
  note: string | null;
  /** When it happened, as reported — distinct from when we recorded it. */
  occurredAt: string | null;
  /** 'manual' (operator form) | 'api' (postback). */
  source: string;
  createdAt: string;
}

export interface WaConversionSummary {
  count: number;
  totalValuePaise: number;
  /**
   * Top campaigns by conversion count, richest first in the server's ordering.
   *
   * This declared only `{ campaignId, count }` while the endpoint had been
   * returning value and now returns the campaign name too, so the leaderboard
   * could not be rendered without the compiler objecting to fields that were
   * sitting in the response the whole time.
   */
  byCampaign: Array<{
    campaignId: string;
    name: string;
    count: number;
    valuePaise: number;
    /** Recipients the campaign was sent to — the denominator below. */
    sent: number;
    /** valuePaise / sent, rounded; 0 when the campaign has sent to nobody. */
    valuePerRecipientPaise: number;
  }>;
}

/**
 * A conversational bot flow — the stateful half of the automation tier.
 *
 * Keyword rules answer one message with one canned line; a flow holds a
 * multi-step conversation, so "ask for a name, then an email, then raise a
 * ticket" and menus that branch on the previous answer become possible at all.
 */
export interface WaBotFlow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** 'keyword' starts on a matching message; 'manual' never starts by itself. */
  triggerType: string;
  triggerKeywords: string[];
  triggerMatchType: WaMatchType;
  /** Step the flow enters on; null means its lowest-ordered step. */
  entryStepKey: string | null;
  /** Minutes of silence after which an unfinished session is abandoned. */
  timeoutMinutes: number;
  /** Anything the customer can type to leave; a flow with no exit is a trap. */
  escapeKeywords: string[];
  cancelMessage: string | null;
  hitCount: number;
  completedCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: WaBotStep[];
}

/** One option on a `choice` step — sent as a WhatsApp quick reply. */
export interface WaBotChoice {
  label: string;
  /** Saved to the slot when chosen; defaults to the label. */
  value?: string;
  /** Step to jump to; falls back to the step's nextStepKey. */
  next?: string;
}

export type WaBotStepKind =
  'message' | 'ask' | 'choice' | 'set_attribute' | 'send_template' | 'handoff' | 'end';

export interface WaBotStep {
  id: string;
  flowId: string;
  /** Stable key referenced by nextStepKey, choices[].next and live sessions. */
  key: string;
  kind: WaBotStepKind;
  prompt: string | null;
  /** Slot the answer is stored under, reusable later as {{slot}}. */
  saveAs: string | null;
  validation: 'text' | 'number' | 'email' | 'phone';
  choices: WaBotChoice[] | null;
  retryMessage: string | null;
  value: string | null;
  templateId: string | null;
  templateVariables: string[] | null;
  handoffAssignee: string | null;
  handoffLabel: string | null;
  handoffStatus: 'OPEN' | 'PENDING' | null;
  nextStepKey: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An inbound file whose durable archive gave up.
 *
 * The failure used to be a log line and nothing else, so nobody found out
 * archiving had broken until a customer's photo was asked for weeks later and
 * Meta's own copy had expired too.
 */
export interface WaFailedMediaArchive {
  id: string;
  conversationId: string;
  mediaId: string | null;
  mediaMime: string | null;
  type: WaMessageType;
  createdAt: string;
  contact: { id: string; phone: string; name: string | null } | null;
  /** False once Meta's ~30-day window has passed — retrying cannot help then. */
  recoverable: boolean;
}

/** Event names an outbound webhook can subscribe to. */
export const WA_WEBHOOK_EVENTS = [
  'whatsapp.message.inbound',
  // Delivery state. A subscriber could learn that a customer had written in but
  // not what happened to the message it had just triggered, so any CRM that
  // needed "delivered / read / failed" had to poll the API for it.
  'whatsapp.message.outbound',
  'whatsapp.message.status',
  'whatsapp.contact.created',
  'whatsapp.contact.opted_out',
  'whatsapp.contact.opted_in',
  'whatsapp.channel.quality_degraded',
  'whatsapp.template.status_changed',
  'whatsapp.campaign.started',
  'whatsapp.campaign.completed',
  // Backend already accepted this event, but this list is the ONLY source of
  // the subscription chips on the webhooks page and there is no free-text
  // field -- so nothing could subscribe, the subscriber count was always 0,
  // and the Monday 06:00 digest cron returned immediately forever.
  'whatsapp.report.weekly',
] as const;
export type WaWebhookEvent = (typeof WA_WEBHOOK_EVENTS)[number];

export interface WaWebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  /** Returned ONLY on create — a subscriber cannot verify signatures without it. */
  secret?: string;
}

export interface WaWebhookDelivery {
  id: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  attempt: number;
  error: string | null;
  createdAt: string;
}

/**
 * Health of the INBOUND webhook (Meta → us).
 *
 * Nothing to do with `WaWebhookEndpoint` above, which is the outbound subscriber
 * CRUD. Meta disables a subscription after sustained delivery failures and never
 * says so — the only symptom is an inbox that goes quiet — so this is what turns
 * that silence into something the console can show.
 */
export interface WaInboundWebhookHealth {
  lastEventAt: string | null;
  /** Minutes since the last accepted event; null when none has ever arrived. */
  ageMinutes: number | null;
  staleAfterMinutes: number;
  stale: boolean;
  /** Persisted but never processed, and older than 5 minutes. */
  unprocessed: number;
  signatureFailures24h: number;
  lastSignatureFailureAt: string | null;
  /** null = the question could not be asked (no WABA id/token, or Meta unreachable). */
  subscribed: boolean | null;
}

/** One raw event Meta delivered. `payload` is only present on the detail route. */
export interface WaInboundWebhookEvent {
  id: string;
  eventType: string;
  wamid: string | null;
  signatureOk: boolean;
  processedAt: string | null;
  /**
   * Given up on after exhausting the replay budget — terminal, never retried.
   * Distinct from `processedAt`, which the retirement path used to stamp, making
   * a permanently-failed event indistinguishable from a successful one.
   */
  abandonedAt?: string | null;
  abandonReason?: string | null;
  deferAttempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  payload?: unknown;
}

/** Meta’s Flow categories. */
export const WA_FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER',
] as const;

export interface WaFlow {
  id: string;
  metaId: string;
  name: string;
  /** DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED */
  status: string;
  categories: string[];
  /** Set only for endpoint-backed (dynamic) flows. */
  endpointUri: string | null;
  previewUrl: string | null;
  validationErrors?: unknown;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface WaFlowResponse {
  id: string;
  flowId: string | null;
  flowToken: string | null;
  conversationId: string;
  contactId: string;
  responseJson: Record<string, unknown>;
  submittedAt: string;
}
