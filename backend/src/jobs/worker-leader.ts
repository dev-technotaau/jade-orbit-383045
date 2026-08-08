import type { Queue, Worker } from 'bullmq';
import { acquireLock, releaseLock, renewLock } from '../utils/distributed-lock';
import { updateService } from '../config/service-status';
import logger from '../config/logger';
import {
  bullmqQueueWaiting,
  bullmqQueueActive,
  bullmqQueueCompleted,
  bullmqQueueFailed,
} from '../routes/metrics.routes';

import { createWhatsappWorker } from './whatsapp.worker';
import { createWhatsappInboundWorker } from './whatsapp-inbound.worker';
import { createWhatsappMediaWorker } from './whatsapp-media.worker';
import { createWhatsappCampaignWorker } from './whatsapp-campaign.worker';
import { createSchedulerWorker } from './scheduler.worker';
import { createWebhookWorker } from './webhook.worker';

// Queue instances for metrics collection
import { whatsappQueue } from './whatsapp.queue';
import { whatsappInboundQueue } from './whatsapp-inbound.queue';
import { whatsappMediaQueue } from './whatsapp-media.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { schedulerQueue } from './scheduler.queue';
import { webhookQueue } from './webhook.queue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_QUEUES: Queue<any>[] = [
  whatsappQueue,
  whatsappInboundQueue,
  whatsappMediaQueue,
  whatsappCampaignQueue,
  schedulerQueue,
  webhookQueue,
];

const LOCK_KEY = 'wa:worker-leader';
const LOCK_TTL = 30; // seconds — auto-expires if leader crashes
const RENEW_INTERVAL = 10_000; // ms — renew every 10s (3 chances before TTL)
const MONITOR_INTERVAL = 5_000; // ms — standby checks every 5s

/**
 * Manages BullMQ worker lifecycle via Redis-based leader election.
 *
 * When more than one instance is running, only the leader creates Worker
 * objects — each one holds a blocking Redis connection, and duplicated workers
 * would process the same jobs twice. The standby instance serves the API only
 * and auto-promotes if the leader dies or shuts down.
 *
 * The host platform also ran Kafka consumers under this same election. Kafka is
 * gone from this module, so leadership now governs BullMQ workers alone.
 */
class WorkerLeaderManager {
  private lockValue: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private workers: Worker<any>[] = [];
  private _isLeader = false;

  get isLeader(): boolean {
    return this._isLeader;
  }

  /**
   * Try to become the worker leader. On success, starts all workers.
   * Otherwise enters standby and monitors for leader failure.
   */
  async tryBecomeLeader(): Promise<boolean> {
    this.lockValue = await acquireLock(LOCK_KEY, LOCK_TTL);
    if (this.lockValue) {
      this._isLeader = true;
      this.startWorkers();
      this.startRenewal();
      this.startMetricsCollection();
      updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      return true;
    }

    // Standby mode — monitor for leader failure
    this.startMonitoring();
    updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
    return false;
  }

  private startWorkers(): void {
    this.workers = [
      createWhatsappWorker(),
      createWhatsappInboundWorker(),
      createWhatsappMediaWorker(),
      createWhatsappCampaignWorker(),
      createSchedulerWorker(),
      // Delivers WhatsApp domain events (message.inbound, contact.created,
      // campaign.completed, …) to subscribed CRM / Zapier endpoints. Without
      // it, webhookService.dispatch() enqueues jobs nothing ever processes.
      createWebhookWorker(),
    ];
    logger.info(`Worker leader elected — started ${this.workers.length} BullMQ workers`);
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      for (const queue of ALL_QUEUES) {
        try {
          const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
          bullmqQueueWaiting.set({ queue: queue.name }, counts.waiting);
          bullmqQueueActive.set({ queue: queue.name }, counts.active);
          bullmqQueueCompleted.set({ queue: queue.name }, counts.completed);
          bullmqQueueFailed.set({ queue: queue.name }, counts.failed);
        } catch {
          // Skip — queue may be temporarily unavailable
        }
      }
    }, 30_000);
  }

  private stopMetricsCollection(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * Periodically renew the leader lock. If renewal fails (lock stolen or Redis
   * down), transition to standby mode.
   */
  private startRenewal(): void {
    this.timer = setInterval(async () => {
      const renewed = await renewLock(LOCK_KEY, this.lockValue!, LOCK_TTL);
      if (!renewed) {
        logger.warn('Lost worker leadership (lock renewal failed)');
        this._isLeader = false;
        this.stopMetricsCollection();
        await this.stopWorkers();
        updateService('BullMQ Workers', 'ready', 'Standby — monitoring');
        this.startMonitoring();
      }
    }, RENEW_INTERVAL);
  }

  /**
   * Standby mode: poll to see whether the leader lock has become available.
   * When it has, acquire it and start the workers.
   */
  private startMonitoring(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      const acquired = await acquireLock(LOCK_KEY, LOCK_TTL);
      if (acquired) {
        this.lockValue = acquired;
        this._isLeader = true;
        if (this.timer) clearInterval(this.timer);
        this.startWorkers();
        this.startRenewal();
        this.startMetricsCollection();
        updateService('BullMQ Workers', 'ready', `Leader — ${this.workers.length} workers`);
      }
    }, MONITOR_INTERVAL);
  }

  private async stopWorkers(): Promise<void> {
    this.stopMetricsCollection();
    await Promise.allSettled(this.workers.map((w) => w.close()));
    this.workers = [];
    logger.info('Stopped all BullMQ workers');
  }

  /** Graceful shutdown: stop workers and release the leader lock. */
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.stopWorkers();
    if (this.lockValue) {
      await releaseLock(LOCK_KEY, this.lockValue);
      logger.info('Released worker leader lock');
    }
    this._isLeader = false;
  }
}

export const workerLeader = new WorkerLeaderManager();
