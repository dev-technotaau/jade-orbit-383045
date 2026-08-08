import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { putBufferToR2 } from './storage.service';
import { normalizeEmail, upsertContactByEmail } from './email-contact.service';
import { addSuppression } from './email-suppression.service';
import { recordUnsubscribe } from './email-tracking.service';
import { recomputeCampaignCounters } from './email-campaign.service';
import { getEmailSettings } from './email-settings.service';
import { resolveOrCreateThread, sendThreadReply } from './email-thread.service';
import { maybeAutoRespond, looksAutomated } from './email-autoreply.service';
import { emitEmail } from '../utils/email-realtime';
import { getDefaultSender } from './email-sender.service';
import { webhookService } from './webhook.service';

/**
 * Ingests one raw inbound email (from the IMAP poller): classifies it as a
 * bounce (DSN), complaint (ARF), auto-reply, or human reply, records the raw
 * row for replay/dedup, and applies the effects — suppression + counters for
 * bounces/complaints, threading + rules for replies. There are NO ESP webhooks
 * on a self-hosted MTA, so this IMAP path IS our bounce/complaint pipeline.
 */

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string | null;
  inReplyTo?: string | null;
  references?: string[];
  text?: string | null;
  html?: string | null;
  raw: string;
  autoSubmitted?: boolean;
  reportType?: string | null;
  mailbox: string;
  imapUid?: number | null;
  attachments?: Array<{ filename: string; contentType: string; size: number; content: Buffer }>;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Upload inbound attachments to R2 (best-effort) and return their metadata. */
async function uploadInboundAttachments(
  email: InboundEmail
): Promise<Array<{ filename: string; mime: string; size: number; r2Url: string }>> {
  const out: Array<{ filename: string; mime: string; size: number; r2Url: string }> = [];
  for (const att of email.attachments ?? []) {
    if (!att.content || att.size <= 0 || att.size > MAX_ATTACHMENT_BYTES) continue;
    try {
      const safe = (att.filename || 'attachment').replace(/[^\w.-]+/g, '_').slice(0, 120);
      const key = `email-inbound/${crypto.randomUUID()}-${safe}`;
      const { url } = await putBufferToR2(
        att.content,
        key,
        att.contentType || 'application/octet-stream'
      );
      out.push({
        filename: att.filename || 'attachment',
        mime: att.contentType,
        size: att.size,
        r2Url: url,
      });
    } catch (e) {
      logger.debug(`Inbound attachment upload skipped: ${(e as Error).message}`);
    }
  }
  return out;
}

const SOFT_BOUNCE_SUPPRESS_THRESHOLD = 5;

type InboundKind = 'bounce' | 'complaint' | 'autoreply' | 'reply';

function classify(email: InboundEmail): InboundKind {
  const rt = (email.reportType || '').toLowerCase();
  const raw = email.raw || '';
  if (rt.includes('delivery-status') || /content-type:[^\n]*delivery-status/i.test(raw))
    return 'bounce';
  if (rt.includes('feedback-report') || /feedback-type:/i.test(raw)) return 'complaint';
  if (
    email.autoSubmitted ||
    /^(auto[- ]?reply|out of office|automatic reply)/i.test(email.subject || '')
  ) {
    return 'autoreply';
  }
  return 'reply';
}

/** Extract an email address from a "Name <addr>" header value. */
function extractAddress(v: string | null | undefined): string {
  if (!v) return '';
  const m = v.match(/<([^>]+)>/);
  return normalizeEmail(m ? m[1] : v);
}

/** Resolve the campaign recipient a bounce/complaint refers to. */
function resolveRecipientId(email: InboundEmail): string | null {
  const hay = [email.to.join(' '), email.raw].join(' ');
  const verp = hay.match(/bounce\+([A-Za-z0-9_-]+)@/i);
  if (verp) return verp[1];
  const hdr = email.raw.match(/X-HA-Recipient:\s*([A-Za-z0-9_-]+)/i);
  if (hdr) return hdr[1];
  const mid = email.raw.match(/c\.[^.\s]+\.r\.([A-Za-z0-9_-]+)@/);
  if (mid) return mid[1];
  return null;
}

