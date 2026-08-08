import type { Job } from 'bullmq';
import {
  processDueRetries,
  autoRenewOneTimePlans,
  expireOverduePendingOrders,
} from '../services/payment-retry.service';
import logger from '../config/logger';

export async function handlePaymentRetry(
  job: Job
): Promise<{ processed: number; cancelled: number }> {
  logger.info(`Payment retry sweep ${job.id} starting`);
  return processDueRetries();
}

export async function handleExpirePendingOrders(job: Job): Promise<{ expired: number }> {
  logger.info(`Pending-order expiry sweep ${job.id} starting`);
  return expireOverduePendingOrders();
}

export async function handleAutoRenewOneTimePlans(
  job: Job
): Promise<{ renewed: number; failed: number }> {
  logger.info(`Auto-renew sweep ${job.id} starting`);
  return autoRenewOneTimePlans();
}
