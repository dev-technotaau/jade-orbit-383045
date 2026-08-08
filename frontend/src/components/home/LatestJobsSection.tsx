'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { type PublicJobCardData } from '@/components/job-search/PublicJobCard';
import HomeJobCard from '@/components/home/HomeJobCard';
import { publicJobsService } from '@/services/public-jobs.service';
import SectionBackdrop from '@/components/home/SectionBackdrop';
import { useSnapSlider } from '@/hooks/use-snap-slider';

const LIMIT = 6;

/**
 * LatestJobsSection — a live glimpse of real open roles on the homepage,
 * pulled from the public jobs API (guest-safe). Renders HomeJobCard (the
 * homepage-tuned card that reuses PublicJobCard's exact auth-gate logic) so
 * the cards are authentic and every gated action bounces guests through the
 * auth gate. Hides itself when empty.
 *
 * Layout is the same scroll-snap carousel the other homepage sliders use
 * (`useSnapSlider` + a snap-mandatory track), so paging, prev/next disabled
 * state and swipe behaviour are identical across the page. Shows 3 cards at a
 * time on desktop — matching the 1 / 2 / 3 grid this section used before.
 */
export default function LatestJobsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-jobs-latest', LIMIT],
    queryFn: () => publicJobsService.search({ limit: LIMIT }),
    staleTime: 5 * 60 * 1000,
  });

  const jobs = data?.items ?? [];

  // Hooks must run before the empty-state early return below.
  const { trackRef, atStart, atEnd, sync, scrollByPage } = useSnapSlider();
  useEffect(() => {
    sync();
  }, [jobs.length, sync]);

  if (!isLoading && jobs.length === 0) return null;

  // Card width per breakpoint, sized so N cards exactly fill the track given
  // the 1.25rem (gap-5) gutter: w = (100% - (N-1) * 1.25rem) / N.
  // Mobile keeps a small peek so it reads as scrollable.
  const widthClass =
    'min-w-[calc(100%-1.25rem)] md:min-w-[calc(50%-0.625rem)] lg:min-w-[calc(33.333%-0.833rem)]';

  return (
    <section className="relative overflow-hidden bg-[var(--bg-secondary)] px-4 py-16 sm:py-20">
      <SectionBackdrop variant="mesh" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Live jobs
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">
              Fresh opportunities, updated daily
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              A glimpse of the roles companies are hiring for right now.
            </p>
          </div>

          {/* Carousel nav + the existing "Browse all jobs" CTA. Same button
              treatment as the other homepage sliders, positioned to suit this
              section's header. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Previous jobs"
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              className="rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next jobs"
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              className="rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Link href="/jobs" className="group ml-1 hidden sm:block">
              <Button
                variant="outline"
                className="hover:border-primary hover:text-primary transition-colors hover:bg-white hover:shadow-sm"
                rightIcon={
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                }
              >
                Browse all jobs
              </Button>
            </Link>
          </div>
        </div>

        <ul
          ref={trackRef}
          onScroll={sync}
          role="list"
          // `overflow-x-auto` makes overflow-y implicitly non-visible too, so
          // the track needs symmetric vertical padding — without it HomeJobCard's
          // hover lift (`-translate-y-1`) and `shadow-xl` get clipped. The
          // negative inset keeps the section's original vertical rhythm.
          className="scrollbar-hide -my-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth py-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {(isLoading ? Array.from({ length: LIMIT }) : jobs).map((raw, i) => {
            const job = raw as PublicJobCardData | undefined;
            if (!job) {
              return (
                <li key={`s-${i}`} role="listitem" className={`${widthClass} snap-start`}>
                  <div className="h-64 animate-pulse rounded-2xl border border-[var(--border)] bg-white" />
                </li>
              );
            }
            return (
              <li key={job.id} role="listitem" className={`${widthClass} snap-start`}>
                <HomeJobCard job={job} isGuest />
              </li>
            );
          })}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link href="/jobs">
            <Button
              variant="outline"
              fullWidth
              className="hover:border-primary hover:text-primary hover:bg-white"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Browse all jobs
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
