'use client';

import BrandIcon from '@/components/common/BrandIcon';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import WhatsappSupportCard from '@/components/support/WhatsappSupportCard';

interface Props {
  /**
   * Drives both the entitlement check and the modal preset:
   *   - 'candidate' → `feature.whatsapp_priority` (CAND_PREMIUM)
   *   - 'employer'  → `feature.priority_support` (CVDB_PRO and above; falls
   *                    back to EMP_PREMIUM via the modal preset map)
   */
  role: 'candidate' | 'employer';
}

/**
 * Smart WhatsApp support strip.
 *
 *   - When the user already holds priority/standard WhatsApp support
 *     (`feature.whatsapp_priority` | `feature.whatsapp_support` |
 *     `feature.priority_support` | `feature.dedicated_support`), renders
 *     the real `WhatsappSupportCard` with the chat-link + number.
 *   - Otherwise falls back to the upsell banner that opens the upgrade
 *     modal (existing behaviour preserved for non-entitled users).
 *
 * Used on /candidate/help and /employer/help today; safe to drop in on
 * any page where you want to surface priority support contextually.
 */
export default function PriorityWhatsappBanner({ role }: Props) {
  const { hasFeature, isLoading } = useEntitlements();
  const upgrade = useUpgradeModal();

  // Hold paint until entitlements resolve to avoid a flash of the upsell
  // for already-entitled users.
  if (isLoading) return null;

  // Entitled? Show the real support card instead of the upsell.
  const hasWhatsappSupport =
    hasFeature('feature.whatsapp_priority') ||
    hasFeature('feature.whatsapp_support') ||
    hasFeature('feature.priority_support') ||
    hasFeature('feature.dedicated_support');
  if (hasWhatsappSupport) {
    return <WhatsappSupportCard />;
  }

  // Otherwise: upsell. Modal preset switches based on role.
  const featureKey =
    role === 'candidate' ? 'feature.whatsapp_priority' : 'feature.priority_support';

  const headline =
    role === 'candidate' ? 'Get priority WhatsApp support' : 'Get priority recruiter support';
  const subline =
    role === 'candidate'
      ? "Premium members get replies in under 30 minutes — much faster than the free tier's 24h SLA."
      : 'CV Pro and Premium employers get triaged ahead of free-tier requests across email + WhatsApp.';

  return (
    <>
      <button
        type="button"
        onClick={() => upgrade.open({ feature: featureKey })}
        // Emerald variant of the shared upsell-banner pattern:
        // saturated emerald gradient + white text + inverted white CTA.
        // Matches the warm amber banners elsewhere for visual cohesion.
        className="group flex w-full items-start gap-3 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 p-4 text-left shadow-sm transition-all hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 hover:shadow-md dark:from-emerald-700 dark:via-emerald-800 dark:to-teal-800"
      >
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-white shadow-inner ring-1 ring-white/30 backdrop-blur-sm">
          <BrandIcon name="whatsapp" className="h-5 w-5" title="WhatsApp" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">{headline}</p>
          <p className="mt-0.5 text-sm text-white/90">{subline}</p>
        </div>
        <span className="hidden items-center gap-1 self-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-emerald-700 shadow-sm transition-colors group-hover:bg-emerald-50 sm:inline-flex">
          See plans
        </span>
      </button>
      {upgrade.modal}
    </>
  );
}
