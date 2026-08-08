'use client';

import { type ReactNode, type MouseEvent } from 'react';
import { Crown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';

interface Props {
  /** Feature key (e.g. 'feature.urgent_hiring_badge') used both for the
   *  entitlement check and as the modal copy preset. */
  feature: string;
  children: ReactNode;
  /**
   * Visual variant:
   *   - 'overlay' — full-area dark overlay with a crown badge centered.
   *     Use for inputs/cards/blocks where the user must clearly see the
   *     content is locked.
   *   - 'corner' — small crown chip in the top-right corner. Use when the
   *     content can stay readable but should be tagged as Premium.
   *   - 'inline' — renders the children plus a small crown badge after the
   *     last child. Use for short labels (e.g. switch labels).
   */
  variant?: 'overlay' | 'corner' | 'inline';
  /** Tailwind classes for the wrapper. */
  className?: string;
  /** Skip the gating completely — useful for development or super-admin views. */
  skip?: boolean;
}

/**
 * Wraps any element. If the user does NOT possess the given feature key:
 *   - The wrapper becomes click-interceptable and the click opens the
 *     upgrade modal pre-filled for that feature.
 *   - A visual lock indicator is added (variant-dependent).
 *   - The inner content is rendered with `pointer-events: none` so the
 *     user can't accidentally activate it (free users can SEE the
 *     locked toggle, but flipping it is a no-op until they upgrade).
 *
 * If the user DOES have the feature, the wrapper is a transparent passthrough
 * with no extra DOM cost.
 *
 * Render the modal once per page tree:
 *
 *   const upgrade = useUpgradeModal();
 *   ...
 *   {upgrade.modal}
 *
 * — but `PremiumLockBadge` carries its own modal instance internally, so
 * if you only have one or two locked elements you can drop them in
 * directly without setting up the hook at the page level.
 */
export default function PremiumLockBadge({
  feature,
  children,
  variant = 'overlay',
  className,
  skip,
}: Props) {
  const { hasFeature, isLoading } = useEntitlements();
  const upgrade = useUpgradeModal();

  // While entitlements are loading, render children without the lock so we
  // don't flash a locked state on Premium users.
  if (skip || isLoading || hasFeature(feature)) {
    return <>{children}</>;
  }

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    upgrade.open({ feature });
  }

  if (variant === 'inline') {
    return (
      <>
        <span
          className={cn('relative inline-flex cursor-pointer items-center gap-1.5', className)}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          aria-label={`${feature} — Premium feature, click to upgrade`}
        >
          <span className="pointer-events-none opacity-90">{children}</span>
          <Tooltip content="Premium — click to upgrade">
            <span
              // Saturated amber + white text matches the shared upsell
              // visual language and stays legible on warm dashboard chrome.
              className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm dark:bg-amber-600"
            >
              <Crown className="h-3 w-3" /> Premium
            </span>
          </Tooltip>
        </span>
        {upgrade.modal}
      </>
    );
  }

  if (variant === 'corner') {
    return (
      <>
        <div
          className={cn('relative cursor-pointer', className)}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          aria-label={`${feature} — Premium feature, click to upgrade`}
        >
          <div className="pointer-events-none">{children}</div>
          <span className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            <Crown className="h-3 w-3" /> Premium
          </span>
        </div>
        {upgrade.modal}
      </>
    );
  }

  // 'overlay' — full-area dark overlay
  return (
    <>
      <div
        className={cn('group relative cursor-pointer', className)}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`${feature} — Premium feature, click to upgrade`}
      >
        <div className="pointer-events-none opacity-50">{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[inherit] bg-black/35 backdrop-blur-[1px] transition-colors group-hover:bg-black/45">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg">
            <Lock className="h-4 w-4" />
          </div>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase shadow-sm">
            <Crown className="h-3 w-3" /> Premium
          </span>
        </div>
      </div>
      {upgrade.modal}
    </>
  );
}
