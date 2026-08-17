import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_IMPORT_QUEUE_NAME } from './whatsapp-import.queue';
import type { WhatsappImportJobData } from './whatsapp-import.queue';
import { importContacts } from '../services/whatsapp-contact.service';

/**
 * Runs a staged contact import and keeps its WaImportJob row current.
 *
 * Progress is written after every chunk rather than only at the end, because the
 * whole point of moving this off the request path is that the operator can watch
 * a long import instead of staring at a spinner that may or may not still be
 * connected to anything.
 */
export function createWhatsappImportWorker(): Worker<WhatsappImportJobData> {
  const worker = new Worker<WhatsappImportJobData>(
    WHATSAPP_IMPORT_QUEUE_NAME,
    async (job: Job<WhatsappImportJobData>) => {
      const { jobId, rows, optIn, replaceTags } = job.data;
      await prisma.waImportJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING', total: rows.length },
      });
      try {
        const result = await importContacts(rows, optIn, replaceTags, async (progress) => {
          await prisma.waImportJob.update({ where: { id: jobId }, data: progress });
        });
        await prisma.waImportJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            skippedOptedOut: result.skippedOptedOut,
            duplicates: result.duplicates,
            total: result.total,
            finishedAt: new Date(),
          },
        });
        return result;
      } catch (err) {
        // Record the failure on the row before rethrowing. Without this the
        // modal polls a job stuck at RUNNING forever and the operator has no way
        // to tell a slow import from a dead one.
        await prisma.waImportJob
          .update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              error: (err as Error).message.slice(0, 500),
              finishedAt: new Date(),
            },
          })
          .catch(() => {});
        throw err;
      }
    },
    {
      connection: redis,
      // One at a time: two concurrent imports of overlapping files would
      // contend on the same contact rows for no throughput gain.
      concurrency: 1,
      // A 5000-row file is minutes of work; the default 30s lock would be lost
      // mid-run and the job handed to a second worker.
      lockDuration: 600000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp import job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
