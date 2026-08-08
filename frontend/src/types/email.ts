// Types for the super-admin email system (mirrors the backend Prisma models).

export type EmailSubscribeStatus =
  | 'SUBSCRIBED'
  | 'UNSUBSCRIBED'
  | 'PENDING'
  | 'CLEANED'
  | 'UNKNOWN';
export type EmailTemplateCategory =
  | 'MARKETING'
  | 'TRANSACTIONAL'
  | 'NOTIFICATION'
  | 'NEWSLETTER'
  | 'ANNOUNCEMENT'
  | 'OTHER';
export type EmailTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type EmailCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type EmailCampaignRecipientStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED'
  | 'SKIPPED';
export type EmailCampaignType = 'BROADCAST' | 'SEQUENCE';
export type EmailThreadStatus = 'OPEN' | 'PENDING' | 'RESOLVED';
export type EmailDirection = 'INBOUND' | 'OUTBOUND';

export interface EmailSender {
  id: string;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  domain: string;
  dkimVerified: boolean;
  spfVerified: boolean;
  dmarcVerified: boolean;
  mtaStsVerified: boolean;
  tlsRptVerified: boolean;
  dkimSelector: string | null;
  reputationScore: number | null;
  hourlyCap: number | null;
  dailyCap: number | null;
  warmupDay: number;
  isDefault: boolean;
  isActive: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailContact {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
  subscribeStatus: EmailSubscribeStatus;
  subscribedAt: string | null;
  subscribeSource: string | null;
  unsubscribedAt: string | null;
  tags: string[];
  attributes: Record<string, unknown> | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  lastEmailedAt: string | null;
  bounceCount: number;
  complaintCount: number;
  isBlocked: boolean;
  /** Proof-of-consent provenance (source, method, timestamp, ip). */
  consentEvidence: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  htmlBody: string;
  textBody: string | null;
  category: EmailTemplateCategory;
  status: EmailTemplateStatus;
  variables: Array<{ key: string; label?: string; required?: boolean }> | null;
  variableSample: Record<string, unknown> | null;
  version: number;
  /** Reusable footer (footer-category snippet) rendered at the bottom of every send. */
  footerSnippetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  subject: string;
  preheader: string | null;
  htmlBody: string;
  textBody: string | null;
  createdAt: string;
}

export interface EmailSnippet {
  id: string;
  name: string;
  category: string | null;
  html: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignVariant {
  id: string;
  campaignId: string;
  label: string;
  templateId: string | null;
  subjectOverride: string | null;
  weight: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  deliveredCount: number;
}

export interface EmailCampaignStep {
  id: string;
  campaignId: string;
  stepOrder: number;
  templateId: string | null;
  subject: string | null;
  delayHours: number;
  condition: string;
  sentCount: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  description: string | null;
  senderId: string;
  templateId: string | null;
  subjectOverride: string | null;
  fromNameOverride: string | null;
  replyToOverride: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  status: EmailCampaignStatus;
  audienceType: string;
  audienceFilter: Record<string, unknown> | null;
  segmentId: string | null;
  variableMapping: Record<string, unknown> | null;
  attachments?: OutboundAttachmentRef[] | null;
  scheduledAt: string | null;
  sendTimezone: string | null;
  batchSize: number;
  sendRate: number;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  complainedCount: number;
  unsubscribedCount: number;
  failedCount: number;
  skippedCount: number;
  repliedCount: number;
  type: EmailCampaignType;
  isAbTest: boolean;
  recurrenceDays: number | null;
  autoPausedReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { name: string; category: EmailTemplateCategory } | null;
  sender?: { fromEmail: string; fromName: string; dkimVerified: boolean } | null;
  variants?: EmailCampaignVariant[];
  steps?: EmailCampaignStep[];
}

export interface EmailCampaignRecipient {
  id: string;
  email: string;
  status: EmailCampaignRecipientStatus;
  /** Seed/monitoring inbox — excluded from audience metrics. */
  isSeed?: boolean;
  openCount: number;
  clickCount: number;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  errorMessage: string | null;
  contact?: { email: string; name: string | null };
}

export interface EmailBlueprint {
  id: string;
  name: string;
  description: string | null;
  type: EmailCampaignType;
  isAbTest: boolean;
  createdAt: string;
}

export interface EmailSegment {
  id: string;
  name: string;
  description: string | null;
  filter: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSuppression {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  createdAt: string;
}

export interface EmailUnsubscribe {
  id: string;
  email: string;
  method: string;
  campaignId: string | null;
  createdAt: string;
}

/** Normalized response of every bulk mutation (sync count, async job, or undo). */
export interface BulkActionResult {
  async?: boolean;
  jobId?: string;
  total?: number;
  affected?: number;
  undoToken?: string | null;
  // legacy per-op count keys (still returned by id-capped endpoints)
  deleted?: number;
  updated?: number;
  removed?: number;
  resubscribed?: number;
  created?: number;
  memberCount?: number;
  errors?: Array<{ id: string; error: string }>;
}

/** A staged-in-R2 outbound attachment reference (campaign + reply sends). */
export interface OutboundAttachmentRef {
  key: string;
  filename: string;
  mime?: string;
  size?: number;
}

export interface EmailBulkJob {
  id: string;
  kind: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailThread {
  id: string;
  senderId: string;
  contactId: string;
  threadSubject: string | null;
  status: EmailThreadStatus;
  assignedTo: string | null;
  unreadCount: number;
  labels: string[];
  snoozedUntil: string | null;
  archivedAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  contact?: { email: string; name: string | null };
  notes?: EmailThreadNote[];
  messages?: EmailMessage[];
}

export interface EmailMessage {
  id: string;
  threadId: string | null;
  direction: EmailDirection;
  status: string;
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  htmlBody: string | null;
  textBody: string | null;
  snippet: string | null;
  attachments: Array<{ filename: string; mime: string; size: number; r2Url: string }> | null;
  createdAt: string;
  sentAt: string | null;
}

export interface EmailThreadNote {
  id: string;
  threadId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface EmailScheduledMessage {
  id: string;
  threadId: string;
  subject: string | null;
  body: string;
  sendAt: string;
  status: string;
  createdAt: string;
}

export interface EmailCannedReply {
  id: string;
  title: string;
  subject: string | null;
  body: string;
  shortcut: string | null;
}

export interface EmailRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: string;
  keywords: string[];
  matchSubject: boolean;
  matchBody: boolean;
  action: string;
  replyBody: string | null;
  label: string | null;
  assignTo: string | null;
  priority: number;
}

export interface EmailContactSet {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailBusinessDay {
  day: number; // 0 (Sun) – 6 (Sat)
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}
export interface EmailBusinessHours {
  tz?: string;
  days?: EmailBusinessDay[];
}

export interface EmailSettings {
  id: string;
  businessHours?: EmailBusinessHours | null;
  marketingCapPer24h: number;
  retentionDays: number | null;
  unsubscribeKeywords: string[];
  footerAddress: string | null;
  footerHtml: string | null;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  seedAddresses: string[];
  autoReplyEnabled: boolean;
  awayMode: boolean;
  awayMessage: string | null;
  welcomeMessage: string | null;
  /** Optimistic-concurrency token — echoed back as `expectedUpdatedAt`. */
  updatedAt?: string;
}

export interface EmailPlatformUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isEmailVerified: boolean;
  createdAt: string;
}

// ── Paginated envelopes ──
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export type EmailContactsPage = Paginated<EmailContact>;
export type EmailCampaignsPage = Paginated<EmailCampaign>;
export type EmailRecipientsPage = Paginated<EmailCampaignRecipient>;
export type EmailThreadsPage = Paginated<EmailThread>;
export type EmailPlatformUsersPage = Paginated<EmailPlatformUser>;

// ── Analytics ──
export interface EmailOverview {
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
    failed: number;
  };
  rates: {
    delivery: number;
    open: number;
    click: number;
    clickToOpen: number;
    bounce: number;
    complaint: number;
    unsubscribe: number;
  };
  counts: { campaigns: number; contacts: number; suppressed: number; templates: number };
  /** Opens from prefetch/proxy UAs — recorded but excluded from engagement metrics. */
  machineOpens?: number;
}

export interface EmailTimeseriesPoint {
  date: string;
  sent: number;
  delivered: number;
  open: number;
  click: number;
  bounce: number;
  complaint: number;
  unsubscribe: number;
}

export interface EmailHeatmap {
  matrix: number[][];
  tz: string;
}

export interface EmailNameCount {
  name: string;
  count: number;
}

export interface EmailClientBreakdown {
  clients: EmailNameCount[];
  devices: EmailNameCount[];
  total: number;
}

export interface EmailDomainStat {
  domain: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface EmailLeaderboardEntry {
  contactId: string;
  email: string | null;
  name: string | null;
  opens: number;
  clicks: number;
  campaigns: number;
}

export interface EmailLeaderboard {
  top: EmailLeaderboardEntry[];
  neverEngaged: number;
}

export interface EmailListGrowthPoint {
  date: string;
  added: number;
  unsubscribed: number;
  net: number;
}

export interface EmailBounceReasons {
  total: number;
  split: { hard: number; soft: number };
  categories: EmailNameCount[];
}

export interface EmailDeliverability {
  senders: Array<{
    id: string;
    fromEmail: string;
    fromName: string;
    domain: string;
    dkimVerified: boolean;
    spfVerified: boolean;
    dmarcVerified: boolean;
    mtaStsVerified: boolean;
    tlsRptVerified: boolean;
    reputationScore: number | null;
    isDefault: boolean;
    isActive: boolean;
    lastVerifiedAt: string | null;
  }>;
  rates: { bounce: number; complaint: number };
  suppression: { total: number; byReason: Record<string, number> };
}

export interface EmailCampaignAnalytics {
  campaign: EmailCampaign;
  funnel: Record<string, number>;
  rates: Record<string, number>;
  bounceSplit?: { hard: number; soft: number };
  byStatus: Record<string, number>;
  variants: Array<{
    id: string;
    label: string;
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  }>;
  links: Array<{ id: string; url: string; label: string | null; clicks: number }>;
}

export interface EmailTopLink {
  id: string;
  url: string;
  label: string | null;
  campaignId: string | null;
  clicks: number;
  uniqueClicks?: number;
}

export interface EmailContactTimeline {
  contact: EmailContact;
  events: Array<{
    id: string;
    eventType: string;
    campaignId: string | null;
    url: string | null;
    bounceType: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  campaigns: Array<{
    id: string;
    status: string;
    openCount: number;
    clickCount: number;
    sentAt: string | null;
    bouncedAt: string | null;
    campaign: { id: string; name: string } | null;
  }>;
}

export interface EmailBounceEvent {
  id: string;
  eventType: string;
  campaignId: string | null;
  contactId: string | null;
  email: string | null;
  bounceType: string | null;
  reason: string | null;
  createdAt: string;
}

export interface EmailCampaignComparison {
  id: string;
  name: string;
  sent: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  complaintRate: number;
  unsubscribeRate: number;
}
