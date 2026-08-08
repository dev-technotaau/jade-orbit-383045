import { z } from 'zod';

/** Validation schemas for the super-admin email system. */

const emailAddr = z.string().trim().email();

/** A staged-in-R2 outbound attachment reference (campaign + reply sends). */
const attachmentRefSchema = z.object({
  key: z.string().min(1).max(500),
  filename: z.string().min(1).max(300),
  mime: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});
const attachmentsField = z.array(attachmentRefSchema).max(10).optional();

// ---- Senders ----------------------------------------------------------------
export const emailSenderCreateSchema = {
  body: z.object({
    fromEmail: emailAddr,
    fromName: z.string().min(1).max(120),
    replyTo: emailAddr.optional().nullable(),
    dkimSelector: z.string().max(120).optional().nullable(),
    hourlyCap: z.number().int().min(0).optional().nullable(),
    dailyCap: z.number().int().min(0).optional().nullable(),
    isDefault: z.boolean().optional(),
  }),
};
export const emailSenderUpdateSchema = {
  body: z.object({
    fromName: z.string().min(1).max(120).optional(),
    replyTo: emailAddr.optional().nullable(),
    dkimSelector: z.string().max(120).optional().nullable(),
    hourlyCap: z.number().int().min(0).optional().nullable(),
    dailyCap: z.number().int().min(0).optional().nullable(),
    warmupDay: z.number().int().min(0).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
};

// ---- Templates --------------------------------------------------------------
const templateCategory = z.enum([
  'MARKETING',
  'TRANSACTIONAL',
  'NOTIFICATION',
  'NEWSLETTER',
  'ANNOUNCEMENT',
  'OTHER',
]);
const templateStatus = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const emailTemplateCreateSchema = {
  body: z.object({
    name: z.string().min(1).max(160),
    subject: z.string().min(1).max(300),
    htmlBody: z.string().min(1),
    textBody: z.string().optional().nullable(),
    preheader: z.string().max(300).optional().nullable(),
    category: templateCategory.optional(),
    status: templateStatus.optional(),
    variables: z.any().optional(),
    variableSample: z.any().optional(),
    footerSnippetId: z.string().optional().nullable(),
  }),
};
export const emailTemplateUpdateSchema = {
  body: z.object({
    name: z.string().min(1).max(160).optional(),
    subject: z.string().min(1).max(300).optional(),
    htmlBody: z.string().min(1).optional(),
    textBody: z.string().optional().nullable(),
    preheader: z.string().max(300).optional().nullable(),
    category: templateCategory.optional(),
    status: templateStatus.optional(),
    variables: z.any().optional(),
    variableSample: z.any().optional(),
    footerSnippetId: z.string().optional().nullable(),
  }),
};
export const emailPreviewSchema = {
  body: z.object({
    subject: z.string(),
    htmlBody: z.string(),
    textBody: z.string().optional().nullable(),
    preheader: z.string().optional().nullable(),
    category: templateCategory.optional(),
    sampleVars: z.record(z.string(), z.any()).optional(),
    to: emailAddr.optional(),
    footerSnippetId: z.string().optional().nullable(),
  }),
};
export const emailTestSendSchema = {
  body: z.object({
    to: emailAddr,
    subject: z.string(),
    htmlBody: z.string(),
    textBody: z.string().optional().nullable(),
    preheader: z.string().optional().nullable(),
    category: templateCategory.optional(),
    sampleVars: z.record(z.string(), z.any()).optional(),
    footerSnippetId: z.string().optional().nullable(),
  }),
};

// ---- Campaigns --------------------------------------------------------------
const audienceType = z.enum(['segment', 'set', 'upload', 'manual', 'platform']);
const campaignType = z.enum(['BROADCAST', 'SEQUENCE']);

const variantSchema = z.object({
  label: z.string().min(1),
  templateId: z.string().optional().nullable(),
  subjectOverride: z.string().optional().nullable(),
  weight: z.number().int().min(1).optional(),
});
const stepSchema = z.object({
  stepOrder: z.number().int().min(0),
  templateId: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  delayHours: z.number().int().min(0).optional(),
  condition: z.enum(['any', 'no_open', 'opened', 'no_click', 'clicked']).optional(),
});

export const emailCampaignCreateSchema = {
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    senderId: z.string().optional(),
    templateId: z.string().optional(),
    subjectOverride: z.string().max(300).optional(),
    fromNameOverride: z.string().max(120).optional().nullable(),
    replyToOverride: z.string().max(200).optional().nullable(),
    utmSource: z.string().max(120).optional().nullable(),
    utmMedium: z.string().max(120).optional().nullable(),
    utmCampaign: z.string().max(120).optional().nullable(),
    utmTerm: z.string().max(120).optional().nullable(),
    utmContent: z.string().max(120).optional().nullable(),
    audienceType,
    audienceFilter: z.any().optional(),
    segmentId: z.string().optional(),
    variableMapping: z.any().optional(),
    attachments: attachmentsField,
    scheduledAt: z.string().optional(),
    sendTimezone: z.string().max(64).optional().nullable(),
    batchSize: z.number().int().min(1).max(5000).optional(),
    sendRate: z.number().int().min(1).max(200).optional(),
    type: campaignType.optional(),
    steps: z.array(stepSchema).optional(),
    isAbTest: z.boolean().optional(),
    variants: z.array(variantSchema).optional(),
    recurrenceDays: z.number().int().min(0).optional().nullable(),
  }),
};
export const emailCampaignUpdateSchema = {
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    senderId: z.string().optional(),
    templateId: z.string().optional().nullable(),
    subjectOverride: z.string().max(300).optional().nullable(),
    fromNameOverride: z.string().max(120).optional().nullable(),
    replyToOverride: z.string().max(200).optional().nullable(),
    utmSource: z.string().max(120).optional().nullable(),
    utmMedium: z.string().max(120).optional().nullable(),
    utmCampaign: z.string().max(120).optional().nullable(),
    utmTerm: z.string().max(120).optional().nullable(),
    utmContent: z.string().max(120).optional().nullable(),
    scheduledAt: z.string().optional().nullable(),
    sendTimezone: z.string().max(64).optional().nullable(),
    batchSize: z.number().int().min(1).max(5000).optional(),
    sendRate: z.number().int().min(1).max(200).optional(),
    recurrenceDays: z.number().int().min(0).optional().nullable(),
    segmentId: z.string().optional(),
    audienceType: audienceType.optional(),
    audienceFilter: z.any().optional(),
    variableMapping: z.any().optional(),
    attachments: attachmentsField,
  }),
};
export const emailCampaignVariantsSchema = { body: z.object({ variants: z.array(variantSchema) }) };
export const emailCampaignStepsSchema = { body: z.object({ steps: z.array(stepSchema) }) };
export const emailCampaignTestSendSchema = { body: z.object({ to: emailAddr }) };
export const emailSaveAsBlueprintSchema = { body: z.object({ name: z.string().min(1).max(200) }) };
export const emailUseBlueprintSchema = {
  body: z.object({ name: z.string().min(1).max(200).optional() }),
};

