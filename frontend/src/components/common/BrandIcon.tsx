'use client';

import { SiWhatsapp } from 'react-icons/si';
import type { IconType } from 'react-icons';

/**
 * Brand-icon registry.
 *
 * The host platform mapped 35 brands here — X, LinkedIn, GitHub, Dribbble,
 * Behance, Upwork, Fiverr and the rest — for candidate/company social links and
 * a marketing footer. None of those surfaces exist; the single call site is
 * AwayToggle, which renders the WhatsApp mark next to the Online/Away switch.
 *
 * Keeping the indirection (rather than importing `SiWhatsapp` directly at the
 * call site) is deliberate: it is one file to touch if the icon library is ever
 * swapped, and `react-icons` has form here — a clean install floated it to a
 * version that had dropped `SiSlack` and `SiCodepen`, which broke the build
 * precisely because this file imported 34 icons nothing rendered.
 */
const REGISTRY: Record<string, IconType> = {
  whatsapp: SiWhatsapp,
};

/** Official brand colour, used when `brandColor` is set. */
const BRAND_COLOURS: Partial<Record<string, string>> = {
  whatsapp: '#25D366',
};

export type BrandIconName = keyof typeof REGISTRY;

interface Props {
  /** Brand slug — must exist in REGISTRY. Unknown names render nothing. */
  name: BrandIconName | (string & {});
  /** Tailwind className — controls colour, hover state, size, etc. */
  className?: string;
  /** Pixel size override. Prefer Tailwind h-/w- classes. */
  size?: number | string;
  /** Accessible label. Omit for purely decorative icons. */
  title?: string;
  /**
   * Render the brand's official colour via `style.color` instead of inheriting
   * currentColor. Use where the icon identifies a channel (the Away toggle);
   * leave off in monochrome contexts.
   */
  brandColor?: boolean;
}

export default function BrandIcon({ name, className, size, title, brandColor }: Props) {
  const Icon = REGISTRY[name];
  if (!Icon) {
    // Unknown brand — returning null is the safest default so a typo cannot
    // crash the page.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[BrandIcon] Unknown brand: "${name}"`);
    }
    return null;
  }
  const style = brandColor ? { color: BRAND_COLOURS[name] ?? undefined } : undefined;
  return <Icon className={className} size={size} title={title} style={style} aria-label={title} />;
}
