/**
 * Tests for the WhatsApp cron handlers (src/jobs/whatsapp-cron.worker.ts).
 *
 * Two things live here that nothing else in the system does, and both fail
 * quietly:
 *
 *  - `handleWaPruneRetention` is the only code that deletes personal data. If
 *    its batching regresses to an unbounded DELETE it hits the 30s statement
 *    timeout, the run aborts, and the tables it never reached keep phone
 *    numbers and message bodies indefinitely — while the log line still reads
 *    like a successful prune.
 *  - the recovery handlers decide when a stalled campaign is re-batched and when
 *    a stuck webhook event is replayed. Both have a history of doing that too
 *    eagerly, which means sending the same message twice.
 *  - `handleWaMediaReconcile` is the only thing that can delete an archived R2
 *    object no row points at. Too timid and erased media stays in the bucket
 *    forever; too eager and it deletes a customer's photo out from under the
 *    message that is about to reference it.
 *
 * Prisma is a mock and the clock is frozen, so cutoffs and page counts are
 * asserted exactly.
 */

const prismaMock = {
  waSettings: { findUnique: jest.fn() },
  // `count` is the post-prune backlog probe behind `wa_retention_rows_overdue`,
  // asked of every table the prune touches.
  waMessage: { findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  // Owner lookup for the staged send-later attachments, which are named by a
  // scheduled row rather than by any message.
  waScheduledMessage: { findMany: jest.fn() },
  waWebhookEvent: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  webhookDelivery: { findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  auditLog: { findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  waLinkClick: { findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  waCampaign: { findMany: jest.fn(), update: jest.fn() },
  waCampaignRecipient: { count: jest.fn() },
  waChannelHealthSnapshot: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/env', () => ({ env: {} }));
// The worker reads the prune budget from this same object at call time, so tests
// set it here rather than on process.env.
import { env as envMock } from '../../config/env';
const mutableEnv = envMock as unknown as Record<string, string | undefined>;

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const deleteFileFromR2Mock = jest.fn().mockResolvedValue(undefined);
const listObjectKeysMock = jest.fn().mockResolvedValue({ objects: [] });
const isR2ConfiguredMock = jest.fn().mockReturnValue(true);
jest.mock('../../services/storage.service', () => ({
  deleteFileFromR2: deleteFileFromR2Mock,
  listObjectKeys: listObjectKeysMock,
  isR2Configured: isR2ConfiguredMock,
}));

const pruneExpiredTrustedDevicesMock = jest.fn().mockResolvedValue(0);
jest.mock('../../services/whatsapp-mfa.service', () => ({
  pruneExpiredTrustedDevices: pruneExpiredTrustedDevicesMock,
}));

jest.mock('../../services/whatsapp-template.service', () => ({ syncFromMeta: jest.fn() }));
jest.mock('../../services/whatsapp-sequence.service', () => ({
  advanceDueSequenceRecipients: jest.fn(),
}));
jest.mock('../../services/whatsapp-scheduled-message.service', () => ({
  dispatchDueScheduledMessages: jest.fn(),
  // The reconcile sweeps this prefix too; the real value, since the sweep is
  // asserted on which prefix it asked for.
  SCHEDULED_MEDIA_PREFIX: 'whatsapp-scheduled/',
}));
jest.mock('../../services/whatsapp-channel.service', () => ({
  syncChannelHealth: jest.fn(),
  getDefaultChannel: jest.fn(),
  recordChannelHealthSnapshot: jest.fn(),
  checkTokenHealth: jest.fn(),
  TOKEN_EXPIRY_WARN_DAYS: 7,
}));
const waRetentionRowsOverdueMock = { set: jest.fn() };
jest.mock('../../utils/whatsapp-metrics', () => ({
  waChannelQuality: { set: jest.fn() },
  waMessagingTierLimit: { set: jest.fn() },
  waRetentionRowsOverdue: waRetentionRowsOverdueMock,
}));

const campaignServiceMock = {
  launchCampaign: jest.fn(),
  cloneAndLaunchRecurring: jest.fn(),
  enqueuePendingRecipients: jest.fn().mockResolvedValue(0),
  completeCampaign: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../services/whatsapp-campaign.service', () => campaignServiceMock);

const requeueWhatsappInboundJobMock = jest.fn().mockResolvedValue({ id: 'job' });
jest.mock('../whatsapp-inbound.queue', () => ({
  requeueWhatsappInboundJob: requeueWhatsappInboundJobMock,
}));

const campaignQueueMock = { getJobs: jest.fn().mockResolvedValue([]) };
jest.mock('../whatsapp-campaign.queue', () => ({ whatsappCampaignQueue: campaignQueueMock }));

import {
  handleWaPruneRetention,
  handleWaEventRecovery,
  handleWaCampaignRecovery,
  handleWaMediaReconcile,
} from '../whatsapp-cron.worker';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;

/** A page of `n` id rows, distinguishable per table. */
const idPage = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

/** findMany stub that yields the given pages in order, then empty pages forever. */
function servePages<T>(...batches: T[][]) {
  let call = 0;
  return async () => batches[call++] ?? [];
}

/** deleteMany stub reporting exactly the ids it was handed. */
const deleteCounted = async ({ where }: { where: { id: { in: string[] } } }) => ({
  count: where.id.in.length,
});

/** The cutoff Date a table's findMany was asked for on its first page. */
const cutoffOf = (findMany: jest.Mock): Date => findMany.mock.calls[0][0].where.createdAt.lt;

beforeEach(() => {
  jest.clearAllMocks();
  // The clock is frozen so cutoffs are exact. Note that the prune's budget is
  // wall-clock, so a page stub that always returns a FULL page would spin
  // forever under a frozen clock — advance the timers inside such a stub (see
  // the budget cases below).
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mutableEnv.WA_PRUNE_BUDGET_MS = '300000'; // the schema default

  prismaMock.waSettings.findUnique.mockResolvedValue(null);
  for (const table of [
    prismaMock.waMessage,
    prismaMock.waWebhookEvent,
    prismaMock.webhookDelivery,
    prismaMock.auditLog,
    prismaMock.waLinkClick,
    prismaMock.waChannelHealthSnapshot,
  ]) {
    table.findMany.mockImplementation(async () => []);
    table.deleteMany.mockImplementation(deleteCounted);
    // Drained by default; the backlog cases below override per table.
    table.count.mockResolvedValue(0);
  }
  prismaMock.waWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.waWebhookEvent.update.mockResolvedValue({});
  prismaMock.waCampaign.findMany.mockResolvedValue([]);
  prismaMock.waCampaign.update.mockResolvedValue({});
  prismaMock.waCampaignRecipient.count.mockResolvedValue(0);
  prismaMock.waScheduledMessage.findMany.mockResolvedValue([]);
  deleteFileFromR2Mock.mockResolvedValue(undefined);
  listObjectKeysMock.mockResolvedValue({ objects: [] });
  isR2ConfiguredMock.mockReturnValue(true);
  pruneExpiredTrustedDevicesMock.mockResolvedValue(0);
  campaignQueueMock.getJobs.mockResolvedValue([]);
  campaignServiceMock.enqueuePendingRecipients.mockResolvedValue(0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('handleWaPruneRetention — messages', () => {
  it('deletes in BATCH-sized select-then-delete pages and stops on a short page', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 30 });
    prismaMock.waMessage.findMany.mockImplementation(
      servePages(idPage(BATCH, 'msg-a'), idPage(400, 'msg-b'))
    );

    await handleWaPruneRetention();

    expect(prismaMock.waMessage.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waMessage.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waMessage.findMany.mock.calls[0][0].take).toBe(BATCH);
    // Delete strictly by the ids just selected — never a bare predicate delete,
    // which has no LIMIT and takes out the whole backlog in one transaction.
    expect(prismaMock.waMessage.deleteMany.mock.calls[1][0].where.id.in).toHaveLength(400);
    expect(cutoffOf(prismaMock.waMessage.findMany)).toEqual(new Date(NOW.getTime() - 30 * DAY_MS));
  });

  it('drains pages until its wall-clock budget runs out, and says so out loud', async () => {
    mutableEnv.WA_PRUNE_BUDGET_MS = '5000';
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 30 });
    prismaMock.waMessage.findMany.mockImplementation(async () => {
      jest.advanceTimersByTime(2000); // each page costs 2s of the budget
      return idPage(BATCH, 'msg');
    });

    await handleWaPruneRetention();

    // Three pages fit in a 5s budget; the fourth check is past the deadline.
    expect(prismaMock.waMessage.findMany).toHaveBeenCalledTimes(3);
    expect(prismaMock.waMessage.deleteMany).toHaveBeenCalledTimes(3);
    // Running out means the deployment is not honouring its own retention
    // policy. The fixed 20-page cap this replaced said nothing at all, so a
    // site taking more than 20k messages a day fell permanently behind while
    // the job kept reporting success.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('ran out of its 5000ms budget')
    );
  });

  it('leaves the later tables for the next run once the budget is gone', async () => {
    mutableEnv.WA_PRUNE_BUDGET_MS = '1000';
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 30 });
    prismaMock.waMessage.findMany.mockImplementation(async () => {
      jest.advanceTimersByTime(2000);
      return idPage(BATCH, 'msg');
    });

    await handleWaPruneRetention();

    expect(prismaMock.webhookDelivery.findMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    // The device sweep is not budgeted — it is a single bounded statement, and
    // skipping it would mean expired trusted devices never expire at all.
    expect(pruneExpiredTrustedDevicesMock).toHaveBeenCalled();
  });

  it('leaves messages alone when no retention window is configured', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: null });

    await handleWaPruneRetention();

    expect(prismaMock.waMessage.findMany).not.toHaveBeenCalled();
    // …but the raw webhook payloads are still purged. That is the point of the
    // fixed event TTL: keep-forever message retention must not also mean
    // keep-forever plaintext copies of inbound content.
    expect(prismaMock.waWebhookEvent.findMany).toHaveBeenCalled();
  });

  it('deletes the row even when its R2 object cannot be removed', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 30 });
    prismaMock.waMessage.findMany.mockImplementation(
      servePages([
        { id: 'm1', mediaUrl: 'wa/media/1.jpg' },
        { id: 'm2', mediaUrl: null },
      ])
    );
    deleteFileFromR2Mock.mockRejectedValueOnce(new Error('NoSuchKey'));

    await handleWaPruneRetention();

    // R2 being unconfigured (or the object already gone) must not strand the
    // database row that names it — that row is the personal data.
    expect(prismaMock.waMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
    });
  });
});

