import { env } from '../config/env';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { sendWhatsappRaw, toGraphPhone } from './whatsapp.service';
import { getDefaultChannel } from './whatsapp-channel.service';
import { upsertContactByPhone } from './whatsapp-contact.service';
import {
  getOrCreateConversation,
  windowOpen,
  touchOnMessage,
} from './whatsapp-conversation.service';
import { emitWa } from '../utils/whatsapp-realtime';
import type { WaMessageType } from '@prisma/client';

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
 * Proxy a Chatwoot-originated outbound send through our backend → Meta.
 *
 * Hardened (no longer a verbatim pass-through):
 *  - validates the recipient against our WaContact opt-out / isBlocked state;
 *  - rejects sends outside the 24h customer-service window unless the payload
 *    is an approved-template send (templates are allowed any time);
 *  - persists a WaMessage for EVERY proxied send so it appears in the inbox
 *    thread and the audit trail, with the real WAMID/status reconciled after.
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
  const contact = await upsertContactByPhone(rawTo, {});
  const conversation = await getOrCreateConversation(channel.id, contact.id);

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

  // 3. Persist an outbound WaMessage up-front (QUEUED), then reconcile after send.
  const row = await prisma.waMessage.create({
    data: {
      channelId: channel.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: 'OUTBOUND',
      type: waType,
      status: 'QUEUED',
      text: type === 'text' ? (message?.text?.body ?? null) : null,
      templateName: isTemplate ? (message?.template?.name ?? null) : null,
      payload: message as any,
    },
  });

  // 4. Send through the single Meta sender (digits-normalized recipient).
  const result = await sendWhatsappRaw({ ...message, to: phoneDigits });

  const updated = await prisma.waMessage.update({
    where: { id: row.id },
    data: result.ok
      ? { status: 'SENT', wamid: result.wamid, sentAt: new Date() }
      : { status: 'FAILED', errorCode: result.error?.code, errorTitle: result.error?.title },
  });

  await prisma.waContact
    .update({ where: { id: contact.id }, data: { lastOutboundAt: new Date() } })
    .catch(() => {});
  await touchOnMessage(conversation.id, { preview, at: new Date(), inbound: false }).catch(
    () => {}
  );
  emitWa('wa:message', { conversationId: conversation.id, message: updated }, conversation.id);

  if (result.ok) {
    return {
      status: 200,
      body: { messaging_product: 'whatsapp', messages: [{ id: result.wamid }] },
    };
  }
  return {
    status: result.error?.status ?? 502,
    body: { error: { message: result.error?.title, code: result.error?.code } },
  };
}