// ---- Contacts ---------------------------------------------------------------
const subscribeStatus = z.enum(['SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'CLEANED', 'UNKNOWN']);
export const emailContactCreateSchema = {
  body: z.object({
    email: emailAddr,
    name: z.string().max(200).optional().nullable(),
    tags: z.array(z.string()).optional(),
    attributes: z.record(z.string(), z.any()).optional(),
    subscribeStatus: subscribeStatus.optional(),
    subscribeSource: z.string().optional().nullable(),
  }),
};
export const emailContactUpdateSchema = {
  body: z.object({
    name: z.string().max(200).optional().nullable(),
    tags: z.array(z.string()).optional(),
    attributes: z.record(z.string(), z.any()).optional(),
    subscribeStatus: subscribeStatus.optional(),
    isBlocked: z.boolean().optional(),
  }),
};
export const emailImportSchema = {
  body: z.object({
    csv: z.string().min(1),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    subscribeStatus: z
      .enum(['SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'CLEANED', 'UNKNOWN'])
      .optional(),
    doubleOptIn: z.boolean().optional(),
    mapping: z
      .object({
        email: z.string().optional(),
        name: z.string().optional(),
        tags: z.string().optional(),
      })
      .optional(),
  }),
};
export const emailBulkTagSchema = {
  body: z.object({
    contactIds: z.array(z.string()).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
  }),
};

// ---- Segments / suppression -------------------------------------------------
export const emailSegmentSchema = {
  body: z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(500).optional().nullable(),
    filter: z.any(),
  }),
};
export const emailSuppressionSchema = {
  body: z.object({ email: emailAddr, reason: z.string().max(200).optional().nullable() }),
};

// ---- Settings ---------------------------------------------------------------
export const emailSettingsSchema = {
  body: z.object({
    businessHours: z.any().optional(),
    awayMessage: z.string().optional().nullable(),
    welcomeMessage: z.string().optional().nullable(),
    autoReplyEnabled: z.boolean().optional(),
    awayMode: z.boolean().optional(),
    marketingCapPer24h: z.number().int().min(0).optional(),
    retentionDays: z.number().int().min(0).optional().nullable(),
    unsubscribeKeywords: z.array(z.string()).optional(),
    footerAddress: z.string().max(500).optional().nullable(),
    footerHtml: z.string().optional().nullable(),
    defaultFromName: z.string().max(120).optional().nullable(),
    // Accept '' from a cleared input and coerce it to null.
    defaultReplyTo: z
      .union([emailAddr, z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .optional()
      .nullable(),
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    warmupSchedule: z.any().optional(),
    seedAddresses: z.array(emailAddr).optional(),
    // MUST be declared here: `validate()` runs `.parse()`, which STRIPS
    // undeclared keys — an omitted field would be silently removed before the
    // controller ever saw it, leaving the optimistic check permanently inert.
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  }),
};

// ---- Inbox ------------------------------------------------------------------
export const emailReplySchema = {
  body: z.object({
    subject: z.string().max(300).optional(),
    body: z.string().min(1),
    html: z.string().optional(),
    attachments: attachmentsField,
  }),
};
export const emailScheduleReplySchema = {
  body: z.object({
    subject: z.string().max(300).optional(),
    body: z.string().min(1),
    html: z.string().optional(),
    attachments: attachmentsField,
    sendAt: z.string().datetime(),
  }),
};
export const emailThreadStatusSchema = {
  body: z.object({ status: z.enum(['OPEN', 'PENDING', 'RESOLVED']) }),
};
export const emailThreadLabelsSchema = { body: z.object({ labels: z.array(z.string()) }) };
export const emailThreadAssignSchema = { body: z.object({ userId: z.string().nullable() }) };
export const emailThreadSnoozeSchema = {
  body: z.object({ until: z.string().datetime().nullable() }),
};
export const emailThreadArchiveSchema = { body: z.object({ archived: z.boolean() }) };
export const emailNoteSchema = { body: z.object({ body: z.string().min(1).max(4000) }) };

export const emailSnippetSchema = {
  body: z.object({
    name: z.string().min(1).max(160),
    category: z.string().max(60).optional().nullable(),
    html: z.string().min(1),
  }),
};
export const emailSnippetUpdateSchema = {
  body: z.object({
    name: z.string().min(1).max(160).optional(),
    category: z.string().max(60).optional().nullable(),
    html: z.string().min(1).optional(),
  }),
};

export const emailCannedReplySchema = {
  body: z.object({
    title: z.string().min(1).max(160),
    subject: z.string().max(300).optional().nullable(),
    body: z.string().min(1),
    shortcut: z.string().max(60).optional().nullable(),
  }),
};
export const emailRuleSchema = {
  body: z.object({
    name: z.string().min(1).max(160),
    enabled: z.boolean().optional(),
    matchType: z.enum(['contains', 'equals', 'regex', 'starts_with']).optional(),
    keywords: z.array(z.string()).optional(),
    matchSubject: z.boolean().optional(),
    matchBody: z.boolean().optional(),
    action: z.enum(['auto_reply', 'label', 'assign', 'resolve']).optional(),
    replyBody: z.string().optional().nullable(),
    label: z.string().optional().nullable(),
    assignTo: z.string().optional().nullable(),
    priority: z.number().int().optional(),
  }),
};

// ---- One-on-one mailbox (webmail client) -----------------------------------

const mailAccountBase = {
  name: z.string().min(1).max(120),
  email: emailAddr,
  imapHost: z.string().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().min(1).max(255),
  imapPass: z.string().min(1).max(1024).optional(),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().min(1).max(255),
  smtpPass: z.string().min(1).max(1024).optional(),
  signature: z.string().max(20000).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  isDefault: z.boolean().optional(),
};

export const emailAccountCreateSchema = { body: z.object(mailAccountBase) };
export const emailAccountUpdateSchema = { body: z.object(mailAccountBase).partial() };
export const emailAccountTestSchema = {
  body: z.object({
    id: z.string().optional(),
    imapHost: z.string().min(1).max(255),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapSecure: z.boolean().optional(),
    imapUser: z.string().min(1).max(255),
    imapPass: z.string().max(1024).optional(),
    smtpHost: z.string().min(1).max(255),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().min(1).max(255),
    smtpPass: z.string().max(1024).optional(),
    name: z.string().max(120).optional(),
    email: z.string().max(255).optional(),
  }),
};

const mailComposeBase = {
  to: z.array(z.string().min(1).max(320)).max(100).optional(),
  cc: z.array(z.string().min(1).max(320)).max(100).optional(),
  bcc: z.array(z.string().min(1).max(320)).max(100).optional(),
  subject: z.string().max(2000).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  inReplyTo: z.string().max(1000).optional().nullable(),
  references: z.array(z.string().max(1000)).max(100).optional(),
  attachments: z
    .array(
      z.object({
        key: z.string().min(1),
        filename: z.string().min(1).max(255),
        mime: z.string().max(255).optional(),
      })
    )
    .max(25)
    .optional(),
};

export const emailMailboxSendSchema = {
  body: z.object({ ...mailComposeBase, replaceUid: z.number().int().optional() }),
};
export const emailMailboxDraftSchema = {
  body: z.object({ ...mailComposeBase, replaceUid: z.number().int().optional() }),
};

export const emailMailboxFlagsSchema = {
  body: z.object({
    folder: z.string().min(1),
    uids: z.array(z.number().int()).min(1).max(500),
    add: z.array(z.string().max(64)).max(20).optional(),
    remove: z.array(z.string().max(64)).max(20).optional(),
  }),
};
export const emailMailboxMoveSchema = {
  body: z.object({
    folder: z.string().min(1),
    uids: z.array(z.number().int()).min(1).max(500),
    target: z.string().min(1).max(255),
  }),
};
export const emailMailboxDeleteSchema = {
  body: z.object({
    folder: z.string().min(1),
    uids: z.array(z.number().int()).min(1).max(500),
    permanent: z.boolean().optional(),
  }),
};
export const emailMailboxForwardSchema = {
  body: z.object({ folder: z.string().min(1), uid: z.number().int() }),
};
export const emailFolderCreateSchema = { body: z.object({ path: z.string().min(1).max(255) }) };
export const emailFolderRenameSchema = {
  body: z.object({ path: z.string().min(1), newPath: z.string().min(1).max(255) }),
};
export const emailFolderDeleteSchema = { body: z.object({ path: z.string().min(1) }) };

// ---- Contact sets, structured import & bulk ops ----------------------------

const audienceFilterSchema = z
  .object({
    tags: z.array(z.string()).optional(),
    tag: z.string().optional(),
    subscribeStatus: z.string().optional(),
    onPlatform: z.boolean().optional(),
    roles: z.array(z.string()).optional(),
    verifiedOnly: z.boolean().optional(),
    userIds: z.array(z.string()).optional(),
    emails: z.array(z.string()).optional(),
    contactIds: z.array(z.string()).optional(),
    setId: z.string().optional(),
    openedSince: z.string().optional(),
    clickedSince: z.string().optional(),
    notEmailedSince: z.string().optional(),
    maxBounceCount: z.number().int().optional(),
  })
  .partial();

export const emailImportRowsSchema = {
  body: z.object({
    rows: z
      .array(
        z.object({
          email: z.string(),
          name: z.string().optional().nullable(),
          tags: z.array(z.string()).optional(),
        })
      )
      .max(20000),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    subscribeStatus: z.string().optional(),
  }),
};

export const emailBulkUpdateSchema = {
  body: z.object({
    contactIds: z.array(z.string()).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
    subscribeStatus: z.string().optional(),
    isBlocked: z.boolean().optional(),
  }),
};

export const emailBulkDeleteSchema = {
  body: z.object({
    contactIds: z.array(z.string()).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  }),
};

export const emailSetSchema = {
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
  }),
};

export const emailSetMembersSchema = {
  body: z.object({ contactIds: z.array(z.string()).min(1).max(20000) }),
};

export const emailSetAudienceSchema = {
  body: z.object({
    audienceType: z.string(),
    audienceFilter: audienceFilterSchema.optional().nullable(),
    segmentId: z.string().optional().nullable(),
    setId: z.string().optional().nullable(),
  }),
};

export const emailSetBulkDeleteSchema = {
  body: z.object({ ids: z.array(z.string()).min(1).max(1000) }),
};

// ---- Bulk actions (threads / campaigns / templates / suppression / unsubscribe)

const idsOrFilter = {
  ids: z.array(z.string()).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
};

export const emailThreadBulkSchema = {
  body: z.object({
    ...idsOrFilter,
    action: z.enum([
      'read',
      'unread',
      'assign',
      'status',
      'archive',
      'unarchive',
      'snooze',
      'addLabels',
      'removeLabels',
    ]),
    userId: z.string().nullable().optional(),
    status: z.enum(['OPEN', 'PENDING', 'RESOLVED']).optional(),
    until: z.string().datetime().nullable().optional(),
    labels: z.array(z.string()).optional(),
  }),
};

export const emailCampaignBulkSchema = {
  body: z.object({
    ids: z.array(z.string()).min(1).max(1000),
    action: z.enum(['delete', 'pause', 'cancel', 'resume', 'duplicate', 'archive', 'unarchive']),
  }),
};

export const emailCampaignArchiveSchema = {
  body: z.object({ archived: z.boolean() }),
};

export const emailTemplateBulkDeleteSchema = {
  body: z.object({ ids: z.array(z.string()).min(1).max(1000) }),
};

export const emailTemplateBulkStatusSchema = {
  body: z.object({
    ids: z.array(z.string()).min(1).max(1000),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  }),
};

export const emailTemplateBulkDuplicateSchema = {
  body: z.object({ ids: z.array(z.string()).min(1).max(200) }),
};

export const emailSuppressionImportSchema = {
  body: z.object({
    rows: z
      .array(z.object({ email: z.string(), reason: z.string().max(200).optional().nullable() }))
      .min(1)
      .max(50000),
  }),
};

export const emailSuppressionBulkDeleteSchema = {
  body: z.object(idsOrFilter),
};

export const emailUnsubscribeBulkSchema = {
  body: z.object(idsOrFilter),
};
