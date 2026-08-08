/**
 * One-time Backfill Script: Sync all active jobs to Google Cloud Talent
 *
 * This script reads all OPEN jobs from PostgreSQL and syncs them to the
 * Cloud Talent index. Existing Cloud Talent data is NOT removed — jobs
 * that already exist (same requisitionId) are skipped.
 *
 * Usage: npx dotenv -- ts-node src/scripts/backfill-cloud-talent.ts
 */

import { JobStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { jobClient, ensureTalentCompany } from '../config/talent';
import { env } from '../config/env';

const BATCH_SIZE = 50;
const DELAY_MS = 200; // Rate-limit between batches

function getTenantName(): string {
  const tenantId = env.CLOUD_TALENT_TENANT_ID || 'default-tenant';
  return `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/tenants/${tenantId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfill() {
  console.log('=== Cloud Talent Backfill Script ===\n');

  if (!jobClient) {
    console.error(
      'Cloud Talent client not initialized. Check GOOGLE_CLOUD_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT env vars.'
    );
    process.exit(1);
  }

  if (!env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error('GOOGLE_CLOUD_PROJECT_ID is not set.');
    process.exit(1);
  }

  const parent = getTenantName();
  console.log(`Tenant: ${parent}`);

  // Count total active jobs
  const totalCount = await prisma.jobPost.count({ where: { status: JobStatus.OPEN } });
  console.log(`Found ${totalCount} active jobs to sync.\n`);

  if (totalCount === 0) {
    console.log('No active jobs to sync. Done.');
    process.exit(0);
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let cursor: string | undefined;

  while (true) {
    const jobs = await prisma.jobPost.findMany({
      where: { status: JobStatus.OPEN },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        type: true,
        skillsRequired: true,
        companyId: true,
        company: { select: { companyName: true } },
      },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        // Ensure the company exists in Cloud Talent
        const companyExternalId = job.companyId || 'default-company';
        const companyDisplayName = job.company?.companyName || 'Unknown Company';
        const companyName = await ensureTalentCompany(
          parent,
          companyExternalId,
          companyDisplayName
        );

        if (!companyName) {
          failed++;
          console.error(
            `\n  Failed to sync job ${job.id}: could not resolve company in Cloud Talent`
          );
          continue;
        }

        await jobClient.createJob({
          parent,
          job: {
            company: companyName,
            requisitionId: job.id,
            title: job.title,
            description: job.description || job.title,
            addresses: job.location ? [job.location] : [],
            customAttributes: {
              skills: {
                stringValues: job.skillsRequired,
                filterable: true,
              },
            },
          },
        });
        synced++;
        process.stdout.write(
          `\r  Progress: ${synced + skipped + failed}/${totalCount} (synced: ${synced}, skipped: ${skipped}, failed: ${failed})`
        );
      } catch (error: any) {
        if (error?.code === 6 || error?.message?.includes('ALREADY_EXISTS')) {
          // Job already exists in Cloud Talent — skip without removing
          skipped++;
          process.stdout.write(
            `\r  Progress: ${synced + skipped + failed}/${totalCount} (synced: ${synced}, skipped: ${skipped}, failed: ${failed})`
          );
        } else {
          failed++;
          console.error(`\n  Failed to sync job ${job.id}: ${error?.message || error}`);
        }
      }
    }

    cursor = jobs[jobs.length - 1].id;

    // Rate-limit to avoid hitting Cloud Talent API quotas
    if (jobs.length === BATCH_SIZE) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n\n=== Backfill Complete ===`);
  console.log(`  Synced:  ${synced}`);
  console.log(`  Skipped: ${skipped} (already existed)`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${synced + skipped + failed}/${totalCount}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

backfill().catch((error) => {
  console.error('\nBackfill script crashed:', error);
  process.exit(1);
});
