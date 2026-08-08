import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';
import { safeJobId } from './job-id';

export const ES_REINDEX_QUEUE_NAME = 'es-reindex-queue';

export const esReindexQueue = new Queue(ES_REINDEX_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

esReindexQueue.on('error', (err) => {
  logger.error('ES Reindex Queue Error:', err);
});

logger.info(`ES Reindex Queue initialized: ${ES_REINDEX_QUEUE_NAME}`);

export interface ReindexJobData {
  indexType: 'job' | 'candidate';
  documentId: string;
  action: 'index' | 'delete';
}

export async function addReindexJob(data: ReindexJobData) {
  return esReindexQueue.add(
    'reindex',
    { ...data, _traceContext: injectTraceContext() },
    {
      // Deduplicate: if same doc is queued multiple times, only process once.
      // Built via safeJobId — the previous colon-delimited form was rejected
      // by BullMQ at enqueue time, so NO job update/close/expiry ever
      // reindexed and the Kafka consumer dead-lettered every ha.jobs event.
      jobId: safeJobId('reindex', data.indexType, data.documentId, data.action),
    }
  );
}
