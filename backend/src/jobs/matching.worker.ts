import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { MATCHING_QUEUE_NAME, matchingQueue } from './matching.queue';
import { safeJobId } from './job-id';
import { matchingService } from '../services/matching.service';
import { notificationService } from '../services/notification.service';
import { prisma } from '../config/prisma';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface MatchCandidatesData {
  jobId: string;
}

interface MatchJobsData {
  userId: string;
}

type MatchingJobData = MatchCandidatesData | MatchJobsData;

/**
 * Quiet period between job-match sends to one candidate.
 *
 * NOT a flat delay. The first match after a quiet spell goes out
 * IMMEDIATELY — a single new job should feel like a single new job. Anything
 * that lands while the candidate is still inside the cooldown is queued to
 * the END of it, so a bulk posting session becomes one digest instead of
 * twenty messages. That gives instant delivery in the common case and
 * batching only where batching is actually needed.
 */
const MATCH_COOLDOWN_MS = Number(process.env.MATCH_DIGEST_COOLDOWN_MS ?? 10 * 60 * 1000);

/** Ceiling on how many pending matches one digest will consider. */
const MATCH_DIGEST_MAX_ROWS = 100;

export function createMatchingWorker(): Worker<MatchingJobData> {
  const worker = new Worker<MatchingJobData>(
    MATCHING_QUEUE_NAME,
    async (job: Job<MatchingJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 60_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            const processJob = async () => {
              switch (job.name) {
                case 'match-candidates': {
                  const { jobId } = job.data as MatchCandidatesData;
                  logger.info(`Processing match-candidates job ${job.id} for jobId=${jobId}`);

                  const matches = await matchingService.findMatchingCandidates(jobId);
                  logger.info(`Found ${matches.length} candidate matches for job ${jobId}`);

                  // Load job details for notification
                  const jobDetails = await prisma.jobPost.findUnique({
                    where: { id: jobId },
                    include: { company: true },
                  });

                  if (!jobDetails) {
                    logger.warn(`Job ${jobId} not found, skipping notifications`);
                    return { matchCount: 0 };
                  }

                  const jobTitle = jobDetails.title;
                  // (company name is resolved by the digest handler at send time)

                  // ── When each candidate was last told about a match ──
                  // Resolved in ONE grouped query up front rather than per
                  // candidate: a popular job matches hundreds of people, and
                  // a lookup inside the loop would multiply the round-trips.
                  const eligible = matches.filter((m) => m.score >= 0.5);
                  const lastSentByCandidate = new Map<string, number>();
                  if (eligible.length > 0) {
                    const rows = await prisma.jobCandidateMatch.groupBy({
                      by: ['candidateId'],
                      where: {
                        candidateId: { in: eligible.map((m) => m.userId) },
                        notificationsSent: true,
                        notifiedAt: { not: null },
                      },
                      _max: { notifiedAt: true },
                    });
                    for (const r of rows) {
                      if (r._max.notifiedAt) {
                        lastSentByCandidate.set(r.candidateId, r._max.notifiedAt.getTime());
                      }
                    }
                  }
                  const now = Date.now();

                  let notified = 0;
                  for (const match of matches) {
                    if (match.score >= 0.5) {
                      try {
                        // Create JobCandidateMatch record
                        await prisma.jobCandidateMatch.upsert({
                          where: {
                            jobId_candidateId: {
                              jobId,
                              candidateId: match.userId,
                            },
                          },
                          update: {
                            matchScore: match.score,
                          },
                          create: {
                            jobId,
                            candidateId: match.userId,
                            matchScore: match.score,
                            notificationsSent: false,
                          },
                        });

                        // ── Coalesce instead of sending inline ──
                        // One message per candidate per job is fine for ONE
                        // job, but an employer bulk-posting 20 roles fires 20
                        // separate match-candidates runs, and a candidate
                        // matching all of them got 20 messages minutes apart.
                        // Enqueue a DELAYED per-candidate digest keyed on the
                        // candidate: BullMQ rejects a duplicate jobId, so
                        // every job posted inside the window collapses into
                        // the single digest already scheduled for them.
                        // The row above is the pending-work ledger the digest
                        // reads, so nothing is lost if the enqueue is a no-op.
                        // Immediate if this candidate is outside the cooldown;
                        // otherwise scheduled for the moment it lapses, so a
                        // burst lands as one digest at the end of the window.
                        const lastSent = lastSentByCandidate.get(match.userId);
                        const delay =
                          lastSent === undefined
                            ? 0
                            : Math.max(0, MATCH_COOLDOWN_MS - (now - lastSent));

                        await matchingQueue.add(
                          'notify-match-digest',
                          { userId: match.userId },
                          { jobId: safeJobId('match-digest', match.userId), delay }
                        );

                        notified++;
                      } catch (error) {
                        logger.error(
                          `Failed to notify candidate ${match.userId} about job ${jobId}`,
                          error
                        );
                      }
                    }
                  }

                  // Notify employer about matching candidates
                  if (notified > 0 && jobDetails.company?.userId) {
                    notificationService
                      .notifyMatchingCandidatesFound(
                        jobDetails.company.userId,
                        jobId,
                        jobTitle,
                        notified
                      )
                      .catch(() => {});
                  }

                  logger.info(`Notified ${notified} candidates for job ${jobId}`);
                  return { matchCount: matches.length, notifiedCount: notified };
                }

                case 'match-jobs': {
                  const { userId } = job.data as MatchJobsData;
                  logger.info(`Processing match-jobs job ${job.id} for userId=${userId}`);

                  const matches = await matchingService.findMatchingJobs(userId);
                  logger.info(
                    `Found ${matches.length} job matches for user ${userId}: ${matches
                      .map((m) => `${m.title} (${Math.round(m.score * 100)}%)`)
                      .join(', ')}`
                  );

                  // ── ONE digest, not one message per job ──
                  // This loop used to call notifyJobMatch per match, so a
                  // candidate matching 100 open roles got 100 emails + 100
                  // WhatsApp templates + 100 SMS in a single burst. Now the
                  // whole set becomes a single "top 5 + view all" message.
                  const relevant = matches
                    .filter((m) => m.score >= 0.5)
                    .sort((a, b) => b.score - a.score);

                  if (relevant.length === 0) {
                    logger.info(`No matches above threshold for user ${userId}`);
                    return { matchCount: matches.length, notifiedCount: 0 };
                  }

                  // `JobCandidateMatch` is the dedup ledger for BOTH matcher
                  // directions. Recording first, then filtering on what was
                  // actually new, means a re-run (profile edited twice, resume
                  // re-parsed) never re-announces jobs the candidate has
                  // already been told about.
                  const alreadyNotified = await prisma.jobCandidateMatch.findMany({
                    where: {
                      candidateId: userId,
                      jobId: { in: relevant.map((m) => m.jobId) },
                      notificationsSent: true,
                    },
                    select: { jobId: true },
                  });
                  const seen = new Set(alreadyNotified.map((r) => r.jobId));
                  const fresh = relevant.filter((m) => !seen.has(m.jobId));

                  if (fresh.length === 0) {
                    logger.info(`All ${relevant.length} matches already notified for ${userId}`);
                    return { matchCount: matches.length, notifiedCount: 0 };
                  }

                  for (const m of fresh) {
                    await prisma.jobCandidateMatch.upsert({
                      where: { jobId_candidateId: { jobId: m.jobId, candidateId: userId } },
                      update: { matchScore: m.score },
                      create: {
                        jobId: m.jobId,
                        candidateId: userId,
                        matchScore: m.score,
                        notificationsSent: false,
                      },
                    });
                  }

                  let notified = 0;
                  try {
                    await notificationService.notifyJobMatchDigest(
                      userId,
                      fresh.map((m) => ({
                        jobId: m.jobId,
                        title: m.title,
                        companyName: m.companyName,
                        // JobMatch carries no location; the digest omits it.
                        score: m.score,
                      }))
                    );

                    // Marked only after the send resolves, so a failed digest
                    // is retried by the next run rather than silently dropped.
                    await prisma.jobCandidateMatch.updateMany({
                      where: { candidateId: userId, jobId: { in: fresh.map((m) => m.jobId) } },
                      data: {
                        notificationsSent: true,
                        emailSent: true,
                        pushSent: true,
                        smsSent: true,
                        whatsappSent: true,
                        notifiedAt: new Date(),
                      },
                    });
                    notified = fresh.length;
                  } catch (error) {
                    logger.error(`Failed to send job-match digest to user ${userId}`, error);
                  }

                  logger.info(
                    `Sent 1 digest to user ${userId} covering ${notified} matching jobs ` +
                      `(${relevant.length - fresh.length} already notified)`
                  );
                  return { matchCount: matches.length, notifiedCount: notified, digests: 1 };
                }

                case 'notify-similar-jobs': {
                  const { handleSimilarJobsNudge } = await import('./recurring-digests.worker');
                  return handleSimilarJobsNudge(job as Job);
                }

                case 'notify-match-digest': {
                  // The coalesced send for the employer-post direction. Every
                  // JobCandidateMatch row still flagged unsent for this
                  // candidate becomes ONE "top 5 + view all" message.
                  const { userId } = job.data as MatchJobsData;

                  const pending = await prisma.jobCandidateMatch.findMany({
                    where: { candidateId: userId, notificationsSent: false },
                    orderBy: { matchScore: 'desc' },
                    take: MATCH_DIGEST_MAX_ROWS,
                    include: {
                      job: {
                        select: {
                          id: true,
                          title: true,
                          status: true,
                          company: { select: { companyName: true } },
                        },
                      },
                    },
                  });

                  // A job closed or expired between the match and the digest
                  // should not be advertised — but its row is still cleared so
                  // it cannot linger and be re-sent forever.
                  const sendable = pending.filter((p) => p.job && p.job.status === 'OPEN');

                  if (sendable.length === 0) {
                    if (pending.length > 0) {
                      await prisma.jobCandidateMatch.updateMany({
                        where: { id: { in: pending.map((p) => p.id) } },
                        data: { notificationsSent: true, notifiedAt: new Date() },
                      });
                    }
                    logger.info(`Match digest for ${userId}: nothing sendable`);
                    return { notifiedCount: 0 };
                  }

                  await notificationService.notifyJobMatchDigest(
                    userId,
                    sendable.map((p) => ({
                      jobId: p.jobId,
                      title: p.job!.title,
                      companyName: p.job!.company?.companyName || '',
                      score: p.matchScore ?? 0,
                    }))
                  );

                  await prisma.jobCandidateMatch.updateMany({
                    where: { id: { in: pending.map((p) => p.id) } },
                    data: {
                      notificationsSent: true,
                      emailSent: true,
                      pushSent: true,
                      smsSent: true,
                      whatsappSent: true,
                      notifiedAt: new Date(),
                    },
                  });

                  logger.info(
                    `Sent 1 match digest to ${userId} covering ${sendable.length} job(s)`
                  );
                  return { notifiedCount: sendable.length, digests: 1 };
                }

                default:
                  logger.warn(`Unknown matching job name: ${job.name}`);
                  return null;
              }
            };

            return await Promise.race([
              processJob(),
              new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('Matching worker timeout after 60s')), TIMEOUT_MS)
              ),
            ]);
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_MATCHING_CONCURRENCY, 10),
      lockDuration: 300000, // 5 min — matching is CPU/IO heavy
      stalledInterval: 120000,
      limiter: {
        max: 5,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Matching job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Matching job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  return worker;
}
