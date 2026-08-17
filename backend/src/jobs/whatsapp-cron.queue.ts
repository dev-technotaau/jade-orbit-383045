import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Unregister a repeatable job of this name whose cron pattern is not the one
 * being registered.
 *
 * BullMQ keys a repeatable definition by name AND pattern, and the stale-job
 * sweep in jobs/index.ts only matches on NAME — so editing a cron expression in
 * this file leaves the OLD schedule live in Redis next to the new one, and the
 * job silently runs on both from then on. Anything that changes a pattern here
 * has to drop its own predecessor.
 *
 * Best-effort by design: a Redis hiccup must not stop the registration below,
 * because an unregistered cron is a worse outcome than a duplicated one, and the
 * next boot retries this anyway.
 */
async function dropOutdatedSchedule(name: string, pattern: string): Promise<void> {
  try {
    for (const job of await schedulerQueue.getRepeatableJobs()) {
      if (job.name !== name || job.pattern === pattern) continue;
      await schedulerQueue.removeRepeatableByKey(job.key);
      logger.info(`Removed outdated ${name} cron: ${job.pattern}`);
    }
  } catch (err) {
    logger.warn(`Could not check for an outdated ${name} cron:`, err);
  }
}

/**
 * WhatsApp periodic jobs (registered on the shared scheduler-queue):
 *  - `wa-sync-templates`          every 6h     — refresh template status/quality from Meta.
 *  - `wa-run-scheduled-campaigns` every minute — launch campaigns whose scheduledAt arrived.
 *  - `wa-sync-channel-health`     every 15m    — pull live quality rating + tier from Meta.
 *  - `wa-prune-retention`         hourly :30   — delete messages/events past the retention window.
 *  - `wa-event-recovery`          every 5m     — re-enqueue stuck inbound webhook events.
 *  - `wa-campaign-recovery`       every 10m    — heal RUNNING campaigns (complete / re-batch).
 *  - `wa-drip-tick`               every 5m     — advance due SEQUENCE (drip) recipients.
 *  - `wa-scheduled-tick`          every minute — dispatch due send-later scheduled messages.
 *  - `wa-recurring-tick`          hourly       — re-run recurring campaigns whose nextRunAt arrived.
 *  - `wa-media-reconcile`         daily 04:10  — delete archived R2 media no message references.
 *  - `wa-webhook-heartbeat`       every 15m    — alert when Meta stops delivering webhooks.
 *  - `wa-click-rollup`            daily 03:00  — aggregate raw link clicks before the prune deletes them.
 *  - `wa-message-rollup`          hourly :05   — aggregate message volume/cost so history survives the prune.
 *  - `wa-meta-cost-sync`          daily 04:30  — persist Meta's own billed volume/cost per day.
 *  - `wa-weekly-report`           Mon 06:00    — fan the weekly performance digest out to webhooks.
 * All are dispatched from `scheduler.worker.ts`.
 */
schedulerQueue
  .add('wa-sync-templates', {}, { repeat: { pattern: '0 */6 * * *' } })
  .then(() => logger.info('Registered WhatsApp template sync cron: 0 */6 * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp template sync cron:', err));

schedulerQueue
  .add('wa-run-scheduled-campaigns', {}, { repeat: { pattern: '* * * * *' } })
  .then(() => logger.info('Registered WhatsApp scheduled-campaign cron: * * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp scheduled-campaign cron:', err));

schedulerQueue
  .add('wa-sync-channel-health', {}, { repeat: { pattern: '*/15 * * * *' } })
  .then(() => logger.info('Registered WhatsApp channel-health cron: */15 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp channel-health cron:', err));

// HOURLY, not nightly. One pass a day can only ever delete what one pass has
// time for, so any deployment writing more rows per day than a single budgeted
// run can drain fell permanently behind its own retention policy — the backlog
// grew every day and the 14-day TTL on WaWebhookEvent, the shortest and most
// sensitive of them (it holds the plaintext copy of inbound message bodies), was
// never actually reached. Twenty-four smaller passes drain the same volume and
// then keep it drained, and each one is short enough not to sit on the shared
// scheduler queue.
const WA_PRUNE_PATTERN = '30 * * * *';
dropOutdatedSchedule('wa-prune-retention', WA_PRUNE_PATTERN)
  .then(() =>
    schedulerQueue.add('wa-prune-retention', {}, { repeat: { pattern: WA_PRUNE_PATTERN } })
  )
  .then(() => logger.info(`Registered WhatsApp retention-prune cron: ${WA_PRUNE_PATTERN}`))
  .catch((err) => logger.error('Failed to register WhatsApp retention-prune cron:', err));

