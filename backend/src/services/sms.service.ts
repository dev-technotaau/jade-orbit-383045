import twilio from 'twilio';
import { env } from '../config/env';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';
import { toE164 } from '../utils/phone';
import { prisma } from '../config/prisma';

/**
 * Twilio SMS transport.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * SMS is reserved for OTP / mobile verification — see NotificationChannel.
 * That makes delivery a login-blocking concern rather than a nice-to-have,
 * which is why this module does more than call `messages.create`:
 *
 *  • Authenticates with an API Key when one is configured, so a leaked
 *    application credential can be revoked without rotating the master
 *    account token every other integration shares.
 *  • Prefers a Messaging Service over a bare `from` number — that is where
 *    India's DLT sender-ID and content-template registration lives, and
 *    unregistered A2P traffic to Indian carriers is filtered.
 *  • Sets `validityPeriod`, so a code cannot arrive after it has expired.
 *  • Registers a status callback and writes an `SmsMessage` row, so
 *    "did it arrive?" is answerable. Twilio ACCEPTING a message says nothing
 *    about delivery, and carrier filtering is silent.
 *  • Classifies Twilio error codes into permanent vs transient, so the queue
 *    stops retrying sends that can never succeed.
 *  • Honours STOP: error 21610 means the recipient opted out, which is
 *    recorded rather than retried into the void.
 */

/* ════════════════════════ Client ════════════════════════ */

let twilioClient: twilio.Twilio | null = null;
/** Which credential we authenticated with — surfaced in the boot log. */
let authMode: 'api_key' | 'auth_token' | null = null;

try {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET } = env;

  const opts: twilio.ClientOpts = {
    // Without this the client can hang far longer than the worker's own 30s
    // race, tying up a concurrency slot.
    timeout: Number(env.TWILIO_HTTP_TIMEOUT_MS) || 10_000,
    ...(env.TWILIO_REGION ? { region: env.TWILIO_REGION } : {}),
    ...(env.TWILIO_EDGE ? { edge: env.TWILIO_EDGE } : {}),
  };

  if (TWILIO_ACCOUNT_SID && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET) {
    // API Key auth: accountSid is passed separately so the key can be scoped.
    twilioClient = twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
      accountSid: TWILIO_ACCOUNT_SID,
      ...opts,
    });
    authMode = 'api_key';
  } else if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, opts);
    authMode = 'auth_token';
  }

  if (twilioClient) {
    const sender = env.TWILIO_MESSAGING_SERVICE_SID
      ? `messaging service ${env.TWILIO_MESSAGING_SERVICE_SID}`
      : env.TWILIO_PHONE_NUMBER
        ? `from ${env.TWILIO_PHONE_NUMBER}`
        : 'NO SENDER CONFIGURED';
    logger.info(`📱 Twilio initialized (auth=${authMode}, sender=${sender})`);
    if (authMode === 'auth_token') {
      logger.warn(
        '⚠️ Twilio is using the master Auth Token. Set TWILIO_API_KEY_SID / _SECRET so a leak can be revoked in isolation.'
      );
    }
    if (!env.TWILIO_MESSAGING_SERVICE_SID) {
      logger.warn(
        '⚠️ No TWILIO_MESSAGING_SERVICE_SID. India (DLT) traffic from a bare long code is routinely carrier-filtered.'
      );
    }
  } else {
    logger.warn('⚠️ Twilio credentials missing — SMS disabled');
  }
} catch (error) {
  logger.error('❌ Twilio initialization failed:', error);
}

/* ════════════════════ Error classification ════════════════════ */

/**
 * Twilio error codes that can never succeed on retry. Retrying these burns
 * three API calls and delays the queue for a message that is already dead.
 * @see https://www.twilio.com/docs/api/errors
 */
const PERMANENT_ERROR_CODES = new Set([
  21211, // Invalid 'To' phone number
  21214, // 'To' number cannot be reached
  21217, // Phone number does not appear to be valid
  21408, // Permission to send to this region not enabled
  21606, // 'From' number is not a valid, SMS-capable number
  21610, // Recipient has opted out (STOP)
  21614, // 'To' number is not mobile-capable
  30003, // Unreachable destination handset
  30005, // Unknown destination handset
  30006, // Landline or unreachable carrier
]);

/** Recipient opted out via STOP — Twilio enforces this for us. */
const OPT_OUT_ERROR_CODE = 21610;

/** Carrier filtered the message. The signature of unregistered A2P into India. */
export const CARRIER_FILTERED_ERROR_CODE = 30007;

export class PermanentSmsError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message);
    this.name = 'PermanentSmsError';
  }
}

function twilioErrorCode(error: unknown): number | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'number' ? code : null;
}

/* ════════════════════════ Opt-out ════════════════════════ */

/** True when this number has sent STOP. Checked before every send. */
export async function isSmsOptedOut(phoneE164: string): Promise<boolean> {
  try {
    const row = await prisma.smsOptOut.findUnique({ where: { phone: phoneE164 } });
    return !!row;
  } catch {
    // Fail OPEN: a database blip must not block a login OTP. Twilio still
    // refuses the send with 21610, so the opt-out is honoured either way.
    return false;
  }
}

