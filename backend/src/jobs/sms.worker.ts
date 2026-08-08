import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { SMS_QUEUE_NAME } from './sms.queue';
import { sendSMS, PermanentSmsError } from '../services/sms.service';
import { UnrecoverableError } from 'bullmq';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface SmsJobData {
  to: string;
  body: string;
  /** What produced this message, e.g. `otp.mobile_verify` — stored for analytics. */
  purpose?: string;
  /** Owning user when known, so delivery can be traced per account. */
  userId?: string;
}

export function createSmsWorker(): Worker<SmsJobData> {
  const worker = new Worker<SmsJobData>(
    SMS_QUEUE_NAME,
    async (job: Job<SmsJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 30_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            logger.info(`Processing SMS job ${job.id} to ${job.data.to}`);

            const sent = await Promise.race([
              sendSMS(job.data.to, job.data.body, {
                purpose: job.data.purpose,
                userId: job.data.userId,
              }),
              new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('SMS worker timeout after 30s')), TIMEOUT_MS)
              ),
            ]);
            if (!sent) {
              logger.warn(`SMS not sent to ${job.data.to} - service may be unconfigured`);
            }
            return { sent };
          } catch (error) {
            // ── Do not retry what can never succeed ──
            // An invalid number, a landline, or a recipient who sent STOP will
            // fail identically on all three attempts — burning API calls and
            // holding a concurrency slot. UnrecoverableError tells BullMQ to
            // fail the job immediately and keep it for inspection.
            if (error instanceof PermanentSmsError) {
              logger.error(
                `SMS to ${job.data.to} permanently failed (code=${error.code}) — not retrying`
              );
              throw new UnrecoverableError(`Twilio ${error.code}: ${error.message}`);
            }
            logger.error(`Failed to send SMS to ${job.data.to}:`, error);
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_SMS_CONCURRENCY, 10),
      lockDuration: 60000,
      limiter: {
        max: 5,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`SMS job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`SMS job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
