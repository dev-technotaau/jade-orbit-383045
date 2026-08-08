import { z } from 'zod';
import { WaConversationStatus, WaTemplateCategory, WaOptInStatus, Role } from '@prisma/client';

export const waSendMessageSchema = z.object({
  body: z.object({
    text: z.string().min(1).max(4096),
  }),
});

export const waAssignSchema = z.object({
  body: z.object({
    assignedTo: z.string().uuid().nullable().optional(),
  }),
});

export const waStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(WaConversationStatus),
  }),
});

export const waCreateTemplateSchema = z.object({
  body: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
      .max(512),
    language: z.string().min(2).max(10),
    category: z.nativeEnum(WaTemplateCategory),

    components: z.array(z.any()).min(1),

    variableSample: z.any().optional(),
  }),
});

const templateSendBody = {
  templateId: z.string().uuid(),
  bodyParams: z.array(z.string()).optional(),
  bodyNamedParams: z.array(z.object({ name: z.string(), text: z.string() })).optional(),
  headerText: z.string().optional(),
  headerImageId: z.string().optional(),
  headerMediaUrl: z.string().url().optional(),
  headerMediaType: z.enum(['image', 'video', 'document']).optional(),
  buttonUrlParam: z.string().optional(),
};

export const waSendTemplateSchema = z.object({
  body: z.object(templateSendBody),
});

export const waStartConversationSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    ...templateSendBody,
  }),
});

export const waUpdateContactSchema = z.object({
  body: z.object({
    name: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().max(40)).max(50).optional(),
    isBlocked: z.boolean().optional(),
    optInStatus: z.nativeEnum(WaOptInStatus).optional(),
  }),
});

export const waImportContactsSchema = z.object({
  body: z.object({
    optIn: z.boolean().optional(),
    contacts: z
      .array(
        z.object({
          phone: z.string().min(8).max(20),
          name: z.string().max(120).optional(),
          tags: z.array(z.string().max(40)).optional(),
        })
      )
      .min(1)
      .max(5000),
  }),
});

export const waCannedReplySchema = z.object({
  body: z.object({
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(4096),
  }),
});

export const waInteractiveSchema = z.object({
  body: z.object({
    kind: z.enum(['button', 'list', 'cta_url', 'flow']),
    bodyText: z.string().min(1).max(1024),
    flowId: z.string().max(256).optional(),
    flowCta: z.string().max(64).optional(),
    flowToken: z.string().max(256).optional(),
    buttons: z
      .array(z.object({ id: z.string().max(256), title: z.string().min(1).max(20) }))
      .max(3)
      .optional(),
    listButton: z.string().max(20).optional(),
    sections: z
      .array(
        z.object({
          title: z.string().max(24).optional(),
          rows: z.array(
            z.object({
              id: z.string().max(200),
              title: z.string().min(1).max(24),
              description: z.string().max(72).optional(),
            })
          ),
        })
      )
      .optional(),
    ctaText: z.string().max(20).optional(),
    ctaUrl: z.string().url().optional(),
  }),
});

const sequenceStep = z.object({
  stepOrder: z.number().int(),
  templateId: z.string().uuid(),
  delayHours: z.number().int().min(0),
  condition: z.enum(['any', 'no_reply', 'replied']).optional(),
});

/** A/B-test campaign variant: a labelled template with an optional weight. */
const campaignVariant = z.object({
  label: z.string().min(1).max(80),
  templateId: z.string().uuid(),
  weight: z.number().int().min(1).max(100).optional(),
});

export const waCreateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    templateId: z.string().uuid(),
    audienceType: z.enum(['segment', 'upload', 'manual']),

    audienceFilter: z.any().optional(),
    variableMapping: z.array(z.string()).optional(),
    scheduledAt: z.string().datetime().optional(),
    batchSize: z.number().int().min(1).max(1000).optional(),
    throttlePerSec: z.number().int().min(1).max(80).optional(),
    type: z.enum(['BROADCAST', 'SEQUENCE']).optional(),
    steps: z.array(sequenceStep).optional(),
    isAbTest: z.boolean().optional(),
    variants: z.array(campaignVariant).optional(),
    recurrenceDays: z.number().int().min(1).max(365).nullable().optional(),
    // When set, the campaign's audience is sourced from a saved segment's filter.
    segmentId: z.string().uuid().optional(),
  }),
});

/** Edit a DRAFT/SCHEDULED campaign (all fields optional; scheduledAt=reschedule). */
export const waUpdateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    templateId: z.string().uuid().optional(),
    audienceType: z.enum(['segment', 'upload', 'manual']).optional(),
    audienceFilter: z.any().optional(),
    variableMapping: z.array(z.string()).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    batchSize: z.number().int().min(1).max(1000).optional(),
    throttlePerSec: z.number().int().min(1).max(80).optional(),
    recurrenceDays: z.number().int().min(1).max(365).nullable().optional(),
    segmentId: z.string().uuid().optional(),
  }),
});

/** Send one rendered template message to a reviewer's phone (test-send). */
export const waTestSendSchema = z.object({
  body: z.object({ phone: z.string().min(8).max(20) }),
});

