'use client';

/**
 * Section 2 — "Top Companies Hiring Now" — manual horizontal slider of
 * company-category cards. Each card surfaces:
 *   - category title
 *   - total companies actively hiring (≥1 OPEN public job)
 *   - 3–4 sample company logos
 *
 * 5 cards visible per slide (responsive — fewer on small screens).
 * Prev/next nav buttons. Click anywhere on a card → category landing
 * page (same destination as the header mega-menu / footer).
 *
 * Data: GET /api/v1/public/company-categories/stats (~10 entries).
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { publicStatsService, type CompanyCategoryStat } from '@/services/public-stats.service';
import { isOptimisableImageHost } from '@/lib/image-host';
import RatingBadge from '@/components/reviews/RatingBadge';
import { useSnapSlider } from '@/hooks/use-snap-slider';

interface Props {
  className?: string;
}

export default function TopCompanyCategoriesSlider({ className }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['public-company-category-stats'],
    queryFn: () => publicStatsService.companyCategoryStats(),
    staleTime: 30 * 60 * 1000,
  });

  const items = useMemo(() => (data ?? []).slice(0, 15), [data]);
  const { trackRef, atStart, atEnd, pageCount, activePage, sync, scrollByPage, scrollToPage } =
    useSnapSlider();

  useEffect(() => {
    sync();
  }, [items.length, sync]);

  if (!isLoading && items.length === 0) return null;

  return (
    <section
      aria-label="Top companies hiring now by category"
      className={`mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 ${className ?? ''}`}
    >
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Top Companies Hiring Now
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Browse verified employers by category — pick a sector and dive in.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Previous categories"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            className="rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next categories"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            className="rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <ul
        ref={trackRef}
        onScroll={sync}
        role="list"
        // `overflow-x-auto` makes overflow-y implicitly non-visible too, so we
        // need symmetric vertical padding (py-2) — without it the cards' hover
        // lift (`-translate-y-0.5`) + shadow gets clipped at the top edge.
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        style={{ scrollbarWidth: 'none' }}
      >
        {(isLoading ? Array.from({ length: 5 }) : items).map((raw, i) => {
          const entry = raw as CompanyCategoryStat | undefined;
          // Width math — show 5 desktop, 3 tablet, 1 mobile.
          const widthClass =
            'min-w-[calc(100%-1rem)] sm:min-w-[calc(33.333%-0.75rem)] lg:min-w-[calc(20%-0.8rem)]';
          if (!entry) {
            return (
              <li
                key={`s-${i}`}
                role="listitem"
                className={`${widthClass} snap-start rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5`}
              >
                <div className="h-32 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
              </li>
            );
          }
          return (
            <li key={entry.slug} role="listitem" className={`${widthClass} snap-start`}>
              <Link
                href={entry.href}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-[var(--border)] bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-bold text-[var(--text)]">
                    {entry.label}
                  </h3>
                  <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
                    {entry.totalCompanies.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {entry.totalCompanies > 0
                    ? `${entry.totalCompanies.toLocaleString('en-IN')} ${
                        entry.totalCompanies === 1 ? 'company' : 'companies'
                      } actively hiring`
                    : 'Browse this category'}
                </p>
                {(entry.totalReviews ?? 0) > 0 && entry.averageRating != null && (
                  <RatingBadge
                    rating={entry.averageRating}
                    count={entry.totalReviews ?? 0}
                    size="xs"
                  />
                )}
                {/* Sample logos row */}
                <div className="mt-auto flex items-center -space-x-2">
                  {entry.sampleLogos.slice(0, 4).map((logo) => (
                    <span
                      key={logo}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--bg-tertiary)] shadow-sm"
                    >
                      <Image
                        src={logo}
                        alt=""
                        width={28}
                        height={28}
                        sizes="28px"
                        loading="lazy"
                        unoptimized={!isOptimisableImageHost(logo)}
                        className="h-7 w-7 rounded-full object-contain"
                      />
                    </span>
                  ))}
                  {entry.sampleLogos.length === 0 && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--bg-tertiary)]">
                      <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                    </span>
                  )}
                  {entry.totalCompanies > entry.sampleLogos.length && (
                    <span className="ml-3 text-[11px] font-semibold text-[var(--text-muted)] group-hover:text-[var(--primary)]">
                      +{(entry.totalCompanies - entry.sampleLogos.length).toLocaleString('en-IN')}{' '}
                      more
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Dot indicators */}
      {!isLoading && pageCount > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === activePage}
              onClick={() => scrollToPage(i)}
              className={`h-2 rounded-full transition-all ${
                i === activePage
                  ? 'bg-primary w-6'
                  : 'w-2 bg-[var(--border)] hover:bg-[var(--text-muted)]'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
