import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_INBOUND_QUEUE_NAME } from './whatsapp-inbound.queue';
import {
  getOrCreateChannel,
  getDefaultChannel,
  recordChannelHealthSnapshot,
} from '../services/whatsapp-channel.service';
import { getTemplateByName, mapTemplateStatus } from '../services/whatsapp-template.service';
import {
  upsertContactByPhone,
  isOptOutMessageAsync,
  isOptInMessageAsync,
  optOutContact,
  optInContact,
  normalizeWaPhone,
  noteMarketingRefusal,
  mergeContacts,
} from '../services/whatsapp-contact.service';
import { isMarketingRefusedCode } from '../services/whatsapp-error-codes';
import {
  getOrCreateConversation,
  applyMessageTouch,
  touchOnMessage,
  extendWindowFromMeta,
} from '../services/whatsapp-conversation.service';
import { emitWa } from '../utils/whatsapp-realtime';
import {
  waMessagesTotal,
  waAccountAlertsTotal,
  captureWaException,
} from '../utils/whatsapp-metrics';
import { addWhatsappMediaJob } from './whatsapp-media.queue';
import { isR2Configured } from '../services/storage.service';
import { reconcileRecipientStatuses } from '../services/whatsapp-campaign.service';
import { addWhatsappAutoReplyJob } from './whatsapp-autoreply.queue';
import { sendOptOutConfirmation } from '../services/whatsapp-send.service';
import { getWaSettings } from '../services/whatsapp-settings.service';
import { emitWaEvent } from '../services/whatsapp-events.service';
import { recordFlowResponse } from '../services/whatsapp-flow.service';
import { AuditService } from '../services/audit.service';
import { Prisma } from '@prisma/client';
import { encryptJson } from '../utils/encryption';
import { previewForMessage } from '../utils/wa-preview';
import { waInboundUnsupportedTotal } from '../utils/whatsapp-metrics';
import type {
  WaMessageType,
  WaMessageStatus,
  WaCampaignRecipientStatus,
  WaTemplateQuality,
  WaTemplateCategory,
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
  // A cart submitted from a catalog or product message. Without this key every
  // order fell through to UNSUPPORTED and its line items were dropped into the
  // generic payload branch, so the inbox showed an empty bubble for what is
  // literally a customer trying to buy something.
  order: 'ORDER',
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

/** What Meta's status `pricing` object says a message cost, once parsed. */
interface DerivedPricing {
  /** The amount exactly as quoted, in MAJOR units of `currency`. */
  amount: string | null;
  /** ISO 4217 code from the payload, uppercased; null when it carried none. */
  currency: string | null;
  /** The same amount rounded to whole minor units, for the legacy sums. */
  minor: number | null;
}

/**
 * Derive a message's billable cost from a Meta status `pricing` object.
 *
 * Meta's pricing payload usually omits a per-message amount (it only carries
 * billable/pricing_model/category), so every field here is null in the common
 * case. When an amount IS present it may be either a decimal in major currency
 * units (e.g. "0.0383") or already in minor units (`amount_in_minor_units`).
 *
 * The exact amount and its currency are BOTH kept. Rounding to whole minor units
 * was all that was stored, so 0.0383 became 4 — a per-message error of several
 * percent that compounds over hundreds of thousands of rows — and on a WABA that
 * bills in anything but INR those foreign cents were then summed into a total
 * printed with a rupee sign. `amount` is passed to Prisma as the quoted string
 * so the Decimal column takes the digits verbatim rather than via a float.
 */
function derivePricing(pricing: any): DerivedPricing {
  const empty: DerivedPricing = { amount: null, currency: null, minor: null };
  if (!pricing) return empty;
  const currency =
    typeof pricing.currency === 'string' && pricing.currency.trim()
      ? pricing.currency.trim().toUpperCase()
      : null;

  const minorRaw = pricing.amount_in_minor_units ?? pricing.amount_minor;
  if (minorRaw != null) {
    const n = Number(minorRaw);
    if (!Number.isFinite(n)) return { ...empty, currency };
    // Already exact: minor units are whole by definition, so the major-unit
    // amount is a plain divide with no precision to lose.
    return { amount: String(n / 100), currency, minor: Math.round(n) };
  }

  const majorRaw = pricing.amount ?? pricing.price;
  if (majorRaw != null) {
    const n = Number(majorRaw);
    if (!Number.isFinite(n)) return { ...empty, currency };
    return { amount: String(majorRaw), currency, minor: Math.round(n * 100) };
  }
  return { ...empty, currency };
}

/**
 * How long after a CSAT rating a plain text message is still read as the
 * comment explaining it. Long enough for a customer to type a sentence, short
 * enough that tomorrow's unrelated "hi" is not filed as feedback.
 */
const CSAT_COMMENT_WINDOW_MS = 15 * 60 * 1000;

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
      // `m.animated` is Meta's own sticker flag and was dropped here, so nothing
      // downstream could tell an animated sticker from a static one — which is
      // exactly what decides whether the bubble may use the still derivative.
      payload = {
        filename: m.filename,
        sha256: m.sha256,
        voice: m.voice,
        ...(m.animated != null ? { animated: Boolean(m.animated) } : {}),
      };
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
        // An address_message reply comes back through the same nfm_reply channel as
        // a Flow, and its fields sit one level down under `values`. Without this the
        // conversation list previewed a delivery address as the literal string
        // 'address_message', and the search index held nothing to find it by.
        const values = parsed && typeof parsed === 'object' ? parsed.values : null;
        if (!text && nfm.name === 'address_message' && values && typeof values === 'object') {
          const parts = [values.address, values.city, values.state, values.in_pin_code]
            .map((v: unknown) => (v == null ? '' : String(v).trim()))
            .filter(Boolean);
          text = parts.length ? `[address] ${parts.join(', ')}` : '[address]';
        }
        if (!text) text = nfm.name ?? nfm.body ?? '[flow response]';
      } else {
        payload = i;
      }
      break;
    }
    case 'order': {
      const order = msg.order ?? {};
      const items = Array.isArray(order.product_items) ? order.product_items : [];
      // Normalised at ingest so the inbox renderer, an export and any future
      // order integration all read the same shape rather than each re-deriving
      // it from Meta's raw keys.
      const products = items.map((it: any) => ({
        productRetailerId: it?.product_retailer_id ?? null,
        quantity: Number(it?.quantity ?? 0) || 0,
        itemPrice: Number(it?.item_price ?? 0) || 0,
        currency: it?.currency ?? null,
      }));
      const totalQty = products.reduce((n: number, p: any) => n + p.quantity, 0);
      const total = products.reduce((n: number, p: any) => n + p.quantity * p.itemPrice, 0);
      const currency = products.find((p: any) => p.currency)?.currency ?? '';
      payload = {
        catalogId: order.catalog_id ?? null,
        products,
        totalQuantity: totalQty,
        totalPrice: total,
        currency,
        note: order.text ?? null,
      };
      // `text` is what the conversation list preview and the search index read,
      // so it has to say something an operator can act on. The customer's own
      // note wins when they left one.
      const summary =
        `[order] ${totalQty} item${totalQty === 1 ? '' : 's'}` +
        (total > 0 ? ` · ${currency} ${total.toFixed(2)}` : '');
      text = order.text ? `${summary} — ${order.text}` : summary;
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
    case 'system':
      // A number-change / identity notice. Meta puts the human-readable line in
      // `system.body`.
      payload = msg.system;
      text = msg.system?.body ?? 'This contact changed their phone number';
      break;
    default:
      // Anything Meta adds that we do not model yet. Leaving `text` null wrote a
      // row with no media id and no body, which the thread rendered as a
      // completely EMPTY bubble while the conversation list preview said
      // "[order]" — the agent could see that something had arrived and could not
      // see what. A labelled placeholder is at least actionable.
      // Meta explains itself on `errors` — e.g. {code:131051, title:'Message type
      // is not currently supported'} — and for `type:'unsupported'` there is no
      // `msg.unsupported` key at all, so the payload was simply null. A poll, a
      // view-once photo and a live location therefore all rendered as the same
      // flat "[unsupported message]": the agent could not tell the customer what
      // had not arrived, and nobody could measure which type was worth building.
      waInboundUnsupportedTotal.inc({ type: String(msg.type ?? 'unknown') });
      payload = { raw: msg[msg.type] ?? null, errors: msg.errors ?? null };
      text =
        (Array.isArray(msg.errors) && typeof msg.errors[0]?.title === 'string'
          ? msg.errors[0].title
          : null) ?? `[${msg.type ?? 'unsupported'} message]`;
  }
  return { type, text, payload, mediaId, mediaMime };
}

