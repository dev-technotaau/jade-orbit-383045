import type { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { notificationService, type NotificationChannel } from '../services/notification.service';
import { digestPolicy, type DigestCategory } from '../services/digest-policy.service';
import {
  followedCompanyJobs,
  profileViewsDigest,
  savedJobsClosing,
  candidateRecommendations,
  applicationsAwaiting,
  cvSearchAlerts,
  similarJobs,
} from '../templates/email/digests';

/**
 * The recurring digest senders.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Six scheduled notifications — three for candidates, three for employers —
 * all sharing one runner so that the parts which are easy to get wrong
 * (batching, the policy gate, resolving "when did we last send this",
 * failure isolation) exist exactly once. Adding a seventh digest is then a
 * ~30-line `build()` function, not another copy of this machinery.
 *
 * ── Channels ──
 * Email + in-app + push only. WhatsApp is deliberately absent: every
 * recurring type would need its own MARKETING template, costs per send, and
 * carries block risk on frequency. The event-driven matcher still uses
 * WhatsApp, where the message is timely and expected.
 */

const CHANNELS: NotificationChannel[] = ['in_app', 'fcm', 'web_push', 'email'];

/** Users pulled per page. */
const BATCH = 200;

/** What one digest describes and how to build it for a given user. */
interface DigestSpec {
  category: DigestCategory;
  role: 'CANDIDATE' | 'EMPLOYER';
  /**
   * Produce the notification for this user, or null when there is nothing
   * worth sending. Runs ONLY for users who already passed the policy gate,
   * so it is free to do real query work.
   */
  build(
    user: { id: string; firstName: string | null; email: string; isEmailVerified: boolean },
    now: Date
  ): Promise<{
    title: string;
    message: string;
    link: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  } | null>;
}

/**
 * Walk every eligible user of a role, apply the digest policy, and send.
 *
 * Ordering matters for cost: the cheap shared-budget filter runs on the whole
 * batch in one query, then the per-user policy check, and only then the
 * expensive `build()`. Reversing that would score thousands of users whose
 * message was never going to be sent.
 */
async function runDigest(spec: DigestSpec, now = new Date()) {
  let cursor: string | undefined;
  let scanned = 0;
  let sent = 0;
  const skipped: Record<string, number> = {};
  const bump = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        role: spec.role,
        isActive: true,
        isSuspended: false,
        isEmailVerified: true,
      },
      select: { id: true, firstName: true, email: true, isEmailVerified: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1]!.id;
    scanned += users.length;

    const underCap = await digestPolicy.underDailyCap(
      users.map((u) => u.id),
      now
    );
    const eligible = users.filter((u) => underCap.has(u.id));
    for (let i = 0; i < users.length - eligible.length; i++) bump('rate_capped');

    if (eligible.length > 0) {
      // Last send of THIS category, derived from notification history so a new
      // digest never needs its own column.
      const lastRows = await prisma.notification.groupBy({
        by: ['userId'],
        where: { userId: { in: eligible.map((u) => u.id) }, category: spec.category },
        _max: { createdAt: true },
      });
      const lastSent = new Map(lastRows.map((r) => [r.userId, r._max.createdAt]));

      for (const user of eligible) {
        try {
          const decision = await digestPolicy.canSend(
            user.id,
            spec.category,
            lastSent.get(user.id) ?? null,
            now
          );
          if (!decision.ok) {
            bump(decision.reason ?? 'unknown');
            continue;
          }

          const payload = await spec.build(user, now);
          if (!payload) {
            bump('nothing_to_say');
            continue;
          }

          await notificationService.send({
            userId: user.id,
            title: payload.title,
            message: payload.message,
            category: spec.category,
            link: payload.link,
            metadata: payload.metadata,
            channels: CHANNELS,
            emailOptions: {
              to: user.email,
              subject: payload.subject,
              html: payload.html,
              text: payload.text,
            },
          });
          sent++;
        } catch (error) {
          // One user's failure must not abort the sweep.
          logger.error(`Digest ${spec.category} failed for user ${user.id}:`, error);
        }
      }
    }

    if (users.length < BATCH) break;
  }

  logger.info(
    `Digest ${spec.category}: scanned=${scanned} sent=${sent} skipped=${JSON.stringify(skipped)}`
  );
  return { category: spec.category, scanned, sent, skipped };
}

const days = (n: number) => n * 86400_000;
const name = (u: { firstName: string | null }) => u.firstName || 'there';

/* ════════════════════════ CANDIDATE ════════════════════════ */