describe('handleWaPruneRetention — raw webhook events', () => {
  it('uses the fixed 14-day TTL when message retention is longer', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 90 });

    await handleWaPruneRetention();

    expect(cutoffOf(prismaMock.waWebhookEvent.findMany)).toEqual(
      new Date(NOW.getTime() - 14 * DAY_MS)
    );
  });

  it('uses the message window when it is shorter than 14 days', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: 7 });

    await handleWaPruneRetention();

    // min(), not max(): an operator who asks for 7-day retention must not have
    // the plaintext payload copy survive a further week.
    expect(cutoffOf(prismaMock.waWebhookEvent.findMany)).toEqual(
      new Date(NOW.getTime() - 7 * DAY_MS)
    );
  });

  it('falls back to the fixed TTL when settings cannot be read at all', async () => {
    prismaMock.waSettings.findUnique.mockRejectedValue(new Error('db down'));

    await handleWaPruneRetention();

    expect(cutoffOf(prismaMock.waWebhookEvent.findMany)).toEqual(
      new Date(NOW.getTime() - 14 * DAY_MS)
    );
  });

  it('pages the event prune the same way as messages', async () => {
    prismaMock.waWebhookEvent.findMany.mockImplementation(
      servePages(idPage(BATCH, 'ev-a'), idPage(2, 'ev-b'))
    );

    await handleWaPruneRetention();

    expect(prismaMock.waWebhookEvent.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waWebhookEvent.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waWebhookEvent.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'asc',
    });
  });
});

