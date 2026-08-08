'use client';

/**
 * Section 1 — Jobs in Demand + Popular Categories chip widgets.
 *
 * Renders 12–13 chips in 2 rows. No section heading per the brief.
 * Each chip = title + icon. Click navigates the same way as the
 * header mega-menu and the footer mega-section (single source of
 * truth via `curatedHref`).
 *
 * Source mix:
 *   - Top 6 JOB_DEMAND entries (Fresher, Remote, WFH, Walk-in, …)
 *   - Top 7 JOB_CATEGORY entries (IT, Sales, Marketing, …)
 * Total 13 → fits cleanly into 2 rows of ~6–7 on desktop.
 *
 * Desktop (lg+) uses a brick / honeycomb offset: 7 cards on row 1 sit
 * at odd column starts (1,3,5,7,9,11,13) inside a 14-column grid, and
 * the 6 cards on row 2 sit at even column starts (2,4,6,8,10,12) so
 * each bottom card slots into the gap between two top cards. Smaller
 * breakpoints fall back to plain auto-flow (2/3/4 cols).
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  Code,
  Users,
  TrendingUp,
  Cpu,
  Headphones,
  Truck,
  Stethoscope,
  GraduationCap,
  HardHat,
  Factory,
  Globe,
  Zap,
  HomeIcon,
  Footprints,
  Moon,
  Clock,
  ShieldCheck,
  HeartHandshake,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { curatedService, type CuratedListing } from '@/services/curated.service';
import { curatedHref, curatedAriaLabel } from '@/lib/curated-href';

/** Maps slug → icon. Falls back to a generic icon for unmapped slugs. */
const ICON_BY_SLUG: Record<string, LucideIcon> = {
  // JOB_CATEGORY
  'it-jobs': Code,
  'sales-jobs': TrendingUp,
  'marketing-jobs': Globe,
  'data-science-jobs': Cpu,
  'engineering-jobs': HardHat,
  'hr-jobs': Users,
  'finance-jobs': Building2,
  'operations-jobs': Briefcase,
  'healthcare-jobs': Stethoscope,
  'teaching-jobs': GraduationCap,
  'bpo-jobs': Headphones,
  'logistics-jobs': Truck,
  // JOB_DEMAND
  'fresher-jobs': Zap,
  'mnc-jobs': Building2,
  'remote-jobs': Globe,
  'work-from-home': HomeIcon,
  'walk-in': Footprints,
  'part-time': Clock,
  'women-jobs': HeartHandshake,
  'full-time': Briefcase,
  'night-shift': Moon,
  internship: GraduationCap,
  contract: ShieldCheck,
  freelance: Factory,
};

function pickIcon(slug: string): LucideIcon {
  return ICON_BY_SLUG[slug] ?? Briefcase;
}

/** Subtle per-chip accent gradients so the row reads with colour + depth
 *  instead of a monochrome grid of identical blue circles. */
const CHIP_ACCENTS = [
  { tile: 'from-blue-500 to-indigo-600', card: 'from-blue-50', border: 'hover:border-blue-300' },
  {
    tile: 'from-violet-500 to-purple-600',
    card: 'from-violet-50',
    border: 'hover:border-violet-300',
  },
  {
    tile: 'from-emerald-500 to-teal-600',
    card: 'from-emerald-50',
    border: 'hover:border-emerald-300',
  },
  { tile: 'from-amber-500 to-orange-600', card: 'from-amber-50', border: 'hover:border-amber-300' },
  { tile: 'from-rose-500 to-pink-600', card: 'from-rose-50', border: 'hover:border-rose-300' },
  { tile: 'from-sky-500 to-cyan-600', card: 'from-sky-50', border: 'hover:border-sky-300' },
];

interface Props {
  /** Hard cap on chips rendered. Default = 13. */
  limit?: number;
  className?: string;
}

export default function JobsCategoriesChipsSection({ limit = 13, className }: Props) {
  const { data } = useQuery({
    queryKey: ['curated-menu-home-section1'],
    queryFn: () => curatedService.menu(),
    staleTime: 10 * 60 * 1000,
  });

  const demand = (data?.JOB_DEMAND ?? []) as CuratedListing[];
  const categories = (data?.JOB_CATEGORY ?? []) as CuratedListing[];

  // Mix: ~6 demand + ~7 category, capped at `limit`.
  const demandCount = Math.min(demand.length, Math.floor(limit / 2));
  const categoryCount = Math.min(categories.length, limit - demandCount);
  const items: CuratedListing[] = [
    ...demand.slice(0, demandCount),
    ...categories.slice(0, categoryCount),
  ].slice(0, limit);

  if (items.length === 0) return null;

  // Brick offset on lg+: 14-column grid, each card spans 2 cols.
  // Row 1 starts at columns 1,3,5,7,9,11,13 (odd) — 7 cards.
  // Row 2 starts at columns 2,4,6,8,10,12   (even) — 6 cards.
  // Class strings are hard-coded (not template-built) so Tailwind's
  // JIT picks them up at build time.
  const BRICK_POSITION_CLASSES = [
    'lg:col-start-1 lg:row-start-1',
    'lg:col-start-3 lg:row-start-1',
    'lg:col-start-5 lg:row-start-1',
    'lg:col-start-7 lg:row-start-1',
    'lg:col-start-9 lg:row-start-1',
    'lg:col-start-11 lg:row-start-1',
    'lg:col-start-13 lg:row-start-1',
    'lg:col-start-2 lg:row-start-2',
    'lg:col-start-4 lg:row-start-2',
    'lg:col-start-6 lg:row-start-2',
    'lg:col-start-8 lg:row-start-2',
    'lg:col-start-10 lg:row-start-2',
    'lg:col-start-12 lg:row-start-2',
  ];

  return (
    <section
      aria-label="Popular job categories"
      className={`mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 ${className ?? ''}`}
    >
      <div className="mb-10 text-center">
        <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          In demand now
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
          Popular categories &amp; roles
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--text-secondary)]">
          Jump straight into the sectors and roles India is hiring for right now.
        </p>
      </div>
      <ul
        role="list"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(14,minmax(0,1fr))]"
      >
        {items.map((item, idx) => {
          const Icon = pickIcon(item.slug);
          const placement = BRICK_POSITION_CLASSES[idx] ?? '';
          const accent = CHIP_ACCENTS[idx % CHIP_ACCENTS.length];
          return (
            <li key={item.id} role="listitem" className={`lg:col-span-2 ${placement}`}>
              <Link
                href={curatedHref(item)}
                aria-label={curatedAriaLabel(item)}
                className={`group flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)] bg-gradient-to-br ${accent.card} to-white px-3 py-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${accent.border}`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent.tile} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="line-clamp-2 text-xs font-semibold text-[var(--text)] sm:text-sm">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
