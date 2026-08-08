import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import { normalizeEmail, isValidEmail } from './email-contact.service';

/**
 * Do-not-contact suppression list — emails that must never receive a campaign,
 * regardless of subscribe status. Enforced PRE-SEND (the #1 reputation
 * protector for a self-hosted MTA with no ESP to auto-suppress). Populated by
 * hard bounces, complaints, unsubscribes, and manual blocklisting.
 */
export interface SuppressionFilter {
  q?: string;
  reason?: string;
}

export function buildSuppressionWhere(opts?: SuppressionFilter): Prisma.EmailSuppressionWhereInput {
  const where: Prisma.EmailSuppressionWhereInput = {};
  if (opts?.q) where.email = { contains: normalizeEmail(opts.q), mode: 'insensitive' };
  if (opts?.reason) where.reason = opts.reason;
  return where;
}

export async function listSuppressions(opts?: SuppressionFilter) {
  return prisma.emailSuppression.findMany({
    where: buildSuppressionWhere(opts),
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Add (or refresh) a suppressed email. Normalized + upserted by unique `email`,
 * so re-adding just updates the reason/source.
 */
export async function addSuppression(input: {
  email: string;
  reason?: string | null;
  source?: string | null;
  createdBy?: string | null;
}) {
  const email = normalizeEmail(input.email);
  return prisma.emailSuppression.upsert({
    where: { email },
    update: {
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
    create: {
      email,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
}

export async function removeSuppression(id: string) {
  return prisma.emailSuppression.delete({ where: { id } });
}

/**
 * Bulk import suppressed emails (paste / CSV rows). Normalized, validated, and
 * de-duplicated; upserted so re-importing just refreshes the reason.
 */
export async function importSuppressionRows(
  rows: Array<{ email: string; reason?: string | null }>,
  opts: { source?: string; createdBy?: string | null } = {}
): Promise<{ imported: number; skipped: number; total: number }> {
  const source = opts.source ?? 'import';
  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const email = normalizeEmail(row.email || '');
    if (!isValidEmail(email) || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    try {
      await prisma.emailSuppression.upsert({
        where: { email },
        update: { ...(row.reason ? { reason: row.reason } : {}) },
        create: {
          email,
          reason: row.reason ?? 'manual',
          source,
          createdBy: opts.createdBy ?? null,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped, total: rows.length };
}

/** Bulk remove suppressions by explicit ids OR a whole filter (select-all). */
export async function bulkRemoveSuppressions(input: {
  ids?: string[];
  filter?: SuppressionFilter;
}): Promise<{ deleted: number }> {
  const where: Prisma.EmailSuppressionWhereInput = input.ids?.length
    ? { id: { in: input.ids } }
    : buildSuppressionWhere(input.filter);
  const res = await prisma.emailSuppression.deleteMany({ where });
  return { deleted: res.count };
}

/** True if the given (already-normalized-or-not) email is suppressed. */
export async function isSuppressed(email: string): Promise<boolean> {
  const row = await prisma.emailSuppression.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  });
  return !!row;
}

/**
 * Load every suppressed email as a Set for O(1) membership checks during
 * campaign audience filtering. Emails are already normalized at write time.
 */
export async function getSuppressedEmailSet(): Promise<Set<string>> {
  const rows = await prisma.emailSuppression.findMany({ select: { email: true } });
  return new Set(rows.map((r) => r.email));
}