describe('handleWaPruneRetention — the tables nothing else cleans', () => {
  it('prunes deliveries, audit logs and link clicks on their own TTLs', async () => {
    await handleWaPruneRetention();

    expect(cutoffOf(prismaMock.webhookDelivery.findMany)).toEqual(
      new Date(NOW.getTime() - 30 * DAY_MS)
    );
    expect(cutoffOf(prismaMock.auditLog.findMany)).toEqual(new Date(NOW.getTime() - 180 * DAY_MS));
    expect(cutoffOf(prismaMock.waLinkClick.findMany)).toEqual(
      new Date(NOW.getTime() - 180 * DAY_MS)
    );
    expect(pruneExpiredTrustedDevicesMock).toHaveBeenCalled();
  });

  it('logs a failing table and still prunes the ones after it', async () => {
    prismaMock.webhookDelivery.findMany.mockImplementation(servePages(idPage(BATCH, 'del')));
    prismaMock.webhookDelivery.deleteMany.mockRejectedValue(new Error('deadlock detected'));

    await handleWaPruneRetention();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'WhatsApp retention prune (webhook deliveries) failed: deadlock detected'
    );
    // One table erroring must not abort the sweep — everything below it in the
    // run would otherwise never be pruned again, on any run.
    expect(prismaMock.auditLog.findMany).toHaveBeenCalled();
    expect(prismaMock.waLinkClick.findMany).toHaveBeenCalled();
    expect(pruneExpiredTrustedDevicesMock).toHaveBeenCalled();
    // …and the failed table stops after one attempt rather than retrying 20×.
    expect(prismaMock.webhookDelivery.findMany).toHaveBeenCalledTimes(1);
  });

  it('survives a trusted-device prune failure', async () => {
    pruneExpiredTrustedDevicesMock.mockRejectedValue(new Error('no table'));

    await expect(handleWaPruneRetention()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'WhatsApp retention prune (trusted devices) failed: no table'
    );
  });
});