/** New roles at companies this candidate follows. */
export const handleFollowedCompanyJobsDigest = (job: Job) => {
  logger.info(`Processing followed-company digest ${job.id}`);
  return runDigest({
    category: 'followed_company_jobs',
    role: 'CANDIDATE',
    async build(user, now) {
      const follows = await prisma.companyFollow.findMany({
        where: { userId: user.id },
        select: { companyId: true },
      });
      if (follows.length === 0) return null;

      const since = new Date(now.getTime() - days(7));
      const jobs = await prisma.jobPost.findMany({
        where: {
          companyId: { in: follows.map((f) => f.companyId) },
          status: 'OPEN',
          createdAt: { gte: since },
        },
        select: {
          id: true,
          title: true,
          location: true,
          company: { select: { companyName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (jobs.length === 0) return null;

      const top = jobs.slice(0, 5).map((j) => ({
        title: j.title,
        company: j.company?.companyName ?? 'A company you follow',
        location: j.location,
        jobId: j.id,
      }));
      const tmpl = followedCompanyJobs(name(user), top, jobs.length);
      return {
        title: 'Companies You Follow Are Hiring',
        message: `${jobs.length} new opening(s) at companies you follow.`,
        link: '/candidate/following',
        metadata: { jobIds: jobs.map((j) => j.id) },
        ...tmpl,
      };
    },
  });
};

/** "N recruiters viewed your profile." */
export const handleProfileViewsDigest = (job: Job) => {
  logger.info(`Processing profile-views digest ${job.id}`);
  return runDigest({
    category: 'profile_views',
    role: 'CANDIDATE',
    async build(user, now) {
      const since = new Date(now.getTime() - days(7));
      const views = await prisma.profileView.findMany({
        where: {
          profileUserId: user.id,
          viewType: 'CANDIDATE_PROFILE',
          createdAt: { gte: since },
          // A candidate viewing their own profile is not a signal.
          viewerId: { not: user.id },
        },
        select: { viewerId: true },
      });
      if (views.length === 0) return null;

      // Name the viewing COMPANIES, never the individual recruiter.
      const viewerIds = [...new Set(views.map((v) => v.viewerId))];
      const profiles = await prisma.companyProfile.findMany({
        where: { userId: { in: viewerIds } },
        select: { companyName: true },
        take: 5,
      });

      const tmpl = profileViewsDigest(
        name(user),
        views.length,
        profiles.map((p) => p.companyName),
        'this week'
      );
      return {
        title: 'Your Profile Is Getting Noticed',
        message: `${views.length} recruiter view(s) on your profile this week.`,
        link: '/candidate/profile-views',
        metadata: { viewCount: views.length },
        ...tmpl,
      };
    },
  });
};

/** Saved jobs about to stop accepting applications. */
export const handleSavedJobsClosingDigest = (job: Job) => {
  logger.info(`Processing saved-jobs-closing digest ${job.id}`);
  return runDigest({
    category: 'saved_jobs_closing',
    role: 'CANDIDATE',
    async build(user, now) {
      const horizon = new Date(now.getTime() + days(3));
      const saved = await prisma.savedJob.findMany({
        where: {
          userId: user.id,
          job: { status: 'OPEN', expiresAt: { not: null, gte: now, lte: horizon } },
        },
        select: {
          job: {
            select: {
              id: true,
              title: true,
              expiresAt: true,
              company: { select: { companyName: true } },
            },
          },
        },
        take: 20,
      });
      if (saved.length === 0) return null;

      // Nudging about a job they already applied to is noise.
      const jobIds = saved.map((s) => s.job.id);
      const applied = await prisma.jobApplication.findMany({
        where: { candidateId: user.id, jobId: { in: jobIds } },
        select: { jobId: true },
      });
      const appliedSet = new Set(applied.map((a) => a.jobId));

      const pending = saved
        .filter((s) => !appliedSet.has(s.job.id))
        .map((s) => ({
          title: s.job.title,
          company: s.job.company?.companyName ?? '',
          jobId: s.job.id,
          daysLeft: Math.max(
            0,
            Math.ceil((s.job.expiresAt!.getTime() - now.getTime()) / 86400_000)
          ),
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft);
      if (pending.length === 0) return null;

      const tmpl = savedJobsClosing(name(user), pending.slice(0, 5));
      return {
        title: 'Saved Jobs Closing Soon',
        message: `${pending.length} saved job(s) close within 3 days.`,
        link: '/candidate/saved-jobs',
        metadata: { jobIds: pending.map((p) => p.jobId) },
        ...tmpl,
      };
    },
  });
};

/* ════════════════════════ EMPLOYER ════════════════════════ */

/** New scored candidates against this employer's open roles. */
export const handleCandidateRecommendationsDigest = (job: Job) => {
  logger.info(`Processing employer candidate-recommendations digest ${job.id}`);
  return runDigest({
    category: 'candidate_recommendations',
    role: 'EMPLOYER',
    async build(user, now) {
      const company = await prisma.companyProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!company) return null;

      const since = new Date(now.getTime() - days(7));
      const openJobs = await prisma.jobPost.findMany({
        where: { companyId: company.id, status: 'OPEN' },
        select: { id: true, title: true },
        take: 25,
      });
      if (openJobs.length === 0) return null;

      const matches = await prisma.jobCandidateMatch.findMany({
        where: { jobId: { in: openJobs.map((j) => j.id) }, createdAt: { gte: since } },
        select: {
          jobId: true,
          candidate: { select: { firstName: true, lastName: true } },
        },
        orderBy: { matchScore: 'desc' },
        take: 200,
      });
      if (matches.length === 0) return null;

      const byJob = new Map<string, { count: number; names: string[] }>();
      for (const m of matches) {
        const entry = byJob.get(m.jobId) ?? { count: 0, names: [] };
        entry.count += 1;
        const full = [m.candidate?.firstName, m.candidate?.lastName].filter(Boolean).join(' ');
        if (full && entry.names.length < 3) entry.names.push(full);
        byJob.set(m.jobId, entry);
      }

      const groups = openJobs
        .filter((j) => byJob.has(j.id))
        .map((j) => ({
          jobTitle: j.title,
          jobId: j.id,
          count: byJob.get(j.id)!.count,
          topNames: byJob.get(j.id)!.names,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const tmpl = candidateRecommendations(name(user), groups, matches.length);
      return {
        title: 'New Candidate Matches',
        message: `${matches.length} new candidate match(es) across your open roles.`,
        link: '/employer/jobs',
        metadata: { total: matches.length },
        ...tmpl,
      };
    },
  });
};

/** Applications sitting unreviewed. */
export const handleApplicationsAwaitingDigest = (job: Job) => {
  logger.info(`Processing applications-awaiting digest ${job.id}`);
  return runDigest({
    category: 'applications_awaiting',
    role: 'EMPLOYER',
    async build(user, now) {
      const company = await prisma.companyProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!company) return null;

      const pending = await prisma.jobApplication.findMany({
        where: {
          job: { companyId: company.id, status: 'OPEN' },
          // APPLIED means nobody has even opened it yet.
          status: 'APPLIED',
        },
        select: { jobId: true, appliedAt: true, job: { select: { title: true } } },
        orderBy: { appliedAt: 'asc' },
        take: 500,
      });
      if (pending.length === 0) return null;

      const byJob = new Map<string, { title: string; count: number; oldest: Date }>();
      for (const a of pending) {
        const e = byJob.get(a.jobId) ?? {
          title: a.job?.title ?? 'Role',
          count: 0,
          oldest: a.appliedAt,
        };
        e.count += 1;
        if (a.appliedAt < e.oldest) e.oldest = a.appliedAt;
        byJob.set(a.jobId, e);
      }

      const groups = [...byJob.entries()]
        .map(([jobId, e]) => ({
          jobId,
          jobTitle: e.title,
          count: e.count,
          oldestDays: Math.max(0, Math.floor((now.getTime() - e.oldest.getTime()) / 86400_000)),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const tmpl = applicationsAwaiting(name(user), groups, pending.length);
      return {
        title: 'Applications Awaiting Review',
        message: `${pending.length} application(s) waiting for review.`,
        link: '/employer/applications',
        metadata: { total: pending.length },
        ...tmpl,
      };
    },
  });
};

/** Saved CV-database searches with new matching candidates. */
export const handleCvSearchAlertsDigest = (job: Job) => {
  logger.info(`Processing CV saved-search digest ${job.id}`);
  return runDigest({
    category: 'cv_search_alerts',
    role: 'EMPLOYER',
    async build(user, now) {
      const searches = await prisma.savedSearch.findMany({
        where: { userId: user.id, searchType: 'CANDIDATE_SEARCH' },
        select: { id: true, name: true, filters: true },
        take: 10,
      });
      if (searches.length === 0) return null;

      // ── Replay each saved filter set ──
      // This is the employer mirror of candidate job alerts, so it has to
      // answer the same question they do: "how many NEW results does MY saved
      // search have", not "how many profiles changed platform-wide".
      //
      // Deliberately called WITHOUT `searcherUserId`: passing it would meter
      // the query against the employer's SEARCH_RESULT credits, so simply
      // being notified would silently spend the results they paid for.
      const { candidateService } = await import('../services/candidate.service');
      const since = new Date(now.getTime() - days(7));

      const rows: Array<{ name: string; count: number }> = [];
      for (const saved of searches.slice(0, 5)) {
        try {
          const filters = (saved.filters ?? {}) as Record<string, unknown>;
          const { query, ...rest } = filters as { query?: string };
          const result = (await candidateService.searchCandidates(
            typeof query === 'string' ? query : '',
            {
              ...(rest as Record<string, never>),
              // The search API's own "profile changed since" filter — this is
              // what turns a saved search into an ALERT rather than a re-count
              // of everything it has ever matched.
              modifiedAfter: since.toISOString(),
              limit: 1,
            } as never
          )) as { pagination?: { total?: number } };
          const count = result?.pagination?.total ?? 0;
          if (count > 0) rows.push({ name: saved.name, count });
        } catch (err) {
          // A saved search with filters the current schema no longer accepts
          // must not sink the whole digest.
          logger.warn(`Saved search ${saved.id} could not be replayed:`, err);
        }
      }
      if (rows.length === 0) return null;

      const freshCandidates = rows.reduce((a, r) => a + r.count, 0);
      const tmpl = cvSearchAlerts(name(user), rows, freshCandidates);
      return {
        title: 'New Candidates In Your Saved Searches',
        message: `${freshCandidates} new candidate(s) across ${rows.length} saved search(es).`,
        link: '/employer/candidates',
        metadata: { total: freshCandidates, searches: searches.length },
        ...tmpl,
      };
    },
  });
};

/* ═══════════════ EVENT-TRIGGERED, POLICY-GATED ═══════════════ */

/**
 * "More roles like the one you applied to."
 *
 * Triggered by an application rather than a clock, but routed through the same
 * policy gate as the digests — so it obeys quiet hours, the shared daily cap,
 * and a WEEKLY rate limit. Someone applying to ten roles in an afternoon gets
 * one follow-up, not ten; the queue job is keyed on the candidate so the burst
 * collapses before it ever reaches here.
 */
export async function handleSimilarJobsNudge(job: Job) {
  const {
    userId,
    jobId,
    reason = 'applied',
  } = job.data as {
    userId: string;
    jobId: string;
    reason?: 'applied' | 'rejected';
  };
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      email: true,
      isEmailVerified: true,
      isActive: true,
      isSuspended: true,
    },
  });
  if (!user || !user.isActive || user.isSuspended || !user.isEmailVerified) return { sent: 0 };

  const last = await prisma.notification.findFirst({
    where: { userId, category: 'similar_jobs' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const decision = await digestPolicy.canSend(userId, 'similar_jobs', last?.createdAt ?? null, now);
  if (!decision.ok) {
    logger.info(`Similar-jobs nudge skipped for ${userId}: ${decision.reason}`);
    return { sent: 0, reason: decision.reason };
  }

  const source = await prisma.jobPost.findUnique({
    where: { id: jobId },
    select: { title: true, roleCategory: true, skillsRequired: true, companyId: true },
  });
  if (!source) return { sent: 0 };

  // Similar = same role category, or overlapping required skills. Deliberately
  // NOT the full 13-dimension scorer: this is "more like THIS job", not "more
  // like your profile" — the recommendation digest already does the latter.
  const applied = await prisma.jobApplication.findMany({
    where: { candidateId: userId },
    select: { jobId: true },
  });
  const excludeIds = [jobId, ...applied.map((a) => a.jobId)];

  const similar = await prisma.jobPost.findMany({
    where: {
      status: 'OPEN',
      id: { notIn: excludeIds },
      // Not the same company — "more of the same employer" reads as a plug.
      companyId: { not: source.companyId },
      OR: [
        ...(source.roleCategory ? [{ roleCategory: source.roleCategory }] : []),
        ...(source.skillsRequired.length
          ? [{ skillsRequired: { hasSome: source.skillsRequired.slice(0, 10) } }]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      location: true,
      company: { select: { companyName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (similar.length === 0) return { sent: 0, reason: 'no_similar' };

  const tmpl = similarJobs(
    user.firstName || 'there',
    source.title,
    similar.map((j) => ({
      title: j.title,
      company: j.company?.companyName ?? '',
      location: j.location,
      jobId: j.id,
    })),
    reason
  );

  await notificationService.send({
    userId,
    title: reason === 'rejected' ? 'Other Roles That Fit You' : 'More Roles Like That One',
    message: `${similar.length} more role(s) like ${source.title}.`,
    category: 'similar_jobs',
    link: '/candidate/jobs',
    metadata: { sourceJobId: jobId, jobIds: similar.map((j) => j.id) },
    channels: CHANNELS,
    emailOptions: { to: user.email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text },
  });

  logger.info(`Similar-jobs nudge sent to ${userId} (${similar.length} roles)`);
  return { sent: 1 };
}
