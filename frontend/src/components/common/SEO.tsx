import type { Metadata } from 'next';
import { APP_CONFIG } from '@/constants/config';
import { OG_IMAGE_VARIANTS, TWITTER_IMAGE_URL, withAltOverride } from '@/constants/og-images';
import { SEO_CONFIG } from '@/constants/seo';

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string[];
  /**
   * Override the default OG image set. Accepts either a single URL string
   * (used as a wide 1200×630 image) or an array of `{url,width,height,alt}`
   * objects for per-page multi-variant control. When omitted, the page
   * inherits the site-wide OG variants from `constants/og-images.ts`.
   */
  image?: string | ReadonlyArray<{ url: string; width: number; height: number; alt: string }>;
  /** Page URL path (absolute or relative). Used as canonical. */
  url?: string;
  /** Block indexing for this page. */
  noindex?: boolean;
  /** Block crawlers following links from this page. */
  nofollow?: boolean;
  /** ISO 8601 date — enables `article:published_time` for article-style pages. */
  datePublished?: string;
  /** ISO 8601 date — enables `article:modified_time`. */
  dateModified?: string;
  /** OG type override (`article`, `profile`, `book`, etc.). Defaults to `website`. */
  type?: 'website' | 'article' | 'profile' | 'book';
  /** Author name — populates `article:author`. */
  author?: string;
  /** Article section — populates `article:section`. */
  section?: string;
  /** Article tags — populate `article:tag`. */
  tags?: string[];
  /** hreflang overrides for this specific page. */
  languages?: Record<string, string>;
  /** Pagination — emits `<link rel="prev">` / `<link rel="next">`. */
  pagination?: { prev?: string; next?: string };
}

/**
 * Generate Next.js metadata for a page.
 *
 * Usage:
 *   1. Inherit site-wide OG images (alt text derives from the page title):
 *        export const metadata = generateMetadata({ title: 'Jobs' });
 *   2. Supply a single page-specific wide (1200x630) image:
 *        export const metadata = generateMetadata({
 *          title: 'Jobs',
 *          image: '/images/og-jobs.png',
 *        });
 *   3. Supply page-specific multi-variant images:
 *        export const metadata = generateMetadata({
 *          title: 'Jobs',
 *          image: [
 *            { url: '/images/og-jobs-wide.png', width: 1200, height: 630, alt: 'Jobs' },
 *            { url: '/images/og-jobs-square.png', width: 1200, height: 1200, alt: 'Jobs' },
 *          ],
 *        });
 *   4. Article-style content with author + section:
 *        export const metadata = generateMetadata({
 *          title: 'How to ace your resume',
 *          type: 'article',
 *          datePublished: '2026-01-15T09:00:00Z',
 *          author: 'Hire Adda Team',
 *          section: 'Career Advice',
 *          tags: ['resume', 'interview', 'career'],
 *        });
 */
export function generateMetadata({
  title,
  description,
  keywords,
  image,
  url,
  noindex,
  nofollow,
  datePublished,
  dateModified,
  type = 'website',
  author,
  section,
  tags,
  languages,
  pagination,
}: SEOProps): Metadata {
  const fullTitle = title;
  const desc = description || APP_CONFIG.description;
  const pageUrl = url || APP_CONFIG.url;

  // Resolve OG images: explicit > site-wide default (with per-page alt override).
  // Spread into a fresh mutable array — Next.js's `OGImage[]` type rejects readonly.
  const ogImages = image
    ? typeof image === 'string'
      ? [{ url: image, width: 1200, height: 630, alt: fullTitle }]
      : [...image]
    : [...withAltOverride(fullTitle)];

  // Twitter supports one image — first provided OR the site-wide wide hero.
  const twitterImage = image
    ? typeof image === 'string'
      ? image
      : image[0]?.url
    : TWITTER_IMAGE_URL;

  const isArticle = type === 'article';

  return {
    title: fullTitle,
    description: desc,
    keywords: keywords || ['jobs', 'careers', 'recruitment', 'hiring', 'hire adda'],
    ...(author ? { authors: [{ name: author }] } : {}),
    alternates: {
      canonical: pageUrl,
      ...(languages
        ? { languages }
        : {
            languages: {
              'en-IN': pageUrl,
              'x-default': pageUrl,
            },
          }),
    },
    openGraph: {
      title: fullTitle,
      description: desc,
      url: pageUrl,
      siteName: APP_CONFIG.name,
      locale: SEO_CONFIG.locale,
      type,
      images: ogImages,
      // `publishedTime` + `modifiedTime` emit as
      // `<meta property="article:published_time">` /
      // `article:modified_time` regardless of og:type. The Open Graph
      // spec technically scopes these to og:type=article, but every
      // major crawler (Facebook, LinkedIn, Twitter, Bing) accepts
      // them on og:type=website too and surfaces the dates in link
      // previews / SERP rich snippets. Always emit when supplied.
      ...(datePublished ? { publishedTime: datePublished } : {}),
      ...(dateModified ? { modifiedTime: dateModified } : {}),
      // The remaining article-* fields ARE strictly article-scoped
      // (Facebook ignores them on non-article og:types) so keep
      // those gated.
      ...(isArticle && author ? { authors: [author] } : {}),
      ...(isArticle && section ? { section } : {}),
      ...(isArticle && tags ? { tags } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [twitterImage],
      site: SEO_CONFIG.twitterHandle,
      creator: SEO_CONFIG.twitterHandle,
    },
    robots: {
      index: !noindex,
      follow: !nofollow,
      googleBot: {
        index: !noindex,
        follow: !nofollow,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

/**
 * Emits inline <link rel="prev"> / <link rel="next"> tags. React 19
 * auto-hoists these into <head>, so a page can render this component
 * anywhere in its JSX tree.
 *
 * Note: Google deprecated rel=prev/next as a search signal in 2019, but
 * Bing, Yandex, Baidu, screen-readers, and browser prefetch heuristics
 * still consume them. Emit when paginating long listings.
 */
export function PaginationLinks({ prev, next }: { prev?: string; next?: string }) {
  if (!prev && !next) return null;
  return (
    <>
      {prev ? <link rel="prev" href={prev} /> : null}
      {next ? <link rel="next" href={next} /> : null}
    </>
  );
}

// Re-export so callers that only need the site-wide wide hero URL (e.g. for
// structured-data primary image) can grab it without a second import.
export { OG_IMAGE_VARIANTS, TWITTER_IMAGE_URL };