async function recordOptOut(phoneE164: string, reason: string): Promise<void> {
  try {
    await prisma.smsOptOut.upsert({
      where: { phone: phoneE164 },
      update: {},
      create: { phone: phoneE164, source: 'twilio_21610', reason },
    });
    logger.warn(`SMS opt-out recorded for ${phoneE164}`);
  } catch (err) {
    logger.error('Failed to record SMS opt-out', err);
  }
}

/* ════════════════════════ Send ════════════════════════ */

export interface SendSmsOptions {
  /** What produced this message, e.g. `otp.mobile_verify`. Stored for analytics. */
  purpose?: string;
  /** Owning user, when known — lets the ops view answer "did THIS user get it?". */
  userId?: string;
}

/**
 * Send one SMS.
 *
 * Returns true when Twilio ACCEPTED the message — which is not the same as
 * delivered. The `SmsMessage` row this creates is updated by the status
 * callback and is the only place delivery is actually known.
 *
 * Throws `PermanentSmsError` for codes that must not be retried; the worker
 * catches it and fails the job without consuming the remaining attempts.
 */
export const sendSMS = async (
  to: string,
  body: string,
  options: SendSmsOptions = {}
): Promise<boolean> => {
  if (!(await isFeatureEnabled('enableSMS'))) {
    logger.debug('SMS disabled via feature flag — skipping');
    return false;
  }

  const hasSender = !!(env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_PHONE_NUMBER);
  if (!twilioClient || !hasSender) {
    logger.warn('Attempted to send SMS but Twilio is not configured');
    return false;
  }

  // ── Destination must be E.164 ──
  // This was once `'+' + to.replace(/[^\d]/g,'')`, which turned a bare Indian
  // `9876543210` into `+9876543210` — country code 98, Iran. `toE164` resolves
  // the forms people actually type and returns null for anything ambiguous.
  const normalizedTo = toE164(to);
  if (!normalizedTo) {
    logger.error(`SMS aborted — unresolvable destination: ${JSON.stringify(to)}`);
    await recordAttempt({
      to: String(to),
      body,
      options,
      status: 'REJECTED',
      errorMessage: 'Unresolvable destination',
    });
    return false;
  }

  if (await isSmsOptedOut(normalizedTo)) {
    logger.warn(`SMS skipped — ${normalizedTo} has opted out (STOP)`);
    await recordAttempt({
      to: normalizedTo,
      body,
      options,
      status: 'REJECTED',
      errorCode: OPT_OUT_ERROR_CODE,
      errorMessage: 'Recipient opted out',
    });
    return false;
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      to: normalizedTo,
      // Messaging Service wins when configured — it owns sender selection and
      // carries the DLT registration. `from` is the fallback.
      ...(env.TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
        : { from: env.TWILIO_PHONE_NUMBER! }),
      // Drop rather than deliver a code after it has expired.
      validityPeriod: Number(env.TWILIO_SMS_VALIDITY_PERIOD) || 600,
      ...(env.TWILIO_STATUS_CALLBACK_URL ? { statusCallback: env.TWILIO_STATUS_CALLBACK_URL } : {}),
    });

    await recordAttempt({
      to: normalizedTo,
      body,
      options,
      status: 'QUEUED',
      providerSid: message.sid,
    });

    logger.info(`SMS accepted by Twilio for ${normalizedTo} (sid=${message.sid})`);
    return true;
  } catch (error) {
    const code = twilioErrorCode(error);
    const msg = (error as Error)?.message ?? 'unknown';

    await recordAttempt({
      to: normalizedTo,
      body,
      options,
      status: 'FAILED',
      errorCode: code ?? undefined,
      errorMessage: msg.slice(0, 500),
    });

    if (code === OPT_OUT_ERROR_CODE) {
      await recordOptOut(normalizedTo, msg.slice(0, 200));
    }

    if (code !== null && PERMANENT_ERROR_CODES.has(code)) {
      logger.error(`SMS permanently failed for ${normalizedTo} (code=${code}): ${msg}`);
      throw new PermanentSmsError(msg, code);
    }

    logger.error(`SMS transient failure for ${normalizedTo} (code=${code ?? 'n/a'}): ${msg}`);
    throw error;
  }
};

/* ════════════════════════ Tracking ════════════════════════ */

async function recordAttempt(args: {
  to: string;
  body: string;
  options: SendSmsOptions;
  status: 'QUEUED' | 'FAILED' | 'REJECTED';
  providerSid?: string;
  errorCode?: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.smsMessage.create({
      data: {
        providerSid: args.providerSid ?? null,
        to: args.to,
        // The body is an OTP — length is enough for cost/segment debugging.
        bodyLength: args.body.length,
        purpose: args.options.purpose ?? null,
        userId: args.options.userId ?? null,
        status: args.status,
        errorCode: args.errorCode ?? null,
        errorMessage: args.errorMessage ?? null,
      },
    });
  } catch (err) {
    // Tracking must never break sending.
    logger.error('Failed to record SmsMessage', err);
  }
}
