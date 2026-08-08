import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';

export async function handleReviewReminder(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing review reminder check ${job.id}`);

    const processReminders = async () => {
      const now = new Date();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      // Find applications that have been pending review for 48+ hours
      const pendingApplications = await prisma.jobApplication.findMany({
        where: {
          status: 'APPLIED',
          appliedAt: { lte: fortyEightHoursAgo },
          reviewReminderSentAt: null,
        },
        select: {
          id: true,
          jobId: true,
          job: {
            select: {
              id: true,
              title: true,
              company: { select: { userId: true, companyName: true } },
            },
          },
        },
        take: 500, // Limit per run
      });

      if (pendingApplications.length === 0) {
        logger.info('No pending applications needing review reminders');
        return { reminded: 0 };
      }

      // Group by employer to send one notification per employer
      const byEmployer = new Map<
        string,
        { userId: string; companyName: string; jobs: Map<string, { title: string; count: number }> }
      >();

      for (const app of pendingApplications) {
        const employerUserId = app.job.company.userId;
        if (!byEmployer.has(employerUserId)) {
          byEmployer.set(employerUserId, {
            userId: employerUserId,
            companyName: app.job.company.companyName,
            jobs: new Map(),
          });
        }
        const employer = byEmployer.get(employerUserId)!;
        if (!employer.jobs.has(app.job.id)) {
          employer.jobs.set(app.job.id, { title: app.job.title, count: 0 });
        }
        employer.jobs.get(app.job.id)!.count++;
      }

      let reminded = 0;
      const { notificationService } = await import('../services/notification.service');

      for (const [, employer] of byEmployer) {
        try {
          const jobSummaries = Array.from(employer.jobs.values())
            .map((j) => `"${j.title}" (${j.count})`)
            .join(', ');

          const totalApps = Array.from(employer.jobs.values()).reduce((sum, j) => sum + j.count, 0);

          await notificationService.send({
            userId: employer.userId,
            title: 'Applications Awaiting Review',
            message: `You have ${totalApps} application${totalApps !== 1 ? 's' : ''} waiting for review: ${jobSummaries}`,
            type: 'INFO',
            category: 'application',
            link: '/employer/applications',
            channels: ['in_app', 'email', 'fcm', 'web_push'],
          });

          reminded++;
        } catch (error) {
          logger.error(`Failed to send review reminder to employer ${employer.userId}:`, error);
        }
      }

      // Mark all processed applications to prevent duplicate reminders
      await prisma.jobApplication.updateMany({
        where: {
          id: { in: pendingApplications.map((a) => a.id) },
        },
        data: { reviewReminderSentAt: now },
      });

      logger.info(
        `Sent review reminders to ${reminded} employers for ${pendingApplications.length} applications`
      );
      return { reminded, applications: pendingApplications.length };
    };

    return await Promise.race([
      processReminders(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Review reminder worker timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    logger.error('Review reminder check failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
