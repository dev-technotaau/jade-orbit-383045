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
  // Ours: Meta already refused this recipient, so we are holding off. A SKIP for
  // the same reason WA_MARKETING_CAP is one -- marking it FAILED would put the
  // recipient into "retry failed", which is precisely the loop that drove the
  // per-user limit down in the first place.
  'WA_MARKETING_REFUSED',
  // Ours: the contact opted out, or an operator blocked them, between the
  // moment the campaign materialised its audience and the moment this batch
  // reached them. A deliberate non-send is a SKIP for exactly the same reason
  // the two above are — and `retryFailedRecipients` already refuses to re-send
  // either, so recording them as FAILED only misreported the campaign and put a
  // consent decision in the "something went wrong" column.
  'WA_OPTED_OUT',
  'WA_CONTACT_BLOCKED',
]);

/**
 * Codes that mean the ACCOUNT is in trouble, not this recipient.
 *
 * A campaign must stop on these rather than work through the rest of its
 * audience. `368` in particular was classified as a transient throttle and
 * retried indefinitely: it is Meta's "temporarily blocked for policy
 * violations", so the retry loop was hammering an account that had just been
 * restricted — the single fastest way to turn a temporary block into a
 * permanent one.
 */
export const WA_STOP_CAMPAIGN_ERROR_CODES = new Set<string>([
  '368', // temporarily blocked for policy violations
  '131031', // account has been locked
  '131042', // business eligibility / payment issue
  '130497', // messaging limit reached for the account
]);

/** True when the error is about the account, not the recipient. */
export function isAccountBlockingCode(code?: string | null): boolean {
  return code != null && WA_STOP_CAMPAIGN_ERROR_CODES.has(String(code));
}

/**
 * Codes where Meta made a DELIBERATE decision not to deliver, and a re-send is
 * therefore guaranteed to fail again.
 *
 * These have to count against the per-contact marketing cap even though the row
 * is FAILED. The cap counted only non-FAILED sends, so a contact who hit 131049
 * showed zero sends in the window and the cap never fired — an operator could
 * retry indefinitely, and every attempt pushed Meta's per-user marketing limit
 * further down for that recipient.
 *
 * Deliberately NOT included:
 *   131042 - business eligibility / payment. A config problem the operator
 *            fixes, after which they legitimately want to retry.
 *   131047 - re-engagement required. Sending a template is the REMEDY for a
 *            closed window, so counting it would block the fix.
 */
export const WA_MARKETING_REFUSED_CODES = new Set<string>([
  '131049', // per-user marketing frequency cap
  '131050', // recipient opted out of marketing
]);

/** True when Meta deliberately refused delivery and re-sending cannot succeed. */
export function isMarketingRefusedCode(code?: string | null): boolean {
  return code != null && WA_MARKETING_REFUSED_CODES.has(String(code));
}

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
  // Prisma's own transient failures. A thrown PrismaClientKnownRequestError
  // carries `code: 'P2024'`, which OVERRIDES the `?? 'SEND_ERROR'` fallback the
  // campaign worker's catch uses — so a pool timeout during a large run marked
  // the recipient permanently FAILED, and "retry failed" is the only way back.
  // Under load that is precisely when it happens, so a campaign could lose a
  // slice of its audience to nothing but database contention.
  'P2024', // timed out fetching a connection from the pool
  'P2034', // transaction failed on a write conflict / deadlock — retry
  'P1001', // cannot reach the database server
  'P1002', // database server timed out
  'P1008', // operation timed out
  // Not transient in the usual sense — but a missing token is a deployment
  // mistake, and burning the whole audience to FAILED over it leaves nothing to
  // resume once it is fixed.
  'credentials_missing',
  // An EXPIRED token is the same deployment mistake arriving a day late: a
  // 24-hour or 60-day user token pasted in place of a system-user one works
  // until the hour it lapses, and then every send in flight answers 190. Rolling
  // those recipients back means replacing the token resumes the campaign;
  // FAILING them means an operator hand-retries an entire audience.
  '190',
]);

/**
 * The credential itself is dead — expired, revoked, or pointing at a number the
 * token no longer covers. Retryable in the sense that the recipients must NOT be
 * burned to FAILED, but nothing about waiting makes it succeed: only replacing
 * the token does. Callers use this to skip the throttle backoff and to stop a
 * batch early instead of grinding an entire audience against a dead token.
 */
export const WA_AUTH_ERROR_CODES = new Set<string>([
  '190', // OAuth: access token expired / revoked
]);

/** True when the send failed because the access token itself is no longer valid. */
export function isAuthErrorCode(code?: string | null): boolean {
  return code != null && WA_AUTH_ERROR_CODES.has(String(code));
}

/** True when a send outcome's error code is transient and worth re-sending. */
export function isRetryableErrorCode(code?: string | null): boolean {
  return code != null && WA_RETRYABLE_ERROR_CODES.has(String(code));
}

/**
 * OUR OWN pre-flight refusals — the send never reached Meta, and re-running the
 * same step against the same recipient will refuse identically.
 *
 * These are thrown (not returned as a FAILED message row), and the drip loop's
 * catch-all used to treat every throw as transient: it re-armed `nextStepAt` 15
 * minutes out, unconditionally and forever. So when Meta paused a template used
 * by step 3 — routine for marketing templates — every recipient sitting on that
 * step retried it four times an hour indefinitely, with nothing but a warn log
 * and no FAILED state anywhere an operator could see it.
 */
export const WA_TERMINAL_STEP_ERROR_CODES = new Set<string>([
  'WA_TEMPLATE_NOT_APPROVED',
  'WA_TEMPLATE_NOT_FOUND',
  // The send pre-flight refused: this step's template needs parameters the drip
  // path cannot supply (it sends body values only). Retrying refuses identically.
  'WA_TEMPLATE_PARAMS_MISSING',
  'WA_CONTACT_BLOCKED',
  'WA_OPTED_OUT',
  'WA_CONVERSATION_NOT_FOUND',
  'WA_NOT_CONFIGURED',
]);

/** True when a thrown drip-step error can never succeed on a later attempt. */
export function isTerminalStepErrorCode(code?: string | null): boolean {
  return code != null && WA_TERMINAL_STEP_ERROR_CODES.has(String(code));
}