/** Parse a DSN report → { status, hard, failedRecipient }. */
function parseDsn(raw: string): {
  status: string | null;
  hard: boolean;
  failedRecipient: string | null;
} {
  const statusMatch = raw.match(/Status:\s*([0-9]\.[0-9]+\.[0-9]+)/i);
  const status = statusMatch ? statusMatch[1] : null;
  const recMatch =
    raw.match(/Final-Recipient:\s*[^;]+;\s*([^\s]+)/i) ||
    raw.match(/Original-Recipient:\s*[^;]+;\s*([^\s]+)/i);
  const failedRecipient = recMatch ? normalizeEmail(recMatch[1]) : null;
  const hard = status ? status.startsWith('5') : /\b5\.\d\.\d\b/.test(raw);
  return { status, hard, failedRecipient };
}

export async function ingestInbound(
  email: InboundEmail
): Promise<{ kind: InboundKind; deduped?: boolean }> {
  const messageId = email.messageId?.trim();
  if (!messageId) return { kind: 'reply', deduped: true };

  // Dedup by RFC Message-ID.
  const existing = await prisma.emailInboundMessage.findUnique({
    where: { messageId },
    select: { id: true },
  });
  if (existing) return { kind: 'reply', deduped: true };

  const kind = classify(email);
  const recipientId = kind === 'bounce' || kind === 'complaint' ? resolveRecipientId(email) : null;
  const dsn = kind === 'bounce' ? parseDsn(email.raw) : null;

  const row = await prisma.emailInboundMessage.create({
    data: {
      messageId,
      imapUid: email.imapUid ?? null,
      mailbox: email.mailbox,
      kind,
      fromEmail: extractAddress(email.from),
      toEmail: email.to[0] ? normalizeEmail(email.to[0]) : null,
      subject: email.subject,
      dsnStatus: dsn?.status ?? null,
      dsnRecipient: dsn?.failedRecipient ?? null,
      recipientId,
    },
  });

  try {
    if (kind === 'bounce') await handleBounce(email, recipientId, dsn);
    else if (kind === 'complaint') await handleComplaint(email, recipientId);
    else if (kind === 'reply') await handleReply(email);
    // autoreply: recorded only, no effect.
  } catch (e) {
    logger.warn(`Inbound effect (${kind}) failed for ${messageId}: ${(e as Error).message}`);
  }

  await prisma.emailInboundMessage
    .update({ where: { id: row.id }, data: { processedAt: new Date() } })
    .catch(() => {});
  return { kind };
}

async function handleBounce(
  email: InboundEmail,
  recipientId: string | null,
  dsn: { status: string | null; hard: boolean; failedRecipient: string | null } | null
): Promise<void> {
  const recipient = recipientId
    ? await prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } })
    : null;
  const targetEmail = recipient?.email || dsn?.failedRecipient || extractAddress(email.from);
  if (!targetEmail) return;
  const hard = dsn?.hard ?? true;

  if (recipient) {
    await prisma.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        bouncedAt: new Date(),
        bounceType: hard ? 'hard' : 'soft',
        ...(hard ? { status: 'BOUNCED' } : {}),
      },
    });
  }

  const contact = await prisma.emailContact.findUnique({ where: { email: targetEmail } });
  if (contact) {
    const bounceCount = contact.bounceCount + 1;
    await prisma.emailContact.update({
      where: { id: contact.id },
      data: { bounceCount, ...(hard ? { subscribeStatus: 'CLEANED' } : {}) },
    });
    if (hard || bounceCount >= SOFT_BOUNCE_SUPPRESS_THRESHOLD) {
      await addSuppression({
        email: targetEmail,
        reason: hard ? 'hard_bounce' : 'soft_bounce',
        source: 'dsn',
      }).catch(() => {});
    }
  } else if (hard) {
    await addSuppression({ email: targetEmail, reason: 'hard_bounce', source: 'dsn' }).catch(
      () => {}
    );
  }

  await prisma.emailEvent.create({
    data: {
      eventType: 'BOUNCE',
      campaignId: recipient?.campaignId ?? null,
      recipientId: recipient?.id ?? null,
      contactId: contact?.id ?? null,
      bounceType: hard ? 'hard' : 'soft',
      reason: dsn?.status ?? null,
    },
  });

  void webhookService.dispatch('email.bounced', {
    email: targetEmail,
    campaignId: recipient?.campaignId ?? null,
    recipientId: recipient?.id ?? null,
    bounceType: hard ? 'hard' : 'soft',
    reason: dsn?.status ?? null,
    at: new Date().toISOString(),
  });

  if (recipient?.campaignId) await recomputeCampaignCounters(recipient.campaignId).catch(() => {});
}

