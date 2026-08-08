'use client';

/**
 * ReviewsClient — interactive layer for /companies/[slug]/reviews.
 *
 * Owns:
 *   - URL-synced chip / sort / page state
 *   - Stats fetch (initially seeded from SSR)
 *   - List + facets fetch (TanStack Query)
 *   - Stat-card modal
 *   - Pagination + helpful voting + share
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, PenLine } from 'lucide-react';
import RatingBadge from '@/components/reviews/RatingBadge';
import ReviewStatsCards, { type StatCardKey } from '@/components/reviews/ReviewStatsCards';
import ReviewStatModal from '@/components/reviews/ReviewStatModal';
import ReviewFiltersBar from '@/components/reviews/ReviewFiltersBar';
import ReviewCard from '@/components/reviews/ReviewCard';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { companyReviewService } from '@/services/company-review.service';
import type { ReviewChip, ReviewFacets, ReviewSort, ReviewStatsResponse } from '@/types/review';
import { Star } from 'lucide-react';

interface Props {
  slug: string;
  companyName: string;
  companyLogo: string | null;
  initialStats: ReviewStatsResponse | null;
  appOrigin: string;
}

const PAGE_SIZE = 10;

function parseChip(s: string | null): ReviewChip | undefined {
  if (!s) return undefined;
  const allowed: ReviewChip[] = [
    'highly_rated',
    'critically_rated',
    'latest',
    'detailed',
    'work_life_balance',
    'salary',
    'promotions',
    'job_security',
    'skill_development',
    'work_satisfaction',
    'company_culture',
  ];
  return allowed.includes(s as ReviewChip) ? (s as ReviewChip) : undefined;
}

function parseSort(s: string | null): ReviewSort {
  const allowed: ReviewSort[] = [
    'latest',
    'helpful',
    'highest_rated',
    'lowest_rated',
    'most_detailed',
  ];
  return s && allowed.includes(s as ReviewSort) ? (s as ReviewSort) : 'latest';
}

export default function ReviewsClient({
  slug,
  companyName,
  companyLogo,
  initialStats,
  appOrigin,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const chip = parseChip(searchParams?.get('chip'));
  const sort = parseSort(searchParams?.get('sort'));
  const page = Math.max(1, Number(searchParams?.get('page') ?? 1));
  const pageSize = Math.max(1, Number(searchParams?.get('limit') ?? PAGE_SIZE) || PAGE_SIZE);
  const designation = searchParams?.get('designation') ?? undefined;
  const focusId = searchParams?.get('focus') ?? undefined;
  const isNew = searchParams?.get('new') === '1';

  const [statsModal, setStatsModal] = useState<StatCardKey | null>(null);
  const [sidebarFilters, setSidebarFilters] = useState<{
    gender?: string;
    workPolicy?: string;
    employmentType?: string;
    currentlyWorking?: string;
  }>({});

  function setUrlState(updates: Record<string, string | undefined | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }

  // Stats (initial SSR + refetch on focus changes — cheap aggregate read)
  const { data: stats } = useQuery({
    queryKey: ['reviews', 'stats', slug],
    queryFn: () => companyReviewService.getStats(slug),
    initialData: initialStats ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  // Facets
  const { data: facets } = useQuery<ReviewFacets>({
    queryKey: ['reviews', 'facets', slug],
    queryFn: () => companyReviewService.getFacets(slug),
    staleTime: 5 * 60 * 1000,
  });

  // Reviews list
  const { data: list, isLoading } = useQuery({
    queryKey: ['reviews', 'list', slug, page, pageSize, sort, chip, designation, sidebarFilters],
    queryFn: () =>
      companyReviewService.list(slug, {
        page,
        limit: pageSize,
        sort,
        chip,
        designation,
        gender: sidebarFilters.gender as never,
        workPolicy: sidebarFilters.workPolicy as never,
        employmentType: sidebarFilters.employmentType as never,
        currentlyWorking:
          sidebarFilters.currentlyWorking === 'true'
            ? true
            : sidebarFilters.currentlyWorking === 'false'
              ? false
              : undefined,
      }),
  });

  // Scroll to focused review on mount.
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`review-${focusId}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    }
  }, [focusId, list]);

  const items = list?.items ?? [];
  const total = list?.pagination.total ?? 0;
  const totalPages = list?.pagination.totalPages ?? 0;

  const reviewsHref = `/companies/${encodeURIComponent(slug)}/reviews`;

  async function handleVote(reviewId: string, helpful: boolean) {
    await companyReviewService.vote(reviewId, helpful);
  }

  return (
    <div className="space-y-6">
      {isNew && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">
          Thanks for sharing your review! It&apos;s now visible to other candidates.
        </div>
      )}

      {/* Hero */}
      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          {companyLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={companyLogo}
              alt=""
              className="h-12 w-12 rounded-lg bg-white object-contain"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{companyName} reviews</h1>
            <div className="mt-1">
              <RatingBadge
                rating={stats?.averageOverall ?? 0}
                count={stats?.totalReviews ?? 0}
                size="sm"
              />
            </div>
          </div>
        </div>
        <Link
          href={`/companies/${encodeURIComponent(slug)}/reviews/write`}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--primary-dark,_#1d4ed8)]"
        >
          <PenLine className="h-4 w-4" />
          Write a review
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stat cards */}
      {stats && <ReviewStatsCards stats={stats} onCardClick={(key) => setStatsModal(key)} />}

      {/* AEO direct-answer paragraph (speakable) — concise, factual
          summary read by AI search engines. */}
      <p
        data-speakable="true"
        className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        {companyName}{' '}
        {stats && stats.totalReviews > 0
          ? `has an overall rating of ${stats.averageOverall.toFixed(1)} out of 5 from ${stats.totalReviews.toLocaleString()} employee ${stats.totalReviews === 1 ? 'review' : 'reviews'} on Hire Adda${stats.industry?.average != null ? `, compared to the ${stats.industry.name ?? 'industry'} average of ${stats.industry.average.toFixed(1)}` : ''}. ${stats.topJobProfiles[0] ? `Most reviews come from ${stats.topJobProfiles[0].designation}.` : ''}`
          : 'has no reviews yet on Hire Adda. Be the first to share your experience.'}
      </p>

      {/* Filters bar + sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="hidden space-y-4 lg:block">
          <FacetSidebar
            facets={facets}
            values={sidebarFilters}
            onChange={(updates) => setSidebarFilters((prev) => ({ ...prev, ...updates }))}
            onClear={() => setSidebarFilters({})}
          />
        </aside>
        {/* `min-w-0` is mandatory on grid/flex items whose children have
            their own horizontal scroll (here: the chip row inside
            ReviewFiltersBar). Without it, the grid item's default
            `min-width: auto` lets it grow to fit its content's intrinsic
            width — pushing the right column past `1fr` and overflowing
            the viewport. With it, the `overflow-x-auto` inside the chip
            row actually scrolls. */}
        <div className="min-w-0 space-y-4">
          <ReviewFiltersBar
            totalReviews={total}
            activeChip={chip}
            activeSort={sort}
            onChipClick={(c) => setUrlState({ chip: c, page: '1' })}
            onSortChange={(s) => setUrlState({ sort: s, page: '1' })}
          />
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5"
                >
                  <Skeleton variant="text" lines={5} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No reviews match the current filters"
              description="Try clearing chips or sidebar filters."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSidebarFilters({});
                    setUrlState({ chip: undefined, page: '1', designation: undefined });
                  }}
                  className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {items.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  shareUrl={`${appOrigin}${reviewsHref}?focus=${review.id}`}
                  onVote={handleVote}
                  onChipClick={(c) => setUrlState({ chip: c, page: '1' })}
                  highlight={focusId === review.id}
                />
              ))}
            </div>
          )}
          {total > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => setUrlState({ page: String(p) })}
              totalItems={total}
              pageSize={pageSize}
              onPageSizeChange={(s) => setUrlState({ limit: String(s), page: '1' })}
            />
          )}
        </div>
      </div>

      {statsModal && stats && (
        <ReviewStatModal stats={stats} cardKey={statsModal} onClose={() => setStatsModal(null)} />
      )}
    </div>
  );
}

