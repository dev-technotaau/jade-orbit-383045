'use client';

import { Check } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { useAuthStore } from '@/store/auth.store';
import { useEntitlements } from '@/hooks/use-entitlements';

interface Props {
  /**
   * The Avatar element to wrap. Kept as children (rather than passing
   * Avatar props through) so callers can size + style the avatar
   * however they need without this wrapper having to mirror every
   * Avatar API surface.
   */
  children: React.ReactNode;
  /**
   * Override the verified check. When omitted, the wrapper reads the
   * live auth store + entitlement snapshot and shows the tick only for
   * CANDIDATE-role users with `feature.candidate_verified_badge` active.
   * Pass explicit `true`/`false` on surfaces that already know (e.g.
   * employer viewing a saved candidate's avatar).
   */
  verified?: boolean;
  /**
   * Visual size of the overlay tick. Default `md` matches the Avatar
   * `md` size; bump up for `lg`/`xl` avatars to keep the tick readable.
   */
  size?: 'sm' | 'md' | 'lg';
}

// Tailwind classes for each tick size. `wrap` controls the outer
// rounded-white halo that gives the tick its "applied on top of the
// avatar" reading; `icon` sizes the lucide glyph inside.
const SIZES = {
  sm: { wrap: 'h-3.5 w-3.5 -right-0.5 -top-0.5', icon: 'h-2.5 w-2.5' },
  md: { wrap: 'h-4 w-4 -right-0.5 -top-0.5', icon: 'h-3 w-3' },
  lg: { wrap: 'h-5 w-5 -right-1 -top-1', icon: 'h-3.5 w-3.5' },
};

/**
 * Wraps an `<Avatar />` and overlays a verified-tick badge in the
 * top-right corner — half-overlapping the avatar circle, in the same
 * visual style as a notification counter dot.
 *
 * Used on header account chrome (DashboardHeader, public Header) so
 * Premium candidates see their verification proof on every page
 * without taking up the room of the full pill-shaped VerifiedBadge.
 *
 * Why not extend Avatar directly: Avatar is shared across many
 * surfaces that don't care about candidate-verification (employer
 * pages, admin tables, message threads). Keeping this concern in a
 * wrapper avoids leaking entitlement reads + Premium UX into the
 * primitive.
 */
export default function AvatarWithVerified({ children, verified, size = 'md' }: Props) {
  const user = useAuthStore((s) => s.user);
  const { hasFeature } = useEntitlements();

  // Resolved verification state — explicit prop wins, else derive from
  // the live auth + entitlement snapshot, scoped to CANDIDATEs since
  // only candidates get the Premium verified badge.
  const isVerified =
    verified ?? (user?.role === 'CANDIDATE' && hasFeature('feature.candidate_verified_badge'));

  if (!isVerified) {
    // Hot-path — no badge to show, return children naked so callers
    // get the same DOM shape they would without the wrapper.
    return <>{children}</>;
  }

  const s = SIZES[size];

  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <Tooltip content="Verified candidate">
        <span
          aria-label="Verified"
          // Halo: white ring lifts the tick off the avatar edge so it
          // reads cleanly on any avatar background (photo, initials,
          // dark-mode chrome). Brand-blue fill matches the full
          // VerifiedBadge for visual consistency across surfaces.
          className={`absolute z-10 flex items-center justify-center rounded-full bg-[#1d4ed8] text-white shadow-sm ring-2 ring-white ${s.wrap}`}
        >
          <Check className={s.icon} strokeWidth={3} />
        </span>
      </Tooltip>
    </span>
  );
}
