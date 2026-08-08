import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  successBox,
  dangerBox,
  warningBox,
  iconCircle,
  smallText,
} from './_layout';

// Inline info card (similar visual to infoBox, but takes raw HTML so we can
// embed multi-line content like Order ID + Plan + Amount).
const infoCard = (innerHtml: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="padding:16px 20px;background-color:#eff6ff;border-radius:10px;border-left:4px solid #2563EB;">
      <p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.7;">${innerHtml}</p>
    </td>
  </tr>
</table>`;

const formatINR = (paise: number): string => {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);
};

const fmtDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// =====================================================================
// Order placed — confirmation that an order was created (pre-payment)
// =====================================================================
export const orderConfirmationEmail = (args: {
  name: string;
  planName: string;
  orderId: string;
  amountPaise: number;
  validityDays: number;
  payUrl: string;
}): EmailTemplate => ({
  subject: `Order #${args.orderId.slice(-8).toUpperCase()} created — ${args.planName}`,
  html: emailLayout(`
    ${iconCircle('&#128179;', '#eff6ff')}
    ${heading('Order Created')}
    ${subtitle('Complete payment to activate your plan.')}
    ${greeting(args.name)}
    ${paragraph(`Your order for <strong>${args.planName}</strong> has been created. Complete payment to start using the plan immediately.`)}
    ${infoCard(`Order ID: <strong>${args.orderId}</strong><br/>Plan: <strong>${args.planName}</strong> (${args.validityDays} days)<br/>Amount: <strong>${formatINR(args.amountPaise)}</strong> (incl. GST)`)}
    ${button('Complete Payment', args.payUrl)}
    ${smallText('Order expires in 30 minutes if not paid.')}
    ${signature()}
  `),
  text: `Order created — ${args.planName} (${formatINR(args.amountPaise)}). Complete payment: ${args.payUrl}. Order ID: ${args.orderId}.`,
});

