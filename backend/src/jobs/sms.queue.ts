import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';
import { toE164 } from '../utils/phone';

export const SMS_QUEUE_NAME = 'sms-queue';

export const smsQueue = new Queue(SMS_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

smsQueue.on('error', (err) => {
  logger.error('SMS Queue Error:', err);
});

logger.info(`SMS Queue initialized: ${SMS_QUEUE_NAME}`);

/**
 * The ONE way to enqueue an SMS.
 *
 * Was typed `{ to, message }` while the worker reads `job.data.body` — any
 * caller would have sent an undefined body. Nothing called it, so the bug was
 * latent; the six OTP producers each called `smsQueue.add` directly and so
 * also skipped trace-context injection.
 *
 * Now it is the single choke point: it normalises the destination to E.164 and
 * REFUSES to enqueue anything it cannot resolve. A number that reached the
 * database by some path that skipped validation (seed, import, direct SQL, a
 * row predating the schema fix) therefore still cannot be misrouted — better
 * to drop the OTP and log loudly than to text a stranger in another country.
 *
 * Returns the job, or null when the destination was unusable.
 */
export async function addSMSJob(
  data: { to: string; body: string; purpose?: string; userId?: string },
  priority?: number
) {
  const to = toE164(data.to);
  if (!to) {
    logger.error(
      `SMS not enqueued — destination is not a resolvable E.164 number: ${JSON.stringify(data.to)}`
    );
    return null;
  }

  return smsQueue.add(
    'send-sms',
    {
      to,
      body: data.body,
      purpose: data.purpose,
      userId: data.userId,
      _traceContext: injectTraceContext(),
    },
    priority ? { priority } : {}
  );
}
