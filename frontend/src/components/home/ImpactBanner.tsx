'use client';

import { motion } from 'framer-motion';
// TrendingUp is still the "Our impact" eyebrow icon; Send is the new
// applications-submitted stat icon.
import { Briefcase, Building2, Users, Send, TrendingUp, type LucideIcon } from 'lucide-react';
import { useCountUp } from '@/hooks/use-count-up';

interface ImpactStats {
  activeJobs: number;
  companies: number;
  candidates: number;
  /** Applications submitted — a fully on-platform action, so always accurate. */
  applications: number;
}

interface StatItem {
  icon: LucideIcon;
  value: number;
  label: string;
}

/** Compact "12k+" / "850+" formatting; "0" stays bare (guarded below). */
function formatStat(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k+`;
  if (v > 0) return `${v}+`;
  return '0';
}

function Stat({ item, index }: { item: StatItem; index: number }) {
  const { value, ref } = useCountUp<HTMLDivElement>(item.value);
  const Icon = item.icon;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.1, 0.4) }}
      className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-6 text-center backdrop-blur-sm sm:py-7"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="text-3xl font-extrabold tracking-tight text-white tabular-nums sm:text-4xl">
        {formatStat(value)}
      </div>
      <div className="mt-1 text-sm text-white/70">{item.label}</div>
    </motion.div>
  );
}

/**
 * ImpactBanner — full-bleed dark "impact" band with a looping abstract-network
 * background video and count-up platform stats. Replaces the previously flat
 * white Stats section; the dark treatment gives the page a strong colored beat
 * and real depth. Stats are the same server-fetched numbers the hero uses.
 */
export default function ImpactBanner({ stats }: { stats: ImpactStats }) {
  const items: StatItem[] = [
    { icon: Briefcase, value: stats.activeJobs, label: 'Active jobs' },
    { icon: Building2, value: stats.companies, label: 'Verified companies' },
    { icon: Users, value: stats.candidates, label: 'Registered candidates' },
    // Was "Successful placements" (applications marked HIRED). The final hire
    // happens off-platform, so that status is rarely set and the number
    // understated reality. Applications are created on-platform.
    { icon: Send, value: stats.applications, label: 'Applications submitted' },
  ];

  return (
    <section className="relative overflow-hidden bg-[#0a1020] py-16 sm:py-20">
      {/* Decorative background video — abstract blue network. Muted, aria-hidden;
          the poster paints instantly while it loads. */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/images/home/impact-bg.webp"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
      >
        <source src="/images/home/impact-bg.mp4" type="video/mp4" />
      </video>
      {/* Legibility + brand tint overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1020]/80 via-[#0a1020]/70 to-[#0a1020]/90" />
      <div className="from-primary/25 absolute inset-0 bg-gradient-to-tr to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            Our impact
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Powering careers &amp; hiring across India
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/70">
            Real momentum — live jobs, verified companies and a candidate community growing every
            day.
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {items.map((item, i) => (
            <Stat key={item.label} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
