import type { Prisma, WaScheduledMessageStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { withLock } from '../utils/distributed-lock';
import {
  sendSessionMessage,
  sendTemplateToConversation,
  sendMediaMessage,
} from './whatsapp-send.service';
import { getConversationSenderPhoneId } from './whatsapp-conversation.service';
import { uploadMediaToMeta } from './whatsapp.service';
import { downloadFileFromR2, deleteFileFromR2 } from './storage.service';
import { mediaKindForMime } from '../utils/wa-media-limits';
import { acquireChannelSendSlot } from '../jobs/whatsapp-campaign.worker';
import { env } from '../config/env';

interface ScheduleMessageInput {
  conversationId: string;
  kind: 'text' | 'template' | 'media';
  text?: string;
  templateId?: string;
  bodyParams?: string[];
  /** R2 key of the bytes, already archived by the controller under SCHEDULED_MEDIA_PREFIX. */
  mediaKey?: string;
  mediaMime?: string;
  mediaFilename?: string;
  caption?: string;
  sendAt: Date;
  createdBy?: string | null;
}

/** Queue a message (free-form text, media file or approved template) to send later. */
export async function scheduleMessage(input: ScheduleMessageInput) {
  if (input.kind === 'text' && !input.text?.trim()) {
    throw new AppError('Message text is required', 400, 'WA_EMPTY_MESSAGE');
  }
  if (input.kind === 'template' && !input.templateId) {
    throw new AppError('A template is required', 400, 'WA_TEMPLATE_REQUIRED');
  }
  if (input.kind === 'media' && !input.mediaKey) {
    throw new AppError('A file is required', 400, 'WA_MEDIA_REQUIRED');
  }
  if (!(input.sendAt instanceof Date) || Number.isNaN(input.sendAt.getTime())) {
    throw new AppError('A valid sendAt time is required', 400, 'WA_INVALID_SEND_AT');
  }

  // A free-text send is only legal inside the 24-hour customer service window.
  // Scheduling one for after the window expires guaranteed a failure at dispatch
  // time, and the failure was invisible: the panel lists PENDING rows only, so the
  // FAILED row simply disappeared and the operator believed it had gone out.
  // Refusing at schedule time is the only point where the operator can still act.
  //
  // Media is a session message too, so it lives under exactly the same rule.
  if (input.kind === 'text' || input.kind === 'media') {
    const conv = await prisma.waConversation.findUnique({
      where: { id: input.conversationId },
      select: { windowExpiresAt: true },
    });
    const expires = conv?.windowExpiresAt;
    if (expires && input.sendAt.getTime() > expires.getTime()) {
      throw new AppError(
        'That time is outside the 24-hour reply window, so a free-text message ' +
          'cannot be delivered then. Schedule an approved template instead.',
        409,
        'WA_WINDOW_CLOSED_AT_SEND_TIME'
      );
    }
  }

  return prisma.waScheduledMessage.create({
    data: {
      conversationId: input.conversationId,
      kind: input.kind,
      text: input.kind === 'text' ? (input.text?.trim() ?? null) : null,
      templateId: input.kind === 'template' ? (input.templateId ?? null) : null,
      bodyParams:
        input.kind === 'template' && input.bodyParams
          ? (input.bodyParams as Prisma.InputJsonValue)
          : undefined,
      ...(input.kind === 'media'
        ? {
            mediaKey: input.mediaKey ?? null,
            mediaMime: input.mediaMime ?? null,
            mediaFilename: input.mediaFilename ?? null,
            caption: input.caption?.trim() || null,
          }
        : {}),
      sendAt: input.sendAt,
      status: 'PENDING',
      createdBy: input.createdBy ?? null,
    },
  });
}

/**
 * Where a scheduled attachment's bytes live until they are sent.
 *
 * Deliberately NOT a Meta media id taken at schedule time: those expire after 30
 * days, so "send this price list on the 1st of next quarter" would have failed
 * at the one moment nobody is watching. We hold the file ourselves and upload it
 * to Meta in the dispatch tick, seconds before the send.
 *
 * A prefix of its own, outside `whatsapp-media/`, because the nightly reconcile
 * sweep deletes everything under that prefix which no WaMessage row names — and
 * a file scheduled for next week is named by no message at all until it is sent.
 */
export const SCHEDULED_MEDIA_PREFIX = 'whatsapp-scheduled/';

/**
 * Drop a scheduled row's staged bytes.
 *
 * Called when the row is sent, cancelled, or replaced. Best-effort: an object
 * left behind costs storage, while failing the operation it rides on would cost
 * the send.
 */
export async function discardScheduledMedia(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await deleteFileFromR2(key).catch((e) => {
    logger.warn(`Could not delete scheduled WhatsApp media ${key}: ${(e as Error).message}`);
  });
}

/** List scheduled messages for a conversation (PENDING first, then by sendAt). */
export async function listScheduled(conversationId: string) {
  return prisma.waScheduledMessage.findMany({
    where: { conversationId },
    orderBy: [{ status: 'asc' }, { sendAt: 'asc' }],
  });
}

export interface ScheduledListFilters {
  status?: WaScheduledMessageStatus;
  /** Lower/upper bound on `sendAt`. */
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * Every scheduled message, across all conversations.
 *
 * The only view of send-later messages was inside the conversation that created
 * one, so an operator who scheduled twelve follow-ups on Friday had no screen
 * that showed those twelve pending sends: no way to audit what is about to go
 * out, no way to cancel a batch before a holiday, and a FAILED one was invisible
 * unless they happened to reopen that thread. Ordered by sendAt so the next
 * thing to go out is at the top.
 */
export async function listAllScheduled(filters: ScheduledListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const where: Prisma.WaScheduledMessageWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          sendAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.waScheduledMessage.findMany({
      where,
      orderBy: [{ sendAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waScheduledMessage.count({ where }),
  ]);

  // Who each one is going to. `conversationId` is a bare column (no Prisma
  // relation), so this is a manual join — one extra query for the whole page
  // rather than one per row. A list of send times with no recipient on it is not
  // something an operator can act on.
  const conversations = rows.length
    ? await prisma.waConversation.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.conversationId))] } },
        select: { id: true, contact: { select: { id: true, phone: true, name: true } } },
      })
    : [];
  const byConversation = new Map(conversations.map((c) => [c.id, c.contact]));
  const items = rows.map((row) => ({
    ...row,
    contact: byConversation.get(row.conversationId) ?? null,
  }));

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Cancel a still-PENDING scheduled message.
 *
 * `conversationId` is optional only because a future global cancel would not
 * have one; every current caller is the conversation-scoped route and passes it.
 * Without it the row was addressed by primary key alone, so a msgId belonging to
 * another thread cancelled fine through this conversation's URL and the audit
 * row recorded the wrong conversation — an operator reading the log later could
 * not tell which customer's follow-up had been pulled.
 */
