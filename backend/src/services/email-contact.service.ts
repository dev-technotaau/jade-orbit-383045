import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import type { Role, EmailSubscribeStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { parseCsv, formatCsv } from '../utils/email-csv';

/** Lowercase + trim. Email addresses are case-insensitive at the domain and,
 * in practice at the platform, at the local part too — so we normalize fully. */
export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (email: string): boolean => EMAIL_RE.test(normalizeEmail(email));

/** Hard cap on a single materialized platform audience (safety valve). */
const MAX_PLATFORM_AUDIENCE = 200_000;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface ListContactsOpts {
  q?: string;
  subscribeStatus?: EmailSubscribeStatus;
  tag?: string;
  tags?: string[]; // match ANY of these tags
  onPlatform?: boolean;
  isBlocked?: boolean;
  ids?: string[]; // restrict to specific contact ids (selected-only export/actions)
  setId?: string; // members of a static set
  page?: number;
  limit?: number;
}

export async function listContacts(opts: ListContactsOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = buildContactWhere(opts);
  const [items, total] = await Promise.all([
    prisma.emailContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailContact.count({ where }),
  ]);
  return { items, total, page, limit };
}

export function buildContactWhere(opts: ListContactsOpts): Prisma.EmailContactWhereInput {
  const where: Prisma.EmailContactWhereInput = {};
  if (opts.q) {
    const q = opts.q.trim();
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (opts.subscribeStatus) where.subscribeStatus = opts.subscribeStatus;
  if (opts.tag) where.tags = { has: opts.tag };
  if (opts.tags?.length) where.tags = { hasSome: opts.tags };
  if (opts.onPlatform === true) where.userId = { not: null };
  if (opts.onPlatform === false) where.userId = null;
  if (opts.isBlocked !== undefined) where.isBlocked = opts.isBlocked;
  if (opts.ids?.length) where.id = { in: opts.ids };
  if (opts.setId) where.setMemberships = { some: { setId: opts.setId } };
  return where;
}

export async function getContact(id: string) {
  const contact = await prisma.emailContact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Contact not found', 404, 'EMAIL_CONTACT_NOT_FOUND');
  return contact;
}

export async function createContact(input: {
  email: string;
  name?: string | null;
  tags?: string[];
  attributes?: Prisma.InputJsonValue;
  subscribeStatus?: EmailSubscribeStatus;
  subscribeSource?: string | null;
  consentEvidence?: Prisma.InputJsonValue;
}) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new AppError('A valid email is required', 400, 'EMAIL_INVALID');
  const source = input.subscribeSource ?? 'manual';
  try {
    return await prisma.emailContact.create({
      data: {
        email,
        name: input.name ?? null,
        tags: input.tags ?? [],
        attributes: input.attributes,
        subscribeStatus: input.subscribeStatus ?? 'SUBSCRIBED',
        subscribeSource: source,
        subscribedAt: new Date(),
        // Proof-of-consent for CAN-SPAM/DPDP auditing.
        consentEvidence:
          input.consentEvidence ??
          ({ source, method: 'admin', at: new Date().toISOString() } as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('A contact with this email already exists', 409, 'EMAIL_CONTACT_EXISTS');
    }
    throw err;
  }
}

export async function updateContact(id: string, patch: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...patch };
  if (typeof data.email === 'string') data.email = normalizeEmail(data.email);
  try {
    return await prisma.emailContact.update({
      where: { id },
      data: data as Prisma.EmailContactUpdateInput,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Contact not found', 404, 'EMAIL_CONTACT_NOT_FOUND');
    }
    throw err;
  }
}

export async function deleteContact(id: string) {
  try {
    return await prisma.emailContact.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Contact not found', 404, 'EMAIL_CONTACT_NOT_FOUND');
    }
    throw err;
  }
}

export async function setContactBlocked(id: string, isBlocked: boolean) {
  return updateContact(id, { isBlocked });
}

/** Bulk tag add/remove across a set of contacts (or a whole filter). */
export async function bulkTag(input: {
  contactIds?: string[];
  filter?: ListContactsOpts;
  addTags?: string[];
  removeTags?: string[];
}) {
  const where: Prisma.EmailContactWhereInput = input.contactIds?.length
    ? { id: { in: input.contactIds } }
    : buildContactWhere(input.filter ?? {});
  const contacts = await prisma.emailContact.findMany({ where, select: { id: true, tags: true } });
  let updated = 0;
  for (const c of contacts) {
    let tags = c.tags;
    if (input.addTags?.length) tags = Array.from(new Set([...tags, ...input.addTags]));
    if (input.removeTags?.length) tags = tags.filter((t) => !input.removeTags!.includes(t));
    await prisma.emailContact.update({ where: { id: c.id }, data: { tags: { set: tags } } });
    updated++;
  }
  return { updated };
}

/** Bulk subscribe-status / block change across selected contacts (or a filter). */
export async function bulkUpdateContacts(input: {
  contactIds?: string[];
  filter?: ListContactsOpts;
  subscribeStatus?: EmailSubscribeStatus;
  isBlocked?: boolean;
}) {
  const where: Prisma.EmailContactWhereInput = input.contactIds?.length
    ? { id: { in: input.contactIds } }
    : buildContactWhere(input.filter ?? {});
  const data: Prisma.EmailContactUpdateManyMutationInput = {};
  if (input.subscribeStatus) {
    data.subscribeStatus = input.subscribeStatus;
    if (input.subscribeStatus === 'UNSUBSCRIBED') data.unsubscribedAt = new Date();
    if (input.subscribeStatus === 'SUBSCRIBED') data.subscribedAt = new Date();
  }
  if (input.isBlocked !== undefined) data.isBlocked = input.isBlocked;
  if (Object.keys(data).length === 0) return { updated: 0 };
  const res = await prisma.emailContact.updateMany({ where, data });
  return { updated: res.count };
}

/** Bulk delete selected contacts (or a filter). */
export async function bulkDeleteContacts(input: {
  contactIds?: string[];
  filter?: ListContactsOpts;
}) {
  const where: Prisma.EmailContactWhereInput = input.contactIds?.length
    ? { id: { in: input.contactIds } }
    : buildContactWhere(input.filter ?? {});
  const res = await prisma.emailContact.deleteMany({ where });
  return { deleted: res.count };
}

/** Upsert a contact by email (used by import + inbound reply resolution). */
export async function upsertContactByEmail(
  email: string,
  data: {
    name?: string | null;
    userId?: string | null;
    tags?: string[];
    subscribeSource?: string | null;
    attributes?: Prisma.InputJsonValue;
  } = {}
) {
  const normalized = normalizeEmail(email);
  return prisma.emailContact.upsert({
    where: { email: normalized },
    update: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.userId !== undefined ? { userId: data.userId } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
    },
    create: {
      email: normalized,
      name: data.name ?? null,
      userId: data.userId ?? null,
      tags: data.tags ?? [],
      subscribeSource: data.subscribeSource ?? 'reply',
      subscribeStatus: 'SUBSCRIBED',
      subscribedAt: new Date(),
      attributes: data.attributes,
    },
  });
}

// ---------------------------------------------------------------------------
// CSV import / export
// ---------------------------------------------------------------------------

/**
 * Import contacts from CSV text. Recognized columns: email (required), name,
 * tags (pipe/comma-separated), plus any other column folded into `attributes`.
 * Invalid/duplicate emails are skipped and reported.
 */
export async function importContactsCsv(
  text: string,
  opts: {
    tags?: string[];
    source?: string;
    subscribeStatus?: EmailSubscribeStatus;
    /** Map target field -> source CSV header (overrides the default email/name/tags detection). */
    mapping?: { email?: string; name?: string; tags?: string };
  } = {}
) {
  const rows = parseCsv(text);
  const status = opts.subscribeStatus ?? 'SUBSCRIBED';
  const source = opts.source ?? 'import';
  const emailCol = opts.mapping?.email?.toLowerCase();
  const nameCol = opts.mapping?.name?.toLowerCase();
  const tagsCol = opts.mapping?.tags?.toLowerCase();

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; email: string; reason: string }> = [];
  const seen = new Set<string>();
  const importedEmails: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = normalizeEmail(
      (emailCol ? row[emailCol] : row.email || row['email address']) || ''
    );
    if (!isValidEmail(email)) {
      skipped++;
      errors.push({ row: i + 2, email, reason: 'invalid email' });
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);

    const name = (nameCol ? row[nameCol] : row.name) || null;
    const rowTags = ((tagsCol ? row[tagsCol] : row.tags) || '')
      .split(/[|,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = Array.from(new Set([...(opts.tags ?? []), ...rowTags]));

    const known = new Set(
      ['email', 'email address', 'name', 'tags', emailCol, nameCol, tagsCol].filter(
        Boolean
      ) as string[]
    );
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!known.has(k) && v) attributes[k] = v;
    }

    await prisma.emailContact.upsert({
      where: { email },
      update: {
        ...(name ? { name } : {}),
        ...(tags.length ? { tags: { set: tags } } : {}),
        ...(Object.keys(attributes).length
          ? { attributes: attributes as Prisma.InputJsonValue }
          : {}),
      },
      create: {
        email,
        name,
        tags,
        subscribeStatus: status,
        subscribeSource: source,
        subscribedAt: status === 'SUBSCRIBED' ? new Date() : null,
        consentEvidence: {
          source,
          method: 'import',
          at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        attributes: Object.keys(attributes).length
          ? (attributes as Prisma.InputJsonValue)
          : undefined,
      },
    });
    imported++;
    importedEmails.push(email);
  }

  return {
    imported,
    skipped,
    errors: errors.slice(0, 100),
    total: rows.length,
    emails: importedEmails,
  };
}

/**
 * Structured import — for rows already parsed client-side from CSV/XLSX/JSON/vCard.
 * Same validation/dedup/consent semantics as the CSV path.
 */
export async function importContactRows(
  rows: Array<{ email: string; name?: string | null; tags?: string[] }>,
  opts: { tags?: string[]; source?: string; subscribeStatus?: EmailSubscribeStatus } = {}
) {
  const status = opts.subscribeStatus ?? 'SUBSCRIBED';
  const source = opts.source ?? 'import';
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; email: string; reason: string }> = [];
  const seen = new Set<string>();
  const importedEmails: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const email = normalizeEmail(rows[i].email || '');
    if (!isValidEmail(email)) {
      skipped++;
      errors.push({ row: i + 1, email, reason: 'invalid email' });
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);

    const name = rows[i].name?.trim() || null;
    const tags = Array.from(
      new Set([...(opts.tags ?? []), ...(rows[i].tags ?? [])].map((t) => t.trim()).filter(Boolean))
    );

    await prisma.emailContact.upsert({
      where: { email },
      update: {
        ...(name ? { name } : {}),
        ...(tags.length ? { tags: { set: tags } } : {}),
      },
      create: {
        email,
        name,
        tags,
        subscribeStatus: status,
        subscribeSource: source,
        subscribedAt: status === 'SUBSCRIBED' ? new Date() : null,
        consentEvidence: {
          source,
          method: 'import',
          at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    imported++;
    importedEmails.push(email);
  }
  return {
    imported,
    skipped,
    errors: errors.slice(0, 100),
    total: rows.length,
    emails: importedEmails,
  };
}

/** Export contacts matching a filter as CSV text. */
export async function exportContactsCsv(filter: ListContactsOpts): Promise<string> {
  const where = buildContactWhere(filter);
  const contacts = await prisma.emailContact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_PLATFORM_AUDIENCE,
  });
  const rows = contacts.map((c) => ({
    email: c.email,
    name: c.name ?? '',
    subscribeStatus: c.subscribeStatus,
    tags: c.tags.join('|'),
    onPlatform: c.userId ? 'yes' : 'no',
    lastEmailedAt: c.lastEmailedAt?.toISOString() ?? '',
    createdAt: c.createdAt.toISOString(),
  }));
  return formatCsv(
    ['email', 'name', 'subscribeStatus', 'tags', 'onPlatform', 'lastEmailedAt', 'createdAt'],
    rows
  );
}

// ---------------------------------------------------------------------------
// DPDP erase
// ---------------------------------------------------------------------------

/** Right-to-erasure: scrub PII, suppress, and detach the platform link. */
export async function eraseContact(id: string) {
  const contact = await prisma.emailContact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Contact not found', 404, 'EMAIL_CONTACT_NOT_FOUND');
  await prisma.emailSuppression
    .upsert({
      where: { email: contact.email },
      update: { reason: 'erasure' },
      create: { email: contact.email, reason: 'erasure', source: 'dpdp' },
    })
    .catch(() => {});
  return prisma.emailContact.update({
    where: { id },
    data: {
      name: null,
      attributes: Prisma.JsonNull,
      consentEvidence: Prisma.JsonNull,
      userId: null,
      subscribeStatus: 'UNSUBSCRIBED',
      unsubscribedAt: new Date(),
      isBlocked: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Platform users → contacts
// ---------------------------------------------------------------------------

export interface PlatformUserOpts {
  roles?: Role[];
  verifiedOnly?: boolean;
  activeOnly?: boolean;
  q?: string;
  userIds?: string[]; // restrict to specific platform users (row multi-select)
  page?: number;
  limit?: number;
}

function buildPlatformUserWhere(opts: PlatformUserOpts): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (opts.roles?.length) where.role = { in: opts.roles };
  if (opts.userIds?.length) where.id = { in: opts.userIds };
  if (opts.verifiedOnly) where.isEmailVerified = true;
  if (opts.activeOnly !== false) {
    where.isActive = true;
    where.isSuspended = false;
  }
  if (opts.q) {
    const q = opts.q.trim();
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** Paginated list of platform users eligible for email (audience picker). */
export async function listPlatformUsers(opts: PlatformUserOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = buildPlatformUserWhere(opts);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items: users, total, page, limit };
}

/** Count platform users matching a role filter (audience size preview). */
export async function countPlatformUsers(opts: PlatformUserOpts): Promise<number> {
  return prisma.user.count({ where: buildPlatformUserWhere(opts) });
}

/** Export platform users matching a filter as CSV text. */
export async function exportPlatformUsersCsv(opts: PlatformUserOpts): Promise<string> {
  const users = await prisma.user.findMany({
    where: buildPlatformUserWhere(opts),
    select: {
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_PLATFORM_AUDIENCE,
  });
  const rows = users.map((u) => ({
    email: u.email,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim(),
    role: u.role,
    verified: u.isEmailVerified ? 'yes' : 'no',
    createdAt: u.createdAt.toISOString(),
  }));
  return formatCsv(['email', 'name', 'role', 'verified', 'createdAt'], rows);
}

/**
 * Ensure EmailContact rows exist (and are linked) for platform users matching
 * a filter, then return them. Chunked upserts keep memory + DB load bounded.
 */
export async function syncPlatformContacts(opts: PlatformUserOpts): Promise<string[]> {
  const where = buildPlatformUserWhere(opts);
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true, firstName: true, lastName: true },
    take: MAX_PLATFORM_AUDIENCE,
  });
  const contactIds: string[] = [];
  const CHUNK = 100;
  for (let i = 0; i < users.length; i += CHUNK) {
    const slice = users.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((u) => {
        const email = normalizeEmail(u.email);
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || null;
        return prisma.emailContact
          .upsert({
            where: { email },
            update: { userId: u.id, ...(name ? { name } : {}) },
            create: {
              email,
              name,
              userId: u.id,
              subscribeStatus: 'SUBSCRIBED',
              subscribeSource: 'platform',
              subscribedAt: new Date(),
            },
            select: { id: true },
          })
          .catch(() => null);
      })
    );
    for (const r of results) if (r) contactIds.push(r.id);
  }
  return contactIds;
}

// ---------------------------------------------------------------------------
// Audience resolution (segment / manual / platform / upload)
// ---------------------------------------------------------------------------

export interface AudienceFilter {
  tags?: string[];
  subscribeStatus?: EmailSubscribeStatus;
  onPlatform?: boolean;
  roles?: Role[];
  verifiedOnly?: boolean;
  userIds?: string[]; // specific platform users (row multi-select add-to-set)
  emails?: string[];
  contactIds?: string[];
  setId?: string; // static-set audience (carried in audienceFilter for campaigns)
  tag?: string;
  // Engagement predicates (re-engagement / active-audience segments)
  openedSince?: string; // ISO — lastOpenedAt >= this
  clickedSince?: string; // ISO — lastClickedAt >= this
  notEmailedSince?: string; // ISO — never emailed OR lastEmailedAt < this
  maxBounceCount?: number; // exclude chronically bouncing contacts
}

export interface ResolveAudienceInput {
  audienceType: string; // segment | set | manual | platform | upload
  audienceFilter?: AudienceFilter | null;
  segmentId?: string | null;
  setId?: string | null;
}

/** Translate a saved-segment/inline filter into a Prisma contact `where`. */
function contactWhereFromFilter(filter: AudienceFilter): Prisma.EmailContactWhereInput {
  const where: Prisma.EmailContactWhereInput = {};
  const and: Prisma.EmailContactWhereInput[] = [];
  if (filter.tags?.length) and.push({ tags: { hasSome: filter.tags } });
  if (filter.tag) and.push({ tags: { has: filter.tag } });
  if (filter.subscribeStatus) where.subscribeStatus = filter.subscribeStatus;
  if (filter.onPlatform === true) where.userId = { not: null };
  if (filter.onPlatform === false) where.userId = null;
  if (filter.roles?.length) {
    and.push({ user: { role: { in: filter.roles } } });
  }
  if (filter.openedSince) and.push({ lastOpenedAt: { gte: new Date(filter.openedSince) } });
  if (filter.clickedSince) and.push({ lastClickedAt: { gte: new Date(filter.clickedSince) } });
  if (filter.notEmailedSince) {
    and.push({
      OR: [{ lastEmailedAt: null }, { lastEmailedAt: { lt: new Date(filter.notEmailedSince) } }],
    });
  }
  if (typeof filter.maxBounceCount === 'number')
    and.push({ bounceCount: { lte: filter.maxBounceCount } });
  if (and.length) where.AND = and;
  return where;
}

/**
 * Resolve a campaign audience to a de-duplicated array of EmailContact ids.
 * For `platform` audiences the matching platform users are first upserted into
 * EmailContact so every recipient has a stable contact row.
 */
export async function resolveAudienceContactIds(input: ResolveAudienceInput): Promise<string[]> {
  const type = input.audienceType;
  let filter: AudienceFilter = input.audienceFilter ?? {};

  if (type === 'segment') {
    if (!input.segmentId)
      throw new AppError('A segment is required', 400, 'EMAIL_SEGMENT_REQUIRED');
    const segment = await prisma.emailSegment.findUnique({ where: { id: input.segmentId } });
    if (!segment) throw new AppError('Segment not found', 404, 'EMAIL_SEGMENT_NOT_FOUND');
    filter = (segment.filter as AudienceFilter) ?? {};
  }

  if (type === 'set') {
    const setId = input.setId ?? filter.setId;
    if (!setId) throw new AppError('A set is required', 400, 'EMAIL_SET_REQUIRED');
    const members = await prisma.emailContactSetMember.findMany({
      where: { setId },
      select: { contactId: true },
      take: MAX_PLATFORM_AUDIENCE,
    });
    return members.map((m) => m.contactId);
  }

  if (type === 'manual') {
    const ids = new Set<string>(filter.contactIds ?? []);
    if (filter.emails?.length) {
      for (const raw of filter.emails) {
        const c = await upsertContactByEmail(raw, { subscribeSource: 'manual' }).catch(() => null);
        if (c) ids.add(c.id);
      }
    }
    return Array.from(ids);
  }

  if (type === 'platform') {
    return syncPlatformContacts({
      roles: filter.roles,
      verifiedOnly: filter.verifiedOnly,
      userIds: filter.userIds,
      activeOnly: true,
    });
  }

  // A role/on-platform segment must include platform users not yet synced into
  // EmailContact — upsert them first so role-based custom sets are complete.
  if (filter.roles?.length || filter.onPlatform === true) {
    await syncPlatformContacts({
      roles: filter.roles,
      verifiedOnly: filter.verifiedOnly,
      activeOnly: true,
    }).catch(() => {});
  }

  // segment | upload | (inline filter) — query EmailContact directly
  const where = contactWhereFromFilter(filter);
  const rows = await prisma.emailContact.findMany({
    where,
    select: { id: true },
    take: MAX_PLATFORM_AUDIENCE,
  });
  return rows.map((r) => r.id);
}

/**
 * Per-contact activity timeline (opens/clicks/bounces/complaints/unsubscribes)
 * + campaign send history — powers the contact detail view.
 */
export async function getContactTimeline(id: string) {
  const contact = await prisma.emailContact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Contact not found', 404, 'EMAIL_CONTACT_NOT_FOUND');
  const [events, recipients] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        eventType: true,
        campaignId: true,
        url: true,
        bounceType: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.emailCampaignRecipient.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        openCount: true,
        clickCount: true,
        sentAt: true,
        bouncedAt: true,
        campaign: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { contact, events, campaigns: recipients };
}

/** DPDP/GDPR subject-access export: the contact's full record + events + consent. */
export async function exportContactData(id: string) {
  const { contact, events, campaigns } = await getContactTimeline(id);
  const unsubscribes = await prisma.emailUnsubscribe.findMany({
    where: { email: contact.email },
    orderBy: { createdAt: 'desc' },
  });
  return {
    exportedAt: new Date().toISOString(),
    contact,
    consentEvidence: contact.consentEvidence,
    subscription: {
      status: contact.subscribeStatus,
      subscribedAt: contact.subscribedAt,
      unsubscribedAt: contact.unsubscribedAt,
      source: contact.subscribeSource,
    },
    events,
    campaigns,
    unsubscribes,
  };
}

/** Cheap audience-size preview without materializing recipients. */
export async function previewAudienceSize(input: ResolveAudienceInput): Promise<number> {
  const type = input.audienceType;
  let filter: AudienceFilter = input.audienceFilter ?? {};
  if (type === 'segment' && input.segmentId) {
    const segment = await prisma.emailSegment.findUnique({ where: { id: input.segmentId } });
    filter = (segment?.filter as AudienceFilter) ?? {};
  }
  if (type === 'manual') {
    return (filter.contactIds?.length ?? 0) + (filter.emails?.length ?? 0);
  }
  if (type === 'platform') {
    return countPlatformUsers({ roles: filter.roles, verifiedOnly: filter.verifiedOnly });
  }
  return prisma.emailContact.count({ where: contactWhereFromFilter(filter) });
}
