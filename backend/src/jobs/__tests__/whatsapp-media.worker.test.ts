/**
 * Tests for the inbound media-archival worker (src/jobs/whatsapp-media.worker.ts).
 *
 * `Worker` is stubbed so we can capture the processor BullMQ would run and drive
 * a job through the real control flow — archive → stamp `mediaUrl` — without a
 * live Redis. The cases worth pinning are the ones that must COMPLETE the job
 * rather than throw:
 *
 *  - an unconfigured R2 (there is nowhere to archive to, and no retry can change
 *    that) — throwing burns the whole retry envelope on every inbound media
 *    message an R2-less deployment receives;
 *  - a message that was pruned or erased between the enqueue and the stamp —
 *    throwing there replays the job and re-uploads the object up to 12 times,
 *    leaving bytes in the bucket that no row names and no deleter can ever
 *    reach, erased contacts included. The object must be deleted instead.
 */

// ── config/* stubs ──────────────────────────────────────────────────────────
const prismaMock = {
  waMessage: {
    findUnique: jest.fn().mockResolvedValue({ id: 'msg1', mediaId: 'media1' }),
    update: jest.fn().mockResolvedValue({}),
    // The archive-status bookkeeping goes through updateMany so a row that has
    // since been pruned or erased cannot fail the job with a P2025.
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));
jest.mock('../../config/redis', () => ({ redis: {} }));
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock the queue module so importing the worker doesn't build a real BullMQ
// Queue (the worker only wants WHATSAPP_MEDIA_QUEUE_NAME from it).
jest.mock('../whatsapp-media.queue', () => ({
  WHATSAPP_MEDIA_QUEUE_NAME: 'whatsapp-media-queue',
}));

const archiveInboundMediaMock = jest.fn();
jest.mock('../../services/whatsapp-media.service', () => ({
  archiveInboundMedia: archiveInboundMediaMock,
}));

const deleteFileFromR2Mock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/storage.service', () => ({ deleteFileFromR2: deleteFileFromR2Mock }));

// ── bullmq stub ─────────────────────────────────────────────────────────────
type MediaProcessor = (job: {
  data: { messageId: string; mediaId: string; mime: string };
}) => Promise<unknown>;

let mockProcessor: MediaProcessor | undefined;
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: MediaProcessor) => {
    mockProcessor = processor;
    return { on: jest.fn() };
  }),
}));

import { Prisma } from '@prisma/client';
import { createWhatsappMediaWorker } from '../whatsapp-media.worker';

const JOB = { data: { messageId: 'msg1', mediaId: 'media1', mime: 'image/jpeg' } };

/** Run the captured processor over one job. */
function process(): Promise<unknown> {
  return (mockProcessor as MediaProcessor)(JOB);
}

/** The P2025 Prisma throws when `update` cannot find its row. */
const recordNotFound = () =>
  new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
    code: 'P2025',
    clientVersion: 'test',
  });

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waMessage.findUnique.mockResolvedValue({ id: 'msg1', mediaId: 'media1' });
  prismaMock.waMessage.update.mockResolvedValue({});
  prismaMock.waMessage.updateMany.mockResolvedValue({ count: 1 });
  deleteFileFromR2Mock.mockResolvedValue(undefined);
  createWhatsappMediaWorker();
});

