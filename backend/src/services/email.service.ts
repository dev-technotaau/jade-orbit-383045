import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /**
   * Delivery class.
   *
   * `transactional` (default) is unchanged behaviour: password resets, OTPs,
   * application updates. These must ALWAYS attempt delivery — never
   * suppressed, never carrying an unsubscribe header, because a user cannot
   * opt out of account security.
   *
   * `bulk` is the marketing-class mail the recurring digests send. It goes
   * through the same compliance gate the campaign system uses:
   * suppression-list check, List-Unsubscribe + RFC 8058 one-click,
   * `Precedence: bulk`, and a VERP return-path so bounces are attributable.
   * Gmail and Yahoo require the one-click header on bulk mail; without it
   * this class gets throttled or spam-foldered.
   */
  deliveryClass?: 'transactional' | 'bulk';
  /** Bulk only: the user this is going to — drives the VERP id and unsub token. */
  userId?: string;
  /** Bulk only: digest category, so unsubscribing turns off only that one. */
  digestCategory?: string;
}

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(env.SMTP_PORT || '587', 10),
  secure: env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  tls: {
    // When connecting via K8s service (mailserver-external), validate cert
    // against the actual mail domain so TLS hostname check passes
    servername: 'mail.hireadda.in',
  },
});

/**
 * Send an email
 * @param options - Email options (to, subject, html, text)
 * @returns info about the sent message
 */
export const sendEmail = async (options: EmailOptions): Promise<any> => {
  try {
    if (!(await isFeatureEnabled('enableEmailNotifications'))) {
      logger.debug('Email disabled via feature flag — skipping');
      return { messageId: 'flag-disabled' };
    }

    if (env.NODE_ENV === 'test') {
      logger.info(`[TEST] Email sent to ${options.to}: ${options.subject}`);
      return { messageId: 'test-id' };
    }

    const isBulk = options.deliveryClass === 'bulk';
    let headers: Record<string, string> | undefined;
    let envelopeFrom: string | undefined;

    if (isBulk) {
      // ── Suppression gate ──
      // Reuses the campaign system's suppression list, which the IMAP
      // bounce/complaint pipeline feeds. Applied to BULK ONLY: suppressing a
      // password reset because a mailbox once bounced would lock people out
      // of their own accounts.
      const { isSuppressed } = await import('./email-suppression.service');
      if (await isSuppressed(options.to)) {
        logger.info(`Bulk email skipped — suppressed: ${options.to}`);
        return { messageId: 'suppressed', skipped: true };
      }

      const { notificationUnsubscribeUrl } = await import('../utils/email-token');
      const replyTo = options.replyTo || env.EMAIL_REPLY_TO || env.EMAIL_FROM;
      headers = { Precedence: 'bulk', 'Auto-Submitted': 'auto-generated' };

      if (options.userId) {
        const unsubUrl = notificationUnsubscribeUrl({
          u: options.userId,
          ...(options.digestCategory ? { k: options.digestCategory } : {}),
        });
        const mailto = `mailto:${replyTo}?subject=unsubscribe`;
        headers['List-Unsubscribe'] = `<${unsubUrl}>, <${mailto}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';

        // VERP return-path so the bounce is attributable.
        //
        // `n-` prefix, NOT `n.` — the inbound parser matches
        // `bounce+([A-Za-z0-9_-]+)@`, which excludes dots, so a dotted local
        // part would be silently unparseable. The prefix distinguishes a
        // notification bounce from a campaign recipient id; the campaign
        // recipient lookup simply misses and the handler falls back to the
        // DSN's failed-recipient address, which is what drives suppression.
        if (env.EMAIL_BOUNCE_DOMAIN) {
          envelopeFrom = `bounce+n-${options.userId}@${env.EMAIL_BOUNCE_DOMAIN}`;
        }
      }
    }

    const info = await transporter.sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.EMAIL_FROM}>`, // sender address
      to: options.to, // list of receivers
      replyTo: options.replyTo || env.EMAIL_REPLY_TO || env.EMAIL_FROM, // reply-to address
      subject: options.subject, // Subject line
      text: options.text, // plain text body
      html: options.html, // html body
      ...(headers ? { headers } : {}),
      ...(envelopeFrom ? { envelope: { from: envelopeFrom, to: options.to } } : {}),
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

export interface RawEmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface RawEmailOptions {
  fromName?: string;
  fromEmail?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  messageId?: string;
  /** VERP envelope-from (Return-Path) so a bounce DSN maps to the recipient. */
  envelopeFrom?: string;
  /** File attachments (already loaded into memory) — passed through to nodemailer. */
  attachments?: RawEmailAttachment[];
}

export interface RawEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

/**
 * Low-level send for the bulk/campaign path: supports a per-sender from-address,
 * custom headers (List-Unsubscribe / Precedence / X-HA-*), a stamped Message-ID,
 * and a VERP envelope-from. The transactional `sendEmail` above is unchanged.
 */
export const sendRawEmail = async (options: RawEmailOptions): Promise<RawEmailResult> => {
  if (!(await isFeatureEnabled('enableEmailNotifications'))) {
    logger.debug('Email disabled via feature flag — skipping raw send');
    return {
      messageId: 'flag-disabled',
      accepted: [],
      rejected: [options.to],
      response: 'disabled',
    };
  }
  if (env.NODE_ENV === 'test') {
    logger.info(`[TEST] Raw email to ${options.to}: ${options.subject}`);
    return { messageId: 'test-id', accepted: [options.to], rejected: [], response: 'test' };
  }

  const fromName = options.fromName || env.SMTP_FROM_NAME;
  const fromEmail = options.fromEmail || env.EMAIL_FROM;
  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    replyTo: options.replyTo || env.EMAIL_REPLY_TO || fromEmail,
    subject: options.subject,
    text: options.text,
    html: options.html,
    headers: options.headers,
    ...(options.messageId ? { messageId: options.messageId } : {}),
    ...(options.envelopeFrom ? { envelope: { from: options.envelopeFrom, to: options.to } } : {}),
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
  });

  return {
    messageId: info.messageId,
    accepted: (info.accepted as string[]) || [],
    rejected: (info.rejected as string[]) || [],
    response: info.response || '',
  };
};

/**
 * Verify transporter connection
 */
export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    if (env.NODE_ENV === 'test') return true;
    await transporter.verify();
    logger.info('Email service connected');
    return true;
  } catch (error) {
    logger.error('Email service connection failed:', error);
    return false;
  }
};

export const emailService = {
  sendEmail,
  verifyEmailConnection,
};
