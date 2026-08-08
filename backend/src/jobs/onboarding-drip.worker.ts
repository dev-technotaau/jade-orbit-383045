import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { ONBOARDING_DRIP_QUEUE_NAME } from './onboarding-drip.queue';
import { env } from '../config/env';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface OnboardingDripData {
  userId: string;
  role: string;
  step: 'day1' | 'day3' | 'day7';
}

export function createOnboardingDripWorker(): Worker<OnboardingDripData> {
  const worker = new Worker<OnboardingDripData>(
    ONBOARDING_DRIP_QUEUE_NAME,
    async (job: Job<OnboardingDripData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { userId, role, step } = job.data;
          logger.info(`Processing onboarding drip: step=${step} for user ${userId}`);

          const prisma = (await import('../config/prisma')).default;

          // Verify user still exists, is active, and email is verified
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              isEmailVerified: true,
              isActive: true,
              isSuspended: true,
              role: true,
            },
          });

          if (!user || !user.isActive || user.isSuspended || !user.isEmailVerified) {
            logger.info(`Skipping drip ${step} for user ${userId}: inactive/unverified/deleted`);
            return { skipped: true, reason: 'user_ineligible' };
          }

          const name = user.firstName || 'there';
          const appUrl = env.FRONTEND_URL || 'https://hireadda.in';

          // Select email content based on role + step
          const templates: Record<
            string,
            Record<string, { subject: string; message: string; link: string }>
          > = {
            CANDIDATE: {
              day1: {
                subject: 'Complete your profile to stand out!',
                message: `Hi ${name}, complete your profile to increase your visibility to employers. Add your skills, experience, and upload a resume.`,
                link: `${appUrl}/candidate/profile`,
              },
              day3: {
                subject: 'Browse jobs matching your skills',
                message: `Hi ${name}, check out job openings tailored to your profile. Set up job alerts to never miss a perfect opportunity.`,
                link: `${appUrl}/candidate/jobs`,
              },
              day7: {
                subject: 'Pro tips: Get noticed by top employers',
                message: `Hi ${name}, employers are searching for candidates like you. Make sure your profile is 100% complete and upload a polished resume.`,
                link: `${appUrl}/candidate/recommendations`,
              },
            },
            EMPLOYER: {
              day1: {
                subject: 'Post your first job to start hiring',
                message: `Hi ${name}, welcome to Hire Adda! Post your first job to start reaching qualified candidates.`,
                link: `${appUrl}/employer/jobs/new`,
              },
              day3: {
                subject: 'Complete your company profile',
                message: `Hi ${name}, a complete company profile attracts more candidates. Add your company description, culture, and benefits.`,
                link: `${appUrl}/employer/profile`,
              },
              day7: {
                subject: 'Discover our candidate matching features',
                message: `Hi ${name}, use our AI-powered candidate search to find the perfect match. Filter by skills, experience, and location.`,
                link: `${appUrl}/employer/candidates`,
              },
            },
            // Capability-activation drip — fired when an employer subscribes
            // to Vendor Connect (keyed by role='VENDOR_CONNECT' on enqueue).
            VENDOR_CONNECT: {
              day1: {
                subject: 'Set up your Vendor Connect profile',
                message: `Hi ${name}, you're now a Hire Adda recruitment partner! Complete your vendor business profile so other companies can discover you.`,
                link: `${appUrl}/employer/vendor/profile`,
              },
              day3: {
                subject: 'Browse the hiring job board',
                message: `Hi ${name}, publish your vendor profile and start browsing live hiring requirements from companies — reveal their contact details to pitch your candidates first.`,
                link: `${appUrl}/employer/vendor/jobs`,
              },
              day7: {
                subject: 'Win more clients with Vendor Connect',
                message: `Hi ${name}, respond fast to incoming leads and keep an eye on the job board — quick recruitment partners close the most placements.`,
                link: `${appUrl}/employer/vendor`,
              },
            },
          };

          const roleTemplates = templates[role] || templates.CANDIDATE;
          const tmpl = roleTemplates[step];
          if (!tmpl) {
            logger.warn(`No drip template for role=${role}, step=${step}`);
            return { skipped: true, reason: 'no_template' };
          }

          // Send via notification service (email + in-app)
          const { notificationService } = await import('../services/notification.service');
          await notificationService.send({
            userId,
            title: tmpl.subject,
            message: tmpl.message,
            type: 'INFO',
            category: 'onboarding',
            link: tmpl.link,
            channels: ['in_app', 'email', 'fcm', 'web_push'],
            emailOptions: {
              to: user.email,
              subject: tmpl.subject,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#2563eb;">${tmpl.subject}</h2>
          <p>${tmpl.message}</p>
          <a href="${tmpl.link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin-top:16px;">Get Started</a>
        </div>`,
              text: `${tmpl.message}\n\n${tmpl.link}`,
            },
          });

          logger.info(`Onboarding drip ${step} sent to ${user.email}`);
          return { sent: true, step };
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_ONBOARDING_DRIP_CONCURRENCY, 10),
      lockDuration: 60000,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Onboarding drip job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Onboarding drip job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
