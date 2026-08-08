import type { Request, Response } from 'express';
import twilio from 'twilio';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import logger from '../config/logger';
import { SmsStatus } from '@prisma/client';

/**
 * Twilio delivery-receipt webhook.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `POST /api/v1/webhooks/sms/status`
 *
 * Twilio POSTs here as a message moves through queued → sent → delivered, or
 * lands on undelivered / failed. This is the ONLY place delivery is actually
 * known: `messages.create` resolving means Twilio accepted the message, not
 * that a handset received it. Carrier filtering — the standard failure mode
 * for unregistered A2P traffic into India — is silent without this.
 *
 * Public and unauthenticated by necessity (Twilio has no credential to
 * present), so every request is signature-verified against the auth token.
 */

/** Twilio message status → our enum. */
function mapStatus(raw: string): SmsStatus | null {
  switch (raw?.toLowerCase()) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
      return SmsStatus.QUEUED;
    case 'sending':
    case 'sent':
      return SmsStatus.SENT;
    case 'delivered':
      return SmsStatus.DELIVERED;
    case 'undelivered':
      return SmsStatus.UNDELIVERED;
    case 'failed':
      return SmsStatus.FAILED;
    default:
      return null;
  }
}

/**
 * Only ever move a message forward.
 *
 * Twilio does not guarantee callback ordering, so a late `sent` can arrive
 * after `delivered`. Without this a delivered message would be downgraded and
 * the dashboard would under-report delivery.
 */
const RANK: Record<SmsStatus, number> = {
  [SmsStatus.REJECTED]: 0,
  [SmsStatus.QUEUED]: 1,
  [SmsStatus.SENT]: 2,
  [SmsStatus.UNDELIVERED]: 3,
  [SmsStatus.FAILED]: 3,
  [SmsStatus.DELIVERED]: 4,
};

export const smsStatusCallback = async (req: Request, res: Response): Promise<void> => {
  // ── Signature verification ──
  // Anyone can POST to this URL. Twilio signs each request with the account
  // auth token over the exact URL + sorted body params; without checking it a
  // stranger could mark every message delivered, or forge opt-outs.
  const signature = req.header('X-Twilio-Signature');
  const url = env.TWILIO_STATUS_CALLBACK_URL;

  if (env.NODE_ENV === 'production') {
    if (!signature || !url || !env.TWILIO_AUTH_TOKEN) {
      logger.warn('SMS status callback rejected — missing signature or verification config');
      res.status(403).send('Forbidden');
      return;
    }
    const valid = twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      (req.body ?? {}) as Record<string, string>
    );
    if (!valid) {
      logger.warn('SMS status callback rejected — invalid Twilio signature');
      res.status(403).send('Forbidden');
      return;
    }
  }

  const body = (req.body ?? {}) as Record<string, string>;
  const sid = body.MessageSid || body.SmsSid;
  const status = mapStatus(body.MessageStatus || body.SmsStatus || '');

  // Always 204 — Twilio retries non-2xx, and there is nothing it can do about
  // a message we do not recognise.
  if (!sid || !status) {
    res.status(204).end();
    return;
  }

  try {
    const existing = await prisma.smsMessage.findUnique({
      where: { providerSid: sid },
      select: { id: true, status: true, to: true },
    });

    if (!existing) {
      logger.debug(`SMS status callback for unknown sid ${sid}`);
      res.status(204).end();
      return;
    }

    if (RANK[status] < RANK[existing.status]) {
      res.status(204).end();
      return;
    }

    const errorCode = body.ErrorCode ? Number(body.ErrorCode) : null;

    await prisma.smsMessage.update({
      where: { id: existing.id },
      data: {
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(body.ErrorMessage ? { errorMessage: body.ErrorMessage.slice(0, 500) } : {}),
        ...(body.NumSegments ? { segments: Number(body.NumSegments) } : {}),
        // Twilio reports price as a negative decimal string in the account
        // currency, e.g. "-0.0075". Stored as positive paise.
        ...(body.Price ? { pricePaise: Math.round(Math.abs(Number(body.Price)) * 100) } : {}),
        ...(status === SmsStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
    });

    // 21610 arriving on a receipt means the handset replied STOP after we
    // dispatched. Record it so the next send is skipped locally rather than
    // paying Twilio to reject it.
    if (errorCode === 21610) {
      await prisma.smsOptOut
        .upsert({
          where: { phone: existing.to },
          update: {},
          create: {
            phone: existing.to,
            source: 'twilio_21610',
            reason: 'Reported via status callback',
          },
        })
        .catch(() => {});
    }

    if (status === SmsStatus.UNDELIVERED || status === SmsStatus.FAILED) {
      logger.warn(
        `SMS ${status} to ${existing.to} (sid=${sid}, code=${errorCode ?? 'n/a'})` +
          (errorCode === 30007 ? ' — CARRIER FILTERED (check DLT registration)' : '')
      );
    }

    res.status(204).end();
  } catch (error) {
    logger.error('SMS status callback failed', error);
    // Still 204: retrying will not fix a bug on our side.
    res.status(204).end();
  }
};
