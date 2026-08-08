'use client';

/**
 * plan-visuals — the shared visual language for every pricing / billing plan
 * surface: one hand-authored SVG illustration + accent theme per plan
 * category, so the public pricing pages, the plan detail page, the checkout
 * summary and the in-dashboard upgrade flow all look like one system.
 *
 * Purely presentational — it renders NO plan data and makes no decisions.
 * Callers keep all their existing pricing/entitlement logic untouched and
 * just look up a theme by `plan.category`.
 *
 * Illustrations are authored at viewBox 240×96 (a wide, shallow band) because
 * plan cards are narrow columns and the price + CTA must stay high in the
 * card. Shapes are deliberately chunky so they still read at ~90px tall.
 *
 * Gradient ids are namespaced with `useId()` — several plans share a category
 * (Free / Standard / Premium are all EMPLOYER_JOB_POST), so the same art can
 * render many times on one page and duplicate DOM ids would be invalid.
 */

import { useId } from 'react';
import type { PlanCategory } from '@/types/billing';
import { getPlanTierVisual, type PlanTier } from '@/components/billing/plan-theme';

/* ------------------------------------------------------------------ */
/* Illustrations — 240×96, transparent, accent-matched per category.    */
/* ------------------------------------------------------------------ */

/** Job posting card + a "+" badge + broadcast arcs (reach). */
function JobPostArt() {
  const id = useId();
  const g = `${id}-badge`;
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Tilted backing card for depth */}
      <rect
        x="34"
        y="20"
        width="86"
        height="62"
        rx="12"
        fill="#dbeafe"
        transform="rotate(-6 77 51)"
      />
      {/* Main posting card */}
      <rect
        x="46"
        y="14"
        width="92"
        height="68"
        rx="12"
        fill="#fff"
        stroke="#bfdbfe"
        strokeWidth="1.5"
      />
      <circle cx="66" cy="34" r="9" fill="#3b82f6" />
      <rect x="81" y="29" width="44" height="6" rx="3" fill="#1e3a8a" opacity="0.7" />
      <rect x="81" y="39" width="28" height="5" rx="2.5" fill="#93c5fd" />
      <rect x="58" y="56" width="66" height="5" rx="2.5" fill="#eaf0f7" />
      <rect x="58" y="66" width="46" height="5" rx="2.5" fill="#eaf0f7" />
      {/* Broadcast arcs — the post reaching candidates */}
      <path d="M162 48a22 22 0 00-8-17" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
      <path d="M176 48a36 36 0 00-13-27" stroke="#bfdbfe" strokeWidth="3" strokeLinecap="round" />
      {/* Floating "+" badge */}
      <circle cx="150" cy="66" r="15" fill={`url(#${g})`} />
      <path d="M150 59v14M143 66h14" stroke="#fff" strokeWidth="2.75" strokeLinecap="round" />
    </svg>
  );
}

