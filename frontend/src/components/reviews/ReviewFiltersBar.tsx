'use client';

/**
 * ReviewFiltersBar — total count + sort + chip row.
 *
 * Chips:
 *   - Highly rated (overall ≥ 4)
 *   - Critically rated (overall ≤ 2)
 *   - Latest (last 30 days)
 *   - Detailed (isDetailed=true)
 *   - 7 criteria chips (work_life_balance, salary, …)
 *
 * Each chip is URL-driven via the `chip` query param. Sort similarly
 * via the `sort` param. Parent owns the URL state — we expose
 * `activeChip` / `activeSort` + `onChipClick` / `onSortChange`.
 */
import { cn } from '@/lib/utils';
import Select from '@/components/ui/Select';
import type { ReviewChip, ReviewSort } from '@/types/review';

interface Props {
  totalReviews: number;
  activeChip?: ReviewChip;
  activeSort: ReviewSort;
  onChipClick: (chip: ReviewChip | undefined) => void;
  onSortChange: (sort: ReviewSort) => void;
}

const CHIPS: { key: ReviewChip; label: string }[] = [
  { key: 'highly_rated', label: 'Highly rated' },
  { key: 'critically_rated', label: 'Critically rated' },
  { key: 'latest', label: 'Latest' },
  { key: 'detailed', label: 'Detailed reviews' },
  { key: 'work_life_balance', label: 'Work-life balance' },
  { key: 'salary', label: 'Salary' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'job_security', label: 'Job security' },
  { key: 'skill_development', label: 'Skill development' },
  { key: 'work_satisfaction', label: 'Work satisfaction' },
  { key: 'company_culture', label: 'Company culture' },
];

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'highest_rated', label: 'Highest rated' },
  { value: 'lowest_rated', label: 'Lowest rated' },
  { value: 'most_detailed', label: 'Most detailed' },
];

export default function ReviewFiltersBar({
  totalReviews,
  activeChip,
  activeSort,
  onChipClick,
  onSortChange,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text)]">{totalReviews.toLocaleString()}</strong>{' '}
          {totalReviews === 1 ? 'review' : 'reviews'}
        </div>
        <div className="relative inline-flex items-center gap-2 text-sm">
          <label htmlFor="review-sort" className="text-[var(--text-secondary)]">
            Sort:
          </label>
          <Select
            id="review-sort"
            value={activeSort}
            onChange={(val) => onSortChange(val as ReviewSort)}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            clearable={false}
            size="sm"
            className="w-44"
          />
        </div>
      </div>

      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((c) => {
          const active = activeChip === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChipClick(active ? undefined : c.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all',
                active
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]',
              )}
              aria-pressed={active}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
