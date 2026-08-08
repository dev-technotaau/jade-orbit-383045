'use client';

/**
 * Single source of truth for analytics / marketing consent state.
 *
 * Every analytics provider component (GA, Clarity, Hotjar, LinkedIn, etc.)
 * reads `ha_cookie_consent` from cookies and gates its script-injection on
 * the matching bucket:
 *
 *   - `analytics` bucket  → product analytics, heatmaps, RUM, session recording
 *     (GA4, GTM, Microsoft Clarity, Hotjar, PostHog, Cloudflare Insights,
 *      Adobe Analytics)
 *
 *   - `marketing` bucket  → ad pixels + retargeting (Facebook Pixel,
 *     LinkedIn Insight Tag, Pinterest Tag, Reddit Pixel, X/Twitter Pixel,
 *     TikTok Pixel, Quora Pixel, Bing UET, Snap Pixel)
 *
 * Centralising the read avoids drift — every provider previously duplicated
 * the same cookie parse + `queueMicrotask(setState)` dance. Now they all
 * subscribe to the same hook and react in lock-step to consent changes.
 *
 * Also honours `navigator.doNotTrack === '1'` as a hard global opt-out,
 * regardless of the cookie state. Some jurisdictions (and many enterprise
 * audit programs) require DNT to be honoured.
 */

import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

export interface ConsentPrefs {
  /** Set on first paint, then updated when the cookie banner mutates. */
  necessary: boolean;
  /** Product analytics + heatmaps + RUM */
  analytics: boolean;
  /** Ad pixels + retargeting */
  marketing: boolean;
}

const CONSENT_COOKIE = 'ha_cookie_consent';

/**
 * Read the consent cookie synchronously. Returns all-false defaults when no
 * cookie has been set yet (visitor hasn't seen the banner) so providers stay
 * blocked until explicit opt-in.
 */
export function readConsent(): ConsentPrefs {
  if (typeof window === 'undefined') {
    return { necessary: true, analytics: false, marketing: false };
  }
  const raw = Cookies.get(CONSENT_COOKIE);
  if (!raw) return { necessary: true, analytics: false, marketing: false };
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentPrefs>;
    return {
      necessary: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
    };
  } catch {
    return { necessary: true, analytics: false, marketing: false };
  }
}

/**
 * Hard-blocks all non-essential tracking when the browser sends DNT=1.
 * Some browsers (Firefox, Safari, Brave) still send this; respecting it
 * is a cheap trust signal and a requirement under several privacy regimes.
 */
function dntEnabled(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // Cast through unknown so TS doesn't flag the legacy MS/Apple aliases.
  const nav = navigator as unknown as {
    doNotTrack?: string;
    msDoNotTrack?: string;
  };
  const win = window as unknown as { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/**
 * React hook — call from any analytics component.
 *
 * Initial render returns DNT-aware all-false to avoid SSR/CSR mismatch
 * (we don't have access to the cookie on the server). After mount we
 * read the cookie and update once, then re-read whenever
 * `ha:consent-changed` fires (dispatched by `<CookieConsent>` when the
 * user mutates preferences).
 */
export function useConsent(): ConsentPrefs {
  const [prefs, setPrefs] = useState<ConsentPrefs>(() => ({
    necessary: true,
    analytics: false,
    marketing: false,
  }));

  useEffect(() => {
    // Honour DNT as an absolute override — bail before subscribing.
    // Initial state is already all-false so no setPrefs is needed; the
    // direct setState was flagged by react-hooks/set-state-in-effect
    // because synchronous state writes inside effect bodies cascade
    // renders. The bail also skips the storage event listener so DNT
    // visitors don't pay the listener cost.
    if (dntEnabled()) return;
    // Initial read after hydration — queueMicrotask defers the update
    // outside the effect's synchronous phase, satisfying the
    // set-state-in-effect rule the same way the legacy GA / FB / GTM
    // components do it.
    queueMicrotask(() => setPrefs(readConsent()));
    // Listen for banner-driven changes. The CookieConsent component
    // currently reloads the page on change, but emitting the event makes
    // single-page mutation possible later without touching providers.
    const onChange = () => setPrefs(readConsent());
    window.addEventListener('ha:consent-changed', onChange);
    return () => window.removeEventListener('ha:consent-changed', onChange);
  }, []);

  return prefs;
}

/** Synchronous helper for non-React contexts (e.g. lib/analytics.ts facades). */
export function hasAnalyticsConsent(): boolean {
  if (dntEnabled()) return false;
  return readConsent().analytics;
}

/** Synchronous helper for non-React contexts. */
export function hasMarketingConsent(): boolean {
  if (dntEnabled()) return false;
  return readConsent().marketing;
}
