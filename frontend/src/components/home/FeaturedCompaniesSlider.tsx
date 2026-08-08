'use client';

/**
 * Section 3 — "Featured Companies Actively Hiring".
 *
 * Tall card slider, 5 visible per slide × 3 slides = 15 total.
 * Each card:
 *   - logo (top)
 *   - company name
 *   - tagline / heading (max 2 lines)
 *   - "View jobs" button
 * Click anywhere on the card → /companies/{slug}?tab=overview
 * Click "View jobs" button → /companies/{slug}?tab=jobs
 *
 * Below the slider: "View all companies" button → /companies?featured=true.
 *
 * Featured ranking is computed server-side: companies with the most
 * recent posting activity (last 60 days) bubble to the top.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Briefcase,
  ArrowRight,
} from 'lucide-react';
import { publicStatsService, type FeaturedCompany } from '@/services/public-stats.service';
import { isOptimisableImageHost } from '@/lib/image-host';
import RatingBadge from '@/components/reviews/RatingBadge';
import { useSnapSlider } from '@/hooks/use-snap-slider';

const TOTAL_SLOTS = 15;

interface Props {
  className?: string;
}

export default function FeaturedCompaniesSlider({ className }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['public-companies-featured'],
    queryFn: () => publicStatsService.featuredCompanies(TOTAL_SLOTS),
    staleTime: 30 * 60 * 1000,
  });

  const items = useMemo(() => (data ?? []).slice(0, TOTAL_SLOTS), [data]);
  const { trackRef, atStart, atEnd, pageCount, activePage, sync, scrollByPage, scrollToPage } =
    useSnapSlider();

  // Re-measure once the cards render / their count changes.
  useEffect(() => {
    sync();
  }, [items.length, sync]);

  if (!isLoading && items.length === 0) return null;

  return (
    <section
      aria-label="Featured companies actively hiring"
      className={`mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 ${className ?? ''}`}
    >
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Featured Companies Actively Hiring
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Hand-picked employers posting new roles daily.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Previous companies"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            className="rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next companies"
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
        // overflow-x-auto implicitly clips overflow-y too — symmetric py-2
        // prevents the card hover-lift / shadow from being chopped at the top.
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        style={{ scrollbarWidth: 'none' }}
      >
        {(isLoading ? Array.from({ length: 5 }) : items).map((raw, i) => {
          const entry = raw as FeaturedCompany | undefined;
          const widthClass =
            'min-w-[calc(100%-1rem)] sm:min-w-[calc(50%-0.5rem)] md:min-w-[calc(33.333%-0.75rem)] lg:min-w-[calc(20%-0.8rem)]';
          if (!entry) {
            return (
              <li
                key={`s-${i}`}
                role="listitem"
                className={`${widthClass} snap-start rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5`}
              >
                <div className="h-56 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
              </li>
            );
          }

          // Click on card → Overview tab. Click "View Jobs" → Jobs tab.
          const overviewHref = `/companies/${entry.slug}?tab=overview`;
          const jobsHref = `/companies/${entry.slug}?tab=jobs`;

          return (
            <li key={entry.id} role="listitem" className={`${widthClass} snap-start`}>
              <article className="group relative flex h-full flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-5 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md">
                {/* Card-level "view overview" link covers the whole card.
                    Explicit interactive elements below (name link, view-jobs
                    button) sit on a higher stacking context via `relative
                    z-10` so they intercept their own clicks first. */}
                <Link
                  href={overviewHref}
                  aria-label={`View ${entry.companyName} overview`}
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />

                {/* Logo */}
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-tertiary)]">
                  {entry.logo ? (
                    <Image
                      src={entry.logo}
                      alt={entry.companyName}
                      width={56}
                      height={56}
                      sizes="56px"
                      loading="lazy"
                      unoptimized={!isOptimisableImageHost(entry.logo)}
                      className="h-14 w-14 rounded-xl object-contain"
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
                  )}
                </div>

                {/* Name + verified badge */}
                <div className="relative z-10 flex items-center gap-1">
                  <span className="line-clamp-1 text-sm font-bold text-[var(--text)]">
                    {entry.companyName}
                  </span>
                  {entry.isVerified && (
                    <ShieldCheck
                      className="h-3.5 w-3.5 shrink-0 text-[var(--success)]"
                      aria-label="GST verified"
                    />
                  )}
                </div>

                {/* Rating badge — degrades gracefully when no reviews. */}
                <div className="relative z-10">
                  <RatingBadge
                    rating={entry.averageRating ?? 0}
                    count={entry.totalReviews ?? 0}
                    size="xs"
                  />
                </div>

                {/* Tagline / heading — max 2 lines */}
                <p className="relative z-10 line-clamp-2 min-h-[2.5em] text-xs leading-snug text-[var(--text-secondary)]">
                  {entry.tagline?.trim() || entry.industry || 'Actively hiring on Hire Adda'}
                </p>

                {/* Open jobs badge */}
                <span className="bg-success/10 text-success-dark relative z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  <Briefcase className="h-3 w-3" />
                  {entry.openJobsCount} {entry.openJobsCount === 1 ? 'job' : 'jobs'}
                </span>

                {/* View jobs CTA — stops propagation so the card-level
                    overview link doesn't fire. */}
                <Link
                  href={jobsHref}
                  className="bg-primary text-primary-foreground relative z-10 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
                >
                  View jobs
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </article>
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

      {/* "View all companies" button → featured-filtered listing */}
      <div className="mt-6 text-center">
        <Link
          href="/companies?featured=true"
          className="text-primary hover:bg-primary/5 inline-flex items-center gap-1 rounded-lg border border-[var(--primary)]/30 px-4 py-2 text-sm font-semibold transition-colors"
        >
          View all companies
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
