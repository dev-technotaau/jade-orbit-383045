import type { SmsTemplate } from '../../types/notification-templates';

// ===============================
// Authentication
// ===============================

export const otpSms = (otp: string): SmsTemplate => ({
  text: `[Hire Adda] Your verification code is ${otp}. Valid for 10 minutes. Never share this code with anyone.`,
});

export const welcomeSms = (name: string): SmsTemplate => ({
  text: `Welcome to Hire Adda, ${name}! Your account is ready. Complete your profile to start getting matched with opportunities.`,
});

export const passwordResetSms = (otp: string): SmsTemplate => ({
  text: `[Hire Adda] Your password reset code is ${otp}. Valid for 1 hour. If you didn't request this, ignore this message.`,
});

// ===============================
// Security
// ===============================

export const loginAlertSms = (time: string): SmsTemplate => ({
  text: `[Hire Adda] New sign-in detected at ${time}. If this wasn't you, secure your account immediately.`,
});

export const securityAlertSms = (action: string): SmsTemplate => ({
  text: `[Hire Adda] Security alert: ${action} on your account. If unauthorized, contact support immediately.`,
});

// ===============================
// Jobs & Applications
// ===============================

export const interviewReminderSms = (time: string, link: string): SmsTemplate => ({
  text: `[Hire Adda] Reminder: Your interview is scheduled for ${time}. Join here: ${link} — Please be ready 5 min early.`,
});

export const applicationStatusSms = (status: string, company: string): SmsTemplate => ({
  text: `[Hire Adda] Your application at ${company} has been updated to: ${status}. Open the app for details.`,
});

export const jobOfferSms = (company: string, link: string): SmsTemplate => ({
  text: `[Hire Adda] Congratulations! You've received a job offer from ${company}. View details: ${link}`,
});

export const profileViewedSms = (company: string): SmsTemplate => ({
  text: `[Hire Adda] A recruiter at ${company} viewed your profile. Keep your profile updated to stand out!`,
});

export const jobAlertSms = (count: number): SmsTemplate => ({
  text: `[Hire Adda] ${count} new job${count > 1 ? 's' : ''} matching your profile. Open Hire Adda to view and apply.`,
});

// ===============================
// Billing / Payments
// ===============================

const inr = (paise: number): string => `Rs.${(paise / 100).toFixed(2)}`;

export const paymentCapturedSms = (planName: string, amountPaise: number): SmsTemplate => ({
  text: `[Hire Adda] Payment ${inr(amountPaise)} received. ${planName} is now active. Manage at hireadda.in/billing`,
});

export const paymentFailedSms = (planName: string): SmsTemplate => ({
  text: `[Hire Adda] Payment for ${planName} failed. No money debited. Retry at hireadda.in/billing/orders`,
});

export const subscriptionRenewalFailedSms = (planName: string): SmsTemplate => ({
  text: `[Hire Adda] Renewal failed for ${planName}. Update your payment method to keep access: hireadda.in/billing/payment-methods`,
});

export const renewalReminderSms = (daysLeft: number, planName: string): SmsTemplate => ({
  text: `[Hire Adda] Your ${planName} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew now: hireadda.in/billing/subscriptions`,
});

export const planExpiredSms = (planName: string): SmsTemplate => ({
  text: `[Hire Adda] Your ${planName} has expired. Renew to restore access: hireadda.in/pricing`,
});

export const refundProcessedSms = (amountPaise: number): SmsTemplate => ({
  text: `[Hire Adda] Refund of ${inr(amountPaise)} processed. Allow 5-7 business days for it to reflect in your account.`,
});

export const fraudAlertSms = (signal: string): SmsTemplate => ({
  text: `[Hire Adda Admin] FRAUD signal: ${signal}. Review queue: hireadda.in/super-admin/billing/fraud`,
});

export const quoteReceivedSms = (companyName: string): SmsTemplate => ({
  text: `[Hire Adda Admin] New CV Enterprise quote from ${companyName}. Open hireadda.in/super-admin/billing/quotes`,
});

export const planUpgradedSms = (toPlanName: string): SmsTemplate => ({
  text: `[Hire Adda] Upgraded to ${toPlanName}. New benefits are active now. Manage: hireadda.in/billing/subscriptions`,
});

export const planDowngradedSms = (toPlanName: string): SmsTemplate => ({
  text: `[Hire Adda] Switched to ${toPlanName} as scheduled. Manage: hireadda.in/billing/subscriptions`,
});
