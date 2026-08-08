import type { WhatsappTemplate } from '../../types/notification-templates';

/**
 * Meta dynamic URL buttons are configured as `https://hireadda.in/{{1}}` — the
 * button variable is the PATH SUFFIX, not the full URL. Callers pass absolute
 * app URLs, so strip the origin (and leading slash) down to the suffix Meta
 * expects (falls back to a best-effort strip for non-absolute inputs).
 */
/**
 * Make a value safe to pass as a WhatsApp template parameter.
 *
 * Meta rejects the whole send if a parameter contains a newline, a tab, or
 * four or more consecutive spaces — job titles pasted from a JD routinely
 * carry all three, so any variable built from user content must go through
 * this or the message silently fails to deliver.
 */
function oneLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function urlPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname.replace(/^\//, '')}${u.search}${u.hash}`;
  } catch {
    return url.replace(/^https?:\/\/[^/]+\//, '');
  }
}

// ===============================
// Authentication & Onboarding
// ===============================

export const welcomeWhatsapp = (name: string): WhatsappTemplate => ({
  templateName: 'welcome_message',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [{ type: 'text', text: name }],
    },
  ],
  text: `Welcome to Hire Adda, ${name}! We're excited to help you find your perfect career match. Complete your profile to get started.`,
});

export const otpWhatsapp = (otp: string): WhatsappTemplate => ({
  templateName: 'auth_otp',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [{ type: 'text', text: otp }],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    },
  ],
  text: `Your Hire Adda verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
});

export const profileCompletionWhatsapp = (name: string, progress: number): WhatsappTemplate => ({
  templateName: 'profile_completion',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name },
        { type: 'text', text: `${progress}%` },
      ],
    },
  ],
  text: `Hi ${name}, your Hire Adda profile is ${progress}% complete. Complete it to get up to 5x more interview invitations!`,
});

// ===============================
// Jobs & Applications
// ===============================

export const jobAlertWhatsapp = (
  jobTitle: string,
  company: string,
  link: string
): WhatsappTemplate => ({
  templateName: 'job_alert',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: company },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(link) }],
    },
  ],
  text: `New job match: ${jobTitle} at ${company}. Apply now: ${link}`,
});

export const interviewWhatsapp = (
  jobTitle: string,
  date: string,
  link: string
): WhatsappTemplate => ({
  templateName: 'interview_invite',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: date },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(link) }],
    },
  ],
  text: `Interview scheduled for ${jobTitle} on ${date}. Join here: ${link}`,
});

export const applicationStatusWhatsapp = (
  status: string,
  company: string,
  jobTitle: string
): WhatsappTemplate => ({
  templateName: 'application_status_update',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: company },
        { type: 'text', text: status },
      ],
    },
  ],
  text: `Your application for ${jobTitle} at ${company} has been updated to: ${status}. Open Hire Adda for details.`,
});

export const jobOfferWhatsapp = (
  jobTitle: string,
  company: string,
  link: string
): WhatsappTemplate => ({
  templateName: 'job_offer',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: company },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(link) }],
    },
  ],
  text: `Congratulations! You've received an offer for ${jobTitle} at ${company}. View details: ${link}`,
});

export const jobMatchWhatsapp = (
  jobTitle: string,
  companyName: string,
  matchPercentage: string
): WhatsappTemplate => ({
  templateName: 'job_match',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: companyName },
        { type: 'text', text: matchPercentage },
      ],
    },
  ],
  text: `New job match: ${jobTitle} at ${companyName} — ${matchPercentage} match. View details on Hire Adda.`,
});

/**
 * Batched job-match digest — ONE message covering every new match.
 *
 * Replaces the per-job `job_match` send on the candidate-side matcher. A
 * candidate whose profile matched 100 open roles received 100 separate
 * WhatsApp messages (and 100 emails) in a single burst, which is both a
 * terrible experience and a fast route to being blocked by Meta for
 * unsolicited volume.
 *
 * ── Why the list is one comma-separated variable ──
 * WhatsApp rejects parameter values containing newlines, tabs, or 4+
 * consecutive spaces, so a multi-line bulleted list is impossible inside a
 * template variable. The top picks are therefore flattened onto one line by
 * `oneLine()`, and the full list lives behind the URL button.
 */
