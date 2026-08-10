import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { withLock } from '../utils/distributed-lock';
import { sendSessionMessage, sendTemplateToConversation } from './whatsapp-send.service';

interface ScheduleMessageInput {
  conversationId: string;
  kind: 'text' | 'template';
  text?: string;
  templateId?: string;
  bodyParams?: string[];
  sendAt: Date;
  createdBy?: string | null;
}

/** Queue a message (free-form text or approved template) to send at a future time. */
export async function scheduleMessage(input: ScheduleMessageInput) {
  if (input.kind === 'text' && !input.text?.trim()) {
    throw new AppError('Message text is required', 400, 'WA_EMPTY_MESSAGE');
  }
  if (input.kind === 'template' && !input.templateId) {
    throw new AppError('A template is required', 400, 'WA_TEMPLATE_REQUIRED');
  }
  if (!(input.sendAt instanceof Date) || Number.isNaN(input.sendAt.getTime())) {
    throw new AppError('A valid sendAt time is required', 400, 'WA_INVALID_SEND_AT');
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
      sendAt: input.sendAt,
      status: 'PENDING',
      createdBy: input.createdBy ?? null,
    },
  });
}

/** List scheduled messages for a conversation (PENDING first, then by sendAt). */
export async function listScheduled(conversationId: string) {
  return prisma.waScheduledMessage.findMany({
    where: { conversationId },
    orderBy: [{ status: 'asc' }, { sendAt: 'asc' }],
  });
}

/** Cancel a still-PENDING scheduled message. */
export async function cancelScheduled(id: string) {
  const msg = await prisma.waScheduledMessage.findUnique({ where: { id } });
  if (!msg) throw new AppError('Scheduled message not found', 404, 'WA_SCHEDULED_NOT_FOUND');
  if (msg.status !== 'PENDING') {
    throw new AppError(
      `Scheduled message is already ${msg.status.toLowerCase()}`,
      404,
      'WA_SCHEDULED_NOT_PENDING'
    );
  }
  return prisma.waScheduledMessage.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
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

  let sent = 0;
  for (const m of due) {
    // Claim it. count === 0 means a concurrent tick got there first.
    const claim = await prisma.waScheduledMessage.updateMany({
      where: { id: m.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
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
      // Downgrade the optimistic claim.
      await prisma.waScheduledMessage
        .update({
          where: { id: m.id },
          data: { status: 'FAILED', sentAt: null, error: (e as Error).message.slice(0, 500) },
        })
        .catch(() => {});
      logger.warn(`Scheduled WhatsApp message ${m.id} send failed: ${(e as Error).message}`);
    }
  }
  logger.info(`WhatsApp scheduled-message dispatch: ${sent}/${due.length} sent`);
}
