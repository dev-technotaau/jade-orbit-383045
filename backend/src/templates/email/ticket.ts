import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  signature,
  button,
  infoBox,
  dangerBox,
  iconCircle,
  BRAND,
} from './_layout';

// ===============================
// Support Ticket Email Templates
// ===============================

/**
 * Ticket confirmation sent to the user who submitted a ticket.
 */
export const ticketConfirmation = (
  ticketNumber: string,
  subject: string,
  helpPath?: string
): EmailTemplate => ({
  subject: `Ticket Created: ${ticketNumber}`,
  html: emailLayout(
    `
        ${iconCircle('&#127915;', '#eef2ff')}
        ${heading("We've Received Your Support Ticket")}
        ${subtitle('Our team will review your request shortly.')}
        ${paragraph('Hello,')}
        ${paragraph('Thank you for contacting Hire Adda support. We have successfully received your ticket and our team will review it shortly.')}
        ${infoBox([
          { label: 'Ticket Number', value: ticketNumber },
          { label: 'Subject', value: subject },
        ])}
        ${paragraph('Our support team typically responds within <strong>24 hours</strong> during business days. You will be notified via email and in-app notification when we reply.')}
        ${helpPath ? button('View Your Tickets', `${BRAND.url}/${helpPath}/help`) : ''}
        ${signature()}
    `,
    `Support ticket ${ticketNumber} has been created.`
  ),
  text: `We've received your support ticket ${ticketNumber}: ${subject}. Our team typically responds within 24 hours.${helpPath ? ` View your tickets: ${BRAND.url}/${helpPath}/help` : ''}`,
});

/**
 * New ticket notification sent to admin(s).
 */
export const ticketNewAdmin = (
  ticketNumber: string,
  subject: string,
  senderName: string,
  roleLabel: string,
  ticketId: string
): EmailTemplate => ({
  subject: `[New Ticket] ${ticketNumber}: ${subject}`,
  html: emailLayout(
    `
        ${iconCircle('&#128232;', '#eef2ff')}
        ${heading('New Support Ticket')}
        ${subtitle('A new ticket has been submitted and needs attention.')}
        ${infoBox([
          { label: 'Ticket', value: ticketNumber },
          { label: 'From', value: `${senderName}${roleLabel}` },
          { label: 'Subject', value: subject },
        ])}
        ${button('View Ticket', `${BRAND.url}/admin/tickets/${ticketId}`)}
        ${signature()}
    `,
    `New support ticket ${ticketNumber} from ${senderName}`
  ),
  text: `New support ticket ${ticketNumber} from ${senderName}${roleLabel}: ${subject}. View: ${BRAND.url}/admin/tickets/${ticketId}`,
});

/**
 * Reply notification sent to admin(s) when a user replies.
 */
export const ticketReplyAdmin = (
  ticketNumber: string,
  subject: string,
  senderName: string,
  messageBody: string,
  ticketId: string
): EmailTemplate => ({
  subject: `[Reply] ${ticketNumber}: ${subject}`,
  html: emailLayout(
    `
        ${iconCircle('&#128172;', '#eef2ff')}
        ${heading(`New Reply on ${ticketNumber}`)}
        ${subtitle(`${senderName} has responded.`)}
        ${infoBox([
          { label: 'From', value: senderName },
          { label: 'Ticket', value: `${ticketNumber}: ${subject}` },
        ])}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
          <tr>
            <td style="padding:16px 20px;background-color:${BRAND.bgMuted};border-radius:10px;border-left:3px solid ${BRAND.primary};">
              <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;white-space:pre-wrap;">${messageBody.replace(/\n/g, '<br />')}</p>
            </td>
          </tr>
        </table>
        ${button('View Ticket', `${BRAND.url}/admin/tickets/${ticketId}`)}
        ${signature()}
    `,
    `${senderName} replied on ticket ${ticketNumber}`
  ),
  text: `${senderName} replied on ${ticketNumber}: ${subject}.\n\n${messageBody}\n\nView: ${BRAND.url}/admin/tickets/${ticketId}`,
});

/**
 * Reply notification sent to a registered user when support replies.
 */
