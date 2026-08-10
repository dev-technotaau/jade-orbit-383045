import { env } from '../config/env';
import logger from '../config/logger';
import { WA_RETRYABLE_ERROR_CODES, WA_SKIP_ERROR_CODES } from './whatsapp-error-codes';

// Meta WhatsApp Cloud API
// https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

/** Pinned Graph API version (configurable; bumped from the legacy v17.0). */
export const graphVersion = (): string => env.META_WHATSAPP_API_VERSION || 'v21.0';

/** Meta requires digits only, no '+' (e.g. 919876543210). */
export const toGraphPhone = (phone: string): string => phone.replace(/[^\d]/g, '');

export interface WaSendResult {
  wamid: string | null;
  ok: boolean;
  error?: { code?: string; title?: string; status?: number };
  /** Transient failure — caller (BullMQ) should retry later. */
  retryable?: boolean;
  /** Hint for how long to wait before retrying (ms), honors Retry-After. */
  retryAfterMs?: number;
  /** Permanent, non-error skip (marketing cap / outside window) — don't FAIL or retry. */
  skip?: boolean;
}

/** Per-process network timeout for Graph sends. */
const SEND_TIMEOUT_MS = 15_000;

/**
 * Meta error codes that mean "slow down / try again" rather than a hard reject:
 *   131056 — (pair) rate limit hit
 *   131048 — spam rate limit hit
 *   130429 — Cloud API rate limit hit
 *   368    — temporarily blocked for policy violations (throttle)
 */
// Sourced from the shared table rather than restated here. These two sets had
// drifted: this file skipped {131049, 131047} while the campaign path skipped
// {131049, 131050}, so a closed-window 131047 was a SKIP on the send path and a
// hard FAILED once the campaign worker classified it.
const RETRYABLE_META_CODES = WA_RETRYABLE_ERROR_CODES;
const SKIP_META_CODES = WA_SKIP_ERROR_CODES;

/**
 * Turn a Meta send error into a clear, actionable message for the agent. Known
 * re-engagement failures get a plain explanation; everything else prefers Meta's
 * specific `error_data.details` (which names the exact parameter for #131008)
 * over the generic top-level message.
 */
function describeMetaSendError(code: string | undefined, err: any, status: number): string {
  const details: string | undefined = err?.error_data?.details;
  const message: string | undefined = err?.message;
  switch (code) {
    case '131049':
      return 'Not delivered — Meta caps how many MARKETING templates a recipient receives (per-user "healthy ecosystem" limit). Re-engage with a UTILITY-category template instead.';
    case '131047':
      return 'Not delivered — re-engagement needs an approved template the recipient can receive. If this keeps failing, the recipient may have blocked messages or the template is not eligible.';
    case '131008':
      return details
        ? `(#131008) Required parameter is missing — ${details}`
        : (message ??
            '(#131008) Required parameter is missing — check the template variables/header/buttons.');
    case '132000':
    case '132001':
      return (
        details ??
        message ??
        'Template not found or its language/parameters do not match the approved version.'
      );
    default:
      return details ?? message ?? `HTTP ${status}`;
  }
}

// --- Tiny in-module circuit breaker -----------------------------------------
// After N consecutive hard failures we short-circuit sends for a cooldown so a
// Meta outage doesn't burn an entire campaign batch as FAILED. Successful (or
// classified retryable/skip) sends reset the counter.
const CB_FAILURE_THRESHOLD = 5;
const CB_COOLDOWN_MS = 30_000;
let cbConsecutiveFailures = 0;
let cbOpenUntil = 0;

function circuitIsOpen(): boolean {
  return Date.now() < cbOpenUntil;
}
function recordHardFailure(): void {
  cbConsecutiveFailures += 1;
  if (cbConsecutiveFailures >= CB_FAILURE_THRESHOLD) {
    cbOpenUntil = Date.now() + CB_COOLDOWN_MS;
    cbConsecutiveFailures = 0;
    logger.warn(`WhatsApp send circuit opened for ${CB_COOLDOWN_MS}ms after repeated failures`);
  }
}
function recordSuccess(): void {
  cbConsecutiveFailures = 0;
}

