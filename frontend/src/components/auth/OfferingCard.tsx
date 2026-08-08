import Link from 'next/link';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';

/**
 * OfferingCard — a premium "service category" card used by the enhanced
 * employer & candidate auth pages (EmployerOfferings / CandidateOfferings).
 *
 * The whole card is a link that deep-links to the matching section of the
 * relevant pricing page (e.g. /pricing/employer#employer_cv_database), the
 * same destinations the header "Our Offerings" menu uses. Each card carries a
 * per-category accent and a layered hover (lift + accent bar + glow + icon
 * motion + arrow slide). Light-mode only.
 */

export type OfferingAccent = 'blue' | 'violet' | 'emerald' | 'amber';

export interface OfferingCardData {
  title: string;
  description: string;
  features: string[];
  href: string;
  ctaLabel: string;
  icon: LucideIcon;
  accent: OfferingAccent;
  badge?: string;
  /** Draws a subtle brand ring to mark the flagship/most-popular card. */
  highlight?: boolean;
}

const ACCENTS: Record<
  OfferingAccent,
  {
    tile: string;
    text: string;
    hoverBorder: string;
    glow: string;
    bar: string;
    wash: string;
    badge: string;
  }
> = {
  blue: {
    tile: 'from-blue-500 to-indigo-600',
    text: 'text-blue-600',
    hoverBorder: 'hover:border-blue-400/70',
    glow: 'bg-blue-400/25',
    bar: 'from-blue-500 to-indigo-600',
    wash: 'from-blue-500/[0.07]',
    badge: 'bg-blue-600',
  },
  violet: {
    tile: 'from-violet-500 to-purple-600',
    text: 'text-violet-600',
    hoverBorder: 'hover:border-violet-400/70',
    glow: 'bg-violet-400/25',
    bar: 'from-violet-500 to-purple-600',
    wash: 'from-violet-500/[0.07]',
    badge: 'bg-violet-600',
  },
  emerald: {
    tile: 'from-emerald-500 to-teal-600',
    text: 'text-emerald-600',
    hoverBorder: 'hover:border-emerald-400/70',
    glow: 'bg-emerald-400/25',
    bar: 'from-emerald-500 to-teal-600',
    wash: 'from-emerald-500/[0.07]',
    badge: 'bg-emerald-600',
  },
  amber: {
    tile: 'from-amber-500 to-orange-600',
    text: 'text-amber-600',
    hoverBorder: 'hover:border-amber-400/70',
    glow: 'bg-amber-400/25',
    bar: 'from-amber-500 to-orange-600',
    wash: 'from-amber-500/[0.07]',
    badge: 'bg-amber-600',
  },
};

export default function OfferingCard({
  title,
  description,
  features,
  href,
  ctaLabel,
  icon: Icon,
  accent,
  badge,
  highlight,
}: OfferingCardData) {
  const a = ACCENTS[accent];

  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl sm:p-7 ${
        highlight ? 'border-primary/40 ring-primary/15 ring-1' : 'border-[var(--border)]'
      } ${a.hoverBorder}`}
    >
      {/* Hover wash — a faint accent tint that fades in across the card. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.wash} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      {/* Top accent bar — wipes in from the left on hover. */}
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r ${a.bar} transition-transform duration-300 group-hover:scale-x-100`}
      />
      {/* Corner glow — grows and brightens on hover. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full ${a.glow} opacity-60 blur-3xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-100`}
      />

      {/* Icon tile + optional badge */}
      <div className="relative flex items-start justify-between">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${a.tile} text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}
        >
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        {badge && (
          <span
            className={`inline-flex items-center rounded-full ${a.badge} px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase`}
          >
            {badge}
          </span>
        )}
      </div>

      <h3 className="relative mt-5 text-lg font-bold text-[var(--text)]">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>

      <ul className="relative mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <Check className={`mt-0.5 h-4 w-4 flex-none ${a.text}`} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA — pinned to the card bottom so every card aligns. */}
      <div
        className={`relative mt-auto flex items-center gap-1.5 border-t border-[var(--border)] pt-4 text-sm font-semibold ${a.text} transition-all duration-300 group-hover:gap-2.5`}
      >
        {ctaLabel}
        <ArrowRight
          className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
