import type { WaCampaignStatus } from '@/types/whatsapp';

/**
 * Badge style per campaign status. Lives in a shared (non-page) module because
 * Next.js App Router forbids non-default named exports from `page.tsx` files;
 * it's consumed by both the campaigns list and detail pages.
 */
export const CAMPAIGN_STATUS_STYLE: Record<WaCampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  QUEUED: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-amber-100 text-amber-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
