import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { metaEnvelopePhones } from '../utils/webhook-phone-index';
import { waWebhookParseFailuresTotal } from '../utils/whatsapp-metrics';
import type { Prisma } from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Verify Meta's `X-Hub-Signature-256` over the RAW request body using the App
 * Secret. Constant-time compare. Returns `false` when no App Secret is
 * configured (Phase 0 — webhook not yet activated) or on any mismatch.
 */
export function verifyWhatsappSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined
): boolean {
  const appSecret = env.META_WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = Buffer.from(signatureHeader);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length) return false;
  return crypto.timingSafeEqual(got, exp);
}

export type WaEventClass = {
  // 'message' / 'status' are the inbound-message + delivery-status paths; any
  // other recognized Meta webhook field (template/quality/account updates) is
  // classified by its raw `change.field` name so the audit row is meaningful.
  eventType: 'message' | 'status' | 'unknown' | (string & {});
  wamid: string | null;
};

/** Classify the webhook payload + extract a representative WAMID (best-effort). */
export function classifyWhatsappEvent(parsed: any): WaEventClass {
  try {
    const change = parsed?.entry?.[0]?.changes?.[0];
    const value = change?.value;
    if (Array.isArray(value?.messages) && value.messages.length > 0) {
      return { eventType: 'message', wamid: value.messages[0]?.id ?? null };
    }
    if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
      return { eventType: 'status', wamid: value.statuses[0]?.id ?? null };
    }
    // Non-message/status webhooks (template status, phone-number quality,
    // account alerts/updates, …): classify by the field name so the
    // WaWebhookEvent.eventType log reflects what arrived instead of 'unknown'.
    if (typeof change?.field === 'string' && change.field) {
      return { eventType: change.field, wamid: null };
    }
  } catch {
    /* fall through to unknown */
  }
  return { eventType: 'unknown', wamid: null };
}

/**
 * SHA-256 of the exact bytes Meta POSTed — the redelivery key.
 *
 * A retry carries the identical body: the WAMIDs and timestamps inside were
 * fixed at the moment of the original event, so the hash matches across every
 * attempt of the same delivery while differing for genuinely new traffic.
 */
