import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import type { GeocodingJobData } from './geocoding.queue';
import { GEOCODING_QUEUE_NAME } from './geocoding.queue';
import { geocodingService } from '../services/geocoding.service';
import { prisma } from '../config/prisma';
import { searchService } from '../services/search.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

export function createGeocodingWorker(): Worker<GeocodingJobData> {
  const worker = new Worker<GeocodingJobData>(
    GEOCODING_QUEUE_NAME,
    async (job: Job<GeocodingJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 30_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            const { entityType, entityId, address } = job.data;
            logger.info(`Geocoding ${entityType} ${entityId}: "${address}"`);

            const result = await Promise.race([
              geocodingService.geocode(address),
              new Promise<never>((_resolve, reject) =>
                setTimeout(
                  () => reject(new Error('Geocoding worker timeout after 30s')),
                  TIMEOUT_MS
                )
              ),
            ]);
            if (!result) {
              logger.warn(`Geocoding returned no results for: "${address}"`);
              return { success: false, address };
            }

            const { latitude, longitude } = result;

            switch (entityType) {
              case 'candidate': {
                await prisma.candidateProfile.update({
                  where: { userId: entityId },
                  data: { latitude, longitude },
                });

                // Re-index to ES with new coordinates
                try {
                  const profile = await prisma.candidateProfile.findUnique({
                    where: { userId: entityId },
                    include: { user: true },
                  });
                  if (profile) {
                    await searchService.indexCandidate(profile);
                  }
                } catch (e) {
                  logger.error(`Failed to re-index candidate ${entityId} after geocoding`, e);
                }
                break;
              }

              case 'job': {
                await prisma.jobPost.update({
                  where: { id: entityId },
                  data: { latitude, longitude },
                });

                try {
                  const jobPost = await prisma.jobPost.findUnique({
                    where: { id: entityId },
                    include: { company: true },
                  });
                  if (jobPost) {
                    await searchService.indexJob(jobPost);
                  }
                } catch (e) {
                  logger.error(`Failed to re-index job ${entityId} after geocoding`, e);
                }
                break;
              }

              case 'company': {
                await prisma.companyProfile.update({
                  where: { id: entityId },
                  data: { latitude, longitude },
                });

                try {
                  const company = await prisma.companyProfile.findUnique({
                    where: { id: entityId },
                    include: { user: true },
                  });
                  if (company) {
                    await searchService.indexEmployer(company);
                  }
                } catch (e) {
                  logger.error(`Failed to re-index company ${entityId} after geocoding`, e);
                }
                break;
              }
            }

            logger.info(`Geocoded ${entityType} ${entityId}: lat=${latitude}, lon=${longitude}`);
            return {
              success: true,
              latitude,
              longitude,
              formattedAddress: result.formattedAddress,
            };
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_GEOCODING_CONCURRENCY, 10),
      lockDuration: 60000, // 60s — lightweight HTTP call
      stalledInterval: 30000,
      limiter: {
        max: 1,
        duration: 1100, // 1 req/sec + margin
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Geocoding job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Geocoding job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
