import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { encryptField, decryptField, warnIfEncryptionDisabled } from '../utils/encryption';
import { listOperators } from '../middleware/app-password';
import { emitWaToOperator } from '../utils/whatsapp-realtime';

/** `@handle` — the character class a label can legitimately contain. */
const MENTION_RE = /@([A-Za-z0-9._-]{1,120})/g;
/** A note naming more than this is a broadcast, not a mention. */
const MAX_MENTIONS = 10;

/**
 * Operator labels named in `body`, resolved against the real roster.
 *
 * An `@handle` matching nobody is NOT stored. Storing it would put a mention on
 * the note that points at no reachable socket — the author would see their
 * colleague tagged and reasonably assume they had been told, when nothing was
 * ever sent. Matching is case-insensitive but the CANONICAL label is stored, so
 * `@Ravi` and `@ravi` resolve to one person rather than two.
 *
 * The author is excluded: nobody needs to be notified of their own note.
 */
function parseMentions(body: string, authorId: string | null): string[] {
  const roster = new Map(listOperators().map((o) => [o.toLowerCase(), o]));
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    const hit = roster.get(m[1].toLowerCase());
    if (hit && hit !== authorId) out.add(hit);
    if (out.size >= MAX_MENTIONS) break;
  }
  return [...out];
}

// Internal notes are private agent commentary (never sent to Meta) — the most
// candid free-text in the system. They're encrypted at rest (AES-256-GCM) and
// never searched/sorted server-side, so encryption has zero query impact.
// decryptField() passes through legacy plaintext rows unchanged.

/** Notes returned per page — the panel shows a scrollable list, not a page count. */
const NOTES_PAGE_SIZE = 200;
/** Ceiling on what one request may ask for, so the cap cannot be dialled off. */
const NOTES_PAGE_MAX = 500;

/**
 * Internal (agent-only) notes attached to a conversation, newest first.
 *
 * Bounded. There is one conversation per contact forever, so a long-running
 * account accumulates notes indefinitely and this used to read and DECRYPT every
 * one of them on each panel open — an unbounded scan whose cost grew with the
 * length of the relationship, on a request that only ever renders the top of the
 * list.
 *
 * `before` pages backwards through the older ones by value on `(createdAt, id)`,
 * which is also how the transcript export walks the whole set without ever
 * holding it all at once.
 */
export async function listNotes(
  conversationId: string,
  opts: { limit?: number; before?: { at: Date; id: string }; scope?: 'conversation' | 'contact' } = {}
) {
  const take = Math.min(Math.max(opts.limit ?? NOTES_PAGE_SIZE, 1), NOTES_PAGE_MAX);
  const before = opts.before;
  // A contact can hold one thread per connected number, so notes written on the
  // support number's thread were invisible from the marketing number's thread
  // with the same person — the history an agent needs is about the PERSON.
  //
  // The conversation is still included explicitly: rows written before
  // `contactId` existed carry null, and scoping purely by contact would hide
  // this very thread's own history.
  let where: Prisma.WaConversationNoteWhereInput = { conversationId };
  if (opts.scope === 'contact') {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { contactId: true },
    });
    if (conv?.contactId) {
      where = { OR: [{ contactId: conv.contactId }, { conversationId }] };
    }
  }
  const notes = await prisma.waConversationNote.findMany({
    where: {
      ...where,
      ...(before
        ? {
            OR: [
              { createdAt: { lt: before.at } },
              { createdAt: before.at, id: { lt: before.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
  });
  return notes.map((n) => ({ ...n, body: decryptField(n.body) }));
}

/**
 * Every note on a conversation, oldest-page-last, for the transcript export.
 *
 * Pages through `listNotes` rather than dropping the cap: the export is the one
 * caller that legitimately wants all of them, and it writes each page out as it
 * arrives instead of buffering the set.
 */
export async function* streamNotes(conversationId: string, pageSize = NOTES_PAGE_SIZE) {
  let before: { at: Date; id: string } | undefined;
  for (;;) {
    const page = await listNotes(conversationId, { limit: pageSize, before });
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    const last = page[page.length - 1];
    before = { at: last.createdAt, id: last.id };
  }
}

export async function createNote(conversationId: string, authorId: string | null, body: string) {
  warnIfEncryptionDisabled('conversation note');
  // Parsed BEFORE the body is encrypted — afterwards there is nothing to parse.
  const mentions = parseMentions(body, authorId);
  // Denormalised at write time. Resolving it on READ would mean a join per note
  // page against a body nothing can be searched on anyway; resolving it here
  // costs one lookup per note written.
  const conv = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true },
  });
  const note = await prisma.waConversationNote.create({
    // Operator free-text about a customer. Warn (once) if it is going in
    // unencrypted rather than letting the fallback pass silently.
    data: {
      conversationId,
      contactId: conv?.contactId ?? null,
      authorId,
      body: encryptField(body),
      mentions,
    },
  });
  // One directed frame per named colleague. Writing "@ravi can you take this?"
  // used to reach Ravi only if Ravi happened to open that thread — which is to
  // say, a hand-off mechanism that did not hand anything off.
  //
  // The preview is plaintext on purpose: the frame goes to that operator's own
  // room, and notes are agent-only commentary they are already entitled to read.
  for (const label of mentions) {
    emitWaToOperator(label, 'wa:mention', {
      conversationId,
      noteId: note.id,
      author: authorId,
      preview: body.slice(0, 140),
    });
  }
  return { ...note, body }; // return the plaintext to the caller (don't leak ciphertext)
}

/**
 * Edit a note's body in place.
 *
 * There was no update path at all: a typo or a stale detail could only be fixed
 * by deleting the note and retyping it, which threw away its timestamp and
 * author. Scoped by conversationId for the same reason as the delete below.
 */
export async function updateNote(conversationId: string, id: string, body: string) {
  warnIfEncryptionDisabled('conversation note');
  const { count } = await prisma.waConversationNote.updateMany({
    where: { id, conversationId },
    data: { body: encryptField(body) },
  });
  if (count === 0) throw new AppError('Note not found', 404, 'WA_NOTE_NOT_FOUND');
  const note = await prisma.waConversationNote.findUnique({ where: { id } });
  return note ? { ...note, body } : { id, body }; // plaintext back, never ciphertext
}

/**
 * Delete a note, scoped to the conversation whose URL was used.
 *
 * The delete used to address the row by primary key alone, so a note belonging
 * to conversation B could be removed through conversation A's URL — which also
 * wrote the wrong entity into the audit log, leaving no honest record of what
 * was destroyed. `deleteMany` with both ids makes the URL's conversation part of
 * the predicate; count === 0 covers both "no such note" and "not this thread's
 * note" and keeps the original 404 shape.
 */
export async function deleteNote(conversationId: string, id: string) {
  const { count } = await prisma.waConversationNote.deleteMany({
    where: { id, conversationId },
  });
  if (count === 0) throw new AppError('Note not found', 404, 'WA_NOTE_NOT_FOUND');
  return { id };
}
