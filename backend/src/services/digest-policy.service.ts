import { prisma } from '../config/prisma';
import logger from '../config/logger';

/**
 * Policy layer for RECURRING notifications (digests, nudges, recommendations).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `notificationService.filterByPreferences` already answers "may I use this
 * CHANNEL for this user". That is necessary but not sufficient for scheduled
 * sends, which differ from event-driven ones in three ways:
 *
 *   1. **Cadence is per-category, not per-channel.** "Weekly job
 *      recommendations, but never a profile-view digest" is a normal request
 *      and cannot be expressed with channel booleans alone.
 *   2. **Timing matters.** A 09:00 cron is 03:30 for a user who set their
 *      timezone to something else; transactional mail can ignore that,
 *      marketing mail cannot.
 *   3. **They compound.** Alerts, matches and digests are separate senders
 *      with no knowledge of each other. Ship five recurring senders with no
 *      shared budget and a candidate can receive four messages before
 *      breakfast — which is how you train people to mute you, and on
 *      WhatsApp how you get the sender blocked for frequency.
 *
 * Every recurring sender asks `canSend()` before doing work. Event-driven and
 * security notifications never come through here.
 *
 * ── Storage ──
 * Preferences live in the existing `notificationPreferences` JSON on
 * CandidateProfile / CompanyProfile, under a `digests` key, so nothing needs a
 * migration and old rows keep working. Absent = default, which is ON at the
 * documented cadence — opt-OUT, matching the rest of the system.
 */

export type DigestCadence = 'DAILY' | 'WEEKLY' | 'OFF';

/** Every recurring notification class. The key is what callers pass to `canSend`. */
export const DIGEST_CATEGORIES = {
  /** Candidate: "Jobs for you" — the scored recommendation digest. */
  job_recommendations: { audience: 'CANDIDATE', default: 'WEEKLY' },
  /** Candidate: companies they follow just posted. */
  followed_company_jobs: { audience: 'CANDIDATE', default: 'WEEKLY' },
  /** Candidate: "N recruiters viewed your profile". */
  profile_views: { audience: 'CANDIDATE', default: 'WEEKLY' },
  /** Candidate: saved jobs about to close. */
  saved_jobs_closing: { audience: 'CANDIDATE', default: 'DAILY' },
  /**
   * Candidate: "more roles like the one you applied to".
   * Event-TRIGGERED but policy-gated, and the cadence acts as a rate limit —
   * someone who applies to ten jobs in an afternoon gets one follow-up, not
   * ten. WEEKLY default for exactly that reason.
   */
  similar_jobs: { audience: 'CANDIDATE', default: 'WEEKLY' },
  /** Employer: new candidates matching their open roles. */
  candidate_recommendations: { audience: 'EMPLOYER', default: 'WEEKLY' },
  /** Employer: applications sitting unreviewed. */
  applications_awaiting: { audience: 'EMPLOYER', default: 'DAILY' },
  /** Employer: saved CV-database searches with new hits. */
  cv_search_alerts: { audience: 'EMPLOYER', default: 'WEEKLY' },
} as const;

export type DigestCategory = keyof typeof DIGEST_CATEGORIES;

/**
 * Ceiling on recurring messages per user per rolling 24h, across ALL digest
 * categories. Event-driven and security notifications do not count and are
 * never blocked by it.
 */
const DAILY_RECURRING_CAP = Number(process.env.DIGEST_DAILY_CAP ?? 2);

/** Default quiet window in the user's local time — no marketing-class sends. */
const DEFAULT_QUIET_START = 21; // 21:00
const DEFAULT_QUIET_END = 8; // 08:00

interface DigestPrefs {
  digests?: Partial<Record<DigestCategory, DigestCadence>>;
  quietHours?: { start?: number; end?: number; enabled?: boolean };
  timezone?: string;
}

export interface DigestDecision {
  ok: boolean;
  /** Machine-readable reason, for logging and for the ops dashboard. */
  reason?: 'opted_out' | 'not_due' | 'quiet_hours' | 'rate_capped' | 'no_profile';
}

