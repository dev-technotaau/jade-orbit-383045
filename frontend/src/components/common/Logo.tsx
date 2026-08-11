'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Brand mark, with a text fallback.
 *
 * This module is meant to be re-skinned per client, so the logo cannot be
 * assumed to exist. Resolution order:
 *   1. NEXT_PUBLIC_BRAND_LOGO, when set to a path
 *   2. NEXT_PUBLIC_BRAND_NAME rendered as a wordmark
 *   3. 'WhatsApp Module'
 *
 * Marks that ship in public/: logo.svg (TechnoTaau — the module default) and
 * logo-iths.svg. Point BRAND_LOGO at the one for this deployment, or set it to
 * an empty string to fall through to the BRAND_NAME wordmark and ship no mark.
 *
 * Both files are cropped so their artwork fills the viewBox edge to edge. A
 * logo with padding baked into its viewBox renders visibly off-centre wherever
 * the element itself is centred, because only the box gets centred, not the ink.
 *
 * Two layers of fallback: an unset/empty BRAND_LOGO skips the <Image> entirely
 * (no 404 round-trip), and if a configured path fails to load, the image's own
 * onError swaps in the wordmark rather than a broken-image icon.
 */

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'TechnoTaau';
const BRAND_LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/logo.svg';

interface LogoProps {
  href?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const imgSize = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
} as const;

const textSize = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

export default function Logo({ href = '/whatsapp', className, size = 'md' }: LogoProps) {
  const [failed, setFailed] = useState(false);

  const content =
    failed || !BRAND_LOGO ? (
      <span
        className={cn('font-semibold tracking-tight text-[var(--text)]', textSize[size], className)}
      >
        {BRAND_NAME}
      </span>
    ) : (
      <Image
        src={BRAND_LOGO}
        alt={BRAND_NAME}
        // Nominal only: w-auto means the browser uses the file's real ratio once
        // loaded. Matches logo.svg so the default has no pre-load shift.
        width={162}
        height={48}
        // `unoptimized` because the file is swapped per deployment: Next's
        // optimiser would otherwise cache a build-time transform of whichever
        // logo happened to be present.
        unoptimized
        priority
        onError={() => setFailed(true)}
        className={cn(imgSize[size], 'w-auto', className)}
      />
    );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex shrink-0 items-center" aria-label={BRAND_NAME}>
      {content}
    </Link>
  );
}

/** The resolved brand name, for page titles and metadata. */
export { BRAND_NAME };
