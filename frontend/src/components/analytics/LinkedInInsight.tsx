'use client';

/**
 * LinkedIn Insight Tag — partner-network conversion tracking + retargeting.
 *
 * Critical for B2B recruiter audience targeting (matched audiences) and
 * "people who applied to a job" remarketing. Free; appears under the
 * partner ID on `linkedin.com/campaignmanager`.
 *
 *   - Bucket: marketing
 *   - Loader: snap.licdn.com/li.lms-analytics/insight.min.js
 *   - Beacon: px.ads.linkedin.com (image-pixel fallback, also in CSP)
 *
 * The two globals (`_linkedin_partner_id`, `_linkedin_data_partner_ids`)
 * are required by LinkedIn's loader and must exist BEFORE the script tag.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const LINKEDIN_PARTNER_ID = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;

export default function LinkedInInsight({ nonce }: { nonce?: string }) {
  const { marketing } = useConsent();
  if (!LINKEDIN_PARTNER_ID || !marketing) return null;

  return (
    <>
      <Script id="linkedin-insight" strategy="afterInteractive" nonce={nonce}>
        {`_linkedin_partner_id = "${LINKEDIN_PARTNER_ID}";
          window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
          window._linkedin_data_partner_ids.push(_linkedin_partner_id);
          (function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
          var s = document.getElementsByTagName("script")[0];
          var b = document.createElement("script"); b.type="text/javascript";b.async=true;
          b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";
          s.parentNode.insertBefore(b,s);})(window.lintrk);`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://px.ads.linkedin.com/collect/?pid=${LINKEDIN_PARTNER_ID}&fmt=gif`}
        />
      </noscript>
    </>
  );
}
