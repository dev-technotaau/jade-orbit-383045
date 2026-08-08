'use client';

/**
 * Microsoft Clarity — free session-recording + heatmaps + scroll maps.
 *
 *   - Bucket: analytics (not marketing — Clarity doesn't ship audience data
 *     back to ad networks; it's a pure UX-observability product).
 *   - Limits: free, ~1M sessions/project/month.
 *   - Loader endpoint: https://www.clarity.ms/tag/<projectId>
 *   - Dashboard: https://clarity.microsoft.com
 *
 * CSP: clarity.ms (script), c.bing.com (telemetry), www.clarity.ms.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

export default function MicrosoftClarity({ nonce }: { nonce?: string }) {
  const { analytics } = useConsent();
  if (!CLARITY_ID || !analytics) return null;

  return (
    <Script id="microsoft-clarity" strategy="afterInteractive" nonce={nonce}>
      {`(function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_ID}");`}
    </Script>
  );
}
