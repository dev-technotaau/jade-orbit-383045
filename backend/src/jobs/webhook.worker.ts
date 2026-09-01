import { promises as dns } from 'dns';
import type { Job } from 'bullmq';
import { UnrecoverableError, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { WEBHOOK_QUEUE_NAME } from './webhook.queue';
import { webhookService } from '../services/webhook.service';
import { AuditService } from '../services/audit.service';
import { webhookHostIssue, webhookUrlIssue } from '../schemas/whatsapp.schema';
import {
  waOutboundWebhookDeliveriesTotal,
  waOutboundWebhookDuration,
  waOutboundWebhookEndpointFailures,
  waWebhookEndpointDisabledTotal,
} from '../utils/whatsapp-metrics';
import { payloadPhones } from '../utils/webhook-phone-index';

/**
 * What travels through Redis: an id and the event, never the credentials.
 *
 * The endpoint's `url` and signing `secret` used to be snapshotted into every
 * queued job. That put one plaintext copy of the secret in Redis per pending
 * event — kept for seven days on the failure path — and froze the destination at
 * dispatch time, so rotating a leaked secret or fixing a mistyped URL left every
 * already-queued event still going to the old address signed with the old key.
 * Both are read from the database at delivery time now, which also means a
 * subscriber disabled while its backlog drains stops receiving immediately.
 */
interface WebhookJobData {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
}

const MAX_FAILURE_COUNT = 10;

/**
 * Drop an endpoint's failure gauge once Prisma reports the row is gone (P2025,
 * i.e. the subscriber was deleted while a delivery was still in flight).
 * Without this the series keeps its last failure count for the lifetime of the
 * process, so an integration nobody has any more goes on paging whoever is on
 * call, and the only cure is a restart.
 */
function forgetEndpointIfDeleted(err: unknown, webhookId: string): void {
  if ((err as { code?: string } | null)?.code === 'P2025') {
    waOutboundWebhookEndpointFailures.remove({ webhook_id: webhookId });
  }
}

/**
 * Why this delivery must not go out at all, or null when the target is fine.
 *
 * The URL was checked when the subscription was saved, but DNS is not a promise
 * anyone made: a hostname that resolved to a public address at registration time
 * can resolve to 127.0.0.1, to 10.x, or to the cloud metadata service by the
 * time the event actually fires. This POST leaves from inside the cluster and
 * the response body is written to the delivery log the operator can read, so an
 * unchecked target is a port scan of the private network with the answers
 * printed back. The addresses are therefore re-checked here, immediately before
 * the fetch, rather than trusted from validation time.
 *
 * A DNS failure is deliberately NOT a block: letting fetch fail on its own puts
 * "getaddrinfo ENOTFOUND" in the delivery log, which is the truth, instead of a
 * misleading "blocked".
 */
async function blockedTargetReason(link: string): Promise<string | null> {
  const staticIssue = webhookUrlIssue(link);
  if (staticIssue) return staticIssue;

  let hostname: string;
  try {
    hostname = new URL(link).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return 'Not a valid URL';
  }

  let resolved: { address: string }[];
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    return null;
  }

  for (const { address } of resolved) {
    const issue = webhookHostIssue(address);
    if (issue) return `${issue} (${hostname} resolves to ${address})`;
  }
  return null;
}

