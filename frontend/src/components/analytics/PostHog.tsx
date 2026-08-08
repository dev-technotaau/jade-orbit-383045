'use client';

/**
 * PostHog — open-source product analytics + session replay + feature flags.
 *
 * Free tier: 1M events/month + 5k recordings. Self-hostable if we ever
 * need to. Complements GA4 (which is great for marketing) with deep
 * product event funnels + cohorts + replays — useful for the recruiter
 * console UX work we're doing right now.
 *
 *   - Bucket: analytics
 *   - Loader: <host>/static/array.js (host defaults to us.i.posthog.com
 *     but supports EU + self-hosted via NEXT_PUBLIC_POSTHOG_HOST)
 *   - Beacon: same host (`/e/` capture endpoint)
 *
 * We initialise PostHog in `manual` capture mode and let the unified
 * `analytics.track()` facade drive captures — keeps event names
 * consistent with every other provider.
 */

import Script from 'next/script';
import { useConsent } from '@/lib/analytics/consent';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export default function PostHog({ nonce }: { nonce?: string }) {
  const { analytics } = useConsent();
  if (!POSTHOG_KEY || !analytics) return null;

  return (
    <Script id="posthog" strategy="afterInteractive" nonce={nonce}>
      {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loaded".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init('${POSTHOG_KEY}', {
          api_host: '${POSTHOG_HOST}',
          person_profiles: 'identified_only',
          capture_pageview: false,
          capture_pageleave: true,
          autocapture: true,
          session_recording: { maskAllInputs: true }
        });`}
    </Script>
  );
}
