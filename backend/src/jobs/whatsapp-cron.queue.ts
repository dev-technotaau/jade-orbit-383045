import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * WhatsApp periodic jobs (registered on the shared scheduler-queue):
 *  - `wa-sync-templates`          every 6h     — refresh template status/quality from Meta.
 *  - `wa-run-scheduled-campaigns` every minute — launch campaigns whose scheduledAt arrived.
 *  - `wa-sync-channel-health`     every 15m    — pull live quality rating + tier from Meta.
 *  - `wa-prune-retention`         daily 03:30  — delete messages/events past the retention window.
 *  - `wa-event-recovery`          every 5m     — re-enqueue stuck inbound webhook events.
 *  - `wa-campaign-recovery`       every 10m    — heal RUNNING campaigns (complete / re-batch).
 *  - `wa-drip-tick`               every 5m     — advance due SEQUENCE (drip) recipients.
 *  - `wa-scheduled-tick`          every minute — dispatch due send-later scheduled messages.
 *  - `wa-recurring-tick`          hourly       — re-run recurring campaigns whose nextRunAt arrived.
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

schedulerQueue
  .add('wa-prune-retention', {}, { repeat: { pattern: '30 3 * * *' } })
  .then(() => logger.info('Registered WhatsApp retention-prune cron: 30 3 * * *'))
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
