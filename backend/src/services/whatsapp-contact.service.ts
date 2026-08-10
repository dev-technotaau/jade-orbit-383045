import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';
import type { WaOptInStatus } from '@prisma/client';
import { deleteFileFromR2 } from './storage.service';
import { encryptJson, decryptJson } from '../utils/encryption';

// consentEvidence (opt-in provenance incl. IP/referral) is encrypted at rest and
// transparently decrypted on every read path below, so callers see the original
// object. decryptJson() passes through legacy plaintext rows.

/**
 * Normalize any phone string to E.164 (`+<digits>`).
 *
 * A bare national number (no `+`, ten digits or fewer) gets DEFAULT_COUNTRY_CODE
 * prefixed. Without this an operator pasting `9876543210` into contact import
 * produced `+9876543210` — a number Meta cannot route, with no error until the
 * first send failed.
 *
 * Inbound webhook numbers are unaffected: Meta always sends full international
 * digits (e.g. `919876543210`, 12), which is longer than any national number, so
 * the prefix rule never fires on them.
 */
export function normalizeWaPhone(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return raw;

  // An explicit `+` means the caller already gave a country code.
  if (trimmed.startsWith('+')) return `+${digits}`;

  // `00` is the ITU international access prefix — 00<cc><number> is the same
  // number as +<cc><number>. Without this, an imported `00919876543210` became
  // `+00919876543210` and every message to it failed.
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`;

  const cc = (env.DEFAULT_COUNTRY_CODE || '').replace(/[^\d]/g, '');
  if (cc) {
    // A single leading 0 is a national trunk prefix, not part of the number —
    // people write their own number as 09876543210 constantly. It made the
    // digit count 11, which skipped the country-code branch below and produced
    // `+09876543210`: a different contact identity for the same person, and
    // undeliverable.
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.length <= 10) return `+${cc}${digits}`;
  }

  return `+${digits}`;
}

/**
 * Unambiguous opt-out words. These carry essentially no other meaning in an
 * inbound business message, so a match anywhere in the text is intent enough.
 */
const STRONG_OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'optout', 'opt-out'];

/**
 * Words that mean opt-out only when the message is *just* that word.
 *
 * These used to be matched as bare tokens anywhere in the message, alongside
 * the strong ones — so "please cancel my order", "can you remove the second
 * item" or "end of the month works" silently and permanently opted the customer
 * out of every category of message. There is no UI that shows why, and the
 * contact then fails `eligible()` forever. A customer replying "CANCEL" on its
 * own is unambiguous; the same word inside a sentence is not.
 */
const WEAK_OPT_OUT_KEYWORDS = ['cancel', 'remove', 'quit', 'end'];

/** Both sets, for the whole-message comparison. */
const DEFAULT_OPT_OUT_KEYWORDS = [...STRONG_OPT_OUT_KEYWORDS, ...WEAK_OPT_OUT_KEYWORDS];

const OPT_OUT_KEYWORDS = new Set(
  [...DEFAULT_OPT_OUT_KEYWORDS, ...(env.WHATSAPP_OPT_OUT_KEYWORDS || '').split(',')]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Operator-configured keywords from WaSettings, cached briefly.
 *
 * The settings page ships a chip editor titled "Opt-out keywords", described as
 * "Inbound messages matching any keyword auto opt-out the contact", the API
 * accepts it and the service persists it — and nothing ever read it back. An
 * operator who added their own keyword (a local-language "band karo") watched it
 * save successfully and do nothing. The env list and the defaults were the only
 * thing the detector ever consulted.
 *
 * Cached because this is consulted on every inbound text message; 60s is short
 * enough that a settings change takes effect while someone is still looking at
 * the page.
 */
const SETTINGS_KEYWORDS_TTL_MS = 60_000;
let settingsKeywords: Set<string> = new Set();
let settingsKeywordsAt = 0;

async function loadSettingsKeywords(): Promise<Set<string>> {
  if (Date.now() - settingsKeywordsAt < SETTINGS_KEYWORDS_TTL_MS) return settingsKeywords;
  try {
    const row = await prisma.waSettings.findFirst({ select: { optOutKeywords: true } });
    settingsKeywords = new Set(
      (row?.optOutKeywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    // Leave the previous value in place — a settings read failure must not
    // silently disable opt-out detection.
  }
  settingsKeywordsAt = Date.now();
  return settingsKeywords;
}

/** Refresh the cache immediately — call after settings are saved. */
export function invalidateOptOutKeywordCache(): void {
  settingsKeywordsAt = 0;
}

/** Words safe to match mid-sentence. Everything else needs the whole message. */
const STRONG_SET = new Set(STRONG_OPT_OUT_KEYWORDS);

function matchesKeyword(text: string, keywords: Set<string>): boolean {
  // Whole-message match (covers keywords that contain a hyphen, e.g. 'opt-out',
  // and multi-word phrases an operator may have configured). Any configured
  // keyword qualifies here — if the entire message is that word, it is intent.
  if (keywords.has(text)) return true;
  // Any-token match, but only for the unambiguous words: 'Please STOP now' and
  // 'STOP.' should hit; 'please cancel my order' must not.
  for (const token of text.split(/[^\w]+/)) {
    if (token && keywords.has(token) && STRONG_SET.has(token)) return true;
  }
  return false;
}

/**
 * Detect an opt-out reply against the built-in and env-configured keywords.
 * Synchronous, so callers that cannot await still work; prefer
 * {@link isOptOutMessageAsync}, which also honours WaSettings.
 */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return matchesKeyword(trimmed, OPT_OUT_KEYWORDS);
}

/**
 * Detect an opt-out reply against the built-in, env-configured AND
 * operator-configured (WaSettings) keywords. This is the one the inbound worker
 * uses; compliance depends on honouring what the operator actually configured.
 */
export async function isOptOutMessageAsync(text: string | null | undefined): Promise<boolean> {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  if (matchesKeyword(trimmed, OPT_OUT_KEYWORDS)) return true;
  return matchesKeyword(trimmed, await loadSettingsKeywords());
}

/**
 * Upsert a contact by phone.
 *
 * The host platform's version also tried to link each contact to a platform
 * `User` row by COALESCE(whatsappNumber, mobileNumber), guarding a @unique
 * userId. There is no user table in this module — every contact is simply a
 * phone number we talk to — so the phone IS the identity.
 */
export async function upsertContactByPhone(
  phone: string,
  data: { name?: string | null; waId?: string | null }
) {
  const normalized = normalizeWaPhone(phone);

  // A single upsert, not findUnique-then-create.
  //
  // The read-then-write version raced itself: the inbound worker runs at
  // concurrency 10, and two webhooks from a first-time contact arriving
  // together both saw "no row" and both called create. `phone` is @unique, so
  // the loser threw P2002 — and the worker's P2002 handling is scoped to the
  // message create further down, so the whole job failed and retried the entire
  // batch. Postgres resolves the conflict for us.
  const result = await prisma.waContact.upsert({
    where: { phone: normalized },
    update: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.waId ? { waId: data.waId } : {}),
    },
    create: { phone: normalized, name: data.name ?? null, waId: data.waId ?? null },
  });
  return result;
}

export async function optOutContact(contactId: string) {
  return prisma.waContact.update({
    where: { id: contactId },
    data: { optInStatus: 'OPTED_OUT', optOutAt: new Date() },
  });
}

export interface ContactListFilters {
  optInStatus?: WaOptInStatus;
  tag?: string;
  blocked?: boolean;
  q?: string;
}

/** Shared where-builder for the contacts list, CSV export and bulk-by-filter. */
function buildContactListWhere(filters: ContactListFilters): Prisma.WaContactWhereInput {
  return {
    ...(filters.optInStatus ? { optInStatus: filters.optInStatus } : {}),
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
    ...(filters.blocked !== undefined ? { isBlocked: filters.blocked } : {}),
    ...(filters.q
      ? {
          OR: [
            { phone: { contains: filters.q } },
            { name: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/**
 * All matching contacts for CSV export (capped). When `ids` is given, exports
 * exactly those (selected-rows export); otherwise mirrors the list filters.
 */
export async function getContactsForExport(filters: ContactListFilters & { ids?: string[] }) {
  const where: Prisma.WaContactWhereInput =
    filters.ids && filters.ids.length > 0
      ? { id: { in: filters.ids } }
      : buildContactListWhere(filters);
  const rows = await prisma.waContact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50_000,
  });
  return rows.map((c) => ({ ...c, consentEvidence: decryptJson(c.consentEvidence) }));
}

export async function listContacts(
  filters: ContactListFilters & { page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, filters.limit ?? 50);
  const where = buildContactListWhere(filters);
  const [items, total] = await Promise.all([
    prisma.waContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waContact.count({ where }),
  ]);
  return {
    items: items.map((c) => ({ ...c, consentEvidence: decryptJson(c.consentEvidence) })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export type BulkContactAction =
  | 'tag'
  | 'untag'
  | 'optIn'
  | 'optOut'
  | 'block'
  | 'unblock'
  | 'addSuppression'
  | 'erase';

/** Cap for the heavy per-row erase action (each erase scrubs messages + R2). */
const BULK_ERASE_MAX = 1000;

/**
 * Rows per statement for bulk actions that inline ids.
 *
 * Postgres allows at most 65535 bind parameters in one statement, and
 * `Prisma.join` emits one per id — so an unchunked "select all matching" bulk
 * action failed hard once the contact list grew past that. 5000 leaves an order
 * of magnitude of headroom.
 */
const BULK_CHUNK = 5000;

/** Page a contact query by id and hand each chunk of ids to `fn`. */
async function forEachIdChunk(
  where: Prisma.WaContactWhereInput,
  fn: (ids: string[]) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const page: Array<{ id: string }> = await prisma.waContact.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BULK_CHUNK,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) return;
    cursor = page[page.length - 1].id;
    await fn(page.map((r) => r.id));
    if (page.length < BULK_CHUNK) return;
  }
}

/**
 * Apply one action to many contacts. Selection is EITHER explicit `ids` OR
 * `allMatching` (every contact matching the same list filters — "select all N").
 * Most actions are a single updateMany; untag uses array_remove; addSuppression
 * and erase resolve the set first (erase is capped + looped since it scrubs
 * messages + R2 media per contact).
 */
export async function bulkUpdateContacts(opts: {
  action: BulkContactAction;
  ids?: string[];
  allMatching?: boolean;
  filters?: ContactListFilters;
  tag?: string;
  performedBy?: string | null;
}): Promise<{ count: number }> {
  const where: Prisma.WaContactWhereInput = opts.allMatching
    ? buildContactListWhere(opts.filters ?? {})
    : { id: { in: opts.ids ?? [] } };
  if (!opts.allMatching && (!opts.ids || opts.ids.length === 0)) return { count: 0 };
  const now = new Date();

  switch (opts.action) {
    case 'optIn':
      return prisma.waContact.updateMany({
        where,
        data: { optInStatus: 'OPTED_IN', optInAt: now, optOutAt: null },
      });
    case 'optOut':
      return prisma.waContact.updateMany({
        where,
        data: { optInStatus: 'OPTED_OUT', optOutAt: now },
      });
    case 'block':
      return prisma.waContact.updateMany({ where, data: { isBlocked: true } });
    case 'unblock':
      return prisma.waContact.updateMany({ where, data: { isBlocked: false } });
    case 'tag': {
      if (!opts.tag) return { count: 0 };
      // Dedupe: only add to contacts that don't already carry the tag.
      return prisma.waContact.updateMany({
        where: { AND: [where, { NOT: { tags: { has: opts.tag } } }] },
        data: { tags: { push: opts.tag } },
      });
    }
    case 'untag': {
      if (!opts.tag) return { count: 0 };
      // Chunked. `Prisma.join` emits one bind parameter per id, and Postgres
      // caps a statement at 65535 of them — so "select all" over a contact list
      // of that size failed outright with a bind-parameter error, at the point
      // where the operator had already confirmed the action.
      let count = 0;
      await forEachIdChunk({ AND: [where, { tags: { has: opts.tag } }] }, async (ids) => {
        // Prisma has no scalar-list "pull"; array_remove is atomic + a no-op
        // on non-members.
        await prisma.$executeRaw`UPDATE "WaContact" SET tags = array_remove(tags, ${opts.tag}), "updatedAt" = NOW() WHERE id IN (${Prisma.join(ids)})`;
        count += ids.length;
      });
      return { count };
    }
    case 'addSuppression': {
      // Same chunking, same reason: this read every matching phone and passed
      // the lot to a single createMany.
      let count = 0;
      let cursor: string | undefined;
      for (;;) {
        const page: Array<{ id: string; phone: string }> = await prisma.waContact.findMany({
          where,
          select: { id: true, phone: true },
          orderBy: { id: 'asc' },
          take: BULK_CHUNK,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (page.length === 0) break;
        cursor = page[page.length - 1].id;
        const phones = page.map((r) => r.phone).filter((ph) => !ph.startsWith('erased:'));
        if (phones.length) {
          const res = await prisma.waSuppression.createMany({
            data: phones.map((phone) => ({
              phone,
              reason: 'bulk',
              createdBy: opts.performedBy ?? null,
            })),
            skipDuplicates: true,
          });
          count += res.count;
        }
        if (page.length < BULK_CHUNK) break;
      }
      return { count };
    }
    case 'erase': {
      const rows = await prisma.waContact.findMany({
        where,
        select: { id: true },
        take: BULK_ERASE_MAX,
      });
      let count = 0;
      for (const r of rows) {
        try {
          await eraseContactData(r.id);
          count += 1;
        } catch {
          /* best-effort: keep going on individual failures */
        }
      }
      return { count };
    }
    default:
      return { count: 0 };
  }
}

export async function getContact(id: string) {
  const c = await prisma.waContact.findUnique({ where: { id } });
  return c ? { ...c, consentEvidence: decryptJson(c.consentEvidence) } : c;
}

export async function updateContact(
  id: string,
  data: { name?: string | null; tags?: string[]; isBlocked?: boolean; optInStatus?: WaOptInStatus }
) {
  const patch: Prisma.WaContactUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.tags !== undefined) patch.tags = { set: data.tags };
  if (data.isBlocked !== undefined) patch.isBlocked = data.isBlocked;
  if (data.optInStatus !== undefined) {
    patch.optInStatus = data.optInStatus;
    if (data.optInStatus === 'OPTED_IN') {
      patch.optInAt = new Date();
      patch.optInSource = 'manual';
      patch.optOutAt = null;
    } else if (data.optInStatus === 'OPTED_OUT') {
      patch.optOutAt = new Date();
    }
  }
  return prisma.waContact.update({ where: { id }, data: patch });
}

/** Bulk import contacts (CSV-driven). Upserts by phone; optionally marks opted-in. */
export async function importContacts(
  rows: Array<{ phone: string; name?: string; tags?: string[] }>,
  optIn: boolean
) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const phone = normalizeWaPhone(row.phone);
    if (phone.replace(/[^\d]/g, '').length < 8) {
      skipped++;
      continue;
    }
    const existing = await prisma.waContact.findUnique({ where: { phone }, select: { id: true } });
    const now = new Date();
    // Consent provenance is recorded for every imported row, regardless of the
    // opt-in flag, so we can always evidence where/when the contact entered.
    const consentEvidence: Prisma.InputJsonValue = encryptJson({
      source: 'import',
      at: now.toISOString(),
      optIn,
    });
    const optInData = optIn
      ? {
          optInStatus: 'OPTED_IN' as WaOptInStatus,
          optInAt: now,
          optInSource: 'import',
          consentEvidence,
        }
      : { consentEvidence };
    if (existing) {
      await prisma.waContact.update({
        where: { id: existing.id },
        data: {
          ...(row.name ? { name: row.name } : {}),
          ...(row.tags?.length ? { tags: { set: row.tags } } : {}),
          ...optInData,
        },
      });
      updated++;
    } else {
      await prisma.waContact.create({
        data: { phone, name: row.name ?? null, tags: row.tags ?? [], ...optInData },
      });
      created++;
    }
  }
  return { created, updated, skipped, total: rows.length };
}

/**
 * DPDP data-access (portability) bundle for a single contact — the contact row,
 * its conversations, every WaMessage, and campaign-recipient rows. Returned as a
 * downloadable JSON blob for a data-subject access request. Returns null when the
 * contact does not exist.
 */
export async function exportContactData(contactId: string) {
  const contact = await prisma.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return null;
  const [conversations, messages, campaignRecipients] = await Promise.all([
    prisma.waConversation.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.waMessage.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.waCampaignRecipient.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { contact, conversations, messages, campaignRecipients };
}

/**
 * DPDP right-to-erasure for a single contact. Anonymizes + deletes PII but keeps
 * a tombstone row so audit / billing history survives:
 *  - best-effort deletes every archived media object from R2,
 *  - scrubs message bodies/payloads/media references,
 *  - clears conversation last-message previews,
 *  - anonymizes the contact row and permanently blocks re-contact (the phone is
 *    rewritten to a non-dialable `erased:<id>` sentinel so the @unique still holds).
 * Returns a summary of what was scrubbed.
 */
export async function eraseContactData(
  contactId: string
): Promise<{ messagesScrubbed: number; mediaDeleted: number; eventsDeleted: number }> {
  // Capture the identifiers BEFORE (d) rewrites `phone` to the erased sentinel —
  // they are what the raw webhook payloads are matched on further down.
  const before = await prisma.waContact.findUnique({
    where: { id: contactId },
    select: { phone: true, waId: true },
  });

  // (a) Best-effort delete every archived media object from R2. `mediaUrl` holds
  // the R2 object key (see archiveInboundMedia / streamMedia).
  const mediaRows = await prisma.waMessage.findMany({
    where: { contactId, mediaUrl: { not: null } },
    select: { mediaUrl: true },
  });
  let mediaDeleted = 0;
  for (const row of mediaRows) {
    if (!row.mediaUrl) continue;
    try {
      await deleteFileFromR2(row.mediaUrl);
      mediaDeleted++;
    } catch {
      // R2 not configured or object already gone — keep scrubbing the DB.
    }
  }

  // (b) Scrub message PII (body, payload, media references).
  const scrubbed = await prisma.waMessage.updateMany({
    where: { contactId },
    data: {
      text: null,
      payload: Prisma.JsonNull,
      mediaUrl: null,
      mediaId: null,
    },
  });

  // (c) Clear conversation last-message previews (the only PII denormalized there).
  await prisma.waConversation.updateMany({
    where: { contactId },
    data: { lastMessagePreview: null },
  });

  // (d) Anonymize the contact tombstone + block any future contact. Rewriting the
  // phone to a `erased:<id>` sentinel keeps the @unique constraint satisfied and
  // guarantees the original number can never be matched/re-contacted again.
  await prisma.waContact.update({
    where: { id: contactId },
    data: {
      name: null,
      waId: null,
      attributes: Prisma.JsonNull,
      consentEvidence: Prisma.JsonNull,
      optInStatus: 'OPTED_OUT',
      optOutAt: new Date(),
      isBlocked: true,
      phone: `erased:${contactId}`,
    },
  });

  // (e) The raw webhook envelopes. WaWebhookEvent.payload holds a verbatim
  // second copy of everything this person sent — their number, their message
  // text, media ids — and was only ever removed by the daily prune on a fixed
  // 14-day TTL. An erasure request that leaves the data readable for another
  // fortnight is not an erasure. Matched on the payload text because the
  // sender's number is nested inside Meta's envelope, not a column.
  let eventsDeleted = 0;
  for (const needle of [before?.phone, before?.waId].filter(Boolean) as string[]) {
    // Meta sends bare digits (no +), so match on the digits.
    const digits = needle.replace(/[^\d]/g, '');
    if (!digits) continue;
    const res = await prisma.$executeRaw`
      DELETE FROM "WaWebhookEvent" WHERE "payload"::text LIKE ${'%' + digits + '%'}
    `.catch(() => 0);
    eventsDeleted += Number(res) || 0;
  }

  // (f) Operator notes about this person — free text, indefinitely retained.
  await prisma.waConversationNote
    .deleteMany({ where: { conversation: { contactId } } })
    .catch(() => ({ count: 0 }));

  // (g) Click telemetry: keep the click (it is campaign analytics) but drop the
  // identifiers attached to it.
  await prisma.waLinkClick
    .updateMany({ where: { contactId }, data: { ip: null, userAgent: null } })
    .catch(() => ({ count: 0 }));

  // (h) Webhook delivery payloads that carried this contact's phone/text out to
  // a subscriber. The retention prune drops these on a TTL; erasure cannot wait
  // for it.
  if (before?.phone) {
    await prisma.$executeRaw`
      DELETE FROM "WebhookDelivery" WHERE "payload"::text LIKE ${'%' + before.phone + '%'}
    `.catch(() => 0);
  }

  return { messagesScrubbed: scrubbed.count, mediaDeleted, eventsDeleted };
}
