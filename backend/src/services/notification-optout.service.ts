import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { DIGEST_CATEGORIES, type DigestCategory } from './digest-policy.service';

/**
 * Turning a digest OFF from an email link.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Deliberately separate from the campaign unsubscribe path. A campaign
 * unsubscribe flips an `EmailContact` to UNSUBSCRIBED, which would be the
 * wrong outcome twice over here:
 *
 *   • it would silence a marketing CONTACT record the user may not even have,
 *     leaving the digest itself still on; and
 *   • it is all-or-nothing, when the whole point of the per-category
 *     preference is that turning off "Profile views" must not cost you
 *     application-status mail.
 *
 * So this writes the same `notificationPreferences.digests` block the
 * settings UI writes, and nothing else.
 */

/** Result of an opt-out attempt, for the landing page copy. */
export interface OptOutResult {
  ok: boolean;
  /** Human label of what was turned off. */
  what?: string;
}

const LABELS: Record<string, string> = {
  job_recommendations: 'Jobs for you',
  followed_company_jobs: 'Companies you follow',
  profile_views: 'Profile views',
  saved_jobs_closing: 'Saved jobs closing soon',
  similar_jobs: 'Similar job suggestions',
  candidate_recommendations: 'Candidate matches',
  applications_awaiting: 'Applications awaiting review',
  cv_search_alerts: 'Saved search alerts',
};

/**
 * Set one digest category — or every category — to OFF for a user.
 *
 * Idempotent: unsubscribing twice is a no-op, which matters because RFC 8058
 * one-click POSTs are retried by some providers.
 */
export async function optOutOfDigest(userId: string, category?: string): Promise<OptOutResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) return { ok: false };

    const valid =
      category && Object.prototype.hasOwnProperty.call(DIGEST_CATEGORIES, category)
        ? (category as DigestCategory)
        : undefined;
    // An unrecognised category (renamed or removed since the mail was sent)
    // falls back to switching everything off rather than silently doing
    // nothing — the user asked to stop hearing from us, so stop.
    const keys = valid ? [valid] : (Object.keys(DIGEST_CATEGORIES) as DigestCategory[]);

    const isCandidate = user.role === 'CANDIDATE';
    const model = isCandidate ? prisma.candidateProfile : prisma.companyProfile;

    const existing = await (model as typeof prisma.candidateProfile).findUnique({
      where: { userId },
      select: { notificationPreferences: true },
    });
    if (!existing) return { ok: false };

    const prefs = (existing.notificationPreferences as Record<string, unknown> | null) ?? {};
    const digests = { ...((prefs.digests as Record<string, string>) ?? {}) };
    for (const k of keys) digests[k] = 'OFF';

    await (model as typeof prisma.candidateProfile).update({
      where: { userId },
      data: { notificationPreferences: { ...prefs, digests } },
    });

    logger.info(`Digest opt-out for ${userId}: ${keys.join(', ')}`);
    return { ok: true, what: valid ? (LABELS[valid] ?? valid) : 'all summary emails' };
  } catch (error) {
    logger.error(`Digest opt-out failed for ${userId}:`, error);
    return { ok: false };
  }
}
