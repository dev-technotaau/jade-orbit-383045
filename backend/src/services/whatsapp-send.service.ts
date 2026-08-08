import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { sendWhatsappRaw, toGraphPhone } from './whatsapp.service';
import {
  windowOpen,
  touchOnMessage,
  getOrCreateConversation,
} from './whatsapp-conversation.service';
import { getDefaultChannel } from './whatsapp-channel.service';
import { upsertContactByPhone } from './whatsapp-contact.service';
import {
  getTemplate,
  buildTemplateSendComponents,
  renderTemplateBody,
} from './whatsapp-template.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { waMessagesTotal, waSendFailuresTotal, waSendDuration } from '../utils/whatsapp-metrics';
import type { WaMessageType } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DispatchParams {
  conversationId: string;
  channelId: string;
  contactId: string;
  contactPhone: string;
  actorUserId: string | null;
  type: WaMessageType;
  text: string | null;
  preview: string;
  templateName?: string | null;
  campaignId?: string | null;
  contextWamid?: string | null; // WAMID this message quotes/replies to
  payload?: Record<string, any> | null; // structured body (reaction/location/contacts)
  message: Record<string, any>; // Cloud API message body (type-specific)
}

/** Persist an outbound WaMessage, call the Cloud API, reconcile WAMID + status, emit. */
async function dispatchOutbound(p: DispatchParams) {
  const row = await prisma.waMessage.create({
    data: {
      channelId: p.channelId,
      conversationId: p.conversationId,
      contactId: p.contactId,
      direction: 'OUTBOUND',
      type: p.type,
      status: 'QUEUED',
      text: p.text,
      templateName: p.templateName ?? null,
      sentByUserId: p.actorUserId,
      campaignId: p.campaignId ?? null,
      contextWamid: p.contextWamid ?? null,
      payload: p.payload ?? undefined,
    },
  });

  const endTimer = waSendDuration.startTimer();
  const result = await sendWhatsappRaw({ to: toGraphPhone(p.contactPhone), ...p.message });
  endTimer({ result: result.ok ? 'ok' : 'error' });

  if (result.ok) {
    waMessagesTotal.inc({ direction: 'outbound', type: p.type, status: 'sent' });
  } else {
    waMessagesTotal.inc({ direction: 'outbound', type: p.type, status: 'failed' });
    waSendFailuresTotal.inc({ error_code: result.error?.code ?? 'unknown' });
  }

  const updated = await prisma.waMessage.update({
    where: { id: row.id },
    data: result.ok
      ? { status: 'SENT', wamid: result.wamid, sentAt: new Date() }
      : { status: 'FAILED', errorCode: result.error?.code, errorTitle: result.error?.title },
  });

  await prisma.waContact
    .update({ where: { id: p.contactId }, data: { lastOutboundAt: new Date() } })
    .catch(() => {});
  await touchOnMessage(p.conversationId, { preview: p.preview, at: new Date(), inbound: false });

  // SLA: stamp firstResponseAt the first time a human agent (not a campaign)
  // replies on a conversation that hasn't been answered yet. updateMany with a
  // firstResponseAt:null guard makes this idempotent and race-safe.
  if (p.actorUserId && !p.campaignId) {
    await prisma.waConversation
      .updateMany({
        where: { id: p.conversationId, firstResponseAt: null },
        data: { firstResponseAt: new Date() },
      })
      .catch(() => {});
  }

  emitWa('wa:message', { conversationId: p.conversationId, message: updated }, p.conversationId);

  if (!result.ok) {
    logger.warn(
      `WhatsApp outbound failed conv=${p.conversationId} err=${result.error?.title ?? 'unknown'}`
    );
  }
  return updated;
}

/**
 * Free-form (session) message — only inside the open 24h customer-service
 * window. Outside it, callers must use a template (see below).
 */
