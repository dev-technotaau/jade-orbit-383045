/**
 * Search-history service.
 *
 * Backs the chip-strip on the homepage hero, the listing-page chip
 * carousel, and the candidate dashboard "recent searches" widget.
 *
 * Distinct from `SavedSearch` (which is an explicit, user-named save):
 *   - SearchHistory auto-records every search the user runs.
 *   - SearchHistory dedupes by `filtersHash` so re-running the same
 *     filter set increments `hits` and bumps `updatedAt` instead of
 *     creating a new row.
 *   - SearchHistory supports guest sessions (sessionId → cookie).
 *
 * On login, `migrateGuestHistory(sessionId, userId)` merges the guest
 * rows into the user's history (dedup by filtersHash).
 */
import crypto from 'node:crypto';
import { prisma } from '../config/prisma';
import type { SearchHistoryType } from '@prisma/client';
import logger from '../config/logger';

// Cap entries per (user/session) — anything older gets pruned by a
// background job. Keeps the chip carousel fast and the table small.
const MAX_ENTRIES_PER_OWNER = 50;

// ─── Canonical hash helpers ────────────────────────────────────────────

/**
 * Build a deterministic JSON string from a filter blob — keys sorted,
 * nested objects sorted recursively, undefined/empty values stripped.
 * Two equivalent searches produce the same string regardless of input
 * ordering.
 */
function canonicalJsonString(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonString).join(',')}]`;
  }
  const keys = Object.keys(value as object).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || v === '' || v === null) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJsonString(v)}`);
  }
  return `{${parts.join(',')}}`;
}

export function computeFiltersHash(filters: unknown): string {
  return crypto.createHash('sha256').update(canonicalJsonString(filters)).digest('hex');
}

// ─── Public API ────────────────────────────────────────────────────────

export interface RecordSearchInput {
  userId?: string;
  sessionId?: string;
  searchType: SearchHistoryType;
  filters: Record<string, unknown>;
  query?: string;
  location?: string;
  resultsCount?: number;
}

/**
 * Record a search. Idempotent on (owner, type, filtersHash) — increments
 * `hits` + bumps `lastSeenAt`/`updatedAt` if the same filter set was
 * recorded before. Also enforces the per-owner cap by pruning the
 * oldest rows over MAX_ENTRIES_PER_OWNER.
 */
export async function recordSearch(input: RecordSearchInput) {
  if (!input.userId && !input.sessionId) {
    // Without an owner, there's no chip to display anyway. Skip.
    return null;
  }
  const filtersHash = computeFiltersHash(input.filters);
  const now = new Date();

  // Deterministic upsert on the matching unique constraint.
  const baseData = {
    searchType: input.searchType,
    filters: input.filters as object,
    filtersHash,
    query: input.query ?? null,
    location: input.location ?? null,
    resultsCount: input.resultsCount ?? 0,
    lastSeenAt: now,
  };

  let row;
  if (input.userId) {
    row = await prisma.searchHistory.upsert({
      where: {
        user_unique_search: {
          userId: input.userId,
          searchType: input.searchType,
          filtersHash,
        },
      },
      create: { ...baseData, userId: input.userId },
      update: {
        ...baseData,
        hits: { increment: 1 },
      },
    });
  } else {
    row = await prisma.searchHistory.upsert({
      where: {
        session_unique_search: {
          sessionId: input.sessionId!,
          searchType: input.searchType,
          filtersHash,
        },
      },
      create: { ...baseData, sessionId: input.sessionId! },
      update: {
        ...baseData,
        hits: { increment: 1 },
      },
    });
  }

  // Prune stale entries beyond the cap (best-effort, fire-and-forget).
  pruneOverCap({ userId: input.userId, sessionId: input.sessionId }).catch((err) =>
    logger.warn('search-history prune failed', err)
  );

  return row;
}

async function pruneOverCap(owner: { userId?: string; sessionId?: string }) {
  const ownerWhere = owner.userId ? { userId: owner.userId } : { sessionId: owner.sessionId };
  const overflow = await prisma.searchHistory.findMany({
    where: ownerWhere,
    orderBy: { lastSeenAt: 'desc' },
    skip: MAX_ENTRIES_PER_OWNER,
    select: { id: true },
  });
  if (overflow.length === 0) return;
  await prisma.searchHistory.deleteMany({
    where: { id: { in: overflow.map((r) => r.id) } },
  });
}

