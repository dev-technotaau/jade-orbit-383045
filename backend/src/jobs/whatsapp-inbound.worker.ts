import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_INBOUND_QUEUE_NAME } from './whatsapp-inbound.queue';
import { getOrCreateChannel } from '../services/whatsapp-channel.service';
import { getTemplateByName } from '../services/whatsapp-template.service';
import {
  upsertContactByPhone,
  isOptOutMessage,
  optOutContact,
  normalizeWaPhone,
} from '../services/whatsapp-contact.service';
import { getOrCreateConversation, touchOnMessage } from '../services/whatsapp-conversation.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { waMessagesTotal, captureWaException } from '../utils/whatsapp-metrics';
import { addWhatsappMediaJob } from './whatsapp-media.queue';
import { reconcileRecipientStatus } from '../services/whatsapp-campaign.service';
import { handleInboundAutoReply } from '../services/whatsapp-autoreply.service';
import { emitWaEvent } from '../services/whatsapp-events.service';
import { Prisma } from '@prisma/client';
import { encryptJson } from '../utils/encryption';
import type {
  WaMessageType,
  WaMessageStatus,
  WaCampaignRecipientStatus,
  WaTemplateStatus,
} from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface WhatsappInboundJobData {
  eventRowId: string;
}

const TYPE_MAP: Record<string, WaMessageType> = {
  text: 'TEXT',
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
  document: 'DOCUMENT',
  sticker: 'STICKER',
  location: 'LOCATION',
  contacts: 'CONTACTS',
  interactive: 'INTERACTIVE',
  button: 'BUTTON',
  reaction: 'REACTION',
  system: 'SYSTEM',
};
const mapInboundType = (t: string): WaMessageType => TYPE_MAP[t] ?? 'UNSUPPORTED';

// Forward-only status state machine. FAILED and READ are terminal-rank.
const STATUS_RANK: Record<string, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 3,
};
function mapStatus(s: string): WaMessageStatus | null {
  const up = (s || '').toUpperCase();
  return ['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(up) ? (up as WaMessageStatus) : null;
}

/**
 * Derive a message's billable cost in paise from a Meta status `pricing` object.
 * Meta's pricing payload usually omits a per-message amount (it only carries
 * billable/pricing_model/category), so this returns null in the common case.
 * When an amount IS present it may be either a decimal in major currency units
 * (e.g. "0.0383") or already in minor units (`amount_in_minor_units`).
 */
function derivePricingPaise(pricing: any): number | null {
  if (!pricing) return null;
  const minor = pricing.amount_in_minor_units ?? pricing.amount_minor;
  if (minor != null) {
    const n = Number(minor);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  const major = pricing.amount ?? pricing.price;
  if (major != null) {
    const n = Number(major);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  return null;
}

/**
 * Map a CSAT button reply id/title to a 1-5 score, or null if it isn't a
 * rating. Accepts `rating_N` ids, a bare number 1-5, or good/ok/bad words
 * (→ 5/3/1). Case-insensitive on the textual forms.
 */
function parseCsatScore(...candidates: Array<string | null | undefined>): number | null {
  for (const raw of candidates) {
    if (raw == null) continue;
    const v = String(raw).trim().toLowerCase();
    if (!v) continue;
    const m = v.match(/^rating[_-]?([1-5])$/);
    if (m) return Number(m[1]);
    if (/^[1-5]$/.test(v)) return Number(v);
    if (v === 'good' || v.includes('good')) return 5;
    if (v === 'ok' || v === 'okay' || v.includes('okay') || v.includes('ok')) return 3;
    if (v === 'bad' || v.includes('bad')) return 1;
  }
  return null;
}

function extractInbound(msg: any): {
  type: WaMessageType;
  text: string | null;
  payload: any;
  mediaId: string | null;
  mediaMime: string | null;
} {
  const type = mapInboundType(msg.type);
  let text: string | null = null;
  let payload: any = null;
  let mediaId: string | null = null;
  let mediaMime: string | null = null;
  switch (msg.type) {
    case 'text':
      text = msg.text?.body ?? null;
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const m = msg[msg.type] ?? {};
      mediaId = m.id ?? null;
      mediaMime = m.mime_type ?? null;
      text = m.caption ?? null;
      // `m.voice` is true for WhatsApp voice notes (recorded), absent/false for
      // audio *files* — carried through so the UI can tell them apart.
      payload = { filename: m.filename, sha256: m.sha256, voice: m.voice };
      break;
    }
    case 'location':
      payload = msg.location;
      text = msg.location?.name ?? msg.location?.address ?? null;
      break;
    case 'contacts':
      payload = msg.contacts;
      text = '[contact card]';
      break;
    case 'interactive': {
      const i = msg.interactive ?? {};
      const reply = i.button_reply ?? i.list_reply;
      text = reply?.title ?? null;
      // WhatsApp Flows: an interactive `nfm_reply` carries the user's flow
      // submission as a JSON string in `response_json`. Parse it (best-effort)
      // and stash it on the payload so it isn't silently dropped.
      const nfm = i.nfm_reply;
      if (nfm) {
        let parsed: any = nfm.response_json ?? null;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            /* keep the raw string if it isn't valid JSON */
          }
        }
        payload = { ...i, nfm_reply: { ...nfm, response_json: parsed } };
        if (!text) text = nfm.name ?? nfm.body ?? '[flow response]';
      } else {
        payload = i;
      }
      break;
    }
    case 'button':
      text = msg.button?.text ?? null;
      payload = msg.button;
      break;
    case 'reaction':
      text = msg.reaction?.emoji ?? null;
      payload = msg.reaction;
      break;
    default:
      payload = msg[msg.type] ?? null;
  }
  return { type, text, payload, mediaId, mediaMime };
}

