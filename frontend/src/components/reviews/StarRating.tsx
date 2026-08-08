'use client';

/**
 * StarRating — shared 1-5 star control.
 *
 * Two modes:
 *   - readonly={true} — displays a static rating (used in cards, badges).
 *   - readonly={false} — interactive (used in the form).
 *
 * The `showLabel` variant displays the AmbitionBox-style emoji label
 * ("Bad / Poor / Average / Good / Excellent") below the stars when
 * the value > 0. Used by the form's criteria rows.
 */
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const RATING_LABELS: Record<number, string> = {
  1: '😞 Bad',
  2: '🙁 Poor',
  3: '😐 Average',
  4: '🙂 Good',
  5: '🤩 Excellent',
};

export type StarRatingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: StarRatingSize;
  readonly?: boolean;
  showLabel?: boolean;
  className?: string;
  /** Aria-labelled-by for screen readers (form fieldset). */
  ariaLabel?: string;
}

const SIZE_TO_PX: Record<StarRatingSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
};

export default function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
  showLabel = false,
  className,
  ariaLabel,
}: StarRatingProps) {
  const px = SIZE_TO_PX[size];
  const interactive = !readonly && typeof onChange === 'function';

  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <div
        className="inline-flex items-center gap-0.5"
        role={interactive ? 'radiogroup' : 'img'}
        aria-label={ariaLabel ?? (interactive ? 'Select rating' : `${value} out of 5`)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= value;
          if (!interactive) {
            return (
              <Star
                key={n}
                width={px}
                height={px}
                aria-hidden="true"
                className={cn(
                  filled ? 'fill-amber-400 text-amber-400' : 'fill-none text-[var(--text-muted)]',
                )}
              />
            );
          }
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === value}
              aria-label={`Rate ${n} of 5 — ${RATING_LABELS[n].slice(2)}`}
              onClick={() => onChange?.(n)}
              className={cn(
                'rounded p-0.5 transition-colors hover:scale-110',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
              )}
            >
              <Star
                width={px}
                height={px}
                aria-hidden="true"
                className={cn(
                  filled
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-none text-[var(--text-muted)] hover:text-amber-400',
                )}
              />
            </button>
          );
        })}
      </div>
      {showLabel && value > 0 && (
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}
