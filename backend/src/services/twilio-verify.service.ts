import twilio from 'twilio';
import { env } from '../config/env';
import logger from '../config/logger';
import { toE164 } from '../utils/phone';

/**
 * Twilio Verify — managed OTP delivery.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * OPTIONAL. Active only when `TWILIO_VERIFY_SERVICE_SID` is set; otherwise the
 * app keeps generating, storing and comparing its own OTPs and sending them as
 * plain SMS. Both paths coexist so this can be switched on without a rewrite,
 * and switched off if Verify is ever unavailable.
 *
 * ── Why Verify is the better tool for OTP ──
 * The plain-SMS path makes us responsible for code generation, expiry, attempt
 * limiting and rate limiting — all of which we do, but all of which are ours
 * to get wrong. Verify owns them, and adds two things we cannot replicate:
 *
 *  1. **India DLT.** Twilio maintains registered sender IDs and content
 *     templates for Verify traffic into India. That is the exact registration
 *     unregistered A2P long-code traffic is filtered for — the single most
 *     likely reason an OTP never arrives today.
 *  2. **Fraud controls.** Verify applies per-number and per-IP throttling and
 *     SMS-pumping protection that a hand-rolled OTP has no view of.
 *
 * ── What it costs ──
 * The code never touches our database: Verify holds it. So `checkCode` is the
 * only way to validate, and a Verify outage means no OTP login. That is why
 * this is opt-in rather than the default.
 */

let verifyClient: twilio.Twilio | null = null;

try {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET } = env;
  const opts = { timeout: Number(env.TWILIO_HTTP_TIMEOUT_MS) || 10_000 };

  if (env.TWILIO_VERIFY_SERVICE_SID) {
    if (TWILIO_ACCOUNT_SID && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET) {
      verifyClient = twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
        accountSid: TWILIO_ACCOUNT_SID,
        ...opts,
      });
    } else if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      verifyClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, opts);
    }
    if (verifyClient) {
      logger.info(`📱 Twilio Verify enabled (service=${env.TWILIO_VERIFY_SERVICE_SID})`);
    } else {
      logger.warn('⚠️ TWILIO_VERIFY_SERVICE_SID set but Twilio credentials are missing');
    }
  }
} catch (error) {
  logger.error('❌ Twilio Verify initialization failed:', error);
}

/** True when Verify is configured and should own OTP delivery. */
export function isVerifyEnabled(): boolean {
  return !!verifyClient && !!env.TWILIO_VERIFY_SERVICE_SID;
}

export type VerifyChannel = 'sms' | 'call' | 'whatsapp';

/**
 * Ask Verify to send a code. Returns false when Verify is off or the send
 * fails, so the caller can fall back to the app's own OTP path.
 */
export async function startVerification(
  to: string,
  channel: VerifyChannel = 'sms'
): Promise<boolean> {
  if (!isVerifyEnabled()) return false;

  const normalized = toE164(to);
  if (!normalized) {
    logger.error(`Verify aborted — unresolvable destination: ${JSON.stringify(to)}`);
    return false;
  }

  try {
    const v = await verifyClient!.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({ to: normalized, channel });
    logger.info(`Verify code sent to ${normalized} (status=${v.status}, channel=${channel})`);
    return true;
  } catch (error) {
    logger.error(`Verify send failed for ${normalized}:`, error);
    return false;
  }
}

/**
 * Check a code the user typed.
 *
 * `null` means Verify could not answer (disabled, or the API errored) — the
 * caller must then fall back to its own comparison rather than treat an
 * outage as a wrong code and lock someone out.
 */
export async function checkVerification(to: string, code: string): Promise<boolean | null> {
  if (!isVerifyEnabled()) return null;

  const normalized = toE164(to);
  if (!normalized) return false;

  try {
    const check = await verifyClient!.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: normalized, code });
    return check.status === 'approved';
  } catch (error) {
    // 20404 = no pending verification for this number (expired or already
    // used). That is a definitive "no", not an outage.
    const twilioCode = (error as { status?: number })?.status;
    if (twilioCode === 404) return false;
    logger.error(`Verify check failed for ${normalized}:`, error);
    return null;
  }
}

export const twilioVerify = { isVerifyEnabled, startVerification, checkVerification };
