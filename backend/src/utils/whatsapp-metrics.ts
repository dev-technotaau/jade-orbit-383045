/**
 * Prometheus metrics + the WhatsApp exception funnel.
 *
 * Metrics auto-register to prom-client's global registry, so they appear at
 * `GET /metrics` (see `src/routes/metrics.routes.ts`) without any wiring there.
 */
import { randomUUID } from 'crypto';
import os from 'os';
import client from 'prom-client';
import { env } from '../config/env';
import logger from '../config/logger';

/**
 * `wa_messages_total` — every inbound/outbound message keyed by direction +
 * type + status. Source of truth for throughput + send-success dashboards.
 */
/**
 * Unlock attempts, by outcome.
 *
 * The one credential in the system had no metric at all, so a sustained
 * password-guessing campaign was invisible on every dashboard. `reason`
 * distinguishes a wrong password from a wrong TOTP code from an expired
 * challenge, and on success records which second factor satisfied it.
 */
/**
 * Turnstile outcomes. `rejected` climbing is bots being turned away — the
 * signal that the challenge is earning its place. `timeout`/`error` climbing is
 * Cloudflare being unreachable, which blocks logins and needs a human.
 */
export const turnstileVerificationsTotal = new client.Counter({
  name: 'wa_turnstile_verifications_total',
  help: 'Cloudflare Turnstile verification outcomes',
  labelNames: ['outcome'] as const,
});

export const unlockAttemptsTotal = new client.Counter({
  name: 'wa_unlock_attempts_total',
  help: 'Unlock attempts by outcome and reason',
  labelNames: ['outcome', 'reason'] as const,
});

/**
 * Longest current run of consecutive failures from a single address. Alert on
 * this rather than on the raw counter: a handful of failures is someone
 * fat-fingering their password, a sustained streak is an attack.
 */
export const unlockFailureStreak = new client.Gauge({
  name: 'wa_unlock_failure_streak',
  help: 'Consecutive failed unlock attempts from one address',
  labelNames: ['scope'] as const,
});

export const waMessagesTotal = new client.Counter({
  name: 'wa_messages_total',
  help: 'WhatsApp messages by direction + type + status',
  labelNames: ['direction', 'type', 'status'] as const,
});

/**
 * `wa_inbound_unsupported_total` — inbound messages of a type this module does
 * not model, keyed by Meta's own type string.
 *
 * These render as a placeholder bubble, so an operator sees that something
 * arrived and not what. The counter is how "which unsupported type is actually
 * worth building?" becomes answerable instead of a guess.
 */
export const waInboundUnsupportedTotal = new client.Counter({
  name: 'wa_inbound_unsupported_total',
  help: 'Inbound WhatsApp messages of an unmodelled type, by Meta type string',
  labelNames: ['type'] as const,
});

/**
 * `wa_send_failures_total` — Cloud-API send failures keyed by Meta error code.
 * Drives the send-failure-spike alert.
 */
export const waSendFailuresTotal = new client.Counter({
  name: 'wa_send_failures_total',
  help: 'WhatsApp outbound send failures by Meta error code',
  labelNames: ['error_code'] as const,
});

/**
 * `wa_suppression_check_failures_total` — do-not-contact lookups that errored
 * and were therefore allowed through.
 *
 * The per-send suppression check fails OPEN on purpose: a Postgres blip must
 * not silently halt every send. The cost of that choice is that a message to a
 * number on the legally-supplied do-not-contact list can go out, and until this
 * counter existed nothing anywhere recorded that it had — an operator could
 * only learn about it from the complaint. Any non-zero value here is
 * "suppressed sends may have escaped during this window", which is exactly the
 * question a compliance review asks.
 */
export const waSuppressionCheckFailuresTotal = new client.Counter({
  name: 'wa_suppression_check_failures_total',
  help: 'Do-not-contact suppression checks that errored and were failed open',
});

/**
 * `wa_webhook_events_total` — every accepted webhook POST keyed by signature
 * outcome + classified event type. Catches signature failures + traffic shape.
 */
export const waWebhookEventsTotal = new client.Counter({
  name: 'wa_webhook_events_total',
  help: 'WhatsApp webhook events by signature outcome + event type',
  labelNames: ['signature_ok', 'event_type'] as const,
});

