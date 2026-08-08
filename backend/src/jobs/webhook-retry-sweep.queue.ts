import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Webhook retry sweep cron — runs every 5 minutes.
 *
 * Razorpay webhook events that exhaust BullMQ's 5 in-queue attempts land in
 * `RazorpayWebhookEvent.status = FAILED` (per `processWebhookEvent` in
 * `razorpay-webhook.service.ts`). Without an automated sweep these rows sit
 * forever until a super-admin manually replays them.
 *
 * This sweep finds FAILED rows whose `retryCount` is still under
 * `WEBHOOK_RETRY_MAX_ATTEMPTS` (default 10 — 5 BullMQ attempts + 5 sweep
 * attempts) and re-enqueues them into `razorpayWebhookQueue` for another
 * round. After the cap is reached they're left for manual replay.
 *
 * Dispatched from `scheduler.worker.ts` → `handleWebhookRetrySweep`.
 *
 * Plan §3.7 line 267.
 */
schedulerQueue
  .add('webhook-retry-sweep', {}, { repeat: { pattern: '*/5 * * * *' } })
  .then(() => logger.info('Registered webhook-retry-sweep cron: */5 * * * *'))
  .catch((err) => logger.error('Failed to register webhook-retry-sweep cron:', err));