export const jobMatchDigestWhatsapp = (
  name: string,
  totalCount: number,
  topJobs: Array<{ title: string; company: string }>,
  link: string
): WhatsappTemplate => {
  const list = oneLine(topJobs.map((j) => `${j.title} at ${j.company}`).join('; '));
  return {
    templateName: 'job_match_digest',
    languageCode: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: oneLine(name) },
          { type: 'text', text: String(totalCount) },
          { type: 'text', text: list },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: urlPath(link) }],
      },
    ],
    text: `Hi ${name}, we found ${totalCount} new job(s) matching your profile. Top picks: ${list}. See all: ${link}`,
  };
};

// ===============================
// Support
// ===============================

export const ticketReplyWhatsapp = (ticketNumber: string, subject: string): WhatsappTemplate => ({
  templateName: 'ticket_reply',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: ticketNumber },
        { type: 'text', text: subject },
      ],
    },
  ],
  text: `You have a new reply on your support ticket #${ticketNumber}: ${subject}. Open Hire Adda to view.`,
});

// ===============================
// Admin
// ===============================

export const adminAlertWhatsapp = (message: string): WhatsappTemplate => ({
  templateName: 'admin_alert',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [{ type: 'text', text: message }],
    },
  ],
  text: `${message}. Please review in the admin dashboard.`,
});

// ===============================
// Documents & Verification
// ===============================

export const documentRequestWhatsapp = (docName: string, link: string): WhatsappTemplate => ({
  templateName: 'document_request',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [{ type: 'text', text: docName }],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(link) }],
    },
  ],
  text: `Action required: Please upload your ${docName} to continue your verification. Upload here: ${link}`,
});

// ===============================
// Applications (Employer & Candidate)
// ===============================

export const newApplicationWhatsapp = (
  candidateName: string,
  jobTitle: string
): WhatsappTemplate => ({
  templateName: 'new_application',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: candidateName },
        { type: 'text', text: jobTitle },
      ],
    },
  ],
  text: `New application: ${candidateName} applied for ${jobTitle}. Review on Hire Adda.`,
});

export const applicationSubmittedWhatsapp = (
  jobTitle: string,
  companyName: string
): WhatsappTemplate => ({
  templateName: 'application_submitted',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: jobTitle },
        { type: 'text', text: companyName },
      ],
    },
  ],
  text: `Your application for ${jobTitle} at ${companyName} has been submitted. Track it on Hire Adda.`,
});

// ===============================
// Security
// ===============================

export const securityAlertWhatsapp = (action: string): WhatsappTemplate => ({
  templateName: 'security_alert',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [{ type: 'text', text: action }],
    },
  ],
  text: `Security alert: ${action} was detected on your Hire Adda account. If this wasn't you, secure your account immediately.`,
});

// ===============================
// Billing / Payments
// ===============================

const inrWa = (paise: number): string => `Rs.${(paise / 100).toFixed(2)}`;

export const orderPlacedWhatsapp = (
  planName: string,
  amountPaise: number,
  payUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_order_placed',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: inrWa(amountPaise) },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(payUrl) }],
    },
  ],
  text: `Order created — ${planName} (${inrWa(amountPaise)}). Complete payment: ${payUrl}`,
});

export const paymentSuccessWhatsapp = (
  planName: string,
  amountPaise: number,
  validUntil: string
): WhatsappTemplate => ({
  templateName: 'billing_payment_success',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: inrWa(amountPaise) },
        { type: 'text', text: validUntil },
      ],
    },
  ],
  text: `Payment received for ${planName} — ${inrWa(amountPaise)} paid. Your plan is active until ${validUntil}.`,
});

export const paymentFailedWhatsapp = (planName: string, retryUrl: string): WhatsappTemplate => ({
  templateName: 'billing_payment_failed',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: planName }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(retryUrl) }],
    },
  ],
  text: `Payment failed for ${planName}. No money debited. Retry: ${retryUrl}`,
});

export const subscriptionRenewedWhatsapp = (
  planName: string,
  amountPaise: number,
  nextChargeAt: string
): WhatsappTemplate => ({
  templateName: 'billing_subscription_renewed',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: inrWa(amountPaise) },
        { type: 'text', text: nextChargeAt },
      ],
    },
  ],
  text: `${planName} renewed for ${inrWa(amountPaise)}. Next charge: ${nextChargeAt}.`,
});

export const subscriptionFailedWhatsapp = (
  planName: string,
  graceUntil: string,
  updateUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_subscription_failed',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: graceUntil },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(updateUrl) }],
    },
  ],
  text: `Renewal failed for ${planName}. Update payment method by ${graceUntil}: ${updateUrl}`,
});

