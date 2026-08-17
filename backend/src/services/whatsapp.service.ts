import { env } from '../config/env';
import logger from '../config/logger';
import {
  WA_RETRYABLE_ERROR_CODES,
  WA_SKIP_ERROR_CODES,
  isAuthErrorCode,
} from './whatsapp-error-codes';
// Channels carry their own (encrypted) Cloud API token; the env token is the
// fallback for the single-number installs that have always run off it.
import { getChannelAccessToken } from './whatsapp-channel.service';

// Meta WhatsApp Cloud API
// https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

/**
 * Pinned Graph API version (configurable; bumped from the legacy v17.0).
 *
 * v22.0 is the floor for the Block Users API below — earlier versions have no
 * `block_users` edge at all, so a block would 404 and silently stay local.
 */
export const graphVersion = (): string => env.META_WHATSAPP_API_VERSION || 'v22.0';

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
    // OAuth. Every send fails with this the moment a user token lapses, and it
    // used to reach the agent as Meta's own bare 'Error validating access token'
    // on one FAILED row at a time — nothing said the credential was the problem,
    // or that fixing it means replacing an environment variable and redeploying.
    case '190':
      // Meta ALWAYS fills `message` on an OAuth error ('Error validating access
      // token: Session has expired on ...'), so preferring it over the guidance
      // below meant the guidance never rendered on a real 190 — this case behaved
      // exactly like `default:`, and the agent still had nothing telling it which
      // credential to replace. Lead with the remedy, keep Meta's own detail after it.
      return (
        'Access token expired or revoked — replace META_WHATSAPP_TOKEN (or this ' +
        'number\u2019s own token under Settings \u2192 Channels) with a system-user ' +
        'token, which does not expire.' +
        (message ? ` (Meta: ${message})` : '')
      );
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
 *
 * `phoneNumberId` is the number to send FROM. It used to be read straight from
 * the env, so on a WABA carrying more than one number every reply went out from
 * the env-configured one — a customer who wrote to the second number got an
 * answer from a number they had never messaged, on a thread that does not exist
 * on their phone. Callers with no channel in hand (ad-hoc/diagnostic sends) can
 * omit it and keep the env default.
 */
export async function sendWhatsappRaw(
  message: Record<string, any>,
  phoneNumberId?: string | null,
  /**
   * Our own id for this send, echoed back on every status callback as
   * `biz_opaque_callback_data`.
   *
   * Status correlation was WAMID-only, and the WAMID does not exist until Graph
   * answers — so Meta's `sent` callback regularly arrived before the row it
   * belongs to had one, and the only recourse was to defer the whole event and
   * replay it later. With a token we chose ourselves, the row is identifiable
   * from the first callback onwards.
   */
  opaqueId?: string | null
): Promise<WaSendResult> {
  const phoneId = phoneNumberId || env.META_WHATSAPP_PHONE_ID;
  const token = await getChannelAccessToken(phoneId);
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
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    ...(opaqueId ? { biz_opaque_callback_data: opaqueId } : {}),
    ...message,
  };

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
      // Back off only when Meta is actually asking us to slow down. 190 sits in
      // the retryable set so an expired token rolls recipients back to PENDING
      // (replacing the credential resumes the campaign instead of an operator
      // hand-retrying the whole audience) — but a 401 carries no Retry-After, so
      // defaulting it to the circuit cooldown made the campaign worker sleep 30s
      // before EVERY recipient while parked on a credential that cannot recover
      // on its own.
      const backoffMs = retryAfterMs ?? (isAuthErrorCode(code) ? undefined : CB_COOLDOWN_MS);
      if (backoffMs != null) result.retryAfterMs = backoffMs;
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

// ── Block Users API (Graph v22.0+) ───────────────────────────────────────────
//
// "Block" used to be a local boolean and nothing else: the flag was read only on
// the way OUT, so a harasser or spammer the operator had blocked kept messaging
// in, kept firing auto-replies and kept opening billable service conversations.
// Meta's block is the half that actually stops the inbound traffic.

