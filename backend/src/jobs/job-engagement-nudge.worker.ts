import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { JobStatus } from '@prisma/client';
import { withLock } from '../utils/distributed-lock';

/**
 * Job-engagement nudges — the "posted and forgotten" problem.
 *
 * Two distinct silences were previously invisible to the platform:
 *
 *   1. NO APPLICATIONS — a job has been live for a while and attracted nobody.
 *      Usually fixable (salary hidden, skills too narrow, no description), but
 *      the employer has no idea anything is wrong. Nudged once at 7 days.
 *
 *   2. DORMANT EMPLOYER — jobs are live and may even have applicants waiting,
 *      but the employer has not signed in for 14 days. Candidates sit
 *      un-reviewed, which is worse than no applications: real people are
 *      waiting on someone who is not coming back.
 *
 * DELIBERATELY CONSERVATIVE — this sends unsolicited mail, so:
 *   · `lastExpirationWarning` is reused as a per-job "we already nudged you"
 *     stamp, giving a hard 7-day floor between ANY two nudges about one job.
 *     That also means expiry warnings and these nudges can never pile onto the
 *     same job in the same week.
 *   · Batches are capped (100/50) per run, exactly like the sibling workers.
 *   · Jobs about to expire are skipped — the expiry warning already covers
 *     them and two mails about one job in a day is spam.
 *   · Everything runs under a distributed lock so multiple instances cannot
 *     double-send.
 */

/** A job must be live this long with zero applications before we say anything. */
const NO_APPLICATION_DAYS = 7;
/** Employer signed out this long while jobs are live = dormant. */
const DORMANT_DAYS = 14;
/** Never nudge the same job twice inside this window. */
const NUDGE_COOLDOWN_DAYS = 7;
/** Leave jobs expiring within this window to the expiration-warning worker. */
const EXPIRY_HANDOFF_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function handleJobEngagementNudge(job: Job) {
  logger.info(`Processing job engagement nudges ${job.id}`);

  const result = await withLock('lock:job-engagement-nudge', 600, async () => {
    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - NUDGE_COOLDOWN_DAYS * DAY_MS);
    const expiryHandoff = new Date(now.getTime() + EXPIRY_HANDOFF_DAYS * DAY_MS);
    const { notificationService } = await import('../services/notification.service');

    let noApplicationNudges = 0;
    let dormantNudges = 0;

    /* ── 1. Live jobs with zero applications ── */
    const staleJobs = await prisma.jobPost.findMany({
      where: {
        status: JobStatus.OPEN,
        createdAt: { lte: new Date(now.getTime() - NO_APPLICATION_DAYS * DAY_MS) },
        applications: { none: {} },
        OR: [{ lastExpirationWarning: null }, { lastExpirationWarning: { lt: cooldownCutoff } }],
        // Hand off to the expiry warning rather than double-mailing.
        NOT: { expiresAt: { not: null, lte: expiryHandoff } },
      },
      select: {
        id: true,
        title: true,
        company: { select: { userId: true } },
      },
      take: 100,
    });

    for (const stale of staleJobs) {
      if (!stale.company?.userId) continue;
      try {
        await notificationService.send({
          userId: stale.company.userId,
          title: 'No applications yet',
          message:
            `"${stale.title}" has been live for ${NO_APPLICATION_DAYS} days without any applications. ` +
            'Adding a salary range, widening the required skills, or expanding the location usually helps.',
          type: 'WARNING',
          category: 'job',
          link: `/employer/jobs/${stale.id}`,
          channels: ['in_app', 'email'],
        });
        await prisma.jobPost.update({
          where: { id: stale.id },
          data: { lastExpirationWarning: now },
        });
        noApplicationNudges += 1;
      } catch (err) {
        logger.error(`Failed no-application nudge for job ${stale.id}`, err);
      }
    }

    /* ── 2. Dormant employers with live jobs ── */
    const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * DAY_MS);
    const dormantCompanies = await prisma.companyProfile.findMany({
      where: {
        user: {
          OR: [{ lastActiveAt: { lt: dormantCutoff } }, { lastActiveAt: null }],
        },
        jobs: { some: { status: JobStatus.OPEN } },
      },
      select: {
        id: true,
        companyName: true,
        userId: true,
        _count: { select: { jobs: { where: { status: JobStatus.OPEN } } } },
      },
      take: 50,
    });

    for (const company of dormantCompanies) {
      try {
        // Pending applicants are the strongest reason to come back, so lead
        // with them when there are any.
        const pending = await prisma.jobApplication.count({
          where: {
            job: { companyId: company.id, status: JobStatus.OPEN },
            status: { in: ['APPLIED', 'VIEWED'] },
          },
        });
        const openCount = company._count.jobs;
        await notificationService.send({
          userId: company.userId,
          title:
            pending > 0 ? `${pending} applicant(s) waiting for you` : 'Your jobs are still live',
          message:
            pending > 0
              ? `You have ${pending} application(s) awaiting review across ${openCount} live job(s). Candidates are waiting to hear back.`
              : `You have ${openCount} live job(s) on Hire Adda. Reviewing or refreshing them keeps them visible to candidates.`,
          type: 'INFO',
          category: 'job',
          link: '/employer/jobs',
          channels: ['in_app', 'email'],
        });
        dormantNudges += 1;
      } catch (err) {
        logger.error(`Failed dormancy nudge for company ${company.id}`, err);
      }
    }

    logger.info(
      `Engagement nudges sent — no-application: ${noApplicationNudges}, dormant: ${dormantNudges}`
    );
    return { noApplicationNudges, dormantNudges };
  });

  if (result === null) {
    logger.info('Job engagement nudge skipped — another instance holds the lock');
    return { skipped: true };
  }
  return result;
}
