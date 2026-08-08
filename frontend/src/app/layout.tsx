// Trigger CI/CD rebuild: refresh GHCR credentials after VPS reboot
// Trigger CI/CD rebuild — re-run full pipeline after SiLinkedin → FaLinkedinIn fix
import FacebookPixel from '@/components/analytics/FacebookPixel';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import { GTMBody, GTMHead } from '@/components/analytics/GTM';
import MicrosoftClarity from '@/components/analytics/MicrosoftClarity';
import LinkedInInsight from '@/components/analytics/LinkedInInsight';
import Contentsquare from '@/components/analytics/Contentsquare';
import PinterestTag from '@/components/analytics/PinterestTag';
import RedditPixel from '@/components/analytics/RedditPixel';
import TwitterPixel from '@/components/analytics/TwitterPixel';
import TikTokPixel from '@/components/analytics/TikTokPixel';
import QuoraPixel from '@/components/analytics/QuoraPixel';
import BingUET from '@/components/analytics/BingUET';
import SnapPixel from '@/components/analytics/SnapPixel';
import PostHog from '@/components/analytics/PostHog';
import CloudflareAnalytics from '@/components/analytics/CloudflareAnalytics';
import AdobeAnalytics from '@/components/analytics/AdobeAnalytics';
import BackToTop from '@/components/common/BackToTop';
import WhatsAppChannelCta from '@/components/common/WhatsAppChannelCta';
import SmoothScroll from '@/components/common/SmoothScroll';
import CookieConsent from '@/components/common/CookieConsent';
import KeyboardShortcuts from '@/components/common/KeyboardShortcuts';
import OfflineBanner from '@/components/common/OfflineBanner';
import TopLoadingBar from '@/components/common/TopLoadingBar';
import WebVitals from '@/components/common/WebVitals';
import JsonLd from '@/components/seo/JsonLd';
import Providers from '@/contexts/providers';
import { organizationSchema, softwareApplicationSchema, websiteSchema } from '@/lib/json-ld';
import { OG_IMAGE_VARIANTS, TWITTER_IMAGE_URL } from '@/constants/og-images';
import { SEO_CONFIG, realOrUndef } from '@/constants/seo';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Viewport + theme-color — split out of `metadata` per Next.js 14+ convention.
 * Includes dark-mode theme-color via media query so the browser UI chrome
 * switches with the user's system preference.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover', // honours iOS notch (safe-area insets)
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: SEO_CONFIG.themeColor },
    { media: '(prefers-color-scheme: dark)', color: SEO_CONFIG.themeColorDark },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  alternates: {
    canonical: '/',
    languages: {
      'en-IN': '/',
      'x-default': '/',
      // Add 'hi-IN': '/hi' etc. when localised content ships.
    },
    types: {
      'application/rss+xml': '/feed.xml',
      'application/atom+xml': '/feed.atom',
      'application/feed+json': '/feed.json',
    },
  },
  title: {
    default: SEO_CONFIG.defaultTitle,
    template: SEO_CONFIG.titleTemplate,
  },
  description: SEO_CONFIG.description,
  applicationName: SEO_CONFIG.siteName,
  generator: 'Next.js',
  keywords: [
    'jobs',
    'job search',
    'job portal',
    'recruitment',
    'hiring',
    'career',
    'career portal',
    'employment',
    'talent acquisition',
    'India jobs',
    'hire adda',
    'hireadda',
    'find jobs',
    'post job',
    'resume',
    'job application',
  ],
  authors: [{ name: SEO_CONFIG.author, url: process.env.NEXT_PUBLIC_APP_URL }],
  creator: SEO_CONFIG.publisher,
  publisher: SEO_CONFIG.publisher,
  category: 'Business, Recruitment, Jobs',
  classification: 'Job Portal',

  openGraph: {
    type: 'website',
    locale: SEO_CONFIG.locale,
    alternateLocale: [],
    siteName: SEO_CONFIG.siteName,
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.description,
    url: '/',
    // Multi-variant — Facebook picks the first, WhatsApp/iMessage prefer
    // the square, Pinterest may prefer the tall. See src/constants/og-images.ts
    // for the full crawler-behaviour matrix.
    images: OG_IMAGE_VARIANTS,
    countryName: 'India',
    emails: ['support@hireadda.in'],
    determiner: '',
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.description,
    images: [TWITTER_IMAGE_URL],
    site: SEO_CONFIG.twitterHandle,
    creator: SEO_CONFIG.twitterHandle,
  },

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  formatDetection: {
    telephone: false,
    address: false,
    email: false,
    url: false,
  },

  appleWebApp: {
    capable: true,
    title: SEO_CONFIG.siteName,
    statusBarStyle: 'default',
    startupImage: ['/icon-512x512.png'],
  },

  referrer: 'strict-origin-when-cross-origin',

  // Verification — real values pass through, `REPLACE_WITH_REAL_ID`
  // placeholders are stripped via `realOrUndef()` so no garbage meta tags
  // ship to production. CI detects remaining placeholders in source.
  verification: (() => {
    const bing = realOrUndef(SEO_CONFIG.verification.bing);
    const pinterest = realOrUndef(SEO_CONFIG.verification.pinterest);
    const facebook = realOrUndef(SEO_CONFIG.verification.facebook);
    const baidu = realOrUndef(SEO_CONFIG.verification.baidu);
    const norton = realOrUndef(SEO_CONFIG.verification.norton);
    const naver = realOrUndef(SEO_CONFIG.verification.naver);
    const google = realOrUndef(SEO_CONFIG.verification.google);
    const yandex = realOrUndef(SEO_CONFIG.verification.yandex);

    const otherEntries: Record<string, string> = {};
    if (bing) otherEntries['msvalidate.01'] = bing;
    if (pinterest) otherEntries['p:domain_verify'] = pinterest;
    if (facebook) otherEntries['facebook-domain-verification'] = facebook;
    if (baidu) otherEntries['baidu-site-verification'] = baidu;
    if (norton) otherEntries['norton-safeweb-site-verification'] = norton;
    if (naver) otherEntries['naver-site-verification'] = naver;
    return {
      ...(google ? { google } : {}),
      ...(yandex ? { yandex } : {}),
      ...(Object.keys(otherEntries).length > 0 ? { other: otherEntries } : {}),
    };
  })(),

  // Facebook App ID — required for Insights tracking + richer FB cards.
  // Emits only when a real value is set (placeholder is stripped).
  ...(realOrUndef(SEO_CONFIG.fbAppId)
    ? { other: { 'fb:app_id': realOrUndef(SEO_CONFIG.fbAppId)! } }
    : {}),

  // App Links — lets Facebook / LinkedIn deep-link into native apps
  // when installed. Emits only when iOS App ID is a real value.
  ...(realOrUndef(SEO_CONFIG.apps.iosAppId) || SEO_CONFIG.apps.androidPackage
    ? {
        appLinks: {
          ...(realOrUndef(SEO_CONFIG.apps.iosAppId)
            ? {
                ios: {
                  app_store_id: realOrUndef(SEO_CONFIG.apps.iosAppId)!,
                  app_name: SEO_CONFIG.apps.iosAppName,
                  url: `${SEO_CONFIG.apps.urlScheme}://`,
                },
              }
            : {}),
          ...(SEO_CONFIG.apps.androidPackage
            ? {
                android: {
                  package: SEO_CONFIG.apps.androidPackage,
                  app_name: SEO_CONFIG.apps.androidAppName,
                  url: `${SEO_CONFIG.apps.urlScheme}://`,
                },
              }
            : {}),
          web: { url: '/', should_fallback: true },
        },
      }
    : {}),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') || '';

  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Frame-busting fallback for browsers that don't support CSP frame-ancestors */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `if(window.top!==window.self){window.top.location=window.self.location}`,
          }}
        />

        {/* Chrome Speculation Rules — anticipatory navigation. Browser
            prerenders / prefetches likely-next URLs so they paint
            instantly when the user actually clicks. We aggressively
            speculate on public navigation links + conservatively
            prefetch the dashboard entry points. The "moderate" eagerness
            reduces wasted prerenders on accidental hovers. */}
        <script
          type="speculationrules"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                {
                  source: 'document',
                  where: {
                    and: [
                      { href_matches: '/jobs*' },
                      { not: { href_matches: '/api/*' } },
                      { not: { href_matches: '/auth/*' } },
                      { not: { selector_matches: '[rel~=nofollow]' } },
                    ],
                  },
                  eagerness: 'moderate',
                },
                {
                  source: 'document',
                  where: {
                    and: [{ href_matches: '/companies*' }, { not: { href_matches: '/api/*' } }],
                  },
                  eagerness: 'moderate',
                },
              ],
              prefetch: [
                {
                  source: 'document',
                  where: {
                    and: [
                      {
                        href_matches: ['/about', '/contact', '/help*', '/pricing*', '/vendors*'],
                      },
                    ],
                  },
                  eagerness: 'conservative',
                },
              ],
            }),
          }}
        />

        <GTMHead nonce={nonce} />

        {/* ── Favicons ── */}
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
        <link rel="icon" type="image/svg+xml" href="/icon0.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        {/* Safari pinned-tab mask icon (coloured by Safari via `color`) */}
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color={SEO_CONFIG.themeColor} />

        {/* ── Windows / Edge tile ── */}
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content={SEO_CONFIG.themeColor} />
        <meta name="msapplication-navbutton-color" content={SEO_CONFIG.themeColor} />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* ── Apple / iOS ── */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={SEO_CONFIG.siteName} />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* ── iOS PWA splash screens —
              Apple's PWA install pulls a launch image matching the
              device's exact screen resolution. We point every supported
              model at the 512×512 logo so iOS letterboxes correctly. */}
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        {/* iPad common resolutions */}
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icon-512x512.png"
          media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        {/* Multi-resolution apple-touch-icon — iOS picks the closest match. */}
        <link rel="apple-touch-icon" sizes="120x120" href="/icon-128x128.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />

        {/* ── Geo tags (local + "local pack" SEO for India) ── */}
        <meta name="geo.region" content={SEO_CONFIG.region} />
        <meta name="geo.placename" content={SEO_CONFIG.placeName} />
        <meta
          name="geo.position"
          content={`${SEO_CONFIG.coordinates.lat};${SEO_CONFIG.coordinates.lon}`}
        />
        <meta
          name="ICBM"
          content={`${SEO_CONFIG.coordinates.lat}, ${SEO_CONFIG.coordinates.lon}`}
        />
        {/* OpenGraph local-business location hints — used by Facebook,
            LinkedIn, and some AI ranking systems for geo-attribution. */}
        <meta property="og:country-name" content="India" />
        <meta property="og:region" content="IN" />
        <meta property="og:locale" content={SEO_CONFIG.locale} />
        {/* Twitter — supplementary `summary_large_image` data slots. */}
        <meta name="twitter:label1" content="Coverage" />
        <meta name="twitter:data1" content="All India" />
        <meta name="twitter:label2" content="Industry" />
        <meta name="twitter:data2" content="Recruitment / Job Portal" />

        {/* ── Language + distribution ── */}
        <meta httpEquiv="content-language" content={SEO_CONFIG.lang} />
        <meta name="language" content="English" />
        <meta name="distribution" content="global" />
        <meta name="rating" content="general" />
        <meta name="coverage" content="Worldwide" />
        <meta name="revisit-after" content="1 day" />
        <meta name="target" content="all" />

        {/* ── Dublin Core (deep-enterprise metadata) ── */}
        <meta name="DC.title" content={SEO_CONFIG.defaultTitle} />
        <meta name="DC.description" content={SEO_CONFIG.description} />
        <meta name="DC.publisher" content={SEO_CONFIG.publisher} />
        <meta name="DC.creator" content={SEO_CONFIG.author} />
        <meta name="DC.rights" content={`© ${SEO_CONFIG.copyrightYear} ${SEO_CONFIG.siteName}`} />
        <meta name="DC.language" content={SEO_CONFIG.lang} />
        <meta name="DC.type" content="InteractiveResource" />
        <meta name="DC.format" content="text/html" />
        <meta name="DC.coverage" content={SEO_CONFIG.placeName} />

        {/* ── Copyright / brand-attribution ── */}
        <meta name="copyright" content={`© ${SEO_CONFIG.copyrightYear} ${SEO_CONFIG.siteName}`} />
        <meta name="author" content={SEO_CONFIG.author} />
        <meta name="designer" content={SEO_CONFIG.author} />

        {/* ── Pinterest Rich Pins (article/product) ── */}
        <meta property="article:publisher" content={`${process.env.NEXT_PUBLIC_APP_URL}/about`} />

        {/* ── Site-wide date signals ──
            Sites that don't use the per-page Open Graph article:*
            namespace (the homepage uses og:type=website, most other
            pages too) still want explicit freshness signals for
            crawlers. We emit three flavours covering every common
            ingestion target:

              - `last-modified` — generic crawler standard (recognised
                by Bing, Yandex, Baidu, archive bots).
              - `date` + `DC.date.modified` — Dublin Core conventions
                used by academic indexers and enterprise audit tooling.
              - `og:updated_time` — Facebook's "last reshare bump"
                signal; the per-page `article:published_time` /
                `article:modified_time` tags handle granular dates
                via SEO.tsx where supplied.

            Source-of-truth is `SEO_CONFIG.siteLastModified`, bumped
            on each deploy via the `NEXT_PUBLIC_SITE_LAST_MODIFIED`
            build-arg so the field stays accurate without code edits. */}
        <meta name="date" content={SEO_CONFIG.siteLaunchDate} />
        <meta name="last-modified" content={SEO_CONFIG.siteLastModified} />
        <meta name="DC.date.modified" content={SEO_CONFIG.siteLastModified} />
        <meta property="og:updated_time" content={SEO_CONFIG.siteLastModified} />

        {/* ── Sitewide JSON-LD ──
            Organization + WebSite SearchAction + WebApplication.
            Emitted on every page so Google can aggregate across the site when
            building the knowledge panel, sitelinks search box, and software
            carousel. More specific schemas are injected per-page. */}
        <JsonLd id="jsonld-organization" data={organizationSchema()} />
        <JsonLd id="jsonld-website" data={websiteSchema()} />
        <JsonLd id="jsonld-software" data={softwareApplicationSchema()} />

        {/* ── Resource hints — performance SEO (LCP/TTFB) ── */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://assets.hireadda.in" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firebaseinstallations.googleapis.com" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://fcmregistrations.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://fcm.googleapis.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        {/* Analytics provider dns-prefetch hints.
            Rendered unconditionally so Wappalyzer (and similar
            tech-detection crawlers) can identify the stack on a
            first-paint scan without needing to accept the cookie
            banner — the actual analytics scripts stay strictly
            consent-gated and only load after the user opts in.
            Each prefetch is one cheap DNS round-trip on page
            load and zero TLS / data exchange. */}
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        <link rel="dns-prefetch" href="https://snap.licdn.com" />
        <link rel="dns-prefetch" href="https://t.contentsquare.net" />
        <link rel="dns-prefetch" href="https://s.pinimg.com" />
        <link rel="dns-prefetch" href="https://www.redditstatic.com" />
        <link rel="dns-prefetch" href="https://static.ads-twitter.com" />
        <link rel="dns-prefetch" href="https://analytics.tiktok.com" />
        <link rel="dns-prefetch" href="https://a.quora.com" />
        <link rel="dns-prefetch" href="https://bat.bing.com" />
        <link rel="dns-prefetch" href="https://sc-static.net" />
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
        <link rel="dns-prefetch" href="https://static.cloudflareinsights.com" />
        <link rel="dns-prefetch" href="https://assets.adobedtm.com" />

        {/* ── Alternate resources (AEO + discovery) ── */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Hire Adda — Latest Jobs (RSS)"
          href="/feed.xml"
        />
        <link
          rel="alternate"
          type="application/atom+xml"
          title="Hire Adda — Latest Jobs (Atom)"
          href="/feed.atom"
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title="Hire Adda — Latest Jobs (JSON Feed)"
          href="/feed.json"
        />
        <link
          rel="alternate"
          hrefLang="en-IN"
          href={process.env.NEXT_PUBLIC_APP_URL ?? 'https://hireadda.in'}
        />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={process.env.NEXT_PUBLIC_APP_URL ?? 'https://hireadda.in'}
        />

        {/* ── Discovery hints for crawlers + browsers + password managers ── */}
        <link rel="sitemap" type="application/xml" href="/sitemap-index.xml" />
        {/* OpenSearch — "add hireadda.in as browser search engine" support */}
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title="Hire Adda"
          href="/opensearch.xml"
        />
        <link rel="help" href="/help" />
        <link rel="author" href="/humans.txt" />
        <link rel="license" href="/terms" />
        <link rel="privacy-policy" href="/privacy" />
        <link rel="terms-of-service" href="/terms" />

        {/* ── Cache control hint for CDNs ── */}
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      </head>
      {/* `min-h-dvh`, not `min-h-screen`. `100vh` on mobile is the LARGE
          viewport (browser toolbar hidden), so while the toolbar is showing
          the layout is taller than what is actually visible. That mismatch is
          what made the sticky header appear clipped at the top mid-scroll and
          pushed the bottom-anchored WhatsApp tab below the fold. `dvh` tracks
          the live viewport, so both edges stay where they should. Identical to
          `100vh` on desktop. */}
      <body className="flex min-h-dvh flex-col antialiased">
        <GTMBody />
        {/* Skip-to-content for accessibility */}
        <a
          href="#main-content"
          className="focus:bg-primary sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[999] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <TopLoadingBar />
        <OfflineBanner />
        <Providers>
          <SmoothScroll>
            {/* This is the skip-link target, but it's NOT the <main>
                landmark. Every page renders inside a layout component
                (PublicLayout / AuthLayout / DashboardLayout) — or its
                own page-shell — that already provides a single proper
                <main> landmark. Making this outer wrapper a <main> too
                would cause nested <main> elements (invalid HTML +
                duplicate-landmark a11y violation). The skip link
                targets the id, not the element type, so accessibility
                of "Skip to main content" is preserved. */}
            {/* ⚠️ DO NOT add an `app/loading.tsx` next to this file.
                A ROOT loading UI makes Next wrap this `{children}` slot in
                <Suspense>. Public pages suspend during SSR, so React streams
                the fallback inline and parks the real page in
                `<div hidden id="S:0">`, revealed only by an inline $RC()
                script. Googlebot runs that script; Bing does not — it indexed
                nothing for months while every URL served ~38 words of
                "Loading...". Removed 2026-08-06.
                Route-transition feedback is <TopLoadingBar /> above; the five
                private trees (admin/auth/candidate/employer/super-admin) keep
                their own loading.tsx, which is fine — they are noindex. */}
            <div id="main-content" className="flex flex-1 flex-col">
              {children}
            </div>
          </SmoothScroll>
          {/* Command palette (⌘K) lives INSIDE Providers because it now
              consumes React Query (sidebar prefs + entitlements). It renders a
              fixed overlay, so its position in the tree is otherwise irrelevant. */}
          <KeyboardShortcuts />
        </Providers>
        <WebVitals />
        {/* ── Analytics providers ────────────────────────────────────
            All scripts are CSP-nonce'd, lazy-loaded via Next.js Script
            `afterInteractive`, and gated by the `analytics` /
            `marketing` consent buckets in ha_cookie_consent. Each
            component is a no-op until its NEXT_PUBLIC_* ID is set —
            staging / preview environments can simply not provide IDs
            and ship zero analytics traffic.

            Bucket: analytics
              GoogleAnalytics (GA4) · MicrosoftClarity · Contentsquare
              (formerly Hotjar) · PostHog · CloudflareAnalytics ·
              AdobeAnalytics
            Bucket: marketing
              FacebookPixel · LinkedInInsight · PinterestTag ·
              RedditPixel · TwitterPixel · TikTokPixel · QuoraPixel ·
              BingUET · SnapPixel */}
        <GoogleAnalytics nonce={nonce} />
        <FacebookPixel nonce={nonce} />
        <MicrosoftClarity nonce={nonce} />
        <LinkedInInsight nonce={nonce} />
        <Contentsquare nonce={nonce} />
        <PinterestTag nonce={nonce} />
        <RedditPixel nonce={nonce} />
        <TwitterPixel nonce={nonce} />
        <TikTokPixel nonce={nonce} />
        <QuoraPixel nonce={nonce} />
        <BingUET nonce={nonce} />
        <SnapPixel nonce={nonce} />
        <PostHog nonce={nonce} />
        <CloudflareAnalytics nonce={nonce} />
        <AdobeAnalytics nonce={nonce} />
        <BackToTop />
        {/* Mounted in the ROOT layout on purpose: it keeps its collapsed state
            across client navigation, so the 10s intro plays once per page load
            rather than on every route change. It scopes itself to public pages
            internally (see HIDDEN_PREFIXES). */}
        <WhatsAppChannelCta />
        <CookieConsent />
      </body>
    </html>
  );
}
