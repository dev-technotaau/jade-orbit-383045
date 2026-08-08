'use client';

/**
 * Microsoft Bing UET (Universal Event Tracking) — Microsoft Ads conversion
 * tracking on Bing / Edge / Yahoo / DuckDuckGo (search syndication network).
 *
 * Bing's share of the Indian search market is small but the UET tag is also
 * required to run Microsoft Audience Network display ads, so worth having.
 *
 *   - Bucket: marketing
 *   - Loader: bat.bing.com/bat.js
 *   - Beacon: bat.bing.com (image-pixel fallback)
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const BING_UET_TAG_ID = process.env.NEXT_PUBLIC_BING_UET_TAG_ID;

export default function BingUET({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!BING_UET_TAG_ID || !marketing) return null;

  return (
    <Script id="bing-uet" strategy="afterInteractive" nonce={nonce}>
      {`(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${BING_UET_TAG_ID}",enableAutoSpaTracking:true};
        o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");`}
    </Script>
  );
}