/** Stacked CV cards behind a magnifier with a match check. */
function CvDatabaseArt() {
  const id = useId();
  const g = `${id}-lens`;
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect
        x="34"
        y="20"
        width="76"
        height="58"
        rx="11"
        fill="#d1fae5"
        transform="rotate(-8 72 49)"
      />
      <rect
        x="46"
        y="14"
        width="80"
        height="66"
        rx="11"
        fill="#fff"
        stroke="#a7f3d0"
        strokeWidth="1.5"
      />
      <circle cx="66" cy="33" r="9" fill="#10b981" />
      <rect x="81" y="28" width="36" height="6" rx="3" fill="#065f46" opacity="0.65" />
      <rect x="81" y="38" width="24" height="5" rx="2.5" fill="#6ee7b7" />
      <rect x="58" y="54" width="56" height="5" rx="2.5" fill="#e9f2ed" />
      <rect x="58" y="64" width="40" height="5" rx="2.5" fill="#e9f2ed" />
      {/* Magnifier */}
      <circle cx="162" cy="44" r="24" fill="#fff" fillOpacity="0.7" />
      <circle cx="162" cy="44" r="19" fill="#fff" stroke={`url(#${g})`} strokeWidth="5.5" />
      <line
        x1="178"
        y1="60"
        x2="192"
        y2="74"
        stroke="#059669"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M153 44l6 6 11-12"
        stroke="#10b981"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Headset agent handing over a checked shortlist. */
function AssistedHiringArt() {
  const id = useId();
  const g = `${id}-head`;
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Agent */}
      <circle cx="56" cy="48" r="31" fill="#fef3c7" />
      <circle cx="56" cy="47" r="23" fill="#fff" stroke="#fcd34d" strokeWidth="1.5" />
      <path d="M42 61a14 14 0 0128 0z" fill="#fbbf24" />
      <circle cx="56" cy="41" r="10" fill={`url(#${g})`} />
      <path
        d="M43 41a13 13 0 0126 0"
        fill="none"
        stroke="#d97706"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="39.5" y="39" width="6" height="11" rx="3" fill="#d97706" />
      <rect x="66.5" y="39" width="6" height="11" rx="3" fill="#d97706" />
      {/* Handoff arrow */}
      <path d="M96 48h12" stroke="#f59e0b" strokeWidth="2.75" strokeLinecap="round" />
      <path
        d="M104 43.5l5 4.5-5 4.5"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Shortlist */}
      <rect
        x="120"
        y="14"
        width="86"
        height="68"
        rx="12"
        fill="#fff"
        stroke="#fde68a"
        strokeWidth="1.5"
      />
      {[32, 48, 64].map((y) => (
        <g key={y}>
          <circle cx="136" cy={y} r="6" fill="#fbbf24" />
          <rect x="147" y={y - 2.5} width="34" height="5" rx="2.5" fill="#f2e7cf" />
          <path
            d={`M188 ${y}l3.5 3.5 6-7`}
            fill="none"
            stroke="#d97706"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

/** Candidate profile lifted by a rising arrow + premium sparkle. */
function CandidatePremiumArt() {
  const id = useId();
  const g = `${id}-star`;
  const a = `${id}-avatar`;
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={a} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* Profile card */}
      <rect
        x="34"
        y="20"
        width="80"
        height="60"
        rx="12"
        fill="#f3e8ff"
        transform="rotate(-5 74 50)"
      />
      <rect
        x="46"
        y="14"
        width="84"
        height="68"
        rx="12"
        fill="#fff"
        stroke="#ddd6fe"
        strokeWidth="1.5"
      />
      <circle cx="68" cy="36" r="11" fill={`url(#${a})`} />
      <rect x="85" y="30" width="36" height="6" rx="3" fill="#4c1d95" opacity="0.68" />
      <rect x="85" y="40" width="24" height="5" rx="2.5" fill="#c4b5fd" />
      <rect x="58" y="58" width="42" height="10" rx="5" fill="#ede9fe" />
      <rect x="105" y="58" width="18" height="10" rx="5" fill="#faf5ff" stroke="#ddd6fe" />
      {/* Rising bars — profile visibility climbing */}
      <rect x="150" y="58" width="9" height="22" rx="3" fill="#ddd6fe" />
      <rect x="164" y="46" width="9" height="34" rx="3" fill="#c4b5fd" />
      <rect x="178" y="32" width="9" height="48" rx="3" fill="#a78bfa" />
      {/* Premium sparkle badge */}
      <circle cx="196" cy="26" r="14" fill={`url(#${g})`} />
      <path
        d="M196 18l2.2 5.3 5.8.5-4.4 3.8 1.3 5.6-4.9-3-4.9 3 1.3-5.6-4.4-3.8 5.8-.5z"
        fill="#fff"
      />
    </svg>
  );
}

/** Agency hub connected out to partner nodes. */
function VendorConnectArt() {
  const id = useId();
  const g = `${id}-hub`;
  const nodes = [
    { cx: 46, cy: 26 },
    { cx: 42, cy: 70 },
    { cx: 196, cy: 24 },
    { cx: 200, cy: 70 },
  ];
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <g stroke="#ddd6fe" strokeWidth="2.25">
        {nodes.map((n, i) => (
          <line key={i} x1="120" y1="48" x2={n.cx} y2={n.cy} />
        ))}
      </g>
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r="13" fill="#fff" stroke="#e9e2ff" strokeWidth="1.5" />
          <circle cx={n.cx} cy={n.cy - 2.5} r="4.25" fill="#a78bfa" />
          <path d={`M${n.cx - 7} ${n.cy + 8}a7 7 0 0114 0z`} fill="#c4b5fd" />
        </g>
      ))}
      {/* Hub */}
      <circle cx="120" cy="48" r="26" fill="#f5f3ff" />
      <circle cx="120" cy="48" r="21" fill={`url(#${g})`} />
      <rect x="111" y="38" width="18" height="21" rx="2.5" fill="#fff" />
      <rect x="114.5" y="42" width="3.5" height="3.5" rx="1" fill="#8b5cf6" />
      <rect x="121" y="42" width="3.5" height="3.5" rx="1" fill="#8b5cf6" />
      <rect x="114.5" y="48.5" width="3.5" height="3.5" rx="1" fill="#8b5cf6" />
      <rect x="121" y="48.5" width="3.5" height="3.5" rx="1" fill="#8b5cf6" />
      <rect x="117" y="54.5" width="6" height="4.5" rx="1" fill="#c4b5fd" />
    </svg>
  );
}

