import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import type { Prisma, EmailThreadStatus } from '@prisma/client';
import { sendRawEmail } from './email.service';
import { getSender, getDefaultSender } from './email-sender.service';
import {
  resolveOutboundAttachments,
  toAttachmentRefs,
  attachmentMetaForStore,
  type OutboundAttachmentRef,
} from './email-attachment.service';
import { emitEmail } from '../utils/email-realtime';
import { randomTrackingToken } from '../utils/email-token';

/**
 * Read-only replies inbox (IMAP-ingested threads) plus agent reply operations.
 * Mirrors the WhatsApp conversation/inbox service, minus the 24h window (email
 * has none). "Read-only" = no composing NEW outbound threads; agents may only
 * reply to an existing inbound thread.
 */

// ---- Reads -------------------------------------------------------------------

export interface ListThreadsOpts {
  status?: EmailThreadStatus;
  assignedTo?: string;
  q?: string;
  label?: string;
  unread?: boolean;
  archived?: boolean;
  /** true = show ONLY actively-snoozed threads; default view excludes them. */
  snoozed?: boolean;
  page?: number;
  limit?: number;
}

export function buildThreadWhere(opts: ListThreadsOpts): Prisma.EmailThreadWhereInput {
  const where: Prisma.EmailThreadWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.assignedTo ? { assignedTo: opts.assignedTo } : {}),
    ...(opts.label ? { labels: { has: opts.label } } : {}),
    ...(opts.unread ? { unreadCount: { gt: 0 } } : {}),
    archivedAt: opts.archived ? { not: null } : null,
    // Snooze semantics: actively-snoozed threads are hidden from the default
    // queue and surface only under the Snoozed filter (or once the snooze lapses).
    ...(opts.snoozed
      ? { snoozedUntil: { gt: new Date() } }
      : { AND: [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }] }),
  };
  if (opts.q) {
    where.OR = [
      { threadSubject: { contains: opts.q, mode: 'insensitive' } },
      { contact: { email: { contains: opts.q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export async function listThreads(opts: ListThreadsOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const where = buildThreadWhere(opts);
  const [items, total] = await Promise.all([
    prisma.emailThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { contact: { select: { email: true, name: true } } },
    }),
    prisma.emailThread.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getThread(id: string) {
  const thread = await prisma.emailThread.findUnique({
    where: { id },
    include: {
      contact: true,
      notes: { orderBy: { createdAt: 'desc' } },
      messages: { orderBy: { createdAt: 'asc' }, where: { deletedAt: null } },
    },
  });
  if (!thread) throw new AppError('Thread not found', 404, 'EMAIL_THREAD_NOT_FOUND');
  return thread;
}

/** Count of threads with unread inbound messages (drives the sidebar badge). */
export async function getUnreadThreadCount(): Promise<number> {
  return prisma.emailThread.count({ where: { unreadCount: { gt: 0 }, archivedAt: null } });
}

// ---- Thread resolution (used by inbound ingestion) ---------------------------

/**
 * Find the thread an inbound reply belongs to (via In-Reply-To / References
 * against a prior message's providerMessageId, else the thread rootMessageId),
 * or create a fresh thread for the contact.
 */
export async function resolveOrCreateThread(input: {
  senderId: string;
  contactId: string;
  subject: string | null;
  inReplyTo?: string | null;
  references?: string[];
  rootMessageId: string;
}) {
  const ids = [input.inReplyTo, ...(input.references ?? [])].filter(Boolean) as string[];
  if (ids.length) {
    const priorMsg = await prisma.emailMessage.findFirst({
      where: { providerMessageId: { in: ids } },
      select: { threadId: true },
    });
    if (priorMsg?.threadId)
      return prisma.emailThread.findUnique({ where: { id: priorMsg.threadId } });
    const byRoot = await prisma.emailThread.findFirst({ where: { rootMessageId: { in: ids } } });
    if (byRoot) return byRoot;
  }
  // Fallback: a recent open thread for this contact with the same normalized subject.
  const normSubject = normalizeSubject(input.subject);
  if (normSubject) {
    const recent = await prisma.emailThread.findFirst({
      where: {
        contactId: input.contactId,
        threadSubject: { contains: normSubject, mode: 'insensitive' },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (recent) return recent;
  }
  return prisma.emailThread.create({
    data: {
      senderId: input.senderId,
      contactId: input.contactId,
      threadSubject: input.subject,
      rootMessageId: input.rootMessageId,
      status: 'OPEN',
    },
  });
}

const normalizeSubject = (s: string | null): string =>
  (s || '').replace(/^(re|fwd?|aw|antw):\s*/gi, '').trim();

// ---- Mutations ---------------------------------------------------------------

export async function markThreadRead(id: string) {
  const thread = await prisma.emailThread.update({
    where: { id },
    data: { unreadCount: 0, lastReadAt: new Date() },
  });
  emitEmail('email:thread:read', { threadId: id }, id);
  return thread;
}

export async function assignThread(id: string, userId: string | null) {
  return prisma.emailThread.update({ where: { id }, data: { assignedTo: userId } });
}

export async function setThreadStatus(id: string, status: EmailThreadStatus) {
  const data: Prisma.EmailThreadUpdateInput = { status };
  if (status === 'RESOLVED') data.resolvedAt = new Date();
  return prisma.emailThread.update({ where: { id }, data });
}

export async function setThreadLabels(id: string, labels: string[]) {
  return prisma.emailThread.update({ where: { id }, data: { labels: { set: labels } } });
}

export async function snoozeThread(id: string, until: Date | null) {
  return prisma.emailThread.update({ where: { id }, data: { snoozedUntil: until } });
}

export async function archiveThread(id: string, archived: boolean) {
  return prisma.emailThread.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
}

// ---- Bulk triage -------------------------------------------------------------

/** Cap on how many threads a single filter-scoped bulk action may touch. */
const MAX_BULK_THREADS = 10_000;

export interface ThreadBulkScope {
  /** Explicit thread ids (multi-select). */
  ids?: string[];
  /** OR a filter — acts on EVERY thread matching it (select-all-across-filter). */
  filter?: Omit<ListThreadsOpts, 'page' | 'limit'>;
}

export type ThreadBulkAction =
  | 'read'
  | 'unread'
  | 'assign'
  | 'status'
  | 'archive'
  | 'unarchive'
  | 'snooze'
  | 'addLabels'
  | 'removeLabels';

async function resolveThreadIds(scope: ThreadBulkScope): Promise<string[]> {
  if (scope.ids?.length) return [...new Set(scope.ids)];
  const rows = await prisma.emailThread.findMany({
    where: buildThreadWhere(scope.filter ?? {}),
    select: { id: true },
    take: MAX_BULK_THREADS,
  });
  return rows.map((r) => r.id);
}

/**
 * Apply a triage action to many threads at once. Accepts either explicit ids or
 * a filter (whole matching queue). Uses updateMany where possible; label mutates
 * per-row (array read-modify-write).
 */
export async function bulkThreads(
  scope: ThreadBulkScope,
  action: ThreadBulkAction,
  payload: {
    userId?: string | null;
    status?: EmailThreadStatus;
    until?: Date | null;
    labels?: string[];
  } = {}
): Promise<{ affected: number }> {
  const ids = await resolveThreadIds(scope);
  if (!ids.length) return { affected: 0 };
  const where: Prisma.EmailThreadWhereInput = { id: { in: ids } };

  switch (action) {
    case 'read':
      await prisma.emailThread.updateMany({
        where,
        data: { unreadCount: 0, lastReadAt: new Date() },
      });
      break;
    case 'unread':
      await prisma.emailThread.updateMany({ where, data: { unreadCount: 1, lastReadAt: null } });
      break;
    case 'assign':
      await prisma.emailThread.updateMany({ where, data: { assignedTo: payload.userId ?? null } });
      break;
    case 'status': {
      if (!payload.status)
        throw new AppError('A status is required', 400, 'EMAIL_THREAD_STATUS_REQUIRED');
      const data: Prisma.EmailThreadUpdateManyMutationInput = { status: payload.status };
      if (payload.status === 'RESOLVED') data.resolvedAt = new Date();
      await prisma.emailThread.updateMany({ where, data });
      break;
    }
    case 'archive':
      await prisma.emailThread.updateMany({ where, data: { archivedAt: new Date() } });
      break;
    case 'unarchive':
      await prisma.emailThread.updateMany({ where, data: { archivedAt: null } });
      break;
    case 'snooze':
      await prisma.emailThread.updateMany({ where, data: { snoozedUntil: payload.until ?? null } });
      break;
    case 'addLabels':
    case 'removeLabels': {
      const labels = payload.labels ?? [];
      if (labels.length) {
        const rows = await prisma.emailThread.findMany({
          where,
          select: { id: true, labels: true },
        });
        for (const r of rows) {
          const next =
            action === 'addLabels'
              ? Array.from(new Set([...r.labels, ...labels]))
              : r.labels.filter((l) => !labels.includes(l));
          await prisma.emailThread.update({ where: { id: r.id }, data: { labels: { set: next } } });
        }
      }
      break;
    }
  }

  emitEmail('email:thread:bulk', { action, count: ids.length });
  return { affected: ids.length };
}

export async function addNote(threadId: string, authorId: string | null, body: string) {
  return prisma.emailThreadNote.create({ data: { threadId, authorId, body } });
}

// ---- Reply (agent outbound) --------------------------------------------------

/**
 * Send an agent reply into an existing thread. Threads via In-Reply-To +
 * References so the recipient's client keeps the conversation together. Stamps a
 * new Message-ID we can match future replies against.
 */
export async function sendThreadReply(
  threadId: string,
  actorUserId: string | null,
  input: { subject?: string; body: string; html?: string; attachments?: OutboundAttachmentRef[] },
  opts: { auto?: boolean } = {}
) {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: { contact: { select: { email: true, isBlocked: true } } },
  });
  if (!thread) throw new AppError('Thread not found', 404, 'EMAIL_THREAD_NOT_FOUND');
  if (thread.contact.isBlocked)
    throw new AppError('Contact is blocked', 409, 'EMAIL_CONTACT_BLOCKED');
  const body = input.body?.trim();
  if (!body) throw new AppError('Reply body is required', 400, 'EMAIL_EMPTY_REPLY');

  const attachmentRefs = input.attachments ?? [];
  const attachments = await resolveOutboundAttachments(attachmentRefs);

  const sender = thread.senderId
    ? await getSender(thread.senderId).catch(() => null)
    : await getDefaultSender();
  if (!sender) throw new AppError('No sending identity configured', 400, 'EMAIL_NO_SENDER');

  // Build the In-Reply-To / References chain from the latest inbound message.
  const lastInbound = await prisma.emailMessage.findFirst({
    where: { threadId, direction: 'INBOUND', providerMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { providerMessageId: true, references: true },
  });
  const messageId = `<reply.${threadId}.${randomTrackingToken()}@${sender.domain}>`;
  const inReplyTo = lastInbound?.providerMessageId ?? thread.rootMessageId ?? undefined;
  const references = [...(lastInbound?.references ?? []), inReplyTo].filter(Boolean) as string[];
  const subject =
    input.subject || `Re: ${normalizeSubject(thread.threadSubject) || '(no subject)'}`;
  const html = input.html || `<div>${body.replace(/\n/g, '<br>')}</div>`;

  await sendRawEmail({
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyTo: sender.replyTo || undefined,
    to: thread.contact.email,
    subject,
    html,
    text: body,
    messageId,
    attachments,
    headers: {
      ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
      ...(references.length ? { References: references.join(' ') } : {}),
      // Only automated replies carry Auto-Submitted so recipients' own
      // responders don't reply back (and human replies aren't mislabeled).
      ...(opts.auto ? { 'Auto-Submitted': 'auto-replied' } : {}),
    },
  });

  const message = await prisma.emailMessage.create({
    data: {
      providerMessageId: messageId,
      senderId: sender.id,
      threadId,
      contactId: thread.contactId,
      direction: 'OUTBOUND',
      status: 'SENT',
      fromEmail: sender.fromEmail,
      toEmail: thread.contact.email,
      subject,
      htmlBody: html,
      textBody: body,
      inReplyTo: inReplyTo ?? null,
      references,
      sentByUserId: actorUserId,
      sentAt: new Date(),
      ...(attachmentRefs.length
        ? { attachments: attachmentMetaForStore(attachmentRefs) as Prisma.InputJsonValue }
        : {}),
    },
  });

  await prisma.emailThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 140),
      status: thread.status === 'RESOLVED' ? 'OPEN' : thread.status,
      ...(thread.firstResponseAt ? {} : { firstResponseAt: new Date() }),
    },
  });

  emitEmail('email:message', { threadId, message }, threadId);
  return message;
}

// ---- Send-later (scheduled replies) -----------------------------------------

export async function scheduleReply(input: {
  threadId: string;
  subject?: string;
  body: string;
  html?: string;
  attachments?: OutboundAttachmentRef[];
  sendAt: Date;
  createdBy?: string | null;
}) {
  return prisma.emailScheduledMessage.create({
    data: {
      threadId: input.threadId,
      subject: input.subject ?? null,
      body: input.body,
      html: input.html ?? null,
      ...(input.attachments?.length
        ? { attachments: input.attachments as unknown as Prisma.InputJsonValue }
        : {}),
      sendAt: input.sendAt,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function cancelScheduledReply(id: string) {
  return prisma.emailScheduledMessage.update({ where: { id }, data: { status: 'CANCELLED' } });
}

/** List pending (not-yet-sent) scheduled replies for the admin panel. */
export async function listScheduledMessages() {
  return prisma.emailScheduledMessage.findMany({
    where: { status: 'PENDING' },
    orderBy: { sendAt: 'asc' },
    take: 200,
  });
}

/** Cron tick: send every PENDING scheduled reply whose sendAt has arrived. */
export async function dispatchDueScheduledEmails(): Promise<void> {
  const due = await prisma.emailScheduledMessage.findMany({
    where: { status: 'PENDING', sendAt: { lte: new Date() } },
    take: 100,
  });
  for (const row of due) {
    try {
      await sendThreadReply(row.threadId, row.createdBy, {
        subject: row.subject ?? undefined,
        body: row.body,
        html: row.html ?? undefined,
        attachments: toAttachmentRefs(row.attachments),
      });
      await prisma.emailScheduledMessage.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (e) {
      await prisma.emailScheduledMessage
        .update({ where: { id: row.id }, data: { status: 'FAILED', error: (e as Error).message } })
        .catch(() => {});
    }
  }
}

// ---- Canned replies ----------------------------------------------------------

export async function listCannedReplies() {
  return prisma.emailCannedReply.findMany({ orderBy: { title: 'asc' } });
}
export async function createCannedReply(input: {
  title: string;
  subject?: string;
  body: string;
  shortcut?: string;
  createdBy?: string | null;
}) {
  return prisma.emailCannedReply.create({ data: { ...input } });
}
export async function updateCannedReply(id: string, patch: Record<string, unknown>) {
  return prisma.emailCannedReply.update({
    where: { id },
    data: patch as Prisma.EmailCannedReplyUpdateInput,
  });
}
export async function deleteCannedReply(id: string) {
  return prisma.emailCannedReply.delete({ where: { id } }).catch(() => null);
}

// ---- Inbound rules (auto-responder / triage) --------------------------------

export async function listRules() {
  return prisma.emailRule.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] });
}
export async function createRule(input: Prisma.EmailRuleCreateInput) {
  return prisma.emailRule.create({ data: input });
}
export async function updateRule(id: string, patch: Record<string, unknown>) {
  return prisma.emailRule.update({ where: { id }, data: patch as Prisma.EmailRuleUpdateInput });
}
export async function deleteRule(id: string) {
  return prisma.emailRule.delete({ where: { id } }).catch(() => null);
}
