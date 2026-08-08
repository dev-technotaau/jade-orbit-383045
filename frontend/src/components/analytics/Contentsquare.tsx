'use client';

/**
 * Contentsquare — replaces Hotjar after the October 2023 acquisition.
 *
 * Contentsquare migrated the Hotjar product onto its unified UXA tracker
 * platform. The legacy `static.hotjar.com/c/hotjar-<id>.js` loader and
 * the `window.hj()` global are no longer issued to migrated accounts —
 * instead you get a single script URL of the form
 *
 *   https://t.contentsquare.net/uxa/<projectKey>.js
 *
 * where `<projectKey>` is a 13-character hex string assigned to the
 * Contentsquare workspace. Once loaded the SDK exposes:
 *
 *   - `window._uxa`  — command queue (array). All custom tracking goes
 *     through `_uxa.push([command, ...args])`. The queue accepts commands
 *     before the SDK finishes loading; commands replay once it's ready.
 *
 *   - `window.CS_CONF` — optional pre-load config object (e.g. to disable
 *     auto-page-view). We don't set it — the defaults match our needs.
 *
 * Bucket: analytics
 *
 *   CSP additions: `t.contentsquare.net` (loader), `*.contentsquare.net`
 *   (telemetry beacons). The unified track facade in lib/analytics/track.ts
 *   pushes `trackPageview` / `trackPageEvent` / `setCustomVariable` onto
 *   `_uxa` so SPA navigations and identify calls hit Contentsquare alongside
 *   every other provider.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const CONTENTSQUARE_ID = process.env.NEXT_PUBLIC_CONTENTSQUARE_ID;

export default function Contentsquare({ nonce }: { nonce?: string }) {
  const { analytics } = useConsent();
  if (!CONTENTSQUARE_ID || !analytics) return null;

  return (
    <>
      {/* Initialise the command queue BEFORE the loader hits the network
          so any track() / identify() calls fired during hydration land
          in the queue and replay once the SDK is ready. */}
      <Script id="contentsquare-bootstrap" strategy="beforeInteractive" nonce={nonce}>
        {`window._uxa = window._uxa || [];`}
      </Script>
      <Script
        id="contentsquare-uxa"
        strategy="afterInteractive"
        src={`https://t.contentsquare.net/uxa/${CONTENTSQUARE_ID}.js`}
        nonce={nonce}
        async
      />
    </>
  );
}
