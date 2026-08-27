import api from '@/lib/api';
import { API } from '@/constants/api';
import { assertUploadSize, assertWaMediaSize, MAX_UPLOAD_BYTES } from '@/constants/config';
import type { ApiResponse } from '@/types/api';
import type { TemplateSendPayload } from '@/lib/whatsapp-template-vars';
import type { WaCampaignTemplateParams } from '@/types/whatsapp';
import type { WaWebhookEndpoint, WaWebhookDelivery } from '@/types/whatsapp';
import type { WaInboundWebhookHealth, WaInboundWebhookEvent } from '@/types/whatsapp';
import type { WaFlow, WaFlowResponse } from '@/types/whatsapp';
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
  WaChannelTestResult,
  WaBusinessProfile,
  WaCommerceSettings,
  WaConversationalAutomation,
  WaInteractiveInput,
  WaContact,
  WaContactsPage,
  WaDuplicateGroup,
  WaMergeResult,
  WaImportJob,
  WaConversation,
  WaConversationMedia,
  WaConversationsPage,
  WaKeywordRule,
  WaMatchType,
  WaBotFlow,
  WaBotStep,
  WaFailedMediaArchive,
  WaMessage,
  WaNote,
  WaRecipientsPage,
  WaSequenceStep,
  WaSettings,
  WaTemplate,
  WaTemplateAnalytics,
  WaTemplatesPage,
  WaLibraryTemplate,
  WaAudiencePreview,
  WaCampaignPreflight,
  WaCampaignVariant,
  WaAbMetric,
  WaAbTestReport,
  WaSegmentFilter,
  WaShortLink,
  WaScheduledMessage,
  WaScheduledMessageStatus,
  WaScheduledMessageWithContact,
  WaHeatmapPoint,
  WaKeywordCount,
  WaHealthSnapshot,
  WaCsatSummary,
  WaMetaAnalytics,
  WaOptOutSummary,
  WaClickPoint,
  WaCtwaReport,
  WaSegmentPerformance,
  WaCohortReport,
  WaCampaignLinkStats,
  WaCampaignClickStats,
  WaSuppression,
  WaSuppressionsPage,
  WaSegment,
  WaConversion,
  WaConversionSummary,
} from '@/types/whatsapp';

/**
 * Budget for a request that carries a file, in ms.
 *
 * The shared axios instance allows 30s, which is fine for JSON and far too
 * short for an upload: a large attachment on a slow uplink blew through it, the
 * browser aborted, the operator saw "Failed to send media" — and the backend
 * finished the Graph upload and delivered the message anyway. The idempotency
 * key covers the retry; this stops the false failure happening in the first
 * place.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

function toMediaForm(
  file: File,
  conversationId?: string,
  phone?: string,
  channelId?: string,
): FormData {
  const form = new FormData();
  form.append('file', file);
  if (conversationId) form.append('conversationId', conversationId);
  // Only when there is no conversation yet; the backend prefers conversationId.
  else if (phone) form.append('phone', phone);
  // A campaign has neither: its header media is one file for the whole audience,
  // staged under the campaign's own channel so the media id is scoped to the
  // number the broadcast actually sends from.
  else if (channelId) form.append('channelId', channelId);
  return form;
}

/**
 * PUT a file straight to storage and return the key the API takes in place of
 * the bytes.
 *
 * Everything else in this file goes through the BFF proxy, which buffers the
 * whole body before forwarding it and is capped by the hosting platform at a few
 * megabytes. That cap — not WhatsApp — is why an ordinary 6 MB PDF could not be
 * sent. The signed URL is deliberately fetched through the proxy (it is a tiny
 * JSON call) and only the bytes bypass it.
 */
