import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
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
 */
export async function dispatchDueScheduledMessages(): Promise<void> {
  const due = await prisma.waScheduledMessage.findMany({
    where: { status: 'PENDING', sendAt: { lte: new Date() } },
    orderBy: { sendAt: 'asc' },
    take: 200,
  });
  if (due.length === 0) return;

  let sent = 0;
  for (const m of due) {
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
      await prisma.waScheduledMessage.update({
        where: { id: m.id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
      sent++;
    } catch (e) {
      await prisma.waScheduledMessage
        .update({
          where: { id: m.id },
          data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) },
        })
        .catch(() => {});
      logger.warn(`Scheduled WhatsApp message ${m.id} send failed: ${(e as Error).message}`);
    }
  }
  logger.info(`WhatsApp scheduled-message dispatch: ${sent}/${due.length} sent`);
}
