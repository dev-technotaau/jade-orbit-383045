import type { EmailCampaignStatus, EmailCampaignRecipientStatus } from '@/types/email';

/** Badge style per campaign status (shared by the list + detail pages). */
export const EMAIL_CAMPAIGN_STATUS_STYLE: Record<EmailCampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  QUEUED: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-amber-100 text-amber-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

/** Badge style per recipient status. */
export const EMAIL_RECIPIENT_STATUS_STYLE: Record<EmailCampaignRecipientStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-sky-100 text-sky-700',
  OPENED: 'bg-indigo-100 text-indigo-700',
  CLICKED: 'bg-emerald-100 text-emerald-700',
  BOUNCED: 'bg-red-100 text-red-700',
  COMPLAINED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
};
