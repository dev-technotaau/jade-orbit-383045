import Razorpay from 'razorpay';
import crypto from 'crypto';
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import { env, isRazorpayConfigured, isRazorpayWebhookConfigured } from './env';
import logger from './logger';

const tracer = trace.getTracer('razorpay');

let _client: Razorpay | null = null;

/**
 * Lazy singleton — returns null if Razorpay credentials are not configured.
 * All callers MUST handle null and degrade gracefully (per the Hire Adda
 * pattern for optional services like Firebase, Cloud Talent, etc.).
 */
export function getRazorpayClient(): Razorpay | null {
  if (_client) return _client;
  if (!isRazorpayConfigured()) {
    logger.warn(
      'Razorpay client requested but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing — billing features disabled.'
    );
    return null;
  }
  _client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID!,
    key_secret: env.RAZORPAY_KEY_SECRET!,
  });
  logger.info('Razorpay client initialized', {
    mode: env.RAZORPAY_KEY_ID!.startsWith('rzp_live_') ? 'live' : 'test',
  });
  return _client;
}

/**
 * Wraps any Razorpay SDK call in an OpenTelemetry span. Adds standard
 * attributes (action, key id mode) and records exceptions.
 */
export async function withRazorpaySpan<T>(
  action: string,
  fn: (span: Span) => Promise<T>,
  attrs: Record<string, string | number | boolean> = {}
): Promise<T> {
  return tracer.startActiveSpan(`razorpay.${action}`, async (span) => {
    span.setAttribute('razorpay.action', action);
    span.setAttribute(
      'razorpay.mode',
      env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ? 'live' : 'test'
    );
    for (const [k, v] of Object.entries(attrs)) span.setAttribute(`razorpay.${k}`, v);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      const e = err as Error & { error?: { code?: string; description?: string } };
      span.recordException(e);
      span.setAttribute('razorpay.error.code', e.error?.code ?? 'UNKNOWN');
      span.setAttribute('razorpay.error.description', e.error?.description ?? e.message ?? '');
      span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

// =============================================================
// Signature verification — used by checkout verify and webhook
// =============================================================

/**
 * Verifies Razorpay payment signature returned in checkout success callback.
 * `razorpay_signature = HMAC_SHA256(orderId|paymentId, KEY_SECRET)`.
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const payload = `${args.orderId}|${args.paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');
  return safeEqual(expected, args.signature);
}

/**
 * Verifies Razorpay subscription payment signature (slightly different from
 * standard payment): `HMAC_SHA256(paymentId|subscriptionId, KEY_SECRET)`.
 */
export function verifySubscriptionPaymentSignature(args: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const payload = `${args.paymentId}|${args.subscriptionId}`;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');
  return safeEqual(expected, args.signature);
}

/**
 * Verifies Razorpay webhook signature: HMAC_SHA256 of the raw request body
 * keyed with the webhook secret. The raw body MUST be captured before any
 * JSON parsing — see middleware/razorpay-webhook-rawbody.ts.
 */
export function verifyWebhookSignature(args: {
  rawBody: string | Buffer;
  signature: string;
}): boolean {
  if (!isRazorpayWebhookConfigured()) return false;
  const body = typeof args.rawBody === 'string' ? args.rawBody : args.rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  return safeEqual(expected, args.signature);
}

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// =============================================================
// Idempotency key helpers
// =============================================================

/**
 * Build a deterministic idempotency key for an order create call.
 * Format: `order:<userId>:<planCode>:<nonce>`. The nonce is provided by the
 * client (via Idempotency-Key header) and ties retries to the same row.
 */
export function buildOrderIdempotencyKey(
  userId: string,
  planCode: string,
  clientNonce: string
): string {
  return `order:${userId}:${planCode}:${clientNonce}`;
}

// =============================================================
// Card fingerprinting (for fraud detection)
// =============================================================

/**
 * Stable hash of a card's identifiable attributes — used to flag the same
 * card being used across distinct accounts. Razorpay never returns full PAN
 * so this is the strongest signal we have.
 */
export function cardFingerprint(card: {
  last4?: string | null;
  network?: string | null;
  issuer?: string | null;
  type?: string | null;
}): string {
  const parts = [
    card.last4 ?? '',
    (card.network ?? '').toUpperCase(),
    (card.issuer ?? '').toUpperCase(),
    (card.type ?? '').toUpperCase(),
  ].join(':');
  return crypto.createHash('sha256').update(parts).digest('hex');
}

export { Razorpay };

// =============================================================
// SDK helpers — thin OTel-wrapped wrappers per §3.1 of the plan
//
// Centralised here so every Razorpay SDK call:
//   1. has a `razorpay.<action>` span
//   2. surfaces missing-credentials gracefully (returns null/throws)
//   3. is monkey-patchable in tests (single import surface)
//
// Services should prefer these over `getRazorpayClient().<resource>.<method>`
// for new code; legacy direct-call sites continue to work.
// =============================================================

class RazorpayUnavailableError extends Error {
  constructor() {
    super('Razorpay client is not configured (missing RAZORPAY_KEY_ID / KEY_SECRET).');
    this.name = 'RazorpayUnavailableError';
  }
}

function client(): Razorpay {
  const c = getRazorpayClient();
  if (!c) throw new RazorpayUnavailableError();
  return c;
}

// ---- Orders ----------------------------------------------------

export interface CreateOrderArgs {
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string | number>;
  partial_payment?: boolean;
  payment_capture?: 0 | 1;
}

export async function createOrder(args: CreateOrderArgs): Promise<{
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}> {
  return withRazorpaySpan(
    'orders.create',
    async () => {
      const order = (await client().orders.create(
        args as unknown as Parameters<Razorpay['orders']['create']>[0]
      )) as unknown as {
        id: string;
        amount: number;
        currency: string;
        receipt?: string;
        status: string;
      };
      return order;
    },
    {
      'order.amount': args.amount,
      'order.currency': args.currency,
    }
  );
}

export async function fetchOrder(orderId: string): Promise<unknown> {
  return withRazorpaySpan('orders.fetch', async () => client().orders.fetch(orderId), { orderId });
}

// ---- Payments --------------------------------------------------

export async function fetchPayment(paymentId: string): Promise<unknown> {
  return withRazorpaySpan('payments.fetch', async () => client().payments.fetch(paymentId), {
    paymentId,
  });
}

export async function capturePayment(args: {
  paymentId: string;
  amount: number;
  currency: string;
}): Promise<unknown> {
  return withRazorpaySpan(
    'payments.capture',
    async () => client().payments.capture(args.paymentId, args.amount, args.currency),
    { paymentId: args.paymentId, amount: args.amount }
  );
}

// ---- Refunds ---------------------------------------------------

export interface CreateRefundArgs {
  paymentId: string;
  amount?: number;
  speed?: 'normal' | 'optimum';
  notes?: Record<string, string | number>;
  receipt?: string;
}

export async function createRefund(args: CreateRefundArgs): Promise<{
  id: string;
  amount: number;
  currency: string;
  status: string;
  speed_processed?: string;
  speed_requested?: string;
}> {
  return withRazorpaySpan(
    'refunds.create',
    async () => {
      const result = (await client().payments.refund(args.paymentId, {
        amount: args.amount,
        speed: args.speed,
        notes: args.notes,
        receipt: args.receipt,
      } as unknown as Parameters<Razorpay['payments']['refund']>[1])) as unknown as {
        id: string;
        amount: number;
        currency: string;
        status: string;
      };
      return result;
    },
    { paymentId: args.paymentId, amount: args.amount ?? -1 }
  );
}

// ---- Plans -----------------------------------------------------

export interface CreatePlanArgs {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  item: { name: string; amount: number; currency: string; description?: string };
  notes?: Record<string, string | number>;
}

export async function createPlan(args: CreatePlanArgs): Promise<{ id: string; status: string }> {
  return withRazorpaySpan(
    'plans.create',
    async () => {
      return (await client().plans.create(
        args as unknown as Parameters<Razorpay['plans']['create']>[0]
      )) as unknown as {
        id: string;
        status: string;
      };
    },
    { period: args.period, interval: args.interval }
  );
}

// ---- Subscriptions --------------------------------------------

export interface CreateSubscriptionArgs {
  plan_id: string;
  total_count?: number;
  customer_notify?: 0 | 1;
  start_at?: number;
  expire_by?: number;
  notes?: Record<string, string | number>;
  addons?: Array<{ item: { name: string; amount: number; currency: string } }>;
}

export async function createSubscription(args: CreateSubscriptionArgs): Promise<{
  id: string;
  status: string;
  short_url?: string;
}> {
  return withRazorpaySpan(
    'subscriptions.create',
    async () => {
      return (await client().subscriptions.create(
        args as unknown as Parameters<Razorpay['subscriptions']['create']>[0]
      )) as unknown as {
        id: string;
        status: string;
        short_url?: string;
      };
    },
    { plan_id: args.plan_id, total_count: args.total_count ?? -1 }
  );
}

export async function fetchSubscription(subscriptionId: string): Promise<unknown> {
  return withRazorpaySpan(
    'subscriptions.fetch',
    async () => client().subscriptions.fetch(subscriptionId),
    { subscriptionId }
  );
}

export async function cancelSubscription(args: {
  subscriptionId: string;
  cancelAtCycleEnd?: boolean;
}): Promise<unknown> {
  return withRazorpaySpan(
    'subscriptions.cancel',
    async () => client().subscriptions.cancel(args.subscriptionId, args.cancelAtCycleEnd === false),
    { subscriptionId: args.subscriptionId, immediate: args.cancelAtCycleEnd === false }
  );
}

export async function pauseSubscription(args: {
  subscriptionId: string;
  pause_at?: 'now';
}): Promise<unknown> {
  return withRazorpaySpan(
    'subscriptions.pause',
    async () =>
      client().subscriptions.pause(args.subscriptionId, { pause_at: args.pause_at ?? 'now' }),
    { subscriptionId: args.subscriptionId }
  );
}

export async function resumeSubscription(args: {
  subscriptionId: string;
  resume_at?: 'now';
}): Promise<unknown> {
  return withRazorpaySpan(
    'subscriptions.resume',
    async () =>
      client().subscriptions.resume(args.subscriptionId, { resume_at: args.resume_at ?? 'now' }),
    { subscriptionId: args.subscriptionId }
  );
}

// ---- Customers + tokens ---------------------------------------

export interface CreateCustomerArgs {
  name: string;
  email?: string;
  contact?: string;
  fail_existing?: 0 | 1;
  notes?: Record<string, string | number>;
}

export async function createCustomer(
  args: CreateCustomerArgs
): Promise<{ id: string; email?: string; contact?: string }> {
  return withRazorpaySpan(
    'customers.create',
    async () => {
      return (await client().customers.create(
        args as unknown as Parameters<Razorpay['customers']['create']>[0]
      )) as unknown as {
        id: string;
        email?: string;
        contact?: string;
      };
    },
    { name: args.name }
  );
}

/**
 * Token list for a customer — used to surface saved cards / VPAs / mandates
 * in the user's payment-methods UI.
 */
export async function fetchCustomerTokens(customerId: string): Promise<unknown> {
  return withRazorpaySpan(
    'customers.fetchTokens',
    async () => {
      const customers = client().customers as unknown as {
        fetchTokens?: (id: string) => Promise<unknown>;
      };
      if (typeof customers.fetchTokens !== 'function') return { items: [] };
      return customers.fetchTokens(customerId);
    },
    { customerId }
  );
}

/**
 * Tokenize a card / instrument — Razorpay handles the full SAQ-A scope, so
 * this just proxies to the API. We never see the underlying PAN.
 */
export async function tokenize(args: {
  method: 'card' | 'upi' | 'wallet' | 'netbanking';
  customer_id: string;
  notes?: Record<string, string | number>;
}): Promise<unknown> {
  return withRazorpaySpan(
    'tokens.create',
    async () => {
      const tokens = (
        client() as unknown as {
          tokens?: { create?: (args: unknown) => Promise<unknown> };
        }
      ).tokens;
      if (!tokens?.create) {
        throw new Error(
          'Razorpay SDK tokens.create not available — upgrade SDK or use customers.fetchTokens'
        );
      }
      return tokens.create(args);
    },
    { method: args.method, customer_id: args.customer_id }
  );
}

// ---- Settlements + Disputes ----------------------------------

export async function fetchSettlements(
  args: { count?: number; skip?: number; from?: number; to?: number } = {}
): Promise<{
  items: Array<unknown>;
  count?: number;
}> {
  return withRazorpaySpan(
    'settlements.all',
    async () => {
      return (await client().settlements.all(args)) as unknown as {
        items: Array<unknown>;
        count?: number;
      };
    },
    { count: args.count ?? 100 }
  );
}

export async function fetchSettlement(settlementId: string): Promise<unknown> {
  return withRazorpaySpan(
    'settlements.fetch',
    async () => client().settlements.fetch(settlementId),
    { settlementId }
  );
}

export async function fetchDisputes(args: { count?: number; skip?: number } = {}): Promise<{
  items: Array<unknown>;
  count?: number;
}> {
  return withRazorpaySpan(
    'disputes.all',
    async () => {
      const disputesApi = (
        client() as unknown as {
          disputes?: { all?: (args: Record<string, unknown>) => Promise<unknown> };
        }
      ).disputes;
      if (!disputesApi?.all) return { items: [] };
      return (await disputesApi.all(args as Record<string, unknown>)) as unknown as {
        items: Array<unknown>;
        count?: number;
      };
    },
    { count: args.count ?? 100 }
  );
}

// ---- Verification helpers ------------------------------------

/**
 * Convenience verifier matching the §3.1 spec name. Same as
 * `verifyPaymentSignature` but takes the Razorpay-style payload shape.
 */
export function verifyCheckoutSignature(args: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): boolean {
  return verifyPaymentSignature({
    orderId: args.razorpay_order_id,
    paymentId: args.razorpay_payment_id,
    signature: args.razorpay_signature,
  });
}
