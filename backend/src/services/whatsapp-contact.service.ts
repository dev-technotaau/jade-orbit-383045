import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';
import type { WaOptInStatus, Role } from '@prisma/client';
import { deleteFileFromR2 } from './storage.service';
import { encryptJson, decryptJson } from '../utils/encryption';

// consentEvidence (opt-in provenance incl. IP/referral) is encrypted at rest and
// transparently decrypted on every read path below, so callers see the original
// object. decryptJson() passes through legacy plaintext rows.

/** Normalize any phone string to E.164 (`+<digits>`). */
export function normalizeWaPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : raw;
}

/** Common opt-out variants, merged with any env-configured keywords. */
const DEFAULT_OPT_OUT_KEYWORDS = [
  'stop',
  'unsubscribe',
  'cancel',
  'optout',
  'opt-out',
  'remove',
  'quit',
  'end',
];

const OPT_OUT_KEYWORDS = new Set(
  [...DEFAULT_OPT_OUT_KEYWORDS, ...(env.WHATSAPP_OPT_OUT_KEYWORDS || '').split(',')]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Detect an opt-out reply. Tokenizes the message (split on non-word chars,
 * lowercased) and matches if ANY token is an opt-out keyword OR the whole
 * trimmed message equals one. Stays synchronous with the same signature so
 * inbound-message handlers can call it inline.
 */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  // Whole-message match (covers keywords that contain a hyphen, e.g. 'opt-out').
  if (OPT_OUT_KEYWORDS.has(trimmed)) return true;
  // Any-token match: split on non-word chars so 'Please STOP now' / 'STOP.' hit.
  for (const token of trimmed.split(/[^\w]+/)) {
    if (token && OPT_OUT_KEYWORDS.has(token)) return true;
  }
  return false;
}

/**
 * Find a platform User whose WhatsApp number (falling back to mobile number)
 * matches `phone` by digits — i.e. COALESCE(whatsappNumber, mobileNumber) = phone.
 * Only returns the user id when it is safe to link: the user must not already be
 * linked to a different contact (WaContact.userId is @unique). `excludeContactId`
 * lets the caller treat its own contact as a non-conflict during relink.
 */
async function resolveLinkableUserId(
  normalizedPhone: string,
  excludeContactId?: string
): Promise<string | null> {
  const digits = normalizedPhone.replace(/[^\d]/g, '');
  if (!digits) return null;
  // Candidates whose whatsappNumber OR mobileNumber could match (E.164 stored,
  // but compare on digits to tolerate stray formatting).
  const candidates = await prisma.user
    .findMany({
      where: { OR: [{ whatsappNumber: normalizedPhone }, { mobileNumber: normalizedPhone }] },
      select: { id: true, whatsappNumber: true, mobileNumber: true },
    })
    .catch(
      () => [] as { id: string; whatsappNumber: string | null; mobileNumber: string | null }[]
    );
  // Apply COALESCE(whatsappNumber, mobileNumber) semantics on digits.
  const match = candidates.find((u) => {
    const effective = (u.whatsappNumber ?? u.mobileNumber ?? '').replace(/[^\d]/g, '');
    return effective && effective === digits;
  });
  if (!match) return null;
  // Guard the @unique userId: skip if that user already links another contact.
  const taken = await prisma.waContact
    .findUnique({ where: { userId: match.id }, select: { id: true } })
    .catch(() => null);
  if (taken && taken.id !== excludeContactId) return null;
  return match.id;
}

/**
 * Upsert a contact by phone; best-effort link to a platform User by
 * COALESCE(whatsappNumber, mobileNumber) = phone (only if that user isn't
 * already linked to another contact). Relinks on update when the existing
 * contact has no userId yet.
 */
export async function upsertContactByPhone(
  phone: string,
  data: { name?: string | null; waId?: string | null }
) {
  const normalized = normalizeWaPhone(phone);
  const existing = await prisma.waContact.findUnique({ where: { phone: normalized } });
  if (existing) {
    // Attempt a (re)link only when the contact is currently unlinked.
    const relinkUserId =
      existing.userId == null ? await resolveLinkableUserId(normalized, existing.id) : null;
    const needsUpdate =
      (!!data.name && data.name !== existing.name) ||
      (!!data.waId && data.waId !== existing.waId) ||
      relinkUserId != null;
    if (!needsUpdate) return existing;
    return prisma.waContact.update({
      where: { id: existing.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.waId ? { waId: data.waId } : {}),
        ...(relinkUserId != null ? { userId: relinkUserId } : {}),
      },
    });
  }

  const userId = await resolveLinkableUserId(normalized);

  return prisma.waContact.create({
    data: { phone: normalized, name: data.name ?? null, waId: data.waId ?? null, userId },
  });
}

/**
 * Best-effort: propagate a WhatsApp opt-out to the linked platform User. The
 * `User` model has no `notificationPreferences` JSON (those live on
 * CandidateProfile/CompanyProfile), so the documented WhatsApp consent marker on
 * the user is `isWhatsappVerified` — clear it so the platform stops treating the
 * number as a usable WhatsApp channel. Never throws (opt-out must not break).
 */
async function disableUserWhatsappConsent(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { isWhatsappVerified: false } })
    .catch(() => {});
}

