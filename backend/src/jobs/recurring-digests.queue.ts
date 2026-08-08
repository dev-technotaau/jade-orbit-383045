import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

/**
 * Cron registration for the six recurring digests.
 *
 * ── Why the times are spread out ──
 * Every one of these is gated by the same shared daily cap, so if they all
 * fired at 09:00 the winner would simply be whichever cron happened to run
 * first — a race deciding which digest a user receives. Staggering them makes
 * the priority explicit and stable:
 *
 *   08:30  job recommendations      (registered separately — the headline one)
 *   08:45  saved jobs closing soon  (time-critical: the job expires)
 *   09:15  applications awaiting    (employer, actionable today)
 *   09:45  followed companies hiring
 *   10:15  candidate recommendations (employer, weekly)
 *   10:45  CV saved-search alerts   (employer, weekly)
 *   11:15  profile views            (lowest urgency, purely re-engagement)
 *
 * Each ticks DAILY; per-user cadence (WEEKLY default) is decided by
 * `digestPolicy.canSend`, so a daily tick does not mean a daily send.
 */
const CRONS: Array<[name: string, pattern: string, label: string]> = [
  ['digest-saved-jobs-closing', '45 8 * * *', 'saved jobs closing'],
  ['digest-applications-awaiting', '15 9 * * *', 'applications awaiting review'],
  ['digest-followed-companies', '45 9 * * *', 'followed companies hiring'],
  ['digest-candidate-recommendations', '15 10 * * *', 'employer candidate recommendations'],
  ['digest-cv-search-alerts', '45 10 * * *', 'CV saved-search alerts'],
  ['digest-profile-views', '15 11 * * *', 'profile views'],
];

for (const [jobName, pattern, label] of CRONS) {
  schedulerQueue
    .add(
      jobName,
      {},
      {
        repeat: { pattern },
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      }
    )
    .then(() => logger.info(`Registered digest cron: ${label} (${pattern})`))
    .catch((err) => logger.error(`Failed to register digest cron ${jobName}:`, err));
}