async function handleComplaint(email: InboundEmail, recipientId: string | null): Promise<void> {
  const recipient = recipientId
    ? await prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } })
    : null;
  const targetEmail = recipient?.email || extractAddress(email.from);
  if (!targetEmail) return;

  if (recipient) {
    await prisma.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { complainedAt: new Date(), status: 'COMPLAINED' },
    });
  }

  const contact = await prisma.emailContact.findUnique({ where: { email: targetEmail } });
  if (contact) {
    await prisma.emailContact.update({
      where: { id: contact.id },
      data: {
        complaintCount: contact.complaintCount + 1,
        subscribeStatus: 'UNSUBSCRIBED',
        unsubscribedAt: new Date(),
      },
    });
  }
  await addSuppression({ email: targetEmail, reason: 'complaint', source: 'arf' }).catch(() => {});

  await prisma.emailEvent.create({
    data: {
      eventType: 'COMPLAINT',
      campaignId: recipient?.campaignId ?? null,
      recipientId: recipient?.id ?? null,
      contactId: contact?.id ?? null,
    },
  });

  void webhookService.dispatch('email.complained', {
    email: targetEmail,
    campaignId: recipient?.campaignId ?? null,
    recipientId: recipient?.id ?? null,
    at: new Date().toISOString(),
  });

  if (recipient?.campaignId) await recomputeCampaignCounters(recipient.campaignId).catch(() => {});
}

