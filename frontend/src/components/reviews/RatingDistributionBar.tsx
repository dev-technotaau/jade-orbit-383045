'use client';

/**
 * RatingDistributionBar — five-row distribution chart
 *
 *   5 ★ ████████████ 65%  812
 *   4 ★ █████        18%  225
 *   3 ★ ██            8%  100
 *   2 ★ █             5%   62
 *   1 ★ █             4%   48
 *
 * Used inside the stats modal on the dedicated reviews page.
 */
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DistributionRow {
  star: number;
  count: number;
  percent: number;
}

interface Props {
  distribution: DistributionRow[];
  showCounts?: boolean;
  className?: string;
}

export default function RatingDistributionBar({
  distribution,
  showCounts = true,
  className,
}: Props) {
  const ordered = [...distribution].sort((a, b) => b.star - a.star);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {ordered.map((row) => (
        <div
          key={row.star}
          className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
        >
          <span className="flex w-7 shrink-0 items-center gap-0.5 font-medium">
            {row.star}
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
          </span>
          <div
            className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
            role="progressbar"
            aria-valuenow={row.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all"
              style={{ width: `${Math.max(0, Math.min(row.percent, 100))}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums">{row.percent.toFixed(0)}%</span>
          {showCounts && (
            <span className="w-12 shrink-0 text-right tabular-nums opacity-80">{row.count}</span>
          )}
        </div>
      ))}
    </div>
  );
}
