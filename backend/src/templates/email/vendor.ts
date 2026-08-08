import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  smallText,
  iconCircle,
} from './_layout';

// Local helper: renders a quoted-block — doing it inline avoids overloading
// `infoBox` (which is structured `{label, value}` pairs).
const quoteBlock = (text: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
  <tr>
    <td style="padding:14px 18px;background-color:#f0fdf4;border-radius:10px;border-left:4px solid #10B981;">
      <p style="margin:0;font-size:14px;color:#065F46;line-height:1.65;font-style:italic;">${text}</p>
    </td>
  </tr>
</table>`;

/**
 * Vendor-side notification — sent when an employer sends a hiring lead
 * via the public vendor directory. The recipient is another employer
 * with the Vendor Connect add-on; they click through to the vendor lead
 * inbox in their employer account (/employer/vendor/leads) to respond.
 */
export const vendorNewLeadEmail = (args: {
  recipientName?: string;
  employerName?: string;
  jobTitle?: string;
  requirementPreview: string;
  inboxUrl: string;
}): EmailTemplate => {
  const preview =
    args.requirementPreview.length > 220
      ? args.requirementPreview.slice(0, 217) + '...'
      : args.requirementPreview;

  return {
    subject: `New hiring lead${args.jobTitle ? ` — ${args.jobTitle}` : ''} on Hire Adda`,
    html: emailLayout(`
      ${iconCircle('&#128231;', '#ecfdf5')}
      ${heading('New hiring lead')}
      ${subtitle(args.jobTitle ?? 'An employer is looking for your help.')}
      ${greeting(args.recipientName ?? 'there')}
      ${paragraph(
        args.employerName
          ? `<strong>${args.employerName}</strong> has sent you a new hiring lead via your Hire Adda vendor profile.`
          : 'You have a new hiring lead waiting in the vendor lead inbox of your Hire Adda employer account.'
      )}
      ${quoteBlock(`"${preview}"`)}
      ${button('Open lead inbox', args.inboxUrl)}
      ${smallText('Tip: respond within 24 hours — fast vendors see 3× higher conversion.')}
      ${signature()}
    `),
    text: `New hiring lead${args.jobTitle ? ` for ${args.jobTitle}` : ''} on Hire Adda. Open your inbox: ${args.inboxUrl}`,
  };
};