// =====================================================================
// Payment captured — money received, plan activated
// =====================================================================
export const paymentCapturedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  paymentId: string;
  invoiceUrl?: string;
  validUntil: Date | string;
}): EmailTemplate => ({
  subject: `Payment received — ${args.planName} is active`,
  html: emailLayout(`
    ${iconCircle('&#10004;', '#ecfdf5')}
    ${heading('Payment Successful')}
    ${subtitle('Your plan is now active.')}
    ${greeting(args.name)}
    ${successBox(`We've received your payment of <strong>${formatINR(args.amountPaise)}</strong>. Your <strong>${args.planName}</strong> plan is now live and valid until <strong>${fmtDate(args.validUntil)}</strong>.`)}
    ${paragraph(`Payment reference: <code>${args.paymentId}</code>`)}
    ${args.invoiceUrl ? button('Download GST Invoice', args.invoiceUrl) : ''}
    ${signature()}
  `),
  text: `Payment of ${formatINR(args.amountPaise)} received. ${args.planName} is active until ${fmtDate(args.validUntil)}. Payment ID: ${args.paymentId}`,
});

// =====================================================================
// Payment failed
// =====================================================================
export const paymentFailedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  reason?: string;
  retryUrl: string;
}): EmailTemplate => ({
  subject: `Payment failed — ${args.planName}`,
  html: emailLayout(`
    ${iconCircle('&#10006;', '#fef2f2')}
    ${heading('Payment Failed')}
    ${subtitle("We couldn't process your payment.")}
    ${greeting(args.name)}
    ${dangerBox(`Your payment of <strong>${formatINR(args.amountPaise)}</strong> for <strong>${args.planName}</strong> could not be completed.${args.reason ? `<br/>Reason: ${args.reason}` : ''}`)}
    ${paragraph('No money was deducted. You can retry with a different payment method.')}
    ${button('Retry Payment', args.retryUrl)}
    ${signature()}
  `),
  text: `Payment failed for ${args.planName} (${formatINR(args.amountPaise)}). ${args.reason ?? ''} Retry: ${args.retryUrl}`,
});

// =====================================================================
// Refund processed
// =====================================================================
export const refundProcessedEmail = (args: {
  name: string;
  amountPaise: number;
  refundId: string;
  paymentId: string;
  expectedDate?: string;
}): EmailTemplate => ({
  subject: `Refund of ${formatINR(args.amountPaise)} processed`,
  html: emailLayout(`
    ${iconCircle('&#128176;', '#ecfdf5')}
    ${heading('Refund Processed')}
    ${greeting(args.name)}
    ${successBox(`A refund of <strong>${formatINR(args.amountPaise)}</strong> has been initiated to your original payment method.`)}
    ${infoCard(`Refund ID: <strong>${args.refundId}</strong><br/>Original Payment: <strong>${args.paymentId}</strong>${args.expectedDate ? `<br/>Expected by: <strong>${args.expectedDate}</strong>` : ''}`)}
    ${paragraph('Refunds typically reflect in 5–7 business days depending on your bank or card issuer.')}
    ${signature()}
  `),
  text: `Refund of ${formatINR(args.amountPaise)} processed. Refund ID: ${args.refundId}. Allow 5–7 business days.`,
});

// =====================================================================
// Refund request received — acknowledgement, BEFORE any money moves
// =====================================================================
export const refundRequestReceivedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  receiptNumber: string;
  orderUrl: string;
}): EmailTemplate => ({
  subject: `We received your refund request for ${args.planName}`,
  html: emailLayout(`
    ${iconCircle('&#128340;', '#eff6ff')}
    ${heading('Refund Request Received')}
    ${greeting(args.name)}
    ${paragraph(`We've received your request to refund <strong>${formatINR(args.amountPaise)}</strong> for <strong>${args.planName}</strong>. Our billing team reviews every request manually — usually within 2 business days.`)}
    ${infoCard(`Order: <strong>${args.receiptNumber}</strong><br/>Requested amount: <strong>${formatINR(args.amountPaise)}</strong>`)}
    ${button('View request status', args.orderUrl)}
    ${smallText('Nothing has been charged or reversed yet. You can withdraw this request any time before it is reviewed.')}
    ${signature()}
  `),
  text: `We received your refund request of ${formatINR(args.amountPaise)} for ${args.planName} (order ${args.receiptNumber}). Our team reviews requests within 2 business days. Status: ${args.orderUrl}`,
});

// =====================================================================
// Refund request declined
// =====================================================================
export const refundRequestRejectedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  receiptNumber: string;
  reviewNotes?: string | null;
  supportUrl: string;
}): EmailTemplate => ({
  subject: `Your refund request for ${args.planName} was not approved`,
  html: emailLayout(`
    ${iconCircle('&#9888;', '#fffbeb')}
    ${heading('Refund Request Declined')}
    ${greeting(args.name)}
    ${warningBox(`After review, your refund request of <strong>${formatINR(args.amountPaise)}</strong> for <strong>${args.planName}</strong> was not approved.`)}
    ${infoCard(`Order: <strong>${args.receiptNumber}</strong>${args.reviewNotes ? `<br/>Reason: <strong>${args.reviewNotes}</strong>` : ''}`)}
    ${paragraph('Your plan and remaining quota are unaffected — nothing was charged or reversed.')}
    ${button('Contact support', args.supportUrl)}
    ${signature()}
  `),
  text: `Your refund request of ${formatINR(args.amountPaise)} for ${args.planName} (order ${args.receiptNumber}) was not approved.${args.reviewNotes ? ` Reason: ${args.reviewNotes}` : ''} Support: ${args.supportUrl}`,
});

// =====================================================================
// Invoice issued — GST tax invoice ready
// =====================================================================
export const invoiceIssuedEmail = (args: {
  name: string;
  invoiceNumber: string;
  totalPaise: number;
  invoiceUrl: string;
  issuedAt: Date | string;
}): EmailTemplate => ({
  subject: `Invoice ${args.invoiceNumber} — ${formatINR(args.totalPaise)}`,
  html: emailLayout(`
    ${iconCircle('&#128196;', '#eef2ff')}
    ${heading('GST Invoice Ready')}
    ${greeting(args.name)}
    ${paragraph(`Your tax invoice for the recent purchase has been generated and is available for download.`)}
    ${infoCard(`Invoice #: <strong>${args.invoiceNumber}</strong><br/>Issued: <strong>${fmtDate(args.issuedAt)}</strong><br/>Total (incl. GST): <strong>${formatINR(args.totalPaise)}</strong>`)}
    ${button('Download Invoice (PDF)', args.invoiceUrl)}
    ${smallText('Keep this invoice for your records and GST input credit claims.')}
    ${signature()}
  `),
  text: `Invoice ${args.invoiceNumber} (${formatINR(args.totalPaise)}) is ready. Download: ${args.invoiceUrl}`,
});

// =====================================================================
// Subscription activated
// =====================================================================
export const subscriptionActivatedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  cycle: string; // monthly, quarterly, yearly
  nextChargeAt?: Date | string | null;
  manageUrl: string;
}): EmailTemplate => ({
  subject: `${args.planName} subscription activated`,
  html: emailLayout(`
    ${iconCircle('&#10004;', '#ecfdf5')}
    ${heading('Subscription Active')}
    ${greeting(args.name)}
    ${successBox(`Your <strong>${args.planName}</strong> subscription is now live. You'll be billed ${formatINR(args.amountPaise)} per ${args.cycle}.`)}
    ${args.nextChargeAt ? paragraph(`Next charge: <strong>${fmtDate(args.nextChargeAt)}</strong>.`) : ''}
    ${button('Manage Subscription', args.manageUrl)}
    ${smallText('You can pause, cancel, or change your plan anytime from your billing dashboard.')}
    ${signature()}
  `),
  text: `${args.planName} subscription activated. ${formatINR(args.amountPaise)}/${args.cycle}. Manage: ${args.manageUrl}`,
});

// =====================================================================
// Subscription renewed
// =====================================================================
export const subscriptionRenewedEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  invoiceUrl?: string;
  nextChargeAt?: Date | string | null;
}): EmailTemplate => ({
  subject: `${args.planName} renewed — ${formatINR(args.amountPaise)}`,
  html: emailLayout(`
    ${iconCircle('&#128260;', '#eff6ff')}
    ${heading('Subscription Renewed')}
    ${greeting(args.name)}
    ${successBox(`Your <strong>${args.planName}</strong> plan was renewed for ${formatINR(args.amountPaise)}.`)}
    ${args.nextChargeAt ? paragraph(`Next charge: <strong>${fmtDate(args.nextChargeAt)}</strong>.`) : ''}
    ${args.invoiceUrl ? button('Download Invoice', args.invoiceUrl) : ''}
    ${signature()}
  `),
  text: `${args.planName} renewed for ${formatINR(args.amountPaise)}.`,
});

// =====================================================================
// Subscription cancelled
// =====================================================================
export const subscriptionCancelledEmail = (args: {
  name: string;
  planName: string;
  validUntil: Date | string;
  reactivateUrl: string;
}): EmailTemplate => ({
  subject: `${args.planName} subscription cancelled`,
  html: emailLayout(`
    ${iconCircle('&#9888;', '#fff7ed')}
    ${heading('Subscription Cancelled')}
    ${greeting(args.name)}
    ${warningBox(`Your <strong>${args.planName}</strong> subscription has been cancelled. You'll keep access until <strong>${fmtDate(args.validUntil)}</strong>.`)}
    ${paragraph('Changed your mind? You can reactivate before access ends.')}
    ${button('Reactivate Subscription', args.reactivateUrl)}
    ${signature()}
  `),
  text: `${args.planName} subscription cancelled. Access until ${fmtDate(args.validUntil)}. Reactivate: ${args.reactivateUrl}`,
});

// =====================================================================
// Subscription grace — payment failed, in retry/grace period
// =====================================================================
export const subscriptionGraceEmail = (args: {
  name: string;
  planName: string;
  amountPaise: number;
  retryAt: Date | string;
  graceUntil: Date | string;
  updateMethodUrl: string;
}): EmailTemplate => ({
  subject: `Action needed — ${args.planName} renewal failed`,
  html: emailLayout(`
    ${iconCircle('&#9888;', '#fff7ed')}
    ${heading('Renewal Payment Failed')}
    ${greeting(args.name)}
    ${warningBox(`We couldn't charge your saved payment method for <strong>${args.planName}</strong> (${formatINR(args.amountPaise)}). We'll retry on <strong>${fmtDate(args.retryAt)}</strong>.`)}
    ${paragraph(`To avoid losing access, please update your payment method before <strong>${fmtDate(args.graceUntil)}</strong>.`)}
    ${button('Update Payment Method', args.updateMethodUrl)}
    ${signature()}
  `),
  text: `Renewal failed for ${args.planName}. Update payment method by ${fmtDate(args.graceUntil)}: ${args.updateMethodUrl}`,
});

// =====================================================================
// Expiry reminders — T-7 / T-3 / T-1
// =====================================================================
const expiryReminderEmail = (
  daysLeft: number,
  args: { name: string; planName: string; expiresAt: Date | string; renewUrl: string }
): EmailTemplate => ({
  subject: `${args.planName} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
  html: emailLayout(`
    ${iconCircle('&#9203;', daysLeft <= 1 ? '#fef2f2' : '#fff7ed')}
    ${heading(`Plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`)}
    ${greeting(args.name)}
    ${(daysLeft <= 1 ? dangerBox : warningBox)(`Your <strong>${args.planName}</strong> plan expires on <strong>${fmtDate(args.expiresAt)}</strong>.`)}
    ${paragraph('Renew now to keep your access uninterrupted and retain unused credits.')}
    ${button('Renew Now', args.renewUrl)}
    ${signature()}
  `),
  text: `${args.planName} expires in ${daysLeft} day(s) on ${fmtDate(args.expiresAt)}. Renew: ${args.renewUrl}`,
});

export const expiry7DayEmail = (args: {
  name: string;
  planName: string;
  expiresAt: Date | string;
  renewUrl: string;
}) => expiryReminderEmail(7, args);
export const expiry3DayEmail = (args: {
  name: string;
  planName: string;
  expiresAt: Date | string;
  renewUrl: string;
}) => expiryReminderEmail(3, args);
export const expiry1DayEmail = (args: {
  name: string;
  planName: string;
  expiresAt: Date | string;
  renewUrl: string;
}) => expiryReminderEmail(1, args);

// =====================================================================
// Plan upgraded — user moved from a lower plan to a higher one (immediate)
// =====================================================================
export const planUpgradedEmail = (args: {
  name: string;
  fromPlanName: string;
  toPlanName: string;
  amountPaise: number;
  prorationCreditPaise: number;
  validUntil: Date | string;
  manageUrl: string;
}): EmailTemplate => ({
  subject: `Upgraded to ${args.toPlanName}`,
  html: emailLayout(`
    ${iconCircle('&#11014;', '#ecfdf5')}
    ${heading('Plan Upgraded')}
    ${subtitle(`You're now on ${args.toPlanName}.`)}
    ${greeting(args.name)}
    ${successBox(`Your plan has been upgraded from <strong>${args.fromPlanName}</strong> to <strong>${args.toPlanName}</strong>. New benefits are available immediately.`)}
    ${infoCard(`Charged: <strong>${formatINR(args.amountPaise)}</strong> (incl. GST)<br/>Pro-rata credit applied: <strong>${formatINR(args.prorationCreditPaise)}</strong><br/>Active until: <strong>${fmtDate(args.validUntil)}</strong>`)}
    ${paragraph('Unused credits from your previous plan have been carried forward where applicable.')}
    ${button('Manage Plan', args.manageUrl)}
    ${signature()}
  `),
  text: `Upgraded from ${args.fromPlanName} to ${args.toPlanName}. Charged ${formatINR(args.amountPaise)} (pro-rata credit ${formatINR(args.prorationCreditPaise)}). Active until ${fmtDate(args.validUntil)}.`,
});

// =====================================================================
// Plan downgraded — scheduled downgrade has been applied at period end
// =====================================================================
export const planDowngradedEmail = (args: {
  name: string;
  fromPlanName: string;
  toPlanName: string;
  validUntil: Date | string;
  manageUrl: string;
}): EmailTemplate => ({
  subject: `Switched to ${args.toPlanName}`,
  html: emailLayout(`
    ${iconCircle('&#11015;', '#eff6ff')}
    ${heading('Plan Switched')}
    ${subtitle(`You're now on ${args.toPlanName}.`)}
    ${greeting(args.name)}
    ${paragraph(`As scheduled, your plan has switched from <strong>${args.fromPlanName}</strong> to <strong>${args.toPlanName}</strong>. Eligible unused credits have been carried over.`)}
    ${infoCard(`New plan: <strong>${args.toPlanName}</strong><br/>Active until: <strong>${fmtDate(args.validUntil)}</strong>`)}
    ${paragraph('Want more capacity? You can upgrade again at any time.')}
    ${button('Manage Plan', args.manageUrl)}
    ${signature()}
  `),
  text: `Switched from ${args.fromPlanName} to ${args.toPlanName}. Active until ${fmtDate(args.validUntil)}.`,
});

// =====================================================================
// Plan expired
// =====================================================================
export const planExpiredEmail = (args: {
  name: string;
  planName: string;
  renewUrl: string;
}): EmailTemplate => ({
  subject: `${args.planName} has expired`,
  html: emailLayout(`
    ${iconCircle('&#128683;', '#fef2f2')}
    ${heading('Your Plan Has Expired')}
    ${greeting(args.name)}
    ${dangerBox(`Your <strong>${args.planName}</strong> plan has expired. Some features are no longer available.`)}
    ${paragraph('Renew now to restore access and continue where you left off.')}
    ${button('Renew Plan', args.renewUrl)}
    ${signature()}
  `),
  text: `${args.planName} has expired. Renew to restore access: ${args.renewUrl}`,
});

// =====================================================================
// Custom plan offer sent — CV Enterprise quote turned into an offer
// =====================================================================
export const customPlanOfferEmail = (args: {
  name: string;
  companyName: string;
  totalPaise: number;
  validityDays: number;
  cvUnlocks: number;
  seats: number;
  offerExpiresAt: Date | string;
  acceptUrl: string;
}): EmailTemplate => ({
  subject: `Your custom enterprise quote is ready`,
  html: emailLayout(`
    ${iconCircle('&#128221;', '#eef2ff')}
    ${heading('Custom Quote Ready')}
    ${subtitle(`Tailored for ${args.companyName}`)}
    ${greeting(args.name)}
    ${paragraph('Our team has prepared a tailored offer based on your hiring requirements.')}
    ${infoCard(`Total: <strong>${formatINR(args.totalPaise)}</strong> (incl. GST)<br/>Validity: <strong>${args.validityDays} days</strong><br/>CV Unlocks: <strong>${args.cvUnlocks}</strong><br/>Seats: <strong>${args.seats}</strong>`)}
    ${warningBox(`This offer is valid until <strong>${fmtDate(args.offerExpiresAt)}</strong>.`)}
    ${button('Review & Accept', args.acceptUrl)}
    ${signature()}
  `),
  text: `Custom enterprise offer ready for ${args.companyName}: ${formatINR(args.totalPaise)} for ${args.validityDays} days. Accept: ${args.acceptUrl}`,
});

// =====================================================================
// Fraud alert — sent to super-admin
// =====================================================================
export const fraudAlertEmail = (args: {
  signal: string;
  severity: string;
  userId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  reviewUrl: string;
}): EmailTemplate => ({
  subject: `[FRAUD] ${args.severity} — ${args.signal}`,
  html: emailLayout(`
    ${iconCircle('&#128680;', '#fef2f2')}
    ${heading('Fraud Signal Detected')}
    ${dangerBox(`<strong>Signal:</strong> ${args.signal}<br/><strong>Severity:</strong> ${args.severity}${args.userId ? `<br/><strong>User:</strong> ${args.userId}` : ''}${args.orderId ? `<br/><strong>Order:</strong> ${args.orderId}` : ''}${args.paymentId ? `<br/><strong>Payment:</strong> ${args.paymentId}` : ''}`)}
    ${button('Review in Super-Admin', args.reviewUrl)}
    ${signature()}
  `),
  text: `[FRAUD] ${args.severity} ${args.signal} — review: ${args.reviewUrl}`,
});

// =====================================================================
// Quote received — sent to super-admin
// =====================================================================
export const quoteReceivedEmail = (args: {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  hiringNeed: string;
  cvCount: number;
  reviewUrl: string;
}): EmailTemplate => ({
  subject: `[QUOTE] New CV Enterprise lead — ${args.companyName}`,
  html: emailLayout(`
    ${iconCircle('&#128231;', '#eff6ff')}
    ${heading('New Enterprise Quote Request')}
    ${infoCard(`Company: <strong>${args.companyName}</strong><br/>Contact: <strong>${args.contactPerson}</strong><br/>Email: ${args.email}<br/>Phone: ${args.phone}<br/>Need: ${args.hiringNeed}<br/>CV Count: <strong>${args.cvCount}</strong>`)}
    ${button('Open Quote', args.reviewUrl)}
    ${signature()}
  `),
  text: `[QUOTE] ${args.companyName} (${args.contactPerson}, ${args.email}, ${args.phone}). Need: ${args.hiringNeed}, ${args.cvCount} CVs. Review: ${args.reviewUrl}`,
});
