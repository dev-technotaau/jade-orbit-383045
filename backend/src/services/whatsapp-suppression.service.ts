import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { waSuppressionCheckFailuresTotal } from '../utils/whatsapp-metrics';
import { markContactsSuppressed, normalizeWaPhone } from './whatsapp-contact.service';

/*
 * Suppression list — phones that must never receive a campaign, regardless of
 * opt-in status. Maintained out-of-band (manual blocklist, complaints, hard
 * bounces) and consulted by the campaign audience materializer.
 */

export interface SuppressionListFilters {
  page?: number;
  limit?: number;
  /** Substring match on the phone number (already E.164 at rest). */
  q?: string;
}

/** Shared where-builder for the paged list and the CSV export. */
function buildSuppressionWhere(filters: SuppressionListFilters): Prisma.WaSuppressionWhereInput {
  const q = (filters.q ?? '').trim();
  if (!q) return {};
  // Search on the DIGITS the operator typed, not the raw string: a compliance
  // officer pastes "+91 98765 43210" or "098765 43210" out of a DNC notice, and
  // neither matches the stored "+919876543210" as a literal substring.
  const digits = q.replace(/[^\d]/g, '');
  return {
    OR: [
      { phone: { contains: q } },
      ...(digits ? [{ phone: { contains: digits } }] : []),
      { reason: { contains: q, mode: 'insensitive' as const } },
    ],
  };
}

/**
 * One page of the suppression list.
 *
 * This used to return the WHOLE table with no take, no skip and no filter. One
 * "select all matching → Suppress" on the contacts page can push six figures of
 * rows in here, and the settings page that renders this list then serialised
 * every one of them into a single table — permanently unusable, on the one page
 * a compliance operator needs. Paged and searchable, like the contacts list.
 */
export async function listSuppressions(filters: SuppressionListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const where = buildSuppressionWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.waSuppression.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waSuppression.count({ where }),
  ]);
  // Who each number belongs to, when we hold a contact for it.
  //
  // The table showed a bare phone number with nothing linking it back, so
  // "which customer is this and why did we suppress them?" meant copying the
  // digits into the contacts search by hand. Resolved one page at a time through
  // the unique phone index; a suppressed number with no contact row (a supplied
  // DNC list) simply comes back null.
  const phones = rows.map((r) => r.phone);
  const contacts = phones.length
    ? await prisma.waContact.findMany({
        where: { phone: { in: phones } },
        select: { id: true, phone: true, name: true },
      })
    : [];
  const byPhone = new Map(contacts.map((c) => [c.phone, c]));
  const items = rows.map((r) => {
    const contact = byPhone.get(r.phone);
    return {
      ...r,
      contactId: contact?.id ?? null,
      contactName: contact?.name ?? null,
    };
  });
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Rows fetched per page of the streamed CSV export. */
const EXPORT_PAGE_SIZE = 1000;

/**
 * Every matching suppressed number, one page at a time, for the CSV export.
 *
 * Paged and uncapped. It used to be a single `findMany` with `take: 50_000`
 * whose rows the controller joined into one string: a deployment that has
 * absorbed a large supplied DNC list handed the auditor a file with no error, no
 * warning and no truncation marker, silently missing every number past the cap —
 * the worst possible failure for a compliance export, because the omission reads
 * as "we are allowed to message these people". The whole file also sat in the
 * Node heap at once.
 *
 * Keyset on `phone`, and ordered by it rather than by `createdAt`: the column
 * is `@unique` here, so it is the one column whose ordering the database itself
 * guarantees is total — no page can skip or repeat a row while numbers are being
 * added underneath the export, and the last page costs what the first one did.
 */
