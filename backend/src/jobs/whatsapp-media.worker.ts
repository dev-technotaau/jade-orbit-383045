import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { Prisma } from '@prisma/client';
import { WHATSAPP_MEDIA_QUEUE_NAME } from './whatsapp-media.queue';
import { archiveInboundMedia } from '../services/whatsapp-media.service';
import { deleteMetaMedia } from '../services/whatsapp.service';
import { deleteFileFromR2 } from '../services/storage.service';
import { waMediaArchiveTotal } from '../utils/whatsapp-metrics';

interface WhatsappMediaJobData {
  messageId: string;
  mediaId: string;
  mime: string;
}

/**
 * Record where the durable copy of a message's media stands.
 *
 * `updateMany`, not `update`: the row is routinely gone by the time a retry
 * envelope runs out (retention prune, DPDP erasure), and a P2025 here would fail
 * a job whose only remaining work is bookkeeping.
 */
async function stampArchiveStatus(messageId: string, status: 'SKIPPED' | 'FAILED'): Promise<void> {
  await prisma.waMessage
    .updateMany({ where: { id: messageId }, data: { mediaArchiveStatus: status } })
    .catch(() => {});
}

/**
 * Fold the archived byte count into a message payload, or leave it alone.
 *
 * Meta's inbound webhook describes media with a filename, a mime type and a
 * sha256 and no size at all, so every document a CUSTOMER sent rendered as a
 * bare "PDF" where WhatsApp itself says "PDF · 2.4 MB" — nobody reading the
 * thread could tell a one-page letter from a 40 MB scan without pulling the
 * whole file down, which on a metered connection is the decision the label
 * exists to inform. The download this worker has just done is the only place
 * the size is observable, so it is recorded here or nowhere.
 *
 * Merged, never replaced: the payload is where `filename`/`sha256`/`voice` live
 * and dropping those would cost the document its name and voice notes their
 * waveform player. An existing `size` is left as it stands — the outbound send
 * path records the uploaded length itself, and that value is the same bytes.
 */
function sizePayloadPatch(
  payload: Prisma.JsonValue | null | undefined,
  size: number
): { payload?: Prisma.InputJsonValue } {
  if (!Number.isFinite(size) || size <= 0) return {};
  const current =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Prisma.JsonObject)
      : null;
  if (current && current.size != null) return {};
  return { payload: { ...(current ?? {}), size } as Prisma.InputJsonObject };
}

/**
 * Bin objects we have just written but can no longer point at.
 *
 * Best-effort on purpose: the archive is already unreferenced, so failing the
 * job would only re-upload it on the next attempt, and `wa-media-reconcile`
 * sweeps whatever this misses. The thumbnail goes with the original — it is
 * derived from bytes the row no longer wants, and nothing else will ever name it.
 */
async function discardUnreferencedArchive(
  keys: Array<string | null>,
  messageId: string
): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await deleteFileFromR2(key);
      logger.info(
        `Discarded orphaned WhatsApp media archive ${key} (message ${messageId} is gone)`
      );
    } catch (err) {
      logger.warn(
        `Could not remove orphaned WhatsApp media archive ${key}: ${(err as Error).message}`
      );
    }
  }
}

/**
 * Downloads inbound WhatsApp media from Meta and durably archives it to R2,
 * then stamps the originating message's `mediaUrl` with the R2 key — plus the
 * byte count observed on the way past, which is the only place an inbound
 * attachment’s size can be learned (see sizePayloadPatch). Throws on a
 * transient failure so BullMQ retries (exponential backoff) within Meta's
 * ~30-day media window — the inbox stays responsive because this is decoupled
 * from the inbound webhook worker. Running without R2 is a supported setup, so
 * those jobs complete as skipped instead of exhausting the retry envelope, and
 * so does a job whose message was pruned or erased mid-flight — its archive is
 * deleted on the way out rather than left in the bucket with nothing naming it.
 */
