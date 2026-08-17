/**
 * Tests for the BullMQ worker leader election (src/jobs/worker-leader.ts).
 *
 * Every message this module processes — inbound webhooks, media, auto-replies,
 * campaign batches, bulk contact imports, the scheduler, outbound webhooks — runs
 * inside a Worker that only the leader creates. So the transitions are the whole product: fail to
 * promote and nothing is processed at all; demote without closing the workers
 * and two instances send the same campaign batch twice; demote on a single Redis
 * hiccup and a campaign drain restarts for no reason.
 *
 * The lock is a fake and timers are fake, so promotion, renewal-failure
 * tolerance, demotion and the demote→promote flap are driven deterministically
 * rather than waited for.
 */

const acquireLockMock = jest.fn<Promise<string | null>, [string, number]>();
const releaseLockMock = jest.fn<Promise<boolean>, [string, string]>();
const renewLockMock = jest.fn<Promise<boolean>, [string, string, number]>();
jest.mock('../../utils/distributed-lock', () => ({
  acquireLock: acquireLockMock,
  releaseLock: releaseLockMock,
  renewLock: renewLockMock,
}));

const updateServiceMock = jest.fn();
jest.mock('../../config/service-status', () => ({ updateService: updateServiceMock }));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const gauge = () => ({ set: jest.fn() });
const gauges = {
  bullmqQueueWaiting: gauge(),
  bullmqQueueActive: gauge(),
  bullmqQueueCompleted: gauge(),
  bullmqQueueFailed: gauge(),
};
jest.mock('../../routes/metrics.routes', () => gauges);

const waWorkerLeaderGauge = gauge();
const waWorkerLeaderRenewFailures = { inc: jest.fn() };
jest.mock('../../utils/whatsapp-metrics', () => ({
  waWorkerLeader: waWorkerLeaderGauge,
  waWorkerLeaderRenewFailuresTotal: waWorkerLeaderRenewFailures,
}));

/** Every Worker the manager has ever created, in creation order. */
const createdWorkers: Array<{ close: jest.Mock }> = [];
const spawn = () => {
  const worker = { close: jest.fn().mockResolvedValue(undefined) };
  createdWorkers.push(worker);
  return worker;
};
const factories = {
  inbound: jest.fn(spawn),
  media: jest.fn(spawn),
  autoReply: jest.fn(spawn),
  campaign: jest.fn(spawn),
  importJobs: jest.fn(spawn),
  scheduler: jest.fn(spawn),
  webhook: jest.fn(spawn),
};
jest.mock('../whatsapp-inbound.worker', () => ({ createWhatsappInboundWorker: factories.inbound }));
jest.mock('../whatsapp-media.worker', () => ({ createWhatsappMediaWorker: factories.media }));
jest.mock('../whatsapp-autoreply.worker', () => ({
  createWhatsappAutoReplyWorker: factories.autoReply,
}));
jest.mock('../whatsapp-campaign.worker', () => ({
  createWhatsappCampaignWorker: factories.campaign,
}));
jest.mock('../whatsapp-import.worker', () => ({
  createWhatsappImportWorker: factories.importJobs,
}));
jest.mock('../scheduler.worker', () => ({ createSchedulerWorker: factories.scheduler }));
jest.mock('../webhook.worker', () => ({ createWebhookWorker: factories.webhook }));

const fakeQueue = (name: string) => ({
  name,
  getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 2, completed: 3, failed: 4 }),
});
const queues = {
  inbound: fakeQueue('whatsapp-inbound-queue'),
  media: fakeQueue('whatsapp-media-queue'),
  autoReply: fakeQueue('whatsapp-autoreply-queue'),
  campaign: fakeQueue('whatsapp-campaign-queue'),
  importJobs: fakeQueue('whatsapp-import-queue'),
  scheduler: fakeQueue('scheduler-queue'),
  webhook: fakeQueue('webhook-queue'),
};
jest.mock('../whatsapp-inbound.queue', () => ({ whatsappInboundQueue: queues.inbound }));
jest.mock('../whatsapp-media.queue', () => ({ whatsappMediaQueue: queues.media }));
jest.mock('../whatsapp-autoreply.queue', () => ({ whatsappAutoReplyQueue: queues.autoReply }));
jest.mock('../whatsapp-campaign.queue', () => ({ whatsappCampaignQueue: queues.campaign }));
jest.mock('../whatsapp-import.queue', () => ({ whatsappImportQueue: queues.importJobs }));
jest.mock('../scheduler.queue', () => ({ schedulerQueue: queues.scheduler }));
jest.mock('../webhook.queue', () => ({ webhookQueue: queues.webhook }));

