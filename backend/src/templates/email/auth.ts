import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  otpBlock,
  infoBox,
  warningBox,
  dangerBox,
  iconCircle,
  smallText,
  divider,
  BRAND,
} from './_layout';

export const welcomeEmail = (name: string): EmailTemplate => ({
  subject: "Welcome to Hire Adda — Let's Get Started",
  html: emailLayout(
    `
        ${iconCircle('&#127881;', '#eef2ff')}
        ${heading('Welcome to Hire Adda!')}
        ${subtitle('Your journey to the perfect career match starts here.')}
        ${greeting(name)}
        ${paragraph("Thank you for joining Hire Adda. We're a platform that connects talented professionals with outstanding companies, and we're thrilled to have you on board.")}
        ${paragraph("Here's how to make the most of your account:")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;">
          <tr>
            <td style="padding:12px 0;font-size:15px;color:#374151;line-height:1.7;">
              <strong style="color:${BRAND.primary};">1.</strong>&nbsp;&nbsp;Complete your profile to stand out to recruiters<br>
              <strong style="color:${BRAND.primary};">2.</strong>&nbsp;&nbsp;Set your job preferences and alert criteria<br>
              <strong style="color:${BRAND.primary};">3.</strong>&nbsp;&nbsp;Upload your resume for AI-powered matching<br>
              <strong style="color:${BRAND.primary};">4.</strong>&nbsp;&nbsp;Explore curated job recommendations
            </td>
          </tr>
        </table>
        ${button('Complete Your Profile', `${BRAND.url}/profile`)}
        ${divider()}
        ${smallText('Candidates with complete profiles receive up to 5x more interview invitations.')}
        ${signature()}
    `,
    `Welcome to Hire Adda, ${name}! Complete your profile to get started.`
  ),
  text: `Welcome to Hire Adda, ${name}! Thank you for joining. Complete your profile to get started: ${BRAND.url}/profile`,
});

export const verifyEmail = (otp: string): EmailTemplate => ({
  subject: 'Verify Your Email Address — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#9993;', '#eef2ff')}
        ${heading('Verify Your Email')}
        ${subtitle('Enter the code below or click the button to verify your email.')}
        ${paragraph('Your 6-digit verification code:')}
        ${otpBlock(otp)}
        ${smallText('Tap the code to select it, then copy.')}
        ${button('Verify My Email', `${BRAND.url}/auth/verify-email?token=${otp}`)}
        ${warningBox('This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.')}
        ${paragraph('If you did not create an account on Hire Adda, you can safely ignore this email.')}
        ${signature()}
    `,
    `Your Hire Adda verification code is ${otp}`
  ),
  text: `Your Hire Adda email verification code is: ${otp}. Or verify directly: ${BRAND.url}/auth/verify-email?token=${otp}. This code is valid for 10 minutes. Do not share this code with anyone.`,
});

export const passwordReset = (resetLink: string): EmailTemplate => ({
  subject: 'Reset Your Password — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128274;', '#fef3c7')}
        ${heading('Reset Your Password')}
        ${subtitle('We received a request to reset your password.')}
        ${paragraph('Click the button below to set a new password for your account. This link is valid for <strong>1 hour</strong>.')}
        ${button('Reset Password', resetLink)}
        ${warningBox('If you did not request a password reset, please ignore this email or <a href="mailto:' + BRAND.supportEmail + '" style="color:#92400e;font-weight:600;">contact support</a> if you believe your account may be compromised.')}
        ${divider()}
        ${smallText("If the button above doesn't work, copy and paste this link into your browser:")}
        ${smallText(`<a href="${resetLink}" style="color:${BRAND.primary};word-break:break-all;">${resetLink}</a>`)}
        ${signature()}
    `,
    'Reset your Hire Adda password. This link is valid for 1 hour.'
  ),
  text: `Reset your Hire Adda password using this link: ${resetLink}. This link is valid for 1 hour. If you didn't request this, please ignore this email.`,
});

export const loginAlert = (time: string, ip: string, userAgent?: string): EmailTemplate => ({
  subject: 'New Sign-In Detected — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128272;', '#eef2ff')}
        ${heading('New Sign-In Detected')}
        ${subtitle('We noticed a new sign-in to your Hire Adda account.')}
        ${infoBox([
          { label: 'Date & Time', value: time },
          { label: 'IP Address', value: ip },
          ...(userAgent ? [{ label: 'Device', value: userAgent }] : []),
        ])}
        ${paragraph('If this was you, no action is needed.')}
        ${dangerBox("If you don't recognize this activity, <strong>change your password immediately</strong> and enable two-factor authentication to secure your account.")}
        ${button('Review Account Security', `${BRAND.url}/settings/security`)}
        ${signature()}
    `,
    `New sign-in to your Hire Adda account from ${ip} on ${time}`
  ),
  text: `New sign-in detected on your Hire Adda account. Time: ${time}, IP: ${ip}${userAgent ? `, Device: ${userAgent}` : ''}. If this wasn't you, change your password immediately at ${BRAND.url}/settings/security`,
});

