/**
 * EmployerHelplineBanner — top-of-page strip showing the employer helpline
 * with the number directly visible (capsule/pill) and a tel: link.
 *
 * Surfaced on every employer-facing page where the customer might need to
 * call sales/support immediately:
 *   - /pricing/employer (top of page, above hero)
 *   - /auth/login/employer
 *   - /auth/register/employer
 *   - /employer (dashboard, top)               → `signedIn`
 *   - /employer/onboarding (top of shell)      → `signedIn`
 *
 * Pre-login surfaces show the shared toll-free number; only the signed-in
 * employer area passes `signedIn` to surface the dedicated helpline.
 *
 * Server-component compatible — no `'use client'` needed. Fully static.
 */

import { Phone } from 'lucide-react';
import { resolveEmployerHelpline, resolveEmployerHelplineHours } from '@/constants/support';
import TollFreeBadge from '@/components/support/TollFreeBadge';

interface EmployerHelplineBannerProps {
  /** Compact rendering — single-line, smaller padding (for cramped layouts). */
  compact?: boolean;
  /**
   * Border style. `edges` (default) = top + bottom borders only — looks
   * right when the banner spans the full viewport width. `rounded` = full
   * border + rounded-xl — looks right when nested inside a narrow card
   * (e.g. auth pages where the parent is max-w-md).
   */
  variant?: 'edges' | 'rounded';
  /**
   * Set ONLY on signed-in employer surfaces (dashboard, onboarding) to show
   * the dedicated employer helpline. Public/auth/pricing surfaces leave this
   * off and get the shared toll-free number.
   */
  signedIn?: boolean;
  /** Extra Tailwind classes for the wrapper. */
  className?: string;
}

export default function EmployerHelplineBanner({
  compact = false,
  variant = 'edges',
  signedIn = false,
  className,
}: EmployerHelplineBannerProps) {
  const phone = resolveEmployerHelpline(signedIn);
  const hours = resolveEmployerHelplineHours(signedIn);
  const borderStyle =
    variant === 'rounded'
      ? 'rounded-xl border border-[var(--primary)]/20'
      : 'border-y border-[var(--primary)]/20';
  return (
    <div
      className={`bg-primary-light ${borderStyle} ${compact ? 'py-2' : 'py-3'} ${className ?? ''}`}
      role="region"
      aria-label="Employer helpline"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 px-4 sm:flex-row sm:gap-4 sm:px-6 lg:px-8">
        <span className={`font-semibold text-[var(--primary)] ${compact ? 'text-xs' : 'text-sm'}`}>
          Employer helpline:
        </span>

        <a
          href={phone.href}
          className={`bg-primary inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-bold text-white shadow-sm transition-all hover:shadow-md hover:brightness-110 ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          <Phone className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          {phone.display}
        </a>

        {phone.tollFree && <TollFreeBadge size={compact ? 'xs' : 'sm'} />}

        <span className={`text-[var(--primary)]/80 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {hours}
        </span>
      </div>
    </div>
  );
}