export async function* streamSuppressionsForExport(
  filters: SuppressionListFilters = {},
  pageSize = EXPORT_PAGE_SIZE
): AsyncGenerator<Array<{ phone: string; reason: string | null; createdAt: Date }>> {
  const where = buildSuppressionWhere(filters);
  let after: string | undefined;
  for (;;) {
    const page = await prisma.waSuppression.findMany({
      where: { AND: [where, ...(after ? [{ phone: { gt: after } }] : [])] },
      orderBy: { phone: 'asc' },
      take: pageSize,
      select: { phone: true, reason: true, createdAt: true },
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    after = page[page.length - 1].phone;
  }
}

/**
 * Bulk-add a supplied do-not-contact list.
 *
 * The only way in was the single phone+reason form, so loading a legally
 * supplied DNC list meant typing it one number at a time. Phones are normalized
 * to the same E.164 identity the send path checks against, deduplicated in
 * memory (a supplied list routinely repeats a number), and inserted with
 * `skipDuplicates` so re-uploading the same file is a no-op rather than a P2002.
 */
export async function importSuppressions(input: {
  phones: string[];
  reason?: string | null;
  createdBy?: string | null;
}): Promise<{ added: number; duplicates: number; skipped: number }> {
  const seen = new Set<string>();
  let skipped = 0;
  for (const raw of input.phones) {
    const phone = normalizeWaPhone(raw);
    // Same floor as the contact import: fewer than 8 digits is not a number
    // anybody can be messaged on, and silently suppressing "12" helps no one.
    if (phone.replace(/[^\d]/g, '').length < 8) {
      skipped += 1;
      continue;
    }
    seen.add(phone);
  }
  const phones = [...seen];
  if (phones.length === 0) return { added: 0, duplicates: 0, skipped };

  const created = await prisma.waSuppression.createMany({
    data: phones.map((phone) => ({
      phone,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    })),
    skipDuplicates: true,
  });
  // Mirror onto the contact rows so the contacts page can show — and filter on —
  // who is suppressed. Without it the operator loads a DNC list and the people
  // on it keep displaying as OPTED IN.
  await markContactsSuppressed(phones, true);
  return {
    added: created.count,
    duplicates: phones.length - created.count,
    skipped,
  };
}

/**
 * Add (or refresh) a suppressed phone. Phone is normalized to E.164 and upserted
 * by its unique `phone`, so re-adding an existing number just updates its reason.
 */
export async function addSuppression(input: {
  phone: string;
  reason?: string | null;
  createdBy?: string | null;
}) {
  const phone = normalizeWaPhone(input.phone);
  const row = await prisma.waSuppression.upsert({
    where: { phone },
    update: {
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
    create: {
      phone,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
  await markContactsSuppressed([phone], true);
  return row;
}

export async function removeSuppression(id: string) {
  const row = await prisma.waSuppression.delete({ where: { id } });
  // Clearing the mirror is the half that makes un-suppressing visible: the row
  // is gone but the contact would keep showing the Suppressed chip, and the
  // "suppressed" filter would keep returning them, until something else touched
  // it.
  await markContactsSuppressed([row.phone], false);
  return row;
}

/** How many suppressed phones to read at a time when walking the list. */
const SUPPRESSION_PAGE_SIZE = 1000;

/**
 * Which of these phones are suppressed, as a Set for O(1) membership checks.
 *
 * Callers used to load the ENTIRE suppression table into a Set on every campaign
 * preview and every launch — a full table scan whose cost grew with the
 * blocklist even when the audience being checked was a single page of contacts.
 * Bounded by the caller's page and served by the unique phone index instead.
 * Phones are already normalized at write time.
 */
export async function getSuppressedPhonesIn(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await prisma.waSuppression.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  });
  return new Set(rows.map((r) => r.phone));
}

/**
 * Walk the suppression list one page at a time, keyset-paged on the primary key.
 *
 * For the campaign audience anti-join: the blocklist is small and
 * operator-curated, so intersecting it page by page with a (potentially huge)
 * audience is the cheap direction to run that comparison in.
 */
export async function forEachSuppressedPhonePage(
  fn: (phones: string[]) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.waSuppression.findMany({
      select: { id: true, phone: true },
      orderBy: { id: 'asc' },
      take: SUPPRESSION_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    await fn(rows.map((r) => r.phone));
    if (rows.length < SUPPRESSION_PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
}

/**
 * Non-reversible, stable id for a phone.
 *
 * A fail-open event has to name WHICH number got through or it cannot be
 * investigated, but the logger's PII redaction exists precisely so customer
 * numbers do not sit in the log stream. Hashing gives both: a compliance
 * officer hashes the number from the complaint and greps for it.
 */
function phoneFingerprint(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16);
}

/**
 * Is this phone on the do-not-contact list?
 *
 * The list was only ever consulted when a campaign audience was materialized —
 * i.e. once, possibly days before the campaign ran, and never for the drip,
 * scheduled-message, one-off template or bridge paths at all. A number added to
 * the list after materialization (a complaint, a legal request) kept receiving
 * messages from every already-built campaign. "Must never receive a campaign,
 * regardless of opt-in status" has to be enforced at the send, not at the plan.
 *
 * Indexed unique lookup, so this is cheap enough to run per send.
 */
export async function isSuppressed(phone: string | null | undefined): Promise<boolean> {
  if (!phone) return false;
  const normalized = normalizeWaPhone(phone);
  if (!normalized) return false;
  try {
    const hit = await prisma.waSuppression.findUnique({
      where: { phone: normalized },
      select: { id: true },
    });
    return hit != null;
  } catch (err) {
    // Fail OPEN deliberately: a database blip must not silently halt every
    // send. The materializer's list check still applies.
    //
    // But failing open means a message to a do-not-contact number may have just
    // gone out, and that is a compliance event, not a debug detail — so it is
    // counted and logged at error level with the number's fingerprint. Silently
    // returning false left an operator with no way to ever discover it.
    waSuppressionCheckFailuresTotal.inc();
    logger.error(
      `Suppression check FAILED OPEN for ${phoneFingerprint(normalized)} — a do-not-contact ` +
        `send may have been allowed through: ${(err as Error)?.message ?? String(err)}`
    );
    return false;
  }
}