/**
 * `wa_webhook_rejected_total` — inbound Meta POSTs we answered 2xx to WITHOUT
 * ingesting anything, keyed by why.
 *
 * Every rejection reason on this route is something a Meta retry could never
 * fix (payload past the body limit, our own raw-body middleware misconfigured,
 * a flood past the per-minute ceiling), and Meta counts sustained non-2xx
 * towards disabling the subscription — so the route answers 200 and drops.
 * That makes the drop completely invisible from Meta's side AND from the logs
 * an operator is actually watching. This counter is the signal: any sustained
 * non-zero rate means inbound messages are being thrown away.
 *
 * reason = payload_too_large | malformed_request | raw_body_missing | rate_limited
 */
export const waWebhookRejectedTotal = new client.Counter({
  name: 'wa_webhook_rejected_total',
  help: 'Inbound WhatsApp webhook POSTs answered 2xx but dropped without ingestion, by reason',
  labelNames: ['reason'] as const,
});

/**
 * `wa_webhook_parse_failures_total` — signature-valid POSTs whose body was not
 * parseable JSON.
 *
 * The HMAC covers the RAW bytes, so a truncated or malformed delivery verifies
 * exactly like a good one; the parse failure used to collapse into an empty
 * object, which was persisted, classified 'unknown' and stamped processed. Meta
 * was told 200, never resent it, and the content was gone. The bytes are kept
 * now (eventType 'parse_error'), but a stored row nobody looks at is not a
 * signal — any non-zero rate here means inbound content is arriving in a shape
 * this deployment cannot read.
 */
export const waWebhookParseFailuresTotal = new client.Counter({
  name: 'wa_webhook_parse_failures_total',
  help: 'Signature-valid WhatsApp webhook POSTs whose body could not be parsed as JSON',
});

/**
 * `wa_automation_total` — automated replies attempted, by branch and outcome.
 * The automation layer emitted no telemetry at all: a rule that fails on every
 * single inbound looked identical to one that never matches.
 * kind = faq_menu | faq_answer | keyword | handoff | welcome | away | bot_flow
 * outcome = sent | failed | throttled | missing (a tapped FAQ row that has since
 * been deleted or deactivated — the menu stays tappable in the customer's chat
 * history forever, so this is the count of stale-menu taps) | unanswered (the
 * same stale tap, but with every FAQ retired and no fallback sentence configured,
 * so the FAQ layer had nothing to say and handed the message to the rest of the
 * ladder — a standing count here means the FAQ menu needs rebuilding)
 */
export const waAutomationTotal = new client.Counter({
  name: 'wa_automation_total',
  help: 'WhatsApp automated replies by branch and outcome',
  labelNames: ['kind', 'outcome'] as const,
});

/**
 * `wa_media_archive_total` — inbound media archival attempts, by outcome.
 *
 * result = ok | skipped (no R2 configured) | transient (will be retried) |
 * failed (retry envelope exhausted — the customer's file is lost the moment
 * Meta's own ~30-day copy expires) | row-gone (the message was pruned or erased
 * mid-flight, so the object was binned rather than left unreferenced).
 *
 * The `failed` series is the alertable one: a broken bucket, a rotated
 * credential or a full quota produced nothing but a log line, so nobody learned
 * archival had stopped until a photo was asked for weeks later and was gone.
 */
export const waMediaArchiveTotal = new client.Counter({
  name: 'wa_media_archive_total',
  help: 'Inbound WhatsApp media archival attempts by outcome',
  labelNames: ['result'] as const,
});

/**
 * `wa_webhook_endpoint_disabled_total` — outbound subscriber endpoints taken
 * offline automatically. A silent auto-disable is indistinguishable from a
 * subscriber nobody configured, so it needs to be alertable.
 */
export const waWebhookEndpointDisabledTotal = new client.Counter({
  name: 'wa_webhook_endpoint_disabled_total',
  help: 'Outbound webhook endpoints auto-disabled, by reason',
  labelNames: ['reason'] as const,
});

/**
 * `wa_outbound_webhook_deliveries_total` — every POST we make to a subscriber,
 * keyed by event + whether the subscriber accepted it.
 *
 * Outbound delivery was recorded to Postgres and the logger only, so the one
 * number that says whether subscribers are actually receiving anything —
 * success rate — could not be graphed or alerted on; the generic BullMQ queue
 * gauges show a job completing, which happens on the last retry of a delivery
 * that never landed. Counted per ATTEMPT so it stays 1:1 with the
 * `WebhookDelivery` rows the worker writes for the same POSTs.
 */
