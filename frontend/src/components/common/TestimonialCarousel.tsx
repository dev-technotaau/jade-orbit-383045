'use client';

/**
 * TestimonialCarousel — reusable, auto-advancing testimonial slider.
 *
 * Used on the enhanced candidate & employer auth pages (between the CTA banner
 * and the FAQ) and on the homepage. Shows TWO cards per page from `lg` up and
 * one below, with a directional slide transition, prev/next arrows and
 * clickable dots.
 *
 * PAGING, NOT CARD-STEPPING. Everything — arrows, autoplay, dots, aria — works
 * in pages of `perView`, so with 6 testimonials at 2-up there are 3 dots, not
 * 6. A trailing odd card (5 testimonials at 2-up) gets a page of its own and
 * is centred rather than left hanging in the first column.
 *
 *   • variant="employer" — emphasises the company via a logo tile (real logo
 *     image if provided, else a brand monogram fallback).
 *   • variant="candidate" — emphasises the person via an initials avatar.
 *
 * Behaviour: auto-advances (~6.5s), pauses on hover/focus, and honours the
 * user's `prefers-reduced-motion` setting (no autoplay when reduced).
 *
 * LIGHT-MODE ONLY — the surrounding auth pages are light-only.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, Quote, Star } from 'lucide-react';

export interface Testimonial {
  /** The testimonial body. */
  quote: string;
  /** Person's full name. */
  name: string;
  /** Person's designation, e.g. "Head of HR" (employer) or "Software Engineer" (candidate). */
  title: string;
  /** Company / context line, e.g. "TalentEdge Solutions" or "Now at a leading fintech". */
  company: string;
  /** Optional company logo path (employer). Falls back to a monogram tile if missing/broken. */
  logo?: string;
  /** Optional headshot photo path (candidate). Falls back to a monogram avatar if missing/broken. */
  avatar?: string;
  /** Star rating 1–5. */
  rating: number;
}

interface TestimonialCarouselProps {
  variant: 'employer' | 'candidate';
  heading: string;
  subheading?: string;
  testimonials: Testimonial[];
  /** Tailwind background utility for the section wrapper. */
  className?: string;
}

const AUTOPLAY_MS = 6500;

/** Two cards per page from `lg` up, one below. */
const DESKTOP_QUERY = '(min-width: 1024px)';
const DESKTOP_PER_VIEW = 2;

/**
 * Cards visible per page, tracked live so a resize re-pages immediately.
 *
 * `useSyncExternalStore` rather than useState + useEffect: it is the supported
 * way to read an external source like matchMedia, it gives an explicit server
 * snapshot (mobile-first, so SSR and the first client render agree), and it
 * avoids calling setState inside an effect — which this repo's lint config
 * rejects outright.
 */
function usePerView(): number {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(DESKTOP_QUERY).matches ? DESKTOP_PER_VIEW : 1),
    () => 1,
  );
}

/** Two-letter monogram: first letters of the first two words, else first two chars. */
function monogram(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.slice(0, 2) ?? '').toUpperCase();
}

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
};

