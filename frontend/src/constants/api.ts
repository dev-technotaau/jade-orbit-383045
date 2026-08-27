/**
 * Backend endpoint paths.
 *
 * Pruned to what this module calls. The host platform carried 488 keys across
 * 24 groups (jobs, candidates, employers, admin, billing, tickets, search,
 * verifications, webhooks, the email system…); 393 of them addressed endpoints
 * that no longer exist on this backend.
 *
 * `SUPER_ADMIN` keeps its name only because 111 call sites spell it that way —
 * there are no roles here, and every route under it is gated by the single app
 * password (see backend/src/middleware/app-password.ts).
 */
export const API = {
  SUPER_ADMIN: {
    WA_CHANNELS: '/whatsapp/channels',
    WA_CONVERSATIONS: '/whatsapp/conversations',
    WA_CONVERSATIONS_BULK: '/whatsapp/conversations/bulk',
    WA_UNREAD_TOTAL: '/whatsapp/unread-total',
    WA_CONVERSATION: (id: string) => `/whatsapp/conversations/${id}`,
    WA_MESSAGES: (id: string) => `/whatsapp/conversations/${id}/messages`,
    WA_MESSAGES_DELETE: (id: string) => `/whatsapp/conversations/${id}/messages/delete`,
    WA_READ: (id: string) => `/whatsapp/conversations/${id}/read`,
    /** Put a triaged thread back in the unread queue. Local state only. */
    WA_UNREAD: (id: string) => `/whatsapp/conversations/${id}/unread`,
    // "typing…" on the customer's phone while an agent composes a reply.
    WA_TYPING: (id: string) => `/whatsapp/conversations/${id}/typing`,
    // Dismiss Meta's "this customer's identity changed" warning on a thread.
    WA_IDENTITY_ACK: (id: string) => `/whatsapp/conversations/${id}/identity-ack`,
    WA_ASSIGN: (id: string) => `/whatsapp/conversations/${id}/assign`,
    WA_STATUS: (id: string) => `/whatsapp/conversations/${id}/status`,
    WA_MEDIA: (id: string) => `/whatsapp/media/${id}`,
    // Stage a file at Meta and get its media id back WITHOUT sending it — the
    // reusable id a media-header template send takes instead of a public URL.
    WA_MEDIA_UPLOAD: '/whatsapp/media',
    // Inbound files whose archive gave up, and the re-enqueue for one. Only
    // useful inside Meta's ~30-day window, which the list says per row.
    WA_MEDIA_FAILED: '/whatsapp/media/failed',
    WA_MEDIA_RETRY: (messageId: string) => `/whatsapp/media/failed/${messageId}/retry`,
    // Signed URL for a direct-to-storage PUT, so an attachment larger than the
    // BFF proxy's body limit never has to travel through it.
    WA_UPLOAD_SIGN: '/whatsapp/uploads/sign',
    WA_SEND_MEDIA: (id: string) => `/whatsapp/conversations/${id}/media`,
    // Same path as WA_SEND_MEDIA, read side (GET) — every media message in the
    // conversation, not just the ones in the loaded thread page.
    WA_CONV_MEDIA: (id: string) => `/whatsapp/conversations/${id}/media`,
    WA_TEMPLATES: '/whatsapp/templates',
    WA_TEMPLATE: (id: string) => `/whatsapp/templates/${id}`,
    WA_TEMPLATE_SYNC: '/whatsapp/templates/sync',
    WA_TEMPLATE_DRAFT: '/whatsapp/templates/draft',
    WA_TEMPLATE_SUBMIT: (id: string) => `/whatsapp/templates/${id}/submit`,
    WA_TEMPLATE_LIBRARY: '/whatsapp/templates/library',
    WA_TEMPLATE_MEDIA_HANDLE: '/whatsapp/templates/media-handle',
    WA_TEMPLATE_ANALYTICS: (id: string) => `/whatsapp/templates/${id}/analytics`,
    // Re-read ONE template's status from Meta (the page-level sync walks the
    // whole WABA, which is far too much work to check on one submission).
    WA_TEMPLATE_REFRESH: (id: string) => `/whatsapp/templates/${id}/refresh`,
    WA_START_CONVERSATION: '/whatsapp/conversations',
    WA_SEND_TEMPLATE: (id: string) => `/whatsapp/conversations/${id}/template`,
    WA_CONTACTS: '/whatsapp/contacts',
    WA_CONTACTS_BULK: '/whatsapp/contacts/bulk',
    WA_CONTACT: (id: string) => `/whatsapp/contacts/${id}`,
    WA_CONTACT_IMPORT: '/whatsapp/contacts/import',
    // Progress of a queued import, polled by the import modal.
    WA_CONTACT_IMPORT_JOB: (jobId: string) => `/whatsapp/contacts/import/${jobId}`,
    WA_CONTACT_DUPLICATES: '/whatsapp/contacts/duplicates',
    WA_CONTACT_MERGE: (id: string) => `/whatsapp/contacts/${id}/merge`,
    WA_CAMPAIGNS: '/whatsapp/campaigns',
    WA_CAMPAIGN: (id: string) => `/whatsapp/campaigns/${id}`,
    WA_CAMPAIGN_PREVIEW: (id: string) => `/whatsapp/campaigns/${id}/preview`,
    /** Size + cost for an audience that has not been saved as a campaign yet. */
    WA_CAMPAIGN_PREVIEW_AUDIENCE: '/whatsapp/campaigns/preview-audience',
    WA_CAMPAIGN_PREFLIGHT: (id: string) => `/whatsapp/campaigns/${id}/preflight`,
    WA_CAMPAIGN_RECIPIENTS: (id: string) => `/whatsapp/campaigns/${id}/recipients`,
    WA_CAMPAIGN_LAUNCH: (id: string) => `/whatsapp/campaigns/${id}/launch`,
    WA_CAMPAIGN_PAUSE: (id: string) => `/whatsapp/campaigns/${id}/pause`,
    WA_CAMPAIGN_RESUME: (id: string) => `/whatsapp/campaigns/${id}/resume`,
    WA_CAMPAIGN_CANCEL: (id: string) => `/whatsapp/campaigns/${id}/cancel`,
    WA_CAMPAIGN_RETRY: (id: string) => `/whatsapp/campaigns/${id}/retry-failed`,
    WA_CAMPAIGN_DUPLICATE: (id: string) => `/whatsapp/campaigns/${id}/duplicate`,
    WA_CAMPAIGN_TEST_SEND: (id: string) => `/whatsapp/campaigns/${id}/test-send`,
    WA_CAMPAIGN_SAVE_TEMPLATE: (id: string) => `/whatsapp/campaigns/${id}/save-as-template`,
    WA_CAMPAIGN_TEMPLATES: '/whatsapp/campaign-templates',
    WA_CAMPAIGN_TEMPLATE: (id: string) => `/whatsapp/campaign-templates/${id}`,
    WA_CAMPAIGN_TEMPLATE_USE: (id: string) => `/whatsapp/campaign-templates/${id}/use`,
    WA_ANALYTICS: '/whatsapp/analytics',
    WA_ANALYTICS_TIMESERIES: '/whatsapp/analytics/timeseries',
    WA_ANALYTICS_SLA: '/whatsapp/analytics/sla',
    WA_ANALYTICS_AGENTS: '/whatsapp/analytics/agents',
    WA_ANALYTICS_COST: '/whatsapp/analytics/cost',
    WA_ANALYTICS_OPTOUT: '/whatsapp/analytics/optout',
    WA_ANALYTICS_OPTOUT_SUMMARY: '/whatsapp/analytics/optout-summary',
    WA_ANALYTICS_CLICKS: '/whatsapp/analytics/clicks',
    WA_ANALYTICS_CTWA: '/whatsapp/analytics/ctwa',
    WA_ANALYTICS_CTWA_EXPORT: '/whatsapp/analytics/ctwa/export',
    // Whole-dashboard export (?format=csv|json&days=).
    WA_ANALYTICS_EXPORT: '/whatsapp/analytics/export',
    WA_CANNED_REPLIES: '/whatsapp/canned-replies',
    WA_CANNED_REPLY: (id: string) => `/whatsapp/canned-replies/${id}`,
    WA_FAQS: '/whatsapp/faqs',
    WA_FAQ: (id: string) => `/whatsapp/faqs/${id}`,
    WA_FAQ_REORDER: '/whatsapp/faqs/reorder',
    WA_SEND_INTERACTIVE: (id: string) => `/whatsapp/conversations/${id}/interactive`,
    WA_CHANNEL_SYNC: '/whatsapp/channels/sync',
    // Channel management: edit/rotate token, choose the default sender, and a
    // per-channel connection test against Meta.
    WA_CHANNEL: (id: string) => `/whatsapp/channels/${id}`,
    WA_CHANNEL_DEFAULT: (id: string) => `/whatsapp/channels/${id}/default`,
    WA_CHANNEL_TEST: (id: string) => `/whatsapp/channels/${id}/test`,
    // Number identity: the profile customers see, registration + two-step PIN,
    // and the catalog product messages are addressed against.
    WA_BUSINESS_PROFILE: '/whatsapp/business-profile',
    WA_BUSINESS_PROFILE_PHOTO: '/whatsapp/business-profile/photo',
    WA_CHANNEL_REGISTER: '/whatsapp/channels/register',
    WA_CHANNEL_TWO_STEP_PIN: '/whatsapp/channels/two-step-pin',
    WA_CHANNEL_DEREGISTER: '/whatsapp/channels/deregister',
    WA_COMMERCE_SETTINGS: '/whatsapp/commerce-settings',
    // Ice breakers, the composer command list and Meta's welcome-message hook —
    // what a customer is offered before they have typed anything.
    WA_CONVERSATIONAL_AUTOMATION: '/whatsapp/conversational-automation',
    WA_CONTACTS_EXPORT: '/whatsapp/contacts/export',
    WA_CAMPAIGN_RECIPIENTS_EXPORT: (id: string) => `/whatsapp/campaigns/${id}/recipients/export`,
    WA_SETTINGS: '/whatsapp/settings',
    // Audit trail (read-only — there is no write endpoint by design).
    WA_AUDIT: '/whatsapp/audit',
    WA_AUDIT_STATS: '/whatsapp/audit/stats',
    WA_AUDIT_FACETS: '/whatsapp/audit/facets',
    WA_AUDIT_VERIFY: '/whatsapp/audit/verify',
    WA_AUDIT_EXPORT: '/whatsapp/audit/export',
    WA_AUDIT_ENTRY: (id: string) => `/whatsapp/audit/${id}`,
    // ── Email system (super-admin bulk/marketing) ──
    WA_KEYWORD_RULES: '/whatsapp/keyword-rules',
    // Conversational bot flows — the stateful automation the keyword rules above
    // cannot express (multi-step capture, branching menus, handoff).
    WA_BOT_FLOWS: '/whatsapp/bot-flows',
    WA_BOT_FLOW: (id: string) => `/whatsapp/bot-flows/${id}`,
    WA_BOT_FLOW_STEPS: (id: string) => `/whatsapp/bot-flows/${id}/steps`,
    WA_BOT_FLOW_STEP: (id: string, stepId: string) => `/whatsapp/bot-flows/${id}/steps/${stepId}`,
    WA_KEYWORD_RULE: (id: string) => `/whatsapp/keyword-rules/${id}`,
    WA_NOTES: (id: string) => `/whatsapp/conversations/${id}/notes`,
    WA_NOTE: (id: string, noteId: string) => `/whatsapp/conversations/${id}/notes/${noteId}`,
    WA_LABELS: (id: string) => `/whatsapp/conversations/${id}/labels`,
    WA_SNOOZE: (id: string) => `/whatsapp/conversations/${id}/snooze`,
    WA_BOT_PAUSE: (id: string) => `/whatsapp/conversations/${id}/bot-pause`,
    WA_CAMPAIGN_STEPS: (id: string) => `/whatsapp/campaigns/${id}/steps`,
    WA_CONTACT_DATA_EXPORT: (id: string) => `/whatsapp/contacts/${id}/export`,
    WA_CONTACT_ERASE: (id: string) => `/whatsapp/contacts/${id}`,
    WA_AGENTS: '/whatsapp/agents',
    // ── P3: A/B variants, short links, transcripts, CSAT, scheduling, advanced analytics ──
    WA_CAMPAIGN_VARIANTS: (id: string) => `/whatsapp/campaigns/${id}/variants`,
    WA_CAMPAIGN_AB_TEST: (id: string) => `/whatsapp/campaigns/${id}/ab-test`,
    WA_CAMPAIGN_AB_WINNER: (id: string) => `/whatsapp/campaigns/${id}/ab-test/winner`,
    WA_CAMPAIGN_AB_REMAINDER: (id: string) => `/whatsapp/campaigns/${id}/ab-test/remainder`,
    WA_CAMPAIGN_LINKS: (id: string) => `/whatsapp/campaigns/${id}/links`,
    WA_CAMPAIGN_CLICKS: (id: string) => `/whatsapp/campaigns/${id}/clicks`,
    WA_CONV_TRANSCRIPT: (id: string) => `/whatsapp/conversations/${id}/transcript`,
    WA_CONV_CSAT: (id: string) => `/whatsapp/conversations/${id}/csat`,
    WA_CONV_ARCHIVE: (id: string) => `/whatsapp/conversations/${id}/archive`,
    WA_CONV_PIN: (id: string) => `/whatsapp/conversations/${id}/pin`,
    WA_CONV_MUTE: (id: string) => `/whatsapp/conversations/${id}/mute`,
    WA_CONV_FORWARD: (id: string) => `/whatsapp/conversations/${id}/forward`,
    WA_MESSAGES_SEARCH: (id: string) => `/whatsapp/conversations/${id}/messages/search`,
    WA_MSG_STAR: (id: string, messageId: string) =>
      `/whatsapp/conversations/${id}/messages/${messageId}/star`,
    WA_CONV_CLEAR: (id: string) => `/whatsapp/conversations/${id}/clear`,
    WA_CONV_REACTION: (id: string) => `/whatsapp/conversations/${id}/reaction`,
    WA_CONV_LOCATION: (id: string) => `/whatsapp/conversations/${id}/location`,
    WA_CONV_CONTACTS: (id: string) => `/whatsapp/conversations/${id}/contacts`,
    WA_CONV_SCHEDULED: (id: string) => `/whatsapp/conversations/${id}/scheduled`,
    WA_CONV_SCHEDULED_ITEM: (id: string, msgId: string) =>
      `/whatsapp/conversations/${id}/scheduled/${msgId}`,
    // Every scheduled message across conversations. The per-conversation list
    // above is the panel inside a thread; this is the queue as a whole.
    WA_SCHEDULED: '/whatsapp/scheduled',
    WA_ANALYTICS_HEATMAP: '/whatsapp/analytics/heatmap',
    WA_ANALYTICS_KEYWORDS: '/whatsapp/analytics/keywords',
    WA_ANALYTICS_HEALTH_HISTORY: '/whatsapp/analytics/health-history',
    // Per-audience reporting: saved segments compared side by side (?days,
    // ?channelId) and contacts followed by acquisition month (?months).
    WA_ANALYTICS_SEGMENTS: '/whatsapp/analytics/segments',
    WA_ANALYTICS_COHORTS: '/whatsapp/analytics/cohorts',
    WA_ANALYTICS_CSAT: '/whatsapp/analytics/csat',
    WA_ANALYTICS_META: '/whatsapp/analytics/meta',
    WA_SUPPRESSIONS: '/whatsapp/suppressions',
    WA_SUPPRESSIONS_IMPORT: '/whatsapp/suppressions/import',
    WA_SUPPRESSIONS_EXPORT: '/whatsapp/suppressions/export',
    WA_SUPPRESSION: (id: string) => `/whatsapp/suppressions/${id}`,
    WA_SEGMENTS: '/whatsapp/segments',
    WA_FLOWS: '/whatsapp/flows',
    WA_FLOWS_SYNC: '/whatsapp/flows/sync',
    WA_FLOW_RESPONSES: '/whatsapp/flows/responses',
    WA_FLOW: (id: string) => `/whatsapp/flows/${id}`,
    WA_FLOW_JSON: (id: string) => `/whatsapp/flows/${id}/json`,
    WA_FLOW_PUBLISH: (id: string) => `/whatsapp/flows/${id}/publish`,
    WA_FLOW_DEPRECATE: (id: string) => `/whatsapp/flows/${id}/deprecate`,
    WA_FLOW_PREVIEW: (id: string) => `/whatsapp/flows/${id}/preview`,
    WA_WEBHOOKS: '/whatsapp/webhooks',
    WA_WEBHOOK: (id: string) => `/whatsapp/webhooks/${id}`,
    WA_WEBHOOK_DELIVERIES: (id: string) => `/whatsapp/webhooks/${id}/deliveries`,
    WA_WEBHOOK_TEST: (id: string) => `/whatsapp/webhooks/${id}/test`,
    WA_WEBHOOK_DELIVERY_REPLAY: (id: string, deliveryId: string) =>
      `/whatsapp/webhooks/${id}/deliveries/${deliveryId}/replay`,
    // Inbound (Meta → us) webhook health + raw-event inspection. Distinct from
    // the WA_WEBHOOK* keys above, which are the OUTBOUND subscriber CRUD.
    WA_WEBHOOK_HEALTH: '/whatsapp/webhook-health',
    WA_WEBHOOK_EVENTS: '/whatsapp/webhook-events',
    WA_WEBHOOK_EVENT: (id: string) => `/whatsapp/webhook-events/${id}`,
    // Replay a stuck inbound event through the worker (clears its processed
    // state first, otherwise the worker treats it as a duplicate and no-ops).
    WA_WEBHOOK_EVENT_REPROCESS: (id: string) => `/whatsapp/webhook-events/${id}/reprocess`,
    WA_SEGMENT: (id: string) => `/whatsapp/segments/${id}`,
    WA_SEGMENT_COUNT: (id: string) => `/whatsapp/segments/${id}/count`,
    WA_CONVERSIONS: '/whatsapp/conversions',
    WA_CONVERSION: (id: string) => `/whatsapp/conversions/${id}`,
    WA_CAMPAIGN_CONVERSIONS: (id: string) => `/whatsapp/campaigns/${id}/conversions`,
    WA_ANALYTICS_CONVERSIONS: '/whatsapp/analytics/conversions',
  },
} as const;
