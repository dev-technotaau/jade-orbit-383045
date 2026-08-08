import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';
import { withLock } from '../utils/distributed-lock';

export async function handleJobExpiration(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing job expiration check ${job.id}`);

    const processExpiration = async () => {
      // Distributed lock prevents double-processing if multiple instances run this cron
      const result = await withLock('lock:job-expiration-batch', 600, async () => {
        const expiredJobs = await prisma.jobPost.findMany({
          where: {
            status: JobStatus.OPEN,
            expiresAt: { lte: new Date() },
          },
          select: { id: true, title: true, companyId: true },
        });

        if (expiredJobs.length === 0) {
          logger.info('No expired jobs found');
          return { expired: 0 };
        }

        const updateResult = await prisma.jobPost.updateMany({
          where: {
            id: { in: expiredJobs.map((j) => j.id) },
          },
          data: { status: JobStatus.EXPIRED },
        });

        try {
          const { addReindexJob } = await import('./es-reindex.queue');
          for (const expJob of expiredJobs) {
            await addReindexJob({
              indexType: 'job',
              documentId: expJob.id,
              action: 'delete',
            }).catch(() => {});
          }
        } catch (error) {
          logger.error('Failed to queue ES reindex for expired jobs:', error);
        }

        try {
          const { notificationService } = await import('../services/notification.service');
          for (const expiredJob of expiredJobs) {
            const company = await prisma.companyProfile.findUnique({
              where: { id: expiredJob.companyId },
              select: { userId: true },
            });
            if (company) {
              await notificationService
                .send({
                  userId: company.userId,
                  title: 'Job Expired',
                  message: `Your job posting "${expiredJob.title}" has expired.`,
                  type: 'WARNING',
                  category: 'job',
                  link: `/employer/jobs/${expiredJob.id}`,
                  channels: ['in_app', 'email', 'fcm', 'web_push'],
                })
                .catch(() => {});
            }
          }
        } catch (e) {
          logger.error('Failed to notify employers about expired jobs', e);
        }

        logger.info(`Expired ${updateResult.count} jobs`);
        return { expired: updateResult.count, jobIds: expiredJobs.map((j) => j.id) };
      });

      if (result === null) {
        logger.info('Job expiration batch already locked by another instance, skipping');
        return { expired: 0, skipped: true };
      }

      return result;
    };

    return await Promise.race([
      processExpiration(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Job expiration worker timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    logger.error('Job expiration check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
