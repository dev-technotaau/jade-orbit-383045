import type { Job } from 'bullmq';
import logger from '../config/logger';
import { jobAlertService } from '../services/job-alert.service';

export async function handleJobAlert(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing job alerts ${job.id}`);

    await Promise.race([
      jobAlertService.processAlerts(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Job alert worker timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
    return { processed: true };
  } catch (error) {
    logger.error('Job alert processing failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