async function processMessages(value: any): Promise<void> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const channel = await getOrCreateChannel(phoneNumberId);
  const contacts: any[] = Array.isArray(value.contacts) ? value.contacts : [];

  for (const msg of value.messages ?? []) {
    if (!msg?.id || !msg?.from) continue;
    // Fast Redis dedup (NX + ~3d TTL); the WaMessage.wamid @unique is the durable backstop.
    try {
      const fresh = await redis.set(`wa:seen:${msg.id}`, '1', 'EX', 259200, 'NX');
      if (fresh === null) continue;
    } catch {
      /* Redis unavailable — fall through to DB dedup */
    }
    const dup = await prisma.waMessage.findUnique({
      where: { wamid: msg.id },
      select: { id: true },
    });
    if (dup) continue;

    const profileName = contacts.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
    // Detect a brand-new contact BEFORE the upsert so we can persist CTWA
    // attribution provenance only on first contact (task 2).
    const normalizedPhone = normalizeWaPhone(msg.from);
    const preExisting = await prisma.waContact
      .findUnique({ where: { phone: normalizedPhone }, select: { id: true } })
      .catch(() => null);
    const isNewContact = !preExisting;

    const contact = await upsertContactByPhone(msg.from, { name: profileName, waId: msg.from });
    const conversation = await getOrCreateConversation(channel.id, contact.id);
    const { type, text, payload, mediaId, mediaMime } = extractInbound(msg);
    const createdAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

    // Click-to-WhatsApp (CTWA) referral payload (ad/post that drove this chat).
    const referral = msg.referral ?? null;

    // ── Reactions (task 3) ──────────────────────────────────────────────────
    // A `reaction` targets a prior message by its WAMID. Attach the emoji to
    // that message's `reactions` JSON instead of leaving an orphan bubble.
    if (type === 'REACTION' && msg.reaction?.message_id) {
      const target = await prisma.waMessage.findUnique({
        where: { wamid: msg.reaction.message_id },
        select: { id: true, reactions: true, conversationId: true },
      });
      if (target) {
        const existing = Array.isArray(target.reactions) ? (target.reactions as any[]) : [];
        // Each side holds at most one reaction per message. Keep our outbound
        // (business) reaction; replace the customer's prior one. Legacy entries
        // (no `side`) predate two-sided reactions and were always the customer's,
        // so they're dropped as "theirs". `emoji === ''` = Meta's "removed" signal.
        const withoutTheirs = existing.filter((r) => r?.side === 'out');
        const reactions = msg.reaction.emoji
          ? [
              ...withoutTheirs,
              { from: msg.from, side: 'in', emoji: msg.reaction.emoji, at: createdAt },
            ]
          : withoutTheirs;
        await prisma.waMessage
          .update({ where: { id: target.id }, data: { reactions } })
          .catch(() => {});
        // Touch the window so the reaction still counts as inbound activity.
        await touchOnMessage(conversation.id, {
          preview: msg.reaction.emoji ? `Reacted ${msg.reaction.emoji}` : 'Removed a reaction',
          at: createdAt,
          inbound: true,
        });
        await prisma.waContact
          .update({ where: { id: contact.id }, data: { lastInboundAt: createdAt } })
          .catch(() => {});
        emitWa(
          'wa:reaction',
          {
            conversationId: conversation.id,
            targetWamid: msg.reaction.message_id,
            emoji: msg.reaction.emoji,
            from: msg.from,
            side: 'in',
          },
          conversation.id
        );
        continue; // handled — do not create an orphan REACTION message row
      }
      // Fall through to current behavior (create a REACTION row) if no target found.
    }

    // ── Create the inbound message row (task 1: swallow duplicate P2002) ────
    let message;
    try {
      message = await prisma.waMessage.create({
        data: {
          wamid: msg.id,
          channelId: channel.id,
          conversationId: conversation.id,
          contactId: contact.id,
          direction: 'INBOUND',
          type,
          status: 'DELIVERED',
          text,
          payload: payload ?? undefined,
          mediaId,
          mediaMime,
          contextWamid: msg.context?.id ?? null,
          referral: referral ?? undefined,
          createdAt,
        },
      });
    } catch (e) {
      // Belt-and-suspenders for a duplicate webhook racing past the Redis+DB
      // dedup: the wamid @unique violation (P2002) must not abort+replay the
      // whole job. Skip this already-persisted message and continue.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        logger.debug(`WhatsApp inbound: duplicate wamid ${msg.id} ignored (P2002)`);
        continue;
      }
      throw e;
    }

    // Inbound messages are delivered-to-us by definition.
    waMessagesTotal.inc({ direction: 'inbound', type, status: 'delivered' });

    await touchOnMessage(conversation.id, {
      preview: text ?? `[${type.toLowerCase()}]`,
      at: createdAt,
      inbound: true,
    });

    // Stamp the contact's last inbound timestamp (task 6) — drives the 24h
    // customer-service window independently of the conversation row.
    await prisma.waContact
      .update({
        where: { id: contact.id },
        data: {
          lastInboundAt: createdAt,
          // CTWA attribution for a brand-new contact (task 2): record the
          // referral source as consent/acquisition provenance.
          ...(isNewContact && referral
            ? {
                consentEvidence: encryptJson({
                  source: 'ctwa',
                  referral,
                  at: createdAt,
                }),
                attributes: {
                  ...((contact.attributes as Record<string, any> | null) ?? {}),
                  ctwaSource: referral.source_type ?? referral.source_id ?? 'ctwa',
                  ctwaHeadline: referral.headline ?? null,
                  ctwaCtwaClid: referral.ctwa_clid ?? null,
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      })
      .catch(() => {});

    // ── Opt-out detection (task 8) ──────────────────────────────────────────
    // Honor opt-out from plain text AND from interactive button/list replies
    // whose title or id matches an opt-out keyword.
    const optOutCandidates: Array<string | null | undefined> = [];
    if (type === 'TEXT') optOutCandidates.push(text);
    // Capture the interactive button/list reply id so the auto-reply engine can
    // match button-driven flows (null when this isn't a button/list reply).
    // Also track the reply title for CSAT word-matching (good/ok/bad).
    let buttonId: string | null = null;
    let buttonTitle: string | null = null;
    if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      optOutCandidates.push(reply?.title, reply?.id);
      buttonId = reply?.id ?? null;
      buttonTitle = reply?.title ?? null;
    }
    if (msg.type === 'button') {
      optOutCandidates.push(msg.button?.text, msg.button?.payload);
      buttonId = msg.button?.payload ?? null;
      buttonTitle = msg.button?.text ?? null;
    }

    // ── CSAT capture ────────────────────────────────────────────────────────
    // When a button/interactive reply lands on a conversation that requested a
    // CSAT rating and hasn't been scored yet, and the reply looks like a rating
    // (rating_N / 1-5 / good|ok|bad), record the score. Idempotent: the
    // updateMany guard (csatRequestedAt set, csatScore null) only fires once.
    if (buttonId || buttonTitle) {
      const score = parseCsatScore(buttonId, buttonTitle);
      if (score != null) {
        const csatUpdate = await prisma.waConversation
          .updateMany({
            where: { id: conversation.id, csatRequestedAt: { not: null }, csatScore: null },
            data: { csatScore: score, csatAt: createdAt },
          })
          .catch(() => null);
        if (csatUpdate && csatUpdate.count > 0) {
          emitWa(
            'wa:conversation',
            { conversationId: conversation.id, csatScore: score },
            conversation.id
          );
        }
      }
    }
    let justOptedOut = false;
    if (optOutCandidates.some((c) => isOptOutMessage(c))) {
      await optOutContact(contact.id).catch(() => {});
      justOptedOut = true;
      emitWaEvent('whatsapp.contact.opted_out', {
        contactId: contact.id,
        phone: contact.phone,
      }).catch(() => {});
    }

    // ── Reply funnel (task 7) ───────────────────────────────────────────────
    // If this contact is an as-yet-unreplied recipient of a campaign that has
    // been launched (RUNNING/COMPLETED), mark the reply and bump the counter.
    await recordCampaignReply(contact.id, createdAt).catch(() => {});

    emitWa('wa:message', { conversationId: conversation.id, message }, conversation.id);

    // ── Outbound integration events + auto-reply (wave 4b) ──────────────────
    // A brand-new contact firing its first message also created a fresh
    // conversation — surface that for downstream automations.
    if (isNewContact) {
      emitWaEvent('whatsapp.contact.created', {
        contactId: contact.id,
        phone: contact.phone,
      }).catch(() => {});
    }
    emitWaEvent('whatsapp.message.inbound', {
      conversationId: conversation.id,
      contactId: contact.id,
      phone: contact.phone,
      type,
      text,
    }).catch(() => {});

    // Fire the auto-reply engine only when the contact wasn't just opted out
    // (we must never auto-message someone who just asked to stop). isNewConversation
    // is computed cheaply: the inbound row we just wrote is the only message.
    if (!justOptedOut) {
      const isNewConversation =
        (await prisma.waMessage
          .count({ where: { conversationId: conversation.id } })
          .catch(() => 0)) === 1;
      handleInboundAutoReply({
        conversationId: conversation.id,
        contactId: contact.id,
        channelId: channel.id,
        text,
        buttonId,
        isNewConversation,
      }).catch(() => {});
    }

    // Durably archive inbound media to R2 for long-term access. Decoupled into
    // its own queue so a slow/large download never stalls inbox processing and
    // is retried on transient failure within Meta's ~30-day media window.
    if (mediaId) {
      await addWhatsappMediaJob({
        messageId: message.id,
        mediaId,
        mime: mediaMime ?? 'application/octet-stream',
      });
    }
  }
}

/**
 * Reply-funnel attribution: find the most recent un-replied campaign recipient
 * for this contact whose campaign has been launched (RUNNING or COMPLETED),
 * stamp `repliedAt` and increment that campaign's `repliedCount`. Idempotent —
 * a recipient is only counted once (we filter on `repliedAt: null`).
 */
async function recordCampaignReply(contactId: string, at: Date): Promise<void> {
  const recipient = await prisma.waCampaignRecipient.findFirst({
    where: {
      contactId,
      repliedAt: null,
      campaign: { status: { in: ['RUNNING', 'COMPLETED'] } },
    },
    orderBy: { sentAt: 'desc' },
    select: { id: true, campaignId: true },
  });
  if (!recipient) return;
  // Guard the increment with the same `repliedAt: null` predicate so two
  // concurrent inbound messages can't double-count.
  const res = await prisma.waCampaignRecipient.updateMany({
    where: { id: recipient.id, repliedAt: null },
    data: { repliedAt: at },
  });
  if (res.count > 0) {
    await prisma.waCampaign.update({
      where: { id: recipient.campaignId },
      data: { repliedCount: { increment: 1 } },
    });
  }
}

async function processStatuses(value: any): Promise<void> {
  for (const st of value.statuses ?? []) {
    const wamid = st?.id;
    const status = mapStatus(st?.status);
    if (!wamid || !status) continue;
    const ts = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();

    const msg = await prisma.waMessage.findUnique({ where: { wamid } });
    if (!msg) continue;
    // Forward-only: never regress the status.
    if (STATUS_RANK[status] <= STATUS_RANK[msg.status]) continue;

    const err = Array.isArray(st.errors) ? st.errors[0] : undefined;

    // Actual cost (task 5): persist the full pricing breakdown from the status
    // webhook. Meta's pricing object normally carries { billable, pricing_model,
    // category }; some versions also include a per-message amount — derive
    // `costPaise` only when an amount is present, else leave null.
    const pricingPatch: Prisma.WaMessageUpdateInput = {};
    if (st.pricing) {
      if (st.pricing.category != null) pricingPatch.pricingCategory = st.pricing.category;
      if (st.pricing.billable != null) pricingPatch.billable = Boolean(st.pricing.billable);
      if (st.pricing.pricing_model != null) pricingPatch.pricingModel = st.pricing.pricing_model;
      pricingPatch.costPaise = derivePricingPaise(st.pricing);
    }

    await prisma.waMessage.update({
      where: { wamid },
      data: {
        status,
        ...(status === 'DELIVERED' ? { deliveredAt: ts } : {}),
        ...(status === 'READ' ? { readAt: ts } : {}),
        ...(status === 'FAILED'
          ? {
              errorCode: err?.code != null ? String(err.code) : undefined,
              errorTitle: err?.title ?? err?.message,
            }
          : {}),
        ...pricingPatch,
      },
    });

    emitWa('wa:status', { wamid, status, conversationId: msg.conversationId }, msg.conversationId);
    // Campaign-recipient reconciliation (status-by-wamid → campaign counters).
    await reconcileRecipientStatus(wamid, status as unknown as WaCampaignRecipientStatus).catch(
      () => {}
    );
  }
}

// Map a Meta template-status-update `event` string to our WaTemplateStatus.
// Mirrors the (private) mapping in whatsapp-template.service so a webhook lands
// the same enum the manual sync would. Returns null for unrecognized events.
const TEMPLATE_STATUS_MAP: Record<string, WaTemplateStatus> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  PENDING: 'PENDING',
  PENDING_DELETION: 'DISABLED',
  IN_APPEAL: 'IN_APPEAL',
  FLAGGED: 'PAUSED',
};
function mapTemplateStatusEvent(event: string | null | undefined): WaTemplateStatus | null {
  if (!event) return null;
  return TEMPLATE_STATUS_MAP[String(event).toUpperCase()] ?? null;
}