/**
 * Reconcile the two inbound signals that say something about WHO the customer
 * is rather than what they said: a `system` notice, and the `identity` block
 * Meta attaches to an otherwise ordinary message.
 *
 * A number change used to be filed as a bubble in the old thread and nothing
 * else: the next message from the new number created a SECOND contact and a
 * SECOND conversation, and the history, tags, consent evidence and — worst —
 * the OPT-OUT stayed stranded on the old row. Marketing could then legitimately
 * go to a person who had asked us to stop, because the record of them asking
 * lived under a phone number they no longer use.
 *
 * `mergeContacts` is the existing merge used by the duplicate-contacts report;
 * it tightens consent rather than relaxing it, which is exactly the rule this
 * path needs.
 *
 * An identity change (a re-registered device / new phone on the same number) is
 * not a merge — it is the end-to-end identity guarantee resetting, so it is
 * flagged on the conversation for an agent to re-verify who they are talking to.
 */
async function reconcileIdentitySignals(
  msg: any,
  channelId: string,
  conversationId: string
): Promise<void> {
  const sys = msg?.system ?? {};
  const kind = String(sys.type ?? '');

  // Meta has used two spellings for both notices across Graph versions, and the
  // field carrying the new id moved from `new_wa_id` (v11 and earlier) to
  // `wa_id` (v12+) — accept every shape rather than silently ignoring a payload
  // because the account is pinned to a different version.
  const newWaId = sys.wa_id ?? sys.new_wa_id ?? null;
  const oldWaId = sys.customer ?? (newWaId && newWaId !== msg.from ? msg.from : null);
  if (
    (kind === 'customer_changed_number' || kind === 'user_changed_number' || newWaId) &&
    newWaId
  ) {
    const oldPhone = oldWaId ? normalizeWaPhone(String(oldWaId)) : null;
    const newPhone = normalizeWaPhone(String(newWaId));
    if (oldPhone && oldPhone !== newPhone) {
      const [survivor, loser] = await Promise.all([
        // The number they will be messaging from now is the survivor, so it must
        // exist even if we have never heard from it.
        upsertContactByPhone(String(newWaId), { waId: String(newWaId) }),
        prisma.waContact.findUnique({ where: { phone: oldPhone }, select: { id: true } }),
      ]);
      if (loser && loser.id !== survivor.id) {
        const result = await mergeContacts(survivor.id, loser.id, 'system:customer_changed_number');
        logger.info(
          `WhatsApp number change: merged ${oldPhone} into ${newPhone} ` +
            `(${result.messagesMoved} message(s), ${result.conversationsMoved} thread(s) moved` +
            `${result.consentTightened ? ', opt-out carried over' : ''})`
        );
        await AuditService.log({
          action: 'WA_CONTACT_MERGE',
          entity: 'WaContact',
          entityId: survivor.id,
          performedBy: 'system',
          details: { reason: 'customer_changed_number', mergedId: loser.id, channelId },
        });
      }
    }
    return;
  }

  if (kind === 'customer_identity_changed' || kind === 'user_identity_changed' || msg?.identity) {
    // `acknowledged: true` means Meta has already reconciled it for us; only an
    // unacknowledged change is something a human has to look at.
    if (msg?.identity?.acknowledged === true) return;

    // Raise the banner once per IDENTITY, not once per message carrying it.
    // Meta hangs the identity block off ordinary inbound messages for as long as
    // the change stands, so stamping unconditionally would re-raise a warning the
    // agent had just dismissed on every reply the customer sent — and the button
    // that clears it would visibly not work. `identity.hash` is the identity key
    // the change belongs to, so it survives the dismissal as the memory of what
    // was already verified; a genuinely new identity carries a new hash and does
    // raise the banner again.
    const hash = msg?.identity?.hash ? String(msg.identity.hash) : null;
    const current = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { identityHash: true, identityChangedAt: true },
    });
    // With no hash to compare (the `system` notice shape carries none) fall back
    // to "is a banner already up" — which errs towards showing a security warning
    // twice rather than suppressing one.
    if (hash ? current?.identityHash === hash : !!current?.identityChangedAt) return;

    const conv = await prisma.waConversation.update({
      where: { id: conversationId },
      data: { identityChangedAt: new Date(), identityHash: hash },
    });
    emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
    logger.warn(
      `WhatsApp identity change flagged on conversation ${conversationId} — the customer's ` +
        'device or security code changed and has not been verified'
    );
  }
}

/**
 * @returns true when the batch could not be routed to any channel — the caller
 * leaves the event unprocessed so the recovery pass replays it.
 */