export async function cancelScheduled(id: string, conversationId?: string) {
  const msg = await prisma.waScheduledMessage.findUnique({ where: { id } });
  if (!msg || (conversationId && msg.conversationId !== conversationId)) {
    throw new AppError('Scheduled message not found', 404, 'WA_SCHEDULED_NOT_FOUND');
  }
  if (msg.status !== 'PENDING') {
    throw new AppError(
      `Scheduled message is already ${msg.status.toLowerCase()}`,
      404,
      'WA_SCHEDULED_NOT_PENDING'
    );
  }
  // Compare-and-set on both ids (and the status): the dispatcher tick may claim
  // this row between the read above and here, and count === 0 says so.
  const { count } = await prisma.waScheduledMessage.updateMany({
    where: { id, status: 'PENDING', ...(conversationId ? { conversationId } : {}) },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new AppError(
      'Scheduled message is already sent or cancelled',
      404,
      'WA_SCHEDULED_NOT_PENDING'
    );
  }
  // Nothing will ever send these bytes now, and no sweep looks at this prefix —
  // a cancelled attachment left behind is a customer's file sitting in the
  // bucket indefinitely with nothing referencing it.
  await discardScheduledMedia(msg.mediaKey);
  return { ...msg, status: 'CANCELLED' as WaScheduledMessageStatus, mediaKey: null };
}

/**
 * Dispatch every PENDING scheduled message whose sendAt has arrived. Each row is
 * sent best-effort and stamped SENT (+ sentAt) or FAILED (+ error) independently,
 * so one bad row never blocks the rest. Capped per run.
 *
 * Every row is CLAIMED before it is sent. The scheduler cron fires every minute
 * and its worker runs at concurrency 2, while a single tick can spend minutes
 * making sequential Graph calls — so ticks overlap routinely. Selecting PENDING
 * rows and only marking them SENT *after* the send meant an overlapping tick
 * selected the same rows and delivered the same message to the customer twice.
 * The claim (PENDING -> SENT, compare-and-set) is the same idiom the campaign
 * worker uses, and needs no new enum value: a failure downgrades to FAILED.
 */
export async function dispatchDueScheduledMessages(): Promise<void> {
  // Belt to the per-row claim's braces: hold a cluster-wide lock so ticks
  // serialize instead of racing. TTL comfortably exceeds a full 200-row run.
  await withLock('wa:tick:scheduled', 600, dispatchDueScheduledMessagesInner);
}

async function dispatchDueScheduledMessagesInner(): Promise<void> {
  const due = await prisma.waScheduledMessage.findMany({
    where: { status: 'PENDING', sendAt: { lte: new Date() } },
    orderBy: { sendAt: 'asc' },
    take: 200,
  });
  if (due.length === 0) return;

  // Every conversation these messages belong to, so each send can take a slot on
  // the right number's throttle.
  const conversations = await prisma.waConversation.findMany({
    where: { id: { in: due.map((m) => m.conversationId) } },
    select: { id: true, channelId: true },
  });
  const channelByConversation = new Map(conversations.map((c) => [c.id, c.channelId]));
  const defaultThrottle = parseInt(env.WHATSAPP_DEFAULT_THROTTLE_PER_SEC, 10) || 15;

  let sent = 0;
  for (const m of due) {
    // Claim it. count === 0 means a concurrent tick got there first.
    const claim = await prisma.waScheduledMessage.updateMany({
      where: { id: m.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
      // Share the campaign worker's per-number governor. Send-later dispatch
      // used to bypass it entirely, so a tick that found 200 due messages fired
      // 200 back-to-back Graph calls at a number whose operator-configured
      // ceiling was 15/s — the limit was enforced everywhere except here.
      // A 130429 throw is caught below and simply defers the message.
      const channelId = channelByConversation.get(m.conversationId);
      if (channelId) await acquireChannelSendSlot(channelId, defaultThrottle);

      if (m.kind === 'template') {
        if (!m.templateId) {
          throw new AppError(
            'Scheduled template message has no templateId',
            400,
            'WA_TEMPLATE_REQUIRED'
          );
        }
        const bodyParams = Array.isArray(m.bodyParams)
          ? (m.bodyParams as unknown[]).map((p) => String(p))
          : undefined;
        await sendTemplateToConversation(m.conversationId, m.createdBy ?? null, {
          templateId: m.templateId,
          bodyParams,
        });
      } else if (m.kind === 'media') {
        if (!m.mediaKey) {
          throw new AppError('Scheduled media message has no file', 400, 'WA_MEDIA_REQUIRED');
        }
        // Upload to Meta HERE, not at schedule time: a media id is only good for
        // 30 days, so staging it when the operator pressed Schedule would have
        // broken exactly the long-dated sends this feature exists for. It must
        // also go up under the number this thread replies from — a media id is
        // scoped to the phone-number id that uploaded it.
        const buffer = await downloadFileFromR2(m.mediaKey);
        const mime = m.mediaMime || 'application/octet-stream';
        const filename = m.mediaFilename || 'file';
        const kind = mediaKindForMime(mime, buffer.length);
        const senderPhoneId = await getConversationSenderPhoneId(m.conversationId);
        const mediaId = await uploadMediaToMeta(buffer, mime, filename, senderPhoneId);
        if (!mediaId) {
          throw new AppError('Media upload failed', 502, 'WA_MEDIA_UPLOAD_FAILED');
        }
        await sendMediaMessage(m.conversationId, m.createdBy ?? null, {
          kind,
          mediaId,
          mime,
          caption: m.caption ?? undefined,
          filename: kind === 'document' ? filename : undefined,
          size: buffer.length,
        });
        // Sent — the staged copy is now dead weight, and it is a copy of a
        // customer-bound file, so it does not linger.
        await discardScheduledMedia(m.mediaKey);
        await prisma.waScheduledMessage
          .update({ where: { id: m.id }, data: { mediaKey: null } })
          .catch(() => {});
      } else {
        await sendSessionMessage(m.conversationId, m.createdBy ?? null, {
          type: 'text',
          text: m.text ?? '',
        });
      }
      // Already claimed as SENT above; just clear any error from a prior attempt.
      await prisma.waScheduledMessage.update({
        where: { id: m.id },
        data: { error: null },
      });
      sent++;
    } catch (e) {
      // Downgrade the optimistic claim. A throttle rejection is not a failure —
      // roll it back to PENDING so the next tick picks it up, rather than
      // burning the message because the number was momentarily saturated.
      const code = (e as { code?: string }).code;
      const deferrable = code === '130429';
      await prisma.waScheduledMessage
        .update({
          where: { id: m.id },
          data: deferrable
            ? { status: 'PENDING', sentAt: null }
            : { status: 'FAILED', sentAt: null, error: (e as Error).message.slice(0, 500) },
        })
        .catch(() => {});
      if (!deferrable) {
        logger.warn(`Scheduled WhatsApp message ${m.id} send failed: ${(e as Error).message}`);
      }
    }
  }
  logger.info(`WhatsApp scheduled-message dispatch: ${sent}/${due.length} sent`);
}
