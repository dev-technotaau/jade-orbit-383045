'use client';

/**
 * Reddit Pixel — Reddit Ads conversion + audience-building tracking.
 *
 * Reddit's tech/jobs/finance communities are a strong signal source for
 * Hire Adda. Free; advertiser ID is obtained from ads.reddit.com.
 *
 *   - Bucket: marketing
 *   - Loader: www.redditstatic.com/ads/pixel.js
 *   - Beacon: events.redditmedia.com
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const REDDIT_PIXEL_ID = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;

export default function RedditPixel({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!REDDIT_PIXEL_ID || !marketing) return null;

  return (
    <Script id="reddit-pixel" strategy="afterInteractive" nonce={nonce}>
      {`!function(w,d){if(!w.rdt){var p=w.rdt=function(){
        p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};
        p.callQueue=[];var t=d.createElement("script");t.src=
        "https://www.redditstatic.com/ads/pixel.js",t.async=!0;
        var s=d.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(t,s)}}(window,document);
        rdt('init', '${REDDIT_PIXEL_ID}');
        rdt('track', 'PageVisit');`}
    </Script>
  );
}
