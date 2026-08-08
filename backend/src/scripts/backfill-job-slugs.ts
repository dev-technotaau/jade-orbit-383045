/**
 * Backfill `JobPost.slug` for every existing row that doesn't have one
 * yet. Idempotent — safe to re-run.
 *
 * Run AFTER `backfill-company-slugs.ts` because job slugs incorporate
 * the company slug for SEO friendliness.
 *
 *   npx ts-node src/scripts/backfill-job-slugs.ts
 *
 * Each generated slug ends in an 8-char shortid, so cross-row collisions
 * are virtually impossible — no DB pre-check needed beyond the unique
 * index, which would surface a P2002 we retry transparently.
 */
import dotenv from 'dotenv';
dotenv.config();

import { Prisma } from '@prisma/client';
import { prisma, disconnectPrisma } from '../config/prisma';
import { buildJobSlug } from '../lib/slugs';
import logger from '../config/logger';

const BATCH_SIZE = 500;
const MAX_COLLISION_RETRIES = 5;

async function main() {
  let totalUpdated = 0;
  let totalSkipped = 0;
  let cursorId: string | undefined;

  while (true) {
    const batch = await prisma.jobPost.findMany({
      where: { slug: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        location: true,
        company: { select: { companyName: true, slug: true } },
      },
    });
    if (batch.length === 0) break;

    for (const job of batch) {
      let attempt = 0;
      let succeeded = false;
      while (attempt < MAX_COLLISION_RETRIES && !succeeded) {
        const slug = buildJobSlug({
          title: job.title,
          companyName: job.company?.companyName,
          companySlug: job.company?.slug,
          city: job.location,
        });
        try {
          await prisma.jobPost.update({
            where: { id: job.id },
            data: { slug },
          });
          succeeded = true;
          totalUpdated += 1;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            attempt += 1;
            logger.warn(`slug collision retry ${attempt} for job ${job.id}`);
            continue;
          }
          logger.error(`backfill-job-slugs — failed for ${job.id}`, err);
          totalSkipped += 1;
          break;
        }
      }
      if (!succeeded && attempt >= MAX_COLLISION_RETRIES) {
        logger.error(`backfill-job-slugs — gave up after ${attempt} retries on ${job.id}`);
        totalSkipped += 1;
      }
      if (totalUpdated % 200 === 0 && totalUpdated > 0) {
        logger.info(`backfill-job-slugs — ${totalUpdated} updated`);
      }
    }

    cursorId = batch[batch.length - 1].id;
  }

  logger.info(`backfill-job-slugs — done. Updated: ${totalUpdated}, skipped: ${totalSkipped}.`);
}

main()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('backfill-job-slugs — fatal', err);
    await disconnectPrisma();
    process.exit(1);
  });
