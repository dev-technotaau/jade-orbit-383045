'use client';

/**
 * ReviewStatsCards — 4 clickable cards on the dedicated reviews page.
 *
 *   Card 1: Overall (avg + total)
 *   Card 2: Men say (avg + count + percent)
 *   Card 3: Women say (avg + count + percent)
 *   Card 4: vs Industry (diff + industry avg)
 *
 * Each card opens a modal with deeper drill-down. We expose the
 * `onCardClick` callback so the parent owns the modal state.
 */
import { Star, Users, User2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewStatsResponse } from '@/types/review';

export type StatCardKey = 'overall' | 'men' | 'women' | 'industry';

interface Props {
  stats: ReviewStatsResponse;
  onCardClick: (key: StatCardKey) => void;
}

export default function ReviewStatsCards({ stats, onCardClick }: Props) {
  const total = stats.totalReviews;
  const diff = stats.industry.diff;
  const TrendIcon = diff == null ? Minus : diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const trendClass =
    diff == null
      ? 'text-[var(--text-muted)]'
      : diff > 0
        ? 'text-emerald-600'
        : diff < 0
          ? 'text-rose-600'
          : 'text-[var(--text-muted)]';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        onClick={() => onCardClick('overall')}
        title="Overall rating"
        icon={<Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
      >
        <div className="text-3xl font-bold text-[var(--text)] tabular-nums">
          {stats.averageOverall ? stats.averageOverall.toFixed(1) : '—'}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          {total > 0
            ? `Based on ${total.toLocaleString()} ${total === 1 ? 'review' : 'reviews'}`
            : 'No reviews yet'}
        </div>
      </Card>

      <Card
        onClick={() => onCardClick('men')}
        title="Men say"
        icon={<User2 className="h-4 w-4 text-[var(--text-muted)]" />}
      >
        <div className="text-3xl font-bold text-[var(--text)] tabular-nums">
          {stats.men.average != null ? stats.men.average.toFixed(1) : '—'}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          {stats.men.count > 0
            ? `${stats.men.count} reviews · ${stats.men.percent.toFixed(0)}%`
            : 'Not enough data'}
        </div>
      </Card>

      <Card
        onClick={() => onCardClick('women')}
        title="Women say"
        icon={<Users className="h-4 w-4 text-[var(--text-muted)]" />}
      >
        <div className="text-3xl font-bold text-[var(--text)] tabular-nums">
          {stats.women.average != null ? stats.women.average.toFixed(1) : '—'}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          {stats.women.count > 0
            ? `${stats.women.count} reviews · ${stats.women.percent.toFixed(0)}%`
            : 'Not enough data'}
        </div>
      </Card>

      <Card
        onClick={() => onCardClick('industry')}
        title="vs Industry"
        icon={<TrendIcon className={cn('h-4 w-4', trendClass)} />}
      >
        <div className={cn('text-3xl font-bold tabular-nums', trendClass)}>
          {diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : '—'}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          {stats.industry.average != null && stats.industry.name
            ? `${stats.industry.name} avg ${stats.industry.average.toFixed(1)}`
            : 'Industry data unavailable'}
        </div>
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-all hover:border-[var(--primary)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
          {title}
        </span>
        {icon}
      </div>
      {children}
    </button>
  );
}