/**
 * Low-level send: POST an arbitrary Cloud API message body to
 * `/{PHONE_NUMBER_ID}/messages`. Returns the WAMID on success. Does NOT throw
 * on an API error — returns `{ ok:false, error }` so callers can persist a
 * FAILED status. Throws only on network failure (so BullMQ can retry).
 */
export async function sendWhatsappRaw(message: Record<string, any>): Promise<WaSendResult> {
  const phoneId = env.META_WHATSAPP_PHONE_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    logger.warn('Meta WhatsApp credentials missing — message not sent');
    return { wamid: null, ok: false, error: { title: 'credentials_missing' } };
  }

  // Circuit breaker: short-circuit as retryable so the batch resumes later
  // instead of marking every recipient FAILED during a Meta outage.
  if (circuitIsOpen()) {
    return {
      wamid: null,
      ok: false,
      retryable: true,
      retryAfterMs: Math.max(0, cbOpenUntil - Date.now()),
      error: { title: 'circuit_open', status: 503 },
    };
  }

  const url = `https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`;
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', ...message };

  // Bound the request with an AbortController so a hung Graph call can't stall
  // the worker indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let response: Response;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    // Network failure or timeout — transient, let BullMQ retry.
    recordHardFailure();
    const timedOut = e?.name === 'AbortError';
    return {
      wamid: null,
      ok: false,
      retryable: true,
      error: { title: timedOut ? 'request_timeout' : 'network_error', status: timedOut ? 408 : 0 },
    };
  } finally {
    clearTimeout(timer);
  }

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = data?.error ?? {};
    const code = err.code != null ? String(err.code) : undefined;
    // Surface Meta's SPECIFIC detail (error_data.details names the exact missing
    // param for #131008, etc.) instead of the generic message, and give the two
    // most common re-engagement failures a plain, actionable explanation.
    const title = describeMetaSendError(code, err, response.status);
    // Full detail to the logs so an ambiguous send failure is diagnosable.
    logger.warn(
      `Meta WhatsApp send error code=${code ?? '?'} status=${response.status} ` +
        `message="${err.message ?? ''}" details="${err.error_data?.details ?? ''}"`
    );
    const result: WaSendResult = {
      wamid: null,
      ok: false,
      error: { code, title, status: response.status },
    };

    // Honor Retry-After header (seconds or HTTP-date) where present.
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

    if (response.status === 429 || (code && RETRYABLE_META_CODES.has(code))) {
      // Rate/throttle — retry later, after the delay Meta asked for.
      //
      // This branch used to call recordSuccess(), which zeroes the consecutive
      // failure count, so the circuit breaker could never open during a pure
      // throttle storm: we kept hammering a Cloud API that was explicitly
      // telling us to stop. A throttle is neither a success nor a hard failure —
      // leave the counter alone and let the caller honour retryAfterMs.
      result.retryable = true;
      result.retryAfterMs = retryAfterMs ?? CB_COOLDOWN_MS;
    } else if (code && SKIP_META_CODES.has(code)) {
      // Marketing cap / outside re-engagement window — skip, never FAIL or retry.
      result.skip = true;
      recordSuccess();
    } else {
      // Terminal API error.
      recordHardFailure();
    }
    return result;
  }

  recordSuccess();
  return { wamid: data?.messages?.[0]?.id ?? null, ok: true };
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return undefined;
}

/** Best-effort read receipt: tell Meta the user's message was read (blue ticks). */
export async function sendReadReceipt(messageId: string): Promise<void> {
  const phoneId = env.META_WHATSAPP_PHONE_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!phoneId || !token || !messageId) return;
  const url = `https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    /* best-effort — never block the inbox */
  }
}

/** Upload a media buffer to Meta; returns the resulting media id used to send it. */
export async function uploadMediaToMeta(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<string | null> {
  const phoneId = env.META_WHATSAPP_PHONE_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!phoneId || !token) return null;
  const url = `https://graph.facebook.com/${graphVersion()}/${phoneId}/media`;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Meta media upload ${response.status}: ${JSON.stringify(data)}`);
  }
  return data?.id ?? null;
}
