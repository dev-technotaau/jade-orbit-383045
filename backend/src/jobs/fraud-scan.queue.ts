import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const FRAUD_SCAN_QUEUE_NAME = 'fraud-scan';

export interface FraudScanJobData {
  paymentId: string;
}

export const fraudScanQueue = new Queue<FraudScanJobData>(FRAUD_SCAN_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

fraudScanQueue.on('error', (err) => {
  logger.error('Fraud scan queue error', err);
});

logger.info(`Fraud scan queue initialized: ${FRAUD_SCAN_QUEUE_NAME}`);