export const accountDeletionRequested = (name: string): EmailTemplate => ({
  subject: 'Account Deletion Requested — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128465;', BRAND.warningLight)}
        ${heading('Account Deletion Requested')}
        ${greeting(name)}
        ${paragraph('We received a request to delete your Hire Adda account.')}
        ${warningBox('Your account and all associated data will be permanently deleted after <strong>30 days</strong>.')}
        ${paragraph('To cancel this request, simply log in to your account before the deletion date.')}
        ${paragraph('If you did not request this, please sign in immediately and contact our support team.')}
        ${button('Sign In to Cancel', `${BRAND.url}/auth/login`)}
        ${signature()}
    `,
    'Your account deletion request has been received.'
  ),
  text: `Hi ${name}, we received a request to delete your Hire Adda account. Your account will be permanently deleted after 30 days. To cancel, log in before the deletion date. If you did not request this, sign in immediately.`,
});

export const accountDeactivated = (name: string): EmailTemplate => ({
  subject: 'Your Account Has Been Deactivated — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#9888;', BRAND.errorLight)}
        ${heading('Account Deactivated')}
        ${greeting(name)}
        ${paragraph('Your Hire Adda account has been deactivated. You will no longer be able to sign in or access your profile.')}
        ${paragraph("If you believe this was done in error, please contact our support team and we'll be happy to assist you.")}
        ${button('Contact Support', `mailto:${BRAND.supportEmail}`)}
        ${signature()}
    `,
    'Your Hire Adda account has been deactivated.'
  ),
  text: `Hi ${name}, your Hire Adda account has been deactivated. If you believe this was done in error, contact support at ${BRAND.supportEmail}.`,
});

export const accountSuspended = (name: string, reason?: string): EmailTemplate => ({
  subject: 'Your Account Has Been Suspended — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128683;', BRAND.warningLight)}
        ${heading('Account Suspended')}
        ${greeting(name)}
        ${paragraph('Your Hire Adda account has been temporarily suspended.')}
        ${reason ? warningBox(`<strong>Reason:</strong> ${reason}`) : ''}
        ${paragraph('During the suspension period, you will not be able to sign in or access platform features. Your data remains safe and intact.')}
        ${paragraph('If you have questions about this action or wish to appeal, please reach out to our support team.')}
        ${button('Contact Support', `mailto:${BRAND.supportEmail}`)}
        ${signature()}
    `,
    'Your Hire Adda account has been suspended.'
  ),
  text: `Hi ${name}, your Hire Adda account has been suspended.${reason ? ` Reason: ${reason}.` : ''} Contact support at ${BRAND.supportEmail} for assistance.`,
});

export const accountReactivated = (name: string): EmailTemplate => ({
  subject: 'Your Account Has Been Reactivated — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#9989;', BRAND.successLight)}
        ${heading('Account Reactivated')}
        ${greeting(name)}
        ${paragraph('Great news! Your Hire Adda account has been reactivated. You can now sign in and access all platform features.')}
        ${paragraph('We recommend reviewing your profile and updating any information that may have changed.')}
        ${button('Sign In to Your Account', `${BRAND.url}/auth/login`)}
        ${signature()}
    `,
    'Your Hire Adda account has been reactivated!'
  ),
  text: `Hi ${name}, your Hire Adda account has been reactivated. You can now sign in at ${BRAND.url}/auth/login.`,
});

export const passwordResetOtp = (otp: string): EmailTemplate => ({
  subject: 'Password Reset Code — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128274;', '#fef3c7')}
        ${heading('Password Reset Code')}
        ${subtitle('Use this code to reset your password.')}
        ${paragraph('You requested a password reset. Enter the code below to set a new password:')}
        ${otpBlock(otp)}
        ${warningBox('This code expires in <strong>15 minutes</strong>. Do not share this code with anyone.')}
        ${paragraph('If you did not request a password reset, you can safely ignore this email. Your password will not be changed.')}
        ${signature()}
    `,
    `Your Hire Adda password reset code is ${otp}`
  ),
  text: `Your Hire Adda password reset code is: ${otp}. This code is valid for 15 minutes. If you didn't request this, ignore this email.`,
});

export const changePasswordOtp = (otp: string): EmailTemplate => ({
  subject: 'Confirm Password Change — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128272;', '#eef2ff')}
        ${heading('Confirm Password Change')}
        ${subtitle('Enter this code to confirm your password change.')}
        ${paragraph('You initiated a password change on your Hire Adda account. Use the code below to confirm:')}
        ${otpBlock(otp)}
        ${warningBox('This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.')}
        ${paragraph('If you did not request this change, please secure your account immediately by resetting your password.')}
        ${button('Review Account Security', `${BRAND.url}/settings/security`)}
        ${signature()}
    `,
    `Your Hire Adda password change confirmation code is ${otp}`
  ),
  text: `Your Hire Adda password change code is: ${otp}. This code is valid for 10 minutes. If you didn't request this, secure your account immediately.`,
});
