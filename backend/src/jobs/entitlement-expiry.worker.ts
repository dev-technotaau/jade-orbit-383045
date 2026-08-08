import type { Job } from 'bullmq';
import { expireOverdueEntitlements } from '../services/entitlement.service';
import logger from '../config/logger';

export async function handleEntitlementExpiry(job: Job): Promise<{ expired: number }> {
  logger.info(`Entitlement expiry sweep ${job.id} starting`);
  const result = await expireOverdueEntitlements();
  logger.info(`Entitlement expiry sweep complete — ${result.expired} entitlements expired`);
  return result;
}
