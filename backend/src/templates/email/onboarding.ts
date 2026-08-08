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
  successBox,
  dangerBox,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

export const profileCompletionReminder = (name: string, progress: number): EmailTemplate => {
  const remaining = 100 - progress;
  const progressBarFill = Math.min(Math.max(progress, 0), 100);

  return {
    subject: `Your Profile is ${progress}% Complete — Finish It Today`,
    html: emailLayout(
      `
            ${iconCircle('&#128100;', '#eef2ff')}
            ${heading('Complete Your Profile')}
            ${subtitle(`You're ${remaining}% away from a fully optimized profile.`)}
            ${greeting(name)}
            ${paragraph("Candidates with 100% complete profiles get <strong>up to 5x more interview invitations</strong>. Don't miss out on opportunities!")}

            <!-- Progress Bar -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
              <tr>
                <td>
                  <div style="background-color:#e5e7eb;border-radius:20px;height:12px;overflow:hidden;">
                    <div style="background-color:${progress >= 80 ? BRAND.success : progress >= 50 ? BRAND.warning : BRAND.primary};width:${progressBarFill}%;height:12px;border-radius:20px;"></div>
                  </div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                    <tr>
                      <td style="font-size:14px;font-weight:700;color:${BRAND.text};">${progress}% Complete</td>
                      <td align="right" style="font-size:13px;color:${BRAND.textMuted};">${remaining}% remaining</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${paragraph('Here are some things you can add to boost your profile:')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
              <tr>
                <td style="padding:8px 0;font-size:15px;color:#374151;line-height:1.8;">
                  &bull;&nbsp;&nbsp;Professional summary and headline<br>
                  &bull;&nbsp;&nbsp;Work experience and achievements<br>
                  &bull;&nbsp;&nbsp;Skills, certifications, and education<br>
                  &bull;&nbsp;&nbsp;Upload a professional photo and resume
                </td>
              </tr>
            </table>
            ${button('Complete Your Profile', `${BRAND.url}/profile`)}
            ${divider()}
            ${smallText('You\'re receiving this because your Hire Adda profile is incomplete. <a href="' + BRAND.url + '/settings/notifications" style="color:' + BRAND.textSecondary + ';text-decoration:underline;">Manage email preferences</a>')}
            ${signature()}
        `,
      `Your Hire Adda profile is ${progress}% complete. Finish it to get 5x more interviews.`
    ),
    text: `Hi ${name}, your profile is ${progress}% complete. Candidates with complete profiles get 5x more interview calls. Complete it now: ${BRAND.url}/profile`,
  };
};

export const documentVerificationStatus = (
  docName: string,
  status: 'approved' | 'rejected',
  reason?: string
): EmailTemplate => {
  const isApproved = status === 'approved';

  return {
    subject: `Document ${isApproved ? 'Approved' : 'Requires Attention'}: ${docName}`,
    html: emailLayout(
      `
            ${iconCircle(isApproved ? '&#9989;' : '&#9888;', isApproved ? BRAND.successLight : BRAND.warningLight)}
            ${heading(isApproved ? 'Document Approved' : 'Document Requires Attention')}
            ${subtitle(`Verification update for: ${docName}`)}

            ${
              isApproved
                ? successBox(
                    `Your document <strong>${docName}</strong> has been successfully verified and approved. No further action is required.`
                  )
                : dangerBox(
                    `Your document <strong>${docName}</strong> could not be verified.${reason ? ` <strong>Reason:</strong> ${reason}` : ''}`
                  )
            }

            ${!isApproved ? paragraph('Please upload a new version of this document to continue with the verification process. Ensure the document is:') : ''}
            ${
              !isApproved
                ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
              <tr>
                <td style="padding:8px 0;font-size:15px;color:#374151;line-height:1.8;">
                  &bull;&nbsp;&nbsp;Clear and fully legible<br>
                  &bull;&nbsp;&nbsp;Not expired or outdated<br>
                  &bull;&nbsp;&nbsp;In PDF, JPG, or PNG format
                </td>
              </tr>
            </table>`
                : ''
            }
            ${!isApproved ? button('Re-upload Document', `${BRAND.url}/profile/documents`) : ''}
            ${isApproved ? button('View Your Profile', `${BRAND.url}/profile`) : ''}
            ${signature()}
        `,
      `Your document ${docName} has been ${status}.`
    ),
    text: `Your document ${docName} has been ${status}.${reason ? ` Reason: ${reason}.` : ''} ${!isApproved ? `Please re-upload at ${BRAND.url}/profile/documents` : ''}`,
  };
};

/**
 * Verification request submitted notification.
 */
export const verificationSubmitted = (
  firstName: string | null,
  verificationType: string
): EmailTemplate => {
  const name = firstName || 'there';
  const typeLabel = verificationType.toLowerCase();

  return {
    subject: `Verification Request Submitted — ${verificationType}`,
    html: emailLayout(
      `
          ${iconCircle('&#128196;', '#eef2ff')}
          ${heading('Verification Request Submitted')}
          ${subtitle('Your request is now under review.')}
          ${greeting(name)}
          ${paragraph(`Your <strong>${typeLabel}</strong> verification request has been submitted and is now under review.`)}
          ${infoBox([
            { label: 'Verification Type', value: verificationType },
            { label: 'Status', value: 'Under Review' },
            { label: 'Estimated Time', value: '1–2 business days' },
          ])}
          ${paragraph("We'll notify you once the review is complete.")}
          ${button('Check Status', `${BRAND.url}/candidate/verification`)}
          ${signature()}
      `,
      `Your ${typeLabel} verification request has been submitted.`
    ),
    text: `Hi ${name}, your ${typeLabel} verification request has been submitted and is under review. We'll notify you once the review is complete. Check status: ${BRAND.url}/candidate/verification`,
  };
};

export const onboardingWelcomeEmployer = (name: string, companyName: string): EmailTemplate => ({
  subject: `Set Up Your Company Profile — ${companyName}`,
  html: emailLayout(
    `
        ${iconCircle('&#127970;', '#eef2ff')}
        ${heading('Welcome, Employer!')}
        ${subtitle(`Let's set up ${companyName} on Hire Adda.`)}
        ${greeting(name)}
        ${paragraph(`Thanks for registering <strong>${companyName}</strong> on Hire Adda. To start attracting top talent, we recommend completing these steps:`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;">
          <tr>
            <td style="padding:8px 0;font-size:15px;color:#374151;line-height:1.8;">
              <strong style="color:${BRAND.primary};">1.</strong>&nbsp;&nbsp;Add your company description and logo<br>
              <strong style="color:${BRAND.primary};">2.</strong>&nbsp;&nbsp;Set up your industry and company size<br>
              <strong style="color:${BRAND.primary};">3.</strong>&nbsp;&nbsp;Post your first job opening<br>
              <strong style="color:${BRAND.primary};">4.</strong>&nbsp;&nbsp;Configure notification preferences
            </td>
          </tr>
        </table>
        ${paragraph('Companies with complete profiles receive <strong>2x more applications</strong> from qualified candidates.')}
        ${button('Set Up Company Profile', `${BRAND.url}/employer/onboarding`)}
        ${signature()}
    `,
    `Set up ${companyName} on Hire Adda to start hiring.`
  ),
  text: `Hi ${name}, set up ${companyName} on Hire Adda to start attracting talent: ${BRAND.url}/employer/onboarding`,
});