export const subscriptionActivatedWhatsapp = (
  planName: string,
  manageUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_subscription_activated',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: planName }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(manageUrl) }],
    },
  ],
  text: `${planName} subscription activated. Manage: ${manageUrl}`,
});

export const subscriptionCancelledWhatsapp = (
  planName: string,
  validUntil: string
): WhatsappTemplate => ({
  templateName: 'billing_subscription_cancelled',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: validUntil },
      ],
    },
  ],
  text: `${planName} subscription cancelled. Access until ${validUntil}.`,
});

export const renewalReminderWhatsapp = (
  planName: string,
  daysLeft: number,
  renewUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_renewal_reminder',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: planName },
        { type: 'text', text: String(daysLeft) },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(renewUrl) }],
    },
  ],
  text: `${planName} expires in ${daysLeft} day(s). Renew: ${renewUrl}`,
});

export const planExpiredWhatsapp = (planName: string, renewUrl: string): WhatsappTemplate => ({
  templateName: 'billing_plan_expired',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: planName }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(renewUrl) }],
    },
  ],
  text: `Your ${planName} has expired. Renew to restore access: ${renewUrl}`,
});

export const refundProcessedWhatsapp = (
  amountPaise: number,
  refundId: string
): WhatsappTemplate => ({
  templateName: 'billing_refund_processed',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: inrWa(amountPaise) },
        { type: 'text', text: refundId },
      ],
    },
  ],
  text: `Refund of ${inrWa(amountPaise)} processed (ID: ${refundId}). Allow 5-7 business days.`,
});

export const customQuoteReadyWhatsapp = (
  companyName: string,
  totalPaise: number,
  acceptUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_custom_quote_ready',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: companyName },
        { type: 'text', text: inrWa(totalPaise) },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(acceptUrl) }],
    },
  ],
  text: `Custom quote for ${companyName}: ${inrWa(totalPaise)}. Accept: ${acceptUrl}`,
});

export const fraudAlertWhatsapp = (
  signal: string,
  severity: string,
  reviewUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_fraud_alert',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: signal },
        { type: 'text', text: severity },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(reviewUrl) }],
    },
  ],
  text: `Fraud alert (${severity}): ${signal}. Review: ${reviewUrl}`,
});

export const quoteReceivedWhatsapp = (
  companyName: string,
  contactPerson: string,
  reviewUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_quote_received',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: companyName },
        { type: 'text', text: contactPerson },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(reviewUrl) }],
    },
  ],
  text: `New CV Enterprise quote from ${companyName} (${contactPerson}). Open: ${reviewUrl}`,
});

export const planUpgradedWhatsapp = (
  fromPlanName: string,
  toPlanName: string,
  manageUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_plan_upgraded',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: fromPlanName },
        { type: 'text', text: toPlanName },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(manageUrl) }],
    },
  ],
  text: `Upgraded from ${fromPlanName} to ${toPlanName}. Manage: ${manageUrl}`,
});

export const planDowngradedWhatsapp = (
  fromPlanName: string,
  toPlanName: string,
  manageUrl: string
): WhatsappTemplate => ({
  templateName: 'billing_plan_downgraded',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: fromPlanName },
        { type: 'text', text: toPlanName },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(manageUrl) }],
    },
  ],
  text: `Switched from ${fromPlanName} to ${toPlanName} as scheduled. Manage: ${manageUrl}`,
});

// ===============================
// Security / Auth (additional)
// ===============================

export const passwordResetWhatsapp = (otp: string): WhatsappTemplate => ({
  templateName: 'password_reset',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
  ],
  text: `Your Hire Adda password reset code is ${otp}. Valid for 1 hour. If you didn't request this, ignore this message.`,
});

export const mfaRecoveryOtpWhatsapp = (otp: string): WhatsappTemplate => ({
  templateName: 'mfa_recovery_otp',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
  ],
  text: `Your Hire Adda MFA recovery code is ${otp}. Valid for 10 minutes. Do not share this code.`,
});

export const twoFactorChangedWhatsapp = (state: string, method: string): WhatsappTemplate => ({
  templateName: 'two_factor_changed',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: state },
        { type: 'text', text: method },
      ],
    },
  ],
  text: `Two-factor authentication was ${state} on your Hire Adda account (${method}). If this wasn't you, secure your account immediately.`,
});

