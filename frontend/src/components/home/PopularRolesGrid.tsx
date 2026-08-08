'use client';

/**
 * Section 4 — "Discover Jobs Across Popular Roles".
 *
 * Heading on the LEFT; slider box on the RIGHT showing role widgets in a
 * 2-col × 3-row grid (= 6 widgets per slide). 3 slides × 6 = 18 roles. Each
 * widget has a role-specific icon, a live open-jobs count, and animates on
 * slide change (reduced-motion aware). Counts come from /public/role-counts.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Briefcase,
  Code,
  TrendingUp,
  Headphones,
  BarChart3,
  Megaphone,
  Users,
  Package,
  Truck,
  PhoneCall,
  ConciergeBell,
  Wallet,
  ClipboardList,
  Handshake,
  Bell,
  Calculator,
  Shield,
  PenTool,
  HardHat,
  type LucideIcon,
} from 'lucide-react';
import { publicStatsService } from '@/services/public-stats.service';

const ROLES = [
  // Slide 1 — top tier
  'Software Engineer',
  'Sales Executive',
  'Customer Care',
  'Data Scientist',
  'Marketing Manager',
  'HR Executive',
  // Slide 2 — high-volume Indian-market roles
  'Delivery Person',
  'Driver',
  'Telecaller',
  'Receptionist',
  'Account Manager',
  'Office Assistant',
  // Slide 3 — specialised + entry-level
  'Field Sales',
  'Front Desk',
  'Cashier',
  'Security Guard',
  'Graphic Designer',
  'Civil Engineer',
];

/** Per-role icon so the row reads with variety (was a single repeated Briefcase). */
const ICON_BY_ROLE: Record<string, LucideIcon> = {
  'Software Engineer': Code,
  'Sales Executive': TrendingUp,
  'Customer Care': Headphones,
  'Data Scientist': BarChart3,
  'Marketing Manager': Megaphone,
  'HR Executive': Users,
  'Delivery Person': Package,
  Driver: Truck,
  Telecaller: PhoneCall,
  Receptionist: ConciergeBell,
  'Account Manager': Wallet,
  'Office Assistant': ClipboardList,
  'Field Sales': Handshake,
  'Front Desk': Bell,
  Cashier: Calculator,
  'Security Guard': Shield,
  'Graphic Designer': PenTool,
  'Civil Engineer': HardHat,
};

const ROLES_PER_SLIDE = 6;
const TOTAL_SLIDES = Math.ceil(ROLES.length / ROLES_PER_SLIDE);

const gridVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

interface Props {
  className?: string;
}

export default function PopularRolesGrid({ className }: Props) {
  const { data } = useQuery({
    queryKey: ['public-role-counts', ROLES.join(',')],
    queryFn: () => publicStatsService.roleCounts(ROLES),
    staleTime: 30 * 60 * 1000,
  });

  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data ?? []) m.set(r.role.toLowerCase(), r.count);
    return m;
  }, [data]);

  const reduce = useReducedMotion();
  const [[slide, dir], setSlide] = useState<[number, number]>([0, 0]);
  const go = (next: number) => setSlide([next, next > slide ? 1 : -1]);
  const visibleRoles = ROLES.slice(slide * ROLES_PER_SLIDE, (slide + 1) * ROLES_PER_SLIDE);

  return (
    <section
      aria-label="Discover jobs across popular roles"
      className={`mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 ${className ?? ''}`}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10">
        {/* Left — heading + description + nav buttons */}
        <header className="flex flex-col justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
              Discover jobs across <span className="text-primary">popular roles</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              From freshers to senior leadership — explore the most-searched roles on Hire Adda and
              apply with one click. Counts refresh every 30 minutes from the live job board.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous roles"
              onClick={() => go(Math.max(0, slide - 1))}
              disabled={slide === 0}
              className="rounded-full border border-[var(--border)] bg-white p-2.5 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next roles"
              onClick={() => go(Math.min(TOTAL_SLIDES - 1, slide + 1))}
              disabled={slide >= TOTAL_SLIDES - 1}
              className="rounded-full border border-[var(--border)] bg-white p-2.5 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-xs text-[var(--text-muted)]" aria-live="polite">
              {slide + 1} / {TOTAL_SLIDES}
            </span>
          </div>
        </header>

        {/* Right — animated 2-col × 3-row grid */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.ul
              key={slide}
              role="list"
              custom={dir}
              variants={gridVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {visibleRoles.map((role) => {
                const count = countByRole.get(role.toLowerCase()) ?? 0;
                const Icon = ICON_BY_ROLE[role] ?? Briefcase;
                const href = `/jobs?q=${encodeURIComponent(role)}`;
                return (
                  <li key={role} role="listitem">
                    <Link
                      href={href}
                      className="group flex h-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-[var(--text)]">
                            {role}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {count > 0
                              ? `${count.toLocaleString('en-IN')} ${count === 1 ? 'job available' : 'jobs available'}`
                              : 'Explore jobs'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="text-primary h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
