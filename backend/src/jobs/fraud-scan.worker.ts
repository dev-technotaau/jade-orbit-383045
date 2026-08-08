import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { FRAUD_SCAN_QUEUE_NAME, type FraudScanJobData } from './fraud-scan.queue';
import { scanPayment } from '../services/fraud.service';

export function createFraudScanWorker(): Worker<FraudScanJobData> {
  const worker = new Worker<FraudScanJobData>(
    FRAUD_SCAN_QUEUE_NAME,
    async (job: Job<FraudScanJobData>) => {
      const traceCtx =
        (job.data as FraudScanJobData & { _traceContext?: Record<string, string> })._traceContext ??
        {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          logger.info(`Fraud scan job ${job.id} starting`, {
            paymentId: job.data.paymentId,
          });
          const result = await scanPayment({ paymentId: job.data.paymentId });
          logger.info('Fraud scan job complete', { jobId: job.id, ...result });
          return result;
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_FRAUD_SCAN_CONCURRENCY, 10),
      lockDuration: 60_000,
      limiter: { max: 30, duration: 1000 },
    }
  );

  worker.on('completed', (job) => logger.info(`Fraud scan job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    logger.error(`Fraud scan job ${job?.id} failed: ${err.message}`)
  );
  return worker;
}
