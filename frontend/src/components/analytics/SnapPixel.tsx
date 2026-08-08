'use client';

/**
 * Snap Pixel — Snapchat Ads conversion + audience tracking.
 *
 * Gen-Z candidate demographic (16-24); useful for entry-level / internship
 * targeting and brand awareness.
 *
 *   - Bucket: marketing
 *   - Loader: sc-static.net/scevent.min.js
 *   - Beacon: tr.snapchat.com
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const SNAP_PIXEL_ID = process.env.NEXT_PUBLIC_SNAP_PIXEL_ID;

export default function SnapPixel({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!SNAP_PIXEL_ID || !marketing) return null;

  return (
    <Script id="snap-pixel" strategy="afterInteractive" nonce={nonce}>
      {`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
        {a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
        a.queue=[];var s='script';r=t.createElement(s);r.async=!0;
        r.src=n;var u=t.getElementsByTagName(s)[0];
        u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
        snaptr('init', '${SNAP_PIXEL_ID}');
        snaptr('track', 'PAGE_VIEW');`}
    </Script>
  );
}
