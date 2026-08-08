import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { ES_REINDEX_QUEUE_NAME, type ReindexJobData } from './es-reindex.queue';
import { invalidateCache } from '../middleware/cache';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

export function createEsReindexWorker(): Worker<ReindexJobData> {
  const worker = new Worker<ReindexJobData>(
    ES_REINDEX_QUEUE_NAME,
    async (job: Job<ReindexJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { indexType, documentId, action } = job.data;
          logger.info(`ES reindex: ${action} ${indexType} ${documentId}`);

          const { searchService } = await import('../services/search.service');
          const prisma = (await import('../config/prisma')).default;

          if (action === 'delete') {
            if (indexType === 'job') {
              await searchService.deleteJob(documentId);
            } else {
              await searchService.deleteCandidate(documentId);
            }
            return { action: 'deleted', indexType, documentId };
          }

          // action === 'index'
          if (indexType === 'job') {
            const job = await prisma.jobPost.findUnique({
              where: { id: documentId },
              include: {
                company: {
                  select: {
                    id: true,
                    companyName: true,
                    logo: true,
                    industry: true,
                    companyType: true,
                    companySize: true,
                    isVerified: true,
                  },
                },
              },
            });
            if (!job) {
              logger.warn(`ES reindex: job ${documentId} not found in DB, skipping`);
              return { action: 'skipped', reason: 'not_found' };
            }
            await searchService.indexJob(job);
          } else {
            const profile = await prisma.candidateProfile.findUnique({
              where: { id: documentId },
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    isEmailVerified: true,
                    isMobileVerified: true,
                    isWhatsappVerified: true,
                    mobileNumber: true,
                    whatsappNumber: true,
                    lastActiveAt: true,
                  },
                },
              },
            });
            if (!profile) {
              logger.warn(`ES reindex: candidate ${documentId} not found in DB, skipping`);
              return { action: 'skipped', reason: 'not_found' };
            }
            await searchService.indexCandidate(profile);
          }

          // Invalidate ES search cache after reindexing (data changed)
          const cachePattern = indexType === 'job' ? 'es:search:jobs:*' : 'es:search:candidates:*';
          invalidateCache(cachePattern).catch(() => {});

          return { action: 'indexed', indexType, documentId };
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_ES_REINDEX_CONCURRENCY, 10),
      lockDuration: 30000,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`ES reindex job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`ES reindex job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