const LOCK_KEY = 'wa:worker-leader';
const LOCK_TTL = 30;
const RENEW_INTERVAL = 10_000;
const MONITOR_INTERVAL = 5_000;
const WORKER_COUNT = 7;

import type { workerLeader as WorkerLeader } from '../worker-leader';

type Leader = typeof WorkerLeader;

/**
 * The manager is a module singleton, so every test needs its own registry entry
 * — otherwise leadership state leaks from one case into the next.
 */
async function freshLeader(): Promise<Leader> {
  jest.resetModules();
  const mod = await import('../worker-leader');
  return mod.workerLeader;
}

let leader: Leader;

beforeEach(() => {
  jest.clearAllMocks();
  createdWorkers.length = 0;
  acquireLockMock.mockResolvedValue(null);
  renewLockMock.mockResolvedValue(true);
  releaseLockMock.mockResolvedValue(true);
  jest.useFakeTimers();
});

afterEach(() => {
  // Discards whatever intervals the manager left armed, so one test's renewal
  // timer cannot fire inside the next one.
  jest.useRealTimers();
});

describe('promotion', () => {
  it('starts every worker exactly once when it wins the lock', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();

    await expect(leader.tryBecomeLeader()).resolves.toBe(true);

    expect(leader.isLeader).toBe(true);
    expect(acquireLockMock).toHaveBeenCalledWith(LOCK_KEY, LOCK_TTL);
    expect(createdWorkers).toHaveLength(WORKER_COUNT);
    for (const factory of Object.values(factories)) {
      expect(factory).toHaveBeenCalledTimes(1);
    }
    expect(updateServiceMock).toHaveBeenCalledWith(
      'BullMQ Workers',
      'ready',
      `Leader — ${WORKER_COUNT} workers`
    );
  });

  it('renews the lock on a cadence that leaves headroom before the TTL', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 3);

    // Three renewals inside one 30s TTL — the margin the demotion tolerance
    // below spends.
    expect(renewLockMock).toHaveBeenCalledTimes(3);
    expect(renewLockMock).toHaveBeenLastCalledWith(LOCK_KEY, 'lock-1', LOCK_TTL);
    expect(leader.isLeader).toBe(true);
  });

  it('publishes queue depth gauges while it is leader', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    await jest.advanceTimersByTimeAsync(30_000);

    expect(gauges.bullmqQueueWaiting.set).toHaveBeenCalledWith(
      { queue: 'whatsapp-inbound-queue' },
      1
    );
    expect(gauges.bullmqQueueFailed.set).toHaveBeenCalledWith({ queue: 'webhook-queue' }, 4);
  });

  it('reports itself as the leader', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();

    await leader.tryBecomeLeader();

    // Nothing used to report WHICH instance held the lock, so a split where
    // NOBODY is leader — every worker stopped, campaigns frozen — looked
    // identical on every dashboard to a quiet queue.
    expect(waWorkerLeaderGauge.set).toHaveBeenCalledWith(1);
  });

  it('keeps collecting metrics for the other queues when one cannot be read', async () => {
    queues.campaign.getJobCounts.mockRejectedValueOnce(new Error('redis timeout'));
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    await jest.advanceTimersByTimeAsync(30_000);

    expect(gauges.bullmqQueueWaiting.set).toHaveBeenCalledWith({ queue: 'webhook-queue' }, 1);
  });
});

