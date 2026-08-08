import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type { TemplateSendPayload } from '@/lib/whatsapp-template-vars';
import type {
  WaAgent,
  WaAgentProductivity,
  WaAnalyticsOverview,
  WaCampaign,
  WaCampaignTemplate,
  WaCostSummary,
  WaOptOutPoint,
  WaSlaMetrics,
  WaTimeSeriesPoint,
  WaCampaignsPage,
  WaCannedReply,
  WaFaq,
  WaChannel,
  WaInteractiveInput,
  WaContact,
  WaContactsPage,
  WaPlatformUsersPage,
  WaConversation,
  WaConversationsPage,
  WaKeywordRule,
  WaMessage,
  WaNote,
  WaRecipientsPage,
  WaSequenceStep,
  WaSettings,
  WaTemplate,
  WaTemplateAnalytics,
  WaTemplatesPage,
  WaAudiencePreview,
  WaCampaignVariant,
  WaShortLink,
  WaScheduledMessage,
  WaHeatmapPoint,
  WaKeywordCount,
  WaHealthSnapshot,
  WaCsatSummary,
  WaMetaAnalytics,
  WaSuppression,
  WaSegment,
  WaConversion,
  WaConversionSummary,
  WaPlatformContext,
} from '@/types/whatsapp';

export interface WaConversationFilters {
  status?: string;
  assignedTo?: string;
  q?: string;
  unread?: boolean;
  onPlatform?: boolean;
  searchMessages?: boolean;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Super-admin WhatsApp inbox API. Targets `/super-admin/whatsapp/*` (SUPER_ADMIN
 * + MFA gated). Backend responses are `{ success, data }` (ApiResponse).
 */
export const superAdminWhatsappService = {
  async listConversations(
    f: WaConversationFilters = {},
  ): Promise<ApiResponse<WaConversationsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONVERSATIONS, {
      params: {
        status: f.status,
        assignedTo: f.assignedTo,
        q: f.q || undefined,
        unread: f.unread ? 'true' : undefined,
        onPlatform: f.onPlatform === undefined ? undefined : f.onPlatform ? 'true' : 'false',
        searchMessages: f.searchMessages ? 'true' : undefined,
        includeArchived: f.includeArchived ? 'true' : undefined,
        page: f.page,
        limit: f.limit,
      },
    });
    return res.data;
  },

  /** Total unread messages across the inbox (single aggregate) — sidebar badge. */
  async getUnreadTotal(): Promise<ApiResponse<{ total: number }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_UNREAD_TOTAL);
    return res.data;
  },

  async getConversation(id: string): Promise<ApiResponse<WaConversation>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONVERSATION(id));
    return res.data;
  },

  async getMessages(id: string, before?: string): Promise<ApiResponse<{ items: WaMessage[] }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_MESSAGES(id), { params: { before } });
    return res.data;
  },

  // "Delete for me" — soft-delete one or more messages from the inbox view
  // (inbound, outbound, media — anything). The customer keeps their copy.
  async deleteMessages(
    id: string,
    messageIds: string[],
  ): Promise<ApiResponse<{ deleted: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_MESSAGES_DELETE(id), { messageIds });
    return res.data;
  },

  async sendMessage(
    id: string,
    text: string,
    contextWamid?: string,
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_MESSAGES(id), { text, contextWamid });
    return res.data;
  },

  async markRead(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.post(API.SUPER_ADMIN.WA_READ(id));
    return res.data;
  },

  async assign(id: string, assignedTo: string | null): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_ASSIGN(id), { assignedTo });
    return res.data;
  },

  async setStatus(id: string, status: string): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_STATUS(id), { status });
    return res.data;
  },

  // ── Bulk actions (one atomic backend call; ids OR allMatching+filters) ──
  async bulkConversations(payload: {
    action:
      | 'archive'
      | 'unarchive'
      | 'resolve'
      | 'open'
      | 'pending'
      | 'markRead'
      | 'snooze'
      | 'unsnooze'
      | 'assign'
      | 'addLabel';
    ids?: string[];
    allMatching?: boolean;
    filters?: Record<string, unknown>;
    assignedTo?: string | null;
    snoozedUntil?: string | null;
    label?: string;
  }): Promise<ApiResponse<{ count: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONVERSATIONS_BULK, payload);
    return res.data;
  },

  async bulkContacts(payload: {
    action: 'tag' | 'untag' | 'optIn' | 'optOut' | 'block' | 'unblock' | 'addSuppression' | 'erase';
    ids?: string[];
    allMatching?: boolean;
    filters?: Record<string, unknown>;
    tag?: string;
  }): Promise<ApiResponse<{ count: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONTACTS_BULK, payload);
    return res.data;
  },

  async listChannels(): Promise<ApiResponse<WaChannel[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CHANNELS);
    return res.data;
  },

  /** Fetch inbound media (proxied + auth) as an object URL for display/download. */
  async fetchMediaObjectUrl(mediaId: string): Promise<string> {
    const res = await api.get(API.SUPER_ADMIN.WA_MEDIA(mediaId), { responseType: 'blob' });
    return URL.createObjectURL(res.data as Blob);
  },

  // ── Templates ──
  async listTemplates(
    filters: { status?: string; category?: string; q?: string; page?: number; limit?: number } = {},
  ): Promise<ApiResponse<WaTemplatesPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_TEMPLATES, { params: filters });
    return res.data;
  },

  async getTemplate(id: string): Promise<ApiResponse<WaTemplate>> {
    const res = await api.get(API.SUPER_ADMIN.WA_TEMPLATE(id));
    return res.data;
  },

  async createTemplate(body: {
    name: string;
    language: string;
    category: string;
    components: unknown[];
    variableSample?: unknown;
  }): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATES, body);
    return res.data;
  },

  async syncTemplates(): Promise<ApiResponse<{ synced: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_SYNC);
    return res.data;
  },

  /**
   * Upload a sample HEADER media file (image / video / document) to Meta and
   * get back the resumable-upload `handle` that a media-header template
   * component references via `example.header_handle`. Multipart upload, so the
   * axios JSON default Content-Type must be overridden (same pattern as
   * `sendMedia`). The backend (POST /templates/media-handle) returns
   * `{ handle }`; surfaces Meta's "App ID not configured" etc. on failure.
   */
  async uploadHeaderSample(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_MEDIA_HANDLE, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return (res.data as ApiResponse<{ handle: string }>).data?.handle ?? '';
  },

  async getTemplateAnalytics(id: string): Promise<ApiResponse<WaTemplateAnalytics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_TEMPLATE_ANALYTICS(id));
    return res.data;
  },

  // ── Template-based sends ──
  async startConversation(
    body: { phone: string } & TemplateSendPayload,
  ): Promise<ApiResponse<{ conversationId: string; message: WaMessage }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_START_CONVERSATION, body);
    return res.data;
  },

  async sendTemplate(
    conversationId: string,
    body: TemplateSendPayload,
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SEND_TEMPLATE(conversationId), body);
    return res.data;
  },

  // ── Contacts ──
  async listContacts(
    filters: {
      optInStatus?: string;
      tag?: string;
      blocked?: boolean;
      onPlatform?: boolean;
      role?: string;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<WaContactsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACTS, { params: filters });
    return res.data;
  },

  async updateContact(
    id: string,
    body: { name?: string | null; tags?: string[]; isBlocked?: boolean; optInStatus?: string },
  ): Promise<ApiResponse<WaContact>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CONTACT(id), body);
    return res.data;
  },

  async importContacts(body: {
    optIn?: boolean;
    contacts: Array<{ phone: string; name?: string; tags?: string[] }>;
  }): Promise<ApiResponse<{ created: number; updated: number; skipped: number; total: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONTACT_IMPORT, body);
    return res.data;
  },

  /** Platform User accounts reachable on WhatsApp (whatsappNumber ?? mobileNumber). */
  async listPlatformUsers(
    filters: { q?: string; role?: string; page?: number; limit?: number } = {},
  ): Promise<ApiResponse<WaPlatformUsersPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_PLATFORM_USERS, { params: filters });
    return res.data;
  },

  // ── Campaigns ──
  async listCampaigns(
    filters: { status?: string; page?: number; limit?: number } = {},
  ): Promise<ApiResponse<WaCampaignsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGNS, { params: filters });
    return res.data;
  },

  async getCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN(id));
    return res.data;
  },

  async createCampaign(body: {
    name: string;
    description?: string;
    templateId: string;
    audienceType: string;
    audienceFilter?: unknown;
    variableMapping?: string[];
    scheduledAt?: string;
    throttlePerSec?: number;
    type?: 'BROADCAST' | 'SEQUENCE';
    steps?: WaSequenceStep[];
    isAbTest?: boolean;
    variants?: Array<{ label: string; templateId: string; weight?: number }>;
    recurrenceDays?: number;
    segmentId?: string;
  }): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGNS, body);
    return res.data;
  },

  async previewCampaign(id: string): Promise<ApiResponse<WaAudiencePreview>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_PREVIEW(id));
    return res.data;
  },

  async getRecipients(
    id: string,
    params: { page?: number; limit?: number; status?: string } = {},
  ): Promise<ApiResponse<WaRecipientsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_RECIPIENTS(id), { params });
    return res.data;
  },

  async launchCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_LAUNCH(id));
    return res.data;
  },
  async pauseCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_PAUSE(id));
    return res.data;
  },
  async resumeCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_RESUME(id));
    return res.data;
  },
  async cancelCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_CANCEL(id));
    return res.data;
  },
  async retryFailedCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_RETRY(id));
    return res.data;
  },

  // ── Edit / reschedule / re-use ──
  async updateCampaign(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      templateId?: string;
      audienceType?: string;
      audienceFilter?: unknown;
      variableMapping?: string[];
      scheduledAt?: string | null;
      batchSize?: number;
      throttlePerSec?: number;
      recurrenceDays?: number | null;
      segmentId?: string;
    },
  ): Promise<ApiResponse<WaCampaign>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CAMPAIGN(id), patch);
    return res.data;
  },
  async duplicateCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_DUPLICATE(id));
    return res.data;
  },
  async testSendCampaign(id: string, phone: string): Promise<ApiResponse<unknown>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_TEST_SEND(id), { phone });
    return res.data;
  },
  async saveCampaignAsTemplate(
    id: string,
    name?: string,
  ): Promise<ApiResponse<WaCampaignTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_SAVE_TEMPLATE(id), { name });
    return res.data;
  },
  async listCampaignTemplates(): Promise<ApiResponse<WaCampaignTemplate[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_TEMPLATES);
    return res.data;
  },
  async useCampaignTemplate(
    id: string,
    body: { name?: string; scheduledAt?: string } = {},
  ): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_TEMPLATE_USE(id), body);
    return res.data;
  },
  async deleteCampaignTemplate(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CAMPAIGN_TEMPLATE(id));
    return res.data;
  },

  // ── Analytics ──
  async getAnalytics(): Promise<ApiResponse<WaAnalyticsOverview>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS);
    return res.data;
  },

  async getTimeSeries(days?: number): Promise<ApiResponse<WaTimeSeriesPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_TIMESERIES, { params: { days } });
    return res.data;
  },

  async getSlaMetrics(): Promise<ApiResponse<WaSlaMetrics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_SLA);
    return res.data;
  },

  async getAgentProductivity(): Promise<ApiResponse<WaAgentProductivity[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_AGENTS);
    return res.data;
  },

  async getCostSummary(): Promise<ApiResponse<WaCostSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_COST);
    return res.data;
  },

  async getOptOutTrend(days?: number): Promise<ApiResponse<WaOptOutPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_OPTOUT, { params: { days } });
    return res.data;
  },

  async syncChannelHealth(): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNEL_SYNC);
    return res.data;
  },

  // ── Canned replies ──
  async listCannedReplies(): Promise<ApiResponse<WaCannedReply[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CANNED_REPLIES);
    return res.data;
  },
  async createCannedReply(body: {
    title: string;
    text: string;
  }): Promise<ApiResponse<WaCannedReply>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CANNED_REPLIES, body);
    return res.data;
  },
  async updateCannedReply(
    id: string,
    body: { title: string; text: string },
  ): Promise<ApiResponse<WaCannedReply>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CANNED_REPLY(id), body);
    return res.data;
  },
  async deleteCannedReply(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CANNED_REPLY(id));
    return res.data;
  },

  // ── FAQ menu ──
  async listFaqs(): Promise<ApiResponse<WaFaq[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_FAQS);
    return res.data;
  },
  async createFaq(body: {
    question: string;
    answer: string;
    isActive?: boolean;
  }): Promise<ApiResponse<WaFaq>> {
    const res = await api.post(API.SUPER_ADMIN.WA_FAQS, body);
    return res.data;
  },
  async updateFaq(
    id: string,
    body: { question?: string; answer?: string; isActive?: boolean; order?: number },
  ): Promise<ApiResponse<WaFaq>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_FAQ(id), body);
    return res.data;
  },
  async deleteFaq(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_FAQ(id));
    return res.data;
  },
  async reorderFaqs(ids: string[]): Promise<ApiResponse<WaFaq[]>> {
    const res = await api.post(API.SUPER_ADMIN.WA_FAQ_REORDER, { ids });
    return res.data;
  },

  // ── Interactive send ──
  async sendInteractive(
    conversationId: string,
    body: WaInteractiveInput,
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SEND_INTERACTIVE(conversationId), body);
    return res.data;
  },

  // ── Media send (multipart upload → Meta → conversation) ──
  async sendMedia(
    conversationId: string,
    file: File,
    caption?: string,
    voice?: boolean,
  ): Promise<ApiResponse<WaMessage>> {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    if (voice) form.append('voice', 'true');
    // Must override the axios instance's default `Content-Type: application/json`
    // so the multipart boundary is set — otherwise multer can't parse the upload
    // and the backend 400s with "A file is required" (matches the avatar/logo/
    // resume upload pattern elsewhere in the app).
    const res = await api.post(API.SUPER_ADMIN.WA_SEND_MEDIA(conversationId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // ── Exports (CSV download) ──
  async exportContacts(
    filters: {
      optInStatus?: string;
      q?: string;
      tag?: string;
      blocked?: boolean;
      onPlatform?: boolean;
      role?: string;
      ids?: string[];
    } = {},
  ): Promise<void> {
    const { ids, ...rest } = filters;
    const params: Record<string, unknown> = { ...rest };
    // Selected-rows export: send ids as a comma list (backend splits on ',').
    if (ids && ids.length) params.ids = ids.join(',');
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACTS_EXPORT, {
      params,
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, 'wa-contacts.csv');
  },
  async exportRecipients(campaignId: string): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_RECIPIENTS_EXPORT(campaignId), {
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, 'campaign-recipients.csv');
  },

  // ── Settings ──
  async getSettings(): Promise<ApiResponse<WaSettings>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SETTINGS);
    return res.data;
  },
  async updateSettings(patch: Partial<WaSettings>): Promise<ApiResponse<WaSettings>> {
    const res = await api.put(API.SUPER_ADMIN.WA_SETTINGS, patch);
    return res.data;
  },

  // ── Keyword rules ──
  async listKeywordRules(): Promise<ApiResponse<WaKeywordRule[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_KEYWORD_RULES);
    return res.data;
  },
  async createKeywordRule(input: {
    name: string;
    match: string;
    matchType: 'exact' | 'contains' | 'starts';
    replyText?: string | null;
    replyTemplateId?: string | null;
    isActive?: boolean;
    priority?: number;
  }): Promise<ApiResponse<WaKeywordRule>> {
    const res = await api.post(API.SUPER_ADMIN.WA_KEYWORD_RULES, input);
    return res.data;
  },
  async updateKeywordRule(
    id: string,
    patch: Partial<Omit<WaKeywordRule, 'id' | 'createdAt'>>,
  ): Promise<ApiResponse<WaKeywordRule>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_KEYWORD_RULE(id), patch);
    return res.data;
  },
  async deleteKeywordRule(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_KEYWORD_RULE(id));
    return res.data;
  },

  // ── Conversation notes ──
  async listNotes(conversationId: string): Promise<ApiResponse<WaNote[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_NOTES(conversationId));
    return res.data;
  },
  async createNote(conversationId: string, body: string): Promise<ApiResponse<WaNote>> {
    const res = await api.post(API.SUPER_ADMIN.WA_NOTES(conversationId), { body });
    return res.data;
  },
  async deleteNote(conversationId: string, noteId: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_NOTE(conversationId, noteId));
    return res.data;
  },

  // ── Labels & snooze ──
  async setLabels(conversationId: string, labels: string[]): Promise<ApiResponse<WaConversation>> {
    const res = await api.put(API.SUPER_ADMIN.WA_LABELS(conversationId), { labels });
    return res.data;
  },
  async setSnooze(
    conversationId: string,
    snoozedUntil: string | null,
  ): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SNOOZE(conversationId), { snoozedUntil });
    return res.data;
  },

  // ── Campaign sequence steps ──
  async getCampaignSteps(id: string): Promise<ApiResponse<WaSequenceStep[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_STEPS(id));
    return res.data;
  },
  async setCampaignSteps(
    id: string,
    steps: WaSequenceStep[],
  ): Promise<ApiResponse<WaSequenceStep[]>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_STEPS(id), { steps });
    return res.data;
  },

  // ── Contact DPDP data export / erasure ──
  async exportContactData(id: string): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACT_DATA_EXPORT(id), {
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, `wa-contact-${id}.json`);
  },
  async eraseContact(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CONTACT_ERASE(id));
    return res.data;
  },

  // ── Agents (assignable admins) ──
  async listAgents(): Promise<ApiResponse<WaAgent[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_AGENTS);
    return res.data;
  },

  // ── Campaign A/B variants ──
  async getCampaignVariants(id: string): Promise<ApiResponse<WaCampaignVariant[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_VARIANTS(id));
    return res.data;
  },
  async setCampaignVariants(
    id: string,
    variants: WaCampaignVariant[],
  ): Promise<ApiResponse<WaCampaignVariant[]>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_VARIANTS(id), { variants });
    return res.data;
  },

  // ── Campaign short links ──
  async getCampaignLinks(id: string): Promise<ApiResponse<WaShortLink[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_LINKS(id));
    return res.data;
  },
  async createCampaignLink(id: string, targetUrl: string): Promise<ApiResponse<WaShortLink>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_LINKS(id), { targetUrl });
    return res.data;
  },

  // ── Conversation transcript export (CSV download) ──
  async exportTranscript(id: string): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONV_TRANSCRIPT(id), {
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, `wa-transcript-${id}.csv`);
  },

  // ── Conversation CSAT / archive ──
  async requestCsat(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_CSAT(id));
    return res.data;
  },
  async archiveConversation(id: string, archived: boolean): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_ARCHIVE(id), { archived });
    return res.data;
  },

  // "Clear chat history" — soft-delete every message in the conversation (our
  // side). The customer keeps their copy (the Cloud API has no revoke).
  async clearConversation(id: string): Promise<ApiResponse<{ cleared: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_CLEAR(id), {});
    return res.data;
  },

  // ── Reactions / location / contacts sends ──
  // Reactions attach to the target message (not a bubble); empty emoji removes ours.
  async sendReaction(
    id: string,
    wamid: string,
    emoji: string,
  ): Promise<ApiResponse<{ ok: boolean; targetWamid: string; emoji: string; side: 'out' }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_REACTION(id), { wamid, emoji });
    return res.data;
  },
  async sendLocation(
    id: string,
    body: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_LOCATION(id), body);
    return res.data;
  },
  async sendContacts(id: string, contacts: unknown[]): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_CONTACTS(id), { contacts });
    return res.data;
  },

  // ── Scheduled messages ──
  async listScheduled(id: string): Promise<ApiResponse<WaScheduledMessage[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONV_SCHEDULED(id));
    return res.data;
  },
  async scheduleMessage(
    id: string,
    body: {
      kind: 'text' | 'template';
      text?: string;
      templateId?: string;
      bodyParams?: string[];
      sendAt: string;
    },
  ): Promise<ApiResponse<WaScheduledMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_SCHEDULED(id), body);
    return res.data;
  },
  async cancelScheduled(id: string, msgId: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CONV_SCHEDULED_ITEM(id, msgId));
    return res.data;
  },

  // ── Advanced analytics (heatmap / keywords / health history / CSAT) ──
  async getHeatmap(days?: number): Promise<ApiResponse<WaHeatmapPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_HEATMAP, { params: { days } });
    return res.data;
  },
  async getKeywords(days?: number): Promise<ApiResponse<WaKeywordCount[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_KEYWORDS, { params: { days } });
    return res.data;
  },
  async getHealthHistory(days?: number): Promise<ApiResponse<WaHealthSnapshot[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_HEALTH_HISTORY, {
      params: { days },
    });
    return res.data;
  },
  async getMetaAnalytics(days = 30): Promise<ApiResponse<WaMetaAnalytics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_META, { params: { days } });
    return res.data;
  },
  async getCsat(): Promise<ApiResponse<WaCsatSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CSAT);
    return res.data;
  },

  // ── Suppressions (do-not-contact list) ──
  async listSuppressions(): Promise<ApiResponse<WaSuppression[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SUPPRESSIONS);
    return res.data;
  },
  async addSuppression(phone: string, reason?: string): Promise<ApiResponse<WaSuppression>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SUPPRESSIONS, { phone, reason });
    return res.data;
  },
  async removeSuppression(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_SUPPRESSION(id));
    return res.data;
  },

  // ── Segments (saved audience filters) ──
  async listSegments(): Promise<ApiResponse<WaSegment[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SEGMENTS);
    return res.data;
  },
  async getSegment(id: string): Promise<ApiResponse<WaSegment>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SEGMENT(id));
    return res.data;
  },
  async createSegment(body: {
    name: string;
    description?: string;
    filter: Record<string, unknown>;
  }): Promise<ApiResponse<WaSegment>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SEGMENTS, body);
    return res.data;
  },
  async updateSegment(
    id: string,
    patch: Partial<{ name: string; description: string | null; filter: Record<string, unknown> }>,
  ): Promise<ApiResponse<WaSegment>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_SEGMENT(id), patch);
    return res.data;
  },
  async deleteSegment(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_SEGMENT(id));
    return res.data;
  },

  // ── Conversions (attribution tracking) ──
  async recordConversion(body: {
    campaignId?: string;
    contactId?: string;
    valuePaise?: number;
    note?: string;
  }): Promise<ApiResponse<WaConversion>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONVERSIONS, body);
    return res.data;
  },
  async getCampaignConversions(id: string): Promise<ApiResponse<WaConversion[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_CONVERSIONS(id));
    return res.data;
  },
  async getConversionSummary(): Promise<ApiResponse<WaConversionSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CONVERSIONS);
    return res.data;
  },

  // ── Contact platform context (cross-references HireAdda user data) ──
  async getPlatformContext(id: string): Promise<ApiResponse<WaPlatformContext>> {
    const res = await api.get(API.SUPER_ADMIN.WA_PLATFORM_CONTEXT(id));
    return res.data;
  },
};

/**
 * User-facing self-serve WhatsApp marketing opt-in toggle. Targets the
 * non-super-admin path `/whatsapp-optin` (authenticated end-user).
 */
export async function selfServeWhatsappOptIn(optIn: boolean): Promise<ApiResponse<unknown>> {
  const res = await api.post(API.WHATSAPP.OPTIN, { optIn });
  return res.data;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
