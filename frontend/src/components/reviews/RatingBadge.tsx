'use client';

/**
 * RatingBadge — compact `★ 4.2 · 1.2k reviews` badge.
 *
 * Designed to drop in next to a company name everywhere on the platform.
 * Degrades to "★ — · 0 reviews" when the company has no reviews yet,
 * and to "Be the first to review" with optional CTA when wired with `linkToReviews`.
 *
 * Props:
 *   - rating: 0-5 (decimal, eg 4.2). Pass 0 for "no reviews yet".
 *   - count: total review count.
 *   - size: 'xs' | 'sm' | 'md' (defaults md).
 *   - href: optional anchor — if provided, the whole badge becomes a link.
 *   - showCount: include `· {count} reviews` (default true).
 */
import Link from 'next/link';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RatingBadgeSize = 'xs' | 'sm' | 'md';

interface RatingBadgeProps {
  rating: number;
  count: number;
  size?: RatingBadgeSize;
  href?: string;
  showCount?: boolean;
  className?: string;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

const SIZE_CLASSES: Record<RatingBadgeSize, { wrap: string; icon: string }> = {
  xs: { wrap: 'gap-0.5 text-[10px] px-1.5 py-0.5', icon: 'h-3 w-3' },
  sm: { wrap: 'gap-1 text-xs px-2 py-0.5', icon: 'h-3.5 w-3.5' },
  md: { wrap: 'gap-1 text-sm px-2.5 py-1', icon: 'h-4 w-4' },
};

export default function RatingBadge({
  rating,
  count,
  size = 'md',
  href,
  showCount = true,
  className,
}: RatingBadgeProps) {
  const sz = SIZE_CLASSES[size];
  const hasReviews = count > 0 && rating > 0;

  const inner = (
    <span
      className={cn(
        'inline-flex items-center rounded-md border bg-[var(--bg)] leading-none font-medium',
        hasReviews
          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700/30 dark:bg-amber-900/10 dark:text-amber-200'
          : 'border-[var(--border)] text-[var(--text-muted)]',
        sz.wrap,
        className,
      )}
      aria-label={
        hasReviews ? `${rating.toFixed(1)} stars from ${count} reviews` : 'No reviews yet'
      }
    >
      <Star
        className={cn(
          sz.icon,
          hasReviews ? 'fill-amber-400 text-amber-400' : 'text-[var(--text-muted)]',
        )}
        aria-hidden="true"
      />
      {hasReviews ? (
        <>
          <span>{rating.toFixed(1)}</span>
          {showCount && (
            <>
              <span aria-hidden="true" className="opacity-60">
                ·
              </span>
              <span>{formatCount(count)}</span>
            </>
          )}
        </>
      ) : (
        <span>No reviews</span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}
