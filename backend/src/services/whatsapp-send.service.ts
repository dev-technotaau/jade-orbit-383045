import { prisma } from '../config/prisma';
import { isMarketingRefusedCode } from './whatsapp-error-codes';
import { noteMarketingRefusal } from './whatsapp-contact.service';

/**
 * How long to hold off marketing after Meta refuses a recipient.
 *
 * Meta does not publish the real window, so this is a deliberate, documented
 * guess aligned with the 24h figure the rest of the module already uses. It is
 * a floor on futile retries, not a claim about Meta's internals.
 */
const MARKETING_REFUSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { sendWhatsappRaw, toGraphPhone } from './whatsapp.service';
import {
  windowOpen,
  applyMessageTouch,
  touchOnMessage,
  getConversationForOutbound,
} from './whatsapp-conversation.service';
import {
  getChannelPhoneNumberId,
  getDefaultChannel,
  getChannelCatalogId,
} from './whatsapp-channel.service';
import { isSuppressed } from './whatsapp-suppression.service';
import { getWaSettings } from './whatsapp-settings.service';
import { upsertContactByPhone } from './whatsapp-contact.service';
import {
  getTemplate,
  buildTemplateSendComponents,
  renderTemplateBody,
  analyzeTemplateSpec,
  missingTemplateSendParams,
  templateFlowButton,
  mintTemplateFlowToken,
  urlButtonValues,
} from './whatsapp-template.service';
import type { TemplateSendCarouselCard, TemplateProductSection } from './whatsapp-template.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { emitWaEvent } from './whatsapp-events.service';
import { waMessagesTotal, waSendFailuresTotal, waSendDuration } from '../utils/whatsapp-metrics';
import type { WaContact, WaMessageType, WaTemplateCategory } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Error code stamped on an outbound row the do-not-contact list refused.
 *
 * Meta's own "recipient has not opted in" code, deliberately reused so a
 * suppressed send is classified exactly like a Meta-side refusal everywhere it
 * is read back — the inbox bubble, the error breakdown, and the Chatwoot bridge,
 * which maps it to a policy rejection rather than an upstream failure.
 */
export const WA_SUPPRESSED_ERROR_CODE = '131050';

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
  /**
   * Language of the template that was sent.
   *
   * The column existed and carried a "per-language analytics" comment, and
   * NOTHING ever wrote it — so per-template analytics counted every language of a
   * template together. A template approved in en_US and hi_IN reported one blended
   * delivery rate, which is precisely the comparison the page exists to make.
   */
  templateLanguage?: string | null;
  /**
   * Category of the template being sent.
   *
   * Persisted on the row AND the key the 24h marketing cap counts on. The cap
   * used to resolve "which template names are MARKETING?" at check time and
   * count `templateName IN (...)`, so renaming or re-categorising a template at
   * Meta made a contact's earlier sends stop counting and handed them a fresh
   * quota. It is also what tells `dispatchOutbound` to take the per-contact
   * reservation below.
   */
  templateCategory?: WaTemplateCategory | null;
  campaignId?: string | null;
  contextWamid?: string | null; // WAMID this message quotes/replies to
  payload?: Record<string, any> | null; // structured body (reaction/location/contacts)
  /**
   * Meta media id for an outbound media send, and its MIME type.
   *
   * These are persisted, not just used to build the Graph body. Without them an
   * outbound IMAGE/VIDEO/AUDIO/DOCUMENT row carried no media reference at all,
   * and the inbox renders media strictly off `mediaId` (MessageAttachment.tsx:94,
   * MessageImage.tsx:63, MessageVideo.tsx:57 all bail on a falsy id) — so every
   * file the console itself sent showed as an empty bubble with a timestamp and
   * a tick. `streamMedia`'s ownership check also resolves the id against
   * WaMessage, so re-downloading anything we sent 404'd for the same reason.
   */
  mediaId?: string | null;
  mediaMime?: string | null;
  /**
   * Send even though the number is on the do-not-contact list.
   *
   * Exactly one message type qualifies, and it is the acknowledgement of the
   * opt-out itself: the suppression row is written the instant the customer's
   * STOP is processed, so a confirmation sent through the normal gate would be
   * refused by the very request it is confirming and the customer would get the
   * silence the acknowledgement exists to prevent. Nothing else may set this —
   * a suppressed number has asked not to hear from us.
   */
  bypassSuppression?: boolean;
  message: Record<string, any>; // Cloud API message body (type-specific)
}

/** Width of the per-contact marketing frequency window. */
const MARKETING_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The message the operator (and the campaign worker) sees when the cap bites. */
const marketingCapError = (cap: number) =>
  new AppError(
    `Contact has reached the marketing limit of ${cap} message(s) per 24 hours`,
    409,
    'WA_MARKETING_CAP'
  );

/**
 * Count this contact's MARKETING template sends inside the 24h window.
 *
 * A FAILED send does not burn the customer's daily quota -- a network blip is not
 * a message they received. Meta's DELIBERATE refusals are handled by the cooldown
 * gate in `assertSendAllowed` instead, which blocks outright rather than consuming
 * one slot of a cap the operator can raise.
 */
function countMarketingInWindow(
  tx: Pick<typeof prisma, 'waMessage'>,
  contactId: string
): Promise<number> {
  return tx.waMessage.count({
    where: {
      contactId,
      direction: 'OUTBOUND',
      type: 'TEMPLATE',
      templateCategory: 'MARKETING',
      createdAt: { gte: new Date(Date.now() - MARKETING_CAP_WINDOW_MS) },
      status: { not: 'FAILED' },
    },
  });
}

