import Tooltip from '@/components/ui/Tooltip';
import { Lock, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

/**
 * Compact trust + credibility row for the public footer + About page.
 *
 * Six tiles, each linking to a credible source where applicable:
 *   - Razorpay  — "Powered by Razorpay (PCI-DSS Level 1)"
 *   - PCI-DSS   — payment industry compliance
 *   - SSL/TLS   — "256-bit TLS / Secure"
 *   - GSTIN     — "GST Registered Business"
 *   - Make in India / MSME / Startup India — corporate credibility
 *
 * Uses the assets already shipped under /public/icons/payments/.
 * Designed to be visually quiet — small badges, no shouting copy.
 */

interface Badge {
  slug: string;
  label: string;
  helper: string;
  width: number;
  height: number;
  /**
   * Optional Tailwind height override for the rendered <Image>. Defaults
   * to `h-5 w-auto` (20 px tall). Only used now for badges whose SVG is
   * intrinsically square (Udyam, GST) — at h-5 they'd render 20 × 20
   * which is too small next to wordmark logos. h-7 (28 px) pulls them
   * back into visual parity. The other badges (PCI-DSS, SSL,
   * Startup-India, Make-in-India) used to need this override too because
   * their SVGs had heavy interior padding; the source SVGs have since
   * been cropped to their tight content bbox (see public/icons/payments/
   * commit) so the artwork now fills the SVG itself and `h-5 w-auto` is
   * enough to render at a sensible width.
   */
  imgClassName?: string;
}

const BADGE_IMG_CLASS_LARGE = 'h-7 w-auto';

const BADGES: Badge[] = [
  {
    slug: 'razorpay',
    label: 'Powered by Razorpay',
    helper: 'Secure payment processing — RBI-licensed PA',
    width: 100,
    height: 32,
  },
  {
    slug: 'pci-dss',
    label: 'PCI-DSS Level 1',
    helper: 'Card data is never stored on Hire Adda servers',
    width: 60,
    height: 32,
  },
  {
    slug: 'ssl-secure',
    label: '256-bit TLS Encrypted',
    helper: 'Every payment + login secured by TLS 1.3',
    width: 56,
    height: 32,
  },
  {
    slug: 'gstin-verified',
    label: 'GST Registered',
    helper: 'GSTIN-verified seller — tax invoice on every order',
    width: 56,
    height: 32,
    imgClassName: BADGE_IMG_CLASS_LARGE,
  },
  {
    slug: 'msme-udyam',
    label: 'MSME / Udyam Registered',
    helper: 'Recognised Indian small-business entity',
    width: 70,
    height: 32,
    imgClassName: BADGE_IMG_CLASS_LARGE,
  },
  {
    slug: 'startup-india',
    label: 'Startup India',
    helper: 'DPIIT-recognised startup',
    width: 80,
    height: 32,
  },
  {
    slug: 'make-in-india',
    label: 'Make in India',
    helper: 'Built in Bharat, for Bharat',
    width: 80,
    height: 32,
  },
];

interface Props {
  /** Compact removes the helper line; full shows the small italic byline. */
  variant?: 'full' | 'compact';
  className?: string;
}

export default function TrustBadges({ variant = 'full', className = '' }: Props) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {BADGES.map((b) => (
          <Tooltip key={b.slug} content={b.helper}>
            <span
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-2.5 transition hover:border-[var(--text-muted)] hover:shadow-sm"
              aria-label={b.label}
            >
              <Image
                src={`/icons/payments/${b.slug}.svg`}
                alt={b.label}
                width={b.width}
                height={b.height}
                className={b.imgClassName ?? 'h-5 w-auto'}
                unoptimized
              />
            </span>
          </Tooltip>
        ))}
      </div>

      {variant === 'full' && (
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-center text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={12} className="text-emerald-600" />
            256-bit TLS · PCI-DSS Level 1
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-600" />
            No card data stored on our servers
          </span>
        </p>
      )}
    </div>
  );
}