export const emailChangedWhatsapp = (newEmail: string): WhatsappTemplate => ({
  templateName: 'email_changed',
  languageCode: 'en',
  components: [{ type: 'body', parameters: [{ type: 'text', text: newEmail }] }],
  text: `The email on your Hire Adda account was changed to ${newEmail}. If this wasn't you, contact support immediately.`,
});

export const sessionsRevokedWhatsapp = (): WhatsappTemplate => ({
  templateName: 'sessions_revoked',
  languageCode: 'en',
  components: [],
  text: `All active sessions on your Hire Adda account have been signed out. If this wasn't you, reset your password immediately.`,
});

// ===============================
// Engagement / Workflow (additional)
// ===============================

export const ticketStatusUpdateWhatsapp = (
  ticketNumber: string,
  status: string
): WhatsappTemplate => ({
  templateName: 'ticket_status_update',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: ticketNumber },
        { type: 'text', text: status },
      ],
    },
  ],
  text: `Your support ticket #${ticketNumber} status is now: ${status}. Open Hire Adda to view.`,
});

export const teamInviteWhatsapp = (
  company: string,
  role: string,
  acceptUrl: string
): WhatsappTemplate => ({
  templateName: 'team_invite',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: company },
        { type: 'text', text: role },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(acceptUrl) }],
    },
  ],
  text: `You've been invited to join ${company} on Hire Adda as ${role}. Accept: ${acceptUrl}`,
});

export const teamOwnershipTransferredWhatsapp = (
  company: string,
  dashboardUrl: string
): WhatsappTemplate => ({
  templateName: 'team_ownership_transferred',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: company }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(dashboardUrl) }],
    },
  ],
  text: `You are now the owner of the ${company} team on Hire Adda. Manage: ${dashboardUrl}`,
});

export const vendorNewLeadWhatsapp = (
  company: string,
  jobTitle: string,
  inboxUrl: string
): WhatsappTemplate => ({
  templateName: 'vendor_new_lead',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: company },
        { type: 'text', text: jobTitle },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(inboxUrl) }],
    },
  ],
  text: `New hiring lead from ${company} for ${jobTitle}. Open your lead inbox: ${inboxUrl}`,
});

export const assistedHiringDeliveredWhatsapp = (
  count: string,
  roleTitle: string,
  reviewUrl: string
): WhatsappTemplate => ({
  templateName: 'assisted_hiring_delivered',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: count },
        { type: 'text', text: roleTitle },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(reviewUrl) }],
    },
  ],
  text: `${count} matched candidate(s) delivered for your ${roleTitle} role. Review: ${reviewUrl}`,
});

export const dataExportReadyWhatsapp = (
  exportType: string,
  downloadUrl: string
): WhatsappTemplate => ({
  templateName: 'data_export_ready',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: exportType }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(downloadUrl) }],
    },
  ],
  text: `Your ${exportType} export is ready to download. Get it here: ${downloadUrl}`,
});

// ===============================
// Dedicated replacements for generic stand-ins
// ===============================

export const jobPostedWhatsapp = (jobTitle: string, jobUrl: string): WhatsappTemplate => ({
  templateName: 'job_posted',
  languageCode: 'en',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: jobTitle }] },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: urlPath(jobUrl) }],
    },
  ],
  text: `Your job posting "${jobTitle}" is now live on Hire Adda. View: ${jobUrl}`,
});

export const accountStatusChangedWhatsapp = (action: string): WhatsappTemplate => ({
  templateName: 'account_status_changed',
  languageCode: 'en',
  components: [{ type: 'body', parameters: [{ type: 'text', text: action }] }],
  text: `Account update: ${action}. Contact support if you did not request this.`,
});

export const applicationWithdrawnWhatsapp = (
  candidateName: string,
  jobTitle: string
): WhatsappTemplate => ({
  templateName: 'application_withdrawn',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: candidateName },
        { type: 'text', text: jobTitle },
      ],
    },
  ],
  text: `${candidateName} has withdrawn their application for ${jobTitle}. Review on Hire Adda.`,
});

export const verificationResultWhatsapp = (
  verificationType: string,
  result: string
): WhatsappTemplate => ({
  templateName: 'verification_result',
  languageCode: 'en',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: verificationType },
        { type: 'text', text: result },
      ],
    },
  ],
  text: `Your ${verificationType} verification has been ${result}. Open Hire Adda for details.`,
});
