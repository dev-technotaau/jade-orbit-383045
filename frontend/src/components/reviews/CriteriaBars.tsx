'use client';

/**
 * CriteriaBars — horizontal mini-bar for each of the 7 review criteria.
 * Used inside the review card. Switches to a horizontally-scrollable
 * layout on narrow viewports so the bars don't squish.
 */
import { cn } from '@/lib/utils';

interface CriteriaValue {
  label: string;
  value: number; // 1-5
}

interface Props {
  criteria: CriteriaValue[];
  className?: string;
}

export default function CriteriaBars({ criteria, className }: Props) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4', className)}
    >
      {criteria.map((c) => (
        <div key={c.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span className="truncate">{c.label}</span>
            <span className="font-semibold text-[var(--text)] tabular-nums">
              {c.value.toFixed(1)}
            </span>
          </div>
          <div
            className="relative h-1.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
            role="progressbar"
            aria-valuenow={c.value}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-label={`${c.label}: ${c.value} of 5`}
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all',
                c.value >= 4 ? 'bg-emerald-500' : c.value >= 3 ? 'bg-amber-400' : 'bg-rose-400',
              )}
              style={{ width: `${(c.value / 5) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
