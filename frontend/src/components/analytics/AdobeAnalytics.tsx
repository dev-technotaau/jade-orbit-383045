'use client';

/**
 * Adobe Analytics / Adobe Experience Platform Launch — enterprise tag
 * management with deep marketing-cloud integration (Audience Manager,
 * Target, AEP RTCDP).
 *
 * Paid (not part of the free-tier set). The scaffold is included so that
 * when the business signs onto Adobe's stack we just drop the Launch
 * library URL into NEXT_PUBLIC_ADOBE_LAUNCH_URL and the unified
 * `analytics.track()` facade picks up `_satellite.track(...)` for free —
 * no follow-up wiring required.
 *
 *   - Bucket: analytics
 *   - Loader: assets.adobedtm.com/<container>/<env>/launch-<hash>.min.js
 *     (full URL provided per environment in Launch's dashboard)
 *   - Beacon: omtrdc.net + adobedc.demdex.net + aam (audience manager)
 *
 * `_satellite` is the global Launch exposes; we declare it in
 * lib/analytics/types.ts for the facade.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const ADOBE_LAUNCH_URL = process.env.NEXT_PUBLIC_ADOBE_LAUNCH_URL;

export default function AdobeAnalytics({ nonce }: { nonce?: string }) {
  const { analytics } = useConsent();
  if (!ADOBE_LAUNCH_URL || !analytics) return null;

  return (
    <>
      {/* Bootstrap the Launch digitalData layer before the loader fires
          so any tags that rely on the global at evaluation time see the
          shape they expect (avoid "Cannot read properties of undefined"
          on first paint). */}
      <Script id="adobe-launch-bootstrap" strategy="beforeInteractive" nonce={nonce}>
        {`window.digitalData = window.digitalData || { page: {}, user: {} };`}
      </Script>
      <Script
        id="adobe-launch"
        strategy="afterInteractive"
        src={ADOBE_LAUNCH_URL}
        nonce={nonce}
        async
      />
      <Script id="adobe-launch-pagebottom" strategy="lazyOnload" nonce={nonce}>
        {`if (window._satellite && window._satellite.pageBottom) { window._satellite.pageBottom(); }`}
      </Script>
    </>
  );
}
