import type { Job } from 'bullmq';
import { syncSettlements } from '../services/settlement.service';
import logger from '../config/logger';

export async function handleSettlementSync(job: Job): Promise<{ synced: number }> {
  logger.info(`Settlement sync ${job.id} starting`);
  const result = await syncSettlements();
  logger.info(`Settlement sync complete — ${result.synced} settlements`);
  return result;
}