async function processMessages(value: any): Promise<boolean> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  // `metadata.phone_number_id` is how a batch is routed to a channel, and it used
  // to be treated as mandatory: absent → a bare `return`, with no log, no message
  // row, and the caller still stamping `processedAt`. A payload shaped even
  // slightly differently (a Graph version bump, a partially-populated retry) ate
  // the customer's message permanently — nothing in the inbox, nothing in the
  // logs, and the recovery pass skipping the event because it looked complete.
  //
  // This deployment is single-number in practice, so the default channel IS the
  // right destination when Meta does not name one; only an install with no
  // channel at all is genuinely unroutable, and that defers (bounded by
  // `deferAttempts`) rather than drops.
  const channel = phoneNumberId
    ? await getOrCreateChannel(phoneNumberId)
    : await getDefaultChannel();
  if (!channel) {
    logger.warn(
      'WhatsApp inbound: messages batch carries no metadata.phone_number_id and no ' +
        'default channel is configured — left unprocessed for the recovery pass'
    );
    return true;
  }
  if (!phoneNumberId) {
    logger.warn(
      'WhatsApp inbound: messages batch carries no metadata.phone_number_id — routing ' +
        `${value?.messages?.length ?? 0} message(s) to the default channel ${channel.phoneNumberId}`
    );
  }
  const contacts: any[] = Array.isArray(value.contacts) ? value.contacts : [];

  for (const msg of value.messages ?? []) {
    if (!msg?.id || !msg?.from) continue;

    // `request_welcome` is Meta telling us a customer OPENED the chat — it is not
    // something they said. Nothing filtered it, so it fell through to the
    // unsupported branch and became a "[request_welcome message]" bubble in the
    // thread, the same string in the conversation-list preview, and +1 on the
    // unread badge the whole triage workflow keys off — for a customer who had
    // not written a word. Turning ON the setting that asks Meta to send these
    // (Settings -> "Tell us when a customer opens the chat") is what produced it.
    //
    // Skipped before the row is created, the same shape the reaction branch uses.
    // The conversation is not touched either: an opened chat does not extend the
    // 24h window, and pretending otherwise would let an agent send a free-form
    // reply that Meta then refuses.
    if (msg.type === 'request_welcome') continue;

    // Dedup is DB-first on purpose. The Redis key used to be written here, up
    // front, and a `null` reply (key already present) short-circuited with
    // `continue` — without ever consulting the database.
    //
    // That silently lost messages. The WaMessage row is not created until much
    // further down, and everything in between can throw (contact upsert,
    // conversation upsert, a P2024 pool timeout). The queue retries the whole
    // batch, but on the retry the WAMID was already marked seen, so the message
    // was skipped forever — no row, no error, and a 3-day TTL before the key
    // even expired. For a product that IS the inbox, that is the worst
    // available failure.
    //
    // `WaMessage.wamid` is @unique, so the DB is the authority; Redis is only a
    // cheap short-circuit for the common duplicate-webhook case and is written
    // AFTER the row exists (see below).
    const dup = await prisma.waMessage.findUnique({
      where: { wamid: msg.id },
      select: { id: true },
    });
    if (dup) continue;

    try {
      // Already handled by a concurrent worker that got as far as persisting.
      const seen = await redis.get(`wa:seen:${msg.id}`);
      if (seen) continue;
    } catch {
      /* Redis unavailable — the @unique constraint below still protects us */
    }

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

    // ── Create the inbound message row + the thread fields it drives ─────────
    //    (task 1: swallow duplicate P2002)
    //
    // One transaction. The row and the conversation's lastMessageAt /
    // lastMessagePreview / unreadCount / windowExpiresAt used to be two
    // independent writes, so a crash or a pool timeout between them stored the
    // customer's message while leaving the thread stale: it kept its old preview
    // and its old position in the inbox, and a missed windowExpiresAt understated
    // the 24h window, which made the agent's next free-form reply bounce as
    // WA_WINDOW_CLOSED. The P2002 swallow stays OUTSIDE the transaction, so a
    // duplicate webhook still skips cleanly.
    let message;
    let touchedConversation;
    try {
      const written = await prisma.$transaction(async (tx) => {
        const row = await tx.waMessage.create({
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
            // Where the durable copy stands, from the first moment there is
            // something to archive. Without it the inbox could not tell "the
            // archive is still downloading" from "there is no archive and Meta's
            // own copy has expired", and rendered the same "Couldn't load image"
            // for both — one of which is temporary and one of which is the file
            // being gone for good.
            mediaArchiveStatus: mediaId ? (isR2Configured() ? 'PENDING' : 'SKIPPED') : null,
            contextWamid: msg.context?.id ?? null,
            referral: referral ?? undefined,
            createdAt,
          },
        });
        // Enlisted in the same transaction on purpose: the unread recount inside
        // has to see the row created just above, and from the global client it is
        // still uncommitted — every inbound message would count one short.
        const conv = await applyMessageTouch(tx, conversation.id, {
          // `text` holds only the CAPTION for media, so this used to render a
          // payment screenshot, a sticker and a signed PDF identically.
          preview: previewForMessage(type, text, payload),
          at: createdAt,
          inbound: true,
        });
        return { row, conv };
      });
      message = written.row;
      touchedConversation = written.conv;
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

    // WhatsApp Flows: promote a submission to a queryable row.
    //
    // The parse above tucked the answers into WaMessage.payload, where nothing
    // ever read them — so what a customer actually filled in was captured and
    // invisible. Fire-and-forget: a Flow bookkeeping failure must never break
    // message ingestion.
    if (type === 'INTERACTIVE') {
      const nfm = (payload as any)?.nfm_reply;
      if (nfm?.response_json) {
        void recordFlowResponse({
          conversationId: conversation.id,
          contactId: contact.id,
          messageId: message.id,
          flowToken: nfm.flow_token ?? null,
          responseJson: nfm.response_json,
        });
      }
    }

    // Mark seen only now that the row is durable. Written after the create (not
    // before it) so a failure anywhere above leaves the WAMID unmarked and the
    // queue's retry can still process it. ~3d TTL; fire-and-forget because the
    // @unique constraint above is the real guarantee.
    redis.set(`wa:seen:${msg.id}`, '1', 'EX', 259200, 'NX').catch(() => {});

    // Inbound messages are delivered-to-us by definition.
    waMessagesTotal.inc({ direction: 'inbound', type, status: 'delivered' });

    // Announced only now that the transaction has committed. Emitting from inside
    // it would tell the inbox about a message a rollback then erased.
    emitWa(
      'wa:conversation',
      { conversationId: conversation.id, conversation: touchedConversation },
      conversation.id
    );

    // Stamp the contact's last inbound timestamp (task 6) — drives the 24h
    // customer-service window independently of the conversation row.
    await prisma.waContact
      .update({
        where: { id: contact.id },
        data: {
          lastInboundAt: createdAt,
          // CTWA attribution for a brand-new contact (task 2): record the
          // referral source as consent/acquisition provenance.
          //
          // The identifiers ALSO go into plain columns. They used to live only
          // inside the encrypted consentEvidence blob and the free-form
          // `attributes` JSON, so "which ad produced these conversations?" could
          // not be answered by any query — an operator paying for click-to-WhatsApp
          // ads had the join key (ctwa_clid) in the database and no way to group on
          // it or export it back to Ads Manager.
          ...(isNewContact && referral
            ? {
                consentEvidence: encryptJson({
                  source: 'ctwa',
                  referral,
                  at: createdAt,
                }),
                ctwaSourceId: referral.source_id ? String(referral.source_id) : null,
                ctwaSourceType: referral.source_type ? String(referral.source_type) : null,
                ctwaHeadline: referral.headline ? String(referral.headline) : null,
                ctwaClid: referral.ctwa_clid ? String(referral.ctwa_clid) : null,
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

    // ── CSAT free-text comment ──────────────────────────────────────────────
    // A rating is a tap; the reason is whatever the customer types next. That
    // follow-up text was stored only as an ordinary message, so `csatComment`
    // was a column nothing ever wrote and the "why" behind a 1/5 was buried in
    // the thread. Capture the first text message that lands within
    // CSAT_COMMENT_WINDOW_MS of the rating.
    //
    // The in-memory guards come first deliberately: `conversation` was loaded
    // before this message was processed, so this costs one extra write only on
    // the handful of inbounds that immediately follow an unexplained rating,
    // not on every text message. The updateMany's own `csatComment: null` guard
    // is what makes it first-comment-wins under concurrent inbounds.
    if (
      type === 'TEXT' &&
      text?.trim() &&
      conversation.csatScore != null &&
      conversation.csatComment == null &&
      conversation.csatAt != null &&
      createdAt.getTime() - conversation.csatAt.getTime() <= CSAT_COMMENT_WINDOW_MS
    ) {
      const comment = text.trim().slice(0, 1000);
      const commentUpdate = await prisma.waConversation
        .updateMany({
          where: { id: conversation.id, csatScore: { not: null }, csatComment: null },
          data: { csatComment: comment },
        })
        .catch(() => null);
      if (commentUpdate && commentUpdate.count > 0) {
        emitWa(
          'wa:conversation',
          { conversationId: conversation.id, csatComment: comment },
          conversation.id
        );
      }
    }
    let justOptedOut = false;
    let justOptedIn = false;
    // Re-subscribe is checked FIRST and short-circuits, so ordering is
    // deterministic rather than depending on which keyword list a word lands in.
    // Opting out used to be a one-way door: a customer who replied START stayed
    // suppressed until an operator noticed by hand.
    const optInHits = await Promise.all(optOutCandidates.map((c) => isOptInMessageAsync(c)));
    if (optInHits.some(Boolean)) {
      await optInContact(contact.id, {
        source: 'reply',
        campaignId: await attributableCampaignId(contact.id),
        evidence: { wamid: msg.id ?? null, text: text ?? null, at: createdAt.toISOString() },
      }).catch(() => {});
      justOptedIn = true;
      emitWaEvent('whatsapp.contact.opted_in', {
        contactId: contact.id,
        phone: contact.phone,
      }).catch(() => {});
    }
    // Async so the operator's own WaSettings keywords are honoured, not just the
    // built-in and env lists (the settings editor saved them and nothing read
    // them).
    const optOutHits = justOptedIn
      ? []
      : await Promise.all(optOutCandidates.map((c) => isOptOutMessageAsync(c)));
    if (optOutHits.some(Boolean)) {
      // Persist WHAT triggered it. A disputed opt-out previously left only a
      // timestamp — no message id, no text, nothing to reconstruct the decision
      // from once the message itself had aged out of retention.
      await optOutContact(contact.id, {
        source: 'reply',
        // WHICH campaign they were reacting to. Without it an opt-out spike is a
        // number with no cause, and the operator cannot tell which send burned
        // the list — the single most important negative signal for a paid sender.
        campaignId: await attributableCampaignId(contact.id),
        evidence: { wamid: msg.id ?? null, text: text ?? null, at: createdAt.toISOString() },
      }).catch(() => {});
      justOptedOut = true;
      emitWaEvent('whatsapp.contact.opted_out', {
        contactId: contact.id,
        phone: contact.phone,
      }).catch(() => {});

      // Acknowledge it. The auto-reply engine is skipped for someone who just
      // asked to stop (correctly — nothing promotional may follow), which left
      // the customer with no signal at all that their STOP had registered. The
      // usual next move is to send STOP again and then report the business, so
      // the silence costs exactly the quality rating the opt-out was meant to
      // protect. One short line, inside the window their own message opened,
      // and past the suppression row we have just written for them.
      const ackText = (await getWaSettings().catch(() => null))?.optOutConfirmationMessage?.trim();
      if (ackText) {
        await sendOptOutConfirmation(conversation.id, ackText).catch((e) => {
          // Best-effort: a failed acknowledgement must never fail the job and
          // replay the opt-out (and with it a second acknowledgement).
          logger.warn(`WhatsApp opt-out confirmation failed: ${(e as Error).message}`);
        });
      }
    }

    // ── Reply funnel (task 7) ───────────────────────────────────────────────
    // If this contact is an as-yet-unreplied recipient of a campaign that has
    // been launched (RUNNING/COMPLETED), mark the reply and bump the counter.
    await recordCampaignReply(contact.id, createdAt).catch(() => {});

    emitWa('wa:message', { conversationId: conversation.id, message }, conversation.id);

    // ── Identity reconciliation (system notices + identity changes) ─────────
    // Runs AFTER the row is written and announced, so the notice is visible in
    // the thread it arrived on before a merge repoints that thread. Best-effort:
    // the message is already durable, and throwing here would replay the batch
    // into the dedup guard — which skips the message and never retries the merge.
    //
    // `identity` is NOT a message type of its own: Meta hangs it off an ORDINARY
    // inbound message (a text, an image) when that customer has re-registered
    // WhatsApp on a new device. Gating this on `type === 'SYSTEM'` alone meant
    // the security signal was only ever looked for on the one message shape that
    // does not carry it, so the "verify who you are talking to" banner never
    // appeared for the case it exists for — an agent could hand account details
    // to whoever now holds that number, with the warning sitting unread in the
    // webhook payload.
    if (type === 'SYSTEM' || msg?.identity) {
      await reconcileIdentitySignals(msg, channel.id, conversation.id).catch((e) => {
        logger.error(
          `WhatsApp identity reconciliation failed for ${msg.id}: ${(e as Error).message}`
        );
      });
    }

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

    // Queue the auto-reply engine only when the contact wasn't just opted out
    // (we must never auto-message someone who just asked to stop) and is not
    // blocked.
    //
    // The block gate is the local fallback for Meta's own block: Meta applies a
    // block to the numbers it could match, and a contact it refused (or one
    // blocked while Graph was unreachable) still gets their messages delivered
    // to us. Answering them automatically is the exact opposite of what "block"
    // means to the operator who pressed it.
    // `type !== 'SYSTEM'` because a number-change notice is Meta talking, not the
    // customer: answering it with a greeting or a keyword rule would message
    // somebody who has said nothing, and after a merge the contact this job
    // names may already be a tombstone.
    if (!justOptedOut && !contact.isBlocked && type !== 'SYSTEM') {
      // `isNewContact` is resolved from a pre-upsert existence check, not from
      // "this conversation has exactly one message". That count was taken AFTER
      // the inbound row was written, so two messages arriving together both read
      // 2 and neither got a welcome — and a dormant contact whose history had
      // been pruned read 1 again and was welcomed a second time.
      //
      // Enqueued, not fired and forgotten. Run inline, the engine's only
      // failure handling was a catch that threw the error away: a Meta 500 or a
      // pool timeout meant the customer's welcome or away reply simply never
      // arrived, nothing retried it and the operator saw nothing at all. As a
      // job it is retried with backoff, and the job id is the inbound WAMID so
      // a webhook Meta re-delivers cannot produce a second reply.
      await addWhatsappAutoReplyJob({
        wamid: msg.id,
        conversationId: conversation.id,
        contactId: contact.id,
        channelId: channel.id,
        text,
        buttonId,
        // Rules used to match against the button ID alone whenever one was
        // present, so a quick-reply titled "Pricing" with id `btn_1` could not be
        // matched by a rule on the word the customer actually saw.
        buttonTitle,
        isNewConversation: isNewContact,
      });
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
  return false;
}

/**
 * Reply-funnel attribution: find the most recent un-replied campaign recipient
 * for this contact whose campaign has been launched (RUNNING or COMPLETED),
 * stamp `repliedAt` and increment that campaign's `repliedCount`. Idempotent —
 * a recipient is only counted once (we filter on `repliedAt: null`).
 */
/**
 * How long after a send an inbound message can still be credited to it.
 *
 * 72h rather than Meta's 24h service window: a customer who replies on day two is
 * plainly responding to the campaign, but one replying months later is not.
 */
const REPLY_ATTRIBUTION_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * The campaign a contact's inbound message is plausibly reacting to — the most
 * recent one that actually reached them inside the same 72h attribution window
 * the reply funnel uses. null when nothing qualifies.
 */
async function attributableCampaignId(contactId: string): Promise<string | null> {
  const recipient = await prisma.waCampaignRecipient
    .findFirst({
      where: {
        contactId,
        sentAt: { not: null, gte: new Date(Date.now() - REPLY_ATTRIBUTION_WINDOW_MS) },
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
      orderBy: { sentAt: 'desc' },
      select: { campaignId: true },
    })
    .catch(() => null);
  return recipient?.campaignId ?? null;
}

async function recordCampaignReply(contactId: string, at: Date): Promise<void> {
  const recipient = await prisma.waCampaignRecipient.findFirst({
    where: {
      contactId,
      repliedAt: null,
      // Only recipients that were ACTUALLY SENT can be credited with a reply.
      //
      // Postgres orders NULLs FIRST on DESC, and PENDING/SKIPPED rows have a null
      // `sentAt` — so the old query preferentially picked a recipient that never
      // received anything (e.g. one SKIPPED for being opted out) and credited the
      // reply to that campaign. The status filter and `sentAt: { not: null }`
      // together make the ordering meaningful.
      // Bounded to the 72h post-send window.
      //
      // Unbounded, ANY inbound message — a support question a year later, an
      // unrelated "STOP" — was stamped onto the most recent un-replied recipient of
      // any RUNNING or COMPLETED campaign, inflating reply rates indefinitely and
      // crediting campaigns that had nothing to do with the message.
      sentAt: { not: null, gte: new Date(Date.now() - REPLY_ATTRIBUTION_WINDOW_MS) },
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
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

/** One actionable row of `value.statuses`, parsed once up front. */
interface ParsedStatus {
  wamid: string;
  /**
   * `biz_opaque_callback_data` — the WaMessage id we send with every message,
   * echoed back verbatim on each of its status callbacks. Null for messages sent
   * before the token existed, and for reactions, which persist no row.
   */
  opaqueId: string | null;
  status: WaMessageStatus;
  ts: Date;
  err: any;
  pricing: any;
  conv: any;
}

/**
 * How long after a campaign message is created its recipient row is still
 * expected to gain a wamid. Past that the send has either finished writing it or
 * never will — a recipient rolled back to PENDING has its wamid cleared for
 * good — so a status for it is not a race any more and must stop deferring the
 * event, which only burns the replay budget the recovery pass allows it.
 */
const RECIPIENT_WAMID_RACE_MS = 10 * 60 * 1000;

/**
 * @returns true when at least one status could be placed by neither its WAMID
 * nor its `biz_opaque_callback_data` token, or landed on a campaign message
 * whose recipient row has not been given its wamid yet — the caller leaves the
 * event unprocessed so it is replayed.
 */
async function processStatuses(value: any): Promise<boolean> {
  // Meta batches every status callback it is holding for the account into one
  // POST, so this array routinely carries hundreds of rows. Settling them one
  // at a time cost four round-trips each (a findUnique that hydrated the whole
  // row including the `payload` jsonb, an update, then a recipient findFirst +
  // update) on the same small pool the campaign worker sends from. A 50k
  // campaign produces ~150k callbacks — this is why delivery ticks lagged hours
  // behind a large send. Parse the batch first, then settle it set-wise.
  const parsed: ParsedStatus[] = [];
  for (const st of value.statuses ?? []) {
    const wamid = st?.id;
    const status = mapStatus(st?.status);
    if (!wamid || !status) continue;
    parsed.push({
      wamid,
      opaqueId:
        typeof st?.biz_opaque_callback_data === 'string' ? st.biz_opaque_callback_data : null,
      status,
      ts: st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date(),
      err: Array.isArray(st.errors) ? st.errors[0] : undefined,
      pricing: st.pricing,
      conv: st.conversation,
    });
  }
  if (parsed.length === 0) return false;

  // Only the columns the state machine needs. `campaignId` and `createdAt` are
  // here for the recipient-row race below, not for the state machine: they decide
  // whether a status we could not settle against a campaign recipient is worth
  // replaying.
  const statusSelect = {
    id: true,
    wamid: true,
    status: true,
    conversationId: true,
    contactId: true,
    campaignId: true,
    createdAt: true,
  } as const;

  // One read for the whole batch.
  const rows = await prisma.waMessage.findMany({
    where: { wamid: { in: [...new Set(parsed.map((p) => p.wamid))] } },
    select: statusSelect,
  });
  const byWamid = new Map(rows.map((r) => [r.wamid as string, r]));

  /**
   * Second pass for the statuses no WAMID could place.
   *
   * The send path writes the row as QUEUED, awaits the Graph POST and only then
   * stamps the WAMID, so Meta's `sent` — and on a fast thread its `delivered`
   * and `read` — regularly arrive while the row is still WAMID-less. The only
   * recourse was to leave the whole event unprocessed and replay it minutes
   * later, so a message the customer had already opened went on displaying a
   * single tick until the recovery pass came round. Every send now carries the
   * row id as `biz_opaque_callback_data`, which identifies the row from the
   * first callback onwards — before Meta has told us what the WAMID even is.
   *
   * Run over the misses rather than in place of the WAMID read: once the id has
   * landed the WAMID query answers the whole batch, so the steady state pays for
   * no extra query at all.
   */
  const orphanIds = [
    ...new Set(
      parsed.filter((p) => p.opaqueId && !byWamid.has(p.wamid)).map((p) => p.opaqueId as string)
    ),
  ];
  const late = orphanIds.length
    ? await prisma.waMessage.findMany({ where: { id: { in: orphanIds } }, select: statusSelect })
    : [];
  const byId = new Map(late.map((r) => [r.id, r]));

  let unmatched = false;
  /**
   * message id → the merged update to apply to that message.
   *
   * Keyed on the id rather than the WAMID because a row the opaque token placed
   * has no WAMID yet — keying on it would build a `where` that matches nothing.
   */
  const patches = new Map<string, Prisma.WaMessageUpdateManyMutationInput>();
  /** message id → status as of the last row this batch accepted for it. */
  const effective = new Map<string, WaMessageStatus>();
  /** message id → the WAMID to stamp on a row the opaque token placed. */
  const wamidStamps = new Map<string, string>();
  /**
   * Statuses that actually MOVED a message forward — the socket emit, and the
   * outbound `whatsapp.message.status` webhook, are both driven off this.
   *
   * It is filled after the forward-only check below, so a redelivered callback
   * for a status the message already has produces no event: a subscriber must be
   * able to treat each one as a transition rather than de-duplicating for us.
   */
  const emits: Array<{
    wamid: string;
    status: WaMessageStatus;
    conversationId: string;
    contactId: string;
    campaignId: string | null;
    errorCode: string | null;
    errorTitle: string | null;
    pricing: {
      category: string | null;
      billable: boolean | null;
      model: string | null;
      costPaise: number | null;
      /** The exact quoted amount, in major units of `currency`. */
      costAmount: string | null;
      currency: string | null;
    } | null;
  }> = [];
  const windows = new Map<string, { expiresAt: Date; metaConversationId: string | null }>();
  const recipientUpdates: Array<{
    wamid: string;
    status: WaCampaignRecipientStatus;
    errorCode: string | null;
  }> = [];
  /** contactId → refusal code; one write per contact however many of its rows failed. */
  const refusals = new Map<string, string>();

  for (const { wamid, opaqueId, status, ts, err, pricing, conv } of parsed) {
    // WAMID first — it places every status for a message whose id has landed —
    // then the opaque token for the ones still mid-race. A token whose row
    // already carries a DIFFERENT WAMID is refused rather than trusted: that
    // would mean settling one send's callback against another send's row, which
    // is worse than deferring the event and looking again in two minutes.
    const viaToken = opaqueId ? byId.get(opaqueId) : undefined;
    const msg =
      byWamid.get(wamid) ??
      (viaToken && (!viaToken.wamid || viaToken.wamid === wamid) ? viaToken : undefined);
    if (!msg) {
      // Neither key placed it. With `biz_opaque_callback_data` on every send
      // this is now only reachable for messages sent before the token existed —
      // still a genuine race rather than junk, so the event is deferred and
      // replayed rather than dropped: a message that was delivered and read
      // would otherwise display as "sent" forever, and for campaigns the
      // recipient's wamid lands later still, so its counters never moved.
      unmatched = true;
      continue;
    }
    // Placed by its opaque token, which means the send is still between the
    // Graph response and its own write — or crashed in between and will never
    // make it, leaving a row that reads as unsent for a message the customer
    // already has. Stamp the WAMID so the next callback matches on it directly.
    if (!msg.wamid) {
      msg.wamid = wamid;
      wamidStamps.set(msg.id, wamid);
    }
    // Keep the WAMID map in step with what this batch has placed. A row the
    // opaque token resolved is ABSENT from `byWamid` — it was WAMID-less when
    // that query ran, or the send stamped it in between the two reads — and the
    // campaign-recipient deferral below looks the message up in this same map.
    // Without the entry that lookup missed, `continue` fired, and the status was
    // dropped for the recipient exactly as it was before the deferral existed —
    // in the ONE window where the recipient row is most likely to still be
    // WAMID-less, since its WAMID is written later than the message's.
    byWamid.set(wamid, msg);
    // Campaign-recipient reconciliation (status-by-wamid → campaign counters).
    // The Meta error code rides along: without it every webhook-delivered
    // failure landed as `status: FAILED, errorCode: null`, which is
    // indistinguishable from a transient network failure — so "retry failed"
    // happily re-sent to numbers Meta had permanently rejected.
    //
    // Collected BEFORE the forward-only check below, which is about the
    // MESSAGE. The recipient row has its own forward-only check inside
    // `reconcileRecipientStatuses`, and gating this on the message advancing
    // made the replay of a deferred event a no-op for recipients: the second
    // pass finds the message already DELIVERED, skips it, and the recipient the
    // replay exists to settle is never looked at again.
    recipientUpdates.push({
      wamid,
      status: status as unknown as WaCampaignRecipientStatus,
      errorCode: err?.code != null ? String(err.code) : null,
    });

    // Forward-only: never regress the status. The comparison is against what
    // this batch has already accepted for the message, not just the persisted
    // value — a single POST regularly carries `delivered` AND `read` for the
    // same message, which the old row-at-a-time loop only handled because it
    // re-read the row between writes.
    const current = effective.get(msg.id) ?? (msg.status as WaMessageStatus);
    if (STATUS_RANK[status] <= STATUS_RANK[current]) continue;
    effective.set(msg.id, status);

    // Merge into this message's pending write instead of issuing one update per
    // status, so a delivered+read pair still lands both timestamps.
    const patch = patches.get(msg.id) ?? {};
    patch.status = status;
    if (status === 'DELIVERED') patch.deliveredAt = ts;
    if (status === 'READ') patch.readAt = ts;
    if (status === 'FAILED') {
      patch.errorCode = err?.code != null ? String(err.code) : undefined;
      patch.errorTitle = err?.title ?? err?.message;
    }

    // Actual cost (task 5): persist the full pricing breakdown from the status
    // webhook. Meta's pricing object normally carries { billable, pricing_model,
    // category }; some versions also include a per-message amount — derive
    // `costPaise` only when an amount is present, else leave null.
    const derived = derivePricing(pricing);
    if (pricing) {
      if (pricing.category != null) patch.pricingCategory = pricing.category;
      if (pricing.billable != null) patch.billable = Boolean(pricing.billable);
      if (pricing.pricing_model != null) patch.pricingModel = pricing.pricing_model;
      patch.costPaise = derived.minor;
      patch.costAmount = derived.amount;
      patch.costCurrency = derived.currency;
    }

    // Meta's conversation object carries the authoritative window expiry and the
    // conversation's origin. All of it used to be discarded, so the window was
    // computed purely as lastInboundAt + 24h — which is wrong in both directions:
    // a free-entry-point / click-to-WhatsApp conversation gets 72 hours (the
    // composer was locked while replies were still free) and Meta can close a
    // window early (the composer stayed open and every send bounced).
    if (conv?.id) patch.metaConversationId = String(conv.id);
    if (conv?.origin?.type) patch.conversationOrigin = String(conv.origin.type);
    patches.set(msg.id, patch);

    if (conv?.expiration_timestamp) {
      const expiresAt = new Date(Number(conv.expiration_timestamp) * 1000);
      // `extendWindowFromMeta` widens to the max, so only the furthest expiry
      // per conversation is worth a round-trip — the rest are no-op writes.
      if (!Number.isNaN(expiresAt.getTime())) {
        const prev = windows.get(msg.conversationId);
        if (!prev || expiresAt.getTime() >= prev.expiresAt.getTime()) {
          windows.set(msg.conversationId, {
            expiresAt,
            metaConversationId: conv.id ? String(conv.id) : (prev?.metaConversationId ?? null),
          });
        }
      }
    }

    emits.push({
      wamid,
      status,
      conversationId: msg.conversationId,
      contactId: msg.contactId,
      campaignId: msg.campaignId,
      errorCode: err?.code != null ? String(err.code) : null,
      errorTitle: err?.title ?? err?.message ?? null,
      // The billing facts Meta reports alongside the status. All of it was
      // persisted and shown in our own dashboard while external subscribers got
      // nothing — a CRM could not attribute spend to the record that caused it.
      pricing: pricing
        ? {
            category: pricing.category != null ? String(pricing.category) : null,
            billable: pricing.billable != null ? Boolean(pricing.billable) : null,
            model: pricing.pricing_model != null ? String(pricing.pricing_model) : null,
            costPaise: derived.minor,
            // The exact quoted amount and its currency, not just the rounded
            // minor units: a subscriber attributing spend had no way to tell
            // rupees from cents, and 0.0383 reached them as "4".
            costAmount: derived.amount,
            currency: derived.currency,
          }
        : null,
    });

    // A 131049 usually arrives HERE, not on the send result: Meta accepts the
    // request and refuses at delivery time. Recording it only on the synchronous
    // path would leave the cooldown unenforced for the common case.
    if (
      status === 'FAILED' &&
      isMarketingRefusedCode(err?.code != null ? String(err.code) : null)
    ) {
      refusals.set(msg.contactId, String(err?.code));
    }
  }

  // One updateMany per distinct patch. Statuses in a batch overwhelmingly share
  // a status + timestamp + pricing shape (the same second of the same send), so
  // this collapses to a couple of writes; a row whose patch really is unique
  // still gets its own update, so no value is ever written to a message it did
  // not come from.
  const writes = new Map<
    string,
    { data: Prisma.WaMessageUpdateManyMutationInput; ids: string[] }
  >();
  for (const [id, data] of patches) {
    const key = JSON.stringify(data, Object.keys(data).sort());
    const group = writes.get(key);
    if (group) group.ids.push(id);
    else writes.set(key, { data, ids: [id] });
  }

  // The WAMIDs the opaque token let us settle ahead of the send's own write.
  // Kept out of the grouped patches above: a WAMID is unique per row, so folding
  // it in would give every such row its own group anyway, and `@unique` makes it
  // the one value here that can collide. Guarded on `wamid: null` and swallowed
  // — losing the race to the send path's own write is the expected outcome.
  for (const [id, wamid] of wamidStamps) {
    await prisma.waMessage
      .updateMany({ where: { id, wamid: null }, data: { wamid } })
      .catch(() => {});
  }
  for (const { data, ids } of writes.values()) {
    await prisma.waMessage.updateMany({ where: { id: { in: ids } }, data });
  }

  for (const [conversationId, w] of windows) {
    await extendWindowFromMeta(conversationId, w.expiresAt, w.metaConversationId).catch(() => {});
  }
  for (const e of emits) {
    emitWa(
      'wa:status',
      { wamid: e.wamid, status: e.status, conversationId: e.conversationId },
      e.conversationId
    );
    // The same transition, fanned out to external subscribers. Delivery state
    // was the one thing an integration could not learn without polling: it could
    // be told a customer had written in, but not whether the message it had just
    // triggered arrived, was read, or was permanently rejected — and it is the
    // rejection that a CRM has to act on.
    emitWaEvent('whatsapp.message.status', {
      wamid: e.wamid,
      status: e.status,
      conversationId: e.conversationId,
      contactId: e.contactId,
      campaignId: e.campaignId,
      errorCode: e.errorCode,
      errorTitle: e.errorTitle,
      pricing: e.pricing,
    }).catch(() => {});
  }
  if (recipientUpdates.length) {
    // The same race as an unknown WAMID above, one step further along the send:
    // `dispatchOutbound` stamps the wamid on the WaMessage, and the campaign
    // worker copies it onto the recipient only once the send call returns. A
    // `delivered` callback landing in between found the message but no recipient
    // and was dropped without a word, so that recipient stayed SENT for the life
    // of the campaign and its delivered count under-reported — systematically,
    // across a large fast send. Deferring the event replays it once the wamid
    // has landed.
    const missing = await reconcileRecipientStatuses(recipientUpdates).catch(() => [] as string[]);
    for (const wamid of missing) {
      const msg = byWamid.get(wamid);
      // Only a campaign/sequence send has a recipient row at all; an ordinary
      // reply has none by design and must never hold the event back.
      if (!msg?.campaignId) continue;
      if (Date.now() - msg.createdAt.getTime() > RECIPIENT_WAMID_RACE_MS) continue;
      unmatched = true;
      break;
    }
  }
  for (const [contactId, code] of refusals) {
    await noteMarketingRefusal(contactId, code).catch(() => {});
  }

  return unmatched;
}

/**
 * Handle the non-message/status Meta webhook fields (best-effort; never throws):
 *  - message_template_status_update → reconcile the matching WaTemplate's status
 *    (+ rejectionReason) by name_language.
 *  - message_template_quality_update → refresh the template's quality rating.
 *  - template_category_update → adopt Meta's re-classification (price + consent)
 *    and name the unsent campaigns it invalidates in the audit trail.
 *  - phone_number_quality_update → update the WaChannel quality/tier and write a
 *    WaChannelHealthSnapshot row.
 *  - user_preferences → marketing opt-out/resume made inside WhatsApp itself.
 *  - account_alerts / account_update / security / business_capability_update →
 *    an AuditLog row (WA_ACCOUNT_ALERT) so a policy warning or restriction is
 *    visible in the console, not only in the server log.
 *
 * Every field above must also be SUBSCRIBED in the Meta app or these are dead
 * code — see the table in README.md ("Meta setup").
 */
async function processChangeField(field: string, value: any): Promise<void> {
  try {
    switch (field) {
      case 'message_template_status_update': {
        const name = value?.message_template_name;
        const language = value?.message_template_language;
        // Shared with the sync (whatsapp-template.service). This file used to
        // keep its OWN table with different membership, so a FLAGGED template
        // landed PAUSED here and was mapped back to PENDING by the next cron
        // sync — the badge flapped between the two and neither was trustworthy.
        const status = mapTemplateStatus(value?.event);
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
        // Review is asynchronous and can take hours, so the console was the only
        // place that ever learned the verdict: an integration that submitted a
        // template had to poll to find out whether it could send with it yet,
        // and nothing at all told it about a later pause or rejection.
        if (status !== tpl.status) {
          emitWaEvent('whatsapp.template.status_changed', {
            templateId: tpl.id,
            name,
            language,
            status,
            previousStatus: tpl.status,
            reason: status === 'REJECTED' ? (value?.reason ?? null) : null,
          }).catch(() => {});
        }
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
        await recordChannelHealthSnapshot(channel.id, qualityRating, messagingTier ?? null).catch(
          () => {}
        );
        break;
      }
      case 'message_template_quality_update': {
        // Quality was only ever refreshed by the 6-hourly template sync, so a
        // template Meta downgraded to RED kept showing GREEN in the picker for up
        // to six hours — long enough to launch a campaign on a template that is
        // about to be paused.
        const name = value?.message_template_name;
        const language = value?.message_template_language;
        if (!name || !language) break;
        const tpl = await getTemplateByName(name, language).catch(() => null);
        if (!tpl) break;
        const raw = String(value?.new_quality_score ?? '').toUpperCase();
        const quality: WaTemplateQuality = (
          ['GREEN', 'YELLOW', 'RED'].includes(raw) ? raw : 'UNKNOWN'
        ) as WaTemplateQuality;
        await prisma.waTemplate
          .update({ where: { id: tpl.id }, data: { quality, lastSyncedAt: new Date() } })
          .catch(() => {});
        if (quality === 'YELLOW' || quality === 'RED') {
          logger.warn(
            `WhatsApp template ${name} (${language}) quality dropped to ${quality} ` +
              `(was ${value?.previous_quality_score ?? 'unknown'})`
          );
        }
        break;
      }
      case 'template_category_update':
      case 'message_template_category_update': {
        // Meta re-classifies templates on its own. Category drives BOTH the price
        // we quote and the consent rule the send path enforces, so a UTILITY
        // template silently promoted to MARKETING meant the module kept sending it
        // to contacts who never opted in — until the next 6-hourly sync noticed.
        const name = value?.message_template_name;
        const language = value?.message_template_language;
        if (!name || !language) break;
        const tpl = await getTemplateByName(name, language).catch(() => null);
        if (!tpl) break;
        const raw = String(value?.new_category ?? '').toUpperCase();
        if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(raw)) break;
        const category = raw as WaTemplateCategory;
        if (category === tpl.category) break;
        await prisma.waTemplate
          .update({ where: { id: tpl.id }, data: { category, lastSyncedAt: new Date() } })
          .catch(() => {});
        if (category === 'MARKETING') {
          logger.warn(
            `WhatsApp template ${name} (${language}) re-classified ${tpl.category} -> MARKETING ` +
              `by Meta — the opt-in requirement and 24h marketing cap now apply to it`
          );
        }
        // Campaigns that have not gone out yet are the ones this actually
        // changes: the price they were estimated at and the consent rule the
        // campaign worker will enforce are both derived from the category, so a
        // DRAFT quoted as UTILITY silently becomes a MARKETING send that skips
        // every contact who never opted in. Name them in the trail so the
        // console banner can say WHICH campaigns to re-check.
        const affected = await prisma.waCampaign
          .findMany({
            where: {
              status: { in: ['DRAFT', 'SCHEDULED'] },
              OR: [{ templateId: tpl.id }, { variants: { some: { templateId: tpl.id } } }],
            },
            select: { id: true, name: true },
            take: 25,
          })
          .catch(() => []);
        await AuditService.log({
          action: 'WA_TEMPLATE_RECATEGORIZED',
          entity: 'WaTemplate',
          entityId: tpl.id,
          performedBy: 'meta',
          details: {
            template: `${name} (${language})`,
            from: tpl.category,
            to: category,
            affectedCampaigns: affected,
          },
        });
        break;
      }
      case 'user_preferences': {
        // A customer can turn marketing messages off from inside WhatsApp itself,
        // without ever sending STOP. That choice arrives only here, and it was
        // dropped on the floor — so the module kept sending marketing to someone
        // who had explicitly refused it in the client, which is exactly the
        // scenario Meta suspends numbers for.
        const prefs: any[] = Array.isArray(value?.user_preferences) ? value.user_preferences : [];
        for (const pref of prefs) {
          try {
            const waId = pref?.wa_id;
            if (!waId) continue;
            const phone = normalizeWaPhone(String(waId));
            const contact = await prisma.waContact.findFirst({ where: { phone } });
            if (!contact) continue;
            const decision = String(pref?.value ?? '').toLowerCase();
            const at = pref?.timestamp
              ? new Date(Number(pref.timestamp) * 1000).toISOString()
              : new Date().toISOString();
            if (decision === 'stop') {
              await optOutContact(contact.id, {
                source: 'meta_preference',
                evidence: { category: pref?.category ?? 'marketing_messages', at },
              });
              emitWaEvent('whatsapp.contact.opted_out', {
                contactId: contact.id,
                phone: contact.phone,
                reason: 'user_preferences',
              }).catch(() => {});
            } else if (decision === 'resume') {
              await optInContact(contact.id, {
                source: 'meta_preference',
                evidence: { category: pref?.category ?? 'marketing_messages', at },
              });
              emitWaEvent('whatsapp.contact.opted_in', {
                contactId: contact.id,
                phone: contact.phone,
                reason: 'user_preferences',
              }).catch(() => {});
            }
          } catch {
            // One malformed entry must not abort the rest of the batch.
          }
        }
        break;
      }
      case 'account_alerts':
      case 'account_update':
      case 'security':
      case 'business_capability_update': {
        // These carry Meta's policy warnings, restriction notices and capability
        // changes — the messages that decide whether the number keeps working.
        // They produced one log line and nothing else, so a restriction notice
        // was only ever found by someone reading server logs, and WaWebhookEvent
        // (the only other copy) is pruned after 14 days.
        const summary = JSON.stringify(value ?? {}).slice(0, 1000);
        logger.warn(`WhatsApp account webhook (${field}): ${summary}`);
        waAccountAlertsTotal.inc({ field });
        await AuditService.log({
          action: 'WA_ACCOUNT_ALERT',
          entity: 'WaChannel',
          entityId: value?.metadata?.phone_number_id ?? value?.phone_number_id ?? undefined,
          performedBy: 'meta',
          details: {
            field,
            event: value?.event ?? null,
            payload: summary,
          },
        });
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
export async function processInboundEvent(eventRowId: string): Promise<{
  processed: boolean;
  duplicate?: boolean;
  eventType?: string;
  /**
   * Left unprocessed on purpose — a status arrived before its message, or a
   * messages batch named no channel and none could be resolved.
   */
  deferred?: boolean;
}> {
  const event = await prisma.waWebhookEvent.findUnique({
    where: { id: eventRowId },
  });
  if (!event) {
    logger.warn(`WhatsApp inbound: event ${eventRowId} not found`);
    return { processed: false };
  }
  if (event.processedAt) return { processed: true, duplicate: true };

  const payload: any = event.payload;
  let sawUnmatchedStatus = false;
  let sawUnroutableMessages = false;
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const hasMessages = Array.isArray(value.messages) && value.messages.length;
      const hasStatuses = Array.isArray(value.statuses) && value.statuses.length;
      if (hasMessages) {
        if (await processMessages(value)) sawUnroutableMessages = true;
      }
      if (hasStatuses) {
        if (await processStatuses(value)) sawUnmatchedStatus = true;
      }
      // Other webhook fields (template status, phone-number quality,
      // account alerts/updates) — best-effort, never aborts the job.
      if (!hasMessages && !hasStatuses && typeof change?.field === 'string') {
        await processChangeField(change.field, value);
      }
    }
  }

  // Leave the event UNPROCESSED when a status referenced a message we have not
  // written yet: `handleWaEventRecovery` re-enqueues unprocessed events older
  // than two minutes, by which time the outbound write has certainly landed.
  // Everything in this handler is idempotent (forward-only status ranking,
  // WAMID dedup), so the replay is free — and it is bounded, because the same
  // recovery pass gives up once the event ages out of the 14-day retention.
  if (sawUnmatchedStatus) {
    logger.info(
      `WhatsApp inbound: event ${event.id} has status(es) for unknown WAMIDs — ` +
        'left unprocessed for the recovery pass to replay'
    );
    return { processed: true, eventType: event.eventType, deferred: true };
  }

  // Same contract for a messages batch that resolved to no channel at all: the
  // payload is intact on the event row, so replaying it once a channel exists is
  // strictly better than stamping it complete and losing the customer's message.
  if (sawUnroutableMessages) {
    logger.warn(
      `WhatsApp inbound: event ${event.id} carries messages that resolve to no channel — ` +
        'left unprocessed for the recovery pass to replay'
    );
    return { processed: true, eventType: event.eventType, deferred: true };
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