describe('handleWaPruneRetention — the overdue-rows gauge', () => {
  it('reports what is still past each TTL once the run is over', async () => {
    prismaMock.waWebhookEvent.count.mockResolvedValue(4200);

    await handleWaPruneRetention();

    // Counted against the SAME cutoff the prune used, so the gauge answers "how
    // far past its own retention promise is this deployment", not "how big is
    // the table".
    expect(prismaMock.waWebhookEvent.count).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 14 * DAY_MS) } },
      take: 100_000,
    });
    expect(waRetentionRowsOverdueMock.set).toHaveBeenCalledWith(
      { table: 'wa_webhook_event' },
      4200
    );
    expect(waRetentionRowsOverdueMock.set).toHaveBeenCalledWith({ table: 'audit_log' }, 0);
  });

  it('reports zero for messages when no retention window is configured', async () => {
    prismaMock.waSettings.findUnique.mockResolvedValue({ retentionDays: null });

    await handleWaPruneRetention();

    expect(prismaMock.waMessage.count).not.toHaveBeenCalled();
    expect(waRetentionRowsOverdueMock.set).toHaveBeenCalledWith({ table: 'wa_message' }, 0);
  });

  it('does not fail the prune when a count query errors', async () => {
    prismaMock.auditLog.count.mockRejectedValue(new Error('statement timeout'));

    await expect(handleWaPruneRetention()).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'WhatsApp retention prune: overdue count for audit_log failed: statement timeout'
    );
    // The tables after the failing one are still measured.
    expect(waRetentionRowsOverdueMock.set).toHaveBeenCalledWith({ table: 'wa_link_click' }, 0);
  });
});