describe('standby', () => {
  it('creates no workers when another instance holds the lock', async () => {
    leader = await freshLeader();

    await expect(leader.tryBecomeLeader()).resolves.toBe(false);

    expect(leader.isLeader).toBe(false);
    expect(createdWorkers).toHaveLength(0);
    expect(updateServiceMock).toHaveBeenCalledWith(
      'BullMQ Workers',
      'ready',
      'Standby — monitoring'
    );
  });

  it('publishes queue depth gauges while it is a standby too', async () => {
    leader = await freshLeader();

    await leader.tryBecomeLeader();
    await jest.advanceTimersByTimeAsync(30_000);

    // Reading job counts needs no Worker. Collecting them on the leader alone
    // meant the standby served every bullmq_* gauge at prom-client's default of
    // 0, so scraping both replicas produced alternating real-and-zero series and
    // a queue-depth alert either flapped or averaged itself into silence.
    expect(gauges.bullmqQueueWaiting.set).toHaveBeenCalledWith(
      { queue: 'whatsapp-campaign-queue' },
      1
    );
    expect(gauges.bullmqQueueFailed.set).toHaveBeenCalledWith(
      { queue: 'whatsapp-campaign-queue' },
      4
    );
    expect(waWorkerLeaderGauge.set).toHaveBeenCalledWith(0);
    expect(createdWorkers).toHaveLength(0);
  });

  it('promotes itself once the leader lock becomes free', async () => {
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    await jest.advanceTimersByTimeAsync(MONITOR_INTERVAL * 2);
    expect(leader.isLeader).toBe(false);
    expect(createdWorkers).toHaveLength(0);

    acquireLockMock.mockResolvedValue('lock-2');
    await jest.advanceTimersByTimeAsync(MONITOR_INTERVAL);

    expect(leader.isLeader).toBe(true);
    expect(createdWorkers).toHaveLength(WORKER_COUNT);
  });

  it('stops polling for the lock once promoted, and renews instead', async () => {
    leader = await freshLeader();
    await leader.tryBecomeLeader();
    acquireLockMock.mockResolvedValue('lock-2');
    await jest.advanceTimersByTimeAsync(MONITOR_INTERVAL);
    const acquiresAtPromotion = acquireLockMock.mock.calls.length;

    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 2);

    // A monitor left running alongside the renewal would re-enter the promotion
    // path and build a second, unreachable set of workers.
    expect(acquireLockMock).toHaveBeenCalledTimes(acquiresAtPromotion);
    expect(renewLockMock).toHaveBeenCalledWith(LOCK_KEY, 'lock-2', LOCK_TTL);
    expect(createdWorkers).toHaveLength(WORKER_COUNT);
  });
});

