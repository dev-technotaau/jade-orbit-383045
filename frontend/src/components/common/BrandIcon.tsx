'use client';

import {
  SiWhatsapp,
  SiX,
  SiFacebook,
  SiInstagram,
  SiYoutube,
  SiGithub,
  SiMedium,
  SiDribbble,
  SiBehance,
  SiStackoverflow,
  SiGoogle,
  SiTelegram,
  SiSlack,
  SiDiscord,
  SiReddit,
  SiPinterest,
  SiTiktok,
  SiSnapchat,
  SiThreads,
  SiUpwork,
  SiFiverr,
  SiNaver,
  SiQuora,
  SiKaggle,
  SiCodepen,
  SiHashnode,
  SiDevdotto,
  SiSubstack,
  SiWordpress,
  SiMastodon,
  SiBluesky,
  SiSpotify,
  SiTwitch,
  SiVimeo,
} from 'react-icons/si';
// Simple Icons dropped `SiLinkedin` due to a LinkedIn trademark
// takedown — fall back to Font Awesome's brand-correct glyph. Same
// visual feel; the official LinkedIn "in" mark.
import { FaLinkedinIn } from 'react-icons/fa6';
import type { IconType } from 'react-icons';

/**
 * Canonical brand-icon registry. Centralising the brand-name → SVG
 * mapping means:
 *
 *   1. Every WhatsApp / X / LinkedIn glyph across the site looks identical
 *      (no half-the-app-on-MessageCircle, the-other-half-on-Phone-Call).
 *   2. Swapping libraries later touches one file — call sites stay put.
 *   3. Adding a new brand (e.g. Telegram support channel, TikTok recruiter
 *      profile) means adding ONE registry entry.
 *
 * Naming follows Simple Icons' lowercase brand slug (whatsapp, github,
 * linkedin, x, stackoverflow, ...). Aliases for backward-compatibility
 * with previously named fields (e.g. "twitter" still resolves to X
 * since the field on CandidateProfile is `twitterProfile`).
 */
const REGISTRY: Record<string, IconType> = {
  whatsapp: SiWhatsapp,
  x: SiX,
  // Alias: candidate / company profile fields still call this
  // "twitterProfile" / "twitter" in the DB; map to the modern X glyph.
  twitter: SiX,
  facebook: SiFacebook,
  instagram: SiInstagram,
  youtube: SiYoutube,
  linkedin: FaLinkedinIn,
  github: SiGithub,
  medium: SiMedium,
  dribbble: SiDribbble,
  behance: SiBehance,
  stackoverflow: SiStackoverflow,
  google: SiGoogle,
  telegram: SiTelegram,
  slack: SiSlack,
  discord: SiDiscord,
  reddit: SiReddit,
  pinterest: SiPinterest,
  tiktok: SiTiktok,
  snapchat: SiSnapchat,
  threads: SiThreads,
  upwork: SiUpwork,
  fiverr: SiFiverr,
  naver: SiNaver,
  quora: SiQuora,
  kaggle: SiKaggle,
  codepen: SiCodepen,
  hashnode: SiHashnode,
  devto: SiDevdotto,
  substack: SiSubstack,
  wordpress: SiWordpress,
  mastodon: SiMastodon,
  bluesky: SiBluesky,
  spotify: SiSpotify,
  twitch: SiTwitch,
  vimeo: SiVimeo,
};

export type BrandIconName = keyof typeof REGISTRY;

interface Props {
  /** Brand slug — must exist in REGISTRY. Unknown names return null (callers should provide a lucide fallback). */
  name: BrandIconName | (string & {});
  /** Tailwind className — controls colour, hover state, size, etc. */
  className?: string;
  /** Pixel size override. Prefer Tailwind h-/w- classes; this is for inline SVG callers that don't use Tailwind here. */
  size?: number | string;
  /** Accessible label. Omit for purely decorative icons (the rendered label/text alongside is the actual a11y label). */
  title?: string;
  /**
   * When true, render the brand's official colour via `style.color` so
   * the icon shows up at brand colour wherever it goes. When false
   * (default), inherits currentColor — matching the rest of the
   * surrounding icon set in monochrome contexts (cards, list rows).
   */
  brandColor?: boolean;
}

/**
 * Official brand colours from Simple Icons CDN. Keep the list short and
 * include only the brands we actually surface in brand-colour mode
 * (footer, share menus, social proof). Extend on demand.
 */
const BRAND_COLOURS: Partial<Record<string, string>> = {
  whatsapp: '#25D366',
  x: '#000000',
  twitter: '#000000', // alias resolves to X
  facebook: '#1877F2',
  instagram: '#E4405F',
  youtube: '#FF0000',
  linkedin: '#0A66C2',
  github: '#181717',
  medium: '#000000',
  dribbble: '#EA4C89',
  behance: '#1769FF',
  stackoverflow: '#F58025',
  google: '#4285F4',
  telegram: '#26A5E4',
  slack: '#4A154B',
  discord: '#5865F2',
  reddit: '#FF4500',
  pinterest: '#E60023',
  tiktok: '#000000',
  threads: '#000000',
};

export default function BrandIcon({ name, className, size, title, brandColor }: Props) {
  const Icon = REGISTRY[name];
  if (!Icon) {
    // Unknown brand — caller should have provided a fallback. Returning
    // null is the safest default so a typo doesn't crash the page.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[BrandIcon] Unknown brand: "${name}"`);
    }
    return null;
  }
  const style = brandColor ? { color: BRAND_COLOURS[name] ?? undefined } : undefined;
  return <Icon className={className} size={size} title={title} style={style} aria-label={title} />;
}
