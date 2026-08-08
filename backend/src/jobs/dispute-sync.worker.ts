import type { Job } from 'bullmq';
import { syncDisputes } from '../services/dispute.service';
import logger from '../config/logger';

export async function handleDisputeSync(job: Job): Promise<{ synced: number }> {
  logger.info(`Dispute sync ${job.id} starting`);
  const result = await syncDisputes();
  logger.info(`Dispute sync complete — ${result.synced} disputes`);
  return result;
}