export async function sendSessionMessage(
  conversationId: string,
  actorUserId: string | null,
  input: { type: 'text'; text: string; contextWamid?: string }
) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (conv.contact.isBlocked) throw new AppError('Contact is blocked', 409, 'WA_CONTACT_BLOCKED');
  if (!windowOpen(conv.windowExpiresAt)) {
    throw new AppError(
      'The 24-hour reply window is closed — send an approved template instead.',
      409,
      'WA_WINDOW_CLOSED'
    );
  }
  const body = input.text?.trim();
  if (!body) throw new AppError('Message text is required', 400, 'WA_EMPTY_MESSAGE');

  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: 'TEXT',
    text: body,
    preview: body,
    contextWamid: input.contextWamid ?? null,
    // Quote/reply to a prior message when a context WAMID is supplied.
    message: {
      type: 'text',
      text: { preview_url: true, body },
      ...(input.contextWamid ? { context: { message_id: input.contextWamid } } : {}),
    },
  });
}

interface TemplateSendInput {
  templateId: string;
  bodyParams?: string[];
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  headerImageId?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  buttonUrlParam?: string;
  campaignId?: string;
}

/** Send an APPROVED template into an existing conversation (works any time, incl. closed window). */
export async function sendTemplateToConversation(
  conversationId: string,
  actorUserId: string | null,
  input: TemplateSendInput
) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (conv.contact.isBlocked) throw new AppError('Contact is blocked', 409, 'WA_CONTACT_BLOCKED');

  const tpl = await getTemplate(input.templateId);
  if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  if (tpl.status !== 'APPROVED') {
    throw new AppError(
      `Template is not approved (status: ${tpl.status})`,
      409,
      'WA_TEMPLATE_NOT_APPROVED'
    );
  }
  if (tpl.category === 'MARKETING' && conv.contact.optInStatus === 'OPTED_OUT') {
    throw new AppError('Contact has opted out of marketing messages', 409, 'WA_OPTED_OUT');
  }
  // Single chokepoint (campaign + manual) for the per-contact marketing cap:
  // stamp lastMarketingAt whenever a MARKETING template is sent from here.
  if (tpl.category === 'MARKETING') {
    await prisma.waContact
      .update({ where: { id: conv.contactId }, data: { lastMarketingAt: new Date() } })
      .catch(() => {});
  }

  const components = buildTemplateSendComponents({
    bodyParams: input.bodyParams,
    bodyNamedParams: input.bodyNamedParams,
    headerText: input.headerText,
    headerImageId: input.headerImageId,
    headerMediaUrl: input.headerMediaUrl,
    headerMediaType: input.headerMediaType,
    buttonUrlParam: input.buttonUrlParam,
  });

  // Render the body with variables substituted so the chat bubble shows the
  // actual message (an empty `text` renders as an empty bubble). Falls back to a
  // labelled preview only if the template has no body text.
  const renderedBody =
    renderTemplateBody(tpl.components, {
      bodyParams: input.bodyParams,
      bodyNamedParams: input.bodyNamedParams,
    }) || `[template] ${tpl.name}`;

  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: 'TEMPLATE',
    text: renderedBody,
    preview: renderedBody.slice(0, 120),
    templateName: tpl.name,
    campaignId: input.campaignId,
    message: {
      type: 'template',
      template: { name: tpl.name, language: { code: tpl.language }, components },
    },
  });
}

interface InteractiveInput {
  kind: 'button' | 'list' | 'cta_url' | 'flow';
  bodyText: string;
  buttons?: Array<{ id: string; title: string }>;
  listButton?: string;
  sections?: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  ctaText?: string;
  ctaUrl?: string;
  // WhatsApp Flows (kind === 'flow')
  flowId?: string;
  flowCta?: string;
  flowToken?: string;
  flowAction?: string; // 'navigate' (default) | 'data_exchange'
  flowScreen?: string; // initial screen id for 'navigate'
  flowActionPayload?: Record<string, any>; // data passed to the initial screen
}

