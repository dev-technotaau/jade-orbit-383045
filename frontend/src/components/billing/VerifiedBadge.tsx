'use client';

import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';

interface Props {
  /**
   * When true, the *current user* is the candidate being shown — render a
   * "Get verified" CTA pill if they don't have Premium. When false (e.g.
   * employer viewing someone else's profile), render NOTHING for unverified
   * candidates.
   */
  isOwnProfile?: boolean;
  /**
   * If known externally (e.g. derived from a public candidate row), pass it
   * here. When omitted, falls back to the current user's entitlement
   * snapshot. Recruiter-facing pages should always pass this explicitly.
   */
  isVerified?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { icon: 14, badge: 'px-1.5 py-0.5 text-[10px]', gap: 'gap-1' },
  md: { icon: 16, badge: 'px-2 py-0.5 text-[11px]', gap: 'gap-1.5' },
  lg: { icon: 18, badge: 'px-2.5 py-1 text-xs', gap: 'gap-1.5' },
};

/**
 * Verified candidate badge — drives a major Premium-conversion lever.
 *
 * Behaviour:
 *   - Verified user → solid blue badge with checkmark + "Verified" label.
 *   - Free user looking at their own profile → faded outline badge with
 *     a "Get verified" pill that opens the upgrade modal targeted at
 *     `feature.candidate_verified_badge`.
 *   - Free user looked at by someone else → renders nothing (we only show
 *     a positive trust signal; the absence is the implicit message).
 */
export default function VerifiedBadge({
  isOwnProfile = false,
  isVerified,
  size = 'md',
  className,
}: Props) {
  const { hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();

  // Source of truth: prefer explicit prop, else entitlement snapshot.
  const verified =
    typeof isVerified === 'boolean' ? isVerified : hasFeature('feature.candidate_verified_badge');
  const sizing = SIZES[size];

  if (verified) {
    // Solid brand-primary background + white text in BOTH light and
    // dark modes. The earlier design (bg-blue-100 + text-blue-700 +
    // dark: variants) was washed out for users on dark-mode systems
    // because Tailwind v4 enables `dark:` based on prefers-color-scheme
    // by default — light-blue-on-light-blue with the dark variant
    // mixing in produced a low-contrast chip. Solid brand colour
    // sidesteps the cross-mode issue and gives the badge clear
    // recognisability against any background.
    return (
      <Tooltip content="Verified candidate — Hire Adda Premium">
        <span
          className={cn(
            'inline-flex items-center rounded-full font-semibold',
            'bg-[var(--primary)] text-white shadow-[var(--primary)]/25 shadow-sm',
            sizing.badge,
            sizing.gap,
            className,
          )}
        >
          <BadgeCheck size={sizing.icon} className="text-white" strokeWidth={2.5} />
          Verified
        </span>
      </Tooltip>
    );
  }

  // Free user — only render the upsell pill on their OWN profile.
  if (!isOwnProfile) return null;

  return (
    <>
      <Tooltip content="Get verified with Premium — recruiters trust verified profiles 3× more">
        <button
          type="button"
          onClick={() => upgrade.open({ feature: 'feature.candidate_verified_badge' })}
          // Solid brand-orange gradient + white text gives high contrast
          // (≥ 7:1 on the brand secondary scale — well above WCAG AA for
          // small text) AND the pill reads as an actionable CTA rather
          // than a passive informational chip. Previous design was a
          // cream-on-brown outline pill that blended into the surrounding
          // profile chrome and undersold the Premium feature.
          className={cn(
            'group inline-flex items-center rounded-full font-semibold',
            'bg-gradient-to-r from-[var(--secondary)] to-[var(--secondary-dark)] text-white',
            'shadow-[var(--secondary)]/30 shadow-md',
            'transition-all hover:scale-105 hover:shadow-[var(--secondary)]/40 hover:shadow-lg',
            'focus:ring-2 focus:ring-[var(--secondary)]/40 focus:ring-offset-1 focus:outline-none',
            sizing.badge,
            sizing.gap,
            className,
          )}
        >
          <ShieldCheck
            size={sizing.icon}
            className="text-white transition-transform group-hover:rotate-[-8deg]"
            strokeWidth={2.5}
          />
          Get Verified
        </button>
      </Tooltip>
      {upgrade.modal}
    </>
  );
}
