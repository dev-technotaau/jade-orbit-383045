import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  infoBox,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

export const employmentVerificationRequest = (
  contactName: string,
  candidateName: string,
  companyName: string,
  role: string,
  employmentPeriod: string,
  confirmUrl: string,
  denyUrl: string
): EmailTemplate => ({
  subject: `Employment Verification Request for ${candidateName}`,
  html: emailLayout(
    `
        ${iconCircle('&#128221;', BRAND.warningLight)}
        ${heading('Employment Verification Request')}
        ${subtitle(`We need your help verifying a former employee's work history.`)}
        ${greeting(contactName)}
        ${paragraph(`<strong>${candidateName}</strong> has listed employment at <strong>${companyName}</strong> on their profile at Hire Adda. We would appreciate your help in confirming the following details:`)}
        ${infoBox([
          { label: 'Candidate', value: candidateName },
          { label: 'Company', value: companyName },
          { label: 'Role', value: role },
          { label: 'Period', value: employmentPeriod },
        ])}
        ${paragraph('Please use one of the buttons below to confirm or deny this employment record:')}
        ${button('Confirm Employment', confirmUrl)}
        <div style="text-align: center; margin: 12px 0;">
            <a href="${denyUrl}" style="color: ${BRAND.error}; text-decoration: underline; font-size: 14px;">Deny / Report Inaccuracy</a>
        </div>
        ${divider()}
        ${smallText('This verification request was sent by Hire Adda on behalf of an employer. If you did not expect this email or believe it was sent in error, please ignore it or contact us at ' + BRAND.supportEmail + '.')}
        ${signature()}
    `,
    `Employment verification request for ${candidateName} at ${companyName}`
  ),
  text: `Hi ${contactName}, we need your help verifying employment for ${candidateName} at ${companyName} (${role}, ${employmentPeriod}). Please visit ${confirmUrl} to confirm or ${denyUrl} to deny.`,
});
