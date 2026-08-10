import type { Request, Response } from 'express';
import { Router } from 'express';
import client from 'prom-client';

const router = Router();

// Collect default Node.js metrics (memory, GC, event loop lag, etc.)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'nodejs_' });

// ── Custom Metrics ──

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});

// Active connections gauge
export const activeConnections = new client.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
});

// BullMQ queue metrics (updated periodically)
export const bullmqQueueWaiting = new client.Gauge({
  name: 'bullmq_queue_waiting',
  help: 'Number of waiting jobs in BullMQ queue',
  labelNames: ['queue'] as const,
});

export const bullmqQueueActive = new client.Gauge({
  name: 'bullmq_queue_active',
  help: 'Number of active jobs in BullMQ queue',
  labelNames: ['queue'] as const,
});

export const bullmqQueueCompleted = new client.Gauge({
  name: 'bullmq_queue_completed',
  help: 'Number of completed jobs in BullMQ queue',
  labelNames: ['queue'] as const,
});

export const bullmqQueueFailed = new client.Gauge({
  name: 'bullmq_queue_failed',
  help: 'Number of failed jobs in BullMQ queue',
  labelNames: ['queue'] as const,
});

// ──────────────────────────────────────────────────────────
// Billing metrics (Phase 14)
// ──────────────────────────────────────────────────────────

// Ten billing_* counters/gauges/histograms (payments, orders, Razorpay webhook
// deliveries, revenue, renewals, refunds, fraud signals, entitlement
// consumption, active subscriptions, payment latency) were declared here and
// never incremented — the billing system they measured is gone.

// GET /metrics — Prometheus scrape endpoint
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch {
    res.status(500).end();
  }
});

export default router;
