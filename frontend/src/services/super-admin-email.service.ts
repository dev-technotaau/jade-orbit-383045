import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type {
  EmailSender,
  EmailTemplate,
  EmailCampaign,
  EmailCampaignsPage,
  EmailRecipientsPage,
  EmailContact,
  EmailContactsPage,
  EmailPlatformUsersPage,
  EmailSegment,
  EmailContactSet,
  EmailSuppression,
  EmailUnsubscribe,
  EmailThread,
  EmailThreadsPage,
  EmailCannedReply,
  EmailRule,
  EmailSettings,
  EmailBlueprint,
  EmailOverview,
  EmailTimeseriesPoint,
  EmailDeliverability,
  EmailCampaignAnalytics,
  EmailTopLink,
  EmailTemplateCategory,
  EmailTemplateStatus,
  EmailCampaignStatus,
  EmailCampaignRecipientStatus,
  EmailThreadStatus,
  EmailTemplateVersion,
  EmailSnippet,
  EmailContactTimeline,
  EmailBounceEvent,
  EmailCampaignComparison,
  EmailScheduledMessage,
  EmailSubscribeStatus,
  EmailHeatmap,
  EmailClientBreakdown,
  EmailDomainStat,
  EmailLeaderboard,
  EmailListGrowthPoint,
  EmailBounceReasons,
  BulkActionResult,
  EmailBulkJob,
  OutboundAttachmentRef,
} from '@/types/email';

type AnalyticsRange = { from?: string; to?: string; tz?: string };

const A = API.SUPER_ADMIN;

/**
 * Super-admin email system API. Targets `/super-admin/email/*` (SUPER_ADMIN +
 * MFA gated). Backend responses are `{ success, data }` (ApiResponse).
 */