/**
 * Insert the outbound row -- and for a MARKETING template, insert it as a
 * RESERVATION: count the window and write the row inside one transaction, under
 * a per-contact advisory lock.
 *
 * The cap was a read-then-write with nothing between the two halves, so a
 * campaign batch, a drip tick and a manual send that overlapped each read
 * `cap - 1` and each sent: the compliance limit the operator configured was
 * simply exceeded, and Meta counts those against the number's quality rating.
 * Serialising on the contact means the losing send sees the winner's QUEUED row
 * and refuses. The lock is transaction-scoped, so it is released by the COMMIT
 * that makes the row visible and never outlives the (purely local) transaction --
 * the Graph call happens afterwards, outside it.
 */
async function createOutboundRow(p: DispatchParams) {
  const data = {
    channelId: p.channelId,
    conversationId: p.conversationId,
    contactId: p.contactId,
    direction: 'OUTBOUND' as const,
    type: p.type,
    status: 'QUEUED' as const,
    text: p.text,
    templateName: p.templateName ?? null,
    templateLanguage: p.templateLanguage ?? null,
    templateCategory: p.templateCategory ?? null,
    sentByUserId: p.actorUserId,
    campaignId: p.campaignId ?? null,
    contextWamid: p.contextWamid ?? null,
    mediaId: p.mediaId ?? null,
    mediaMime: p.mediaMime ?? null,
    payload: p.payload ?? undefined,
  };

  if (p.templateCategory !== 'MARKETING') return prisma.waMessage.create({ data });

  const { marketingCapPer24h } = await getWaSettings();
  if (marketingCapPer24h <= 0) return prisma.waMessage.create({ data });

  return prisma.$transaction(async (tx) => {
    // Two int4 keys rather than one: the namespace keeps this lock from
    // colliding with any other advisory lock taken on the same contact id.
    //
    // $executeRaw, NOT $queryRaw: pg_advisory_xact_lock() returns void, and
    // $queryRaw asks the driver adapter to deserialize the result set, which
    // fails with "Failed to deserialize column of type 'void'" (P2010). That
    // took down every MARKETING template send with a 500 while the cap was
    // enabled. We discard the result here anyway — the point is the lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wa:marketing-cap'), hashtext(${p.contactId}))`;
    const sentInWindow = await countMarketingInWindow(tx, p.contactId);
    if (sentInWindow >= marketingCapPer24h) throw marketingCapError(marketingCapPer24h);
    return tx.waMessage.create({ data });
  });
}

