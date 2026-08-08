import { FlowProducer } from 'bullmq';
import { redis } from '../config/redis';
import { RESUME_PARSE_QUEUE_NAME } from './resume-parse.queue';
import { MATCHING_QUEUE_NAME } from './matching.queue';
import logger from '../config/logger';

const flowProducer = new FlowProducer({ connection: redis });

/**
 * Start a resume processing flow:
 * 1. Parent: Parse resume (Document AI)
 * 2. Child: Match jobs (triggers after parse completes)
 *
 * The FlowProducer ensures the matching job only runs after parsing succeeds.
 */
export async function startResumeFlow(
  userId: string,
  candidateProfileId: string,
  resumeUrl: string,
  mimeType: string
): Promise<string> {
  try {
    const flow = await flowProducer.add({
      name: 'parse-resume',
      queueName: RESUME_PARSE_QUEUE_NAME,
      data: {
        userId,
        candidateProfileId,
        resumeUrl,
        mimeType,
      },
      children: [
        {
          name: 'match-jobs',
          queueName: MATCHING_QUEUE_NAME,
          data: { userId },
        },
      ],
    });

    logger.info(`Resume flow started for user ${userId}: parse → match`);
    return flow.job.id || 'unknown';
  } catch (error) {
    logger.error(`Failed to start resume flow for user ${userId}:`, error);
    throw error;
  }
}

export { flowProducer };