export interface ListRecentInput {
  userId?: string;
  sessionId?: string;
  searchType: SearchHistoryType;
  limit?: number;
}

/**
 * Return the most-recent N searches for the chip carousel, each
 * enriched with a `newCount` delta — count of jobs (or companies)
 * matching the filters that were created/posted since `lastSeenAt`.
 */
export async function listRecent(input: ListRecentInput) {
  const limit = Math.min(input.limit ?? 12, 50);
  const ownerWhere = input.userId
    ? { userId: input.userId }
    : input.sessionId
      ? { sessionId: input.sessionId }
      : null;
  if (!ownerWhere) return [];

  const rows = await prisma.searchHistory.findMany({
    where: { ...ownerWhere, searchType: input.searchType },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
  });

  // Compute new-job-count delta for each row in parallel.
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const newCount = await deltaSinceForRow(r);
      return { ...r, newCount };
    })
  );
  return enriched;
}

/**
 * Count how many JobPosts (or Companies) match the saved filters and
 * have appeared since `lastSeenAt`. Cheap Prisma count — no ES round-trip.
 */
async function deltaSinceForRow(row: {
  searchType: SearchHistoryType;
  filters: unknown;
  lastSeenAt: Date;
  query: string | null;
  location: string | null;
}) {
  try {
    if (row.searchType === 'JOB') {
      // Build a minimal Prisma where clause from the filters blob. We
      // intentionally only honour a small subset here (location, query,
      // skills) for cheapness; the chip badge is a "fresh approximation"
      // not a perfect ES count.
      const where: any = {
        publicSearchable: true,
        status: 'OPEN',
        createdAt: { gt: row.lastSeenAt },
      };
      if (row.location) where.location = { contains: row.location, mode: 'insensitive' };
      if (row.query) {
        where.OR = [
          { title: { contains: row.query, mode: 'insensitive' } },
          { description: { contains: row.query, mode: 'insensitive' } },
        ];
      }
      return prisma.jobPost.count({ where });
    }
    if (row.searchType === 'COMPANY') {
      const where: any = {
        publicSearchable: true,
        createdAt: { gt: row.lastSeenAt },
      };
      if (row.query) {
        where.OR = [
          { companyName: { contains: row.query, mode: 'insensitive' } },
          { description: { contains: row.query, mode: 'insensitive' } },
        ];
      }
      return prisma.companyProfile.count({ where });
    }
    return 0;
  } catch (err) {
    logger.warn('deltaSinceForRow failed', err);
    return 0;
  }
}

export interface DeleteHistoryInput {
  id: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Delete a single chip from the user's history. Verifies ownership
 * via either userId or sessionId.
 */
export async function deleteEntry(input: DeleteHistoryInput) {
  const where: any = { id: input.id };
  if (input.userId) where.userId = input.userId;
  else if (input.sessionId) where.sessionId = input.sessionId;
  else return null;

  return prisma.searchHistory.deleteMany({ where });
}

/**
 * On login, merge guest history into the authenticated user's
 * history. Dedupes by (userId, type, filtersHash) — if the user
 * already has a row with the same filtersHash, we keep theirs and
 * delete the guest one (preserving their existing lastSeenAt and
 * hits counter).
 */
export async function migrateGuestHistory(sessionId: string, userId: string) {
  const guestRows = await prisma.searchHistory.findMany({
    where: { sessionId, userId: null },
  });
  if (guestRows.length === 0) return { migrated: 0, dedup: 0 };

  let migrated = 0;
  let dedup = 0;

  for (const row of guestRows) {
    const existing = await prisma.searchHistory.findFirst({
      where: {
        userId,
        searchType: row.searchType,
        filtersHash: row.filtersHash,
      },
    });
    if (existing) {
      // Already have it — bump existing + delete guest copy.
      await prisma.searchHistory.update({
        where: { id: existing.id },
        data: {
          hits: { increment: row.hits },
          lastSeenAt: row.lastSeenAt > existing.lastSeenAt ? row.lastSeenAt : existing.lastSeenAt,
        },
      });
      await prisma.searchHistory.delete({ where: { id: row.id } });
      dedup += 1;
    } else {
      await prisma.searchHistory.update({
        where: { id: row.id },
        data: { userId, sessionId: null },
      });
      migrated += 1;
    }
  }
  return { migrated, dedup };
}