describe('handleWaEventRecovery', () => {
  it('retires events that exhausted their replays so they stop squatting the window', async () => {
    prismaMock.waWebhookEvent.findMany.mockResolvedValue([]);
    prismaMock.waWebhookEvent.updateMany.mockResolvedValue({ count: 3 });

    await handleWaEventRecovery();

    expect(prismaMock.waWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: { processedAt: null, signatureOk: true, deferAttempts: { gte: 12 } },
      data: { processedAt: NOW },
    });
    // The sweep takes the OLDEST 200; without this, a few permanently-stuck
    // events sit at the front of that window forever and recoverable ones are
    // never reached.
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('gave up on 3 event(s)'));
  });

  it('only considers events still under the replay ceiling', async () => {
    await handleWaEventRecovery();

    expect(prismaMock.waWebhookEvent.findMany.mock.calls[0][0].where.deferAttempts).toEqual({
      lt: 12,
    });
  });

  it('counts the attempt before re-enqueueing, so a failing event converges', async () => {
    prismaMock.waWebhookEvent.findMany.mockResolvedValue([{ id: 'ev-1' }]);

    await handleWaEventRecovery();

    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { deferAttempts: { increment: 1 }, lastAttemptAt: NOW },
    });
    expect(requeueWhatsappInboundJobMock).toHaveBeenCalledWith('ev-1');
  });

  it('keeps going when one event cannot be re-enqueued', async () => {
    prismaMock.waWebhookEvent.findMany.mockResolvedValue([{ id: 'ev-1' }, { id: 'ev-2' }]);
    requeueWhatsappInboundJobMock.mockRejectedValueOnce(new Error('queue closed'));

    await handleWaEventRecovery();

    expect(requeueWhatsappInboundJobMock).toHaveBeenCalledTimes(2);
    expect(loggerMock.info).toHaveBeenCalledWith(
      'WhatsApp event recovery: re-enqueued 1/2 stuck event(s)'
    );
  });
});

describe('handleWaCampaignRecovery', () => {
  it('never looks at SEQUENCE campaigns', async () => {
    await handleWaCampaignRecovery();

    // A drip leaves every recipient PENDING by design. Re-batching one blasts
    // its first template to the whole audience at once and then marks the
    // campaign COMPLETED, silently cancelling the remaining steps.
    expect(prismaMock.waCampaign.findMany).toHaveBeenCalledWith({
      where: { status: 'RUNNING', type: 'BROADCAST' },
      select: { id: true, batchSize: true },
    });
  });

  it('retires a drained campaign through completeCampaign, not a bare status write', async () => {
    prismaMock.waCampaign.findMany.mockResolvedValue([{ id: 'c1', batchSize: 100 }]);
    prismaMock.waCampaignRecipient.count.mockResolvedValue(0);

    await handleWaCampaignRecovery();

    // completeCampaign is what arms `nextRunAt`; a status write here used to
    // stop a recurring campaign from ever recurring again.
    expect(campaignServiceMock.completeCampaign).toHaveBeenCalledWith('c1');
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
    expect(campaignServiceMock.enqueuePendingRecipients).not.toHaveBeenCalled();
  });

  it('leaves a campaign alone while its recipients are still being attempted', async () => {
    prismaMock.waCampaign.findMany.mockResolvedValue([{ id: 'c1', batchSize: 100 }]);
    prismaMock.waCampaignRecipient.count
      .mockResolvedValueOnce(50) // PENDING
      .mockResolvedValueOnce(7); // attempted inside the stall window

    await handleWaCampaignRecovery();

    // Progress is measured by `lastAttemptAt`, not `sentAt`: a campaign being
    // throttled by Meta rolls recipients back to PENDING with sentAt null, and
    // is exactly the one that must not be re-batched on top of itself.
    expect(campaignServiceMock.enqueuePendingRecipients).not.toHaveBeenCalled();
    expect(prismaMock.waCampaignRecipient.count.mock.calls[1][0].where.lastAttemptAt).toEqual({
      gte: new Date(NOW.getTime() - 5 * 60 * 1000),
    });
  });

  it('skips a stalled campaign that already has batch jobs queued', async () => {
    prismaMock.waCampaign.findMany.mockResolvedValue([{ id: 'c1', batchSize: 100 }]);
    prismaMock.waCampaignRecipient.count.mockResolvedValueOnce(50).mockResolvedValueOnce(0);
    campaignQueueMock.getJobs.mockResolvedValue([{ data: { campaignId: 'c1' } }]);

    await handleWaCampaignRecovery();

    expect(campaignServiceMock.enqueuePendingRecipients).not.toHaveBeenCalled();
  });

  it('re-batches a genuinely stalled campaign under a per-tick cap', async () => {
    prismaMock.waCampaign.findMany.mockResolvedValue([{ id: 'c1', batchSize: 250 }]);
    prismaMock.waCampaignRecipient.count.mockResolvedValueOnce(9000).mockResolvedValueOnce(0);
    campaignServiceMock.enqueuePendingRecipients.mockResolvedValue(5000);

    await handleWaCampaignRecovery();

    expect(campaignServiceMock.enqueuePendingRecipients).toHaveBeenCalledWith('c1', 250, 5000);
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('capped at 5000'));
  });

  it('keeps sweeping after one campaign throws', async () => {
    prismaMock.waCampaign.findMany.mockResolvedValue([
      { id: 'c1', batchSize: 100 },
      { id: 'c2', batchSize: 100 },
    ]);
    prismaMock.waCampaignRecipient.count
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(0);

    await handleWaCampaignRecovery();

    expect(loggerMock.error).toHaveBeenCalledWith('WhatsApp campaign c1 recovery failed: timeout');
    expect(campaignServiceMock.completeCampaign).toHaveBeenCalledWith('c2');
  });
});

