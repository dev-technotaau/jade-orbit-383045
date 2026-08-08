/**
 * TollFreeBadge — a small "Toll-free" pill shown beside a support number
 * that costs the caller nothing. Purely presentational and server-component
 * compatible (no `'use client'`), so it can sit inside static banners as
 * well as client-side modals.
 *
 * Render it conditionally on `SupportPhone.tollFree` so the badge always
 * tracks the number actually being displayed:
 *
 *   {phone.tollFree && <TollFreeBadge />}
 */

import { cn } from '@/lib/utils';

interface TollFreeBadgeProps {
  /** `xs` for dense rows (headers, inline meta), `sm` for cards/banners. */
  size?: 'xs' | 'sm';
  className?: string;
}

export default function TollFreeBadge({ size = 'sm', className }: TollFreeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center rounded-full bg-[var(--success-light)] font-semibold whitespace-nowrap text-[var(--success-dark)]',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        className,
      )}
      // Screen readers get the fuller phrasing; sighted users see the pill.
      aria-label="This is a toll-free number"
    >
      Toll-free
    </span>
  );
}