/**
 * Handle the non-message/status Meta webhook fields (best-effort; never throws):
 *  - message_template_status_update → reconcile the matching WaTemplate's status
 *    (+ rejectionReason) by name_language.
 *  - phone_number_quality_update → update the WaChannel quality/tier and write a
 *    WaChannelHealthSnapshot row.
 *  - account_alerts / account_update → log a warning (no model).
 */
async function processChangeField(field: string, value: any): Promise<void> {
  try {
    switch (field) {
      case 'message_template_status_update': {
        const name = value?.message_template_name;
        const language = value?.message_template_language;
        const status = mapTemplateStatusEvent(value?.event);
        if (!name || !language || !status) break;
        const tpl = await getTemplateByName(name, language).catch(() => null);
        if (!tpl) break;
        await prisma.waTemplate
          .update({
            where: { id: tpl.id },
            data: {
              status,
              rejectionReason: status === 'REJECTED' ? (value?.reason ?? null) : null,
              lastSyncedAt: new Date(),
            },
          })
          .catch(() => {});
        break;
      }
      case 'phone_number_quality_update': {
        const phoneNumberId = value?.metadata?.phone_number_id ?? value?.phone_number_id;
        if (!phoneNumberId) break;
        const channel = await getOrCreateChannel(phoneNumberId).catch(() => null);
        if (!channel) break;
        const quality = String(value?.event ?? '').toUpperCase();
        const qualityRating = ['GREEN', 'YELLOW', 'RED'].includes(quality)
          ? (quality as any)
          : channel.qualityRating;
        const messagingTier = value?.current_limit ?? channel.messagingTier;
        await prisma.waChannel
          .update({
            where: { id: channel.id },
            data: { qualityRating, messagingTier },
          })
          .catch(() => {});
        await prisma.waChannelHealthSnapshot
          .create({
            data: { channelId: channel.id, quality: qualityRating, tier: messagingTier ?? null },
          })
          .catch(() => {});
        break;
      }
      case 'account_alerts':
      case 'account_update': {
        logger.warn(
          `WhatsApp account webhook (${field}): ${JSON.stringify(value ?? {}).slice(0, 500)}`
        );
        break;
      }
      default:
        // Unhandled field — leave the audit row (WaWebhookEvent) as the record.
        break;
    }
  } catch (e: any) {
    logger.warn(`WhatsApp inbound: processChangeField(${field}) failed: ${e?.message ?? e}`);
  }
}

