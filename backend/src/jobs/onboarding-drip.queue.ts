import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';
import { safeJobId } from './job-id';

export const ONBOARDING_DRIP_QUEUE_NAME = 'onboarding-drip-queue';

export const onboardingDripQueue = new Queue(ONBOARDING_DRIP_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

onboardingDripQueue.on('error', (err) => {
  logger.error('Onboarding Drip Queue Error:', err);
});

logger.info(`Onboarding Drip Queue initialized: ${ONBOARDING_DRIP_QUEUE_NAME}`);

/**
 * Schedule onboarding drip emails for a new user.
 * Adds 3 delayed jobs: +1 day, +3 days, +7 days.
 */
export async function scheduleOnboardingDrip(userId: string, role: string): Promise<void> {
  const DAY_MS = 24 * 60 * 60 * 1000;

  const delays = [
    { delay: 1 * DAY_MS, step: 'day1' },
    { delay: 3 * DAY_MS, step: 'day3' },
    { delay: 7 * DAY_MS, step: 'day7' },
  ];

  for (const { delay, step } of delays) {
    await onboardingDripQueue.add(
      'send-drip',
      { userId, role, step, _traceContext: injectTraceContext() },
      {
        // Role is part of the key so a capability-activation drip (e.g.
        // VENDOR_CONNECT) doesn't collide with the role-signup drip the
        // same user already received as an EMPLOYER.
        jobId: safeJobId('drip', userId, role, step), // Prevent duplicates
        delay,
      }
    );
  }

  logger.info(`Scheduled 3 onboarding drip emails for user ${userId} (${role})`);
}
