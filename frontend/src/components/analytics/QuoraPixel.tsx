'use client';

/**
 * Quora Pixel — Quora Ads conversion + remarketing tracking.
 *
 * Job seekers actively research roles, companies and salaries on Quora;
 * the Quora audience is a strong top-of-funnel signal for Hire Adda.
 *
 *   - Bucket: marketing
 *   - Loader: a.quora.com/qevents.js
 *   - Beacon: q.quora.com
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const QUORA_PIXEL_ID = process.env.NEXT_PUBLIC_QUORA_PIXEL_ID;

export default function QuoraPixel({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!QUORA_PIXEL_ID || !marketing) return null;

  return (
    <>
      <Script id="quora-pixel" strategy="afterInteractive" nonce={nonce}>
        {`!function(q,e,v,n,t,s){if(q.qp) return; n=q.qp=function(){n.qp?n.qp.apply(n,arguments):n.queue.push(arguments);};n.queue=[];
          t=document.createElement(e);t.async=!0;t.src=v;
          s=document.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window, 'script', 'https://a.quora.com/qevents.js');
          qp('init', '${QUORA_PIXEL_ID}');
          qp('track', 'ViewContent');`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://q.quora.com/_/ad/${QUORA_PIXEL_ID}/pixel?tag=ViewContent&noscript=1`}
        />
      </noscript>
    </>
  );
}
