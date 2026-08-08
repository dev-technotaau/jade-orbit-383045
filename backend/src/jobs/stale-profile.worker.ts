import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';

export async function handleStaleProfileCheck(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing stale profile check ${job.id}`);

    const processStaleProfiles = async () => {
      const now = new Date();
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Find candidates who:
      // 1. Haven't updated their profile in 3+ months
      // 2. But are still active on the platform (logged in within 30 days)
      const staleProfiles = await prisma.candidateProfile.findMany({
        where: {
          updatedAt: { lt: threeMonthsAgo },
          user: {
            lastActiveAt: { gt: thirtyDaysAgo },
            isActive: true,
            isSuspended: false,
            role: 'CANDIDATE',
          },
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: { firstName: true, email: true },
          },
        },
        take: 200, // Limit per run
      });

      if (staleProfiles.length === 0) {
        logger.info('No stale profiles found');
        return { notified: 0 };
      }

      let notified = 0;
      const { notificationService } = await import('../services/notification.service');

      for (const profile of staleProfiles) {
        try {
          const name = profile.user.firstName || 'there';

          await notificationService.send({
            userId: profile.userId,
            title: 'Keep your profile up to date',
            message: `Hi ${name}, your profile hasn't been updated in a while. Keeping it fresh helps employers find you. Update your skills and experience today!`,
            type: 'INFO',
            category: 'profile',
            link: '/candidate/profile',
            channels: ['in_app', 'email'],
          });

          notified++;
        } catch (error) {
          logger.error(`Failed to send stale profile alert to user ${profile.userId}:`, error);
        }
      }

      logger.info(`Sent ${notified}/${staleProfiles.length} stale profile alerts`);
      return { notified, total: staleProfiles.length };
    };

    return await Promise.race([
      processStaleProfiles(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Stale profile check timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    logger.error('Stale profile check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