describe('renewal failure', () => {
  it('tolerates a single failed renewal without dropping the workers', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    renewLockMock.mockResolvedValueOnce(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL);

    // One Redis hiccup must not drain every worker mid-campaign.
    expect(leader.isLeader).toBe(true);
    expect(createdWorkers.every((w) => w.close.mock.calls.length === 0)).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledWith('Leader lock renewal failed (1/2) — retrying');
  });

  it('counts every failed renewal, including the tolerated ones', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    renewLockMock.mockResolvedValueOnce(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL);

    // A link that fails one renewal in three never trips the demotion tolerance
    // but is expensive all the same, because a demotion drains and rebuilds
    // every worker. The counter is what makes that visible beforehand.
    expect(waWorkerLeaderRenewFailures.inc).toHaveBeenCalledTimes(1);
    expect(leader.isLeader).toBe(true);
  });

  it('resets the failure count after a renewal succeeds again', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    renewLockMock.mockResolvedValueOnce(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL); // failure 1
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL); // success — counter resets
    renewLockMock.mockResolvedValueOnce(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL); // failure 1 again, not 2

    // Only CONSECUTIVE failures count; otherwise an instance on a flaky link
    // demotes after a handful of unrelated blips spread over an hour.
    expect(leader.isLeader).toBe(true);
    expect(createdWorkers.every((w) => w.close.mock.calls.length === 0)).toBe(true);
  });

  it('demotes after two consecutive failures and closes every worker once', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();
    const firstSet = [...createdWorkers];

    acquireLockMock.mockResolvedValue(null); // the lock belongs to someone else now
    renewLockMock.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 2);

    expect(leader.isLeader).toBe(false);
    for (const worker of firstSet) {
      expect(worker.close).toHaveBeenCalledTimes(1);
    }
    expect(updateServiceMock).toHaveBeenLastCalledWith(
      'BullMQ Workers',
      'ready',
      'Standby — monitoring'
    );
    expect(waWorkerLeaderGauge.set).toHaveBeenLastCalledWith(0);
  });

  it('keeps publishing queue depth after a demotion', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    acquireLockMock.mockResolvedValue(null);
    renewLockMock.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 2);
    expect(leader.isLeader).toBe(false);
    gauges.bullmqQueueWaiting.set.mockClear();

    await jest.advanceTimersByTimeAsync(30_000);

    // The demoted instance is now the standby, and a standby that stops
    // reporting is the hole this whole collector used to leave.
    expect(gauges.bullmqQueueWaiting.set).toHaveBeenCalledWith(
      { queue: 'whatsapp-campaign-queue' },
      1
    );
  });

  it('stops renewing the moment it demotes, and starts monitoring instead', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    acquireLockMock.mockResolvedValue(null);
    renewLockMock.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 2);
    const renewsAtDemotion = renewLockMock.mock.calls.length;
    const acquiresAtDemotion = acquireLockMock.mock.calls.length;

    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 3);

    // The renewal interval used to keep firing all through the worker drain,
    // stacking a fresh demotion on top of the one already running.
    expect(renewLockMock).toHaveBeenCalledTimes(renewsAtDemotion);
    expect(acquireLockMock.mock.calls.length).toBeGreaterThan(acquiresAtDemotion);
  });

  it('re-promotes cleanly after a demotion without reusing the old workers', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();
    const firstSet = [...createdWorkers];

    acquireLockMock.mockResolvedValue(null);
    renewLockMock.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 2);
    expect(leader.isLeader).toBe(false);

    renewLockMock.mockResolvedValue(true);
    acquireLockMock.mockResolvedValue('lock-3');
    await jest.advanceTimersByTimeAsync(MONITOR_INTERVAL);

    expect(leader.isLeader).toBe(true);
    expect(createdWorkers).toHaveLength(WORKER_COUNT * 2);
    // The drained set is closed once and never touched again — the manager
    // takes its worker list before awaiting for exactly this reason.
    for (const worker of firstSet) {
      expect(worker.close).toHaveBeenCalledTimes(1);
    }

    // Renewal is re-armed on the NEW lock value; renewing with the stale one
    // would fail immediately and demote the instance it just promoted.
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL);
    expect(renewLockMock).toHaveBeenLastCalledWith(LOCK_KEY, 'lock-3', LOCK_TTL);
    expect(leader.isLeader).toBe(true);
  });
});

describe('shutdown', () => {
  it('closes the workers, releases the lock and stops every timer', async () => {
    acquireLockMock.mockResolvedValue('lock-1');
    leader = await freshLeader();
    await leader.tryBecomeLeader();
    const workers = [...createdWorkers];

    await leader.shutdown();

    expect(leader.isLeader).toBe(false);
    for (const worker of workers) {
      expect(worker.close).toHaveBeenCalledTimes(1);
    }
    expect(releaseLockMock).toHaveBeenCalledWith(LOCK_KEY, 'lock-1');

    const renews = renewLockMock.mock.calls.length;
    await jest.advanceTimersByTimeAsync(RENEW_INTERVAL * 5);
    // Renewing a lock we just released would claim leadership for a process
    // that is already draining its connections.
    expect(renewLockMock).toHaveBeenCalledTimes(renews);
    expect(createdWorkers).toHaveLength(WORKER_COUNT);

    // The metrics interval stops here and only here — a live one would hold the
    // event loop open past the drain.
    gauges.bullmqQueueWaiting.set.mockClear();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(gauges.bullmqQueueWaiting.set).not.toHaveBeenCalled();
  });

  it('never promotes a standby that is already shutting down', async () => {
    leader = await freshLeader();
    await leader.tryBecomeLeader();

    await leader.shutdown();
    acquireLockMock.mockResolvedValue('lock-4');
    await jest.advanceTimersByTimeAsync(MONITOR_INTERVAL * 3);

    expect(leader.isLeader).toBe(false);
    expect(createdWorkers).toHaveLength(0);
    // Nothing to release — a standby never held the lock.
    expect(releaseLockMock).not.toHaveBeenCalled();
  });
});
