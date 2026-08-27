import { prisma } from '../config/prisma';
import { env } from '../config/env';
import type { WaMessage } from '@prisma/client';
import { AppError } from '../middleware/error';
import { listOperators } from '../middleware/app-password';
import { emitWa } from '../utils/whatsapp-realtime';
import { sendReadReceipt, sendTypingIndicator } from './whatsapp.service';
import { getChannelPhoneNumberId, getDefaultChannel } from './whatsapp-channel.service';
import { normalizeWaPhone } from './whatsapp-contact.service';
import { Prisma } from '@prisma/client';
import type { WaConversation, WaConversationStatus } from '@prisma/client';

/** Sentinel `assignedTo` value meaning "has no assignee". */
export const UNASSIGNED = '__none__';

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

/**
 * The thread an outbound send that names no channel of its own belongs on.
 *
 * A contact holds one thread per connected number (@@unique([channelId,
 * contactId])), and callers that only know a phone number — the Chatwoot bridge,
 * a console-initiated template — used to force the env number. On a WABA with a
 * second number that opened a DUPLICATE thread on the env number and answered
 * from it, while the thread the customer actually writes on stayed unanswered.
 * Prefer whichever thread they are already talking to us on.
 */
export async function getConversationForOutbound(contactId: string, fallbackChannelId: string) {
  const existing = await prisma.waConversation.findFirst({
    where: { contactId },
    // Nulls last: a thread that has never carried a message must not outrank the
    // one the customer messaged on yesterday.
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  return existing ?? getOrCreateConversation(fallbackChannelId, contactId);
}

/**
 * The Meta phone-number id a template to `phone` would be SENT from, before any
 * conversation exists.
 *
 * A media id is scoped to the phone-number id that uploaded it, so staging a
 * header image against the wrong number makes Meta reject the send. For a reply
 * the conversation names the number; for a NEW conversation it does not exist
 * yet, and the upload fell back to env.META_WHATSAPP_PHONE_ID while the send
 * resolved something else entirely — startConversationWithTemplate reuses the
 * contact's existing thread "on whichever of our numbers it is on", and only
 * otherwise takes the DB default (which an operator can point at a non-env
 * number). On a multi-number WABA those disagreed and every media-header
 * template to a new conversation failed.
 *
 * Mirrors that resolution exactly, and READ-ONLY: an upload must not create a
 * contact or a thread as a side effect.
 */
export async function resolveSenderPhoneIdForPhone(phone: string): Promise<string | null> {
  const normalized = normalizeWaPhone(phone);
  if (!normalized) return null;
  const contact = await prisma.waContact.findUnique({
    where: { phone: normalized },
    select: { id: true },
  });
  if (contact) {
    const existing = await prisma.waConversation.findFirst({
      where: { contactId: contact.id },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { channelId: true },
    });
    if (existing) {
      const ch = await prisma.waChannel.findUnique({
        where: { id: existing.channelId },
        select: { phoneNumberId: true },
      });
      if (ch) return ch.phoneNumberId;
    }
  }
  // No contact, or no thread yet: the send will fall back to the default channel.
  const fallback = await getDefaultChannel();
  return fallback ? fallback.phoneNumberId : null;
}

/** The Meta phone-number id a conversation's messages must be sent from. */
export async function getConversationSenderPhoneId(conversationId: string): Promise<string | null> {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { channelId: true },
  });
  return conv ? getChannelPhoneNumberId(conv.channelId) : null;
}

/**
 * How far back a message-body search looks.
 *
 * The search used to be an UNBOUNDED correlated EXISTS with a leading-wildcard
 * ILIKE over the whole WaMessage table — the largest table in the module, with no
 * index that can serve it — evaluated once per candidate conversation, under a 30s
 * statement timeout. On any real message history a three-character query in the
 * inbox search box simply timed out. A window makes it an index range scan on
 * @@index([createdAt]).
 */
const MESSAGE_SEARCH_WINDOW_DAYS = parseInt(env.WA_MESSAGE_SEARCH_WINDOW_DAYS, 10);

