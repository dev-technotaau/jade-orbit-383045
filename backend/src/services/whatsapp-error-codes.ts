/**
 * Meta Cloud API error-code classification.
 *
 * Deliberately dependency-free: this is the table the campaign send path uses to
 * decide SKIPPED vs FAILED vs roll-back-to-PENDING, and that decision is the one
 * place in the module where being wrong costs either a lost customer message or
 * a re-send loop that burns conversation credits. Keeping it importable without
 * dragging in Prisma, the queue tree or storage means the worker's tests can use
 * the real tables instead of a copy that silently drifts from them.
 */

/**
 * Codes that mean "we should NOT count this as a hard failure" — the message was
 * intentionally not delivered (per-user marketing frequency cap / recipient
 * opted out of marketing). Mapped to SKIPPED so retries don't keep hammering a
 * capped or opted-out contact.
 */
export const WA_SKIP_ERROR_CODES = new Set<string>([
  '131049', // marketing message frequency cap (per-user)
  '131050', // recipient has opted out of marketing
  '131047', // re-engagement required — the 24h customer-service window is closed
  // Ours, not Meta's: the per-contact marketing frequency cap. A capped
  // recipient is deliberately not messaged, which is a SKIP — marking them
  // FAILED would both misreport the campaign and make them eligible for
  // "retry failed", which would immediately hit the cap again.
  'WA_MARKETING_CAP',
]);

/** True when a send outcome's error code is a "skip" (not a real failure). */
export function isSkipErrorCode(code?: string | null): boolean {
  return code != null && WA_SKIP_ERROR_CODES.has(String(code));
}

/**
 * Transient Meta/transport error codes — the send can succeed on a later attempt.
 * The worker rolls these recipients back to PENDING (not FAILED) so the recovery
 * cron re-batches them, instead of permanently dropping a deliverable message.
 */
export const WA_RETRYABLE_ERROR_CODES = new Set<string>([
  '130429', // rate limit hit
  '131056', // (business, recipient) pair rate limit
  '131048', // spam rate limit hit
  '80007', // rate-limit issues
  '368', // temporarily blocked (often transient)
  '500', // internal Meta error
  '131000', // generic "something went wrong"
  'circuit_open', // our in-process circuit breaker tripped
  'SEND_ERROR', // generic network throw during send
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  // Titles produced by sendWhatsappRaw when Meta never answered, so there is no
  // numeric code to key on. These used to reach the campaign worker as a NULL
  // errorCode, which `isRetryableErrorCode` answers false for — so a Meta outage
  // or a 15s timeout marked the recipient permanently FAILED instead of rolling
  // it back for the recovery cron.
  'network_error',
  'request_timeout',
  // Not transient in the usual sense — but a missing token is a deployment
  // mistake, and burning the whole audience to FAILED over it leaves nothing to
  // resume once it is fixed.
  'credentials_missing',
]);

/** True when a send outcome's error code is transient and worth re-sending. */
export function isRetryableErrorCode(code?: string | null): boolean {
  return code != null && WA_RETRYABLE_ERROR_CODES.has(String(code));
}
