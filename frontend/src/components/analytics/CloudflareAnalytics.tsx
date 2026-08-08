'use client';

/**
 * Cloudflare Web Analytics — privacy-friendly, zero-cookie page-view tracking.
 *
 * Previously we relied on the automatic edge-injected beacon (enabled in
 * the Cloudflare dashboard) but the user noticed it wasn't appearing in
 * Wappalyzer / Network panel. The auto-beacon only injects when Cloudflare
 * is proxying the request AND the "Automatic Setup" toggle is on; if the
 * site is behind a non-Cloudflare layer (e.g. canary deploys, A/B routing)
 * the beacon never lands. Embedding the manual beacon explicitly here
 * guarantees it ships on every response.
 *
 *   - Bucket: analytics
 *   - Loader: static.cloudflareinsights.com/beacon.min.js
 *   - Beacon: cloudflareinsights.com
 *
 * No cookies, no fingerprinting, no PII — RUM-grade Core Web Vitals +
 * top-pages telemetry only.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const CF_BEACON_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

export default function CloudflareAnalytics({ nonce }: { nonce?: string }) {
  const { analytics } = useConsent();
  if (!CF_BEACON_TOKEN || !analytics) return null;

  return (
    <Script
      id="cloudflare-analytics"
      strategy="afterInteractive"
      nonce={nonce}
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={`{"token": "${CF_BEACON_TOKEN}", "spa": true}`}
      defer
    />
  );
}