/** Read the digest block out of the role-appropriate profile. */
async function loadPrefs(userId: string): Promise<{ prefs: DigestPrefs; role: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return null;

  let raw: unknown = null;
  if (user.role === 'CANDIDATE') {
    const p = await prisma.candidateProfile.findUnique({
      where: { userId },
      select: { notificationPreferences: true },
    });
    raw = p?.notificationPreferences ?? null;
  } else if (user.role === 'EMPLOYER') {
    const p = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { notificationPreferences: true },
    });
    raw = p?.notificationPreferences ?? null;
  }
  return { prefs: (raw as DigestPrefs) ?? {}, role: user.role };
}

/** The cadence this user has chosen for a category, or its documented default. */
export function resolveCadence(prefs: DigestPrefs, category: DigestCategory): DigestCadence {
  const chosen = prefs.digests?.[category];
  if (chosen === 'DAILY' || chosen === 'WEEKLY' || chosen === 'OFF') return chosen;
  return DIGEST_CATEGORIES[category].default as DigestCadence;
}

/** True when `now` falls inside the user's quiet window (local hours). */
export function inQuietHours(prefs: DigestPrefs, now = new Date()): boolean {
  if (prefs.quietHours?.enabled === false) return false;
  const start = prefs.quietHours?.start ?? DEFAULT_QUIET_START;
  const end = prefs.quietHours?.end ?? DEFAULT_QUIET_END;

  let hour: number;
  try {
    // The user's own timezone when we know it — a 09:00 IST cron is the middle
    // of the night for a candidate who moved to another region.
    hour = prefs.timezone
      ? Number(
          new Intl.DateTimeFormat('en-GB', {
            hour: 'numeric',
            hour12: false,
            timeZone: prefs.timezone,
          }).format(now)
        )
      : now.getHours();
  } catch {
    hour = now.getHours();
  }

  // Windows that cross midnight (21:00 → 08:00) are the normal case.
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * Should this recurring notification be sent to this user right now?
 *
 * `lastSentAt` is the caller's own record of when it last sent THIS category
 * (its cron row, its `lastNotifiedAt` column, whatever it keeps) — the policy
 * layer deliberately does not own per-category state, so a sender can be added
 * without a schema change.
 */
export async function canSend(
  userId: string,
  category: DigestCategory,
  lastSentAt?: Date | null,
  now = new Date()
): Promise<DigestDecision> {
  try {
    const loaded = await loadPrefs(userId);
    if (!loaded) return { ok: false, reason: 'no_profile' };

    const cadence = resolveCadence(loaded.prefs, category);
    if (cadence === 'OFF') return { ok: false, reason: 'opted_out' };

    // Due yet?
    if (lastSentAt) {
      const elapsed = now.getTime() - lastSentAt.getTime();
      const period = cadence === 'DAILY' ? 22 * 3600_000 : 6.5 * 24 * 3600_000;
      // Slightly under a full day/week so a cron that drifts by minutes does
      // not skip an entire cycle.
      if (elapsed < period) return { ok: false, reason: 'not_due' };
    }

    if (inQuietHours(loaded.prefs, now)) return { ok: false, reason: 'quiet_hours' };

    // Shared budget across every recurring category.
    const since = new Date(now.getTime() - 24 * 3600_000);
    const recent = await prisma.notification.count({
      where: {
        userId,
        createdAt: { gte: since },
        category: { in: Object.keys(DIGEST_CATEGORIES) },
      },
    });
    if (recent >= DAILY_RECURRING_CAP) return { ok: false, reason: 'rate_capped' };

    return { ok: true };
  } catch (error) {
    // Fail CLOSED here, unlike channel filtering. A policy error should not
    // turn into unsolicited marketing volume; the next cron tick retries.
    logger.error(`digest-policy canSend failed for ${userId}/${category}:`, error);
    return { ok: false, reason: 'no_profile' };
  }
}

/**
 * Bulk pre-filter for the cron path.
 *
 * A weekly digest cron walks thousands of users; calling `canSend` per user
 * costs 3 queries each. This resolves the SHARED budget for a whole batch in
 * one query and returns the users still under it, so the per-user check only
 * runs for plausible recipients.
 */
export async function underDailyCap(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const rows = await prisma.notification.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      createdAt: { gte: since },
      category: { in: Object.keys(DIGEST_CATEGORIES) },
    },
    _count: { _all: true },
  });
  const over = new Set(
    rows.filter((r) => r._count._all >= DAILY_RECURRING_CAP).map((r) => r.userId)
  );
  return new Set(userIds.filter((id) => !over.has(id)));
}

export const digestPolicy = { canSend, underDailyCap, resolveCadence, inQuietHours };
