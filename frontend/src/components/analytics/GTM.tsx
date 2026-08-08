'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import Cookies from 'js-cookie';
import { isNoTrackPath } from '@/lib/analytics/no-track-path';

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

function useAnalyticsConsent() {
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const raw = Cookies.get('ha_cookie_consent');
    if (raw) {
      try {
        const prefs = JSON.parse(raw);
        queueMicrotask(() => setConsent(!!prefs.analytics));
      } catch {
        /* ignore */
      }
    }
  }, []);

  return consent;
}

export function GTMHead({ nonce }: { nonce?: string }) {
  const consent = useAnalyticsConsent();
  const pathname = usePathname();

  if (!GTM_ID || !consent || isNoTrackPath(pathname)) return null;

  return (
    <Script id="gtm-head" strategy="afterInteractive" nonce={nonce}>
      {`
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${GTM_ID}');
            `}
    </Script>
  );
}

export function GTMBody() {
  const consent = useAnalyticsConsent();
  const pathname = usePathname();

  if (!GTM_ID || !consent || isNoTrackPath(pathname)) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  );
}
