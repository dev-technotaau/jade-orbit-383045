import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';
import { withLock } from '../utils/distributed-lock';

export async function handleScheduledPublish(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing scheduled publish check ${job.id}`);

    const processScheduled = async () => {
      const scheduledJobs = await prisma.jobPost.findMany({
        where: {
          status: JobStatus.DRAFT,
          scheduledPublishAt: { lte: new Date() },
        },
        select: { id: true, title: true, companyId: true, location: true },
      });

      if (scheduledJobs.length === 0) {
        logger.info('No scheduled jobs ready to publish');
        return { published: 0 };
      }

      let published = 0;
      for (const sj of scheduledJobs) {
        // Distributed lock prevents double-publish if multiple instances run this cron
        const result = await withLock(`lock:job-publish:${sj.id}`, 300, async () => {
          await prisma.jobPost.update({
            where: { id: sj.id },
            data: { status: JobStatus.OPEN },
          });

          try {
            const { addReindexJob } = await import('./es-reindex.queue');
            await addReindexJob({ indexType: 'job', documentId: sj.id, action: 'index' });
          } catch (e) {
            logger.error(`Failed to queue ES reindex for scheduled job ${sj.id}`, e);
          }

          if (sj.location) {
            import('./geocoding.queue')
              .then(({ addGeocodingJob }) =>
                addGeocodingJob({ entityType: 'job', entityId: sj.id, address: sj.location })
              )
              .catch(() => {});
          }

          try {
            const { matchingQueue } = await import('./matching.queue');
            await matchingQueue.add('match-candidates', { jobId: sj.id });
          } catch (e) {
            logger.error(`Failed to enqueue matching for scheduled job ${sj.id}`, e);
          }

          try {
            const { publishEvent } = await import('../kafka/producer');
            const { KafkaTopics } = await import('../kafka/topics');
            publishEvent(KafkaTopics.JOB_POSTED, sj.id, {
              jobId: sj.id,
              companyId: sj.companyId,
              title: sj.title,
              scheduled: true,
            });
          } catch {
            /* non-critical */
          }

          try {
            const company = await prisma.companyProfile.findUnique({
              where: { id: sj.companyId },
              select: { userId: true },
            });
            if (company) {
              const { notificationService } = await import('../services/notification.service');
              await notificationService.notifyJobPosted(company.userId, sj.title, sj.id);
            }
          } catch {
            /* non-critical */
          }

          return true;
        });

        if (result !== null) {
          published++;
        } else {
          logger.debug(`Skipping scheduled publish for job ${sj.id} — already locked`);
        }
      }

      logger.info(`Published ${published}/${scheduledJobs.length} scheduled jobs`);
      return { published, total: scheduledJobs.length };
    };

    return await Promise.race([
      processScheduled(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error('Scheduled publish worker timeout after 60s')),
          TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    logger.error('Scheduled publish check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
