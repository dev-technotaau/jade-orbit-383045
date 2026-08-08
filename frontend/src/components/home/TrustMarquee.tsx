// NOT a client component. The scroll is a pure CSS keyframe animation and
// reduced-motion is handled by `motion-reduce:animate-none`, so nothing here
// needs the browser — this whole band ships zero JavaScript.
import {
  BadgeCheck,
  Sparkles,
  Zap,
  FileText,
  Bell,
  MessageSquare,
  Lock,
  Headphones,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/**
 * TrustMarquee — an infinite, auto-scrolling strip of value/trust-signal pills
 * (not company logos — by request). A lightweight "why professionals choose us"
 * band that adds motion between heavier sections. The track is duplicated and
 * translated -50% for a seamless loop; disabled for reduced-motion users.
 */

/**
 * Chip tones. Each entry holds COMPLETE literal utility strings on purpose:
 * Tailwind v4 scans source text for class names, so a class assembled at
 * runtime (`bg-${tone}-100`) is never generated and silently renders unstyled.
 */
type ToneKey = 'primary' | 'secondary' | 'accent' | 'success';

const TONES: Record<ToneKey, { wash: string; medallion: string; icon: string }> = {
  primary: {
    wash: 'to-primary-50',
    medallion: 'bg-primary-100 ring-primary/15',
    icon: 'text-primary',
  },
  secondary: {
    wash: 'to-secondary-50',
    medallion: 'bg-secondary-100 ring-secondary/20',
    icon: 'text-secondary-dark',
  },
  accent: {
    wash: 'to-accent-50',
    medallion: 'bg-accent-100 ring-accent/15',
    icon: 'text-accent-dark',
  },
  success: {
    // No `--color-success-50` token exists; `--color-success` is green-500, so
    // green-50 from the default palette is the correct family.
    wash: 'to-green-50',
    medallion: 'bg-success-light ring-success/25',
    icon: 'text-success-dark',
  },
};

/**
 * Tones are sequenced so no two neighbours repeat — including across the loop
 * seam, where the last item scrolls up against the first. Blue and cyan carry
 * the brand, amber marks speed and people, green marks trust and safety.
 */
const ITEMS: { icon: LucideIcon; label: string; tone: ToneKey }[] = [
  { icon: BadgeCheck, label: 'Verified employers', tone: 'success' },
  { icon: Sparkles, label: 'AI-powered matching', tone: 'secondary' },
  { icon: Zap, label: '1-click quick apply', tone: 'accent' },
  { icon: FileText, label: 'Free resume builder', tone: 'primary' },
  { icon: Bell, label: 'Smart job alerts', tone: 'secondary' },
  { icon: MessageSquare, label: 'Real-time chat', tone: 'accent' },
  { icon: Lock, label: 'Data encrypted', tone: 'success' },
  { icon: Headphones, label: 'Assisted hiring', tone: 'primary' },
  { icon: Search, label: 'CV database access', tone: 'accent' },
  { icon: ShieldCheck, label: 'Secure & trusted', tone: 'primary' },
];

export default function TrustMarquee() {
  const row = [...ITEMS, ...ITEMS];

  return (
    // Grey band, NOT white: the How It Works section directly below is
    // `bg-white py-16 sm:py-24`, so a white marquee had no boundary against it
    // and the two paddings collapsed into one 144px expanse (vs 48px above,
    // where the dark ImpactBanner ends). Grey restores the boundary, and the
    // padding is deliberately kept identical to How It Works so the vertical
    // rhythm matches. Keep these two in sync if either changes.
    <section className="bg-[var(--bg-secondary)] py-16 sm:py-24">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          Why professionals choose Hire Adda
        </p>
      </div>
      {/* `-my-4 py-4` is a self-cancelling pair. `overflow-hidden` is required
          for the loop, but it clips vertically too, which would cut off each
          chip's ambient shadow; the padding buys that headroom back inside the
          clip box and the negative margin keeps section rhythm unchanged. Same
          trick as the LatestJobsSection carousel track. */}
      {/* PERF — this band was the laggiest thing on the homepage, for two
          compounding reasons, both fixed here with no visual change:

          1. A CSS `mask-image` on the scroller. A mask forces the whole strip
             into a masked layer that is re-composited on EVERY frame while the
             track moves. The identical fade is achieved below with two static
             gradient overlays, which paint once — the band sits on a solid
             `--bg-secondary`, so fading to that colour is pixel-equivalent to
             fading to transparent.
          2. Framer Motion drove `x` from JS, writing a transform on every
             frame on the main thread for the life of the page. The same
             0 → -50% loop as a CSS keyframe animates on the compositor
             instead. Dropping the motion dependency also let this component
             stop being a client component, so it now ships zero JS. */}
      <div className="relative -my-4 overflow-hidden py-4">
        <div className="animate-marquee flex w-max gap-3.5 motion-reduce:animate-none">
          {row.map((item, i) => {
            const Icon = item.icon;
            const tone = TONES[item.tone];
            return (
              <div
                key={i}
                className={`flex flex-none items-center gap-2.5 rounded-full bg-gradient-to-b from-white py-1.5 pr-4 pl-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_6px_16px_-8px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 ${tone.wash}`}
              >
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ring-1 ring-inset ${tone.medallion}`}
                >
                  <Icon className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold whitespace-nowrap text-[var(--text)]">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Edge fades — the mask replacement. Static, painted once, and
            colour-matched to the band so the result is identical. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[8%] bg-gradient-to-r from-[var(--bg-secondary)] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[8%] bg-gradient-to-l from-[var(--bg-secondary)] to-transparent"
        />
      </div>
    </section>
  );
}
