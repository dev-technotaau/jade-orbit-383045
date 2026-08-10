import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';

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
}): Promise<{
  /** Row id, or null when the signature failed and nothing was persisted. */
  id: string | null;
  signatureOk: boolean;
  eventType: string;
  wamid: string | null;
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
    return { id: null, signatureOk: false, eventType: 'unknown', wamid: null };
  }

  const { eventType, wamid } = classifyWhatsappEvent(args.parsed);

  const row = await prisma.waWebhookEvent.create({
    data: {
      eventType,
      wamid,
      payload: args.parsed ?? {},
      signatureOk: true,
    },
    select: { id: true },
  });
  return { id: row.id, signatureOk, eventType, wamid };
}