async function handleReply(email: InboundEmail): Promise<void> {
  const fromEmail = extractAddress(email.from);
  if (!fromEmail) return;
  const contact = await upsertContactByEmail(fromEmail, { subscribeSource: 'reply' });

  // Opt-out keyword in a reply body → treat as an unsubscribe (still thread it).
  const settings = await getEmailSettings();
  const bodyUpper = (email.text || '').trim().toUpperCase();
  if (settings.unsubscribeKeywords.some((k) => bodyUpper === k || bodyUpper.startsWith(k))) {
    await recordUnsubscribe({ e: fromEmail }, 'reply_stop').catch(() => {});
  }

  // Sender = the one this reply was addressed to, else the default.
  const toAddrs = email.to.map((t) => normalizeEmail(t));
  const sender =
    (await prisma.emailSender.findFirst({ where: { fromEmail: { in: toAddrs } } })) ??
    (await getDefaultSender());
  if (!sender) return;

  const thread = await resolveOrCreateThread({
    senderId: sender.id,
    contactId: contact.id,
    subject: email.subject,
    inReplyTo: email.inReplyTo,
    references: email.references,
    rootMessageId: email.messageId,
  });
  if (!thread) return;

  const snippet = (email.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const attachments = await uploadInboundAttachments(email);
  const message = await prisma.emailMessage.create({
    data: {
      providerMessageId: email.messageId,
      senderId: sender.id,
      threadId: thread.id,
      contactId: contact.id,
      direction: 'INBOUND',
      status: 'RECEIVED',
      fromEmail,
      toEmail: toAddrs[0] ?? null,
      subject: email.subject,
      htmlBody: email.html ? sanitizeInboundHtml(email.html) : null,
      textBody: email.text ?? null,
      snippet,
      attachments: attachments.length ? (attachments as Prisma.InputJsonValue) : undefined,
      inReplyTo: email.inReplyTo ?? null,
      references: email.references ?? [],
    },
  });

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: {
      unreadCount: { increment: 1 },
      lastMessageAt: new Date(),
      lastMessagePreview: snippet,
      status: thread.status === 'RESOLVED' ? 'OPEN' : thread.status,
    },
  });

  // Attribute the reply to a campaign recipient (funnel Replied stage).
  const ids = [email.inReplyTo, ...(email.references ?? [])].filter(Boolean) as string[];
  if (ids.length) {
    const rec = await prisma.emailCampaignRecipient.findFirst({
      where: { providerMessageId: { in: ids } },
    });
    if (rec) {
      await prisma.emailCampaignRecipient.updateMany({
        where: { id: rec.id, repliedAt: null },
        data: { repliedAt: new Date() },
      });
      if (rec.campaignId) await recomputeCampaignCounters(rec.campaignId).catch(() => {});
    }
  }

  emitEmail('email:message', { threadId: thread.id, message }, thread.id);
  emitEmail('email:thread', { threadId: thread.id });

  // Keyword rules first; if none auto-replied, fall through to the settings-driven
  // welcome/away auto-responder (at most one auto-reply per inbound).
  const rulesReplied = await evaluateRules(thread.id, email).catch(() => false);
  if (!rulesReplied) {
    await maybeAutoRespond({ threadId: thread.id, contactId: contact.id, email });
  }
}

/**
 * First matching enabled rule (by priority) applies its action. Returns true if
 * it sent an auto-reply. `auto_reply` is suppressed for automated inbound mail
 * (Auto-Submitted / mailer-daemon / OOO) to prevent responder loops.
 */
async function evaluateRules(threadId: string, email: InboundEmail): Promise<boolean> {
  const rules = await prisma.emailRule.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  let replied = false;
  for (const rule of rules) {
    const hay = [
      rule.matchSubject ? email.subject || '' : '',
      rule.matchBody ? email.text || '' : '',
    ]
      .join('\n')
      .toLowerCase();
    const hit = rule.keywords.some((kw) => matchKeyword(hay, kw.toLowerCase(), rule.matchType));
    if (!hit) continue;
    switch (rule.action) {
      case 'auto_reply':
        if (rule.replyBody && !looksAutomated(email)) {
          await sendThreadReply(threadId, null, { body: rule.replyBody }, { auto: true }).catch(
            () => {}
          );
          replied = true;
        }
        break;
      case 'label':
        if (rule.label) {
          const t = await prisma.emailThread.findUnique({
            where: { id: threadId },
            select: { labels: true },
          });
          const labels = Array.from(new Set([...(t?.labels ?? []), rule.label]));
          await prisma.emailThread
            .update({ where: { id: threadId }, data: { labels: { set: labels } } })
            .catch(() => {});
        }
        break;
      case 'assign':
        if (rule.assignTo)
          await prisma.emailThread
            .update({ where: { id: threadId }, data: { assignedTo: rule.assignTo } })
            .catch(() => {});
        break;
      case 'resolve':
        await prisma.emailThread
          .update({ where: { id: threadId }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
          .catch(() => {});
        break;
    }
    break; // first matching rule wins
  }
  return replied;
}

function matchKeyword(hay: string, kw: string, type: string): boolean {
  if (!kw) return false;
  switch (type) {
    case 'equals':
      return hay.trim() === kw;
    case 'starts_with':
      return hay.trimStart().startsWith(kw);
    case 'regex':
      try {
        return new RegExp(kw, 'i').test(hay);
      } catch {
        return false;
      }
    case 'contains':
    default:
      return hay.includes(kw);
  }
}

/** Minimal server-side scrub of hostile inbound HTML before storage. */
function sanitizeInboundHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