describe('whatsapp media worker', () => {
  it('stamps the message mediaUrl with the archived R2 key', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });

    await expect(process()).resolves.toEqual({
      archived: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
    });
    expect(archiveInboundMediaMock).toHaveBeenCalledWith('media1', 'image/jpeg');
    expect(prismaMock.waMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg1' },
      data: {
        mediaUrl: 'whatsapp-media/media1.jpg',
        mediaThumbUrl: 'whatsapp-media/thumb/media1.webp',
        mediaArchiveStatus: 'OK',
        // The download is the only moment an inbound attachment’s size is
        // observable — Meta’s webhook carries none — so the file card in the
        // thread can only say "PDF · 2.4 MB" if it is recorded right here.
        payload: { size: 2516582 },
      },
    });
  });

  it('merges the byte count into the webhook payload instead of over it', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.pdf',
      thumbKey: null,
      size: 4096,
    });
    prismaMock.waMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      mediaId: 'media1',
      payload: { filename: 'invoice.pdf', sha256: 'abc' },
    });

    await process();
    // Replacing the payload would cost the document the name the customer
    // uploaded it under, which is the other half of the same file card.
    expect(prismaMock.waMessage.update.mock.calls[0][0].data.payload).toEqual({
      filename: 'invoice.pdf',
      sha256: 'abc',
      size: 4096,
    });
  });

  it('leaves a size the send path already recorded alone', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.pdf',
      thumbKey: null,
      size: 4096,
    });
    prismaMock.waMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      mediaId: 'media1',
      payload: { filename: 'quote.pdf', size: 4095 },
    });

    await process();
    // Outbound sends stamp the uploaded length themselves; re-writing the
    // payload here would only churn the row for the same bytes.
    expect(prismaMock.waMessage.update.mock.calls[0][0].data.payload).toBeUndefined();
  });

  it('completes as skipped — no retry — when R2 is unconfigured', async () => {
    archiveInboundMediaMock.mockResolvedValue({ ok: false, reason: 'r2-unconfigured' });

    await expect(process()).resolves.toEqual({ archived: false, skipped: 'r2-unconfigured' });
    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
    // The row is marked SKIPPED so the inbox can say the media is not archived
    // rather than rendering a permanently broken attachment.
    expect(prismaMock.waMessage.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg1' },
      data: { mediaArchiveStatus: 'SKIPPED' },
    });
  });

  it('throws on a transient failure so BullMQ retries', async () => {
    archiveInboundMediaMock.mockResolvedValue({ ok: false, reason: 'transient' });

    await expect(process()).rejects.toThrow(/media1/);
    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
  });

  it('deletes the archive and completes when the message row is gone', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });
    prismaMock.waMessage.findUnique.mockResolvedValue(null);

    await expect(process()).resolves.toEqual({ archived: false, skipped: 'row-gone' });
    // Nothing references the object now, and every deleter keys off a row — so
    // leaving it behind means it can never be removed.
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/media1.jpg');
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/thumb/media1.webp');
    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
  });

  it('deletes the archive when erasure nulled the row mediaId', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });
    prismaMock.waMessage.findUnique.mockResolvedValue({ id: 'msg1', mediaId: null });

    await expect(process()).resolves.toEqual({ archived: false, skipped: 'row-gone' });
    // The row surviving is not enough: eraseContactData nulls mediaId/mediaUrl,
    // so re-stamping it would hand a "forgotten" contact's media straight back.
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/media1.jpg');
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/thumb/media1.webp');
    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
  });

  it('deletes the archive when the row loses the race and the stamp raises P2025', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });
    prismaMock.waMessage.update.mockRejectedValue(recordNotFound());

    await expect(process()).resolves.toEqual({ archived: false, skipped: 'row-gone' });
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/media1.jpg');
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/thumb/media1.webp');
  });

  it('completes even when the orphaned object cannot be deleted', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });
    prismaMock.waMessage.findUnique.mockResolvedValue(null);
    deleteFileFromR2Mock.mockRejectedValue(new Error('AccessDenied'));

    // Retrying would only re-upload the object; the reconcile cron sweeps it.
    await expect(process()).resolves.toEqual({ archived: false, skipped: 'row-gone' });
  });

  it('still retries a genuine database failure on the stamp', async () => {
    archiveInboundMediaMock.mockResolvedValue({
      ok: true,
      key: 'whatsapp-media/media1.jpg',
      thumbKey: 'whatsapp-media/thumb/media1.webp',
      size: 2516582,
    });
    prismaMock.waMessage.update.mockRejectedValue(new Error('connection reset'));

    await expect(process()).rejects.toThrow('connection reset');
    // A dropped connection is not a missing row — deleting the archive here
    // would throw away media the retry is about to stamp successfully.
    expect(deleteFileFromR2Mock).not.toHaveBeenCalled();
  });
});