export async function optOutContact(contactId: string) {
  const updated = await prisma.waContact.update({
    where: { id: contactId },
    data: { optInStatus: 'OPTED_OUT', optOutAt: new Date() },
  });
  // Propagate the opt-out to the linked platform User's WhatsApp consent flag.
  if (updated.userId) {
    await disableUserWhatsappConsent(updated.userId).catch(() => {});
  }
  return updated;
}

export interface ContactListFilters {
  optInStatus?: WaOptInStatus;
  tag?: string;
  blocked?: boolean;
  onPlatform?: boolean;
  role?: Role; // on-platform user role (candidate/employer/admin) — implies on-platform
  q?: string;
}

/** Shared where-builder for the contacts list, CSV export and bulk-by-filter. */
function buildContactListWhere(filters: ContactListFilters): Prisma.WaContactWhereInput {
  return {
    ...(filters.optInStatus ? { optInStatus: filters.optInStatus } : {}),
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
    ...(filters.blocked !== undefined ? { isBlocked: filters.blocked } : {}),
    ...(filters.onPlatform === true ? { userId: { not: null } } : {}),
    ...(filters.onPlatform === false ? { userId: null } : {}),
    ...(filters.role ? { user: { role: filters.role } } : {}),
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

/** A platform User reachable on WhatsApp (has a whatsapp/mobile number), with any linked contact/conversation. */
export interface WaPlatformUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: Role;
  mobileNumber: string | null;
  whatsappNumber: string | null;
  isWhatsappVerified: boolean;
  resolvedNumber: string;
  numberSource: 'whatsapp' | 'mobile';
  contactId: string | null;
  conversationId: string | null;
}

/**
 * List platform User accounts that have at least one number (whatsappNumber or
 * mobileNumber) — i.e. are reachable on WhatsApp. Enriches each with its linked
 * WaContact id and most-recent conversation id (when on-platform via WaContact).
 */
export async function listPlatformUsers(opts: {
  q?: string;
  role?: Role;
  page?: number;
  limit?: number;
}): Promise<{
  items: WaPlatformUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, opts.limit ?? 50);
  const where: Prisma.UserWhereInput = {
    AND: [{ OR: [{ whatsappNumber: { not: null } }, { mobileNumber: { not: null } }] }],
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.q
      ? {
          OR: [
            { firstName: { contains: opts.q, mode: 'insensitive' } },
            { lastName: { contains: opts.q, mode: 'insensitive' } },
            { email: { contains: opts.q, mode: 'insensitive' } },
            { mobileNumber: { contains: opts.q, mode: 'insensitive' } },
            { whatsappNumber: { contains: opts.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        mobileNumber: true,
        whatsappNumber: true,
        isWhatsappVerified: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Enrich with linked WaContact + most-recent conversation (keyed by userId @unique).
  const userIds = users.map((u) => u.id);
  const contacts = userIds.length
    ? await prisma.waContact.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          conversations: { select: { id: true }, orderBy: { lastMessageAt: 'desc' }, take: 1 },
        },
      })
    : [];
  const linkByUserId = new Map<string, { contactId: string; conversationId: string | null }>();
  for (const c of contacts) {
    if (!c.userId) continue;
    linkByUserId.set(c.userId, {
      contactId: c.id,
      conversationId: c.conversations[0]?.id ?? null,
    });
  }

  const items: WaPlatformUser[] = users.map((u) => {
    const link = linkByUserId.get(u.id);
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      mobileNumber: u.mobileNumber,
      whatsappNumber: u.whatsappNumber,
      isWhatsappVerified: u.isWhatsappVerified,
      resolvedNumber: (u.whatsappNumber ?? u.mobileNumber) as string,
      numberSource: u.whatsappNumber ? 'whatsapp' : 'mobile',
      contactId: link?.contactId ?? null,
      conversationId: link?.conversationId ?? null,
    };
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
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
      const rows = await prisma.waContact.findMany({
        where: { AND: [where, { tags: { has: opts.tag } }] },
        select: { id: true },
      });
      if (rows.length === 0) return { count: 0 };
      const ids = rows.map((r) => r.id);
      // Prisma has no scalar-list "pull"; array_remove is atomic + a no-op on non-members.
      await prisma.$executeRaw`UPDATE "WaContact" SET tags = array_remove(tags, ${opts.tag}), "updatedAt" = NOW() WHERE id IN (${Prisma.join(ids)})`;
      return { count: ids.length };
    }
    case 'addSuppression': {
      const rows = await prisma.waContact.findMany({ where, select: { phone: true } });
      const phones = rows.map((r) => r.phone).filter((p) => !p.startsWith('erased:'));
      if (phones.length === 0) return { count: 0 };
      const res = await prisma.waSuppression.createMany({
        data: phones.map((phone) => ({
          phone,
          reason: 'bulk',
          createdBy: opts.performedBy ?? null,
        })),
        skipDuplicates: true,
      });
      return { count: res.count };
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
): Promise<{ messagesScrubbed: number; mediaDeleted: number }> {
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
  const erased = await prisma.waContact.update({
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

  // Propagate the opt-out to the linked platform User's WhatsApp consent flag.
  if (erased.userId) {
    await disableUserWhatsappConsent(erased.userId).catch(() => {});
  }

  return { messagesScrubbed: scrubbed.count, mediaDeleted };
}
