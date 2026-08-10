import BackToTop from '@/components/common/BackToTop';
import SmoothScroll from '@/components/common/SmoothScroll';
import OfflineBanner from '@/components/common/OfflineBanner';
import TopLoadingBar from '@/components/common/TopLoadingBar';
import Providers from '@/contexts/providers';
import { APP_CONFIG } from '@/constants/config';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';

/**
 * Root layout.
 *
 * The host platform's version was 604 lines of public-SEO surface: Open Graph
 * and Twitter cards, eight search-engine verification tags, Dublin Core, geo
 * coordinates, iOS/Android app-links, RSS/Atom/JSON feeds, OpenSearch, Chrome
 * speculation rules for /jobs and /companies, ~30 dns-prefetch hints for ad and
 * analytics networks, and three sitewide JSON-LD graphs.
 *
 * None of it applies here. This module is a single-operator tool behind one app
 * password — every page requires the unlock cookie, so no crawler ever reaches
 * one. What remains is the app shell plus `noindex, nofollow`, and the brand is
 * driven by NEXT_PUBLIC_BRAND_NAME so no client ships another client's name.
 */

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover', // honours iOS notch (safe-area insets)
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: APP_CONFIG.name,
    template: `%s | ${APP_CONFIG.name}`,
  },
  description: 'WhatsApp Business inbox, templates and campaigns.',
  applicationName: APP_CONFIG.name,

  // Nothing here is public. Even though the middleware already redirects locked
  // visitors to /unlock, state it explicitly so a misconfigured deploy or a
  // preview URL can't end up indexed.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },

  formatDetection: {
    telephone: false,
    address: false,
    email: false,
    url: false,
  },

  appleWebApp: {
    capable: true,
    title: APP_CONFIG.name,
    statusBarStyle: 'default',
  },

  referrer: 'strict-origin-when-cross-origin',
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

        {/* ── Favicons ── */}
        <link rel="icon" type="image/svg+xml" href="/icon0.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />

        {/* ── Installable PWA (see app/manifest.ts) ── */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={APP_CONFIG.name} />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      {/* `min-h-dvh`, not `min-h-screen`. `100vh` on mobile is the LARGE
          viewport (browser toolbar hidden), so while the toolbar is showing
          the layout is taller than what is actually visible. `dvh` tracks the
          live viewport. Identical to `100vh` on desktop. */}
      <body className="flex min-h-dvh flex-col antialiased">
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
            {/* This is the skip-link target, but it's NOT the <main> landmark.
                Pages render inside DashboardLayout (or their own shell), which
                already provides a single proper <main>. Making this wrapper a
                <main> too would nest landmarks — invalid HTML and a duplicate-
                landmark a11y violation. The skip link targets the id, not the
                element type, so "Skip to main content" still works. */}
            {/* ⚠️ DO NOT add an `app/loading.tsx` next to this file.
                A ROOT loading UI makes Next wrap this `{children}` slot in
                <Suspense>. Suspending pages then stream the fallback inline and
                park the real page in `<div hidden id="S:0">`, revealed only by
                an inline $RC() script. That silently hid the real content from
                any client that doesn't run scripts. Route-transition feedback
                is <TopLoadingBar /> above. */}
            <div id="main-content" className="flex flex-1 flex-col">
              {children}
            </div>
          </SmoothScroll>
        </Providers>
        <BackToTop />
      </body>
    </html>
  );
}