async function stageDirectUpload(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error('Upload cancelled');
  const signed = await api.post(API.SUPER_ADMIN.WA_UPLOAD_SIGN, {
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
  });
  const data = (signed.data as ApiResponse<{ url: string; key: string; contentType: string }>).data;
  if (!data?.url || !data.key) throw new Error('Could not prepare the upload');
  // Raw XHR, NOT the axios instance: its baseURL is the proxy this whole path
  // exists to avoid, and storage rejects the extra credentialed headers.
  //
  // XHR rather than fetch because only XHR reports upload progress, and this is
  // the branch the LARGEST files take — the one where a static filename and no
  // percentage leaves the operator unable to tell a slow upload from a stalled
  // one on a long call.
  const corsHint = 'If this persists, the storage bucket may be missing a CORS rule for this site.';
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.url);
    xhr.setRequestHeader('Content-Type', data.contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload to storage failed (${xhr.status}). ${corsHint}`));
    };
    // status 0 — the browser blocked it or the connection died, and it never
    // reached storage at all, so there is no status code to report.
    xhr.onerror = () => reject(new Error(`Upload to storage failed (network). ${corsHint}`));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    // This is the ONLY leg with no deadline of its own — the proxied branch is
    // capped by UPLOAD_TIMEOUT_MS. A half-open connection here (a dropped uplink
    // mid-PUT, which XHR reports as neither load nor error) left the progress bar
    // frozen forever with nothing to press. Scaled to the file: 60s of headroom
    // plus a minute per 5 MB, so a slow-but-alive 90 MB video is not killed for
    // being large.
    xhr.timeout = 60_000 + Math.ceil(file.size / (5 * 1024 * 1024)) * 60_000;
    xhr.ontimeout = () =>
      reject(new Error('Upload to storage timed out — check the connection and try again.'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
  return data.key;
}

export interface WaConversationFilters {
  /** Only threads on this connected number (WaChannel id). */
  channelId?: string;
  status?: string;
  assignedTo?: string;
  q?: string;
  unread?: boolean;
  searchMessages?: boolean;
  includeArchived?: boolean;
  /** ONLY archived threads — the archive as its own view, not mixed into the queue. */
  archivedOnly?: boolean;
  /** Show conversations whose snooze has not expired yet. */
  includeSnoozed?: boolean;
  /** ONLY threads that are currently snoozed. */
  snoozedOnly?: boolean;
  /** Triage labels to match (any-of). */
  labels?: string[];
  page?: number;
  limit?: number;
  /**
   * Keyset position of the last row already loaded, from the previous page's
   * `nextCursor`. Preferred over `page`: the list reorders on every inbound
   * message, so an offset page 2 can miss a row that page 1 pushed past it.
   */
  cursor?: string;
}

/** Which half of the traffic the busiest-hours heatmap counts. */
export type WaHeatmapDirection = 'INBOUND' | 'OUTBOUND' | 'ALL';

/**
 * Super-admin WhatsApp inbox API. Targets `/whatsapp/*` (SUPER_ADMIN
 * + MFA gated). Backend responses are `{ success, data }` (ApiResponse).
 */
export const whatsappService = {
  async listConversations(
    f: WaConversationFilters = {},
  ): Promise<ApiResponse<WaConversationsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONVERSATIONS, {
      params: {
        channelId: f.channelId || undefined,
        status: f.status,
        assignedTo: f.assignedTo,
        q: f.q || undefined,
        unread: f.unread ? 'true' : undefined,
        searchMessages: f.searchMessages ? 'true' : undefined,
        includeArchived: f.includeArchived ? 'true' : undefined,
        includeSnoozed: f.includeSnoozed ? 'true' : undefined,
        archivedOnly: f.archivedOnly ? 'true' : undefined,
        snoozedOnly: f.snoozedOnly ? 'true' : undefined,
        labels: f.labels?.length ? f.labels.join(',') : undefined,
        page: f.page,
        limit: f.limit,
        // Keyset position of the last row already loaded. Supersedes `page` —
        // offset paging over a list that reorders on every inbound message drops
        // rows between pages.
        cursor: f.cursor,
      },
    });
    return res.data;
  },

  /** Total unread messages across the inbox (single aggregate) — sidebar badge. */
  /**
   * `total` counts only what the DEFAULT inbox view shows; `snoozedTotal` is the
   * unread sitting in snoozed threads. They were one number built from a
   * different predicate than the list, so the badge could point at messages the
   * list refused to display.
   */
  async getUnreadTotal(): Promise<ApiResponse<{ total: number; snoozedTotal: number }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_UNREAD_TOTAL);
    return res.data;
  },

  async getConversation(id: string): Promise<ApiResponse<WaConversation>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONVERSATION(id));
    return res.data;
  },

  async getMessages(
    id: string,
    before?: string,
    /** Id of the oldest loaded message; disambiguates the boundary second. */
    beforeId?: string,
    /**
     * Centre the page on this message instead of opening at the newest one —
     * how a message-search hit is deep-linked. Mutually exclusive with `before`.
     */
    around?: string,
  ): Promise<ApiResponse<{ items: WaMessage[] }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_MESSAGES(id), {
      params: { before, beforeId, around },
    });
    return res.data;
  },

  /**
   * Every media message in a conversation, newest first. The gallery used to
   * filter the thread buffer the inbox happened to be holding, so it only ever
   * saw the media in the last loaded page.
   */
  async listConversationMedia(
    id: string,
    params: { before?: string; beforeId?: string; limit?: number } = {},
  ): Promise<ApiResponse<{ items: WaConversationMedia[]; hasMore: boolean }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONV_MEDIA(id), { params });
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

  /**
   * Put a triaged thread back in the unread queue.
   *
   * Local state only: the Cloud API has no un-read call and a read receipt, once
   * sent, cannot be withdrawn — the customer has already seen the blue ticks.
   * This restores our own queue position, nothing more.
   */
  async markUnread(id: string): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_UNREAD(id));
    return res.data;
  },

  /**
   * Show the customer a "typing…" bubble.
   *
   * Purely cosmetic and fire-and-forget: Meta displays it for up to 25s or until
   * the next outbound message, so the composer re-sends it on a throttle instead
   * of cancelling it. Answers `{ sent: false }` when the thread has no inbound
   * message to attach it to (the Cloud API rides the indicator on a read
   * receipt), which is not an error worth showing anyone.
   */
  async sendTyping(id: string): Promise<ApiResponse<{ sent: boolean }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TYPING(id));
    return res.data;
  },

  /**
   * Dismiss Meta's identity-change warning once an agent has re-verified who
   * they are speaking to.
   */
  async acknowledgeIdentityChange(id: string): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_IDENTITY_ACK(id));
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
  }): Promise<
    ApiResponse<{
      count: number;
      skippedOptedOut?: number;
      /** Already in the requested consent state — deliberately left untouched. */
      skippedNoChange?: number;
      failed?: string[];
    }>
  > {
    const res = await api.post(API.SUPER_ADMIN.WA_CONTACTS_BULK, payload);
    return res.data;
  },

  async listChannels(): Promise<ApiResponse<WaChannel[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CHANNELS);
    return res.data;
  },

  /**
   * Connect another WhatsApp business number. `accessToken` is only needed for a
   * number on a different WABA — omitted, it sends with the env token.
   */
  async createChannel(body: {
    phoneNumberId: string;
    wabaId?: string;
    displayPhone?: string;
    displayName?: string;
    accessToken?: string;
    isDefault?: boolean;
  }): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNELS, body);
    return res.data;
  },

  /** Edit a channel, rotate its token (null clears it), or activate/deactivate it. */
  async updateChannel(
    id: string,
    patch: {
      wabaId?: string;
      displayPhone?: string;
      displayName?: string | null;
      accessToken?: string | null;
      isActive?: boolean;
    },
  ): Promise<ApiResponse<WaChannel>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CHANNEL(id), patch);
    return res.data;
  },

  /** Make this the number campaigns and console-started conversations go out from. */
  async setDefaultChannel(id: string): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNEL_DEFAULT(id));
    return res.data;
  },

  /**
   * Can we still talk to Meta as this number? Resolves with `ok: false` and the
   * reason on a credential failure — an expired token is a test result, not a
   * request error.
   */
  async testChannel(id: string): Promise<ApiResponse<WaChannelTestResult>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNEL_TEST(id));
    return res.data;
  },

  // ── Number identity: business profile, registration, commerce ──
  //
  // All of this used to live only in Meta Business Manager, so the console could
  // report a number's health but not change a single thing a customer sees.

  /** The profile customers see when they tap the business name in WhatsApp. */
  async getBusinessProfile(channelId?: string): Promise<ApiResponse<WaBusinessProfile>> {
    const res = await api.get(API.SUPER_ADMIN.WA_BUSINESS_PROFILE, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  /** Only the keys supplied are written — Meta leaves an omitted field alone. */
  async updateBusinessProfile(
    patch: {
      about?: string;
      address?: string;
      description?: string;
      email?: string;
      websites?: string[];
      vertical?: string;
      profilePictureHandle?: string;
    },
    channelId?: string,
  ): Promise<ApiResponse<WaBusinessProfile>> {
    const res = await api.post(API.SUPER_ADMIN.WA_BUSINESS_PROFILE, patch, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  /** Upload a profile photo; returns Meta's resumable-upload handle to save with. */
  async uploadProfilePhoto(file: File): Promise<ApiResponse<{ handle: string }>> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(API.SUPER_ADMIN.WA_BUSINESS_PROFILE_PHOTO, form);
    return res.data;
  },

  /** Register the number for Cloud API use with its six-digit two-step PIN. */
  async registerNumber(pin: string, channelId?: string): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(
      API.SUPER_ADMIN.WA_CHANNEL_REGISTER,
      { pin },
      { params: channelId ? { channelId } : {} },
    );
    return res.data;
  },

  /** Rotate the two-step PIN on a number that is already registered. */
  async setTwoStepPin(pin: string, channelId?: string): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(
      API.SUPER_ADMIN.WA_CHANNEL_TWO_STEP_PIN,
      { pin },
      { params: channelId ? { channelId } : {} },
    );
    return res.data;
  },

  /** Take the number off the Cloud API (e.g. moving it to another platform). */
  async deregisterNumber(channelId?: string): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNEL_DEREGISTER, undefined, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  /** Ice breakers, commands and the welcome-message hook, read live from Meta. */
  async getConversationalAutomation(
    channelId?: string,
  ): Promise<ApiResponse<WaConversationalAutomation>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONVERSATIONAL_AUTOMATION, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  /**
   * Meta replaces the whole set on every write, so an omitted key is filled in
   * from the current value server-side rather than clearing it.
   */
  async updateConversationalAutomation(
    patch: Partial<WaConversationalAutomation>,
    channelId?: string,
  ): Promise<ApiResponse<WaConversationalAutomation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONVERSATIONAL_AUTOMATION, patch, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  async getCommerceSettings(channelId?: string): Promise<ApiResponse<WaCommerceSettings>> {
    const res = await api.get(API.SUPER_ADMIN.WA_COMMERCE_SETTINGS, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  async updateCommerceSettings(
    patch: { isCartEnabled?: boolean; isCatalogVisible?: boolean; catalogId?: string | null },
    channelId?: string,
  ): Promise<ApiResponse<WaCommerceSettings>> {
    const res = await api.post(API.SUPER_ADMIN.WA_COMMERCE_SETTINGS, patch, {
      params: channelId ? { channelId } : {},
    });
    return res.data;
  },

  /** Fetch inbound media (proxied + auth) as an object URL for display/download. */
  /**
   * @param variant 'thumb' asks for the small WebP derivative the archival
   * worker wrote. The gallery fires one of these PER TILE the moment it opens,
   * so at full size a grid of twenty photos was twenty multi-megabyte downloads
   * at once. The server falls back to the original when no derivative exists.
   */
  async fetchMediaObjectUrl(mediaId: string, variant?: 'thumb'): Promise<string> {
    const res = await api.get(API.SUPER_ADMIN.WA_MEDIA(mediaId), {
      responseType: 'blob',
      params: variant ? { variant } : undefined,
    });
    return URL.createObjectURL(res.data as Blob);
  },

  /**
   * Stage a file at Meta and get its media id back, without sending it.
   *
   * A media-header template could otherwise only be sent from a public URL the
   * operator hosted themselves, which Meta re-downloads on every single send.
   * Multipart, so the axios JSON default Content-Type must be overridden.
   *
   * `conversationId` matters on a WABA with more than one number: Meta scopes a
   * media id to the phone number that uploaded it, and a reply goes out from the
   * thread's own number — so staging under the default number made Meta reject
   * the send outright. Omitted for a brand-new conversation, which does start
   * from the default number.
   */
  /**
   * @param target Where the media will be SENT from. A media id is scoped to the
   * uploading phone-number id, so this has to match the number the send resolves:
   * the conversation for a reply, or the recipient's phone for a new thread.
   */
  async uploadMedia(
    file: File,
    target?: string | { conversationId?: string; phone?: string; channelId?: string },
  ): Promise<string> {
    const conversationId = typeof target === 'string' ? target : target?.conversationId;
    const phone = typeof target === 'string' ? undefined : target?.phone;
    const channelId = typeof target === 'string' ? undefined : target?.channelId;
    assertWaMediaSize(file);
    const res =
      file.size > MAX_UPLOAD_BYTES
        ? await api.post(
            API.SUPER_ADMIN.WA_MEDIA_UPLOAD,
            {
              r2Key: await stageDirectUpload(file),
              mime: file.type || 'application/octet-stream',
              filename: file.name,
              ...(conversationId ? { conversationId } : {}),
              ...(!conversationId && phone ? { phone } : {}),
              ...(!conversationId && !phone && channelId ? { channelId } : {}),
            },
            { timeout: UPLOAD_TIMEOUT_MS },
          )
        : await api.post(
            API.SUPER_ADMIN.WA_MEDIA_UPLOAD,
            toMediaForm(file, conversationId, phone, channelId),
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: UPLOAD_TIMEOUT_MS,
            },
          );
    return (res.data as ApiResponse<{ mediaId: string }>).data?.mediaId ?? '';
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

  /**
   * Edit and resubmit an existing template.
   *
   * Name and language are immutable at Meta, so only category and components can
   * change. Meta re-reviews every edit, so the template returns to PENDING.
   */
  async editTemplate(
    id: string,
    body: {
      category?: string;
      components: unknown[];
      variableSample?: unknown;
      /** Meta requires 'NAMED' for a body that uses {{word}} rather than {{1}}. */
      parameterFormat?: 'POSITIONAL' | 'NAMED';
      /** Delivery deadline: auth templates 60-600s, utility 30-900s. */
      messageSendTtlSeconds?: number;
    },
  ): Promise<ApiResponse<WaTemplate>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_TEMPLATE(id), body);
    return res.data;
  },

  async deleteTemplate(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_TEMPLATE(id));
    return res.data;
  },

  async createTemplate(body: {
    name: string;
    language: string;
    category: string;
    components: unknown[];
    variableSample?: unknown;
    /** Meta requires 'NAMED' for a body that uses {{word}} rather than {{1}}. */
    parameterFormat?: 'POSITIONAL' | 'NAMED';
    /** Delivery deadline: auth templates 60-600s, utility 30-900s. */
    messageSendTtlSeconds?: number;
  }): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATES, body);
    return res.data;
  },

  /**
   * Save a half-finished template locally (status LOCAL) without submitting it.
   *
   * Meta is not called at all, so nothing is claimed and nothing is reviewed.
   * Closing the builder used to discard everything — including the uploaded
   * header sample, whose handle cannot be recovered without the original file.
   */
  async saveTemplateDraft(body: {
    name: string;
    language: string;
    category: string;
    components: unknown[];
    variableSample?: unknown;
  }): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_DRAFT, body);
    return res.data;
  },

  /** Submit a saved draft to Meta for review (the draft's own create call). */
  async submitTemplateDraft(id: string): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_SUBMIT(id));
    return res.data;
  },

  /** Browse Meta's pre-approved template library. */
  async listLibraryTemplates(
    params: { search?: string; language?: string; category?: string; limit?: number } = {},
    // unavailable: Meta does not expose the library edge to this WABA. Reported
    // rather than thrown, so the dialog can say so without a 502 in the console.
  ): Promise<ApiResponse<{ items: WaLibraryTemplate[]; unavailable?: boolean }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_TEMPLATE_LIBRARY, { params });
    return res.data;
  },

  /**
   * Create a template from a library entry. Meta supplies the content and
   * approves it instantly; only the name, language and button inputs are ours.
   */
  async createTemplateFromLibrary(body: {
    name: string;
    language: string;
    category: string;
    libraryTemplateName: string;
    buttonInputs?: unknown[];
  }): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_LIBRARY, body);
    return res.data;
  },

  async syncTemplates(): Promise<ApiResponse<{ synced: number; missing: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_SYNC);
    return res.data;
  },

  /**
   * Re-read ONE template's status/quality/rejection reason from Meta.
   *
   * `syncTemplates` walks the entire WABA; after submitting a template the only
   * question is whether that row was approved yet, and the whole-catalogue pull
   * is both slow and able to fail on an unrelated page.
   */
  async refreshTemplate(id: string): Promise<ApiResponse<WaTemplate>> {
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_REFRESH(id));
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
    assertUploadSize(file);
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(API.SUPER_ADMIN.WA_TEMPLATE_MEDIA_HANDLE, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return (res.data as ApiResponse<{ handle: string }>).data?.handle ?? '';
  },

  async getTemplateAnalytics(id: string, days?: number): Promise<ApiResponse<WaTemplateAnalytics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_TEMPLATE_ANALYTICS(id), {
      params: days ? { days } : undefined,
    });
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
      /** OR across several tags — what a saved segment carries. */
      tags?: string[];
      /**
       * Apply a saved set by ID. Sent as an id rather than as flattened tags so
       * the backend resolves its rules with the campaign's own predicate — the
       * flattened form silently dropped attribute/recency/engagement rules and
       * showed a wider audience than a campaign on the same set would reach.
       */
      segmentId?: string;
      blocked?: boolean;
      /** On / off the global do-not-contact list. Omit for "either". */
      suppressed?: boolean;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<WaContactsPage>> {
    const { tags, ...rest } = filters;
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACTS, {
      // Comma-joined rather than repeated keys: the backend accepts both, and
      // one flat value keeps the react-query key and the shareable URL readable.
      params: { ...rest, ...(tags?.length ? { tags: tags.join(',') } : {}) },
    });
    return res.data;
  },

  /**
   * Contacts that look like the same person (matched on their last nine digits).
   *
   * Phone is the sole identity, so normalisation differences alone produce two
   * rows for one human — with two conversation threads and two consent states,
   * of which an opt-out may only have reached one.
   */
  async listDuplicateContacts(limit?: number): Promise<ApiResponse<WaDuplicateGroup[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACT_DUPLICATES, {
      params: limit ? { limit } : undefined,
    });
    return res.data;
  },

  /**
   * Fold `mergeId` into `survivorId`. The survivor keeps every conversation,
   * message, campaign row and consent event; the other becomes a tombstone.
   * Consent is TIGHTENED — an opt-out on either row wins.
   */
  async mergeContacts(survivorId: string, mergeId: string): Promise<ApiResponse<WaMergeResult>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONTACT_MERGE(survivorId), { mergeId });
    return res.data;
  },

  /**
   * One contact with its full consent record. The list payload carries the same
   * fields, but the detail drawer refetches so a drawer opened from a stale page
   * shows the current opt-in state and evidence rather than the cached row.
   */
  async getContact(id: string): Promise<ApiResponse<WaContact>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACT(id));
    return res.data;
  },

  async updateContact(
    id: string,
    body: { name?: string | null; tags?: string[]; isBlocked?: boolean; optInStatus?: string },
  ): Promise<ApiResponse<WaContact>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CONTACT(id), body);
    return res.data;
  },

  /**
   * Submit a contact file. Returns the import JOB, not the outcome.
   *
   * The import used to run inside this request, and at the advertised 5000 rows
   * it could not finish inside the server's 30s budget — the operator got a
   * timeout while rows kept being written behind it. Poll `getImportJob` for
   * progress; a deployment without Redis answers COMPLETED straight away.
   */
  async importContacts(body: {
    optIn?: boolean;
    /** Replace existing tags instead of merging into them (default: merge). */
    replaceTags?: boolean;
    contacts: Array<{
      phone: string;
      name?: string;
      tags?: string[];
      /** Unmapped file columns, personalisable as `{{attr.<key>}}`. */
      attributes?: Record<string, string>;
    }>;
  }): Promise<ApiResponse<WaImportJob>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONTACT_IMPORT, body);
    return res.data;
  },

  async getImportJob(jobId: string): Promise<ApiResponse<WaImportJob>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONTACT_IMPORT_JOB(jobId));
    return res.data;
  },

  // ── WhatsApp Flows ──

  async listFlows() {
    const res = await api.get(API.SUPER_ADMIN.WA_FLOWS);
    return res.data as ApiResponse<WaFlow[]>;
  },

  async syncFlows() {
    const res = await api.post(API.SUPER_ADMIN.WA_FLOWS_SYNC);
    return res.data as ApiResponse<{ synced: number }>;
  },

  async createFlow(body: { name: string; categories: string[]; endpointUri?: string }) {
    const res = await api.post(API.SUPER_ADMIN.WA_FLOWS, body);
    return res.data as ApiResponse<WaFlow>;
  },

  async updateFlowJson(id: string, flowJson: unknown) {
    const res = await api.put(API.SUPER_ADMIN.WA_FLOW_JSON(id), { flowJson });
    return res.data as ApiResponse<WaFlow>;
  },

  async publishFlow(id: string) {
    const res = await api.post(API.SUPER_ADMIN.WA_FLOW_PUBLISH(id));
    return res.data as ApiResponse<WaFlow>;
  },

  async deprecateFlow(id: string) {
    const res = await api.post(API.SUPER_ADMIN.WA_FLOW_DEPRECATE(id));
    return res.data as ApiResponse<WaFlow>;
  },

  async deleteFlow(id: string) {
    const res = await api.delete(API.SUPER_ADMIN.WA_FLOW(id));
    return res.data as ApiResponse<{ deleted: boolean }>;
  },

  async previewFlow(id: string) {
    const res = await api.get(API.SUPER_ADMIN.WA_FLOW_PREVIEW(id));
    return res.data as ApiResponse<{ previewUrl: string | null; expiresAt: string | null }>;
  },

  async listFlowResponses(page = 1, limit = 20) {
    const res = await api.get(API.SUPER_ADMIN.WA_FLOW_RESPONSES, { params: { page, limit } });
    return res.data as ApiResponse<{ items: WaFlowResponse[]; total: number }>;
  },

  // ── Outbound webhooks ──

  async listWebhooks(page = 1, limit = 20) {
    const res = await api.get(API.SUPER_ADMIN.WA_WEBHOOKS, { params: { page, limit } });
    return res.data as ApiResponse<{ items: WaWebhookEndpoint[]; total: number }>;
  },

  async createWebhook(body: { url: string; events: string[]; description?: string }) {
    const res = await api.post(API.SUPER_ADMIN.WA_WEBHOOKS, body);
    return res.data as ApiResponse<WaWebhookEndpoint>;
  },

  async updateWebhook(
    id: string,
    body: { url?: string; events?: string[]; description?: string; isActive?: boolean },
  ) {
    const res = await api.patch(API.SUPER_ADMIN.WA_WEBHOOK(id), body);
    return res.data as ApiResponse<WaWebhookEndpoint>;
  },

  async deleteWebhook(id: string) {
    const res = await api.delete(API.SUPER_ADMIN.WA_WEBHOOK(id));
    return res.data as ApiResponse<{ deleted: boolean }>;
  },

  async testWebhook(id: string) {
    const res = await api.post(API.SUPER_ADMIN.WA_WEBHOOK_TEST(id));
    return res.data as ApiResponse<unknown>;
  },

  async replayWebhookDelivery(id: string, deliveryId: string) {
    const res = await api.post(API.SUPER_ADMIN.WA_WEBHOOK_DELIVERY_REPLAY(id, deliveryId));
    return res.data as ApiResponse<{ message: string }>;
  },

  async listWebhookDeliveries(id: string, page = 1, limit = 20) {
    const res = await api.get(API.SUPER_ADMIN.WA_WEBHOOK_DELIVERIES(id), {
      params: { page, limit },
    });
    return res.data as ApiResponse<{ items: WaWebhookDelivery[]; total: number }>;
  },

  // ── Inbound webhook (Meta → us): health + raw-event inspection ──

  /**
   * `checkSubscription` costs a Graph round trip, so the polling panel asks for
   * it only when the operator explicitly presses Re-check.
   */
  async getInboundWebhookHealth(checkSubscription = false) {
    const res = await api.get(API.SUPER_ADMIN.WA_WEBHOOK_HEALTH, {
      params: checkSubscription ? { checkSubscription: 'true' } : {},
    });
    return res.data as ApiResponse<WaInboundWebhookHealth>;
  },

  async listInboundWebhookEvents(
    filters: {
      eventType?: string;
      /** 'processed' | 'unprocessed' | 'deferred' */
      state?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const res = await api.get(API.SUPER_ADMIN.WA_WEBHOOK_EVENTS, { params: filters });
    return res.data as ApiResponse<{
      items: WaInboundWebhookEvent[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>;
  },

  async getInboundWebhookEvent(id: string) {
    const res = await api.get(API.SUPER_ADMIN.WA_WEBHOOK_EVENT(id));
    return res.data as ApiResponse<WaInboundWebhookEvent>;
  },

  /**
   * Replay one stuck event through the inbound worker. `requeued: false` means a
   * job for it was already waiting or running, so nothing new was scheduled.
   */
  async reprocessInboundWebhookEvent(id: string) {
    const res = await api.post(API.SUPER_ADMIN.WA_WEBHOOK_EVENT_REPROCESS(id));
    return res.data as ApiResponse<WaInboundWebhookEvent & { requeued: boolean }>;
  },

  // ── Campaigns ──
  async listCampaigns(
    filters: {
      status?: string;
      /** Name search (case-insensitive substring), matched server-side. */
      q?: string;
      page?: number;
      limit?: number;
      archived?: boolean;
    } = {},
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
    audienceFilter?: WaSegmentFilter;
    variableMapping?: string[];
    /** Header media/text + URL-button value; required by some templates. */
    templateParams?: WaCampaignTemplateParams;
    scheduledAt?: string;
    /** Hold sends (and drip steps) outside the configured business hours. */
    respectBusinessHours?: boolean;
    throttlePerSec?: number;
    type?: 'BROADCAST' | 'SEQUENCE';
    steps?: WaSequenceStep[];
    isAbTest?: boolean;
    variants?: Array<{ label: string; templateId: string; weight?: number }>;
    /** Launch to this % of the audience, holding the rest back for the winner. */
    abTestSamplePct?: number | null;
    abTestMetric?: WaAbMetric | null;
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

  /**
   * The same size + cost preview for an audience that has not been saved yet,
   * so the builder can show it while the filters are still being chosen instead
   * of only after the draft exists (which the edit modal then cannot change).
   *
   * POST because the body carries the whole audience filter, uploaded phone list
   * included. It writes nothing.
   */
  async previewAudienceDraft(body: {
    templateId: string;
    audienceType: 'segment' | 'upload' | 'manual';
    audienceFilter?: unknown;
    segmentId?: string;
    variableMapping?: string[];
  }): Promise<ApiResponse<WaAudiencePreview>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_PREVIEW_AUDIENCE, body);
    return res.data;
  },

  /** Keyset-paged: pass the previous response's `nextCursor` to advance. */
  async getRecipients(
    id: string,
    params: { cursor?: string; limit?: number; status?: string; clicked?: boolean } = {},
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
      audienceFilter?: WaSegmentFilter;
      variableMapping?: string[];
      /**
       * The campaign-wide send parameters. The API has always accepted these on
       * a PATCH; this signature omitted them, so the editor could not repair a
       * campaign whose header media, coupon code or offer expiry was wrong — the
       * one thing its own launch error tells the operator to go and do.
       */
      templateParams?: WaCampaignTemplateParams;
      scheduledAt?: string | null;
      respectBusinessHours?: boolean;
      batchSize?: number;
      throttlePerSec?: number;
      recurrenceDays?: number | null;
      segmentId?: string;
      abTestSamplePct?: number | null;
      abTestMetric?: WaAbMetric | null;
    },
  ): Promise<ApiResponse<WaCampaign>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_CAMPAIGN(id), patch);
    return res.data;
  },
  async duplicateCampaign(id: string): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_DUPLICATE(id));
    return res.data;
  },
  /**
   * Remove a campaign: a DRAFT is deleted outright, anything that already sent is
   * archived out of the list instead so its numbers survive.
   */
  async deleteCampaign(id: string): Promise<ApiResponse<{ deleted: boolean; archived: boolean }>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CAMPAIGN(id));
    return res.data;
  },
  /**
   * Send the campaign's real message to one number. `variantId` picks which A/B
   * template to preview — the base template is the one thing an A/B campaign
   * never sends to anybody.
   */
  async testSendCampaign(
    id: string,
    phone: string,
    opts: { variantId?: string; contactId?: string } = {},
  ): Promise<ApiResponse<unknown>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_TEST_SEND(id), { phone, ...opts });
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
  /** Omit `days` for the lifetime totals; pass it to scope every count + delta. */
  async getAnalytics(days?: number, channelId?: string): Promise<ApiResponse<WaAnalyticsOverview>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS, { params: { days, channelId } });
    return res.data;
  },

  /**
   * Omit `channelId` for every connected number. On a multi-number deployment
   * the blended figure answers no question an operator actually has — volume,
   * cost and delivery all belong to the number that produced them.
   */
  async getTimeSeries(
    days?: number,
    channelId?: string,
  ): Promise<ApiResponse<WaTimeSeriesPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_TIMESERIES, {
      params: { days, channelId },
    });
    return res.data;
  },

  async getSlaMetrics(days?: number): Promise<ApiResponse<WaSlaMetrics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_SLA, { params: { days } });
    return res.data;
  },

  async getAgentProductivity(days?: number): Promise<ApiResponse<WaAgentProductivity[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_AGENTS, { params: { days } });
    return res.data;
  },

  async getCostSummary(days?: number, channelId?: string): Promise<ApiResponse<WaCostSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_COST, { params: { days, channelId } });
    return res.data;
  },

  async getOptOutTrend(days?: number): Promise<ApiResponse<WaOptOutPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_OPTOUT, { params: { days } });
    return res.data;
  },

  /** Opt-out RATE (per 1,000 delivered) plus which campaigns caused them. */
  async getOptOutSummary(days?: number): Promise<ApiResponse<WaOptOutSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_OPTOUT_SUMMARY, { params: { days } });
    return res.data;
  },

  /** Daily short-link clicks across every campaign. */
  async getClickSeries(days?: number): Promise<ApiResponse<WaClickPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CLICKS, { params: { days } });
    return res.data;
  },

  /** Click-to-WhatsApp acquisition grouped by the ad that produced it. */
  async getCtwaReport(days?: number): Promise<ApiResponse<WaCtwaReport>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CTWA, { params: { days } });
    return res.data;
  },

  /** The whole dashboard as a downloadable file (CSV by default). */
  async exportAnalytics(days: number, format: 'csv' | 'json' = 'csv'): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_EXPORT, {
      params: { days, format },
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, `wa-analytics-${days}d.${format}`);
  },

  /** CTWA contacts with their ctwa_clid, for offline conversion upload to Meta. */
  async exportCtwaContacts(days: number): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CTWA_EXPORT, {
      params: { days },
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, 'wa-ctwa-contacts.csv');
  },

  /** Omit `channelId` to sync the default number. */
  async syncChannelHealth(channelId?: string): Promise<ApiResponse<WaChannel>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CHANNEL_SYNC, undefined, {
      params: channelId ? { channelId } : {},
    });
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

  // ── Media send (upload → Meta → conversation) ──
  /**
   * @param idempotencyKey Generated ONCE per file the operator picked and reused
   *   for every attempt at sending it. The backend requires it: without one, a
   *   send that outlived the client timeout was retried by hand and the customer
   *   received (and the account was billed for) the same attachment twice.
   * @param onProgress Percentage of the file's BYTES that have left the browser,
   *   0-100. Only the upload leg is measurable; the caller keeps the indicator up
   *   after 100 while the backend forwards the file on to Meta.
   */
  async sendMedia(
    conversationId: string,
    file: File,
    caption?: string,
    voice?: boolean,
    idempotencyKey?: string,
    onProgress?: (pct: number) => void,
    /** WAMID this attachment quotes, when the reply banner was up. */
    contextWamid?: string,
    /** Aborts the upload when the operator presses Cancel. */
    signal?: AbortSignal,
  ): Promise<ApiResponse<WaMessage>> {
    // Refuse a file WhatsApp itself will not carry. Anything under that but over
    // the proxy's body limit goes straight to storage instead of being refused.
    assertWaMediaSize(file);
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const url = API.SUPER_ADMIN.WA_SEND_MEDIA(conversationId);

    if (file.size > MAX_UPLOAD_BYTES) {
      const r2Key = await stageDirectUpload(file, onProgress, signal);
      // The bytes are up; what follows is a small JSON call, so hold the bar at
      // 100 rather than letting it sit at 99 for the whole Meta hop.
      onProgress?.(100);
      const res = await api.post(
        url,
        {
          r2Key,
          mime: file.type || 'application/octet-stream',
          filename: file.name,
          caption,
          voice,
          contextWamid,
        },
        { headers, timeout: UPLOAD_TIMEOUT_MS, signal },
      );
      return res.data;
    }

    const form = toMediaForm(file);
    if (caption) form.append('caption', caption);
    if (voice) form.append('voice', 'true');
    if (contextWamid) form.append('contextWamid', contextWamid);
    // Must override the axios instance's default `Content-Type: application/json`
    // so the multipart boundary is set — otherwise multer can't parse the upload
    // and the backend 400s with "A file is required" (matches the avatar/logo/
    // resume upload pattern elsewhere in the app).
    const res = await api.post(url, form, {
      headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      signal,
      onUploadProgress: onProgress
        ? (e) => {
            // `total` is absent when the size is not known up front; there is no
            // percentage to report in that case, so leave the last one standing.
            if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
          }
        : undefined,
    });
    return res.data;
  },

  // ── Exports (CSV download) ──
  async exportContacts(
    filters: {
      optInStatus?: string;
      q?: string;
      tag?: string;
      tags?: string[];
      /** Applied saved set — resolved server-side, exactly as the list does. */
      segmentId?: string;
      blocked?: boolean;
      suppressed?: boolean;
      ids?: string[];
    } = {},
  ): Promise<void> {
    const { ids, tags, ...rest } = filters;
    const params: Record<string, unknown> = { ...rest };
    if (tags && tags.length) params.tags = tags.join(',');
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
    matchType: WaMatchType;
    replyText?: string | null;
    replyTemplateId?: string | null;
    /** {{n}} values for replyTemplateId — omitted, the reply sent blank slots. */
    replyVariables?: string[] | null;
    /** 'handoff' routes the thread to a human instead of answering it. */
    action?: 'reply' | 'handoff';
    handoffAssignee?: string | null;
    handoffLabel?: string | null;
    handoffStatus?: 'OPEN' | 'PENDING' | null;
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

  // ── Conversational bot flows ──
  async listBotFlows(): Promise<ApiResponse<WaBotFlow[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_BOT_FLOWS);
    return res.data;
  },
  async createBotFlow(input: {
    name: string;
    description?: string | null;
    isActive?: boolean;
    triggerType?: 'keyword' | 'manual';
    triggerKeywords?: string[];
    triggerMatchType?: WaMatchType;
    entryStepKey?: string | null;
    timeoutMinutes?: number;
    escapeKeywords?: string[];
    cancelMessage?: string | null;
  }): Promise<ApiResponse<WaBotFlow>> {
    const res = await api.post(API.SUPER_ADMIN.WA_BOT_FLOWS, input);
    return res.data;
  },
  async updateBotFlow(
    id: string,
    patch: Partial<Omit<WaBotFlow, 'id' | 'createdAt' | 'updatedAt' | 'steps'>>,
  ): Promise<ApiResponse<WaBotFlow>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_BOT_FLOW(id), patch);
    return res.data;
  },
  async deleteBotFlow(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_BOT_FLOW(id));
    return res.data;
  },
  async createBotStep(
    flowId: string,
    input: Partial<Omit<WaBotStep, 'id' | 'flowId' | 'createdAt' | 'updatedAt'>> & { key: string },
  ): Promise<ApiResponse<WaBotStep>> {
    const res = await api.post(API.SUPER_ADMIN.WA_BOT_FLOW_STEPS(flowId), input);
    return res.data;
  },
  async updateBotStep(
    flowId: string,
    stepId: string,
    patch: Partial<Omit<WaBotStep, 'id' | 'flowId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ApiResponse<WaBotStep>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_BOT_FLOW_STEP(flowId, stepId), patch);
    return res.data;
  },
  async deleteBotStep(flowId: string, stepId: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_BOT_FLOW_STEP(flowId, stepId));
    return res.data;
  },

  // ── Failed media archives ──
  /** Inbound files whose durable archive gave up — the operator dead-letter list. */
  async listFailedMedia(limit = 50): Promise<ApiResponse<{ items: WaFailedMediaArchive[] }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_MEDIA_FAILED, { params: { limit } });
    return res.data;
  },
  /** Re-enqueue one. Only recovers the file inside Meta's ~30-day window. */
  async retryFailedMedia(messageId: string): Promise<ApiResponse<{ messageId: string }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_MEDIA_RETRY(messageId));
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
  async updateNote(
    conversationId: string,
    noteId: string,
    body: string,
  ): Promise<ApiResponse<WaNote>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_NOTE(conversationId, noteId), { body });
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

  /** Suppress every automated reply on one thread (null resumes it). */
  async setBotPause(
    conversationId: string,
    botPausedUntil: string | null,
  ): Promise<ApiResponse<WaConversation>> {
    const res = await api.post(API.SUPER_ADMIN.WA_BOT_PAUSE(conversationId), { botPausedUntil });
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

  // ── Campaign A/B decision (rates, significance, winner, remainder) ──
  async getAbTest(id: string): Promise<ApiResponse<WaAbTestReport>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_AB_TEST(id));
    return res.data;
  },
  /** Omit `variantId` to accept the measured leader. */
  async selectAbWinner(
    id: string,
    body: { variantId?: string; metric?: WaAbMetric } = {},
  ): Promise<ApiResponse<WaCampaign>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_AB_WINNER(id), body);
    return res.data;
  },
  /** Release the held-back rest of the audience to the winning variant. */
  async sendAbRemainder(
    id: string,
  ): Promise<ApiResponse<{ campaign: WaCampaign | null; added: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_AB_REMAINDER(id));
    return res.data;
  },

  // ── Campaign short links ──
  /**
   * Links WITH their click-through. This used to return a bare array of links
   * whose only metric was a lifetime click count, so CTR — the number an
   * operator optimises a link campaign on — appeared nowhere in the product.
   */
  async getCampaignLinks(id: string): Promise<ApiResponse<WaCampaignLinkStats>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_LINKS(id));
    return res.data;
  },
  async getCampaignClicks(id: string, days = 30): Promise<ApiResponse<WaCampaignClickStats>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_CLICKS(id), { params: { days } });
    return res.data;
  },
  async createCampaignLink(id: string, targetUrl: string): Promise<ApiResponse<WaShortLink>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CAMPAIGN_LINKS(id), { targetUrl });
    return res.data;
  },

  // ── Conversation transcript export (CSV download) ──
  /**
   * @param opts Both flags have been accepted by the endpoint from the start —
   *   it reads `?notes=true` and `?includeDeleted=true`, and streams a
   *   decrypted notes section for the first. The client simply never sent
   *   either, so the export a team reached for during a dispute contained
   *   neither the internal commentary nor anything an agent had deleted.
   */
  async exportTranscript(
    id: string,
    opts?: { notes?: boolean; includeDeleted?: boolean },
  ): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_CONV_TRANSCRIPT(id), {
      responseType: 'blob',
      params: {
        ...(opts?.notes ? { notes: 'true' } : {}),
        ...(opts?.includeDeleted ? { includeDeleted: 'true' } : {}),
      },
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
    body: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
      contextWamid?: string;
    },
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_LOCATION(id), body);
    return res.data;
  },
  async sendContacts(
    id: string,
    contacts: unknown[],
    contextWamid?: string,
  ): Promise<ApiResponse<WaMessage>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_CONTACTS(id), { contacts, contextWamid });
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
  /**
   * Schedule a FILE for later.
   *
   * Multipart, like an immediate media send: the bytes are archived server-side
   * at schedule time and only uploaded to Meta in the dispatch tick, because a
   * Meta media id expires after 30 days and anything scheduled beyond that would
   * otherwise fail at the one moment nobody is watching.
   */
  async scheduleMediaMessage(
    id: string,
    file: File,
    body: { sendAt: string; caption?: string },
  ): Promise<ApiResponse<WaScheduledMessage>> {
    const form = new FormData();
    form.append('kind', 'media');
    form.append('file', file);
    form.append('sendAt', body.sendAt);
    if (body.caption) form.append('caption', body.caption);
    const res = await api.post(API.SUPER_ADMIN.WA_CONV_SCHEDULED(id), form);
    return res.data;
  },
  async cancelScheduled(id: string, msgId: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CONV_SCHEDULED_ITEM(id, msgId));
    return res.data;
  },
  /**
   * The whole send-later queue, not just one conversation's — what is about to
   * go out, and what already failed.
   */
  async listAllScheduled(
    filters: {
      status?: WaScheduledMessageStatus;
      /** ISO bounds on sendAt. */
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<
    ApiResponse<{
      items: WaScheduledMessageWithContact[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  > {
    const res = await api.get(API.SUPER_ADMIN.WA_SCHEDULED, { params: filters });
    return res.data;
  },

  // ── Advanced analytics (heatmap / keywords / health history / CSAT) ──
  /**
   * Busiest-hours grid. Inbound-only by default (server-side): counting outbound
   * too let one campaign blast decide which cell looks busiest, turning "when is
   * my audience active" into "when did I last press send".
   */
  async getHeatmap(
    days?: number,
    direction?: WaHeatmapDirection,
    channelId?: string,
  ): Promise<ApiResponse<WaHeatmapPoint[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_HEATMAP, {
      params: { days, direction, channelId },
    });
    return res.data;
  },
  async getKeywords(days?: number, channelId?: string): Promise<ApiResponse<WaKeywordCount[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_KEYWORDS, {
      params: { days, channelId },
    });
    return res.data;
  },
  /** Quality/tier snapshots for one connected number (default channel when omitted). */
  async getHealthHistory(
    days?: number,
    channelId?: string,
  ): Promise<ApiResponse<WaHealthSnapshot[]>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_HEALTH_HISTORY, {
      params: { days, channelId: channelId || undefined },
    });
    return res.data;
  },
  /**
   * Meta's send-eligibility verdict for a campaign's number + template.
   *
   * Kept off `previewCampaign` deliberately: that one is answered from our own
   * database, this one makes two live Graph calls, and pairing them would put a
   * Meta round-trip in front of the audience count every draft page shows.
   */
  async campaignPreflight(id: string): Promise<ApiResponse<WaCampaignPreflight>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_PREFLIGHT(id));
    return res.data;
  },

  async getMetaAnalytics(days = 30): Promise<ApiResponse<WaMetaAnalytics>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_META, { params: { days } });
    return res.data;
  },
  async getCsat(days?: number): Promise<ApiResponse<WaCsatSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CSAT, { params: { days } });
    return res.data;
  },
  /**
   * Saved segments compared side by side, plus campaigns split by audience type.
   * Omit `days` for lifetime totals, as the other summary endpoints do.
   */
  async getSegmentPerformance(
    days?: number,
    channelId?: string,
  ): Promise<ApiResponse<WaSegmentPerformance>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_SEGMENTS, {
      params: { days, channelId: channelId || undefined },
    });
    return res.data;
  },
  /**
   * Contacts followed by the month they were acquired. Counted in MONTHS, not
   * days — a retention curve over a seven-day window is a single point.
   */
  async getCohortReport(months?: number, channelId?: string): Promise<ApiResponse<WaCohortReport>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_COHORTS, {
      params: { months, channelId: channelId || undefined },
    });
    return res.data;
  },

  // ── Suppressions (do-not-contact list) ──
  /**
   * One PAGE of the do-not-contact list. It used to return the whole table: a
   * single "select all matching → Suppress" can put six figures of rows in
   * there, and rendering one `<tr>` each froze the settings page for good.
   */
  async listSuppressions(
    params: { page?: number; limit?: number; q?: string } = {},
  ): Promise<ApiResponse<WaSuppressionsPage>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SUPPRESSIONS, { params });
    return res.data;
  },
  async addSuppression(phone: string, reason?: string): Promise<ApiResponse<WaSuppression>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SUPPRESSIONS, { phone, reason });
    return res.data;
  },
  /** Bulk-load a supplied DNC list (parsed client-side into phone numbers). */
  async importSuppressions(
    phones: string[],
    reason?: string,
  ): Promise<ApiResponse<{ added: number; duplicates: number; skipped: number }>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SUPPRESSIONS_IMPORT, { phones, reason });
    return res.data;
  },
  async exportSuppressions(q?: string): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_SUPPRESSIONS_EXPORT, {
      params: q ? { q } : {},
      responseType: 'blob',
    });
    downloadBlob(res.data as Blob, 'wa-suppressions.csv');
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
  /**
   * How many contacts a segment currently matches, resolved server-side with the
   * campaign's own predicate — so the number shown beside a segment is the
   * number a campaign targeting it will reach.
   */
  async getSegmentCount(id: string): Promise<ApiResponse<{ count: number }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_SEGMENT_COUNT(id));
    return res.data;
  },
  async createSegment(body: {
    name: string;
    description?: string;
    filter: WaSegmentFilter;
  }): Promise<ApiResponse<WaSegment>> {
    const res = await api.post(API.SUPER_ADMIN.WA_SEGMENTS, body);
    return res.data;
  },
  async updateSegment(
    id: string,
    patch: Partial<{ name: string; description: string | null; filter: WaSegmentFilter }>,
  ): Promise<ApiResponse<WaSegment>> {
    const res = await api.patch(API.SUPER_ADMIN.WA_SEGMENT(id), patch);
    return res.data;
  },
  async deleteSegment(id: string): Promise<ApiResponse<unknown>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_SEGMENT(id));
    return res.data;
  },

  // ── Conversions (attribution tracking) ──
  async deleteConversion(id: string): Promise<ApiResponse<WaConversion>> {
    const res = await api.delete(API.SUPER_ADMIN.WA_CONVERSION(id));
    return res.data;
  },

  async recordConversion(body: {
    campaignId?: string;
    contactId?: string;
    valuePaise?: number;
    note?: string;
    occurredAt?: string;
  }): Promise<ApiResponse<WaConversion>> {
    const res = await api.post(API.SUPER_ADMIN.WA_CONVERSIONS, body);
    return res.data;
  },
  /**
   * The campaign's most recent conversions plus the full count. Bounded server
   * side — a campaign that keeps converting would otherwise send every row ever
   * attributed to it just to render the recent list.
   */
  async getCampaignConversions(
    id: string,
    limit?: number,
  ): Promise<ApiResponse<{ items: WaConversion[]; total: number }>> {
    const res = await api.get(API.SUPER_ADMIN.WA_CAMPAIGN_CONVERSIONS(id), {
      params: limit ? { limit } : {},
    });
    return res.data;
  },
  /** Omit `days` for lifetime totals; pass it to scope the count + value sum. */
  async getConversionSummary(days?: number): Promise<ApiResponse<WaConversionSummary>> {
    const res = await api.get(API.SUPER_ADMIN.WA_ANALYTICS_CONVERSIONS, { params: { days } });
    return res.data;
  },
};

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