function FacetSidebar({
  facets,
  values,
  onChange,
  onClear,
}: {
  facets?: ReviewFacets;
  values: {
    gender?: string;
    workPolicy?: string;
    employmentType?: string;
    currentlyWorking?: string;
  };
  onChange: (u: Partial<typeof values>) => void;
  onClear: () => void;
}) {
  if (!facets) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
        <Skeleton variant="text" lines={6} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">Filters</h3>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-[var(--primary)] hover:underline"
        >
          Clear
        </button>
      </div>
      <FacetGroup
        title="Gender"
        options={facets.gender.map((g) => ({
          value: g.value,
          label: humaniseGender(g.value),
          count: g.count,
        }))}
        value={values.gender}
        onChange={(v) => onChange({ gender: v })}
      />
      <FacetGroup
        title="Work policy"
        options={facets.workPolicy.map((p) => ({
          value: p.value,
          label:
            p.value === 'PERMANENT_WFH' ? 'Remote' : p.value === 'HYBRID' ? 'Hybrid' : 'On-site',
          count: p.count,
        }))}
        value={values.workPolicy}
        onChange={(v) => onChange({ workPolicy: v })}
      />
      <FacetGroup
        title="Employment type"
        options={facets.employmentType.map((e) => ({
          value: e.value,
          label: humaniseEmployment(e.value),
          count: e.count,
        }))}
        value={values.employmentType}
        onChange={(v) => onChange({ employmentType: v })}
      />
      <FacetGroup
        title="Currently working?"
        options={facets.currentlyWorking.map((c) => ({
          value: String(c.value),
          label: c.value ? 'Yes — current employee' : 'No — former employee',
          count: c.count,
        }))}
        value={values.currentlyWorking}
        onChange={(v) => onChange({ currentlyWorking: v })}
      />
    </div>
  );
}

function FacetGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: string; label: string; count: number }[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        {title}
      </h4>
      <div className="space-y-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(active ? undefined : opt.value)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                active
                  ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              <span>{opt.label}</span>
              <span className="tabular-nums opacity-60">{opt.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function humaniseGender(g: string): string {
  switch (g) {
    case 'FEMALE':
      return 'Female';
    case 'MALE':
      return 'Male';
    case 'TRANSGENDER':
      return 'Transgender';
    case 'PREFER_NOT_TO_SAY':
      return 'Prefer not to say';
    default:
      return g;
  }
}

function humaniseEmployment(e: string): string {
  switch (e) {
    case 'PERMANENT':
      return 'Permanent';
    case 'CONTRACT':
      return 'Contract';
    case 'INTERNSHIP':
      return 'Internship';
    case 'TRAINEE':
      return 'Trainee';
    case 'PART_TIME':
      return 'Part-time';
    case 'TEMPORARY':
      return 'Temporary';
    case 'FREELANCE':
      return 'Freelance';
    default:
      return e;
  }
}

export {};