export function createWebhookWorker(): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      return (async () => {
        const { webhookId, event, payload } = job.data;

        // Credentials come from the row, not the job — see WebhookJobData above.
        const endpoint = await prisma.webhookEndpoint.findUnique({
          where: { id: webhookId },
          select: { url: true, secret: true, isActive: true },
        });
        if (!endpoint) {
          // The subscriber was deleted while its backlog was still draining.
          // Nothing to deliver to, and nothing to record against — the delivery
          // row would fail its foreign key anyway.
          waOutboundWebhookEndpointFailures.remove({ webhook_id: webhookId });
          logger.warn(`Webhook ${webhookId} no longer exists; dropping delivery ${job.id}`);
          return { success: false, skipped: 'deleted' };
        }
        // Honour a disable that happened after this job was queued: an operator
        // who switches an integration off, or an endpoint auto-disabled for
        // failing, should stop receiving events at once rather than keep taking
        // whatever is still sitting in the queue. A manual test is exempt — that
        // button exists precisely to check an endpoint that is not live yet.
        if (!endpoint.isActive && event !== 'test') {
          logger.info(`Webhook ${webhookId} is disabled; dropping delivery ${job.id}`);
          return { success: false, skipped: 'disabled' };
        }
        const { url, secret } = endpoint;

        logger.info(`Processing webhook delivery ${job.id} to ${url} for event ${event}`);

        const body = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        });

        // Timestamped signature (`t=…,v1=…`) so a captured delivery cannot be
        // replayed against the subscriber indefinitely. The legacy bare-hex header
        // is still sent for one release so existing subscribers keep verifying
        // while they migrate.
        const signedAt = Math.floor(Date.now() / 1000);
        const signature = webhookService.generateSignature(
          secret,
          webhookService.signaturePayload(signedAt, body)
        );
        const legacySignature = webhookService.generateSignature(secret, body);

        let statusCode: number | undefined;
        let responseBody: string | undefined;
        let success = false;
        let error: string | undefined;

        // Times the whole round trip including reading the body, because that is
        // what the subscriber costs us and what the 10s timeout is measured against.
        const endTimer = waOutboundWebhookDuration.startTimer();

        const blocked = await blockedTargetReason(url);
        if (blocked) {
          error = `Blocked target: ${blocked}`;
          logger.warn(`Webhook delivery ${job.id} not sent — ${error}`);
        } else {
          try {
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-webhook-signature': `t=${signedAt},v1=${signature}`,
                'x-webhook-signature-legacy': legacySignature,
                'x-webhook-event': event,
                'x-webhook-delivery': job.id || '',
              },
              body,
              // The SSRF check above validates the URL the operator REGISTERED.
              // Following a redirect would hand the destination back to whoever
              // controls that endpoint: one 302 to 169.254.169.254 and the
              // allowlist is bypassed — with the response body then stored on
              // the delivery row and served back through the console, which
              // turns the bypass into a read primitive against cloud metadata.
              //
              // A subscriber has no legitimate reason to redirect a signed POST:
              // the signature is over the body, and a redirect that drops or
              // replays it is a broken integration either way.
              redirect: 'manual',
              signal: AbortSignal.timeout(10000),
            });

            statusCode = response.status;
            responseBody = await response.text().catch(() => '');
            // A 3xx is a FAILED delivery, not a success. `response.ok` is false
            // for 3xx already, but the reason has to say why or the operator
            // reads it as an outage at their end.
            if (statusCode >= 300 && statusCode < 400) {
              error =
                `Endpoint redirected (${statusCode}) — redirects are not followed. ` +
                'Register the final URL directly.';
              success = false;
            } else {
              success = response.ok;
            }

            if (!response.ok) {
              error = `HTTP ${response.status}: ${responseBody?.substring(0, 500)}`;
            }
          } catch (err) {
            error = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`Webhook delivery failed to ${url}: ${error}`);
          }
        }

        endTimer({ result: success ? 'ok' : 'error' });
        waOutboundWebhookDeliveriesTotal.inc({ event, success: String(success) });

        // Record delivery
        await prisma.webhookDelivery
          .create({
            data: {
              webhookId,
              event,
              // The EXACT bytes that went on the wire, not the inner data. Logging
              // the unwrapped payload meant the delivery log disagreed with what the
              // subscriber actually received, which is precisely when you go looking
              // at a delivery log.
              payload: JSON.parse(body),
              // Erasure key for the numbers this delivery carried out to a
              // subscriber — the same indexed column WaWebhookEvent gained, and
              // for the same reason: a right-to-erasure request cannot be served
              // by scanning the whole delivery log with a jsonb-to-text LIKE.
              phones: payloadPhones(payload),
              statusCode,
              response: responseBody?.substring(0, 2000),
              success,
              attempt: job.attemptsMade + 1,
              error,
            },
          })
          .catch((err) => logger.error('Failed to record webhook delivery', err));

        // Update webhook metadata
        if (success) {
          const cleared = await prisma.webhookEndpoint
            .update({
              where: { id: webhookId },
              data: {
                lastTriggeredAt: new Date(),
                failureCount: 0,
              },
            })
            .catch((err) => {
              forgetEndpointIfDeleted(err, webhookId);
              return null;
            });

          if (cleared) {
            waOutboundWebhookEndpointFailures.set({ webhook_id: webhookId }, 0);
          }
        } else {
          // Count EVENTS, not attempts.
          //
          // This ran on every handler invocation, and BullMQ retries each event
          // several times — so a threshold of 10 failures was reached after roughly
          // four genuinely failed events, and the endpoint was auto-disabled with no
          // way to re-enable it from anywhere. A brief outage at the subscriber
          // permanently killed the integration.
          const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
          if (!isFinalAttempt && !blocked) {
            throw new Error(error ?? `Webhook delivery failed (${statusCode ?? 0})`);
          }

          // Atomic increment to avoid TOCTOU race between concurrent workers
          const updated = await prisma.webhookEndpoint
            .update({
              where: { id: webhookId },
              data: {
                failureCount: { increment: 1 },
                lastTriggeredAt: new Date(),
              },
              select: { failureCount: true },
            })
            .catch((err) => {
              forgetEndpointIfDeleted(err, webhookId);
              return null;
            });

          // Only ever published from the row we just wrote. If the write itself
          // failed the last known run stays standing, rather than a false zero
          // that reads as "the subscriber recovered".
          if (updated) {
            waOutboundWebhookEndpointFailures.set({ webhook_id: webhookId }, updated.failureCount);
          }

          if (updated && updated.failureCount >= MAX_FAILURE_COUNT) {
            await prisma.webhookEndpoint
              .update({
                where: { id: webhookId },
                data: { isActive: false },
              })
              .catch(() => {});
            logger.warn(
              `Webhook ${webhookId} disabled after ${MAX_FAILURE_COUNT} consecutive failures`
            );
            // Auto-disable used to leave only this log line. Nobody watches logs
            // for a state change they did not make, so an integration that Meta
            // events silently stopped reaching looked identical to one nobody had
            // configured. Record it where the operator already looks (the audit
            // trail) and expose it to alerting (the metric).
            waWebhookEndpointDisabledTotal.inc({ reason: 'failure_threshold' });
            void AuditService.log({
              action: 'WA_WEBHOOK_AUTO_DISABLED',
              entity: 'WebhookEndpoint',
              entityId: webhookId,
              performedBy: 'system',
              details: { url, failureCount: updated.failureCount, lastError: error },
            });
          }

          // A blocked target does not become deliverable by waiting, and eight
          // retries would count as eight failed events against an endpoint that
          // never left the process — enough on its own to trip the auto-disable
          // threshold. Fail the job outright instead; one attempt, one delivery
          // row saying exactly why, one strike.
          if (blocked) throw new UnrecoverableError(error ?? 'Webhook target blocked');

          // Throw to trigger BullMQ retry
          throw new Error(error || 'Webhook delivery failed');
        }

        return { success, statusCode };
      })();
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_WEBHOOK_CONCURRENCY, 10),
      lockDuration: 30000,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Webhook delivery ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Webhook delivery ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