export default function TestimonialCarousel({
  variant,
  heading,
  subheading,
  testimonials,
  className = 'bg-[var(--bg-secondary)]',
}: TestimonialCarouselProps) {
  const count = testimonials.length;
  const perView = usePerView();
  const pageCount = Math.max(1, Math.ceil(count / perView));
  const [[page, dir], setPage] = useState<[number, number]>([0, 0]);
  const [isPlaying, setIsPlaying] = useState(true);
  const reducedMotion = useReducedMotion();
  const paused = useRef(false);

  /* Clamp during render, not in an effect. Widening the window from 1-up to
     2-up halves pageCount, which can strand the stored index on a page that no
     longer exists; deriving the safe value costs no extra render and cannot
     desync. Every mutation below re-clamps inside its updater for the same
     reason — the updater sees the raw stored value, not this one. */
  const safePage = Math.min(page, pageCount - 1);

  const paginate = useCallback(
    (direction: number) => {
      setPage(([p]) => {
        const from = Math.min(p, pageCount - 1);
        return [(((from + direction) % pageCount) + pageCount) % pageCount, direction];
      });
    },
    [pageCount],
  );

  const goTo = useCallback((target: number) => {
    setPage(([p]) => [target, target >= p ? 1 : -1]);
  }, []);

  // Auto-advance while playing; hover/focus transiently pauses via the ref, and
  // the Pause/Play control fully stops it (interval cleared) per WCAG 2.2.2.
  // Disabled entirely for users who prefer reduced motion.
  useEffect(() => {
    if (pageCount <= 1 || !isPlaying || reducedMotion) return;
    const id = window.setInterval(() => {
      if (!paused.current) {
        setPage(([p]) => [(Math.min(p, pageCount - 1) + 1) % pageCount, 1]);
      }
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [pageCount, isPlaying, reducedMotion]);

  if (count === 0) return null;

  const visible = testimonials.slice(safePage * perView, safePage * perView + perView);
  // A trailing odd card would otherwise sit alone in the left column.
  const loneTrailer = visible.length === 1 && perView > 1;

  return (
    <section className={`${className} px-4 py-14 sm:py-20`} aria-label={heading}>
      {/* Widens at lg so two cards sit side by side without cramping: at 1280px
          each column is ~564px, leaving ~484px of text width inside the card's
          existing p-10. Below lg the max-w-4xl behaviour is unchanged. */}
      <div className="mx-auto max-w-4xl lg:max-w-6xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">{heading}</h2>
          {subheading && (
            <p className="mx-auto mt-3 max-w-2xl text-[var(--text-secondary)]">{subheading}</p>
          )}
        </div>

        <div
          className="relative"
          role="group"
          aria-roledescription="carousel"
          aria-label={`${heading} — page ${safePage + 1} of ${pageCount}`}
          onMouseEnter={() => {
            paused.current = true;
          }}
          onMouseLeave={() => {
            paused.current = false;
          }}
          onFocusCapture={() => {
            paused.current = true;
          }}
          onBlurCapture={() => {
            paused.current = false;
          }}
        >
          <div className="overflow-hidden">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              {/* The whole PAGE animates as one unit, so both cards enter and
                  leave together instead of racing each other. */}
              <motion.div
                key={safePage}
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reducedMotion ? 0 : 0.4, ease: 'easeOut' }}
                className="mx-auto grid max-w-2xl items-stretch gap-6 lg:max-w-none lg:grid-cols-2"
              >
                {visible.map((t) => (
                  <figure
                    key={t.name}
                    // `h-full` + `items-stretch` keeps a short quote and a long
                    // one the same height side by side. Card styling itself is
                    // unchanged from the single-card version.
                    className={`flex h-full min-h-[280px] flex-col rounded-3xl border border-[var(--border)] bg-white p-7 shadow-sm sm:min-h-[260px] sm:p-10 ${
                      loneTrailer ? 'lg:col-span-2 lg:mx-auto lg:max-w-2xl' : ''
                    }`}
                  >
                    <Quote className="text-primary/25 h-9 w-9 flex-none" aria-hidden />

                    <div
                      className="mt-3 flex gap-0.5"
                      role="img"
                      aria-label={`Rated ${t.rating} out of 5`}
                    >
                      {Array.from({ length: t.rating }).map((_, i) => (
                        <Star
                          key={i}
                          className="h-4 w-4 fill-[var(--warning)] text-[var(--warning)]"
                          aria-hidden
                        />
                      ))}
                    </div>

                    <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-[var(--text-secondary)] sm:text-xl">
                      &ldquo;{t.quote}&rdquo;
                    </blockquote>

                    <figcaption className="mt-6 flex items-center gap-4">
                      {variant === 'employer' ? (
                        <LogoTile name={t.company} logo={t.logo} />
                      ) : (
                        <Avatar name={t.name} avatar={t.avatar} />
                      )}
                      <div>
                        <p className="font-semibold text-[var(--text)]">{t.name}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {t.title} &middot; {t.company}
                        </p>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {pageCount > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              {!reducedMotion && (
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  aria-label={isPlaying ? 'Pause testimonials' : 'Play testimonials'}
                  className="hover:border-primary hover:text-primary flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] transition-colors"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              )}

              <button
                type="button"
                onClick={() => paginate(-1)}
                aria-label="Previous testimonial"
                className="hover:border-primary hover:text-primary flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* One dot per PAGE, not per card — so 6 testimonials at 2-up
                  give 3 dots. Keyed by page index because a page has no single
                  stable item name once it holds more than one card. */}
              <div className="flex items-center gap-2">
                {Array.from({ length: pageCount }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Go to testimonial page ${i + 1} of ${pageCount}`}
                    aria-current={i === safePage}
                    className={`h-2 rounded-full transition-all ${
                      i === safePage
                        ? 'bg-primary w-6'
                        : 'w-2 bg-[var(--border)] hover:bg-[var(--text-muted)]'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => paginate(1)}
                aria-label="Next testimonial"
                className="hover:border-primary hover:text-primary flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Employer — company logo tile: real logo image if provided, else a brand monogram. */
function LogoTile({ name, logo }: { name: string; logo?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logo) && !failed;

  return (
    <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={name}
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="from-primary to-primary-hover flex h-full w-full items-center justify-center bg-gradient-to-br text-sm font-bold text-white">
          {monogram(name)}
        </span>
      )}
    </div>
  );
}

/** Candidate — headshot photo if provided, else an initials avatar. */
function Avatar({ name, avatar }: { name: string; avatar?: string }) {
  const [failed, setFailed] = useState(false);

  if (avatar && !failed) {
    return (
      <div className="h-12 w-12 flex-none overflow-hidden rounded-full ring-2 ring-[var(--border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="bg-primary-light flex h-12 w-12 flex-none items-center justify-center rounded-full">
      <span className="text-primary text-sm font-bold">{monogram(name)}</span>
    </div>
  );
}
