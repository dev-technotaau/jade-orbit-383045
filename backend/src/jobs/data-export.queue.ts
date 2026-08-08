import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';
import { injectTraceContext } from '../utils/trace-propagation';

export const DATA_EXPORT_QUEUE_NAME = 'export-data';

// Re-export scheduler queue for backward compatibility
export const dataExportQueue = schedulerQueue;

export const EXPORT_CLEANUP_JOB_NAME = 'export-cleanup';

// Export cleanup (delete expired CSV/XLSX/ZIP files from R2) — daily at 5:00 AM UTC
schedulerQueue
  .add(
    EXPORT_CLEANUP_JOB_NAME,
    {},
    {
      repeat: { pattern: '0 5 * * *' },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to schedule export cleanup job:', err);
  });

logger.info(`Data Export scheduled on: scheduler-queue (export-cleanup@5AM-UTC)`);

// Helper function to add data export jobs
export const addDataExportJob = async (data: {
  userId: string;
  exportType: 'USER_DATA' | 'CANDIDATE_EXPORT' | 'RESUME_EXPORT';
  email?: string;
  format?: 'csv' | 'xlsx' | 'json';
  candidateIds?: string[];
  /** Requester's role — admins bypass the contact paywall in exports. */
  requesterRole?: string;
}) => {
  return await schedulerQueue.add(
    'export-data',
    { ...data, _traceContext: injectTraceContext() },
    {
      priority: data.exportType === 'USER_DATA' ? 1 : 2,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
};