/** Shorter than this, a body search matches nearly everything and costs the most. */
const MIN_MESSAGE_SEARCH_LEN = 3;

export interface ConversationListFilters {
  /**
   * Only conversations on this connected number.
   *
   * A WABA can carry several numbers and each one gets its own thread with a
   * contact (@@unique([channelId, contactId])), but the inbox listed them all
   * together with nothing saying which number a thread arrived on — so a support
   * number and a marketing number shared one undifferentiated queue.
   */
  channelId?: string;
  status?: WaConversationStatus;
  /** An operator label, or {@link UNASSIGNED} to match conversations with none. */
  assignedTo?: string;
  q?: string;
  /**
   * Triage labels to match (any-of).
   *
   * LabelsEditor could write labels and the header rendered them, and there was no
   * way to filter by one — so the whole feature was decorative: an operator could
   * tag a conversation "billing" and then had to scroll the entire inbox to find
   * the billing conversations again.
   */
  labels?: string[];
  unreadOnly?: boolean;
  searchMessages?: boolean;
  includeArchived?: boolean;
  /**
   * ONLY archived conversations.
   *
   * `includeArchived` widens the live queue to include them, which is not the
   * same question: there was no way to look at the archive on its own, so a
   * thread filed away last month could only be found by turning the archive back
   * on and scrolling past every live conversation.
   */
  archivedOnly?: boolean;
  /** Include conversations whose snooze has not yet expired. */
  includeSnoozed?: boolean;
  /** ONLY conversations that are currently snoozed — "what did I defer?". */
  snoozedOnly?: boolean;
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
            // Both names. An operator who renames a contact must still be able
            // to find them by the WhatsApp display name they know, and a contact
            // nobody has renamed only HAS a profile name.
            { profileName: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  // When `searchMessages` is requested with a query, broaden the match so a
  // conversation surfaces when EITHER the contact (name/phone) OR any of its
  // messages' text matches `q` (case-insensitive). Otherwise keep the plain
  // contact-scoped filter.
  const searchBodies =
    !!params.q && !!params.searchMessages && params.q.trim().length >= MIN_MESSAGE_SEARCH_LEN;
  const messageSearchSince = new Date(
    Date.now() - MESSAGE_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const convOr: Prisma.WaConversationWhereInput[] = searchBodies
    ? [
        ...(Object.keys(contactWhere).length ? [{ contact: contactWhere }] : []),
        {
          messages: {
            some: {
              text: { contains: params.q, mode: 'insensitive' },
              // Bounded — see MESSAGE_SEARCH_WINDOW_DAYS.
              createdAt: { gte: messageSearchSince },
              deletedAt: null,
            },
          },
        },
      ]
    : [];
  return {
    ...(params.channelId ? { channelId: params.channelId } : {}),
    ...(params.status ? { status: params.status } : {}),
    // `__none__` is the sentinel for "unassigned". It has to be server-side:
    // filtering it in the client only ever saw the loaded page, so an inbox with
    // 50 assigned conversations on page 1 reported "no conversations" while
    // hundreds of unassigned ones sat on page 2.
    ...(params.assignedTo === UNASSIGNED
      ? { assignedTo: null }
      : params.assignedTo
        ? { assignedTo: params.assignedTo }
        : {}),
    ...(params.labels?.length ? { labels: { hasSome: params.labels } } : {}),
    ...(params.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    // Archive scope: only-archived, mixed in, or (default) hidden.
    ...(params.archivedOnly
      ? { archivedAt: { not: null } }
      : params.includeArchived
        ? {}
        : { archivedAt: null }),
    // Snoozing was write-only: setSnooze and the snooze/unsnooze bulk actions all
    // wrote snoozedUntil, the column even carries an index, and NOTHING read it —
    // so a snoozed conversation sat in the active queue exactly as before and the
    // feature did nothing at all. A snooze expires by time rather than by an event,
    // so `lte: now` brings it back automatically with no cron to sweep.
    // Expressed as AND so it composes with the search OR above instead of
    // overwriting it — two bare `OR` keys in one object would silently drop the
    // search filter.
    ...(params.snoozedOnly
      ? { snoozedUntil: { gt: new Date() } }
      : params.includeSnoozed
        ? {}
        : {
            AND: [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }],
          }),
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
      // Plain DESC, not `nulls: 'last'`.
      //
      // Postgres gives a DESC index column NULLS FIRST, so `DESC NULLS LAST` could
      // not use ANY of the four @@index([… lastMessageAt(sort: Desc)]) declarations
      // on WaConversation in either scan direction — every inbox page load sorted
      // the whole filtered set instead. The only rows this reorders are
      // conversations that have never carried a message (created but never
      // touched), which are transient and belong at the top anyway.
      orderBy: { lastMessageAt: 'desc' },
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
            // The customer's own WhatsApp display name. `name` is operator-owned
            // now, so a contact nobody has renamed has only this one — without it
            // the whole inbox would relabel itself to phone numbers.
            profileName: true,
            optInStatus: true,
            isBlocked: true,
            // Do-not-contact. Every outbound funnels through `isSuppressed`, so
            // without this the composer stayed live for someone who had sent
            // STOP: the send was accepted, the draft cleared, and the reply came
            // back as a red FAILED bubble with no warning beforehand.
            suppressedAt: true,
            // Whether a marketing template is likely to be DELIVERED, which is a
            // different question from whether we are allowed to send it.
            // lastInboundAt null = this contact has never messaged us, which is
            // when Meta's per-user marketing cap bites hardest; marketingRefusedAt
            // means it has already refused them.
            lastInboundAt: true,
            marketingRefusedAt: true,
          },
        },
      },
    }),
    prisma.waConversation.count({ where }),
  ]);
  return {
    items: await attachMessageMatches(items, params),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };
}

