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
  | 'UNSUPPORTED';
export type WaConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED';
export type WaOptInStatus = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT';

export interface WaContactLite {
  id: string;
  phone: string;
  name: string | null;
  optInStatus: WaOptInStatus;
  isBlocked: boolean;
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
  lastReadAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  labels: string[];
  archivedAt: string | null;
  csatRequestedAt: string | null;
  csatScore: number | null;
  createdAt: string;
  updatedAt: string;
  contact: WaContactLite;
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
  mediaMime: string | null;
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
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface WaChannel {
  id: string;
  phoneNumberId: string;
  displayPhone: string;
  displayName: string | null;
  isActive: boolean;
  isDefault: boolean;
  messagingTier: string | null;
  qualityRating: string;
}

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WaTemplateStatus =
  | 'LOCAL'
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL';
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

export interface WaTemplatesPage {
  items: WaTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
  tags: string[];
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMarketingAt: string | null;
  consentEvidence?: unknown;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
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
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type WaCampaignRecipientStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'SKIPPED';

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
  variableMapping?: unknown;
  scheduledAt: string | null;
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
  recurrenceDays?: number | null;
  nextRunAt?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { name: string; language?: string; category: string; status?: string };
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
  createdAt: string;
  contact: { phone: string; name: string | null };
}

export interface WaRecipientsPage {
  items: WaCampaignRecipient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
}

export interface WaCostSummary {
  totalActualCostPaise: number;
  totalEstimatedCostPaise: number;
  byCategory: Array<{ category: string; costPaise: number }>;
}

export interface WaOptOutPoint {
  date: string;
  count: number;
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

export interface WaInteractiveInput {
  kind: 'button' | 'list' | 'cta_url';
  bodyText: string;
  buttons?: Array<{ id: string; title: string }>;
  listButton?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  ctaText?: string;
  ctaUrl?: string;
}

export interface WaTemplateAnalytics {
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

export interface WaAudiencePreview {
  count: number;
  estimatedCostPaise: number;
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
  faqMenuEnabled: boolean;
  faqTriggerKeywords: string[];
  updatedAt: string;
}

export interface WaKeywordRule {
  id: string;
  name: string;
  match: string;
  matchType: 'exact' | 'contains' | 'starts';
  replyText: string | null;
  replyTemplateId: string | null;
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

export interface WaShortLink {
  id: string;
  code: string;
  targetUrl: string;
  clickCount: number;
  createdAt: string;
}

export interface WaScheduledMessage {
  id: string;
  conversationId: string;
  kind: 'text' | 'template';
  text: string | null;
  templateId: string | null;
  sendAt: string;
  status: 'PENDING' | 'SENT' | 'CANCELLED' | 'FAILED';
  createdAt: string;
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
  average: number | null;
  count: number;
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
export interface WaMetaAnalytics {
  configured: boolean;
  range: { start: number; end: number; days: number };
  templates: { available: boolean; data: WaMetaTemplateRow[]; error?: string };
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
}

export interface WaSegment {
  id: string;
  name: string;
  description: string | null;
  filter: Record<string, unknown>;
  createdAt: string;
}

export interface WaConversion {
  id: string;
  campaignId: string | null;
  contactId: string | null;
  valuePaise: number | null;
  note: string | null;
  createdAt: string;
}

export interface WaConversionSummary {
  count: number;
  totalValuePaise: number;
  byCampaign: Array<{ campaignId: string; count: number }>;
}