export const ticketReplyUser = (
  ticketNumber: string,
  subject: string,
  messageBody: string,
  helpPath: string,
  ticketId: string,
  replySubject?: string
): EmailTemplate => ({
  subject: replySubject || `Re: ${subject}`,
  html: emailLayout(
    `
        ${iconCircle('&#128172;', '#ecfdf5')}
        ${heading(`Your ticket ${ticketNumber} received a reply`)}
        ${replySubject ? subtitle(`Re: ${replySubject}`) : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
          <tr>
            <td style="padding:16px 20px;background-color:${BRAND.bgMuted};border-radius:10px;border-left:3px solid ${BRAND.success};">
              <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;">${messageBody}</p>
            </td>
          </tr>
        </table>
        ${button('View Ticket', `${BRAND.url}/${helpPath}/help/${ticketId}`)}
        ${signature()}
    `,
    `Support replied to your ticket ${ticketNumber}`
  ),
  text: `Your ticket ${ticketNumber} received a reply.\n\n${messageBody.replace(/<[^>]*>/g, '')}\n\nView: ${BRAND.url}/${helpPath}/help/${ticketId}`,
});

/**
 * Reply notification sent to a guest (email only, no account link).
 */
export const ticketReplyGuest = (
  ticketNumber: string,
  subject: string,
  messageBody: string,
  replySubject?: string
): EmailTemplate => ({
  subject: replySubject || `Re: ${subject}`,
  html: emailLayout(
    `
        ${iconCircle('&#128172;', '#ecfdf5')}
        ${heading(`Reply to your support ticket ${ticketNumber}`)}
        ${replySubject ? subtitle(`Re: ${replySubject}`) : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
          <tr>
            <td style="padding:16px 20px;background-color:${BRAND.bgMuted};border-radius:10px;border-left:3px solid ${BRAND.success};">
              <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;">${messageBody}</p>
            </td>
          </tr>
        </table>
        ${paragraph('You can reply to this ticket by visiting our contact page.')}
        ${button('Contact Us', `${BRAND.url}/contact`)}
        ${signature()}
    `,
    `Support replied to your ticket ${ticketNumber}`
  ),
  text: `Reply to your support ticket ${ticketNumber}.\n\n${messageBody.replace(/<[^>]*>/g, '')}\n\nYou can reply by visiting our contact page.`,
});

/**
 * Ticket status change notification sent to the user.
 */
export const ticketStatusChange = (
  ticketNumber: string,
  subject: string,
  statusLabel: string,
  helpPath: string,
  ticketId: string,
  extraMessage?: string
): EmailTemplate => ({
  subject: `[${statusLabel}] ${ticketNumber}: ${subject}`,
  html: emailLayout(
    `
        ${iconCircle(statusLabel === 'resolved' ? '&#9989;' : '&#128196;', statusLabel === 'resolved' ? BRAND.successLight : '#eef2ff')}
        ${heading(`Ticket ${ticketNumber} — ${statusLabel}`)}
        ${paragraph(`Your ticket "<strong>${subject}</strong>" has been marked as <strong>${statusLabel}</strong>.${extraMessage || ''}`)}
        ${infoBox([
          { label: 'Ticket', value: ticketNumber },
          { label: 'Subject', value: subject },
          { label: 'Status', value: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) },
        ])}
        ${button('View Ticket', `${BRAND.url}/${helpPath}/help/${ticketId}`)}
        ${signature()}
    `,
    `Your ticket ${ticketNumber} is now ${statusLabel}`
  ),
  text: `Your ticket ${ticketNumber} "${subject}" has been marked as ${statusLabel}.${extraMessage || ''} View: ${BRAND.url}/${helpPath}/help/${ticketId}`,
});

/**
 * Escalation notification sent to super admin(s) when user rates "Not Satisfied".
 */
export const ticketEscalation = (
  ticketNumber: string,
  subject: string,
  ticketId: string
): EmailTemplate => ({
  subject: `[ESCALATION] ${ticketNumber}: Not Satisfied`,
  html: emailLayout(
    `
        ${iconCircle('&#9888;', BRAND.errorLight)}
        ${heading('Ticket Escalation')}
        ${subtitle('A user has rated their support experience as Not Satisfied.')}
        ${dangerBox(`A user has rated ticket <strong>${ticketNumber}</strong> as <strong>Not Satisfied</strong>. The ticket has been automatically reopened and requires immediate attention.`)}
        ${infoBox([
          { label: 'Ticket', value: ticketNumber },
          { label: 'Subject', value: subject },
          { label: 'Action Required', value: 'Reopened — needs review' },
        ])}
        ${button('View Ticket', `${BRAND.url}/admin/tickets/${ticketId}`)}
        ${signature()}
    `,
    `Ticket ${ticketNumber} escalated — user rated Not Satisfied`
  ),
  text: `ESCALATION: User rated ticket ${ticketNumber} as Not Satisfied. Subject: ${subject}. The ticket has been automatically reopened. View: ${BRAND.url}/admin/tickets/${ticketId}`,
});
