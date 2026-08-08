import type { Job } from 'bullmq';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { notificationService } from '../services/notification.service';
import { profileCompletionReminder } from '../templates/email/onboarding';
import { profileCompletionWhatsapp } from '../templates/whatsapp';

export async function handleProfileReminder(job: Job) {
  logger.info(`Processing profile completion reminders ${job.id}`);

  // Find candidates with incomplete profiles (< 80%) who registered > 3 days ago
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.candidateProfile.findMany({
    where: {
      profileCompleteness: { lt: 80 },
      user: {
        role: 'CANDIDATE',
        isEmailVerified: true,
        createdAt: { lt: threeDaysAgo },
      },
    },
    select: {
      userId: true,
      profileCompleteness: true,
      user: {
        select: {
          email: true,
          firstName: true,
          mobileNumber: true,
          whatsappNumber: true,
          isWhatsappVerified: true,
        },
      },
    },
    take: 200,
  });

  let sentCount = 0;
  for (const candidate of candidates) {
    try {
      const progress = candidate.profileCompleteness || 0;
      const name = candidate.user.firstName || 'Candidate';
      const emailTmpl = profileCompletionReminder(name, progress);

      const channels: ('in_app' | 'email' | 'whatsapp')[] = ['in_app', 'email'];
      let whatsappOptions;

      const whatsappTarget = candidate.user.whatsappNumber || candidate.user.mobileNumber;
      if (candidate.user.isWhatsappVerified && whatsappTarget) {
        channels.push('whatsapp');
        const waTmpl = profileCompletionWhatsapp(name, progress);
        whatsappOptions = {
          to: whatsappTarget,
          templateName: waTmpl.templateName,
          components: waTmpl.components,
        };
      }

      await notificationService.send({
        userId: candidate.userId,
        title: 'Complete Your Profile',
        message: `Your profile is ${progress}% complete. Complete it to get more job matches.`,
        type: 'INFO',
        category: 'onboarding',
        link: '/candidate/profile',
        channels,
        emailOptions: {
          to: candidate.user.email,
          subject: emailTmpl.subject,
          html: emailTmpl.html,
          text: emailTmpl.text,
        },
        whatsappOptions,
      });
      sentCount++;
    } catch {
      logger.debug(`Failed to send profile reminder to ${candidate.userId}`);
    }
  }

  logger.info(`Profile completion reminders sent: ${sentCount}/${candidates.length}`);
  return { sent: sentCount, total: candidates.length };
}