/**
 * Processes a single persisted `WaWebhookEvent` row by its id: parses inbound
 * messages → contacts / conversations / messages (+ opt-out, real-time emit),
 * and delivery statuses → the forward-only status state machine. Idempotent
 * (dedup on WAMID + the event's `processedAt` flag).
 *
 * This is the exact unit of work a BullMQ job runs, factored out as a named
 * export so it can be invoked directly (e.g. in tests) without standing up the
 * BullMQ worker / Redis connection. The worker simply forwards to it.
 */
export async function processInboundEvent(
  eventRowId: string
): Promise<{ processed: boolean; duplicate?: boolean; eventType?: string }> {
  const event = await prisma.waWebhookEvent.findUnique({
    where: { id: eventRowId },
  });
  if (!event) {
    logger.warn(`WhatsApp inbound: event ${eventRowId} not found`);
    return { processed: false };
  }
  if (event.processedAt) return { processed: true, duplicate: true };

  const payload: any = event.payload;
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const hasMessages = Array.isArray(value.messages) && value.messages.length;
      const hasStatuses = Array.isArray(value.statuses) && value.statuses.length;
      if (hasMessages) {
        await processMessages(value);
      }
      if (hasStatuses) {
        await processStatuses(value);
      }
      // Other webhook fields (template status, phone-number quality,
      // account alerts/updates) — best-effort, never aborts the job.
      if (!hasMessages && !hasStatuses && typeof change?.field === 'string') {
        await processChangeField(change.field, value);
      }
    }
  }

  await prisma.waWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });
  return { processed: true, eventType: event.eventType };
}

/**
 * Processes a persisted `WaWebhookEvent`: parses inbound messages → contacts /
 * conversations / messages (+ opt-out, real-time emit), and delivery statuses →
 * the forward-only status state machine. Idempotent (dedup on WAMID + the
 * event's `processedAt` flag).
 */
export function createWhatsappInboundWorker(): Worker<WhatsappInboundJobData> {
  const worker = new Worker<WhatsappInboundJobData>(
    WHATSAPP_INBOUND_QUEUE_NAME,
    async (job: Job<WhatsappInboundJobData>) => {
      return processInboundEvent(job.data.eventRowId);
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_WHATSAPP_CONCURRENCY, 10),
      lockDuration: 60000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp inbound job ${job?.id} failed: ${err.message}`);
    void captureWaException(err, { jobId: job?.id });
  });

  return worker;
}