/** Persist an outbound WaMessage, call the Cloud API, reconcile WAMID + status, emit. */
export async function dispatchOutbound(p: DispatchParams) {
  // Do-not-contact, checked at the send rather than only when a campaign
  // audience was built. Every outbound path — session reply, template, drip
  // step, scheduled message, campaign batch, Chatwoot bridge — funnels through
  // here, so this is the one place that can actually make the list mean what it
  // says. Recorded as a FAILED row (not silently dropped) so the operator can
  // see why nothing was sent.
  if (!p.bypassSuppression && (await isSuppressed(p.contactPhone))) {
    logger.warn(
      `WhatsApp outbound blocked: ${p.contactPhone} is on the suppression list ` +
        `(conversation ${p.conversationId})`
    );
    return prisma.waMessage.create({
      data: {
        channelId: p.channelId,
        conversationId: p.conversationId,
        contactId: p.contactId,
        direction: 'OUTBOUND',
        type: p.type,
        status: 'FAILED',
        text: p.text,
        templateName: p.templateName ?? null,
        templateLanguage: p.templateLanguage ?? null,
        templateCategory: p.templateCategory ?? null,
        sentByUserId: p.actorUserId,
        campaignId: p.campaignId ?? null,
        mediaId: p.mediaId ?? null,
        mediaMime: p.mediaMime ?? null,
        payload: p.payload ?? undefined,
        errorCode: WA_SUPPRESSED_ERROR_CODE,
        errorTitle: 'Recipient is on the do-not-contact (suppression) list',
      },
    });
  }

  const row = await createOutboundRow(p);

  // Send FROM the number this conversation belongs to. `channelId` was carried
  // all the way down here only to stamp the WaMessage row, while the Graph call
  // itself read the env phone-number id — so on a WABA with a second number the
  // customer who wrote to number B was answered by number A, in a thread that
  // does not exist on their phone.
  const senderPhoneId = await getChannelPhoneNumberId(p.channelId);

  const endTimer = waSendDuration.startTimer();
  const result = await sendWhatsappRaw(
    { to: toGraphPhone(p.contactPhone), ...p.message },
    senderPhoneId,
    // The row exists before the send, so its id is a correlation token Meta can
    // hand back on a status callback that beats the WAMID into the database.
    row.id
  );
  endTimer({ result: result.ok ? 'ok' : 'error' });

  if (result.ok) {
    waMessagesTotal.inc({ direction: 'outbound', type: p.type, status: 'sent' });
  } else {
    waMessagesTotal.inc({ direction: 'outbound', type: p.type, status: 'failed' });
    waSendFailuresTotal.inc({ error_code: result.error?.code ?? 'unknown' });
  }

  // Reconcile the row with Meta's answer and the thread fields that answer moves,
  // in one transaction. They were two independent writes: a crash or a pool
  // timeout between them left the message SENT while the conversation still
  // advertised the PREVIOUS message as its latest, so the reply the agent had just
  // sent showed up neither in the thread preview nor at the top of the inbox until
  // some later message happened to touch the row.
  const settledAt = new Date();
  const { updated, conversation: touched } = await prisma.$transaction(async (tx) => {
    if (result.ok) {
      // The status is advanced ONLY from QUEUED, and separately from the WAMID.
      //
      // Now that a status callback can find this row by `biz_opaque_callback_data`
      // before the WAMID is written, Meta's `delivered` (or even `read`) can land
      // between the Graph response and this write — and an unconditional
      // `status: 'SENT'` would drag the message backwards, un-ticking a message
      // the customer has already opened.
      await tx.waMessage.updateMany({
        where: { id: row.id, status: 'QUEUED' },
        data: { status: 'SENT' },
      });
    }
    const updated = await tx.waMessage.update({
      where: { id: row.id },
      data: result.ok
        ? { wamid: result.wamid, sentAt: settledAt }
        : {
            status: 'FAILED',
            // Fall back to the title. Transient failures (circuit_open,
            // network_error, request_timeout, credentials_missing) never carry a
            // Meta code, and this column is what the campaign worker reads to
            // decide FAILED vs roll-back-to-PENDING — a null read as "permanent".
            errorCode: result.error?.code ?? result.error?.title,
            errorTitle: result.error?.title,
          },
    });
    const conversation = await applyMessageTouch(tx, p.conversationId, {
      preview: p.preview,
      at: settledAt,
      inbound: false,
    });
    return { updated, conversation };
  });
  // Announced after the commit, not from inside the transaction — a rollback
  // would otherwise leave the inbox showing a send that never landed.
  emitWa(
    'wa:conversation',
    { conversationId: p.conversationId, conversation: touched },
    p.conversationId
  );

  // `lastMarketingAt` is stamped HERE, not at the policy gate, and only when the
  // send succeeded. Stamping it before dispatch meant a marketing message that
  // never left the building still consumed the contact's daily budget: the
  // campaign audience pre-filter reads this column, so a failed batch quietly
  // excluded its own recipients from the retry.
  await prisma.waContact
    .update({
      where: { id: p.contactId },
      data: {
        lastOutboundAt: settledAt,
        ...(result.ok && p.templateCategory === 'MARKETING' ? { lastMarketingAt: settledAt } : {}),
      },
    })
    .catch(() => {});
  if (!result.ok && isMarketingRefusedCode(result.error?.code)) {
    await noteMarketingRefusal(p.contactId, String(result.error?.code));
  }

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

    // Close the response episode opened by the customer's inbound message and
    // fold its duration into the running totals.
    //
    // The old metric was firstResponseAt - createdAt, and there is exactly one
    // conversation row per contact for all time, so it measured from that person's
    // FIRST EVER message and only ever counted one reply per customer. Averaging
    // over accumulated responses instead means every episode counts and a
    // long-standing customer does not poison the mean.
    await prisma.$executeRaw`
      UPDATE "WaConversation"
         SET "responseCount" = "responseCount" + 1,
             "responseTotalSeconds" = "responseTotalSeconds"
               + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "awaitingReplySince"))::int),
             "awaitingReplySince" = NULL
       WHERE "id" = ${p.conversationId}
         AND "awaitingReplySince" IS NOT NULL
    `.catch(() => 0);
  }

  emitWa('wa:message', { conversationId: p.conversationId, message: updated }, p.conversationId);

  // External subscribers hear about the send itself, not only about the delivery
  // callbacks that follow it. Every outbound path funnels through here — console
  // reply, template, campaign batch, drip step, scheduled message, bridge — so
  // this is the one place that can tell a CRM "we said this to your customer"
  // without each of those paths remembering to. The message body rides along
  // because a subscriber that has to fetch it back has no way to: the API is
  // behind the operator password.
  emitWaEvent('whatsapp.message.outbound', {
    messageId: updated.id,
    wamid: updated.wamid,
    conversationId: p.conversationId,
    contactId: p.contactId,
    phone: p.contactPhone,
    type: p.type,
    text: p.text,
    templateName: p.templateName ?? null,
    templateCategory: p.templateCategory ?? null,
    campaignId: p.campaignId ?? null,
    status: updated.status,
    errorCode: updated.errorCode,
    // Who sent it: the operator label for a human reply, null for automation.
    sentByUserId: p.actorUserId,
  }).catch(() => {});

  if (!result.ok) {
    logger.warn(
      `WhatsApp outbound failed conv=${p.conversationId} err=${result.error?.title ?? 'unknown'}`
    );
  }

  // Surface the backoff hint alongside the persisted row. `sendWhatsappRaw`
  // computes `retryAfterMs` from Meta's Retry-After header and it was being
  // dropped on the floor here — nothing in the system ever slept on a throttle,
  // so a rate-limited campaign just kept pushing at its configured rate and
  // collecting 429s. Attached as a non-enumerable property so it rides along
  // without changing the shape of the WaMessage rows callers serialize.
  if (result.retryAfterMs != null) {
    Object.defineProperty(updated, 'retryAfterMs', {
      value: result.retryAfterMs,
      enumerable: false,
    });
  }

  // Same trick for the upstream HTTP status. The Chatwoot bridge answers an
  // agent's HTTP client, so it has to hand Meta's own status back: without it a
  // throttle (429) or a rejected payload (400) reached the agent as a generic
  // bad gateway, with no hint about whether re-sending would help.
  if (!result.ok && result.error?.status != null) {
    Object.defineProperty(updated, 'metaHttpStatus', {
      value: result.error.status,
      enumerable: false,
    });
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

/**
 * The one-line acknowledgement a customer gets for texting STOP.
 *
 * Deliberately its own entry point rather than an option on `sendSessionMessage`:
 * it is the only send in the module that is allowed past the do-not-contact list
 * (see `bypassSuppression`), and that exemption should be reachable by name, not
 * by a boolean any caller could pass. Everything else still applies — the
 * contact must not be blocked and the 24h window must be open, which it is by
 * construction because their own message opened it moments ago.
 *
 * Sending nothing was the alternative, and it is the standard route to a quality
 * hit: an unacknowledged STOP is re-sent, and then reported to Meta.
 */
export async function sendOptOutConfirmation(conversationId: string, text: string) {
  const body = text.trim();
  if (!body) throw new AppError('Message text is required', 400, 'WA_EMPTY_MESSAGE');
  const conv = await loadSendableConversation(conversationId);
  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId: null,
    type: 'TEXT',
    text: body,
    preview: body,
    bypassSuppression: true,
    // No preview_url: an unsubscribe confirmation has nothing to link to, and
    // rendering a link card on it would look like one last piece of marketing.
    message: { type: 'text', text: { preview_url: false, body } },
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
  /**
   * DOCUMENT header: the filename the attachment shows on the handset.
   *
   * The ordinary document send has always passed one (`sendMediaMessage`), so
   * the same PDF arrived correctly named as a session message and named after
   * its media id — or the last segment of its URL — when it headed a template.
   */
  headerMediaFilename?: string;
  /** Value for the FIRST dynamic URL button — the single-button shorthand. */
  buttonUrlParam?: string;
  /**
   * One value per dynamic URL button, in the order the template authored them.
   *
   * Meta allows TWO URL buttons and either may carry a {{n}} suffix. Only the
   * first could ever be filled in, so a template with two — unauthorable here,
   * but imported APPROVED from Business Manager — was refused for every
   * recipient with (#131008) because the second button got no parameter.
   */
  buttonUrlParams?: string[];
  /**
   * One-time code for an AUTHENTICATION template. Sent as BOTH the body
   * parameter and the button parameter, which is what the Cloud API demands.
   */
  otpCode?: string;
  /** COPY_CODE button value. */
  couponCode?: string;
  /** LIMITED_TIME_OFFER expiry, epoch ms. */
  ltoExpirationMs?: number;
  /** LOCATION header pin. */
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  /**
   * FLOW button: the correlation id Meta echoes back on the submission. Left
   * unset the send mints one, which is the only way the reply can be tied to the
   * Flow that produced it — Meta's own default cannot be decoded.
   */
  flowToken?: string;
  /** FLOW button: data for the Flow's entry screen (`flow_action_data`). */
  flowActionData?: Record<string, unknown>;
  /** CATALOG / MPM button: the SKU whose image heads the card. */
  catalogThumbnailProductId?: string;
  /** MPM button: the product list by section — chosen per send, never authored. */
  productSections?: TemplateProductSection[];
  /** PRODUCT header (single-product template): the SKU to show. */
  productRetailerId?: string;
  /**
   * Per-card values for a CAROUSEL template, in card order.
   *
   * A carousel's media, body values and button values live on the CARDS, not on
   * the bubble, so none of the fields above can carry them. Without this a
   * carousel template — approvable here since the wizard gained a card editor —
   * went out with the bubble parameters only and Meta refused every send with
   * (#131008), which for a campaign means the entire audience.
   */
  carouselCards?: TemplateSendCarouselCard[];
  campaignId?: string;
}

/**
 * The `WaMessage.payload` a TEMPLATE row carries — the record of what was sent.
 *
 * Two halves, and both are needed. `template.components` is the APPROVED template
 * as Meta returned it, copied onto the row rather than looked up at render time:
 * a template can be edited, re-approved or re-categorised afterwards, and reading
 * it live would redraw a message the customer never received with today's wording
 * (and would show nothing at all once the template is deleted). `values` is what
 * this particular send filled the placeholders with.
 *
 * `values` is always written, even when empty — its presence is what tells the
 * inbox this payload is ours to render, as opposed to the raw Cloud API body the
 * Chatwoot bridge stores on the rows it dispatches.
 */
export type WaTemplateMessagePayload = {
  template: {
    name: string;
    language: string;
    category: WaTemplateCategory;
    components: unknown;
  };
  values: {
    headerText?: string;
    /** Uploaded header media — also mirrored onto `WaMessage.mediaId`. */
    headerMediaId?: string;
    /** Header media by public link; there is no media row behind one of these. */
    headerMediaUrl?: string;
    headerMediaType?: 'image' | 'video' | 'document';
    headerMediaFilename?: string;
    headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
    bodyParams?: string[];
    bodyNamedParams?: Array<{ name: string; text: string }>;
    /** One value per DYNAMIC url button, in authored order. */
    buttonUrlParams?: string[];
    couponCode?: string;
    ltoExpirationMs?: number;
    catalogThumbnailProductId?: string;
    productSections?: TemplateProductSection[];
    productRetailerId?: string;
    carouselCards?: TemplateSendCarouselCard[];
  };
};

/**
 * Build that record from the template row and the values the send resolved.
 *
 * Deliberately NOT given the one-time code of an AUTHENTICATION template as a
 * field of its own. The code is already `bodyParams[0]` here — the send derives
 * the body parameter from `otpCode` so the body and the copy button cannot
 * disagree — and storing a live code twice on the same row buys the bubble
 * nothing it cannot read from the body it renders anyway.
 */
function buildTemplateMessagePayload(
  tpl: { name: string; language: string; category: WaTemplateCategory; components: unknown },
  input: TemplateSendInput & { bodyParams?: string[] }
): WaTemplateMessagePayload {
  const urlValues = urlButtonValues(input);
  return {
    template: {
      name: tpl.name,
      language: tpl.language,
      category: tpl.category,
      components: tpl.components,
    },
    values: {
      ...(input.headerText ? { headerText: input.headerText } : {}),
      ...(input.headerImageId ? { headerMediaId: input.headerImageId } : {}),
      ...(input.headerMediaUrl ? { headerMediaUrl: input.headerMediaUrl } : {}),
      ...(input.headerMediaType ? { headerMediaType: input.headerMediaType } : {}),
      ...(input.headerMediaFilename ? { headerMediaFilename: input.headerMediaFilename } : {}),
      ...(input.headerLocation ? { headerLocation: input.headerLocation } : {}),
      ...(input.bodyParams?.length ? { bodyParams: input.bodyParams } : {}),
      ...(input.bodyNamedParams?.length ? { bodyNamedParams: input.bodyNamedParams } : {}),
      ...(urlValues.length ? { buttonUrlParams: urlValues } : {}),
      ...(input.couponCode ? { couponCode: input.couponCode } : {}),
      ...(input.ltoExpirationMs !== undefined ? { ltoExpirationMs: input.ltoExpirationMs } : {}),
      ...(input.catalogThumbnailProductId
        ? { catalogThumbnailProductId: input.catalogThumbnailProductId }
        : {}),
      ...(input.productSections?.length ? { productSections: input.productSections } : {}),
      ...(input.productRetailerId ? { productRetailerId: input.productRetailerId } : {}),
      ...(input.carouselCards?.length ? { carouselCards: input.carouselCards } : {}),
    },
  };
}

/**
 * Marketing policy gate: opt-out, the Meta refusal cooldown and an early read of
 * the per-contact 24h frequency cap.
 *
 * Lifted out of `sendTemplateToConversation` so the Chatwoot bridge can run the
 * identical checks. The bridge kept its own persist+send path and gated only on
 * `isBlocked`/`optInStatus`, so an agent working inside Chatwoot could push a
 * contact past marketingCapPer24h — and re-send to a recipient Meta had already
 * told us it would refuse — while the console refused the very same send.
 *
 * Callers that already loaded the template row pass its `category`; the bridge
 * only sees a Meta-shaped payload, so it passes the template NAME (plus the
 * language, which together are unique) and the category is resolved here. A
 * template we do not know resolves to no category and is treated as non-marketing.
 *
 * Returns the resolved category so the caller can stamp it onto the outbound row
 * (and so `dispatchOutbound` takes the per-contact reservation) without resolving
 * the same template a second time.
 */
export async function assertSendAllowed(p: {
  contact: Pick<WaContact, 'id' | 'optInStatus' | 'marketingRefusedAt' | 'marketingRefusedCode'>;
  category?: WaTemplateCategory | null;
  templateName?: string | null;
  templateLanguage?: string | null;
}): Promise<WaTemplateCategory | null> {
  let category = p.category ?? null;
  if (category == null && p.templateName) {
    const tpl = await prisma.waTemplate.findFirst({
      where: {
        name: p.templateName,
        ...(p.templateLanguage ? { language: p.templateLanguage } : {}),
      },
      select: { category: true },
    });
    category = tpl?.category ?? null;
  }
  if (category !== 'MARKETING') return category;

  if (p.contact.optInStatus === 'OPTED_OUT') {
    throw new AppError('Contact has opted out of marketing messages', 409, 'WA_OPTED_OUT');
  }

  // Refusal cooldown -- deliberately NOT part of the numeric cap.
  //
  // "How many marketing messages will I send someone" and "Meta has already
  // told me it will refuse this recipient" are different questions. Folding
  // the second into the first meant that raising marketingCapPer24h to N let
  // N-1 more guaranteed-to-fail sends through, each one pushing Meta's
  // per-user limit further down. This gate holds even when the cap is
  // disabled (0 = unlimited).
  if (p.contact.marketingRefusedAt != null) {
    const elapsed = Date.now() - p.contact.marketingRefusedAt.getTime();
    if (elapsed < MARKETING_REFUSAL_COOLDOWN_MS) {
      const hours = Math.ceil((MARKETING_REFUSAL_COOLDOWN_MS - elapsed) / 3_600_000);
      throw new AppError(
        `Meta declined the last marketing message to this contact (error ${
          p.contact.marketingRefusedCode ?? 'unknown'
        }) and will decline a re-send. Holding off for ~${hours}h. Marketing delivery ` +
          'depends on the recipient engaging with you -- ask them to message you first, ' +
          'or use a UTILITY template.',
        409,
        'WA_MARKETING_REFUSED'
      );
    }
  }

  // Single chokepoint (campaign + manual + drip + scheduled + Chatwoot bridge)
  // for the per-contact marketing frequency cap.
  //
  // The cap used to be evaluated only when a campaign audience was materialized,
  // and only as "has this contact had ANY marketing in 24h" — so `cap: 2` made
  // the condition false and removed the cap entirely, `cap: 0` (documented and
  // labelled in the UI as unlimited) still enforced one per day, and manual,
  // drip and scheduled template sends bypassed it completely. Count the actual
  // marketing sends in the window instead, keyed on the category each message
  // ACTUALLY went out under rather than on today's list of marketing template
  // names, which changes whenever a template is renamed or re-categorised.
  //
  // This is the EARLY reject: it answers the caller with a clear 409 before any
  // work is done. It is deliberately not the enforcement point — two concurrent
  // sends can both pass it — so `dispatchOutbound` re-checks the same count
  // under a per-contact lock in the same transaction that inserts the row.
  const { marketingCapPer24h } = await getWaSettings();
  if (marketingCapPer24h > 0) {
    const sentInWindow = await countMarketingInWindow(prisma, p.contact.id);
    if (sentInWindow >= marketingCapPer24h) throw marketingCapError(marketingCapPer24h);
  }
  return category;
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
  await assertSendAllowed({ contact: conv.contact, category: tpl.category });

  const spec = analyzeTemplateSpec(tpl.components);

  // An AUTHENTICATION template carries the code TWICE: once as the body
  // parameter and once on the button, and Meta shows the body's copy while the
  // button copies its own — so two DIFFERENT values mean the customer taps
  // "copy" and pastes a code the message never displayed, and their login fails
  // while the send looks perfectly successful. The code is therefore the body
  // parameter for such a template, full stop: whatever the caller put in
  // `bodyParams` cannot be anything else, and defaulting only when the array was
  // empty left the two halves free to disagree.
  const bodyParams =
    spec.needsOtpCode && input.otpCode
      ? [input.otpCode]
      : input.otpCode && (!input.bodyParams || input.bodyParams.length === 0)
        ? [input.otpCode]
        : input.bodyParams;

  // REFUSE a send this template cannot satisfy, BEFORE Graph is called.
  //
  // The campaign path has always run this comparison at launch, so an
  // unsatisfiable broadcast is refused before an audience is spent. This path —
  // the inbox, `startConversationWithTemplate`, the scheduled-message runner, the
  // keyword/bot-flow auto-replies and every drip step — had no equivalent: a
  // caller could send a template with none of its required parameters and the
  // only feedback was Meta's opaque (#131008), once per recipient. Same spec,
  // same wording, answered locally.
  const missing = missingTemplateSendParams(spec, {
    ...input,
    bodyParams,
  });
  if (missing.length > 0) {
    throw new AppError(
      `Template "${tpl.name}" needs ${missing.join(', ')}. WhatsApp refuses a message whose parameters do not match the approved template.`,
      400,
      'WA_TEMPLATE_PARAMS_MISSING'
    );
  }

  // A single-product template's header names the SKU *and* the catalog it lives
  // in. The catalog is a property of the number, never of the caller, so it is
  // resolved here — and a template that needs one on a number with none bound is
  // refused with a sentence the operator can act on instead of Meta's (#131008).
  const catalogId = spec.needsProduct ? await getChannelCatalogId(conv.channelId) : null;
  if (spec.needsProduct && !catalogId) {
    throw new AppError(
      'No catalog is bound to this number, so a product template cannot be sent. ' +
        'Connect one under Settings → Commerce first.',
      409,
      'WA_NO_CATALOG'
    );
  }

  // FLOW button: mint the per-send correlation token unless the caller named one.
  //
  // Meta defaults this field, so nothing was ever REJECTED for its absence — but
  // its default is opaque, so every Flow submission arriving from a template
  // landed with `flowId: null` and the Flows page's per-flow response list stayed
  // empty no matter how many customers completed it.
  const flowButton = templateFlowButton(tpl.components);
  const flowToken =
    input.flowToken ?? (flowButton ? mintTemplateFlowToken(flowButton.metaFlowId) : undefined);

  const components = buildTemplateSendComponents({
    bodyParams,
    bodyNamedParams: input.bodyNamedParams,
    headerText: input.headerText,
    headerImageId: input.headerImageId,
    headerMediaUrl: input.headerMediaUrl,
    headerMediaType: input.headerMediaType,
    headerMediaFilename: input.headerMediaFilename,
    buttonUrlParam: input.buttonUrlParam,
    buttonUrlParams: input.buttonUrlParams,
    otpCode: input.otpCode,
    couponCode: input.couponCode,
    ltoExpirationMs: input.ltoExpirationMs,
    headerLocation: input.headerLocation,
    carouselCards: input.carouselCards,
    // Flow + catalogue parameters. All four were unreachable from any send path,
    // so a FLOW template could not be correlated and a catalog / multi-product
    // template went out with no products named at all.
    flowToken,
    flowActionData: input.flowActionData,
    catalogThumbnailProductId: input.catalogThumbnailProductId,
    productSections: input.productSections,
    productRetailerId: input.productRetailerId,
    catalogId: catalogId ?? undefined,
    // The authored components decide which INDEX each button parameter carries.
    // Without them the builder numbered buttons by the order it emitted them, so
    // a coupon template whose COPY_CODE button sits after a quick reply was sent
    // with the wrong index and Meta rejected it with (#131008).
    templateComponents: tpl.components,
  });

  // Render the body with variables substituted so the chat bubble shows the
  // actual message (an empty `text` renders as an empty bubble). Falls back to a
  // labelled preview only if the template has no body text.
  //
  // Rendered from the SAME array that went to Meta, not from `input.bodyParams`.
  // An authentication caller supplies the code once as `otpCode` — which is what
  // the compose modal now does, since asking for the code twice let the body and
  // the copy button disagree — and reading the raw input here stored the literal
  // "{{1}} is your verification code" on a row whose recipient saw the real code.
  const renderedBody =
    renderTemplateBody(tpl.components, {
      bodyParams,
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
    templateLanguage: tpl.language,
    templateCategory: tpl.category,
    campaignId: input.campaignId,
    // WHAT WE SENT, kept on the row so the inbox can draw the message the
    // customer actually received.
    //
    // Everything but the body text used to be discarded the moment Graph
    // answered: the header, the footer, the buttons, the carousel cards, the
    // offer countdown. The bubble was one paragraph, so an agent reading the
    // thread back could not tell an "Order shipped" header from an "Order
    // cancelled" one when both share a body, could not see which coupon code was
    // issued when the customer wrote "the code doesn't work", and saw a ten-card
    // product carousel — the most expensive message this console can send — as a
    // single line of text.
    //
    // Every other rich outbound type (interactive, media, location, contacts)
    // already stored its payload here; the template path simply never passed one.
    payload: buildTemplateMessagePayload(tpl, { ...input, bodyParams }),
    // The header media, in the columns the media renderers already read. Only an
    // UPLOADED header has an id; a link header is recorded in the payload above,
    // because there is no media row behind it to fetch.
    mediaId: input.headerImageId ?? null,
    message: {
      type: 'template',
      template: { name: tpl.name, language: { code: tpl.language }, components },
    },
  });
}

/** A header above an interactive prompt: a title, or an image / video / document. */
export interface InteractiveHeader {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  link?: string;
  id?: string;
  filename?: string;
}

interface InteractiveInput {
  kind:
    | 'button'
    | 'list'
    | 'cta_url'
    | 'flow'
    | 'product'
    | 'product_list'
    | 'location_request_message'
    | 'address_message';
  bodyText: string;
  /** Header above the prompt. Meta forbids one on several kinds — see below. */
  header?: InteractiveHeader;
  /** ISO country for an address_message; Meta supports IN and SG only. */
  addressCountry?: 'IN' | 'SG';
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
  // Commerce (kind === 'product' | 'product_list'). `catalogId` is optional:
  // omitted, the channel's bound catalog is used, which is what the settings
  // page configures once instead of the agent retyping it per send.
  catalogId?: string;
  /** Single-product message: the one item to show. */
  productRetailerId?: string;
  /** Multi-product message: up to 30 items across up to 10 titled sections. */
  productSections?: Array<{ title?: string; productRetailerIds: string[] }>;
  /** Header text for a multi-product message (Meta requires one). */
  headerText?: string;
  footerText?: string;
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
  } else if (input.kind === 'product' || input.kind === 'product_list') {
    // The catalog id is resolved from the channel unless the caller named one:
    // a product message Meta cannot resolve to a catalog is rejected outright,
    // and the agent has no way to know the id.
    const catalogId = input.catalogId || (await getChannelCatalogId(conv.channelId));
    if (!catalogId) {
      throw new AppError(
        'No catalog is bound to this number. Connect one under Settings → Commerce first.',
        409,
        'WA_NO_CATALOG'
      );
    }
    if (input.kind === 'product') {
      if (!input.productRetailerId) {
        throw new AppError('A product is required', 400, 'WA_NO_PRODUCT');
      }
      interactive = {
        type: 'product',
        body: { text: bodyText },
        ...(input.footerText ? { footer: { text: input.footerText } } : {}),
        action: { catalog_id: catalogId, product_retailer_id: input.productRetailerId },
      };
    } else {
      const sections = (input.productSections ?? [])
        .map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          product_items: (s.productRetailerIds ?? []).map((id) => ({ product_retailer_id: id })),
        }))
        .filter((s) => s.product_items.length > 0);
      if (sections.length === 0) {
        throw new AppError('At least one product is required', 400, 'WA_NO_PRODUCT');
      }
      // Meta requires a TEXT header on a multi-product message and rejects the
      // send without one, so fall back to a neutral label rather than 400ing on
      // a field the composer does not have to ask for.
      interactive = {
        type: 'product_list',
        header: { type: 'text', text: input.headerText || 'Our products' },
        body: { text: bodyText },
        ...(input.footerText ? { footer: { text: input.footerText } } : {}),
        action: { catalog_id: catalogId, sections },
      };
    }
  } else if (input.kind === 'location_request_message') {
    // One tap and the customer's location comes back as a normal inbound
    // `location` message. The alternative in this product was asking in prose and
    // hoping — the standard delivery / field-service pattern was simply missing.
    interactive = {
      type: 'location_request_message',
      body: { text: bodyText },
      action: { name: 'send_location' },
    };
  } else if (input.kind === 'address_message') {
    // India/Singapore structured address collection. The reply arrives as an
    // `interactive.nfm_reply`, i.e. through the same path a Flow submission takes.
    interactive = {
      type: 'address_message',
      body: { text: bodyText },
      action: {
        name: 'address_message',
        parameters: { country: input.addressCountry || 'IN' },
      },
    };
  } else {
    interactive = {
      type: 'list',
      body: { text: bodyText },
      action: { button: input.listButton || 'Menu', sections: input.sections ?? [] },
    };
  }

  // Header + footer, spliced on after the kind branches.
  //
  // Meta does NOT accept them everywhere, and a rejected send is worse than a
  // missing header: the collection prompts take a body and nothing else, a single
  // product message takes no header at all, a list header must be text, and
  // product_list already builds its own mandatory text header above.
  const collectsData =
    input.kind === 'location_request_message' || input.kind === 'address_message';
  const headerAllowed = !collectsData && input.kind !== 'product' && input.kind !== 'product_list';
  if (input.header && headerAllowed) {
    const h = input.header;
    if (h.type === 'text') {
      if (h.text) interactive.header = { type: 'text', text: h.text };
    } else if (input.kind === 'list') {
      throw new AppError(
        'A list message can only have a text header.',
        400,
        'WA_INTERACTIVE_BAD_HEADER'
      );
    } else if (h.link || h.id) {
      interactive.header = {
        type: h.type,
        [h.type]: {
          ...(h.id ? { id: h.id } : { link: h.link }),
          ...(h.type === 'document' && h.filename ? { filename: h.filename } : {}),
        },
      };
    }
  }
  // The product kinds set their own footer inside their branch already.
  if (input.footerText && !collectsData && !interactive.footer) {
    interactive.footer = { text: input.footerText };
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

type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

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

/** Send a media message (image/video/audio/document/sticker) inside the open 24h window. */
export async function sendMediaMessage(
  conversationId: string,
  // Nullable like the other session sends: an automated sender (the send-later
  // dispatcher) has no operator label, and stamping an empty string made the row
  // read as a human reply — which silences the bot on that thread for 30 minutes.
  actorUserId: string | null,
  input: {
    kind: MediaKind;
    link?: string;
    mediaId?: string;
    /** MIME of the uploaded file, persisted so the UI can pick an icon/extension. */
    mime?: string;
    caption?: string;
    filename?: string;
    /** Byte length of the uploaded file, persisted so the file card can state a size. */
    size?: number;
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
  // Meta rejects the whole send when a caption rides on an audio or a sticker
  // object, so the caption is dropped rather than allowed to fail the message.
  // It is dropped from the STORED row as well: a caption kept on a message the
  // customer never received it with reads, in the thread and in the exported
  // transcript, as something we said and they ignored.
  const caption = input.kind === 'audio' || input.kind === 'sticker' ? undefined : input.caption;
  if (caption) mediaObj.caption = caption;
  if (input.kind === 'document' && input.filename) mediaObj.filename = input.filename;

  const typeMap: Record<MediaKind, WaMessageType> = {
    image: 'IMAGE',
    video: 'VIDEO',
    audio: 'AUDIO',
    document: 'DOCUMENT',
    // The DB enum and the inbound path have always had STICKER; only the send
    // side was missing it, so an outbound sticker had no type to be stored as.
    sticker: 'STICKER',
  };
  return dispatchOutbound({
    conversationId: conv.id,
    channelId: conv.channelId,
    contactId: conv.contactId,
    contactPhone: conv.contact.phone,
    actorUserId,
    type: typeMap[input.kind],
    text: caption ?? null,
    // Mark recorded voice notes so the inbox renders them as a voice message
    // (waveform player) rather than a generic audio file.
    preview: caption || (input.voice ? '[voice message]' : `[${input.kind}]`),
    mediaId: input.mediaId ?? null,
    mediaMime: input.mime ?? null,
    // `filename` and `size` ride in the payload because WaMessage has no column
    // for either and MessageAttachment reads them from there. Without the name
    // every outbound document rendered as a generic "document.pdf" regardless of
    // what was uploaded; without the byte count the file card said only "PDF"
    // where WhatsApp itself says "PDF · 2.4 MB", so neither the operator nor the
    // colleague reading the thread later could tell a one-page letter from a
    // 40 MB scan without downloading it.
    payload:
      input.voice || input.filename || input.size
        ? {
            ...(input.voice ? { voice: true } : {}),
            ...(input.filename ? { filename: input.filename } : {}),
            ...(input.size ? { size: input.size } : {}),
          }
        : undefined,
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

  const result = await sendWhatsappRaw(
    {
      to: toGraphPhone(conv.contact.phone),
      type: 'reaction',
      reaction: { message_id: wamid, emoji },
    },
    // Reactions deliberately skip dispatchOutbound (no bubble row), so the
    // conversation's own sender has to be resolved here too.
    await getChannelPhoneNumberId(conv.channelId)
  );
  if (!result.ok) {
    waSendFailuresTotal.inc({ error_code: result.error?.code ?? 'unknown' });
    throw new AppError(result.error?.title || 'Failed to send reaction', 502, 'WA_REACTION_FAILED');
  }

  // The acting agent's display name for the "who reacted" UI. This used to be a
  // User lookup; `actorUserId` is the operator label itself now.
  const byName = actorUserId || 'You';
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
    // The BARE array, matching what inbound persists and what MessageContact parses.
    // Wrapping it in { contacts } meant every card the operator sent rendered as a
    // generic "Shared a contact" stub while the inbound ones rendered fine.
    payload: contacts as unknown as Record<string, unknown>,
    message: { type: 'contacts', contacts },
  });
}

/**
 * The tag every contact created by a campaign test-send carries.
 *
 * A test send has to open a real conversation — that is the only way to see the
 * message Meta will actually render — so it necessarily creates a contact. What
 * it must not do is leave a reviewer's personal number sitting in the contact
 * book indistinguishable from a customer: it appeared in the contacts list, in
 * segment counts and in exports. Tagged, it can be found, and a segment can
 * exclude it with a `tags none` rule.
 */
export const WA_TEST_CONTACT_TAG = 'test';

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
  /** DOCUMENT header: the filename the attachment shows on the handset. */
  headerMediaFilename?: string;
  buttonUrlParam?: string;
  /** One value per dynamic URL button, in authored order (Meta allows two). */
  buttonUrlParams?: string[];
  otpCode?: string;
  couponCode?: string;
  ltoExpirationMs?: number;
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  /** FLOW button: data for the Flow's entry screen. The token is minted per send. */
  flowActionData?: Record<string, unknown>;
  /** CATALOG / MPM button: the SKU whose image heads the card. */
  catalogThumbnailProductId?: string;
  /** MPM button: the product list by section. */
  productSections?: TemplateProductSection[];
  /** PRODUCT header (single-product template): the SKU to show. */
  productRetailerId?: string;
  /** Per-card values for a CAROUSEL template, in card order. */
  carouselCards?: TemplateSendCarouselCard[];
  /** Tag the contact this creates as a test recipient (campaign test-send). */
  testSend?: boolean;
}) {
  const channel = await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const contact = await upsertContactByPhone(input.phone, {});
  if (input.testSend && !contact.tags.includes(WA_TEST_CONTACT_TAG)) {
    await prisma.waContact.update({
      where: { id: contact.id },
      data: { tags: { push: WA_TEST_CONTACT_TAG } },
    });
  }
  // Reuse the thread this contact already has, on whichever of our numbers it is
  // on. Forcing the default channel opened a SECOND thread and sent the template
  // from a number the customer has never seen, leaving their real thread — the
  // one they will reply on — silent.
  const conversation = await getConversationForOutbound(contact.id, channel.id);
  const message = await sendTemplateToConversation(conversation.id, input.actorUserId, {
    templateId: input.templateId,
    bodyParams: input.bodyParams,
    bodyNamedParams: input.bodyNamedParams,
    headerText: input.headerText,
    headerImageId: input.headerImageId,
    headerMediaUrl: input.headerMediaUrl,
    headerMediaType: input.headerMediaType,
    headerMediaFilename: input.headerMediaFilename,
    buttonUrlParam: input.buttonUrlParam,
    buttonUrlParams: input.buttonUrlParams,
    // Forwarded, not dropped. A new conversation opened with an OTP, coupon,
    // limited-time-offer, location or catalogue template needs the same runtime
    // parameters as a send into an existing thread; without them Meta refuses the
    // message with (#131008) and the conversation never starts at all.
    otpCode: input.otpCode,
    couponCode: input.couponCode,
    ltoExpirationMs: input.ltoExpirationMs,
    headerLocation: input.headerLocation,
    flowActionData: input.flowActionData,
    catalogThumbnailProductId: input.catalogThumbnailProductId,
    productSections: input.productSections,
    productRetailerId: input.productRetailerId,
    carouselCards: input.carouselCards,
  });
  return { conversationId: conversation.id, message };
}