/** Save a campaign as a reusable blueprint. */
export const waSaveAsTemplateSchema = z.object({
  body: z.object({ name: z.string().min(1).max(120).optional() }),
});

/** Create a new campaign from a saved blueprint. */
export const waUseTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    scheduledAt: z.string().datetime().optional(),
  }),
});

/** Set/replace the A/B-test variants on a campaign. */
export const waCampaignVariantsSchema = z.object({
  body: z.object({
    variants: z.array(campaignVariant).min(1),
  }),
});

/** Create a tracked short link (campaign click-through). */
export const waShortLinkSchema = z.object({
  body: z.object({
    targetUrl: z.string().url(),
  }),
});

/** Schedule a send-later message (text or template) on a conversation. */
export const waScheduledMessageSchema = z.object({
  body: z.object({
    kind: z.enum(['text', 'template']),
    text: z.string().min(1).max(4096).optional(),
    templateId: z.string().uuid().optional(),
    bodyParams: z.array(z.string()).optional(),
    sendAt: z.string().datetime(),
  }),
});

/** React to a message with an emoji. */
export const waReactionSchema = z.object({
  body: z.object({
    wamid: z.string().min(1),
    emoji: z.string().min(1),
  }),
});

/** Archive / unarchive a conversation. */
export const waArchiveSchema = z.object({
  body: z.object({
    archived: z.boolean().optional(),
  }),
});

// Bulk selection: EITHER an explicit id list OR allMatching (acts on every row
// matching the accompanying filters — "select all N matching").
const bulkSelection = {
  ids: z.array(z.string().uuid()).max(20000).optional(),
  allMatching: z.boolean().optional(),
};

/** Bulk action over many conversations. */
export const waBulkConversationsSchema = z.object({
  body: z.object({
    action: z.enum([
      'archive',
      'unarchive',
      'resolve',
      'open',
      'pending',
      'markRead',
      'snooze',
      'unsnooze',
      'assign',
      'addLabel',
    ]),
    ...bulkSelection,
    filters: z
      .object({
        status: z.nativeEnum(WaConversationStatus).optional(),
        assignedTo: z.string().uuid().optional(),
        q: z.string().optional(),
        unreadOnly: z.boolean().optional(),
        onPlatform: z.boolean().optional(),
        searchMessages: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
      })
      .optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    label: z.string().max(40).optional(),
  }),
});

/** Bulk action over many contacts. */
export const waBulkContactsSchema = z.object({
  body: z.object({
    action: z.enum([
      'tag',
      'untag',
      'optIn',
      'optOut',
      'block',
      'unblock',
      'addSuppression',
      'erase',
    ]),
    ...bulkSelection,
    filters: z
      .object({
        optInStatus: z.nativeEnum(WaOptInStatus).optional(),
        tag: z.string().optional(),
        blocked: z.boolean().optional(),
        onPlatform: z.boolean().optional(),
        role: z.nativeEnum(Role).optional(),
        q: z.string().optional(),
      })
      .optional(),
    tag: z.string().max(40).optional(),
  }),
});

export const waSettingsSchema = z.object({
  body: z.object({
    businessHours: z.any().optional(),
    awayMessage: z.string().nullable().optional(),
    welcomeMessage: z.string().nullable().optional(),
    autoReplyEnabled: z.boolean().optional(),
    awayMode: z.boolean().optional(),
    marketingCapPer24h: z.number().int().optional(),
    retentionDays: z.number().int().nullable().optional(),
    optOutKeywords: z.array(z.string()).optional(),
    faqMenuEnabled: z.boolean().optional(),
    faqTriggerKeywords: z.array(z.string()).optional(),
  }),
});

export const waKeywordRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    match: z.string().min(1).max(200),
    matchType: z.enum(['exact', 'contains', 'starts']).optional(),
    replyText: z.string().nullable().optional(),
    replyTemplateId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().optional(),
  }),
});

export const waNoteSchema = z.object({
  body: z.object({
    body: z.string().min(1).max(4096),
  }),
});

export const waLabelsSchema = z.object({
  body: z.object({
    labels: z.array(z.string().max(40)).max(20),
  }),
});

export const waSnoozeSchema = z.object({
  body: z.object({
    snoozedUntil: z.string().datetime().nullable().optional(),
  }),
});

export const waSequenceStepsSchema = z.object({
  body: z.object({
    steps: z.array(sequenceStep),
  }),
});

/** Add a phone to the campaign suppression (do-not-contact) list. */
export const waSuppressionSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    reason: z.string().max(500).optional(),
  }),
});

/** Create a saved audience segment (named, reusable audience filter). */
export const waSegmentSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    // Free-form audience filter: { tags?, optInStatus?, onPlatform? }.
    filter: z.record(z.string(), z.unknown()),
  }),
});

/** Record a conversion attributed to a campaign / contact. */
export const waConversionSchema = z.object({
  body: z.object({
    campaignId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    valuePaise: z.number().int().optional(),
    note: z.string().max(1000).optional(),
  }),
});
