import { prisma } from '../config/prisma';
import { renderEmail } from './email-merge.service';
import { sendCampaignEmail, type SendResult } from './email-send.service';
import type { RawEmailAttachment } from './email.service';
import type { Prisma } from '@prisma/client';

/**
 * Renders + sends a single campaign email for one recipient and returns the
 * outcome. Shared by the batch campaign worker and the drip (sequence) engine so
 * the merge/gate/send pipeline is identical for both. It does NOT mutate the
 * recipient's status or campaign counters — the caller owns the state machine.
 */

export interface DispatchSender {
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  domain: string;
}

export interface DispatchSettings {
  trackOpens: boolean;
  trackClicks: boolean;
  footerAddress: string | null;
  footerHtml: string | null;
  marketingCapPer24h: number;
}

export interface DispatchTemplate {
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  preheader?: string | null;
  category: string;
  /** Resolved HTML of the template's attached footer snippet (if any). */
  footerSnippetHtml?: string | null;
}

export interface DispatchInput {
  campaignId: string | null;
  recipient: {
    id: string;
    email: string;
    contactId: string;
    trackingToken: string;
    variables: Prisma.JsonValue;
  };
  template: DispatchTemplate;
  subjectOverride?: string | null;
  sender: DispatchSender;
  settings: DispatchSettings;
  suppressed?: boolean;
  utm?: Record<string, string> | null;
  fromNameOverride?: string | null;
  replyToOverride?: string | null;
  /** Resolved campaign attachments (loaded once per batch, attached to every send). */
  attachments?: RawEmailAttachment[];
}

export async function dispatchRecipient(input: DispatchInput): Promise<SendResult> {
  const isMarketing = input.template.category !== 'TRANSACTIONAL';

  // Fresh contact snapshot for the pre-send gate + personalization.
  const contact = await prisma.emailContact.findUnique({
    where: { id: input.recipient.contactId },
    select: { name: true, subscribeStatus: true, isBlocked: true, lastMarketingAt: true },
  });

  const variables =
    input.recipient.variables && typeof input.recipient.variables === 'object'
      ? (input.recipient.variables as Record<string, unknown>)
      : {};

  const rendered = renderEmail(
    {
      subject: input.subjectOverride || input.template.subject,
      htmlBody: input.template.htmlBody,
      textBody: input.template.textBody ?? null,
      preheader: input.template.preheader ?? null,
      footerSnippetHtml: input.template.footerSnippetHtml ?? null,
    },
    {
      recipient: {
        id: input.recipient.id,
        trackingToken: input.recipient.trackingToken,
        email: input.recipient.email,
      },
      campaignId: input.campaignId,
      variables,
      contactName: contact?.name ?? null,
      isMarketing,
      trackOpens: input.settings.trackOpens,
      trackClicks: input.settings.trackClicks,
      footerAddress: input.settings.footerAddress,
      footerHtml: input.settings.footerHtml,
      utm: input.utm ?? null,
    }
  );

  const result = await sendCampaignEmail({
    sender: {
      fromEmail: input.sender.fromEmail,
      fromName: input.fromNameOverride || input.sender.fromName,
      replyTo: input.replyToOverride ?? input.sender.replyTo,
      domain: input.sender.domain,
    },
    to: input.recipient.email,
    rendered,
    campaignId: input.campaignId,
    recipientId: input.recipient.id,
    isMarketing,
    attachments: input.attachments,
    suppressed: input.suppressed,
    contact: contact
      ? {
          subscribeStatus: contact.subscribeStatus,
          isBlocked: contact.isBlocked,
          lastMarketingAt: contact.lastMarketingAt,
        }
      : null,
    marketingCapPer24h: input.settings.marketingCapPer24h,
  });

  // Single chokepoint for the per-contact marketing frequency cap: stamp
  // lastMarketingAt whenever a marketing email actually leaves our system.
  if (isMarketing && result.outcome === 'sent') {
    await prisma.emailContact
      .update({ where: { id: input.recipient.contactId }, data: { lastMarketingAt: new Date() } })
      .catch(() => {});
  }

  return result;
}
