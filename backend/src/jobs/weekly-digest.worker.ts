import type { Job } from 'bullmq';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { emailQueue } from './email.queue';
import { weeklyHiringDigest } from '../templates/email/weekly-digest';

export async function handleWeeklyDigest(job: Job) {
  logger.info(`Processing weekly digest ${job.id}`);

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const employers = await prisma.companyProfile.findMany({
    where: {
      user: { role: 'EMPLOYER', isEmailVerified: true },
    },
    select: {
      id: true,
      userId: true,
      companyName: true,
      notificationPreferences: true,
      user: { select: { email: true, firstName: true } },
    },
  });

  let sentCount = 0;
  for (const employer of employers) {
    try {
      const prefs = employer.notificationPreferences as Record<string, boolean> | null;
      if (prefs?.weeklyDigest === false) continue;

      const companyId = employer.id;
      const [newApplications, activeJobs, interviewsScheduled, hires] = await Promise.all([
        prisma.jobApplication.count({
          where: { job: { companyId }, appliedAt: { gte: oneWeekAgo } },
        }),
        prisma.jobPost.count({
          where: { companyId, status: 'OPEN' },
        }),
        prisma.jobApplication.count({
          where: {
            job: { companyId },
            status: 'INTERVIEW_SCHEDULED',
            updatedAt: { gte: oneWeekAgo },
          },
        }),
        prisma.jobApplication.count({
          where: {
            job: { companyId },
            status: 'HIRED',
            updatedAt: { gte: oneWeekAgo },
          },
        }),
      ]);

      if (newApplications === 0 && interviewsScheduled === 0 && hires === 0) continue;

      const name = employer.user.firstName || 'Hiring Manager';
      const company = employer.companyName || 'your company';

      const digest = weeklyHiringDigest(name, company, {
        newApplications,
        activeJobs,
        interviewsScheduled,
        hires,
      });
      await emailQueue.add('send-email', {
        to: employer.user.email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      });

      sentCount++;
    } catch {
      logger.debug(`Failed to send weekly digest to employer ${employer.userId}`);
    }
  }

  logger.info(`Weekly digests sent: ${sentCount}/${employers.length}`);
  return { sent: sentCount, total: employers.length };
}
