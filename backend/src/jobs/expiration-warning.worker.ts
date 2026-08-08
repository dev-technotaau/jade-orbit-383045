import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';

export async function handleExpirationWarning(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing expiration warning check ${job.id}`);

    const processWarnings = async () => {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Find jobs expiring in the next 3 days that haven't been warned yet
      const expiringJobs = await prisma.jobPost.findMany({
        where: {
          status: JobStatus.OPEN,
          expiresAt: {
            gt: now,
            lte: threeDaysFromNow,
          },
          OR: [
            { lastExpirationWarning: null },
            { lastExpirationWarning: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        },
        select: {
          id: true,
          title: true,
          expiresAt: true,
          companyId: true,
          company: { select: { userId: true } },
        },
        take: 200, // Limit per run
      });

      if (expiringJobs.length === 0) {
        logger.info('No jobs expiring soon that need warnings');
        return { warned: 0 };
      }

      let warned = 0;
      const { notificationService } = await import('../services/notification.service');

      for (const expiringJob of expiringJobs) {
        try {
          const daysLeft = Math.ceil(
            ((expiringJob.expiresAt as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          );

          await notificationService.send({
            userId: expiringJob.company.userId,
            title: 'Job Expiring Soon',
            message: `Your job posting "${expiringJob.title}" expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew it to keep it visible.`,
            type: 'WARNING',
            category: 'job',
            link: `/employer/jobs/${expiringJob.id}`,
            channels: ['in_app', 'email', 'fcm', 'web_push'],
          });

          await prisma.jobPost.update({
            where: { id: expiringJob.id },
            data: { lastExpirationWarning: now },
          });

          warned++;
        } catch (error) {
          logger.error(`Failed to send expiration warning for job ${expiringJob.id}:`, error);
        }
      }

      logger.info(`Sent ${warned}/${expiringJobs.length} expiration warnings`);
      return { warned, total: expiringJobs.length };
    };

    return await Promise.race([
      processWarnings(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error('Expiration warning worker timeout after 60s')),
          TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    logger.error('Expiration warning check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
