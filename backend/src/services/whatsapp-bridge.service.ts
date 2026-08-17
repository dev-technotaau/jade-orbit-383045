import { env } from '../config/env';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import { toGraphPhone } from './whatsapp.service';
import { getDefaultChannel } from './whatsapp-channel.service';
import { upsertContactByPhone } from './whatsapp-contact.service';
import { getConversationForOutbound, windowOpen } from './whatsapp-conversation.service';
import {
  assertSendAllowed,
  dispatchOutbound,
  WA_SUPPRESSED_ERROR_CODE,
} from './whatsapp-send.service';
import type { WaMessageType, WaTemplateCategory } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Optional Chatwoot bridge. Our backend stays the SINGLE Meta webhook receiver
 * and single outbound sender (source of truth). When enabled, inbound events
 * are mirrored to a self-hosted Chatwoot, and Chatwoot's outbound is routed
 * back through our send-proxy. Feature-flagged + off by default.
 */
export function isBridgeEnabled(): boolean {
  return env.WHATSAPP_CHATWOOT_BRIDGE_ENABLED === 'true' && !!env.CHATWOOT_BASE_URL;
}

/** Fire-and-forget: forward the raw Meta webhook to Chatwoot's native endpoint. */
export async function fanOutInboundToChatwoot(rawBody: Buffer): Promise<void> {
  if (!isBridgeEnabled()) return;
  const base = (env.CHATWOOT_BASE_URL ?? '').replace(/\/$/, '');
  const phone = env.CHATWOOT_INBOUND_PHONE ?? '';
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    await fetch(`${base}/webhooks/whatsapp/${phone}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody.toString('utf8'),
    });
  } catch (err) {
    logger.warn('Chatwoot inbound fan-out failed', { err });
  }
}

/** Map a Cloud API message `type` to our WaMessageType enum (best effort). */
function waTypeFromBody(type: string | undefined): WaMessageType {
  switch (type) {
    case 'text':
      return 'TEXT';
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'audio':
      return 'AUDIO';
    case 'document':
      return 'DOCUMENT';
    case 'sticker':
      return 'STICKER';
    case 'location':
      return 'LOCATION';
    case 'contacts':
      return 'CONTACTS';
    case 'interactive':
      return 'INTERACTIVE';
    case 'template':
      return 'TEMPLATE';
    default:
      return 'UNSUPPORTED';
  }
}

/** Payload keys that carry a Meta media id on an outbound send. */
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

/** Short human preview for the conversation list / audit. */
function previewFromBody(type: string | undefined, message: Record<string, any>): string {
  if (type === 'text') return String(message?.text?.body ?? '').slice(0, 200) || '[text]';
  if (type === 'template') return `[template] ${message?.template?.name ?? ''}`.trim();
  return `[${type ?? 'message'}]`;
}

/** Outcome surfaced back to the proxy controller as a Meta-shaped response. */
interface ProxyOutcome {
  status: number;
  body: any;
}

/**
 * Meta's own HTTP status for a failed send, which `dispatchOutbound` rides along
 * on the persisted row. Chatwoot is talking HTTP to us, so a throttle (429) has
 * to reach it as a throttle. Falls back to 502 — including for a transport
 * failure, whose status is 0 and which Express refuses to send.
 */
function upstreamStatus(row: object): number {
  const status = (row as { metaHttpStatus?: number }).metaHttpStatus;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 502;
}

/**
 * Proxy a Chatwoot-originated outbound send through our backend → Meta.
 *
 * Hardened (no longer a verbatim pass-through):
 *  - validates the recipient against our WaContact opt-out / isBlocked state;
 *  - rejects sends outside the 24h customer-service window unless the payload
 *    is an approved-template send (templates are allowed any time);
 *  - runs the same marketing gate as the console (opt-out, Meta refusal
 *    cooldown, per-contact 24h frequency cap);
 *  - persists a WaMessage for EVERY proxied send so it appears in the inbox
 *    thread and the audit trail, with the real WAMID/status reconciled after —
 *    via the shared `dispatchOutbound`, which is also what applies the
 *    do-not-contact list.
 */
export async function proxyOutboundToMeta(message: Record<string, any>): Promise<ProxyOutcome> {
  const rawTo = message?.to != null ? String(message.to) : '';
  const phoneDigits = toGraphPhone(rawTo);
  if (!phoneDigits) {
    return {
      status: 400,
      body: { error: { message: 'missing recipient', code: 'WA_NO_RECIPIENT' } },
    };
  }

  const channel = await getDefaultChannel();
  if (!channel) {
    return {
      status: 400,
      body: { error: { message: 'WhatsApp not configured', code: 'WA_NOT_CONFIGURED' } },
    };
  }

  // Resolve (or create) the contact + conversation so we can both gate and log.
  // Chatwoot's payload names no sender of ours, so answer on whichever of our
  // numbers this contact is already talking to us on — pinning it to the default
  // channel replied to a customer from a number they never messaged — and fall
  // back to the default only when there is no thread at all.
  const contact = await upsertContactByPhone(rawTo, {});
  const conversation = await getConversationForOutbound(contact.id, channel.id);

  const type = message?.type as string | undefined;
  const isTemplate = type === 'template';

  // 1. Opt-out / block gate — never proxy to a blocked or opted-out recipient.
  if (contact.isBlocked) {
    logger.warn('Bridge outbound blocked: contact is blocked', { contactId: contact.id });
    return {
      status: 409,
      body: { error: { message: 'contact is blocked', code: 'WA_CONTACT_BLOCKED' } },
    };
  }
  if (contact.optInStatus === 'OPTED_OUT') {
    logger.warn('Bridge outbound blocked: contact opted out', { contactId: contact.id });
    return { status: 409, body: { error: { message: 'contact opted out', code: 'WA_OPTED_OUT' } } };
  }

  // 2. 24h window gate — free-form sends only inside the open window; outside it
  //    the only permitted payload is a template send (which Meta allows anytime).
  if (!isTemplate && !windowOpen(conversation.windowExpiresAt)) {
    logger.warn('Bridge outbound blocked: 24h window closed (non-template)', {
      conversationId: conversation.id,
    });
    return {
      status: 409,
      body: {
        error: {
          message: 'the 24-hour reply window is closed — send an approved template instead',
          code: 'WA_WINDOW_CLOSED',
        },
      },
    };
  }

  const waType = waTypeFromBody(type);
  const preview = previewFromBody(type, message);
  const templateName = isTemplate ? (message?.template?.name ?? null) : null;
  const templateLanguage = isTemplate ? (message?.template?.language?.code ?? null) : null;

  // 3. Marketing gate — the frequency cap and Meta refusal cooldown the console's
  //    own template sends run through. Chatwoot names the template but knows
  //    nothing of its category, so the shared helper resolves that from the name.
  let templateCategory: WaTemplateCategory | null = null;
  try {
    templateCategory = await assertSendAllowed({ contact, templateName, templateLanguage });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    logger.warn('Bridge outbound blocked by marketing policy', {
      contactId: contact.id,
      code: err.code,
    });
    return { status: err.statusCode, body: { error: { message: err.message, code: err.code } } };
  }

  // 4. Persist + send through the SINGLE outbound chokepoint.
  //
  //    This was a private copy of the persist/send path, and that is precisely
  //    how a Chatwoot agent could message a number on the do-not-contact list:
  //    the suppression check lives inside dispatchOutbound and nothing here ever
  //    reached it. Delegating also picks up the send metrics, the transient-error
  //    code fallback and the marketing-refusal bookkeeping the copy never had.
  const graphBody = { ...message };
  // dispatchOutbound addresses the send from the contact's normalized E.164, so
  // drop Chatwoot's own `to` instead of letting it win the object spread — a
  // number written in national format ("09876543210") went out undeliverable.
  delete graphBody.to;
  const mediaBody = type && MEDIA_TYPES.has(type) ? message[type] : null;

  // The marketing cap is ENFORCED inside dispatchOutbound, under a per-contact
  // lock, so it can still refuse a send the gate above waved through when two
  // sends to the same contact overlap. That refusal is the same policy answer as
  // the gate's — 409 with the code — not the 500 an uncaught throw would give a
  // Chatwoot agent.
  let row: Awaited<ReturnType<typeof dispatchOutbound>>;
  try {
    row = await dispatchOutbound({
      conversationId: conversation.id,
      channelId: conversation.channelId,
      contactId: contact.id,
      contactPhone: contact.phone,
      // Chatwoot's agent is not a user of ours, so there is no operator label to
      // attribute this to.
      actorUserId: null,
      type: waType,
      text: type === 'text' ? (message?.text?.body ?? null) : null,
      preview,
      templateName,
      templateLanguage,
      // Resolved once, by the gate above, and carried onto the row: it is what the
      // 24h marketing cap counts on, so a Chatwoot-originated marketing send is
      // visible to the console's cap and vice versa.
      templateCategory,
      contextWamid: message?.context?.message_id ?? null,
      mediaId: mediaBody?.id != null ? String(mediaBody.id) : null,
      payload: message,
      message: graphBody,
    });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    logger.warn('Bridge outbound refused at dispatch', { contactId: contact.id, code: err.code });
    return { status: err.statusCode, body: { error: { message: err.message, code: err.code } } };
  }

  if (row.status === 'FAILED') {
    // A send our own do-not-contact list refused never reached Meta — report it
    // as a policy rejection like the gates above, not as an upstream failure.
    const status = row.errorCode === WA_SUPPRESSED_ERROR_CODE ? 409 : upstreamStatus(row);
    return { status, body: { error: { message: row.errorTitle, code: row.errorCode } } };
  }
  return {
    status: 200,
    body: { messaging_product: 'whatsapp', messages: [{ id: row.wamid }] },
  };
}
