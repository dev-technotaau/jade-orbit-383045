'use client';

/**
 * X (formerly Twitter) Pixel — X Ads conversion + audience tracking.
 *
 *   - Bucket: marketing
 *   - Loader: static.ads-twitter.com/uwt.js
 *   - Beacon: t.co, analytics.twitter.com
 *
 * X uses two IDs: the pixel ID (universal website tag) and per-event IDs
 * created in the X Ads dashboard. The pixel ID below initialises the
 * library; conversion event IDs are passed at `track()` time by the
 * facade.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const TWITTER_PIXEL_ID = process.env.NEXT_PUBLIC_TWITTER_PIXEL_ID;

export default function TwitterPixel({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!TWITTER_PIXEL_ID || !marketing) return null;

  return (
    <Script id="twitter-pixel" strategy="afterInteractive" nonce={nonce}>
      {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){
        s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
        },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,
        u.src='https://static.ads-twitter.com/uwt.js',
        a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))
        }(window,document,'script');
        twq('config','${TWITTER_PIXEL_ID}');`}
    </Script>
  );
}