/** Meta accepts at most 100 users per block_users call. */
const BLOCK_USERS_BATCH = 100;

/** One user's outcome in a block_users response. */
interface BlockUserEntry {
  input?: string;
  errors?: Array<{ message?: string; error_data?: { details?: string } }>;
}

interface BlockUsersResponse {
  error?: { code?: number; message?: string; error_user_msg?: string };
  block_users?: {
    added_users?: BlockUserEntry[];
    removed_users?: BlockUserEntry[];
    failed_users?: BlockUserEntry[];
  };
}

export interface WaBlockResult {
  /** wa_ids Meta confirmed it applied the change to. */
  applied: string[];
  /** wa_ids Meta refused, with the reason it gave. */
  failed: Array<{ user: string; reason: string }>;
  /** Set when the call itself failed (credentials, network, HTTP error). */
  error?: string;
}

/**
 * Block or unblock WhatsApp users for one of our business numbers.
 *
 * Answers rather than throws: blocking is a bookkeeping action alongside a local
 * flag that has already been written, and a Graph outage must not leave the
 * operator unable to mark someone blocked at all. The caller persists what came
 * back so the console can say which half of the block is actually in force.
 *
 * Meta scopes a block to a PHONE NUMBER, not to the business account, so a
 * caller with several connected numbers has to call this once per number —
 * blocking on only the default leaves the customer free to message the others.
 */
export async function setUsersBlocked(
  waIds: string[],
  blocked: boolean,
  phoneNumberId?: string | null
): Promise<WaBlockResult> {
  const phoneId = phoneNumberId || env.META_WHATSAPP_PHONE_ID;
  const token = await getChannelAccessToken(phoneId);
  const users = [...new Set(waIds.map(toGraphPhone).filter(Boolean))];
  if (users.length === 0) return { applied: [], failed: [] };
  if (!phoneId || !token) {
    logger.warn('Meta WhatsApp credentials missing — block state not synced');
    return { applied: [], failed: [], error: 'credentials_missing' };
  }

  const url = `https://graph.facebook.com/${graphVersion()}/${phoneId}/block_users`;
  const out: WaBlockResult = { applied: [], failed: [] };

  for (let i = 0; i < users.length; i += BLOCK_USERS_BATCH) {
    const batch = users.slice(i, i + BLOCK_USERS_BATCH);
    const body = {
      messaging_product: 'whatsapp',
      block_users: batch.map((user) => ({ user })),
    };
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    let response: Response;
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      response = await fetch(url, {
        // The unblock is the same node with DELETE and the same body — Meta does
        // not expose a separate /unblock_users edge.
        method: blocked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (e) {
      out.error = (e as Error)?.name === 'TimeoutError' ? 'request_timeout' : 'network_error';
      return out;
    }

    const data = (await response.json().catch(() => ({}))) as BlockUsersResponse;
    if (!response.ok) {
      const err = data?.error ?? {};
      out.error = err.error_user_msg ?? err.message ?? `HTTP ${response.status}`;
      logger.warn(
        `Meta block_users error status=${response.status} code=${err.code ?? '?'} ` +
          `message="${err.message ?? ''}"`
      );
      return out;
    }

    const result = data.block_users ?? {};
    // Meta reports per-user outcomes: a user who has never messaged this number
    // cannot be blocked, and that is a normal answer rather than a call failure.
    for (const entry of Array.isArray(result.added_users) ? result.added_users : []) {
      if (entry?.input) out.applied.push(String(entry.input));
    }
    for (const entry of Array.isArray(result.removed_users) ? result.removed_users : []) {
      if (entry?.input) out.applied.push(String(entry.input));
    }
    for (const entry of Array.isArray(result.failed_users) ? result.failed_users : []) {
      const reason =
        entry?.errors?.[0]?.error_data?.details ?? entry?.errors?.[0]?.message ?? 'refused by Meta';
      if (entry?.input) out.failed.push({ user: String(entry.input), reason: String(reason) });
    }
    // Older responses answer with a bare `{ success: true }` and no per-user
    // breakdown; treat the whole batch as applied rather than reporting nothing.
    if (
      !Array.isArray(result.added_users) &&
      !Array.isArray(result.removed_users) &&
      !Array.isArray(result.failed_users)
    ) {
      out.applied.push(...batch);
    }
  }
  return out;
}

/**
 * Best-effort read receipt: tell Meta the user's message was read (blue ticks).
 *
 * Posted to the number that RECEIVED the message: Meta rejects a receipt for a
 * WAMID belonging to another phone-number id, so while this read the env value
 * a second number's threads never turned blue however often the agent opened
 * them.
 */
export async function sendReadReceipt(
  messageId: string,
  phoneNumberId?: string | null
): Promise<void> {
  return postReadReceipt(messageId, phoneNumberId, false);
}

/**
 * Best-effort "typing…" bubble on the customer's phone.
 *
 * The customer got no feedback at all while an agent composed a long reply — the
 * conversation simply went quiet, which on WhatsApp reads as being ignored. The
 * WhatsApp Business app shows this; the Cloud API exposes it as a companion
 * field on the READ RECEIPT call, not as a message of its own, so it necessarily
 * also blue-ticks the message it is sent against. That is not a side effect worth
 * avoiding here: it is only ever sent while an operator is typing INTO the open
 * thread, which is the strongest evidence of "actually read" the system has.
 *
 * Meta displays it for up to 25 seconds or until the next outbound message,
 * whichever comes first, so the caller re-sends it on a slower cadence rather
 * than trying to cancel it.
 */
export async function sendTypingIndicator(
  messageId: string,
  phoneNumberId?: string | null
): Promise<void> {
  return postReadReceipt(messageId, phoneNumberId, true);
}

async function postReadReceipt(
  messageId: string,
  phoneNumberId: string | null | undefined,
  typing: boolean
): Promise<void> {
  const phoneId = phoneNumberId || env.META_WHATSAPP_PHONE_ID;
  const token = await getChannelAccessToken(phoneId);
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
        ...(typing ? { typing_indicator: { type: 'text' } } : {}),
      }),
    });
  } catch {
    /* best-effort — never block the inbox */
  }
}

