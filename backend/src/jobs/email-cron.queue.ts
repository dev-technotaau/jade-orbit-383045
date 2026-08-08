import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Email periodic jobs (registered on the shared scheduler-queue, dispatched from
 * `scheduler.worker.ts`):
 *  - `email-run-scheduled-campaigns` every minute — launch campaigns whose scheduledAt arrived.
 *  - `email-drip-tick`               every 5m     — advance due SEQUENCE (drip) recipients.
 *  - `email-scheduled-tick`          every minute — dispatch due send-later inbox replies.
 *  - `email-campaign-recovery`       every 10m    — heal RUNNING campaigns (complete / re-batch).
 *  - `email-recurring-tick`          hourly       — re-run recurring campaigns whose nextRunAt arrived.
 *  - `email-prune-retention`         daily 03:45  — prune events/logs/inbound past retention.
 *  - `email-deliverability-verify`   daily 04:15  — verify default sender SPF/DKIM/DMARC.
 *  - `email-bulk-cleanup`            every 10m    — sweep expired undo snapshots + old bulk-job rows.
 */
const jobs: Array<[string, string]> = [
  ['email-run-scheduled-campaigns', '* * * * *'],
  ['email-drip-tick', '*/5 * * * *'],
  ['email-scheduled-tick', '* * * * *'],
  ['email-campaign-recovery', '*/10 * * * *'],
  ['email-recurring-tick', '0 * * * *'],
  ['email-prune-retention', '45 3 * * *'],
  ['email-deliverability-verify', '15 4 * * *'],
  ['email-bulk-cleanup', '*/10 * * * *'],
];

for (const [name, pattern] of jobs) {
  schedulerQueue
    .add(name, {}, { repeat: { pattern } })
    .then(() => logger.info(`Registered email cron: ${name} (${pattern})`))
    .catch((err) => logger.error(`Failed to register email cron ${name}:`, err));
}
