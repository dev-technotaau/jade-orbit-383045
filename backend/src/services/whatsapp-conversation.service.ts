import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { APP_ACTOR } from '../middleware/app-password';
import { emitWa } from '../utils/whatsapp-realtime';
import { sendReadReceipt } from './whatsapp.service';
import type { Prisma, WaConversationStatus } from '@prisma/client';

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether the 24h customer-service window is currently open. */
export function windowOpen(windowExpiresAt: Date | null): boolean {
  return !!windowExpiresAt && windowExpiresAt.getTime() > Date.now();
}

export async function getOrCreateConversation(channelId: string, contactId: string) {
  return prisma.waConversation.upsert({
    where: { channelId_contactId: { channelId, contactId } },
    update: {},
    create: { channelId, contactId },
  });
}

export interface ConversationListFilters {
  status?: WaConversationStatus;
  assignedTo?: string;
  q?: string;
  unreadOnly?: boolean;
  searchMessages?: boolean;
  includeArchived?: boolean;
}

/**
 * Shared where-builder for the inbox list AND bulk-by-filter selection, so
 * "select all N matching" acts on exactly the same set the list shows.
 */
function buildConversationListWhere(
  params: ConversationListFilters
): Prisma.WaConversationWhereInput {
  const contactWhere: Prisma.WaContactWhereInput = {
    ...(params.q
      ? {
          OR: [
            { phone: { contains: params.q } },
            { name: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  // When `searchMessages` is requested with a query, broaden the match so a
  // conversation surfaces when EITHER the contact (name/phone) OR any of its
  // messages' text matches `q` (case-insensitive). Otherwise keep the plain
  // contact-scoped filter.
  const convOr: Prisma.WaConversationWhereInput[] =
    params.q && params.searchMessages
      ? [
          ...(Object.keys(contactWhere).length ? [{ contact: contactWhere }] : []),
          { messages: { some: { text: { contains: params.q, mode: 'insensitive' } } } },
        ]
      : [];
  return {
    ...(params.status ? { status: params.status } : {}),
    ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
    ...(params.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    // Hide archived conversations unless explicitly asked for.
    ...(params.includeArchived ? {} : { archivedAt: null }),
    ...(convOr.length
      ? { OR: convOr }
      : Object.keys(contactWhere).length
        ? { contact: contactWhere }
        : {}),
  };
}

export async function list(params: ConversationListFilters & { page?: number; limit?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, params.limit ?? 30);
  const where = buildConversationListWhere(params);
  const [items, total] = await Promise.all([
    prisma.waConversation.findMany({
      where,
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: {
          // `userId` and the `user` relation (which supplied an avatar for
          // contacts linked to a platform account) went with the User model.
          // The Cloud API does not expose customers' profile photos, so the
          // inbox falls back to initials.
          select: {
            id: true,
            phone: true,
            name: true,
            optInStatus: true,
            isBlocked: true,
          },
        },
      },
    }),
    prisma.waConversation.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };
}

export type BulkConversationAction =
  | 'archive'
  | 'unarchive'
  | 'resolve'
  | 'open'
  | 'pending'
  | 'markRead'
  | 'snooze'
  | 'unsnooze'
  | 'assign'
  | 'addLabel';

/**
 * Apply one action to many conversations atomically. Selection is EITHER an
 * explicit `ids` list OR `allMatching` (acts on every conversation matching the
 * same filters the inbox list uses — "select all N matching"). All actions are a
 * single updateMany (no per-row loop), so large selections are fast + atomic.
 */
export async function bulkUpdate(opts: {
  action: BulkConversationAction;
  ids?: string[];
  allMatching?: boolean;
  filters?: ConversationListFilters;
  assignedTo?: string | null;
  snoozedUntil?: Date | null;
  label?: string;
}): Promise<{ count: number }> {
  const where: Prisma.WaConversationWhereInput = opts.allMatching
    ? buildConversationListWhere(opts.filters ?? {})
    : { id: { in: opts.ids ?? [] } };
  if (!opts.allMatching && (!opts.ids || opts.ids.length === 0)) return { count: 0 };

  const now = new Date();
  switch (opts.action) {
    case 'archive':
      return prisma.waConversation.updateMany({ where, data: { archivedAt: now } });
    case 'unarchive':
      return prisma.waConversation.updateMany({ where, data: { archivedAt: null } });
    case 'resolve':
      return prisma.waConversation.updateMany({
        where,
        data: { status: 'RESOLVED', resolvedAt: now },
      });
    case 'open':
      return prisma.waConversation.updateMany({ where, data: { status: 'OPEN' } });
    case 'pending':
      return prisma.waConversation.updateMany({ where, data: { status: 'PENDING' } });
    case 'markRead':
      return prisma.waConversation.updateMany({ where, data: { unreadCount: 0, lastReadAt: now } });
    case 'snooze':
      return prisma.waConversation.updateMany({
        where,
        data: { snoozedUntil: opts.snoozedUntil ?? null },
      });
    case 'unsnooze':
      return prisma.waConversation.updateMany({ where, data: { snoozedUntil: null } });
    case 'assign':
      return prisma.waConversation.updateMany({
        where,
        data: { assignedTo: opts.assignedTo ?? null },
      });
    case 'addLabel':
      if (!opts.label) return { count: 0 };
      // Only push to rows that don't already carry the label (dedupe via where).
      return prisma.waConversation.updateMany({
        where: { AND: [where, { NOT: { labels: { has: opts.label } } }] },
        data: { labels: { push: opts.label } },
      });
    default:
      return { count: 0 };
  }
}

/**
 * Total unread *messages* across the active inbox (sum of unreadCount over
 * non-archived conversations) — a single aggregate so the sidebar badge stays
 * fast + real-time, rather than fetching every unread conversation to sum
 * client-side.
 */
export async function getUnreadTotal(): Promise<{ total: number }> {
  const agg = await prisma.waConversation.aggregate({
    _sum: { unreadCount: true },
    where: { archivedAt: null },
  });
  return { total: agg._sum.unreadCount ?? 0 };
}

export async function getById(id: string) {
  return prisma.waConversation.findUnique({
    where: { id },
    include: {
      contact: true,
      channel: { select: { id: true, displayPhone: true } },
    },
  });
}

/** Thread messages, chronological, paginated backward via `before` (ISO date). */
export async function getThread(
  conversationId: string,
  params: { before?: string; limit?: number }
) {
  const limit = Math.min(100, params.limit ?? 50);
  const messages = await prisma.waMessage.findMany({
    where: {
      conversationId,
      deletedAt: null, // hide messages soft-deleted ("delete for me") from the inbox
      ...(params.before ? { createdAt: { lt: new Date(params.before) } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return messages.reverse();
}

/**
 * "Delete for me": soft-delete one or more messages from the admin inbox view.
 * The WhatsApp Cloud API has no revoke endpoint, so this never touches the
 * customer's device — it only hides the messages on our side. Scoped to the
 * conversation so callers can't delete arbitrary message ids. Returns the count
 * actually hidden (already-deleted / foreign ids are ignored).
 */
export async function deleteMessagesForMe(conversationId: string, messageIds: string[]) {
  const ids = [...new Set(messageIds)].filter((x) => typeof x === 'string' && x);
  if (ids.length === 0) return { deleted: 0 };
  const res = await prisma.waMessage.updateMany({
    where: { conversationId, id: { in: ids }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (res.count > 0) {
    // Refresh any other admin sessions viewing this thread (no message payload →
    // the inbox handler just re-fetches; deleted rows won't return).
    emitWa('wa:message', { conversationId }, conversationId);
  }
  return { deleted: res.count };
}

/**
 * Clear chat history ("delete for me" the whole conversation). Soft-deletes
 * every message so the thread shows empty on our side; the customer keeps their
 * copy (the Cloud API has no revoke). Also resets the list preview + unread
 * badge so the conversation row no longer shows stale content.
 */
export async function clearConversation(conversationId: string) {
  const res = await prisma.waMessage.updateMany({
    where: { conversationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  const conv = await prisma.waConversation
    .update({
      where: { id: conversationId },
      data: { lastMessagePreview: null, unreadCount: 0 },
    })
    .catch(() => null);
  emitWa('wa:message', { conversationId }, conversationId);
  if (conv) emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return { cleared: res.count };
}

/**
 * Count unread inbound messages = inbound messages created strictly after the
 * agent's last-read marker. Used by both markRead and touchOnMessage so a
 * message that lands during the read round-trip is never lost (unread race).
 */
async function countUnreadSince(conversationId: string, lastReadAt: Date | null): Promise<number> {
  return prisma.waMessage.count({
    where: {
      conversationId,
      direction: 'INBOUND',
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

export async function markRead(conversationId: string) {
  // Stamp the read marker first, then recompute unread from messages that exist
  // after it. A message arriving between the stamp and recount is counted by the
  // recount (or by the next inbound touchOnMessage) — never silently dropped.
  const readAt = new Date();
  await prisma.waConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: readAt },
  });
  const unreadCount = await countUnreadSince(conversationId, readAt);
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { unreadCount },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  // Best-effort read receipt to Meta for the latest inbound message (blue ticks).
  const lastInbound = await prisma.waMessage.findFirst({
    where: { conversationId, direction: 'INBOUND', wamid: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { wamid: true },
  });
  if (lastInbound?.wamid) void sendReadReceipt(lastInbound.wamid);
  return conv;
}

/**
 * Agents a conversation can be assigned to.
 *
 * The host platform queried its User table for active SUPER_ADMIN/ADMIN staff.
 * This module has a single operator behind one app password, so there is exactly
 * one assignee: the operator. `assignedTo` is a free-text label, not an FK, so
 * this list exists to give the inbox UI something to render.
 */
export async function listAssignableAgents() {
  return [{ id: APP_ACTOR.id, firstName: APP_ACTOR.id, lastName: null, email: '' }];
}

export async function assign(conversationId: string, userId: string | null) {
  // `assignedTo` is a free-text operator label now — there is no user table to
  // validate against, and no roles to check. Any label (or null) is accepted.
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { assignedTo: userId },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

export async function setStatus(conversationId: string, status: WaConversationStatus) {
  // SLA: stamp resolvedAt when moving to RESOLVED; clear it when reopened to
  // any other status so the next resolution gets a fresh timestamp.
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: {
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : null,
    },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

/** Replace the triage labels on a conversation. */
export async function setLabels(conversationId: string, labels: string[]) {
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { labels: { set: labels } },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

/** Archive (or restore when archived=false) a conversation out of the inbox. */
export async function archive(conversationId: string, archived: boolean) {
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { archivedAt: archived ? new Date() : null },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

/** Full conversation + ALL messages (chronological ascending) for export/transcript. */
export async function getTranscript(conversationId: string) {
  return prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: { select: { id: true, phone: true, name: true } },
      channel: { select: { id: true, displayPhone: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/**
 * Best-effort CSAT request: send a compact 3-button (good/ok/bad → 5/3/1)
 * interactive prompt ONLY while the 24h window is open, then stamp
 * csatRequestedAt. The capture side (inbound worker) records the score.
 */
export async function requestCsat(conversationId: string) {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, windowExpiresAt: true, csatRequestedAt: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  if (!windowOpen(conv.windowExpiresAt)) {
    throw new AppError(
      'The 24-hour reply window is closed — send an approved template instead.',
      409,
      'WA_WINDOW_CLOSED'
    );
  }
  // Lazy import to avoid the send-service ↔ conversation-service import cycle.
  const { sendInteractiveMessage } = await import('./whatsapp-send.service');
  // null actor = system/automated send (same convention as the auto-reply engine);
  // avoids stamping firstResponseAt and a bogus sentByUserId.
  await sendInteractiveMessage(conversationId, null as unknown as string, {
    kind: 'button',
    bodyText: 'How would you rate your experience with us?',
    buttons: [
      { id: 'rating_5', title: '😊 Good' },
      { id: 'rating_3', title: '😐 Okay' },
      { id: 'rating_1', title: '😞 Bad' },
    ],
  }).catch(() => {});
  const updated = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { csatRequestedAt: new Date() },
  });
  emitWa('wa:conversation', { conversationId, conversation: updated }, conversationId);
  return updated;
}

/** Snooze (or un-snooze when null) a conversation out of the active queue. */
export async function setSnooze(conversationId: string, snoozedUntil: Date | null) {
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { snoozedUntil },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

/**
 * Update denormalized last-message fields. For inbound messages also recomputes
 * the unread count and (re)opens the 24h customer-service window.
 */
export async function touchOnMessage(
  conversationId: string,
  opts: { preview: string; at: Date; inbound: boolean }
) {
  const base = {
    lastMessageAt: opts.at,
    lastMessagePreview: opts.preview.slice(0, 200),
  };
  if (!opts.inbound) {
    const conv = await prisma.waConversation.update({
      where: { id: conversationId },
      data: base,
    });
    emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
    return conv;
  }

  // Inbound: anchor the window on the MESSAGE timestamp (not Date.now()) so a
  // delayed/replayed webhook can't drag the window the wrong way, and only ever
  // EXTEND it — never shorten it below an existing later expiry.
  const existing = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { windowExpiresAt: true, lastReadAt: true },
  });
  const candidateExpiry = opts.at.getTime() + WINDOW_MS;
  const windowExpiresAt = new Date(
    Math.max(existing?.windowExpiresAt?.getTime() ?? 0, candidateExpiry)
  );
  // Recompute unread from the read marker rather than blind-incrementing, so a
  // message landing during the read round-trip is reflected (unread race fix).
  const unreadCount = await countUnreadSince(conversationId, existing?.lastReadAt ?? null);

  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { ...base, unreadCount, windowExpiresAt },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}
