'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * HireSolutionsSection — the homepage "Hire your way" block. Each of the four
 * hiring solutions is an enterprise-grade "visual card": a top visual band
 * carries a hand-authored, accent-matched SVG illustration sitting on a soft
 * gradient wash with a blurred accent glow behind it and a gradient overlay
 * fading into the content. On hover the card lifts, the shadow deepens, the
 * illustration scales up, the glow expands, a top accent bar wipes in and the
 * CTA arrow slides. Pure presentational + CSS — the entrance uses framer-motion.
 *
 * The SVGs are inline components (crisp at any size, zero image weight, themed
 * to each card's accent) rather than external assets.
 */

/* ------------------------------------------------------------------ */
/* Illustrations — 240×150 (16:10), transparent, one per card accent.  */
/* ------------------------------------------------------------------ */

function PostJobArt() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="pj-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f0f6ff" />
        </linearGradient>
        <linearGradient id="pj-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Tilted back panel for depth */}
      <rect
        x="44"
        y="34"
        width="122"
        height="94"
        rx="14"
        fill="#dbeafe"
        transform="rotate(-6 105 81)"
      />
      {/* Main posting card */}
      <rect
        x="56"
        y="24"
        width="124"
        height="102"
        rx="14"
        fill="url(#pj-card)"
        stroke="#bfdbfe"
        strokeWidth="1.5"
      />
      {/* Header: avatar + title lines */}
      <circle cx="79" cy="49" r="11" fill="#3b82f6" />
      <rect x="97" y="43" width="58" height="7" rx="3.5" fill="#1e3a8a" opacity="0.72" />
      <rect x="97" y="54" width="38" height="6" rx="3" fill="#93c5fd" />
      {/* Body lines */}
      <rect x="72" y="76" width="92" height="6" rx="3" fill="#e6edf5" />
      <rect x="72" y="88" width="74" height="6" rx="3" fill="#e6edf5" />
      {/* Tag chips */}
      <rect x="72" y="102" width="30" height="12" rx="6" fill="#dbeafe" />
      <rect x="108" y="102" width="24" height="12" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      {/* Broadcast dots — reach */}
      <circle cx="196" cy="84" r="3" fill="#60a5fa" />
      <circle cx="207" cy="70" r="2.5" fill="#93c5fd" />
      <circle cx="214" cy="56" r="2" fill="#bfdbfe" />
      {/* Floating "+" badge */}
      <circle cx="177" cy="111" r="18" fill="url(#pj-badge)" />
      <path d="M177 103v16M169 111h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CvSearchArt() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="cv-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Stacked CV cards */}
      <rect
        x="46"
        y="32"
        width="98"
        height="82"
        rx="12"
        fill="#d1fae5"
        transform="rotate(-8 95 73)"
      />
      <rect
        x="58"
        y="24"
        width="104"
        height="90"
        rx="12"
        fill="#ffffff"
        stroke="#a7f3d0"
        strokeWidth="1.5"
      />
      {/* Profile row */}
      <circle cx="80" cy="46" r="10" fill="#10b981" />
      <rect x="96" y="40" width="50" height="6" rx="3" fill="#065f46" opacity="0.68" />
      <rect x="96" y="50" width="32" height="5" rx="2.5" fill="#6ee7b7" />
      {/* Detail lines */}
      <rect x="72" y="70" width="78" height="5" rx="2.5" fill="#e6efe9" />
      <rect x="72" y="80" width="60" height="5" rx="2.5" fill="#e6efe9" />
      {/* Skill chips */}
      <rect x="72" y="93" width="26" height="11" rx="5.5" fill="#d1fae5" />
      <rect x="104" y="93" width="20" height="11" rx="5.5" fill="#ecfdf5" stroke="#a7f3d0" />
      {/* Magnifier */}
      <circle cx="166" cy="98" r="27" fill="#ffffff" fillOpacity="0.65" />
      <circle cx="166" cy="98" r="22" fill="#ffffff" stroke="url(#cv-lens)" strokeWidth="6" />
      <line
        x1="184"
        y1="116"
        x2="200"
        y2="132"
        stroke="#059669"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Match check inside the lens */}
      <path
        d="M156 98l7 7 12-14"
        stroke="#10b981"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AssistedArt() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="ah-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Soft halo behind the agent */}
      <circle cx="64" cy="76" r="42" fill="#fef3c7" />
      {/* Agent avatar */}
      <circle cx="64" cy="74" r="30" fill="#ffffff" stroke="#fcd34d" strokeWidth="1.5" />
      <path d="M46 92a18 18 0 0136 0z" fill="#fbbf24" />
      <circle cx="64" cy="66" r="13" fill="url(#ah-head)" />
      {/* Headset */}
      <path
        d="M47 66a17 17 0 0134 0"
        fill="none"
        stroke="#d97706"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <rect x="43" y="64" width="7" height="13" rx="3.5" fill="#d97706" />
      <rect x="78" y="64" width="7" height="13" rx="3.5" fill="#d97706" />
      <path
        d="M81 76v3a9 8 0 01-9 8h-5"
        fill="none"
        stroke="#d97706"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Handoff arrow */}
      <path d="M100 74h14" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M110 69l6 5-6 5"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Shortlist card */}
      <rect
        x="124"
        y="30"
        width="92"
        height="90"
        rx="12"
        fill="#ffffff"
        stroke="#fde68a"
        strokeWidth="1.5"
      />
      {[46, 68, 90].map((y) => (
        <g key={y}>
          <circle cx="141" cy={y} r="7" fill="#fbbf24" />
          <rect x="153" y={y - 3} width="36" height="6" rx="3" fill="#f1e6cf" />
          <path
            d={`M197 ${y}l4 4 7-8`}
            fill="none"
            stroke="#d97706"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

function PartnersArt() {
  const nodes = [
    { cx: 62, cy: 40 },
    { cx: 58, cy: 106 },
    { cx: 182, cy: 38 },
    { cx: 186, cy: 108 },
  ];
  return (
    <svg viewBox="0 0 240 150" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="rp-hub" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Connecting lines */}
      <g stroke="#c4b5fd" strokeWidth="2.5">
        {nodes.map((n, i) => (
          <line key={i} x1="120" y1="75" x2={n.cx} y2={n.cy} />
        ))}
      </g>
      {/* Partner nodes */}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r="15" fill="#ffffff" stroke="#ddd6fe" strokeWidth="1.5" />
          <circle cx={n.cx} cy={n.cy - 3} r="5" fill="#a78bfa" />
          <path d={`M${n.cx - 8} ${n.cy + 9}a8 8 0 0116 0z`} fill="#c4b5fd" />
        </g>
      ))}
      {/* Central agency hub */}
      <circle cx="120" cy="75" r="30" fill="#f5f3ff" />
      <circle cx="120" cy="75" r="25" fill="url(#rp-hub)" />
      {/* Building glyph inside the hub */}
      <rect x="109" y="63" width="22" height="26" rx="2.5" fill="#ffffff" />
      <rect x="113" y="68" width="4" height="4" rx="1" fill="#8b5cf6" />
      <rect x="121" y="68" width="4" height="4" rx="1" fill="#8b5cf6" />
      <rect x="113" y="76" width="4" height="4" rx="1" fill="#8b5cf6" />
      <rect x="121" y="76" width="4" height="4" rx="1" fill="#8b5cf6" />
      <rect x="116" y="83" width="8" height="6" rx="1" fill="#c4b5fd" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const CARDS = [
  {
    title: 'Post a Job',
    href: '/employer/jobs/new',
    desc: 'Free job post in 2 minutes — reach thousands of candidates.',
    Art: PostJobArt,
    wash: 'bg-gradient-to-br from-blue-50 to-white',
    glow: 'bg-blue-400/40',
    bar: 'bg-blue-500',
    learn: 'group-hover:text-blue-600',
  },
  {
    title: 'Search CV Database',
    href: '/pricing/employer#employer_cv_database',
    desc: 'Filter the Talent Vault, unlock contact details, hire faster.',
    Art: CvSearchArt,
    wash: 'bg-gradient-to-br from-emerald-50 to-white',
    glow: 'bg-emerald-400/40',
    bar: 'bg-emerald-500',
    learn: 'group-hover:text-emerald-600',
  },
  {
    title: 'Assisted Hiring',
    href: '/pricing/employer#employer_assisted_hiring',
    desc: 'Our team finds 4-5 matching CVs for your role in 7 days.',
    Art: AssistedArt,
    wash: 'bg-gradient-to-br from-amber-50 to-white',
    glow: 'bg-amber-400/40',
    bar: 'bg-amber-500',
    learn: 'group-hover:text-amber-600',
  },
  {
    title: 'Find Recruitment Partners',
    href: '/vendors',
    desc: 'Browse vetted staffing agencies and send hiring leads.',
    Art: PartnersArt,
    wash: 'bg-gradient-to-br from-violet-50 to-white',
    glow: 'bg-violet-400/40',
    bar: 'bg-violet-500',
    learn: 'group-hover:text-violet-600',
  },
] as const;

export default function HireSolutionsSection() {
  return (
    <section className="bg-[var(--bg)] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            Choose Hiring Solution
          </span>
          <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">Hire your way</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[var(--text-secondary)]">
            Four ways to find the right talent — pick the one that fits your stage.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, i) => {
            const Art = card.Art;
            return (
              <motion.div
                key={card.title}
                className="h-full"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.1, 0.4) }}
              >
                <Link
                  href={card.href}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
                >
                  {/* Top accent bar — wipes in on hover */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-0 top-0 z-20 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100',
                      card.bar,
                    )}
                  />

                  {/* Visual band */}
                  <div className={cn('relative h-40 overflow-hidden', card.wash)}>
                    {/* Blurred accent glow — brightens + expands on hover */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        'absolute top-1/2 left-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-90',
                        card.glow,
                      )}
                    />
                    {/* Illustration — scales up on hover */}
                    <div className="absolute inset-0 flex items-center justify-center p-5 transition-transform duration-500 ease-out group-hover:scale-105">
                      <Art />
                    </div>
                    {/* Fade overlay into the content */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col p-6 pt-4">
                    <h3 className="text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">
                      {card.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {card.desc}
                    </p>
                    <span
                      className={cn(
                        'mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text)] transition-colors',
                        card.learn,
                      )}
                    >
                      Learn more
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