/** Send an interactive (reply-buttons or list) message inside the open 24h window. */
export async function sendInteractiveMessage(
  conversationId: string,
  actorUserId: string,
  input: InteractiveInput
) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (conv.contact.isBlocked) throw new AppError('Contact is blocked', 409, 'WA_CONTACT_BLOCKED');
  if (!windowOpen(conv.windowExpiresAt)) {
    throw new AppError(
      'The 24-hour reply window is closed — send an approved template instead.',
      409,
      'WA_WINDOW_CLOSED'
    );
  }
  const bodyText = input.bodyText?.trim();
  if (!bodyText) throw new AppError('Message text is required', 400, 'WA_EMPTY_MESSAGE');

  let interactive: Record<string, unknown>;
  if (input.kind === 'button') {
    interactive = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: (input.buttons ?? [])
          .slice(0, 3)
          .map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    };
  } else if (input.kind === 'cta_url') {
    if (!input.ctaUrl) {
      throw new AppError('A URL is required for a call-to-action', 400, 'WA_EMPTY_CTA_URL');
    }
    interactive = {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: { display_text: input.ctaText || 'Open', url: input.ctaUrl },
      },
    };
  } else if (input.kind === 'flow') {
    if (!input.flowId) {
      throw new AppError('A flow id is required to send a Flow', 400, 'WA_FLOW_ID_REQUIRED');
    }
    interactive = {
      type: 'flow',
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: input.flowId,
          flow_cta: input.flowCta || 'Open',
          flow_action: input.flowAction || 'navigate',
          ...(input.flowToken ? { flow_token: input.flowToken } : {}),
          ...(input.flowScreen || input.flowActionPayload
            ? {
                flow_action_payload: {
                  ...(input.flowScreen ? { screen: input.flowScreen } : {}),
                  ...(input.flowActionPayload ? { data: input.flowActionPayload } : {}),
                },
              }
            : {}),
        },
      },
    };
  } else {
    interactive = {
      type: 'list',
      body: { text: bodyText },
      action: { button: input.listButton || 'Menu', sections: input.sections ?? [] },
    };
  }

  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: 'INTERACTIVE',
    text: bodyText,
    preview: bodyText,
    // Persist the interactive structure so the inbox can render the options
    // (buttons / list / CTA) we sent — not just the body text.
    payload: interactive,
    message: { type: 'interactive', interactive },
  });
}

type MediaKind = 'image' | 'video' | 'audio' | 'document';

/**
 * SSRF guard for a caller-supplied media `link` that Meta will fetch on our
 * behalf. Accepts only syntactically valid http(s) URLs whose host is not an
 * obviously-internal/private target (loopback, link-local/metadata, RFC-1918
 * ranges, IPv6 loopback, or *.internal / *.local). Conservative-by-default:
 * any parse failure returns false.
 */
function isSafePublicMediaUrl(link: string): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  // Strip IPv6 brackets for matching.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;

  // Internal hostnames.
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.internal') || host.endsWith('.local')) return false;

  // IPv6 loopback / unspecified.
  if (host === '::1' || host === '::') return false;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — pull out the trailing dotted quad.
  const mapped = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ? host : (mapped?.[1] ?? null);
  if (ipv4) {
    const o = ipv4.split('.').map(Number);
    if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (o[0] === 0) return false; // 0.0.0.0/8 (incl. 0.0.0.0)
    if (o[0] === 127) return false; // 127.0.0.0/8 loopback
    if (o[0] === 10) return false; // 10.0.0.0/8
    if (o[0] === 192 && o[1] === 168) return false; // 192.168.0.0/16
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return false; // 172.16.0.0/12
    if (o[0] === 169 && o[1] === 254) return false; // 169.254.0.0/16 link-local / metadata
  }
  return true;
}