/** Enterprise tower + shield + tuning sliders (bespoke, secured scale). */
function EnterpriseArt() {
  const id = useId();
  const g = `${id}-shield`;
  return (
    <svg viewBox="0 0 240 96" fill="none" className="h-full w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* Skyline */}
      <rect x="40" y="34" width="30" height="48" rx="5" fill="#e0e7ff" />
      <rect
        x="74"
        y="18"
        width="38"
        height="64"
        rx="6"
        fill="#fff"
        stroke="#c7d2fe"
        strokeWidth="1.5"
      />
      <rect x="116" y="42" width="26" height="40" rx="5" fill="#e0e7ff" />
      {[26, 38, 50, 62].map((y) => (
        <g key={y}>
          <rect x="82" y={y} width="7" height="7" rx="1.5" fill="#818cf8" />
          <rect x="97" y={y} width="7" height="7" rx="1.5" fill="#c7d2fe" />
        </g>
      ))}
      {/* Tuning sliders — "custom" */}
      <g stroke="#c7d2fe" strokeWidth="2.5" strokeLinecap="round">
        <line x1="156" y1="30" x2="196" y2="30" />
        <line x1="156" y1="46" x2="196" y2="46" />
        <line x1="156" y1="62" x2="196" y2="62" />
      </g>
      <circle cx="186" cy="30" r="5" fill="#6366f1" />
      <circle cx="168" cy="46" r="5" fill="#6366f1" />
      <circle cx="192" cy="62" r="5" fill="#6366f1" />
      {/* Shield */}
      <path d="M206 16l14 5v10c0 8.5-6 13-14 15-8-2-14-6.5-14-15V21z" fill={`url(#${g})`} />
      <path
        d="M200 32l4.5 4.5 8-9"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Category → illustration map                                         */
/* ------------------------------------------------------------------ */

const PLAN_ART: Record<PlanCategory, () => React.JSX.Element> = {
  EMPLOYER_JOB_POST: JobPostArt,
  EMPLOYER_CV_DATABASE: CvDatabaseArt,
  EMPLOYER_ASSISTED_HIRING: AssistedHiringArt,
  CANDIDATE_PREMIUM: CandidatePremiumArt,
  VENDOR_CONNECT: VendorConnectArt,
  EMPLOYER_CV_ENTERPRISE_CUSTOM: EnterpriseArt,
};

/* ------------------------------------------------------------------ */
/* Reusable band                                                       */
/* ------------------------------------------------------------------ */

interface PlanVisualBandProps {
  category: PlanCategory | string | undefined;
  /** Band height. `sm` for dense cards, `md` (default) for plan cards, `lg` for hero panels. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Richness rung. Omit and the band renders exactly as it always has (the
   * `core` treatment), so every pre-existing call site is unchanged.
   */
  tier?: PlanTier;
  className?: string;
}

const BAND_HEIGHT = { sm: 'h-20', md: 'h-24', lg: 'h-36' } as const;

/**
 * Rising particles for the highlighted / current plan card. Positions, sizes
 * and timings are hand-picked rather than random so the drift reads composed
 * instead of noisy, and so server and client render identical markup.
 */
const PARTICLES = [
  { left: '14%', size: 'h-1.5 w-1.5', delay: '0s', duration: '6.4s' },
  { left: '31%', size: 'h-1 w-1', delay: '1.8s', duration: '7.6s' },
  { left: '48%', size: 'h-2 w-2', delay: '0.9s', duration: '8.2s' },
  { left: '63%', size: 'h-1 w-1', delay: '3.1s', duration: '6.9s' },
  { left: '79%', size: 'h-1.5 w-1.5', delay: '2.3s', duration: '7.9s' },
  { left: '90%', size: 'h-1 w-1', delay: '4.2s', duration: '6.6s' },
];

/**
 * PlanParticles — ambient rising motes, shown ONLY on the highlighted or
 * current plan card so the selected option feels alive without turning every
 * card into a light show. Brand primary regardless of the card's category
 * colour, matching the rest of the highlighted treatment.
 *
 * Renders inside the band's `overflow-hidden` box, so the motes fade out
 * within the band rather than escaping over the card body.
 */
export function PlanParticles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {PARTICLES.map((p) => (
        <span
          key={p.left}
          className={`bg-primary/45 animate-particle-rise absolute bottom-0 rounded-full motion-reduce:hidden ${p.size}`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
        />
      ))}
    </div>
  );
}

/**
 * PlanVisualBand — the illustration band shared by every plan surface:
 * accent gradient wash + blurred glow + the category illustration + a fade
 * into the card body. Reacts to `group-hover` on the nearest `group`
 * ancestor (the card), so the host card owns the hover state.
 */
export default function PlanVisualBand({
  category,
  size = 'md',
  tier = 'core',
  className = '',
}: PlanVisualBandProps) {
  // Category still owns the illustration; tier owns how rich the treatment is.
  const { theme, art, ornament } = getPlanTierVisual(category, tier);
  const Art = (category && PLAN_ART[category as PlanCategory]) || JobPostArt;
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-gradient-to-br ${BAND_HEIGHT[size]} ${theme.wash} ${className}`}
    >
      {/* Blurred accent glow — brightens + expands with the card's hover */}
      <div
        className={`absolute top-1/2 left-1/2 h-28 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-90 ${theme.glow}`}
      />

      {/* Tier ≥ pro — a faint corner ray fan, giving the richer rungs depth
          the base tiers do not get. */}
      {ornament >= 3 && (
        <div className="absolute -top-6 -right-4 h-24 w-24 rotate-12 bg-[conic-gradient(from_180deg,transparent_0deg,rgba(255,255,255,0.55)_35deg,transparent_70deg)] opacity-70" />
      )}

      {/* Illustration — scales up with the card's hover. `art` desaturates the
          free tier so it reads as the entry rung. */}
      <div
        className={`absolute inset-0 flex items-center justify-center p-3 transition-transform duration-500 ease-out group-hover:scale-105 ${art}`}
      >
        <Art />
      </div>

      {/* Tier ≥ pro — sparkle motes + a sheen that sweeps across on hover. */}
      {ornament >= 2 && (
        <>
          <span className="absolute top-3 right-5 h-1.5 w-1.5 rounded-full bg-white/90 shadow-sm" />
          <span className="absolute top-7 right-9 h-1 w-1 rounded-full bg-white/70" />
          <span className="absolute bottom-8 left-6 h-1 w-1 rounded-full bg-white/70" />
          <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%] motion-reduce:transition-none" />
        </>
      )}

      {/* Fade into the card body below */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}