function webhookBodyHash(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

/** Which row an ingest landed on, and whether it was already there. */
type PersistedEvent = { id: string; duplicate: boolean; alreadyProcessed: boolean };

/**
 * Insert one webhook row, collapsing Meta's retries onto the row we already hold.
 *
 * The `bodyHash` unique index does the deciding rather than a read-then-write:
 * Meta does not wait for a response before resending, so two attempts of the same
 * delivery can be in flight at once and would both pass a SELECT-then-INSERT
 * check. Losing the insert to P2002 is the dedup.
 */
async function persistWebhookEvent(
  data: Prisma.WaWebhookEventCreateInput & { bodyHash: string }
): Promise<PersistedEvent> {
  try {
    const row = await prisma.waWebhookEvent.create({ data, select: { id: true } });
    return { id: row.id, duplicate: false, alreadyProcessed: false };
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') throw err;
    const existing = await prisma.waWebhookEvent.findUnique({
      where: { bodyHash: data.bodyHash },
      select: { id: true, processedAt: true },
    });
    // Gone between the failed insert and this read — retention pruned it. As far
    // as this deployment is concerned the delivery is new again, so store it
    // rather than answering Meta 200 for something we no longer hold.
    if (!existing) {
      const row = await prisma.waWebhookEvent.create({ data, select: { id: true } });
      return { id: row.id, duplicate: false, alreadyProcessed: false };
    }
    return { id: existing.id, duplicate: true, alreadyProcessed: existing.processedAt !== null };
  }
}

/**
 * Verify-before-persist: always write a row for audit, but only store the real
 * (attacker-controlled) payload + classification when the signature verifies.
 * On a bad/unconfigured signature we persist a minimal stub (eventType
 * 'unknown', wamid null, payload {}, signatureOk false) so we never durably
 * store unverified attacker input. Returns the row id + classification; the
 * Phase-1 inbound worker performs the real parse (contact/conversation/message
 * + media + status state machine) for verified events only.
 */
export async function ingestWhatsappWebhook(args: {
  rawBody: Buffer;
  signature: string | undefined;
  parsed: any;
  /**
   * Set by `whatsappWebhookRawBody()` when the body could not be parsed as JSON.
   * `parsed` is `{}` in that case and must NOT be persisted as the payload.
   */
  parseError?: string | null;
}): Promise<{
  /** Row id, or null when the signature failed and nothing was persisted. */
  id: string | null;
  signatureOk: boolean;
  eventType: string;
  wamid: string | null;
  /** These exact bytes were already stored — a Meta redelivery, not new traffic. */
  duplicate: boolean;
  /** The row this landed on has already been through the inbound worker. */
  alreadyProcessed: boolean;
}> {
  const signatureOk = verifyWhatsappSignature(args.rawBody, args.signature);

  // Verify BEFORE touching the database.
  //
  // A stub row used to be written for unverified requests too. The webhook is
  // necessarily public, is mounted ahead of the API rate limiter (Meta must
  // never be throttled), and always answers 200 — so anyone who found the URL
  // could turn one unauthenticated POST into one row, indefinitely, and fill
  // the disk. The stub carried nothing worth keeping: eventType 'unknown',
  // wamid null, payload {}. The rejection is counted in the metric the caller
  // increments (`wa_webhook_events_total{signature_ok="false"}`) and logged,
  // which is the audit trail that was actually wanted.
  if (!signatureOk) {
    return {
      id: null,
      signatureOk: false,
      eventType: 'unknown',
      wamid: null,
      duplicate: false,
      alreadyProcessed: false,
    };
  }

  const bodyHash = webhookBodyHash(args.rawBody);

  // Signature-valid, but the bytes are not JSON we can read.
  //
  // `parsed` is `{}` here, and persisting that recorded a successfully-processed
  // event containing nothing: classified 'unknown', zero entries for the worker
  // to iterate, processedAt stamped, Meta answered 200 and therefore never
  // redelivering it. The content was unrecoverable. Store the raw bytes under an
  // eventType that says exactly what happened, so a truncated or unexpected
  // payload can be read back and replayed by hand.
  if (args.parseError) {
    waWebhookParseFailuresTotal.inc();
    logger.error(
      'WhatsApp webhook body passed the signature check but is not parseable JSON — stored raw',
      { err: args.parseError, bytes: args.rawBody.length }
    );
    const failed = await persistWebhookEvent({
      eventType: 'parse_error',
      wamid: null,
      // jsonb cannot hold a U+0000, and an insert that throws here would answer
      // Meta a 500 for a body that fails identically on every redelivery —
      // exactly the sustained failure a subscription gets disabled for. Escape
      // it rather than drop the byte, so the stored text stays faithful.
      payload: {
        // replaceAll on the literal, not a regex: a NUL inside a pattern is a
        // control character the linter refuses, and no pattern is needed here.
        raw: args.rawBody.toString('utf8').replaceAll('\u0000', '\\u0000'),
        parseError: args.parseError,
      },
      // No envelope to index — the parse is what failed.
      phones: [],
      signatureOk: true,
      bodyHash,
    });
    return {
      id: failed.id,
      signatureOk: true,
      eventType: 'parse_error',
      wamid: null,
      duplicate: failed.duplicate,
      alreadyProcessed: failed.alreadyProcessed,
    };
  }

  const { eventType, wamid } = classifyWhatsappEvent(args.parsed);

  const row = await persistWebhookEvent({
    eventType,
    wamid,
    payload: args.parsed ?? {},
    // Normalised sender index, written here because this is the only place the
    // envelope is ever parsed. Erasure looks the row up by this column; without
    // it, finding one person's events meant casting every payload to text.
    phones: metaEnvelopePhones(args.parsed),
    signatureOk: true,
    bodyHash,
  });
  return {
    id: row.id,
    signatureOk,
    eventType,
    wamid,
    duplicate: row.duplicate,
    alreadyProcessed: row.alreadyProcessed,
  };
}

// ── Signature-failure trail ──────────────────────────────────────────────────
//
// A rejected request deliberately writes NO database row (see above — the
// endpoint is public and unauthenticated, so a row per POST is a disk-fill
// primitive). That left the operator with nothing at all: rotating the app
// secret without updating META_WHATSAPP_APP_SECRET silently drops 100% of
// inbound traffic while still answering 200, and the console just shows a quiet
// inbox. Hourly Redis counters give the signal with a bounded key space — 24
// keys, each expiring on its own.

const SIG_FAIL_PREFIX = 'wa:webhook:sigfail:';
const SIG_FAIL_LAST_KEY = 'wa:webhook:sigfail:last';
/** Hours of history the summary covers (one key per hour). */
const SIG_FAIL_WINDOW_HOURS = 24;

const hourBucket = (at: number): number => Math.floor(at / 3_600_000);

/** Count one rejected webhook. Never throws — Redis being down must not 500 Meta. */
export async function recordSignatureFailure(at: Date = new Date()): Promise<void> {
  const ttl = (SIG_FAIL_WINDOW_HOURS + 1) * 3600;
  try {
    const key = `${SIG_FAIL_PREFIX}${hourBucket(at.getTime())}`;
    await redis.incr(key);
    await redis.expire(key, ttl);
    await redis.set(SIG_FAIL_LAST_KEY, at.toISOString(), 'EX', ttl);
  } catch {
    /* best-effort telemetry */
  }
}

/** Rejected webhooks in the last 24h, and when the most recent one arrived. */
export async function getSignatureFailures(): Promise<{ count: number; lastAt: string | null }> {
  try {
    const now = hourBucket(Date.now());
    const keys = Array.from(
      { length: SIG_FAIL_WINDOW_HOURS },
      (_, i) => `${SIG_FAIL_PREFIX}${now - i}`
    );
    const [values, lastAt] = await Promise.all([redis.mget(...keys), redis.get(SIG_FAIL_LAST_KEY)]);
    const count = values.reduce((sum: number, v) => sum + (v ? Number(v) || 0 : 0), 0);
    return { count, lastAt: lastAt ?? null };
  } catch {
    return { count: 0, lastAt: null };
  }
}

// ── Webhook health + raw-event inspection ────────────────────────────────────

/** Minutes of silence after which the webhook is treated as broken. */
export function webhookStaleMinutes(): number {
  const parsed = parseInt(env.WA_WEBHOOK_STALE_MINUTES, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

export interface WebhookHealth {
  lastEventAt: string | null;
  /** Minutes since the last accepted event; null when none has ever arrived. */
  ageMinutes: number | null;
  staleAfterMinutes: number;
  stale: boolean;
  /** Persisted but never processed, and older than 5 minutes. */
  unprocessed: number;
  signatureFailures24h: number;
  lastSignatureFailureAt: string | null;
  /**
   * Whether Meta still lists an app subscribed to this WABA. `null` when the
   * WABA id / token is not configured, or Meta could not be reached.
   */
  subscribed: boolean | null;
}

/**
 * Ask Meta whether the WABA still has a subscribed app.
 *
 * Meta disables a subscription after sustained delivery failures and never tells
 * anyone — the only symptom is silence. Returns null (rather than false) whenever
 * the question could not be asked, so "we don't know" is never reported to the
 * operator as "Meta dropped you".
 */
export async function checkWebhookSubscription(): Promise<boolean | null> {
  const wabaId = env.META_WHATSAPP_WABA_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!wabaId || !token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(
      // Graph version read inline rather than through whatsapp.service: this
      // module is imported by the public webhook route, which is mounted ahead
      // of everything else, and must not drag the whole send tree in with it.
      `https://graph.facebook.com/${env.META_WHATSAPP_API_VERSION || 'v22.0'}/${wabaId}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => ({}));
    return Array.isArray(data?.data) ? data.data.length > 0 : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Everything the console needs to say whether inbound delivery is alive.
 *
 * `checkSubscription` is opt-in because it costs a Graph round trip — the cron
 * asks only once it already suspects silence.
 */
export async function getWebhookHealth(
  opts: { checkSubscription?: boolean } = {}
): Promise<WebhookHealth> {
  const staleAfterMinutes = webhookStaleMinutes();
  const [agg, unprocessed, sigFail, subscribed] = await Promise.all([
    prisma.waWebhookEvent.aggregate({ _max: { createdAt: true } }),
    prisma.waWebhookEvent.count({
      where: { processedAt: null, createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    }),
    getSignatureFailures(),
    opts.checkSubscription ? checkWebhookSubscription() : Promise.resolve(null),
  ]);
  const lastEventAt = agg._max.createdAt;
  const ageMinutes = lastEventAt ? Math.floor((Date.now() - lastEventAt.getTime()) / 60_000) : null;
  return {
    lastEventAt: lastEventAt ? lastEventAt.toISOString() : null,
    ageMinutes,
    staleAfterMinutes,
    // Never having received an event is also a broken webhook — it is the state
    // a misconfigured deployment sits in from day one.
    stale: ageMinutes === null || ageMinutes >= staleAfterMinutes,
    unprocessed,
    signatureFailures24h: sigFail.count,
    lastSignatureFailureAt: sigFail.lastAt,
    subscribed,
  };
}

export interface WebhookEventFilters {
  eventType?: string;
  /** 'processed' | 'unprocessed' | 'deferred' */
  state?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * One page of raw webhook events, newest first.
 *
 * The table was write-only: when a message did not appear in the inbox there was
 * no way to tell whether Meta ever delivered it, whether it failed the signature
 * check, or whether it is sitting unprocessed — debugging meant a psql session on
 * the server. `payload` (which carries message bodies) is deliberately NOT
 * selected here; it is only on the audited detail route.
 */
export async function listWebhookEvents(filters: WebhookEventFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const where: Prisma.WaWebhookEventWhereInput = {
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.state === 'processed' ? { processedAt: { not: null } } : {}),
    ...(filters.state === 'unprocessed' ? { processedAt: null } : {}),
    ...(filters.state === 'deferred' ? { processedAt: null, deferAttempts: { gt: 0 } } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.waWebhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventType: true,
        wamid: true,
        signatureOk: true,
        processedAt: true,
        deferAttempts: true,
        lastAttemptAt: true,
        createdAt: true,
      },
    }),
    prisma.waWebhookEvent.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** One raw event INCLUDING its payload — the audited detail view. */
export async function getWebhookEvent(id: string) {
  return prisma.waWebhookEvent.findUnique({ where: { id } });
}

/**
 * Clear an event's processing state so the inbound worker treats it as new.
 *
 * `processInboundEvent` short-circuits on `processedAt`, and the recovery cron
 * gives up on an event after a bounded number of defer attempts — so an event
 * that failed for a reason since fixed (a missing template row, a Postgres blip
 * mid-parse) stayed unprocessed forever, and the customer message inside it
 * never reached the inbox. This is the operator's way back in. Replaying is safe:
 * inbound processing dedups on WAMID and the status machine is forward-only, so
 * a replayed event either lands or is recognised as a duplicate.
 *
 * The queue side of the replay lives in the controller, which already owns the
 * inbound queue — see `reprocessEvent` there. Returns null when the id is
 * unknown.
 */
export async function resetWebhookEventForReprocess(id: string) {
  const exists = await prisma.waWebhookEvent.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  return prisma.waWebhookEvent.update({
    where: { id },
    data: { processedAt: null, deferAttempts: 0, lastAttemptAt: null },
    select: {
      id: true,
      eventType: true,
      wamid: true,
      signatureOk: true,
      processedAt: true,
      deferAttempts: true,
      lastAttemptAt: true,
      createdAt: true,
    },
  });
}