schedulerQueue
  .add('wa-event-recovery', {}, { repeat: { pattern: '*/5 * * * *' } })
  .then(() => logger.info('Registered WhatsApp event-recovery cron: */5 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp event-recovery cron:', err));

schedulerQueue
  .add('wa-campaign-recovery', {}, { repeat: { pattern: '*/10 * * * *' } })
  .then(() => logger.info('Registered WhatsApp campaign-recovery cron: */10 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp campaign-recovery cron:', err));

schedulerQueue
  .add('wa-drip-tick', {}, { repeat: { pattern: '*/5 * * * *' } })
  .then(() => logger.info('Registered WhatsApp drip-tick cron: */5 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp drip-tick cron:', err));

schedulerQueue
  .add('wa-scheduled-tick', {}, { repeat: { pattern: '* * * * *' } })
  .then(() => logger.info('Registered WhatsApp scheduled-message cron: * * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp scheduled-message cron:', err));

schedulerQueue
  .add('wa-recurring-tick', {}, { repeat: { pattern: '0 * * * *' } })
  .then(() => logger.info('Registered WhatsApp recurring-campaign cron: 0 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp recurring-campaign cron:', err));

// 04:10 keeps the old off-peak slot, but there is no longer a single nightly
// prune to sit behind: the prune runs every hour, so an overlap is possible and
// harmless — a concurrent prune only ORPHANS more objects, which is exactly what
// this job then deletes on its next pass.
schedulerQueue
  .add('wa-media-reconcile', {}, { repeat: { pattern: '10 4 * * *' } })
  .then(() => logger.info('Registered WhatsApp media-reconcile cron: 10 4 * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp media-reconcile cron:', err));

// A silent webhook is the worst failure this module has: the inbox goes quiet,
// nothing errors, and Meta does not backfill what it did not deliver.
schedulerQueue
  .add('wa-webhook-heartbeat', {}, { repeat: { pattern: '*/15 * * * *' } })
  .then(() => logger.info('Registered WhatsApp webhook-heartbeat cron: */15 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp webhook-heartbeat cron:', err));

// The prune deletes raw clicks on a 180-day TTL, and without this rollup the
// click trend would go with them. The ordering is no longer load-bearing (the
// prune calls the same rollup itself before deleting clicks); this daily pass
// keeps the aggregate fresh for the dashboard rather than only at deletion time.
schedulerQueue
  .add('wa-click-rollup', {}, { repeat: { pattern: '0 3 * * *' } })
  .then(() => logger.info('Registered WhatsApp click-rollup cron: 0 3 * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp click-rollup cron:', err));

// HOURLY, unlike the click rollup: this aggregate is also what the dashboard
// reads for any day the prune has already deleted, so a once-a-day pass would
// leave up to 24 hours of history recoverable only from rows that a retention
// window measured in days may already have removed. Each pass rewrites the last
// three days, which is a bounded, indexed scan.
schedulerQueue
  .add('wa-message-rollup', {}, { repeat: { pattern: '5 * * * *' } })
  .then(() => logger.info('Registered WhatsApp message-rollup cron: 5 * * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp message-rollup cron:', err));

// Meta's authoritative billed cost, which the WHATSAPP_PRICE_*_PAISE estimate is
// checked against (and, once there is history, derived from).
schedulerQueue
  .add('wa-meta-cost-sync', {}, { repeat: { pattern: '30 4 * * *' } })
  .then(() => logger.info('Registered WhatsApp Meta cost-sync cron: 30 4 * * *'))
  .catch((err) => logger.error('Failed to register WhatsApp Meta cost-sync cron:', err));

// Monday morning, so the digest lands before the week starts.
schedulerQueue
  .add('wa-weekly-report', {}, { repeat: { pattern: '0 6 * * 1' } })
  .then(() => logger.info('Registered WhatsApp weekly-report cron: 0 6 * * 1'))
  .catch((err) => logger.error('Failed to register WhatsApp weekly-report cron:', err));
