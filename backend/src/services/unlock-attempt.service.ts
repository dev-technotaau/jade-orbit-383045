import crypto from 'crypto';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { AuditService } from './audit.service';
import { unlockAttemptsTotal, unlockFailureStreak } from '../utils/whatsapp-metrics';

/**
 * Visibility and friction for attempts against the one credential in the system.
 *
 * ── Why not a lockout ──
 * The obvious answer to "someone is guessing the password" is to lock the
 * account. Here that would be a gift to an attacker: there is exactly ONE
 * credential shared by the whole team, so a lockout is a button anyone on the
 * internet can press to take the entire operations console offline — during a
 * campaign, with customers waiting on replies. The cure is worse than the
 * disease, so there is deliberately no hard lockout.
 *
 * ── What was actually missing ──
 * Not blocking: *seeing*. A wrong password produced a bare 401 — no audit row,
 * no metric, no log line. Someone could grind away for a week and leave no
 * trace anywhere an operator would look. Rate limiting was the only response,
 * and rate limiting you cannot observe is indistinguishable from none.
 *
 * So: every attempt is counted and audited, sustained failure raises a metric an
 * alert can fire on, and repeated failures from one address get progressively
 * slower. Delay is the right tool — it costs an attacker linearly while a
 * legitimate operator who fat-fingers their password twice never notices.
 */

/** Failures from one address before delay kicks in. */
const DELAY_AFTER = 3;
/** Added per failure past the threshold. */
const DELAY_STEP_MS = 500;
/** Ceiling, so a request can never outlive the 30s request timeout. */
const DELAY_MAX_MS = 8000;
/** How long a failure streak is remembered. */
const STREAK_TTL_SECONDS = 15 * 60;
/** Streak length that escalates the log to error (i.e. wake someone up). */
const ALERT_STREAK = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hash the address so the streak key never carries a raw IP into Redis. */
function streakKey(ip: string): string {
  return `wa:unlock:fail:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

/**
 * Current consecutive-failure count for an address. Best-effort: a Redis
 * outage means no delay, never a blocked login.
 */
async function currentStreak(ip: string): Promise<number> {
  try {
    const n = await redis.get(streakKey(ip));
    return n ? parseInt(n, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Slow down a caller that keeps getting it wrong, BEFORE the comparison runs so
 * the delay cannot be used to distinguish "wrong password" from "right password"
 * by timing. Returns the milliseconds waited, for logging.
 */
export async function applyProgressiveDelay(ip: string): Promise<number> {
  const streak = await currentStreak(ip);
  if (streak < DELAY_AFTER) return 0;
  const delay = Math.min((streak - DELAY_AFTER + 1) * DELAY_STEP_MS, DELAY_MAX_MS);
  await sleep(delay);
  return delay;
}

/**
 * Record a failed unlock: bump the streak, count it, audit it, and escalate the
 * log once a streak looks like an attack rather than a typo.
 */
export async function recordUnlockFailure(opts: {
  ip: string;
  userAgent?: string;
  reason: 'bad_password' | 'bad_mfa_code' | 'bad_recovery_code' | 'expired_challenge';
}): Promise<void> {
  const { ip, userAgent, reason } = opts;
  unlockAttemptsTotal.inc({ outcome: 'failure', reason });

  let streak = 0;
  try {
    const key = streakKey(ip);
    streak = await redis.incr(key);
    await redis.expire(key, STREAK_TTL_SECONDS);
    unlockFailureStreak.set({ scope: 'max' }, streak);
  } catch {
    /* Redis down — we still audit below, which is the part that matters */
  }

  const line = `Unlock failed (${reason}) from ${ip}${streak ? ` — ${streak} consecutive` : ''}`;
  if (streak >= ALERT_STREAK) {
    logger.error(`${line}. Sustained credential attack on the app password.`);
  } else {
    logger.warn(line);
  }

  // Durable, queryable, and swept by the retention cron like every other audit
  // row. This is what makes "was anyone attacking us last Tuesday" answerable.
  void AuditService.log({
    action: 'UNLOCK_FAILED',
    entity: 'Session',
    performedBy: 'anonymous',
    details: { reason, consecutiveFailures: streak },
    ipAddress: ip,
    userAgent,
  });
}

/** Record a successful unlock and clear the address's failure streak. */
export async function recordUnlockSuccess(opts: {
  ip: string;
  userAgent?: string;
  mfa: 'not_required' | 'totp' | 'recovery_code' | 'trusted_device';
}): Promise<void> {
  const { ip, userAgent, mfa } = opts;
  unlockAttemptsTotal.inc({ outcome: 'success', reason: mfa });

  try {
    await redis.del(streakKey(ip));
    unlockFailureStreak.set({ scope: 'max' }, 0);
  } catch {
    /* best-effort */
  }

  void AuditService.log({
    action: 'UNLOCK_SUCCEEDED',
    entity: 'Session',
    performedBy: 'operator',
    details: { secondFactor: mfa },
    ipAddress: ip,
    userAgent,
  });
}