/** Send a media message (image/video/audio/document) inside the open 24h window. */
export async function sendMediaMessage(
  conversationId: string,
  actorUserId: string,
  input: {
    kind: MediaKind;
    link?: string;
    mediaId?: string;
    caption?: string;
    filename?: string;
    voice?: boolean;
  }
) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (conv.contact.isBlocked) throw new AppError('Contact is blocked', 409, 'WA_CONTACT_BLOCKED');
  if (!windowOpen(conv.windowExpiresAt)) {
    throw new AppError(
      'The 24-hour reply window is closed — send an approved template instead.',
      409,
      'WA_WINDOW_CLOSED'
    );
  }
  if (!input.link && !input.mediaId) {
    throw new AppError('A media link or id is required', 400, 'WA_MEDIA_REQUIRED');
  }
  // SSRF guard: when a link is supplied (and we aren't using a scanned upload),
  // Meta fetches it server-side — reject non-http(s) schemes and internal hosts.
  if (input.link && !input.mediaId && !isSafePublicMediaUrl(input.link)) {
    throw new AppError(
      'The media URL must be a publicly reachable http(s) link',
      400,
      'WA_INVALID_MEDIA_URL'
    );
  }
  const mediaObj: Record<string, any> = input.mediaId
    ? { id: input.mediaId }
    : { link: input.link };
  if (input.caption && input.kind !== 'audio') mediaObj.caption = input.caption;
  if (input.kind === 'document' && input.filename) mediaObj.filename = input.filename;

  const typeMap: Record<MediaKind, WaMessageType> = {
    image: 'IMAGE',
    video: 'VIDEO',
    audio: 'AUDIO',
    document: 'DOCUMENT',
  };
  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: typeMap[input.kind],
    text: input.caption ?? null,
    // Mark recorded voice notes so the inbox renders them as a voice message
    // (waveform player) rather than a generic audio file.
    preview: input.caption || (input.voice ? '[voice message]' : `[${input.kind}]`),
    payload: input.voice ? { voice: true } : undefined,
    message: { type: input.kind, [input.kind]: mediaObj },
  });
}

/**
 * Resolve a conversation + its contact and enforce the standard send guards
 * (exists, not blocked, 24h window open). Shared by the session-type sends.
 */
async function loadSendableConversation(conversationId: string) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (conv.contact.isBlocked) throw new AppError('Contact is blocked', 409, 'WA_CONTACT_BLOCKED');
  if (!windowOpen(conv.windowExpiresAt)) {
    throw new AppError(
      'The 24-hour reply window is closed — send an approved template instead.',
      409,
      'WA_WINDOW_CLOSED'
    );
  }
  return conv;
}

/**
 * React to a prior message by its WAMID inside the open 24h window (emoji '' removes).
 *
 * Unlike normal sends, a reaction is NOT a billable message and has no
 * read-receipt lifecycle, so we deliberately do not persist a standalone
 * `REACTION` bubble row (that produced an orphan outbound bubble that rendered
 * like a reply). Instead — mirroring how inbound reactions are stored — we
 * attach the emoji to the *target* message's `reactions` array, tagged
 * `side: 'out'` so the UI can show our reaction alongside the customer's
 * (`side: 'in'`). Each side holds at most one reaction per message.
 */
