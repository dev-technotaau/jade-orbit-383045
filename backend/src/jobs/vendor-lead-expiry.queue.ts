import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Vendor lead expiry cron — runs hourly to flip PENDING leads past
 * their `expiresAt` to status EXPIRED.
 *
 * Vendors get 14 days by default to respond to a lead before it's
 * removed from their inbox; the employer-side UI shows responded /
 * expired status so they know whether to follow up elsewhere.
 *
 * Dispatched from `scheduler.worker.ts` → `handleVendorLeadExpiry`.
 */
schedulerQueue
  .add('vendor-lead-expiry-sweep', {}, { repeat: { pattern: '0 * * * *' } })
  .then(() => logger.info('Registered vendor-lead-expiry cron: 0 * * * *'))
  .catch((err) => logger.error('Failed to register vendor-lead-expiry cron:', err));
