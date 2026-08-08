import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  signature,
  infoBox,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

// ===============================
// Contact Form Email Template
// ===============================

/**
 * Contact form submission notification sent to the support team.
 */
export const contactFormSubmission = (
  name: string,
  email: string,
  subject: string,
  message: string,
  messageId: string
): EmailTemplate => ({
  subject: `[Contact Form] ${subject} — from ${name}`,
  html: emailLayout(
    `
        ${iconCircle('&#128233;', '#eef2ff')}
        ${heading('New Contact Form Submission')}
        ${subtitle(`${name} has submitted a message via the contact form.`)}
        ${infoBox([
          { label: 'Name', value: name },
          {
            label: 'Email',
            value: `<a href="mailto:${email}" style="color:${BRAND.primary};">${email}</a>`,
          },
          { label: 'Subject', value: subject },
        ])}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
          <tr>
            <td style="padding:16px 20px;background-color:${BRAND.bgMuted};border-radius:10px;border-left:3px solid ${BRAND.primary};">
              <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;white-space:pre-wrap;">${message.replace(/\n/g, '<br />')}</p>
            </td>
          </tr>
        </table>
        ${divider()}
        ${smallText(`Message ID: ${messageId}`)}
        ${paragraph(`Reply directly to <a href="mailto:${email}" style="color:${BRAND.primary};font-weight:500;">${email}</a> to respond.`)}
        ${signature()}
    `,
    `New contact form submission from ${name}: ${subject}`
  ),
  text: `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}\n\nMessage ID: ${messageId}`,
});
