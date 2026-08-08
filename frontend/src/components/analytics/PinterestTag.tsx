'use client';

/**
 * Pinterest Tag — Pinterest Ads conversion + remarketing tracking.
 *
 * For Hire Adda the candidate-side has decent overlap with Pinterest's
 * "career inspiration / resume design" audience. Free.
 *
 *   - Bucket: marketing
 *   - Loader: s.pinimg.com/ct/core.js
 *   - Beacon: ct.pinterest.com
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const PINTEREST_TAG_ID = process.env.NEXT_PUBLIC_PINTEREST_TAG_ID;

export default function PinterestTag({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!PINTEREST_TAG_ID || !marketing) return null;

  return (
    <>
      <Script id="pinterest-tag" strategy="afterInteractive" nonce={nonce}>
        {`!function(e){if(!window.pintrk){window.pintrk = function () {
          window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
          n=window.pintrk;n.queue=[],n.version="3.0";var
          t=document.createElement("script");t.async=!0,t.src=e;var
          r=document.getElementsByTagName("script")[0];
          r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
          pintrk('load', '${PINTEREST_TAG_ID}', { em: '<user_email_address>' });
          pintrk('page');`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://ct.pinterest.com/v3/?event=init&tid=${PINTEREST_TAG_ID}&noscript=1`}
        />
      </noscript>
    </>
  );
}
