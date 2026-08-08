import Tooltip from '@/components/ui/Tooltip';
import Image from 'next/image';

/**
 * Public-site footer "Payments accepted" row.
 *
 * Renders all the rails Hire Adda actually accepts via Razorpay, grouped
 * by category (Cards · UPI · Wallets · Net Banking). Each logo is an SVG
 * shipped from `/public/icons/payments/`.
 *
 * The component degrades gracefully — if a particular SVG file is missing
 * or fails to load, the slot still shows a labelled chip so the footer
 * never collapses or shows a broken-image icon.
 */

interface PaymentLogo {
  /** Filename (without extension) under /public/icons/payments/. */
  slug: string;
  label: string;
  /** Logo's natural ratio — used for the next/image width:height pair. */
  width: number;
  height: number;
  /**
   * Optional Tailwind height override for the rendered <Image>. Defaults
   * to `h-6 w-auto` (20 px tall) which works for tight cropped logos
   * (visa, mastercard, etc.). Logos that ship with a lot of internal
   * whitespace in their viewBox (e.g. netbanking) need a taller render
   * so the visible artwork fills the 36 px box like the others.
   */
  imgClassName?: string;
}

interface PaymentGroup {
  title: string;
  items: PaymentLogo[];
}

const GROUPS: PaymentGroup[] = [
  {
    title: 'Cards',
    items: [
      { slug: 'visa', label: 'Visa', width: 56, height: 32 },
      { slug: 'mastercard', label: 'Mastercard', width: 56, height: 32 },
      { slug: 'amex', label: 'American Express', width: 40, height: 32 },
      { slug: 'rupay', label: 'RuPay', width: 60, height: 32 },
      { slug: 'diners', label: 'Diners Club', width: 56, height: 32 },
    ],
  },
  {
    title: 'UPI',
    items: [
      { slug: 'upi', label: 'UPI', width: 56, height: 32 },
      { slug: 'bhim', label: 'BHIM', width: 56, height: 32 },
    ],
  },
  {
    title: 'Wallets',
    items: [
      { slug: 'paytm', label: 'Paytm', width: 60, height: 32 },
      { slug: 'phonepay', label: 'PhonePe', width: 64, height: 32 },
      { slug: 'googlepay', label: 'Google Pay', width: 56, height: 32 },
      { slug: 'amazonpay', label: 'Amazon Pay', width: 70, height: 32 },
    ],
  },
  {
    title: 'Net Banking',
    items: [
      {
        slug: 'netbanking',
        label: 'Net Banking — all major banks',
        width: 64,
        height: 32,
        // Source SVG was cropped to its tight content bbox (was 100x100
        // with a thin horizontal strip in the middle), so the default
        // `h-5 w-auto` now renders at a proper width like the other
        // payment tiles. The earlier `h-7` override is no longer needed.
      },
    ],
  },
];

interface Props {
  /**
   * "compact" hides group titles and renders a single row — used in tight
   * places (e.g. checkout). Default is the full footer layout.
   */
  variant?: 'full' | 'compact';
  className?: string;
}

export default function PaymentMethodsBar({ variant = 'full', className = '' }: Props) {
  if (variant === 'compact') {
    const all = GROUPS.flatMap((g) => g.items);
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        {all.map((it) => (
          <PaymentLogoCell key={it.slug} item={it} />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((group) => (
          <div key={group.title} className="min-w-0">
            <h4 className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              {group.title}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              {group.items.map((it) => (
                <PaymentLogoCell key={it.slug} item={it} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders a single payment-method tile. Uses `next/image` so the SVG is
 * served via Next's optimiser. The wrapping <span> sets a fixed height so
 * the footer doesn't reflow if a logo loads slightly later than the rest.
 */
function PaymentLogoCell({ item }: { item: PaymentLogo }) {
  return (
    <Tooltip content={item.label}>
      <span
        className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-2.5 transition hover:border-[var(--text-muted)] hover:shadow-sm"
        aria-label={item.label}
      >
        <Image
          src={`/icons/payments/${item.slug}.svg`}
          alt={item.label}
          width={item.width}
          height={item.height}
          className={item.imgClassName ?? 'h-5 w-auto'}
          unoptimized
        />
      </span>
    </Tooltip>
  );
}