/** A conversation row plus the message that made it match a body search. */
export type ConversationWithMatch<T> = T & {
  /** Newest message in this conversation whose body matched `q`. */
  matchMessageId?: string;
  matchSnippet?: string;
  matchCreatedAt?: Date;
};

/**
 * Attach the matching message to each conversation of a body search.
 *
 * The search found the CONVERSATION and then abandoned the operator: opening it
 * landed at the bottom of a thread that can be thousands of messages long, with
 * no indication of where the hit was. Returning the matched message id lets the
 * inbox deep-link straight to it.
 *
 * One `DISTINCT ON` round trip for the whole page (not one query per row), which
 * is served by @@index([conversationId, createdAt]) on WaMessage.
 */
async function attachMessageMatches<T extends { id: string }>(
  items: T[],
  params: ConversationListFilters
): Promise<Array<ConversationWithMatch<T>>> {
  const q = params.q?.trim();
  if (!q || !params.searchMessages || q.length < MIN_MESSAGE_SEARCH_LEN || items.length === 0) {
    return items;
  }
  const since = new Date(Date.now() - MESSAGE_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Escaped for LIKE: an operator searching for "100%" or "a_b" must not have
  // those characters treated as wildcards.
  const pattern = `%${q.replace(/[%_]/g, (ch) => '\\' + ch)}%`;
  const rows = await prisma
    .$queryRaw<Array<{ id: string; conversationId: string; text: string | null; createdAt: Date }>>(
      Prisma.sql`
        SELECT DISTINCT ON (m."conversationId")
               m."id", m."conversationId", m."text", m."createdAt"
          FROM "WaMessage" m
         WHERE m."conversationId" IN (${Prisma.join(items.map((i) => i.id))})
           AND m."deletedAt" IS NULL
           AND m."createdAt" >= ${since}
           AND m."text" ILIKE ${pattern} ESCAPE '\\'
         ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC
      `
    )
    // A search that cannot be resolved must still return the conversations —
    // losing the whole result set to a failed decoration would be worse than
    // losing the deep-link.
    .catch(() => []);
  const byConv = new Map(rows.map((r) => [r.conversationId, r]));
  return items.map((item) => {
    const hit = byConv.get(item.id);
    if (!hit) return item;
    return {
      ...item,
      matchMessageId: hit.id,
      matchSnippet: snippetAround(hit.text ?? '', q),
      matchCreatedAt: hit.createdAt,
    };
  });
}

/** ~120 chars of the message centred on the first occurrence of `q`. */
function snippetAround(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
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
/**
 * Unread total for the sidebar badge.
 *
 * Built from the SAME predicate the default inbox view uses, rather than a
 * hand-written `archivedAt: null`. The two had drifted: the list excludes
 * snoozed threads and the badge counted them, so an operator could see "3
 * unread" above a list showing none of them and have no way to reach the
 * messages. A badge that points at nothing is worse than no badge.
 *
 * `snoozedTotal` is returned alongside so the UI can say "3 unread, 1 snoozed"
 * instead of silently under-reporting — the count is cheap and it is the honest
 * version of the same answer.
 */
export async function getUnreadTotal(): Promise<{ total: number; snoozedTotal: number }> {
  const [active, snoozed] = await Promise.all([
    prisma.waConversation.aggregate({
      _sum: { unreadCount: true },
      where: buildConversationListWhere({}),
    }),
    prisma.waConversation.aggregate({
      _sum: { unreadCount: true },
      where: { archivedAt: null, snoozedUntil: { gt: new Date() } },
    }),
  ]);
  return {
    total: active._sum.unreadCount ?? 0,
    snoozedTotal: snoozed._sum.unreadCount ?? 0,
  };
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
  params: {
    before?: string;
    limit?: number;
    /** Tie-break for messages sharing `before` to the second. */
    beforeId?: string;
    /**
     * Message id to centre the page on, for deep-linking a search hit. Half the
     * page comes from before it and half from after, so the message opens with
     * its context on both sides instead of at the very top of the page.
     */
    around?: string;
  }
): Promise<WaMessage[]> {
  if (params.around) return getThreadAround(conversationId, params.around, params.limit);
  const limit = Math.min(100, params.limit ?? 50);
  const messages = await prisma.waMessage.findMany({
    where: {
      conversationId,
      deletedAt: null, // hide messages soft-deleted ("delete for me") from the inbox
      // COMPOUND keyset cursor, matching the [createdAt desc, id desc] sort below.
      //
      // Inbound createdAt comes from Meta at ONE-SECOND resolution, and the client
      // pages with exactly the oldest timestamp it holds. A bare `createdAt < before`
      // therefore skipped every OTHER message sharing that second — on a busy thread
      // "Load older" silently lost messages, and nothing surfaced the gap.
      ...(params.before
        ? params.beforeId
          ? {
              OR: [
                { createdAt: { lt: new Date(params.before) } },
                { createdAt: new Date(params.before), id: { lt: params.beforeId } },
              ],
            }
          : { createdAt: { lt: new Date(params.before) } }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return messages.reverse();
}

/**
 * A page of thread centred on one message.
 *
 * Message search could only tell the operator WHICH conversation contained
 * "invoice 4471" — opening it started at the bottom and the only way to reach a
 * hit from last month was to click "Load older messages" until it appeared.
 * Both halves use the same compound (createdAt, id) ordering the backward pager
 * uses, so the anchor is never duplicated or skipped.
 */
async function getThreadAround(
  conversationId: string,
  anchorId: string,
  limitParam?: number
): Promise<WaMessage[]> {
  const limit = Math.min(100, limitParam ?? 50);
  const anchor = await prisma.waMessage.findFirst({
    where: { id: anchorId, conversationId, deletedAt: null },
    select: { id: true, createdAt: true },
  });
  // Anchor gone (soft-deleted, pruned, or from another conversation): fall back
  // to the newest page rather than returning nothing.
  if (!anchor) return getThread(conversationId, { limit });

  const half = Math.max(1, Math.floor(limit / 2));
  const [olderDesc, newerAsc] = await Promise.all([
    prisma.waMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lte: anchor.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: half + 1, // +1 so the anchor itself doesn't eat a slot of context
    }),
    prisma.waMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        OR: [
          { createdAt: { gt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { gt: anchor.id } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: half,
    }),
  ]);
  return [...olderDesc.reverse(), ...newerAsc];
}

/**
 * Every media message in a conversation, newest first, paginated backward with
 * the same compound keyset cursor `getThread` uses.
 *
 * The gallery used to filter the thread buffer the inbox happened to be holding
 * (the last 50 messages plus whatever "Load older" had fetched), so on any
 * conversation longer than a page it showed a fraction of the media — and
 * confidently reported "No media shared in this conversation yet" whenever those
 * 50 messages were all text. A document a customer sent last month was
 * unreachable without scrolling the entire thread.
 */
export async function listConversationMedia(
  conversationId: string,
  params: {
    before?: string;
    limit?: number;
    /** Tie-break for messages sharing `before` to the second. */
    beforeId?: string;
  }
) {
  const limit = Math.min(100, params.limit ?? 60);
  const items = await prisma.waMessage.findMany({
    where: {
      conversationId,
      deletedAt: null, // same "delete for me" guard as the thread
      mediaId: { not: null },
      type: { in: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'] },
      ...(params.before
        ? params.beforeId
          ? {
              OR: [
                { createdAt: { lt: new Date(params.before) } },
                { createdAt: new Date(params.before), id: { lt: params.beforeId } },
              ],
            }
          : { createdAt: { lt: new Date(params.before) } }
        : {}),
    },
    // Only what a tile renders — never the `payload` jsonb, which on a media
    // message carries the whole Meta callback.
    select: {
      id: true,
      type: true,
      mediaId: true,
      mediaMime: true,
      // So a tile whose original is gone for good can say so, instead of showing
      // the same broken-image placeholder a slow network produces.
      mediaArchiveStatus: true,
      text: true,
      direction: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = items.length > limit;
  return { items: hasMore ? items.slice(0, limit) : items, hasMore };
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
      data: {
        lastMessagePreview: null,
        unreadCount: 0,
        // Advancing the read marker is the load-bearing part. Zeroing the count
        // without it meant the next inbound message recomputed unread from the OLD
        // marker and resurrected the whole historical count - 40 unread against a
        // one-message thread.
        lastReadAt: new Date(),
      },
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
      // The thread read filters soft-deleted messages; this did not, so after a
      // "clear chat" the badge counted history the thread no longer shows.
      deletedAt: null,
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
  // Addressed from the number that RECEIVED it — Meta rejects a receipt posted
  // under a different phone-number id, so on a second number the blue ticks
  // never appeared no matter how often the agent opened the thread.
  if (lastInbound?.wamid) {
    const wamid = lastInbound.wamid;
    void getChannelPhoneNumberId(conv.channelId)
      .then((phoneId) => sendReadReceipt(wamid, phoneId))
      .catch(() => {});
  }
  return conv;
}

/**
 * Show the customer a "typing…" bubble while an agent composes a reply.
 *
 * The Cloud API has no standalone typing call: the indicator rides on the read
 * receipt for a specific inbound message, so this resolves the newest inbound
 * wamid on the thread and addresses the receipt from the number that RECEIVED it
 * (Meta refuses a receipt posted under a different phone-number id — the same
 * rule that kept blue ticks off second-number threads).
 *
 * Returns whether anything was sent, so the caller can answer honestly instead
 * of pretending: a thread with no inbound message (an outbound-only campaign
 * conversation) has nothing to attach the indicator to.
 */
export async function sendTyping(conversationId: string): Promise<boolean> {
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, channelId: true },
  });
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  const lastInbound = await prisma.waMessage.findFirst({
    where: { conversationId, direction: 'INBOUND', wamid: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { wamid: true },
  });
  if (!lastInbound?.wamid) return false;
  const phoneId = await getChannelPhoneNumberId(conv.channelId);
  // Best-effort, like the read receipt it rides on: a failed indicator must
  // never surface as a composer error while the agent is mid-sentence.
  await sendTypingIndicator(lastInbound.wamid, phoneId).catch(() => {});
  return true;
}

/**
 * Agents a conversation can be assigned to.
 *
 * The host platform queried its User table for active SUPER_ADMIN/ADMIN staff.
 * There is no user table here, so the roster is every label this deployment can
 * stamp: the shared APP_PASSWORD account plus each named operator in
 * OPERATOR_PASSWORDS (middleware/app-password.ts). It used to be a one-element
 * stub, which meant a team of ten had exactly one assignee between them and
 * "who is handling this thread" had no answer the inbox could show.
 *
 * `assignedTo` is a free-text label, not an FK, so this list is what gives the
 * assignee picker something real to offer.
 *
 * It is also the ONE place those labels are published. The console used to
 * rebuild the operator's own label from its own NEXT_PUBLIC_OPERATOR_LABEL, so
 * a deployment that set OPERATOR_LABEL here and not there wrote one label on
 * "Assign to me" and queried a different one for "Assigned to me" — an inbox
 * filter that silently matched nothing. This list deliberately does NOT say
 * which of them is the caller: `GET /unlock/whoami` answers that, from the
 * session, and one question with one answer cannot drift out of step.
 */
export async function listAssignableAgents() {
  return listOperators().map((id) => ({ id, firstName: id, lastName: null, email: '' }));
}

export async function assign(conversationId: string, userId: string | null) {
  // `assignedTo` is a free-text operator label now — there is no user table to
  // validate against, and no roles to check. Any label (or null) is accepted;
  // listAssignableAgents publishes the ones the console offers.
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
      // Reopening starts a fresh resolution episode. Without this, resolution time
      // was measured from the row's creation — i.e. from the contact's first ever
      // message — so a ticket opened and closed today could report a resolution
      // time of months.
      ...(status === 'RESOLVED' ? {} : { reopenedAt: new Date() }),
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

/**
 * Dismiss the "this customer's WhatsApp identity changed" banner.
 *
 * The signal says a customer re-registered the number on a new device; it is a
 * prompt to re-verify who is on the other end, not a permanent property of the
 * thread. Clearing it is therefore an agent saying "checked" — which is why it
 * is a deliberate action rather than something the next inbound message resets.
 *
 * `identityHash` is deliberately LEFT in place: Meta repeats the identity block
 * on the customer's following messages, and that hash is how the inbound worker
 * knows this particular change has already been looked at. Clearing it here
 * would put the banner straight back up on their next reply.
 */
export async function acknowledgeIdentityChange(conversationId: string) {
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { identityChangedAt: null },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}

/**
 * Full conversation + its messages (chronological ascending) for export/transcript.
 *
 * Soft-deleted messages are EXCLUDED by default, matching every other read path
 * (getThread, the anchored page, the media gallery, the unread count). They used
 * to be included unconditionally, so a transcript handed to a customer or a
 * regulator carried messages the operator had deliberately removed from the
 * inbox — two views of the same conversation that disagreed, with the export
 * being the one nobody proof-reads. `includeDeleted` is the explicit opt-in for
 * the case where the full record IS the point (a legal hold, an internal audit).
 *
 * Internal notes are NOT part of this query — the export controller pulls them
 * separately (and only on request), because they are encrypted at rest and are
 * private agent commentary that must not ride along by default.
 */
export async function getTranscriptHeader(conversationId: string) {
  return prisma.waConversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: { select: { id: true, phone: true, name: true, profileName: true } },
      channel: { select: { id: true, displayPhone: true } },
    },
  });
}

/** Rows read per page of a streamed transcript. */
const TRANSCRIPT_PAGE_SIZE = 500;

/**
 * A conversation's messages, oldest first, one page at a time.
 *
 * The export used to load the whole thread through a nested `include` with no
 * `take` and then join it into a single CSV string in memory. There is exactly
 * one WaConversation per contact forever, so "the whole thread" is that person's
 * entire history — a long-running support relationship is tens of thousands of
 * rows, each carrying `payload`, and the export of it was a heap spike plus a
 * 30s request budget spent serialising before a single byte reached the browser.
 *
 * Keyset on `(createdAt, id)` COMPARED BY VALUE rather than Prisma's `cursor` +
 * `skip: 1`: the predicate below can invalidate its own cursor row (an operator
 * soft-deleting a message mid-export removes it from the filtered set), and a
 * cursor that no longer matches silently shifts every following page by one.
 * `@@index([conversationId, createdAt])` serves the range scan directly.
 */
export async function* streamTranscriptMessages(
  conversationId: string,
  opts: { includeDeleted?: boolean; pageSize?: number } = {}
): AsyncGenerator<WaMessage[]> {
  const pageSize = opts.pageSize ?? TRANSCRIPT_PAGE_SIZE;
  let after: { at: Date; id: string } | null = null;
  for (;;) {
    // Annotated: the where clause reads `after`, which is assigned from this very
    // page, and TypeScript reports that round trip as circular (TS7022) rather than
    // resolving it. Naming the row type breaks the cycle without widening anything.
    const page: WaMessage[] = await prisma.waMessage.findMany({
      where: {
        conversationId,
        // `deletedAt: { not: null }` is never wanted — including deleted rows
        // means "everything", so the opt-in simply drops the filter.
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
        ...(after
          ? {
              OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize,
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    const last = page[page.length - 1];
    after = { at: last.createdAt, id: last.id };
  }
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

/**
 * Pause (or resume, when null) every automated reply on one conversation.
 *
 * Handoff was impossible before this: an agent taking over a difficult thread had
 * no way to stop keyword rules and the away message cutting in over them.
 */
export async function setBotPause(conversationId: string, botPausedUntil: Date | null) {
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: { botPausedUntil },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
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
 * Adopt the window expiry Meta itself reported on a status callback.
 *
 * The local window is `lastInboundAt + 24h`, which is only right for a plain
 * service conversation. A free-entry-point / click-to-WhatsApp conversation is
 * open for 72 hours — the composer was locked and the agent pushed to a paid
 * template while replies were still free — and Meta can also close a window
 * early, which left the composer open and every send bouncing. Meta's value
 * always wins upward; we never shorten below what we already believe, because a
 * late/replayed callback must not close a live window.
 */
export async function extendWindowFromMeta(
  conversationId: string,
  expiresAt: Date,
  metaConversationId?: string | null
): Promise<void> {
  const existing = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { windowExpiresAt: true },
  });
  const merged = new Date(Math.max(existing?.windowExpiresAt?.getTime() ?? 0, expiresAt.getTime()));
  if (existing?.windowExpiresAt && merged.getTime() === existing.windowExpiresAt.getTime()) {
    // Nothing to widen, and no id to record — skip the write entirely.
    if (!metaConversationId) return;
  }
  const conv = await prisma.waConversation.update({
    where: { id: conversationId },
    data: {
      windowExpiresAt: merged,
      ...(metaConversationId ? { metaConversationId } : {}),
    },
  });
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
}

/**
 * Update denormalized last-message fields, optionally inside a caller's
 * transaction. For inbound messages also recomputes the unread count and
 * (re)opens the 24h customer-service window.
 *
 * `client` is the Prisma client the writes run on. Passing a transaction client
 * is how the message paths commit a message row and the fields it denormalizes
 * as one unit: they used to be independent statements, so a crash or a pool
 * timeout in between left the message stored and the thread stale — it sorted to
 * the wrong place in the inbox and, with `windowExpiresAt` missed, the 24h window
 * read as narrower than it is, so the agent's next free-form reply bounced as
 * WA_WINDOW_CLOSED.
 *
 * Emits nothing. A caller inside a transaction has to emit AFTER it commits, or
 * a rollback leaves the inbox showing a message that does not exist; use
 * `touchOnMessage` for the plain emitting form.
 */
export async function applyMessageTouch(
  client: Prisma.TransactionClient,
  conversationId: string,
  opts: { preview: string; at: Date; inbound: boolean }
): Promise<WaConversation> {
  const preview = opts.preview.slice(0, 200);
  if (!opts.inbound) {
    return client.waConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: opts.at,
        lastMessagePreview: preview,
        lastMessageDirection: 'OUTBOUND',
      },
    });
  }

  // Inbound: anchor the window on the MESSAGE timestamp (not Date.now()) so a
  // delayed/replayed webhook can't drag the window the wrong way, and only ever
  // EXTEND it — never shorten it below an existing later expiry.
  //
  // One statement, not findUnique → count → update. That read-modify-write raced
  // itself: two messages from the same customer landing together both read the
  // pre-existing window and unread count, and whichever wrote second overwrote
  // the other — a lost unread, and a window recomputed from a value read before
  // the other message existed. GREATEST/COALESCE and the unread subquery let
  // Postgres derive all of it from the row it is already locking.
  //
  // Timestamps are interpolated as ISO strings cast to `timestamp` because the
  // columns are timestamp-without-zone holding UTC — the explicit cast keeps the
  // stored value independent of the session time zone.
  const at = opts.at.toISOString();
  const expiry = new Date(opts.at.getTime() + WINDOW_MS).toISOString();
  const rows = await client.$queryRaw<WaConversation[]>(Prisma.sql`
    UPDATE "WaConversation" c
       SET "lastMessageAt" = ${at}::timestamp,
           "lastMessagePreview" = ${preview},
           "lastMessageDirection" = 'INBOUND',
           "windowExpiresAt" = GREATEST(
             COALESCE(c."windowExpiresAt", ${expiry}::timestamp),
             ${expiry}::timestamp
           ),
           -- Opens a response episode. Only the FIRST unanswered inbound starts
           -- the clock — three messages in a row from the same customer are one
           -- wait, not three. Anchored on the message timestamp for the same
           -- reason the window is.
           "awaitingReplySince" = COALESCE(c."awaitingReplySince", ${at}::timestamp),
           -- Recomputed from the read marker rather than blind-incremented, so a
           -- message landing during a read round-trip is still reflected. Mirrors
           -- countUnreadSince, soft-delete filter included (after a "clear chat"
           -- the badge must not count history the thread no longer shows).
           "unreadCount" = (
             SELECT COUNT(*)
               FROM "WaMessage" m
              WHERE m."conversationId" = c."id"
                AND m."direction" = 'INBOUND'
                AND m."deletedAt" IS NULL
                AND (c."lastReadAt" IS NULL OR m."createdAt" > c."lastReadAt")
           ),
           -- A reply ENDS the snooze. Nothing anywhere cleared this, so a thread
           -- snoozed for 24h that the customer answered five minutes later stayed
           -- out of the active queue while the sidebar badge counted the unread
           -- message the list refused to show — and the 24h free-form window
           -- could close on a reply nobody saw. Same row Postgres is already
           -- locking for the counters above, so this costs nothing and cannot
           -- race with them.
           "snoozedUntil" = NULL,
           -- A reply also REOPENS a closed thread. Left RESOLVED, the customer's
           -- follow-up is invisible to a resolved-excluding view and the
           -- first-response SLA is measured against the wrong episode.
           "status" = CASE WHEN c."status" = 'RESOLVED' THEN 'OPEN' ELSE c."status" END,
           "reopenedAt" = CASE WHEN c."status" = 'RESOLVED' THEN ${at}::timestamp ELSE c."reopenedAt" END,
           "resolvedAt" = CASE WHEN c."status" = 'RESOLVED' THEN NULL ELSE c."resolvedAt" END,
           -- @updatedAt is applied by the Prisma client, so a raw UPDATE has to
           -- stamp it itself.
           "updatedAt" = NOW() AT TIME ZONE 'UTC'
     WHERE c."id" = ${conversationId}
     RETURNING c.*
  `);
  const conv = rows[0];
  if (!conv) throw new AppError('Conversation not found', 404, 'WA_CONVERSATION_NOT_FOUND');
  return conv;
}

/** `applyMessageTouch` outside a transaction, announcing the result to the inbox. */
export async function touchOnMessage(
  conversationId: string,
  opts: { preview: string; at: Date; inbound: boolean }
) {
  const conv = await applyMessageTouch(prisma, conversationId, opts);
  emitWa('wa:conversation', { conversationId, conversation: conv }, conversationId);
  return conv;
}
