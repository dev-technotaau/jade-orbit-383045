import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { sendRawEmail, type RawEmailAttachment } from './email.service';
import { isSuppressed } from './email-suppression.service';
import { normalizeEmail } from './email-contact.service';
import type { RenderedEmail } from './email-merge.service';
import type { EmailSubscribeStatus } from '@prisma/client';
import { randomTrackingToken } from '../utils/email-token';

/**
 * The bulk send primitive. Enforces the pre-send gate (suppression / block /
 * subscribe status / marketing frequency cap), stamps the compliance headers
 * (List-Unsubscribe + RFC 8058 one-click + Precedence:bulk) and a deterministic
 * Message-ID, sends via the raw transport, and writes an EmailSendLog. Counter
 * updates + recipient status live in the campaign worker — this function is a
 * single, idempotent-friendly send.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type SendOutcome = 'sent' | 'skipped' | 'failed';

export interface SendResult {
  outcome: SendOutcome;
  reason?: string;
  providerMessageId?: string;
  smtpResponse?: string;
}

export interface CampaignSendInput {
  sender: { fromEmail: string; fromName: string; replyTo?: string | null; domain: string };
  to: string;
  rendered: RenderedEmail;
  campaignId?: string | null;
  recipientId?: string | null;
  isMarketing: boolean;
  /** Precomputed suppression membership (batch fast-path); re-checked if omitted. */
  suppressed?: boolean;
  contact?: {
    subscribeStatus: EmailSubscribeStatus;
    isBlocked: boolean;
    lastMarketingAt: Date | null;
  } | null;
  marketingCapPer24h?: number;
  attachments?: RawEmailAttachment[];
}

function buildMessageId(
  sender: { domain: string },
  campaignId?: string | null,
  recipientId?: string | null
): string {
  const rid = recipientId || randomTrackingToken();
  const cid = campaignId || 'x';
  return `<c.${cid}.r.${rid}@${sender.domain}>`;
}

function buildHeaders(input: CampaignSendInput, messageId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-HA-Recipient': input.recipientId || '',
    'X-HA-Campaign': input.campaignId || '',
    'X-Entity-Ref-ID': messageId,
  };
  if (input.isMarketing) {
    const mailto = `mailto:${input.sender.replyTo || env.EMAIL_REPLY_TO || input.sender.fromEmail}?subject=unsubscribe`;
    headers['List-Unsubscribe'] = `<${input.rendered.unsubscribeUrl}>, <${mailto}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    headers['Precedence'] = 'bulk';
    headers['Auto-Submitted'] = 'auto-generated';
  }
  return headers;
}

/** Send one campaign email through the pre-send gate. Never throws — returns a SendResult. */
export async function sendCampaignEmail(input: CampaignSendInput): Promise<SendResult> {
  const to = normalizeEmail(input.to);

  // ---- Pre-send gate ----
  const suppressed = input.suppressed ?? (await isSuppressed(to));
  if (suppressed) return logAndReturn(input, to, { outcome: 'skipped', reason: 'suppressed' });
  if (input.contact?.isBlocked) {
    return logAndReturn(input, to, { outcome: 'skipped', reason: 'blocked' });
  }
  if (input.isMarketing && input.contact?.subscribeStatus === 'UNSUBSCRIBED') {
    return logAndReturn(input, to, { outcome: 'skipped', reason: 'unsubscribed' });
  }
  if (
    input.isMarketing &&
    (input.marketingCapPer24h ?? 0) > 0 &&
    input.contact?.lastMarketingAt &&
    Date.now() - input.contact.lastMarketingAt.getTime() < DAY_MS
  ) {
    return logAndReturn(input, to, { outcome: 'skipped', reason: 'frequency_cap' });
  }

  const messageId = buildMessageId(input.sender, input.campaignId, input.recipientId);
  const headers = buildHeaders(input, messageId);
  const envelopeFrom =
    input.recipientId && env.EMAIL_BOUNCE_DOMAIN
      ? `bounce+${input.recipientId}@${env.EMAIL_BOUNCE_DOMAIN}`
      : undefined;

  const start = Date.now();
  try {
    const info = await sendRawEmail({
      fromName: input.sender.fromName,
      fromEmail: input.sender.fromEmail,
      replyTo: input.sender.replyTo || undefined,
      to,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      headers,
      messageId,
      envelopeFrom,
      attachments: input.attachments,
    });
    const latencyMs = Date.now() - start;
    const accepted = info.accepted.length > 0;
    const status = accepted ? 'ACCEPTED' : 'REJECTED';

    await writeSendLog(input, to, {
      providerMessageId: messageId,
      status,
      smtpResponse: info.response,
      acceptedRcpts: info.accepted,
      rejectedRcpts: info.rejected,
      latencyMs,
    });

    return accepted
      ? { outcome: 'sent', providerMessageId: messageId, smtpResponse: info.response }
      : { outcome: 'failed', reason: info.response || 'rejected', smtpResponse: info.response };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = (err as Error).message || 'send error';
    await writeSendLog(input, to, {
      providerMessageId: messageId,
      status: 'ERROR',
      errorMessage: message,
      latencyMs,
    });
    return { outcome: 'failed', reason: message };
  }
}

function logAndReturn(
  input: CampaignSendInput,
  to: string,
  result: SendResult
): Promise<SendResult> {
  return writeSendLog(input, to, {
    status: 'SKIPPED',
    errorMessage: result.reason,
  }).then(() => result);
}

async function writeSendLog(
  input: CampaignSendInput,
  to: string,
  data: {
    providerMessageId?: string;
    status: string;
    smtpResponse?: string;
    acceptedRcpts?: string[];
    rejectedRcpts?: string[];
    latencyMs?: number;
    errorMessage?: string;
  }
): Promise<void> {
  await prisma.emailSendLog
    .create({
      data: {
        toEmail: to,
        campaignId: input.campaignId ?? null,
        recipientId: input.recipientId ?? null,
        providerMessageId: data.providerMessageId ?? null,
        status: data.status,
        smtpResponse: data.smtpResponse ?? null,
        acceptedRcpts: data.acceptedRcpts ?? [],
        rejectedRcpts: data.rejectedRcpts ?? [],
        latencyMs: data.latencyMs ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    })
    .catch(() => {});
}