/**
 * Upload a media buffer to Meta; returns the resulting media id used to send it.
 *
 * The id is scoped to the phone-number id it was uploaded under, so it must be
 * the same number the message then goes out from — uploading under the env
 * number and sending from another one fails the send with "media not found".
 */
export async function uploadMediaToMeta(
  buffer: Buffer,
  mime: string,
  filename: string,
  phoneNumberId?: string | null
): Promise<string | null> {
  const phoneId = phoneNumberId || env.META_WHATSAPP_PHONE_ID;
  const token = await getChannelAccessToken(phoneId);
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

/**
 * Delete a media asset from Meta's servers. Best-effort; never throws.
 *
 * Everything the console uploads used to stay on Meta for the full 30 days it
 * keeps media, whatever happened to it afterwards — so an attachment an operator
 * sent by mistake, or one belonging to a contact who has since exercised their
 * right to erasure, remained fetchable by media id long after every copy this
 * system controls was gone. Deleting is the only lever we have over that window.
 *
 * `phone_number_id` scopes the delete to the number the asset was uploaded
 * under: a media id is owned by that number, and Meta refuses the call from
 * another one — the same scoping `uploadMediaToMeta` already has to honour.
 */
export async function deleteMetaMedia(
  mediaId: string,
  phoneNumberId?: string | null
): Promise<boolean> {
  const phoneId = phoneNumberId || env.META_WHATSAPP_PHONE_ID;
  const token = await getChannelAccessToken(phoneId);
  if (!mediaId || !token) return false;
  const query = phoneId ? `?phone_number_id=${encodeURIComponent(phoneId)}` : '';
  const url = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}${query}`;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Not an error worth raising: the id may already have aged out of Meta's
      // 30-day window, which is the same end state this call is aiming for.
      logger.warn(`Meta media delete ${mediaId} returned HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn(`Meta media delete ${mediaId} failed: ${(e as Error).message}`);
    return false;
  }
}
