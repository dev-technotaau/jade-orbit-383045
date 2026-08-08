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

/**
 * `billing_payments_total` — every payment row write keyed by status + method.
 * Used to compute success rate, method mix, and failure-cause dashboards.
 */
export const billingPaymentsTotal = new client.Counter({
  name: 'billing_payments_total',
  help: 'Razorpay payments by status + method',
  labelNames: ['status', 'method'] as const,
});

/**
 * `billing_orders_total` — every order state transition keyed by plan + status.
 * Source of truth for funnel + plan-mix dashboards.
 */
export const billingOrdersTotal = new client.Counter({
  name: 'billing_orders_total',
  help: 'Order state transitions by plan + status',
  labelNames: ['plan', 'status'] as const,
});

/**
 * `billing_webhooks_total` — every Razorpay webhook delivery by event + status.
 * Catches webhook delivery failures + signature mismatches.
 */
export const billingWebhooksTotal = new client.Counter({
  name: 'billing_webhooks_total',
  help: 'Razorpay webhook deliveries by event + status',
  labelNames: ['event', 'status'] as const,
});

/**
 * `billing_revenue_paise_total` — running total of captured revenue keyed by plan.
 * Matches the dashboard `total revenue (30d)` metric over time.
 */
export const billingRevenuePaiseTotal = new client.Counter({
  name: 'billing_revenue_paise_total',
  help: 'Captured revenue in paise by plan',
  labelNames: ['plan', 'currency'] as const,
});

/**
 * `billing_subscription_renewals_total` — subscription cycles keyed by outcome.
 * outcome = succeeded | failed | retried | halted
 */
export const billingSubscriptionRenewalsTotal = new client.Counter({
  name: 'billing_subscription_renewals_total',
  help: 'Subscription cycle outcomes',
  labelNames: ['plan', 'outcome'] as const,
});

/**
 * `billing_refunds_total` — refunds keyed by reason + status.
 */
export const billingRefundsTotal = new client.Counter({
  name: 'billing_refunds_total',
  help: 'Refunds by reason + status',
  labelNames: ['reason', 'status'] as const,
});

/**
 * `billing_fraud_signals_total` — fraud detector firings keyed by signal + severity.
 */
export const billingFraudSignalsTotal = new client.Counter({
  name: 'billing_fraud_signals_total',
  help: 'Fraud signals fired by detector + severity',
  labelNames: ['signal', 'severity', 'action'] as const,
});

/**
 * `billing_entitlement_consumptions_total` — every quota consumption keyed by unit.
 * Visualises hot-spots: are users burning CV unlocks faster than expected?
 */
export const billingEntitlementConsumptionsTotal = new client.Counter({
  name: 'billing_entitlement_consumptions_total',
  help: 'Resource consumptions by unit',
  labelNames: ['unit', 'plan'] as const,
});

/**
 * `billing_active_subscriptions` — gauge of currently-active subscriptions.
 * Periodically refreshed alongside BullMQ queue gauges.
 */
export const billingActiveSubscriptions = new client.Gauge({
  name: 'billing_active_subscriptions',
  help: 'Number of currently-active Razorpay subscriptions',
  labelNames: ['plan'] as const,
});

/**
 * `billing_payment_duration_seconds` — histogram of order-create → payment.captured latency.
 * Used to detect Razorpay degradation.
 */
export const billingPaymentDurationSeconds = new client.Histogram({
  name: 'billing_payment_duration_seconds',
  help: 'Latency from order creation to payment capture',
  labelNames: ['method'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
});

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
