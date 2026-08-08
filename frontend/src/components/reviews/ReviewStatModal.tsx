'use client';

/**
 * ReviewStatModal — modal opened by clicking a stat card. Renders
 * different content per card key:
 *   - overall: distribution bar + criteria averages
 *   - men: men-specific average + percent
 *   - women: women-specific average + percent
 *   - industry: side-by-side comparison (company vs industry)
 */
import { X, Star } from 'lucide-react';
import RatingDistributionBar from './RatingDistributionBar';
import CriteriaBars from './CriteriaBars';
import type { StatCardKey } from './ReviewStatsCards';
import type { ReviewStatsResponse } from '@/types/review';

interface Props {
  stats: ReviewStatsResponse;
  cardKey: StatCardKey;
  onClose: () => void;
}

export default function ReviewStatModal({ stats, cardKey, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stats detail"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--text)]">
            {cardKey === 'overall' && 'Overall rating breakdown'}
            {cardKey === 'men' && 'Reviews by men'}
            {cardKey === 'women' && 'Reviews by women'}
            {cardKey === 'industry' && 'Comparison vs industry'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cardKey === 'overall' && <OverallContent stats={stats} />}
        {cardKey === 'men' && <DemographicContent stats={stats} kind="men" />}
        {cardKey === 'women' && <DemographicContent stats={stats} kind="women" />}
        {cardKey === 'industry' && <IndustryContent stats={stats} />}
      </div>
    </div>
  );
}

function OverallContent({ stats }: { stats: ReviewStatsResponse }) {
  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold text-[var(--text)]">
          {stats.averageOverall.toFixed(1)}
        </span>
        <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
        <span className="text-sm text-[var(--text-muted)]">
          out of 5 · {stats.totalReviews} reviews
        </span>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Rating distribution</h3>
        <RatingDistributionBar distribution={stats.distribution} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">By criteria</h3>
        <CriteriaBars
          criteria={[
            { label: 'Work-life balance', value: stats.averageWorkLifeBalance },
            { label: 'Salary', value: stats.averageSalary },
            { label: 'Promotions', value: stats.averagePromotions },
            { label: 'Job security', value: stats.averageJobSecurity },
            { label: 'Skill development', value: stats.averageSkillDev },
            { label: 'Work satisfaction', value: stats.averageWorkSatisfaction },
            { label: 'Company culture', value: stats.averageCompanyCulture },
          ]}
        />
      </div>
    </div>
  );
}

function DemographicContent({
  stats,
  kind,
}: {
  stats: ReviewStatsResponse;
  kind: 'men' | 'women';
}) {
  const data = kind === 'men' ? stats.men : stats.women;
  const label = kind === 'men' ? 'Men' : 'Women';
  if (!data.count || data.average == null) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center text-sm text-[var(--text-muted)]">
        Not enough reviews to surface a {label.toLowerCase()} breakdown yet.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold text-[var(--text)]">{data.average.toFixed(1)}</span>
        <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
        <span className="text-sm text-[var(--text-muted)]">out of 5</span>
      </div>
      <div className="text-sm text-[var(--text-secondary)]">
        Based on <strong>{data.count}</strong> reviews from {label.toLowerCase()}, who make up{' '}
        <strong>{data.percent.toFixed(0)}%</strong> of total reviews.
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        Comparison to overall: <strong>{stats.averageOverall.toFixed(1)}</strong>
      </div>
    </div>
  );
}

function IndustryContent({ stats }: { stats: ReviewStatsResponse }) {
  if (stats.industry.average == null) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center text-sm text-[var(--text-muted)]">
        Industry comparison data isn&apos;t available yet — too few peers in the same industry have
        reviews.
      </div>
    );
  }
  const diff = stats.industry.diff ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-center">
          <div className="text-xs text-[var(--text-muted)]">This company</div>
          <div className="mt-1 text-3xl font-bold text-[var(--text)]">
            {stats.averageOverall.toFixed(1)}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-center">
          <div className="text-xs text-[var(--text-muted)]">
            {stats.industry.name ?? 'Industry'} avg
          </div>
          <div className="mt-1 text-3xl font-bold text-[var(--text)]">
            {stats.industry.average.toFixed(1)}
          </div>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        This company is{' '}
        <strong className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : ''}>
          {Math.abs(diff).toFixed(1)} {diff >= 0 ? 'higher' : 'lower'}
        </strong>{' '}
        than the {stats.industry.name ?? 'industry'} average.
      </p>
    </div>
  );
}
