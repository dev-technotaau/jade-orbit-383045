import type { Job } from 'bullmq';
import logger from '../config/logger';

export async function handleSlaCheck(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing SLA breach check ${job.id}`);

    const processSlaCheck = async () => {
      const { verificationService } = await import('../services/verification.service');
      const result = await verificationService.checkSlaBreaches();

      if (result.escalated > 0) {
        logger.warn(`Auto-escalated ${result.escalated} verification(s) due to SLA breach`);

        try {
          const { notificationService } = await import('../services/notification.service');
          const { prisma } = await import('../config/prisma');
          const admins = await prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
            select: { id: true },
          });
          for (const admin of admins) {
            await notificationService
              .send({
                userId: admin.id,
                title: 'SLA Breach Alert',
                message: `${result.escalated} verification request(s) have breached their SLA deadline and been auto-escalated to URGENT.`,
                type: 'WARNING',
                category: 'admin',
                link: '/admin/verifications',
                channels: ['in_app', 'email', 'fcm', 'web_push'],
              })
              .catch(() => {});
          }
        } catch {
          /* non-critical */
        }
      }

      return result;
    };

    return await Promise.race([
      processSlaCheck(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('SLA check worker timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    logger.error('SLA breach check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
