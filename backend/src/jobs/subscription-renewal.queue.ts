import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Pre-renewal validation cron — runs every 30 min to find subscriptions
 * whose `nextChargeAt` falls within the next 24h and:
 *
 *   1. Reconciles state with Razorpay (in case a webhook was missed)
 *   2. Confirms the attached mandate is still ACTIVE / CONFIRMED
 *   3. Pre-validates the buyer's plan tier (e.g. user not suspended)
 *   4. Emits a `BillingNotification` (REMINDER_1) if not already sent
 *
 * The actual charge is initiated by Razorpay itself (eMandate / UPI AutoPay
 * scheduler). This worker is a defensive net to catch silent failures
 * before they manifest as `subscription.charged_failed`.
 *
 * Dispatched from `scheduler.worker.ts` → `handleSubscriptionRenewal`.
 */
schedulerQueue
  .add('subscription-renewal-precheck', {}, { repeat: { pattern: '*/30 * * * *' } })
  .then(() => logger.info('Registered subscription-renewal precheck cron: */30 * * * *'))
  .catch((err) => logger.error('Failed to register subscription-renewal cron:', err));
