import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';

interface LogoProps {
  href?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// The logo grows on every device, but mobile bumps are tuned to the
// surface each tier lands on so nothing overflows the chrome:
//   - `md` is the header/footer tier and lands in the DENSEST surface,
//     the mobile dashboard header (hamburger + logo on the left; search
//     icon, billing badge, bell and avatar menu on the right, all
//     shrink-0). The logo SVG is 205×48, so each +1 px of height adds
//     ~4.3 px of width — the mobile `md` is therefore raised only
//     modestly. Desktop (`sm:`) headers are a roomy 80 px (h-20) with
//     no hamburger past `lg`, so `md` grows to a prominent 70 px there.
//   - `sm` lands in the mobile sidebar header (logo + close only) and
//     `lg` on centered, unconstrained auth cards — both can grow more.
//   sm: 48 px → 64 px  (mobile sidebar)
//   md: 52 px → 70 px  (public header, dashboard header, footer, onboarding, MFA gates)
//   lg: 64 px → 96 px  (auth pages, portal login)
const sizeStyles = {
  sm: 'h-12 sm:h-16',
  md: 'h-[52px] sm:h-[70px]',
  lg: 'h-16 sm:h-24',
} as const;

export default function Logo({ href = '/', className, size = 'md' }: LogoProps) {
  const img = (
    <Image
      src="/icons/logo.svg"
      alt="HireAdda"
      width={205}
      height={48}
      className={cn(sizeStyles[size], 'w-auto', className)}
      priority
      fetchPriority="high"
    />
  );

  if (href) {
    return (
      <Tooltip content="Go to homepage">
        <Link href={href} className="flex items-center">
          {img}
        </Link>
      </Tooltip>
    );
  }

  return img;
}
