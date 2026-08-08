'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import Cookies from 'js-cookie';
import { isNoTrackPath } from '@/lib/analytics/no-track-path';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function GoogleAnalytics({ nonce }: { nonce?: string }) {
  const [consent, setConsent] = useState(false);
  const pathname = usePathname();

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

  if (!GA_ID || !consent || isNoTrackPath(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
        {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${GA_ID}', {
                        page_path: window.location.pathname,
                    });
                `}
      </Script>
    </>
  );
}