export const waOutboundWebhookDeliveriesTotal = new client.Counter({
  name: 'wa_outbound_webhook_deliveries_total',
  help: 'Outbound webhook delivery attempts by event and outcome',
  labelNames: ['event', 'success'] as const,
});

/**
 * `wa_outbound_webhook_duration_seconds` — how long the subscriber took to
 * answer, keyed by result. Bucketed to the worker's 10s request timeout, so the
 * `+Inf` overflow is exactly "we gave up on them".
 * result = ok | error
 */
export const waOutboundWebhookDuration = new client.Histogram({
  name: 'wa_outbound_webhook_duration_seconds',
  help: 'Outbound webhook delivery latency in seconds',
  labelNames: ['result'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * `wa_outbound_webhook_endpoint_failures` — each endpoint's current run of
 * consecutive failed EVENTS, mirroring the stored `failureCount`.
 *
 * The disabled counter above only fires once the run reaches the auto-disable
 * threshold, which is hours of dropped events later. This is the signal that
 * makes "endpoint X has been failing for an hour" alertable while there is
 * still something to do about it.
 *
 * Maintained by the delivery worker, so it is lazily populated: a series
 * appears on that endpoint's next delivery after a restart, and is dropped when
 * a delivery finds the endpoint has been deleted.
 */
export const waOutboundWebhookEndpointFailures = new client.Gauge({
  name: 'wa_outbound_webhook_endpoint_failures',
  help: 'Consecutive failed events per outbound webhook endpoint',
  labelNames: ['webhook_id'] as const,
});

/**
 * `wa_send_duration_seconds` — Cloud-API send latency keyed by result.
 * result = ok | error
 */
export const waSendDuration = new client.Histogram({
  name: 'wa_send_duration_seconds',
  help: 'WhatsApp Cloud API send latency in seconds',
  labelNames: ['result'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * `wa_webhook_last_event_timestamp` — unix seconds of the last VALID (signed)
 * webhook we accepted. Drives the webhook-silence alert.
 */
export const waWebhookLastEventTimestamp = new client.Gauge({
  name: 'wa_webhook_last_event_timestamp',
  help: 'Unix timestamp (seconds) of the last accepted WhatsApp webhook',
});

/**
 * `wa_webhook_stale` — 1 when no signed webhook has arrived inside the staleness
 * window, 0 otherwise. Set by the `wa-webhook-heartbeat` cron.
 *
 * The last-event gauge above existed but nothing consumed it, and this module IS
 * the inbox: Meta disabling the subscription (or a lapsed TLS cert) makes the
 * inbox simply go quiet, which is indistinguishable from a slow day. Meta does
 * not backfill, so every minute of undetected silence is lost messages.
 */
export const waWebhookStale = new client.Gauge({
  name: 'wa_webhook_stale',
  help: '1 when no signed WhatsApp webhook has arrived within the staleness window',
});

/**
 * `wa_webhook_unprocessed` — webhook events persisted but never processed. A
 * standing backlog means the inbound worker is stuck or deferring forever.
 */
export const waWebhookUnprocessed = new client.Gauge({
  name: 'wa_webhook_unprocessed',
  help: 'WhatsApp webhook events with no processedAt, older than 5 minutes',
});

/**
 * `wa_account_alerts_total` — Meta account-level notices (policy warnings,
 * restrictions, capability changes) by webhook field. These used to produce a
 * log line and nothing else.
 */
export const waAccountAlertsTotal = new client.Counter({
  name: 'wa_account_alerts_total',
  help: 'Meta account-level webhook notices by field',
  labelNames: ['field'] as const,
});

/**
 * `wa_channel_quality` — the channel's Meta quality rating as a number:
 * 0 unknown, 1 green, 2 yellow, 3 red. Drives the quality-red alert.
 */
export const waChannelQuality = new client.Gauge({
  name: 'wa_channel_quality',
  help: 'WhatsApp channel quality rating (0 unknown, 1 green, 2 yellow, 3 red)',
});

/**
 * `wa_messaging_tier_limit` — the channel's daily unique-recipient cap parsed
 * to a number (0 when unknown).
 */
export const waMessagingTierLimit = new client.Gauge({
  name: 'wa_messaging_tier_limit',
  help: 'WhatsApp messaging tier daily unique-recipient cap (0 if unknown)',
});

/**
 * `wa_retention_rows_overdue` — rows still older than their TTL once the
 * retention prune has finished, labelled by table.
 *
 * The prune drains what its wall-clock budget allows and warns when it runs out,
 * but a warn is a single line in whichever run happened to hit the wall — not
 * something anyone alerts on. "The 14-day TTL on the plaintext webhook payloads
 * is not actually being met" has to be a series, because it is a retention
 * promise the deployment either keeps or does not: a value that stays above zero
 * run after run means the prune cannot keep pace with the write rate and the
 * backlog is permanent.
 *
 * Saturates at the worker's count cap — an exact count over a table that has
 * never been drained is itself an expensive query, and anything at the cap
 * already says "far behind".
 */
export const waRetentionRowsOverdue = new client.Gauge({
  name: 'wa_retention_rows_overdue',
  help: 'Rows still older than their retention TTL after the prune ran, by table',
  labelNames: ['table'] as const,
});

/**
 * `wa_worker_leader` — 1 on the instance holding the BullMQ worker-leader lock,
 * 0 on a standby.
 *
 * Leadership was observable only as a boot-banner string, so "every replica is a
 * standby" — nobody renewing, nobody running a single worker, campaigns and
 * inbound jobs simply stopping — looked exactly like an idle queue on every
 * dashboard. Summing this gauge across replicas answers it directly: 1 is
 * healthy, 0 means no worker is processing anything, >1 means two instances are
 * both running the full worker set.
 *
 * Unlabelled on purpose — Prometheus attaches the scrape target's `instance`
 * label, so `sum(wa_worker_leader)` and `wa_worker_leader == 1` both work
 * without this process having to invent an identity for itself.
 */
export const waWorkerLeader = new client.Gauge({
  name: 'wa_worker_leader',
  help: '1 when this instance holds the BullMQ worker leader lock, 0 when standby',
});

/**
 * `wa_worker_leader_renew_failures_total` — every failed renewal of the leader
 * lock, including the tolerated ones.
 *
 * A demotion drains and restarts the whole worker set, and a campaign batch can
 * take a while to drain, so a Redis link that fails one renewal in three is
 * expensive long before it ever flips the gauge above. Counting the failures
 * makes that flapping visible while the instance still looks healthy.
 */
export const waWorkerLeaderRenewFailuresTotal = new client.Counter({
  name: 'wa_worker_leader_renew_failures_total',
  help: 'Failed renewals of the BullMQ worker leader lock',
});

/**
 * Sentry ingest target, derived from SENTRY_DSN by `initErrorReporting()`.
 * `null` whenever reporting is off, which is the default.
 */
interface SentryTarget {
  /** Fully-qualified `…/api/{projectId}/envelope/` URL. */
  endpoint: string;
  publicKey: string;
}

let sentryTarget: SentryTarget | null = null;

/** Identifies this client to Sentry in the auth header. */
const SENTRY_CLIENT = 'whatsapp-cloud-module/1.0.0';

/** Bounded so a slow or blackholed ingest host can never stall a worker. */
const SENTRY_TIMEOUT_MS = 3000;

/**
 * Enable exception reporting. Called once from `server.ts`; a no-op without a
 * DSN, so development and the test suite behave exactly as they did before.
 *
 * Deliberately explicit rather than lazy-on-first-capture: nothing opens a
 * socket unless the process asked for reporting, and the boot log states
 * whether errors are actually being tracked — otherwise that gets discovered
 * during the incident it was supposed to help with.
 *
 * Talks to Sentry's ingest API directly (one envelope POST) rather than
 * depending on @sentry/node, which drags the whole OpenTelemetry tree in
 * behind it to serve this single funnel.
 */
export function initErrorReporting(): void {
  // Reset first, so calling this again with a DSN removed actually disables
  // reporting instead of leaving the previous target wired up.
  sentryTarget = null;

  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) {
    logger.info('Error reporting: disabled (SENTRY_DSN unset)');
    return;
  }

  try {
    // A DSN is `{protocol}://{publicKey}@{host}{path}/{projectId}`. Self-hosted
    // installs sit under a path prefix and the project id is always the LAST
    // segment, so split rather than assume a single-segment pathname.
    const url = new URL(dsn);
    const segments = url.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    const prefix = segments.length > 0 ? `/${segments.join('/')}` : '';

    if (!url.username || !projectId) {
      throw new Error('expected {protocol}://{publicKey}@{host}/{projectId}');
    }

    sentryTarget = {
      endpoint: `${url.origin}${prefix}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
    logger.info(`Error reporting: Sentry enabled (project ${projectId})`);
  } catch (err) {
    // A malformed DSN must not stop the process booting, but it has to be
    // loud: the operator believes errors are being tracked and they are not.
    logger.error(`Error reporting: SENTRY_DSN is not a valid DSN — ${(err as Error).message}`);
  }
}

/** One entry of a Sentry stack trace. */
interface SentryFrame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
}

/** `    at fn (/srv/src/x.ts:12:9)`, and the anonymous `    at /srv/src/x.ts:12:9`. */
const STACK_FRAME_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

/**
 * V8 stack text -> Sentry frames.
 *
 * Two details are load-bearing for the grouping this whole funnel exists to
 * get. Sentry renders and hashes frames oldest-first, so the V8 order is
 * reversed; and frames have to be marked `in_app`, or an issue groups on
 * whichever node_modules frame happened to be on top and unrelated failures
 * collapse into one issue.
 */
function parseStackFrames(stack: string | undefined): SentryFrame[] {
  if (!stack) return [];

  const frames: SentryFrame[] = [];
  for (const line of stack.split('\n')) {
    const match = STACK_FRAME_RE.exec(line);
    if (!match) continue;

    const filename = match[2];
    frames.push({
      filename,
      function: match[1] ?? '<anonymous>',
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: !filename.startsWith('node:') && !filename.includes('node_modules'),
    });
  }

  return frames.reverse();
}

/** POST one exception to Sentry's envelope endpoint. */
async function shipToSentry(
  target: SentryTarget,
  err: unknown,
  extra?: Record<string, unknown>
): Promise<void> {
  const error = err instanceof Error ? err : undefined;
  const eventId = randomUUID().replace(/-/g, '');
  const frames = parseStackFrames(error?.stack);
  // Render injects RENDER_GIT_COMMIT on every deploy, so release correlation
  // works without anyone remembering to set SENTRY_RELEASE by hand.
  const release = env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT;

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    logger: 'whatsapp',
    server_name: os.hostname(),
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    ...(release ? { release } : {}),
    exception: {
      values: [
        {
          type: error?.name ?? 'Error',
          value: error?.message ?? String(err),
          // Ingest rejects an empty `frames` array, so a thrown non-Error
          // carries no stacktrace at all rather than an empty one.
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    ...(extra ? { extra } : {}),
  };

  // Envelope format: one header line, then an item-header line followed by the
  // item payload, each on its own line.
  const body =
    `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n` +
    `${JSON.stringify({ type: 'event' })}\n` +
    `${JSON.stringify(event)}\n`;

  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${SENTRY_CLIENT}, sentry_key=${target.publicKey}`,
    },
    body,
    signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`ingest responded ${res.status}`);
  }
}

/**
 * Report a WhatsApp-area exception.
 *
 * Always writes the log line, and additionally ships the exception to Sentry
 * once `initErrorReporting()` has found a DSN. That second hop is the part a
 * log line cannot do: identical stacks collapse into one issue carrying a
 * count, a first-seen release and an alert the first time a NEW error type
 * appears. With only the log line, a novel exception happening once an hour is
 * indistinguishable from noise, and diagnosing a production failure means
 * grepping the host's log stream by hand.
 *
 * Kept as a single funnel — both workers, the webhook controller, the Express
 * error handler and the process-level handlers report through here — so the
 * reporter stays a one-file concern.
 *
 * NEVER rejects. Callers fire it with `void`, and `unhandledRejection` reports
 * through this same function, so a rejection here would feed itself.
 */
export async function captureWaException(
  err: unknown,
  extra?: Record<string, unknown>
): Promise<void> {
  logger.error(`[whatsapp] ${(err as Error)?.message ?? String(err)}`, extra);

  if (!sentryTarget) return;

  try {
    await shipToSentry(sentryTarget, err, extra);
  } catch (reportErr) {
    // Failing to report must not become a second incident stacked on the first
    // one, and must not recurse back into this function.
    logger.warn(`[whatsapp] could not report exception: ${(reportErr as Error)?.message}`);
  }
}
