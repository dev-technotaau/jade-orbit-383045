import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { RESUME_PARSE_QUEUE_NAME } from './resume-parse.queue';
import { parseResume } from '../services/resume-parser.service';
import { notificationService } from '../services/notification.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface ResumeParseJobData {
  userId: string;
  candidateProfileId: string;
  resumeUrl: string;
  mimeType: string;
}

export function createResumeParseWorker(): Worker<ResumeParseJobData> {
  const worker = new Worker<ResumeParseJobData>(
    RESUME_PARSE_QUEUE_NAME,
    async (job: Job<ResumeParseJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { userId, candidateProfileId, resumeUrl, mimeType } = job.data;

          logger.info(`Processing resume parse job ${job.id} for user ${userId}`);

          try {
            // Fetch the resume file
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
            const response = await fetch(resumeUrl, {
              signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch resume: HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const fileBuffer = Buffer.from(arrayBuffer);

            // Parse with Document AI OCR + Gemini extraction
            // (includes pre + post processing).
            const result = await parseResume(fileBuffer, mimeType);

            if (!result) {
              // parseResume returns null only when Document AI itself
              // isn't configured (no project / processor / feature flag).
              // Treat as a hard failure so BullMQ lands the job in
              // `failed` and the next admin glance at the dashboard
              // surfaces it — silently completing was the long-standing
              // UX bug ("Resume parsing is taking longer than
              // expected" with no log trail).
              throw new Error(
                'Resume parsing returned null — Document AI is not configured. ' +
                  'Check DOCUMENT_AI_PROCESSOR_ID, GOOGLE_CLOUD_PROJECT_ID, ' +
                  'FIREBASE_SERVICE_ACCOUNT, and the enableDocumentAI feature flag.'
              );
            }

            const { data: parsed, confidence, warnings, metadata } = result;

            // Store parsed data with metadata
            await prisma.candidateProfile.update({
              where: { id: candidateProfileId },
              data: {
                parsedResumeData: {
                  ...parsed,
                  _metadata: {
                    confidence: confidence.overall,
                    confidenceFields: confidence.fields,
                    warnings,
                    parsedAt: new Date().toISOString(),
                    fileSize: metadata.originalSize,
                    mimeType: metadata.mimeType,
                    hasImages: metadata.hasImages,
                  },
                } as any,
              },
            });

            // Notify user with confidence info
            const confidencePct = Math.round(confidence.overall * 100);
            const hasWarnings = warnings.length > 0;

            await notificationService.send({
              userId,
              title: hasWarnings ? 'Resume Parsed - Review Needed' : 'Resume Parsed Successfully',
              message: hasWarnings
                ? `Your resume has been analyzed (${confidencePct}% confidence). Please review the extracted data as some fields may need correction.`
                : `Your resume has been analyzed with ${confidencePct}% confidence. Review the extracted data in your profile.`,
              type: hasWarnings ? 'WARNING' : 'INFO',
              category: 'profile',
              link: '/candidate/profile',
              channels: ['in_app', 'fcm', 'web_push'],
            });

            logger.info(
              `Resume parsed for user ${userId}: ${parsed.skills.length} skills, ` +
                `${parsed.experience.length} experience, confidence=${confidencePct}%, warnings=${warnings.length}`
            );

            return {
              success: true,
              skillCount: parsed.skills.length,
              experienceCount: parsed.experience.length,
              confidence: confidencePct,
              warningCount: warnings.length,
            };
          } catch (error) {
            logger.error(`Resume parse failed for user ${userId}:`, error);
            throw error;
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_RESUME_PARSE_CONCURRENCY, 10),
      lockDuration: 300000, // 5 min — fetches file + calls Document AI
      stalledInterval: 120000,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Resume parse job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Resume parse job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