export async function sendReaction(
  conversationId: string,
  actorUserId: string,
  input: { wamid: string; emoji: string }
) {
  const conv = await loadSendableConversation(conversationId);
  const wamid = input.wamid?.trim();
  if (!wamid) {
    throw new AppError('A target message id is required', 400, 'WA_REACTION_TARGET_REQUIRED');
  }
  const emoji = input.emoji ?? '';

  const result = await sendWhatsappRaw({
    to: toGraphPhone(conv.contact.phone),
    type: 'reaction',
    reaction: { message_id: wamid, emoji },
  });
  if (!result.ok) {
    waSendFailuresTotal.inc({ error_code: result.error?.code ?? 'unknown' });
    throw new AppError(result.error?.title || 'Failed to send reaction', 502, 'WA_REACTION_FAILED');
  }

  // Resolve the acting agent's display name for the "who reacted" UI.
  const actor = actorUserId
    ? await prisma.user
        .findUnique({ where: { id: actorUserId }, select: { firstName: true, lastName: true } })
        .catch(() => null)
    : null;
  const byName = [actor?.firstName, actor?.lastName].filter(Boolean).join(' ').trim() || 'You';
  const at = new Date().toISOString();

  const target = await prisma.waMessage.findUnique({
    where: { wamid },
    select: { id: true, reactions: true },
  });
  if (target) {
    const existing = Array.isArray(target.reactions) ? (target.reactions as any[]) : [];
    // Replace our prior reaction (if any); keep the customer's (`side !== 'out'`).
    const withoutOurs = existing.filter((r) => r?.side !== 'out');
    const reactions = emoji
      ? [...withoutOurs, { from: actorUserId || 'business', side: 'out', emoji, at, byName }]
      : withoutOurs;
    await prisma.waMessage
      .update({ where: { id: target.id }, data: { reactions } })
      .catch(() => {});
  }

  await prisma.waContact
    .update({ where: { id: conv.contactId }, data: { lastOutboundAt: new Date() } })
    .catch(() => {});
  await touchOnMessage(conv.id, {
    preview: emoji ? `You reacted ${emoji}` : 'Removed a reaction',
    at: new Date(),
    inbound: false,
  });

  emitWa(
    'wa:reaction',
    {
      conversationId: conv.id,
      targetWamid: wamid,
      emoji,
      from: actorUserId || 'business',
      side: 'out',
      byName,
    },
    conv.id
  );

  return { ok: true as const, targetWamid: wamid, emoji, side: 'out' as const };
}

/** Send a location pin inside the open 24h window. */
export async function sendLocation(
  conversationId: string,
  actorUserId: string,
  input: { latitude: number; longitude: number; name?: string; address?: string }
) {
  const conv = await loadSendableConversation(conversationId);
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('Valid latitude and longitude are required', 400, 'WA_LOCATION_INVALID');
  }
  const location: Record<string, any> = { latitude, longitude };
  if (input.name) location.name = input.name;
  if (input.address) location.address = input.address;

  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: 'LOCATION',
    text: input.name || input.address || null,
    preview: input.name || input.address || '[location]',
    payload: location,
    message: { type: 'location', location },
  });
}

/** Send one or more contact cards (Meta `contacts` array) inside the open 24h window. */
export async function sendContacts(
  conversationId: string,
  actorUserId: string,
  input: { contacts: any[] }
) {
  const conv = await loadSendableConversation(conversationId);
  const contacts = Array.isArray(input.contacts) ? input.contacts : [];
  if (!contacts.length) {
    throw new AppError('At least one contact is required', 400, 'WA_CONTACTS_REQUIRED');
  }

  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: 'CONTACTS',
    text: null,
    preview: '[contact card]',
    payload: { contacts },
    message: { type: 'contacts', contacts },
  });
}

/** Start a brand-new conversation to any number by sending an approved template. */
export async function startConversationWithTemplate(input: {
  phone: string;
  actorUserId: string;
  templateId: string;
  bodyParams?: string[];
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  headerImageId?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  buttonUrlParam?: string;
}) {
  const channel = await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const contact = await upsertContactByPhone(input.phone, {});
  const conversation = await getOrCreateConversation(channel.id, contact.id);
  const message = await sendTemplateToConversation(conversation.id, input.actorUserId, {
    templateId: input.templateId,
    bodyParams: input.bodyParams,
    bodyNamedParams: input.bodyNamedParams,
    headerText: input.headerText,
    headerImageId: input.headerImageId,
    headerMediaUrl: input.headerMediaUrl,
    headerMediaType: input.headerMediaType,
    buttonUrlParam: input.buttonUrlParam,
  });
  return { conversationId: conversation.id, message };
}