export function createWhatsappMediaWorker(): Worker<WhatsappMediaJobData> {
  const worker = new Worker<WhatsappMediaJobData>(
    WHATSAPP_MEDIA_QUEUE_NAME,
    async (job: Job<WhatsappMediaJobData>) => {
      return (async () => {
        const { messageId, mediaId, mime } = job.data;
        const result = await archiveInboundMedia(mediaId, mime || 'application/octet-stream');
        if (!result.ok) {
          if (result.reason === 'r2-unconfigured') {
            waMediaArchiveTotal.inc({ result: 'skipped' });
            await stampArchiveStatus(messageId, 'SKIPPED');
            // Complete the job instead of throwing: no bucket exists to archive
            // into and none will appear mid-envelope, so retrying only spent the
            // whole backoff schedule and logged an error per attempt for every
            // media message an R2-less deployment ever received. `addWhatsappMediaJob`
            // normally skips the enqueue outright; this catches anything already
            // queued when the configuration changed.
            return { archived: false, skipped: 'r2-unconfigured' };
          }
          if (result.reason === 'too-large') {
            // Permanent, so complete rather than retry — the file is the same
            // size every time. The row records SKIPPED, which the inbox already
            // renders as "not archived" rather than "still downloading", so the
            // operator is told the truth: Meta's ~30-day copy is the only one.
            waMediaArchiveTotal.inc({ result: 'skipped' });
            await stampArchiveStatus(messageId, 'SKIPPED');
            return { archived: false, skipped: 'too-large' };
          }
          // Transient (Meta CDN blip, credential rotation, bucket quota). Throw so
          // BullMQ retries within Meta's ~30-day media availability window.
          waMediaArchiveTotal.inc({ result: 'transient' });
          throw new Error(`WhatsApp media archival returned no key for mediaId=${mediaId}`);
        }
        // The message can disappear between the enqueue and this line: retention
        // pruning deletes the row, and DPDP erasure nulls its `mediaId`/`mediaUrl`.
        // A bare `update` threw P2025 there, so BullMQ replayed the WHOLE job and
        // every one of the 12 attempts re-uploaded the same bytes — including bytes
        // a contact had just exercised their right to erasure over, restored to the
        // bucket with nothing left referencing them and therefore beyond the reach
        // of every deleter, all of which key off a row. Confirm the row still wants
        // this media, and bin the object when it does not.
        const row = await prisma.waMessage.findUnique({
          where: { id: messageId },
          // `direction` and the channel's phone-number id are read for the Meta-side
          // cleanup below, not for the archive itself.
          select: {
            id: true,
            mediaId: true,
            direction: true,
            channel: { select: { phoneNumberId: true } },
            // Read back so the byte count below is MERGED into whatever the
            // inbound webhook already put there (filename, sha256, voice)
            // instead of replacing it.
            payload: true,
          },
        });
        if (!row || row.mediaId !== mediaId) {
          waMediaArchiveTotal.inc({ result: 'row-gone' });
          await discardUnreferencedArchive([result.key, result.thumbKey], messageId);
          return { archived: false, skipped: 'row-gone' };
        }
        try {
          await prisma.waMessage.update({
            where: { id: messageId },
            data: {
              mediaUrl: result.key,
              mediaThumbUrl: result.thumbKey,
              mediaArchiveStatus: 'OK',
              ...sizePayloadPatch(row.payload, result.size),
            },
          });
        } catch (err) {
          // Lost the race with the same deleters between the check and the write.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
            waMediaArchiveTotal.inc({ result: 'row-gone' });
            await discardUnreferencedArchive([result.key, result.thumbKey], messageId);
            return { archived: false, skipped: 'row-gone' };
          }
          throw err;
        }
        waMediaArchiveTotal.inc({ result: 'ok' });
        // The durable copy exists, so Meta's does not need to any more.
        //
        // Only for media WE uploaded. Meta keeps every asset for 30 days and
        // nothing ever removed ours, so an outbound attachment stayed fetchable
        // by media id for a month after the message carrying it had been pruned
        // or erased — a copy outside the reach of every deleter in this system.
        // Inbound media is deliberately left alone: it is the customer's own
        // upload rather than ours, and `streamMedia` still falls back to Meta's
        // copy when an R2 read fails, which is the one thing standing between a
        // bucket blip and an unreadable bubble.
        if (row.direction === 'OUTBOUND') {
          void deleteMetaMedia(mediaId, row.channel?.phoneNumberId ?? null);
        }
        return { archived: true, key: result.key, thumbKey: result.thumbKey };
      })();
    },
    {
      connection: redis,
      concurrency: 4,
      lockDuration: 120000, // media downloads can be slow/large
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp media job ${job?.id} failed: ${err.message}`);
    // The LAST attempt is the one that matters: everything before it is a
    // transient blip the backoff exists to ride out. Once the envelope is spent
    // the customer's photo is gone the moment Meta's own 30-day copy expires,
    // and until now the only trace of that was this log line — no metric, no
    // state on the row, so the inbox went on rendering a generic "couldn't load
    // image" months later and nobody could tell it apart from a slow network.
    const attempts = job?.opts?.attempts ?? 1;
    if (!job || (job.attemptsMade ?? 0) < attempts) return;
    waMediaArchiveTotal.inc({ result: 'failed' });
    void stampArchiveStatus(job.data.messageId, 'FAILED');
  });

  return worker;
}