export const superAdminEmailService = {
  // ── Senders ──
  async listSenders(): Promise<ApiResponse<EmailSender[]>> {
    return (await api.get(A.EMAIL_SENDERS)).data;
  },
  async createSender(body: Partial<EmailSender>): Promise<ApiResponse<EmailSender>> {
    return (await api.post(A.EMAIL_SENDERS, body)).data;
  },
  async updateSender(id: string, body: Partial<EmailSender>): Promise<ApiResponse<EmailSender>> {
    return (await api.put(A.EMAIL_SENDER(id), body)).data;
  },
  async deleteSender(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_SENDER(id))).data;
  },
  async verifySender(id: string): Promise<ApiResponse<{ sender: EmailSender; detail: unknown }>> {
    return (await api.post(A.EMAIL_SENDER_VERIFY(id))).data;
  },

  // ── Templates ──
  async listTemplates(
    params: { q?: string; category?: EmailTemplateCategory; status?: EmailTemplateStatus } = {},
  ): Promise<ApiResponse<EmailTemplate[]>> {
    return (await api.get(A.EMAIL_TEMPLATES_L, { params })).data;
  },
  async getTemplate(id: string): Promise<ApiResponse<EmailTemplate>> {
    return (await api.get(A.EMAIL_TEMPLATE(id))).data;
  },
  async createTemplate(body: Partial<EmailTemplate>): Promise<ApiResponse<EmailTemplate>> {
    return (await api.post(A.EMAIL_TEMPLATES_L, body)).data;
  },
  async updateTemplate(
    id: string,
    body: Partial<EmailTemplate>,
  ): Promise<ApiResponse<EmailTemplate>> {
    return (await api.put(A.EMAIL_TEMPLATE(id), body)).data;
  },
  async deleteTemplate(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_TEMPLATE(id))).data;
  },
  async previewTemplate(body: {
    subject: string;
    htmlBody: string;
    textBody?: string | null;
    preheader?: string | null;
    category?: EmailTemplateCategory;
    sampleVars?: Record<string, unknown>;
    to?: string;
    footerSnippetId?: string | null;
  }): Promise<ApiResponse<{ subject: string; html: string; text: string }>> {
    return (await api.post(A.EMAIL_TEMPLATE_PREVIEW, body)).data;
  },
  async testSendTemplate(body: {
    to: string;
    subject: string;
    htmlBody: string;
    textBody?: string | null;
    preheader?: string | null;
    category?: EmailTemplateCategory;
    sampleVars?: Record<string, unknown>;
    footerSnippetId?: string | null;
  }): Promise<ApiResponse<{ sent: boolean; to: string }>> {
    return (await api.post(A.EMAIL_TEMPLATE_TEST, body)).data;
  },

  // ── Campaigns ──
  async listCampaigns(
    params: {
      status?: EmailCampaignStatus;
      q?: string;
      archived?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<EmailCampaignsPage>> {
    return (
      await api.get(A.EMAIL_CAMPAIGNS, {
        params: { ...params, archived: params.archived ? 'true' : undefined },
      })
    ).data;
  },
  async bulkCampaigns(
    ids: string[],
    action: 'delete' | 'pause' | 'cancel' | 'resume' | 'duplicate' | 'archive' | 'unarchive',
  ): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_CAMPAIGNS_BULK, { ids, action })).data;
  },
  async archiveCampaign(id: string, archived: boolean): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_ARCHIVE(id), { archived })).data;
  },
  async getCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.get(A.EMAIL_CAMPAIGN(id))).data;
  },
  async createCampaign(body: Record<string, unknown>): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGNS, body)).data;
  },
  async updateCampaign(
    id: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse<EmailCampaign>> {
    return (await api.put(A.EMAIL_CAMPAIGN(id), body)).data;
  },
  async launchCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_LAUNCH(id))).data;
  },
  async pauseCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_PAUSE(id))).data;
  },
  async resumeCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_RESUME(id))).data;
  },
  async cancelCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_CANCEL(id))).data;
  },
  async retryFailed(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_RETRY(id))).data;
  },
  async duplicateCampaign(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_DUPLICATE(id))).data;
  },
  async previewAudience(id: string): Promise<ApiResponse<{ count: number }>> {
    return (await api.get(A.EMAIL_CAMPAIGN_AUDIENCE(id))).data;
  },
  async setVariants(id: string, variants: unknown[]): Promise<ApiResponse<unknown>> {
    return (await api.put(A.EMAIL_CAMPAIGN_VARIANTS(id), { variants })).data;
  },
  async setSteps(id: string, steps: unknown[]): Promise<ApiResponse<unknown>> {
    return (await api.put(A.EMAIL_CAMPAIGN_STEPS(id), { steps })).data;
  },
  async getRecipients(
    id: string,
    params: { page?: number; limit?: number; status?: EmailCampaignRecipientStatus } = {},
  ): Promise<ApiResponse<EmailRecipientsPage>> {
    return (await api.get(A.EMAIL_CAMPAIGN_RECIPIENTS(id), { params })).data;
  },
  async testSendCampaign(id: string, to: string): Promise<ApiResponse<{ sent: boolean }>> {
    return (await api.post(A.EMAIL_CAMPAIGN_TEST_SEND(id), { to })).data;
  },
  async saveAsBlueprint(id: string, name: string): Promise<ApiResponse<EmailBlueprint>> {
    return (await api.post(A.EMAIL_CAMPAIGN_SAVE_TEMPLATE(id), { name })).data;
  },
  async campaignAnalytics(id: string): Promise<ApiResponse<EmailCampaignAnalytics>> {
    return (await api.get(A.EMAIL_CAMPAIGN_ANALYTICS(id))).data;
  },
  recipientsExportUrl(id: string): string {
    return A.EMAIL_CAMPAIGN_RECIPIENTS_EXPORT(id);
  },

  // ── Blueprints ──
  async listBlueprints(): Promise<ApiResponse<EmailBlueprint[]>> {
    return (await api.get(A.EMAIL_BLUEPRINTS)).data;
  },
  async useBlueprint(id: string, name?: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_BLUEPRINT_USE(id), { name })).data;
  },
  async deleteBlueprint(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_BLUEPRINT(id))).data;
  },

  // ── Contacts ──
  async listContacts(
    params: {
      q?: string;
      subscribeStatus?: string;
      tag?: string;
      tags?: string[];
      onPlatform?: boolean;
      isBlocked?: boolean;
      ids?: string[];
      setId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<EmailContactsPage>> {
    return (
      await api.get(A.EMAIL_CONTACTS_L, {
        params: {
          ...params,
          tags: params.tags?.length ? params.tags.join(',') : undefined,
          ids: params.ids?.length ? params.ids.join(',') : undefined,
          onPlatform: params.onPlatform === undefined ? undefined : String(params.onPlatform),
          isBlocked: params.isBlocked === undefined ? undefined : String(params.isBlocked),
        },
      })
    ).data;
  },
  async getContact(id: string): Promise<ApiResponse<EmailContact>> {
    return (await api.get(A.EMAIL_CONTACT(id))).data;
  },
  async createContact(body: Partial<EmailContact>): Promise<ApiResponse<EmailContact>> {
    return (await api.post(A.EMAIL_CONTACTS_L, body)).data;
  },
  async updateContact(id: string, body: Partial<EmailContact>): Promise<ApiResponse<EmailContact>> {
    return (await api.put(A.EMAIL_CONTACT(id), body)).data;
  },
  async deleteContact(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_CONTACT(id))).data;
  },
  async blockContact(id: string, isBlocked: boolean): Promise<ApiResponse<EmailContact>> {
    return (await api.post(A.EMAIL_CONTACT_BLOCK(id), { isBlocked })).data;
  },
  async eraseContact(id: string): Promise<ApiResponse<EmailContact>> {
    return (await api.post(A.EMAIL_CONTACT_ERASE(id))).data;
  },
  async bulkTag(body: {
    contactIds?: string[];
    filter?: Record<string, unknown>;
    addTags?: string[];
    removeTags?: string[];
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_CONTACTS_BULK_TAG, body)).data;
  },
  async importContacts(body: {
    csv: string;
    tags?: string[];
    source?: string;
    subscribeStatus?: EmailSubscribeStatus;
    doubleOptIn?: boolean;
    mapping?: { email?: string; name?: string; tags?: string };
  }): Promise<
    ApiResponse<{
      imported: number;
      skipped: number;
      total: number;
      errors?: Array<{ row: number; email: string; reason: string }>;
    }>
  > {
    return (await api.post(A.EMAIL_CONTACTS_IMPORT, body)).data;
  },
  async importContactRows(body: {
    rows: Array<{ email: string; name?: string | null; tags?: string[] }>;
    tags?: string[];
    source?: string;
    subscribeStatus?: EmailSubscribeStatus;
  }): Promise<
    ApiResponse<{
      imported: number;
      skipped: number;
      total: number;
      errors?: Array<{ row: number; email: string; reason: string }>;
    }>
  > {
    return (await api.post(A.EMAIL_CONTACTS_IMPORT_ROWS, body)).data;
  },
  async bulkUpdateContacts(body: {
    contactIds?: string[];
    filter?: Record<string, unknown>;
    subscribeStatus?: EmailSubscribeStatus;
    isBlocked?: boolean;
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_CONTACTS_BULK_UPDATE, body)).data;
  },
  async bulkDeleteContacts(body: {
    contactIds?: string[];
    filter?: Record<string, unknown>;
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_CONTACTS_BULK_DELETE, body)).data;
  },
  contactsExportUrl(): string {
    return A.EMAIL_CONTACTS_EXPORT;
  },

  // ── Platform users ──
  async listPlatformUsers(
    params: {
      roles?: string;
      verifiedOnly?: boolean;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<EmailPlatformUsersPage>> {
    return (
      await api.get(A.EMAIL_PLATFORM_USERS, {
        params: { ...params, verifiedOnly: params.verifiedOnly ? 'true' : undefined },
      })
    ).data;
  },
  async countPlatformUsers(
    params: { roles?: string; verifiedOnly?: boolean } = {},
  ): Promise<ApiResponse<{ count: number }>> {
    return (
      await api.get(A.EMAIL_PLATFORM_USERS_COUNT, {
        params: { ...params, verifiedOnly: params.verifiedOnly ? 'true' : undefined },
      })
    ).data;
  },
  async syncPlatformUsers(body: {
    roles?: string;
    verifiedOnly?: boolean;
    q?: string;
    userIds?: string[];
  }): Promise<ApiResponse<{ count: number; contactIds: string[] }>> {
    return (await api.post(A.EMAIL_PLATFORM_USERS_SYNC, body)).data;
  },
  async exportPlatformUsers(
    params: { roles?: string; verifiedOnly?: boolean; q?: string } = {},
  ): Promise<Blob> {
    return (
      await api.get(A.EMAIL_PLATFORM_USERS_EXPORT, {
        params: { ...params, verifiedOnly: params.verifiedOnly ? 'true' : undefined },
        responseType: 'blob',
      })
    ).data;
  },

  // ── Segments ──
  async listSegments(): Promise<ApiResponse<EmailSegment[]>> {
    return (await api.get(A.EMAIL_SEGMENTS)).data;
  },
  async createSegment(body: {
    name: string;
    description?: string | null;
    filter: unknown;
  }): Promise<ApiResponse<EmailSegment>> {
    return (await api.post(A.EMAIL_SEGMENTS, body)).data;
  },
  async updateSegment(
    id: string,
    body: { name: string; description?: string | null; filter: unknown },
  ): Promise<ApiResponse<EmailSegment>> {
    return (await api.put(A.EMAIL_SEGMENT(id), body)).data;
  },
  async deleteSegment(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_SEGMENT(id))).data;
  },
  async segmentSize(id: string): Promise<ApiResponse<{ count: number }>> {
    return (await api.get(A.EMAIL_SEGMENT_SIZE(id))).data;
  },

  // ── Static sets (named contact lists) ──
  async listSets(): Promise<ApiResponse<EmailContactSet[]>> {
    return (await api.get(A.EMAIL_SETS)).data;
  },
  async getSet(id: string): Promise<ApiResponse<EmailContactSet>> {
    return (await api.get(A.EMAIL_SET(id))).data;
  },
  async createSet(body: {
    name: string;
    description?: string | null;
  }): Promise<ApiResponse<EmailContactSet>> {
    return (await api.post(A.EMAIL_SETS, body)).data;
  },
  async updateSet(
    id: string,
    body: { name?: string; description?: string | null },
  ): Promise<ApiResponse<EmailContactSet>> {
    return (await api.put(A.EMAIL_SET(id), body)).data;
  },
  async deleteSet(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_SET(id))).data;
  },
  async bulkDeleteSets(ids: string[]): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_SETS_BULK_DELETE, { ids })).data;
  },
  async listSetMembers(
    id: string,
    params: { q?: string; page?: number; limit?: number } = {},
  ): Promise<ApiResponse<EmailContactsPage>> {
    return (await api.get(A.EMAIL_SET_MEMBERS(id), { params })).data;
  },
  async addSetMembers(
    id: string,
    contactIds: string[],
  ): Promise<ApiResponse<{ added: number; memberCount: number }>> {
    return (await api.post(A.EMAIL_SET_MEMBERS(id), { contactIds })).data;
  },
  async removeSetMembers(id: string, contactIds: string[]): Promise<ApiResponse<BulkActionResult>> {
    return (await api.delete(A.EMAIL_SET_MEMBERS(id), { data: { contactIds } })).data;
  },
  async addSetMembersByAudience(
    id: string,
    body: {
      audienceType: string;
      audienceFilter?: unknown;
      segmentId?: string | null;
      setId?: string | null;
    },
  ): Promise<ApiResponse<{ added: number; memberCount: number }>> {
    return (await api.post(A.EMAIL_SET_AUDIENCE(id), body)).data;
  },
  setExportUrl(id: string): string {
    return A.EMAIL_SET_EXPORT(id);
  },

  // ── Suppression / unsubscribes ──
  async listSuppressions(
    params: { q?: string; reason?: string } = {},
  ): Promise<ApiResponse<EmailSuppression[]>> {
    return (await api.get(A.EMAIL_SUPPRESSIONS, { params })).data;
  },
  async addSuppression(body: {
    email: string;
    reason?: string;
  }): Promise<ApiResponse<EmailSuppression>> {
    return (await api.post(A.EMAIL_SUPPRESSIONS, body)).data;
  },
  async removeSuppression(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_SUPPRESSION(id))).data;
  },
  async importSuppressions(
    rows: Array<{ email: string; reason?: string | null }>,
  ): Promise<ApiResponse<{ imported: number; skipped: number; total: number }>> {
    return (await api.post(A.EMAIL_SUPPRESSIONS_IMPORT, { rows })).data;
  },
  async bulkDeleteSuppressions(body: {
    ids?: string[];
    filter?: { q?: string; reason?: string };
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_SUPPRESSIONS_BULK_DELETE, body)).data;
  },
  async listUnsubscribes(
    params: { q?: string; method?: string; page?: number; limit?: number } = {},
  ): Promise<
    ApiResponse<{ items: EmailUnsubscribe[]; total: number; page: number; limit: number }>
  > {
    return (await api.get(A.EMAIL_UNSUBSCRIBES, { params })).data;
  },
  async exportUnsubscribes(params: { q?: string; method?: string } = {}): Promise<Blob> {
    return (await api.get(A.EMAIL_UNSUBSCRIBES_EXPORT, { params, responseType: 'blob' })).data;
  },
  async bulkResubscribe(body: {
    ids?: string[];
    filter?: { q?: string; method?: string };
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_UNSUBSCRIBES_RESUBSCRIBE, body)).data;
  },
  async bulkDeleteUnsubscribes(body: {
    ids?: string[];
    filter?: { q?: string; method?: string };
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_UNSUBSCRIBES_BULK_DELETE, body)).data;
  },

  // ── Analytics ──
  async overview(params: AnalyticsRange = {}): Promise<ApiResponse<EmailOverview>> {
    return (await api.get(A.EMAIL_ANALYTICS_OVERVIEW, { params })).data;
  },
  async timeseries(params: AnalyticsRange = {}): Promise<ApiResponse<EmailTimeseriesPoint[]>> {
    return (await api.get(A.EMAIL_ANALYTICS_TIMESERIES, { params })).data;
  },
  async deliverability(params: AnalyticsRange = {}): Promise<ApiResponse<EmailDeliverability>> {
    return (await api.get(A.EMAIL_ANALYTICS_DELIVERABILITY, { params })).data;
  },
  async heatmap(params: AnalyticsRange = {}): Promise<ApiResponse<EmailHeatmap>> {
    return (await api.get(A.EMAIL_ANALYTICS_HEATMAP, { params })).data;
  },
  async topLinks(
    params: AnalyticsRange & { limit?: number } = {},
  ): Promise<ApiResponse<EmailTopLink[]>> {
    return (await api.get(A.EMAIL_ANALYTICS_TOP_LINKS, { params: { limit: 10, ...params } })).data;
  },
  async analyticsClients(params: AnalyticsRange = {}): Promise<ApiResponse<EmailClientBreakdown>> {
    return (await api.get(A.EMAIL_ANALYTICS_CLIENTS, { params })).data;
  },
  async analyticsDomains(
    params: AnalyticsRange & { limit?: number } = {},
  ): Promise<ApiResponse<EmailDomainStat[]>> {
    return (await api.get(A.EMAIL_ANALYTICS_DOMAINS, { params })).data;
  },
  async analyticsLeaderboard(limit = 15): Promise<ApiResponse<EmailLeaderboard>> {
    return (await api.get(A.EMAIL_ANALYTICS_LEADERBOARD, { params: { limit } })).data;
  },
  async analyticsListGrowth(
    params: AnalyticsRange = {},
  ): Promise<ApiResponse<EmailListGrowthPoint[]>> {
    return (await api.get(A.EMAIL_ANALYTICS_LIST_GROWTH, { params })).data;
  },
  async analyticsBounceReasons(
    params: AnalyticsRange = {},
  ): Promise<ApiResponse<EmailBounceReasons>> {
    return (await api.get(A.EMAIL_ANALYTICS_BOUNCE_REASONS, { params })).data;
  },

  // ── Settings ──
  async getSettings(): Promise<ApiResponse<EmailSettings>> {
    return (await api.get(A.EMAIL_SETTINGS)).data;
  },
  /** `expectedUpdatedAt` opts into optimistic concurrency — the server 409s
   *  with code STALE_WRITE if the row moved since it was loaded. */
  async updateSettings(
    body: Partial<EmailSettings> & { expectedUpdatedAt?: string },
  ): Promise<ApiResponse<EmailSettings>> {
    return (await api.put(A.EMAIL_SETTINGS, body)).data;
  },

  // ── Inbox (threads) ──
  async listThreads(
    params: {
      status?: EmailThreadStatus;
      assignedTo?: string;
      q?: string;
      label?: string;
      unread?: boolean;
      archived?: boolean;
      snoozed?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<EmailThreadsPage>> {
    return (
      await api.get(A.EMAIL_THREADS, {
        params: {
          ...params,
          unread: params.unread ? 'true' : undefined,
          archived: params.archived ? 'true' : undefined,
          snoozed: params.snoozed ? 'true' : undefined,
        },
      })
    ).data;
  },
  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return (await api.get(A.EMAIL_THREADS_UNREAD)).data;
  },
  async getThread(id: string): Promise<ApiResponse<EmailThread>> {
    return (await api.get(A.EMAIL_THREAD(id))).data;
  },
  async markRead(id: string): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_READ(id))).data;
  },
  async assignThread(id: string, userId: string | null): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_ASSIGN(id), { userId })).data;
  },
  async setThreadStatus(id: string, status: EmailThreadStatus): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_STATUS(id), { status })).data;
  },
  async setThreadLabels(id: string, labels: string[]): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_LABELS(id), { labels })).data;
  },
  async snoozeThread(id: string, until: string | null): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_SNOOZE(id), { until })).data;
  },
  async archiveThread(id: string, archived: boolean): Promise<ApiResponse<EmailThread>> {
    return (await api.post(A.EMAIL_THREAD_ARCHIVE(id), { archived })).data;
  },
  async bulkThreads(body: {
    ids?: string[];
    filter?: Record<string, unknown>;
    action:
      | 'read'
      | 'unread'
      | 'assign'
      | 'status'
      | 'archive'
      | 'unarchive'
      | 'snooze'
      | 'addLabels'
      | 'removeLabels';
    userId?: string | null;
    status?: EmailThreadStatus;
    until?: string | null;
    labels?: string[];
  }): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_THREADS_BULK, body)).data;
  },
  async addNote(id: string, body: string): Promise<ApiResponse<EmailThreadNoteResp>> {
    return (await api.post(A.EMAIL_THREAD_NOTES(id), { body })).data;
  },
  async reply(
    id: string,
    body: { subject?: string; body: string; html?: string; attachments?: OutboundAttachmentRef[] },
  ): Promise<ApiResponse<EmailMessageResp>> {
    return (await api.post(A.EMAIL_THREAD_REPLY(id), body)).data;
  },
  async scheduleReply(
    id: string,
    body: {
      subject?: string;
      body: string;
      html?: string;
      sendAt: string;
      attachments?: OutboundAttachmentRef[];
    },
  ): Promise<ApiResponse<unknown>> {
    return (await api.post(A.EMAIL_THREAD_SCHEDULE(id), body)).data;
  },
  /** Stage an outbound attachment to R2 for a campaign or reply send. */
  async uploadOutboundAttachment(file: File): Promise<ApiResponse<OutboundAttachmentRef>> {
    const fd = new FormData();
    fd.append('file', file);
    return (
      await api.post(A.EMAIL_ATTACHMENTS, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },

  // ── Canned replies + rules ──
  async listCanned(): Promise<ApiResponse<EmailCannedReply[]>> {
    return (await api.get(A.EMAIL_CANNED_REPLIES)).data;
  },
  async createCanned(body: Partial<EmailCannedReply>): Promise<ApiResponse<EmailCannedReply>> {
    return (await api.post(A.EMAIL_CANNED_REPLIES, body)).data;
  },
  async updateCanned(
    id: string,
    body: Partial<EmailCannedReply>,
  ): Promise<ApiResponse<EmailCannedReply>> {
    return (await api.put(A.EMAIL_CANNED_REPLY(id), body)).data;
  },
  async deleteCanned(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_CANNED_REPLY(id))).data;
  },
  async listRules(): Promise<ApiResponse<EmailRule[]>> {
    return (await api.get(A.EMAIL_RULES)).data;
  },
  async createRule(body: Partial<EmailRule>): Promise<ApiResponse<EmailRule>> {
    return (await api.post(A.EMAIL_RULES, body)).data;
  },
  async updateRule(id: string, body: Partial<EmailRule>): Promise<ApiResponse<EmailRule>> {
    return (await api.put(A.EMAIL_RULE(id), body)).data;
  },
  async deleteRule(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_RULE(id))).data;
  },

  // ── Template builder extras ──
  async duplicateTemplate(id: string): Promise<ApiResponse<EmailTemplate>> {
    return (await api.post(A.EMAIL_TEMPLATE_DUPLICATE(id))).data;
  },
  async bulkDeleteTemplates(ids: string[]): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_TEMPLATES_BULK_DELETE, { ids })).data;
  },
  async bulkTemplateStatus(
    ids: string[],
    status: EmailTemplateStatus,
  ): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_TEMPLATES_BULK_STATUS, { ids, status })).data;
  },
  async bulkDuplicateTemplates(ids: string[]): Promise<ApiResponse<BulkActionResult>> {
    return (await api.post(A.EMAIL_TEMPLATES_BULK_DUPLICATE, { ids })).data;
  },
  async templateVersions(id: string): Promise<ApiResponse<EmailTemplateVersion[]>> {
    return (await api.get(A.EMAIL_TEMPLATE_VERSIONS(id))).data;
  },
  async restoreTemplate(id: string, version: number): Promise<ApiResponse<EmailTemplate>> {
    return (await api.post(A.EMAIL_TEMPLATE_RESTORE(id), { version })).data;
  },
  async lintTemplate(body: {
    subject: string;
    htmlBody: string;
    textBody?: string | null;
  }): Promise<ApiResponse<{ warnings: string[]; score: number }>> {
    return (await api.post(A.EMAIL_TEMPLATE_LINT, body)).data;
  },
  async generatePlainText(htmlBody: string): Promise<ApiResponse<{ text: string }>> {
    return (await api.post(A.EMAIL_TEMPLATE_PLAINTEXT, { htmlBody })).data;
  },
  async uploadAsset(file: File): Promise<ApiResponse<{ url: string }>> {
    const fd = new FormData();
    fd.append('file', file);
    return (
      await api.post(A.EMAIL_ASSETS, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    ).data;
  },

  // ── Snippets ──
  async listSnippets(category?: string): Promise<ApiResponse<EmailSnippet[]>> {
    return (await api.get(A.EMAIL_SNIPPETS, { params: { category } })).data;
  },
  async createSnippet(body: {
    name: string;
    category?: string | null;
    html: string;
  }): Promise<ApiResponse<EmailSnippet>> {
    return (await api.post(A.EMAIL_SNIPPETS, body)).data;
  },
  async updateSnippet(id: string, body: Partial<EmailSnippet>): Promise<ApiResponse<EmailSnippet>> {
    return (await api.put(A.EMAIL_SNIPPET(id), body)).data;
  },
  async deleteSnippet(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_SNIPPET(id))).data;
  },

  // ── Campaign recovery / recurrence / delete ──
  async stopRecurrence(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_STOP_RECURRENCE(id))).data;
  },
  async deleteCampaign(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_CAMPAIGN(id))).data;
  },
  async listScheduled(): Promise<ApiResponse<EmailScheduledMessage[]>> {
    return (await api.get(A.EMAIL_SCHEDULED_LIST)).data;
  },
  async cancelScheduled(id: string): Promise<ApiResponse<unknown>> {
    return (await api.delete(A.EMAIL_SCHEDULED(id))).data;
  },
  async suppressionsExport(): Promise<Blob> {
    return (await api.get(A.EMAIL_SUPPRESSIONS_EXPORT, { responseType: 'blob' })).data;
  },

  // ── Bulk jobs (async progress) + undo ──
  async listBulkJobs(limit = 20): Promise<ApiResponse<EmailBulkJob[]>> {
    return (await api.get(A.EMAIL_BULK_JOBS, { params: { limit } })).data;
  },
  async getBulkJob(id: string): Promise<ApiResponse<EmailBulkJob>> {
    return (await api.get(A.EMAIL_BULK_JOB(id))).data;
  },
  async restoreUndo(token: string): Promise<ApiResponse<{ restored: number }>> {
    return (await api.post(A.EMAIL_BULK_UNDO(token))).data;
  },
  async materialize(id: string): Promise<ApiResponse<{ total: number }>> {
    return (await api.post(A.EMAIL_CAMPAIGN_MATERIALIZE(id))).data;
  },
  async reconcile(id: string): Promise<ApiResponse<EmailCampaign>> {
    return (await api.post(A.EMAIL_CAMPAIGN_RECONCILE(id))).data;
  },

  // ── Contact detail / GDPR ──
  async contactTimeline(id: string): Promise<ApiResponse<EmailContactTimeline>> {
    return (await api.get(A.EMAIL_CONTACT_TIMELINE(id))).data;
  },
  async contactDataExport(id: string): Promise<Blob> {
    return (await api.get(A.EMAIL_CONTACT_DATA_EXPORT(id), { responseType: 'blob' })).data;
  },

  // ── Analytics drill-downs ──
  async analyticsBounces(
    params: {
      campaignId?: string;
      type?: 'BOUNCE' | 'COMPLAINT';
      page?: number;
      limit?: number;
    } = {},
  ): Promise<
    ApiResponse<{ items: EmailBounceEvent[]; total: number; page: number; limit: number }>
  > {
    return (await api.get(A.EMAIL_ANALYTICS_BOUNCES, { params })).data;
  },
  async analyticsEvents(
    params: { eventType?: string; campaignId?: string; page?: number; limit?: number } = {},
  ): Promise<ApiResponse<{ items: unknown[]; total: number; page: number; limit: number }>> {
    return (await api.get(A.EMAIL_ANALYTICS_EVENTS, { params })).data;
  },
  async compareCampaigns(ids: string[]): Promise<ApiResponse<EmailCampaignComparison[]>> {
    return (await api.get(A.EMAIL_ANALYTICS_COMPARE, { params: { ids: ids.join(',') } })).data;
  },
  async analyticsExport(params: { from?: string; to?: string } = {}): Promise<Blob> {
    return (await api.get(A.EMAIL_ANALYTICS_EXPORT, { params, responseType: 'blob' })).data;
  },
};

type EmailThreadNoteResp = import('@/types/email').EmailThreadNote;
type EmailMessageResp = import('@/types/email').EmailMessage;
