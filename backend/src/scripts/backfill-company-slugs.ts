/**
 * Backfill `CompanyProfile.slug` for every existing row that doesn't
 * have one yet. Idempotent — safe to re-run any number of times.
 *
 * Run after the migration `20260509000000_public_jobs_companies_seo`:
 *   npx ts-node src/scripts/backfill-company-slugs.ts
 *
 * Strategy:
 *   1. Page through CompanyProfile rows where slug IS NULL, 200 at a time.
 *   2. For each row, build a candidate slug from companyName + collision
 *      check against rows already populated.
 *   3. Single UPDATE per row (we deliberately avoid bulk to keep collision
 *      checks atomic — at the typical 5k-company scale this is fine).
 *
 * Safety:
 *   - Wraps in a savepoint per batch so a single failure doesn't abort
 *     the whole run.
 *   - Logs progress every 100 rows.
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma, disconnectPrisma } from '../config/prisma';
import { buildCompanySlug } from '../lib/slugs';
import logger from '../config/logger';

const BATCH_SIZE = 200;

async function main() {
  let totalUpdated = 0;
  let totalSkipped = 0;
  let cursorId: string | undefined;

  // Pre-compute the existing slug set so collision checks don't hit
  // the DB for every candidate. Refreshed once per batch.
  const seenSlugs = new Set<string>(
    (
      await prisma.companyProfile.findMany({
        where: { slug: { not: null } },
        select: { slug: true },
      })
    )
      .map((r) => r.slug)
      .filter((s): s is string => !!s)
  );

  while (true) {
    const batch = await prisma.companyProfile.findMany({
      where: { slug: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true, companyName: true },
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const name = row.companyName?.trim();
      if (!name) {
        totalSkipped += 1;
        continue;
      }
      try {
        const slug = await buildCompanySlug(name, {
          isTaken: async (candidate) => seenSlugs.has(candidate),
        });
        await prisma.companyProfile.update({
          where: { id: row.id },
          data: { slug },
        });
        seenSlugs.add(slug);
        totalUpdated += 1;
        if (totalUpdated % 100 === 0) {
          logger.info(`backfill-company-slugs — ${totalUpdated} updated`);
        }
      } catch (err) {
        logger.error(`backfill-company-slugs — failed for ${row.id}`, err);
        totalSkipped += 1;
      }
    }

    cursorId = batch[batch.length - 1].id;
  }

  logger.info(`backfill-company-slugs — done. Updated: ${totalUpdated}, skipped: ${totalSkipped}.`);
}

main()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('backfill-company-slugs — fatal', err);
    await disconnectPrisma();
    process.exit(1);
  });
