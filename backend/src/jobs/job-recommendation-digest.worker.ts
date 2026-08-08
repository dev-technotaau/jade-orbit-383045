import type { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { matchingService } from '../services/matching.service';
import { notificationService } from '../services/notification.service';
import { digestPolicy } from '../services/digest-policy.service';

/**
 * The scheduled "Jobs for you" digest.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Fills the one real gap in the matching system: matches were purely
 * event-driven. A candidate only heard from us when THEY changed something
 * (profile edit, resume upload) or when an employer happened to post a role
 * they scored on. A candidate who finished their profile in March and went
 * quiet never heard from us again, no matter how many relevant jobs appeared.
 *
 * ── Shape ──
 * Walks candidates in batches, asks the policy layer who is due, re-runs the
 * scorer for those, drops jobs they have already been told about or actively
 * dismissed, and sends ONE digest. Everything expensive happens only for
 * candidates who passed the cheap checks first.
 */

/** Users pulled per page — bounds memory on a platform-wide sweep. */
const BATCH = 200;

/** Don't bother a candidate whose best match is weak. */
const MIN_SCORE = 0.5;

/** Matches enumerated inline; the rest sit behind "view all". */
const TOP_N = 5;

/**
 * Candidates untouched for longer than this are skipped entirely. Someone who
 * has not opened the platform in six months does not want a weekly email —
 * they want to be left alone, and continuing to mail them is what turns a
 * sender reputation bad.
 */
const MAX_DORMANCY_DAYS = 180;

export async function handleJobRecommendationDigest(job: Job) {
  logger.info(`Processing job recommendation digest ${job.id}`);

  const now = new Date();
  const dormantBefore = new Date(now.getTime() - MAX_DORMANCY_DAYS * 86400_000);

  let cursor: string | undefined;
  let scanned = 0;
  let sent = 0;
  const skipped: Record<string, number> = {};

  const bump = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (;;) {
    const candidates = await prisma.user.findMany({
      where: {
        role: 'CANDIDATE',
        isActive: true,
        isSuspended: false,
        // No point scoring someone we cannot reach on any durable channel.
        OR: [{ isEmailVerified: true }, { isWhatsappVerified: true }],
      },
      select: { id: true, lastActiveAt: true, createdAt: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1]!.id;
    scanned += candidates.length;

    // Dormancy filtered in JS: the OR of two nullable date columns is clumsy
    // in Prisma and this list is already bounded to BATCH.
    const active = candidates.filter((c) => (c.lastActiveAt ?? c.createdAt) >= dormantBefore);
    for (let i = 0; i < candidates.length - active.length; i++) bump('dormant');

    if (active.length === 0) continue;

    // ── Cheap shared-budget filter first ──
    // One grouped query for the whole batch, so the per-user policy check
    // (3 queries each) only runs for plausible recipients.
    const underCap = await digestPolicy.underDailyCap(
      active.map((c) => c.id),
      now
    );
    for (const c of active) if (!underCap.has(c.id)) bump('rate_capped');

    const eligible = active.filter((c) => underCap.has(c.id));
    if (eligible.length === 0) continue;

    // When each of them last received THIS digest. Derived from the
    // notification history rather than a new column, so adding a digest
    // category never needs a migration.
    const lastSentRows = await prisma.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: eligible.map((c) => c.id) }, category: 'job_recommendations' },
      _max: { createdAt: true },
    });
    const lastSent = new Map(lastSentRows.map((r) => [r.userId, r._max.createdAt]));

    for (const candidate of eligible) {
      try {
        const decision = await digestPolicy.canSend(
          candidate.id,
          'job_recommendations',
          lastSent.get(candidate.id) ?? null,
          now
        );
        if (!decision.ok) {
          bump(decision.reason ?? 'unknown');
          continue;
        }

        const matches = (await matchingService.findMatchingJobs(candidate.id))
          .filter((m) => m.score >= MIN_SCORE)
          .sort((a, b) => b.score - a.score);

        if (matches.length === 0) {
          bump('no_matches');
          continue;
        }

        // Exclude anything already announced (either matcher direction) or
        // explicitly dismissed — re-sending a job someone swiped away is the
        // fastest way to make a recommendation feel broken.
        const jobIds = matches.map((m) => m.jobId);
        const [announced, dismissed] = await Promise.all([
          prisma.jobCandidateMatch.findMany({
            where: { candidateId: candidate.id, jobId: { in: jobIds }, notificationsSent: true },
            select: { jobId: true },
          }),
          prisma.dismissedRecommendation.findMany({
            where: { userId: candidate.id, jobId: { in: jobIds } },
            select: { jobId: true },
          }),
        ]);
        const exclude = new Set([
          ...announced.map((r) => r.jobId),
          ...dismissed.map((r) => r.jobId),
        ]);

        const fresh = matches.filter((m) => !exclude.has(m.jobId));
        if (fresh.length === 0) {
          bump('nothing_new');
          continue;
        }

        await notificationService.notifyJobMatchDigest(
          candidate.id,
          fresh.map((m) => ({
            jobId: m.jobId,
            title: m.title,
            companyName: m.companyName,
            score: m.score,
          })),
          TOP_N,
          'job_recommendations'
        );

        // Ledger them so neither this digest nor the event-driven matcher
        // repeats them next cycle.
        for (const m of fresh) {
          await prisma.jobCandidateMatch.upsert({
            where: { jobId_candidateId: { jobId: m.jobId, candidateId: candidate.id } },
            update: { matchScore: m.score, notificationsSent: true, notifiedAt: now },
            create: {
              jobId: m.jobId,
              candidateId: candidate.id,
              matchScore: m.score,
              notificationsSent: true,
              notifiedAt: now,
            },
          });
        }

        sent++;
      } catch (error) {
        logger.error(`Job recommendation digest failed for candidate ${candidate.id}:`, error);
      }
    }

    if (candidates.length < BATCH) break;
  }

  logger.info(
    `Job recommendation digest complete: scanned=${scanned} sent=${sent} ` +
      `skipped=${JSON.stringify(skipped)}`
  );
  return { scanned, sent, skipped };
}