describe('handleWaMediaReconcile', () => {
  const HOUR_MS = 60 * 60 * 1000;
  /** Older than the 24h grace window, so eligible for the sweep. */
  const OLD = new Date(NOW.getTime() - 48 * HOUR_MS);

  interface ListedPage {
    objects: Array<{ key: string; lastModified?: Date }>;
    nextToken?: string;
  }

  /**
   * Listing stub that answers per prefix, then empty pages forever.
   *
   * The reconcile makes two passes over two different prefixes — staged
   * send-later attachments, then the archive — and they have different owner
   * tables. A stub that hands both passes the same page has the scheduled sweep
   * deleting archived media because no WaScheduledMessage names it.
   */
  function serveListing(byPrefix: Record<string, ListedPage[]>) {
    const seen: Record<string, number> = {};
    return async (prefix: string): Promise<ListedPage> => {
      const i = seen[prefix] ?? 0;
      seen[prefix] = i + 1;
      return byPrefix[prefix]?.[i] ?? { objects: [] };
    };
  }

  it('does nothing at all when no bucket is configured', async () => {
    isR2ConfiguredMock.mockReturnValue(false);

    await handleWaMediaReconcile();

    // Running without R2 is supported; it must not error once a night for it.
    expect(listObjectKeysMock).not.toHaveBeenCalled();
    expect(deleteFileFromR2Mock).not.toHaveBeenCalled();
  });

  it('deletes archived objects no message references and spares the rest', async () => {
    listObjectKeysMock.mockImplementation(
      serveListing({
        'whatsapp-media/': [
          {
            objects: [
              { key: 'whatsapp-media/kept.jpg', lastModified: OLD },
              { key: 'whatsapp-media/orphan.jpg', lastModified: OLD },
            ],
          },
        ],
      })
    );
    prismaMock.waMessage.findMany.mockResolvedValue([
      { mediaUrl: 'whatsapp-media/kept.jpg', mediaThumbUrl: null },
    ]);

    await handleWaMediaReconcile();

    expect(listObjectKeysMock).toHaveBeenCalledWith('whatsapp-media/', undefined);
    // One lookup for the whole page, not one per key.
    expect(prismaMock.waMessage.findMany).toHaveBeenCalledTimes(1);
    // BOTH columns: the thumbnails live under the same prefix but are named by
    // `mediaThumbUrl`, so matching on `mediaUrl` alone finds no owner for any of
    // them and deletes every thumbnail in the bucket a day after it is written.
    expect(prismaMock.waMessage.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { mediaUrl: { in: ['whatsapp-media/kept.jpg', 'whatsapp-media/orphan.jpg'] } },
          { mediaThumbUrl: { in: ['whatsapp-media/kept.jpg', 'whatsapp-media/orphan.jpg'] } },
        ],
      },
      select: { mediaUrl: true, mediaThumbUrl: true },
    });
    expect(deleteFileFromR2Mock).toHaveBeenCalledTimes(1);
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-media/orphan.jpg');
  });

  it('leaves objects inside the grace window alone', async () => {
    listObjectKeysMock.mockResolvedValue({
      objects: [
        { key: 'whatsapp-media/fresh.jpg', lastModified: new Date(NOW.getTime() - HOUR_MS) },
      ],
    });

    await handleWaMediaReconcile();

    // The archive queue retries a failed job for ~17 hours and re-uploads the
    // same key each time, so a just-written object is very often one whose stamp
    // has not landed yet — deleting it would lose the customer's media.
    expect(prismaMock.waMessage.findMany).not.toHaveBeenCalled();
    expect(deleteFileFromR2Mock).not.toHaveBeenCalled();
  });

  it('follows the continuation token to the end of the prefix', async () => {
    listObjectKeysMock.mockImplementation(
      serveListing({
        'whatsapp-media/': [
          {
            objects: [{ key: 'whatsapp-media/a.jpg', lastModified: OLD }],
            nextToken: 'page-2',
          },
          { objects: [{ key: 'whatsapp-media/b.jpg', lastModified: OLD }] },
        ],
      })
    );
    prismaMock.waMessage.findMany.mockResolvedValue([]);

    await handleWaMediaReconcile();

    // A listing is capped at 1000 keys: stopping at the first page would mean
    // every orphan past it is never swept, on any run. The scheduled prefix is
    // swept first, so the archive's second page is the third listing overall.
    expect(listObjectKeysMock).toHaveBeenNthCalledWith(3, 'whatsapp-media/', 'page-2');
    expect(deleteFileFromR2Mock).toHaveBeenCalledTimes(2);
  });

  it('sweeps staged send-later attachments against their own owner table', async () => {
    listObjectKeysMock.mockImplementation(
      serveListing({
        'whatsapp-scheduled/': [
          {
            objects: [
              { key: 'whatsapp-scheduled/pending.pdf', lastModified: OLD },
              { key: 'whatsapp-scheduled/abandoned.pdf', lastModified: OLD },
            ],
          },
        ],
      })
    );
    prismaMock.waScheduledMessage.findMany.mockResolvedValue([
      { mediaKey: 'whatsapp-scheduled/pending.pdf' },
    ]);

    await handleWaMediaReconcile();

    // A staged attachment is named by its scheduled row, not by a message — so
    // asking WaMessage about it would delete the file every send-later message
    // is still waiting to send.
    expect(prismaMock.waScheduledMessage.findMany).toHaveBeenCalledWith({
      where: {
        mediaKey: {
          in: ['whatsapp-scheduled/pending.pdf', 'whatsapp-scheduled/abandoned.pdf'],
        },
      },
      select: { mediaKey: true },
    });
    expect(deleteFileFromR2Mock).toHaveBeenCalledTimes(1);
    expect(deleteFileFromR2Mock).toHaveBeenCalledWith('whatsapp-scheduled/abandoned.pdf');
  });

  it('keeps sweeping after one object fails to delete', async () => {
    listObjectKeysMock.mockImplementation(
      serveListing({
        'whatsapp-media/': [
          {
            objects: [
              { key: 'whatsapp-media/a.jpg', lastModified: OLD },
              { key: 'whatsapp-media/b.jpg', lastModified: OLD },
            ],
          },
        ],
      })
    );
    prismaMock.waMessage.findMany.mockResolvedValue([]);
    deleteFileFromR2Mock.mockRejectedValueOnce(new Error('AccessDenied'));

    await handleWaMediaReconcile();

    expect(deleteFileFromR2Mock).toHaveBeenCalledTimes(2);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'WhatsApp media reconcile could not delete orphan whatsapp-media/a.jpg: AccessDenied'
    );
  });

  it('gives up quietly when the bucket cannot be listed', async () => {
    listObjectKeysMock.mockRejectedValue(new Error('SignatureDoesNotMatch'));

    await expect(handleWaMediaReconcile()).resolves.toBeUndefined();

    expect(deleteFileFromR2Mock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'WhatsApp media reconcile listing failed: SignatureDoesNotMatch'
    );
  });

  it('stops on its wall-clock budget and says so', async () => {
    listObjectKeysMock.mockImplementation(async () => {
      jest.advanceTimersByTime(120000); // each page costs 2 min of the 5 min budget
      return { objects: [], nextToken: 'more' };
    });

    await handleWaMediaReconcile();

    expect(listObjectKeysMock).toHaveBeenCalledTimes(3);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('ran out of its 300000ms budget')
    );
  });
});
