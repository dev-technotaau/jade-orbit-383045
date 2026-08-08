/**
 * Unified analytics facade.
 *
 *   import { analytics } from '@/lib/analytics/track';
 *
 *   analytics.pageView('/jobs/12345');
 *   analytics.track({ name: 'job_apply', props: { jobId: '12345', value: 0 } });
 *   analytics.identify({ userId: 'u_42', role: 'CANDIDATE' });
 *
 * Each call fans the event out to every loaded provider, calling that
 * provider's native API in its idiomatic shape (gtag('event', …),
 * fbq('track', …), clarity('event', …), posthog.capture(…), etc.).
 *
 * **Hard rule: this module never throws.** Analytics failures must not
 * surface as user-facing errors. Every provider call is wrapped in
 * `safe(() => …)` so a missing global or a TypeError inside a third-party
 * SDK can never bubble out.
 *
 * **Consent-aware**: providers whose buckets are denied are skipped at
 * the facade level too — even if the global somehow exists (e.g. injected
 * by GTM rules outside our control). This is belt-and-braces alongside
 * the script-level gates in each `<XPixel>` component.
 */
import type { AnalyticsEvent, IdentifyTraits } from './types';
import { hasAnalyticsConsent, hasMarketingConsent } from './consent';

const isBrowser = typeof window !== 'undefined';

function safe(fn: () => void): void {
  if (!isBrowser) return;
  try {
    fn();
  } catch {
    // Analytics failures are never user-facing.
  }
}

// =====================================================================
// Page-view fan-out
// =====================================================================

function pageView(path: string, title?: string): void {
  if (!isBrowser) return;
  const referrer = document.referrer || undefined;

  // ─── Analytics-bucket providers ───────────────────────────────────
  if (hasAnalyticsConsent()) {
    // GA4 — replays the page_view via gtag config (matches `pageView` in
    // the legacy lib/analytics.ts).
    safe(() => {
      const gaId = process.env.NEXT_PUBLIC_GA_ID;
      if (gaId && window.gtag) {
        window.gtag('config', gaId, { page_path: path, page_title: title });
      }
    });
    // GTM — push a `page_view` event for tags listening via dataLayer.
    safe(() => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'page_view',
        page_path: path,
        page_title: title,
        page_referrer: referrer,
      });
    });
    // Microsoft Clarity — `set` for current-page metadata, `event` for SPA hop.
    safe(() => {
      if (window.clarity) {
        window.clarity('set', 'page_path', path);
        window.clarity('event', 'spa_page_view');
      }
    });
    // Contentsquare UXA (Hotjar's successor) — pushes the SPA hop
    // onto the command queue. The SDK auto-captures hashchange but
    // pushState/replaceState navigations need an explicit beacon.
    safe(() => {
      window._uxa = window._uxa || [];
      window._uxa.push(['trackPageview', path]);
    });
    // PostHog — auto-page-views are usually on by default, but capturing
    // the SPA hop explicitly keeps recordings + funnels accurate.
    safe(() => window.posthog?.capture?.('$pageview', { $current_url: path }));
    // Adobe Launch — call _satellite.track on SPA hops.
    safe(() => window._satellite?.track?.('page_view', { path }));
  }

  // ─── Marketing-bucket providers ───────────────────────────────────
  if (hasMarketingConsent()) {
    safe(() => window.fbq?.('track', 'PageView'));
    safe(() => window.lintrk?.('track'));
    safe(() => window.pintrk?.('page'));
    safe(() => window.rdt?.('track', 'PageVisit'));
    safe(() => window.twq?.('event', 'tw-page_view'));
    // TikTok has both function-style and object-style exposures depending on
    // loader version; cover both.
    safe(() => {
      const tt = window.ttq;
      if (!tt) return;
      if (typeof tt === 'function') (tt as (...a: unknown[]) => void)('page');
      else if (typeof tt === 'object' && tt.page) tt.page();
    });
    safe(() => window.qp?.('track', 'ViewContent'));
    safe(() => {
      const uet = window.uetq;
      if (!uet) return;
      if (Array.isArray(uet)) uet.push({ ec: 'page', ea: 'view', el: path });
      else uet.push({ ec: 'page', ea: 'view', el: path });
    });
    safe(() => window.snaptr?.('track', 'PAGE_VIEW'));
  }
}

// =====================================================================
// Event fan-out
// =====================================================================

/**
 * Map a typed `AnalyticsEvent` to each provider's idiomatic event name.
 * Where a provider has a canonical event (e.g. `job_apply` → FB Lead) we
 * use it; otherwise we forward the raw event name as a custom event.
 */
function track(event: AnalyticsEvent): void {
  if (!isBrowser) return;
  const { name, props } = event as { name: string; props?: Record<string, unknown> };
  const safeProps = (props ?? {}) as Record<string, unknown>;

  // ─── Analytics-bucket providers ───────────────────────────────────
  if (hasAnalyticsConsent()) {
    safe(() => window.gtag?.('event', name, safeProps));
    safe(() => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...safeProps });
    });
    safe(() => window.clarity?.('event', name));
    safe(() => {
      // Contentsquare custom event — the `trackPageEvent` command
      // surfaces in the workspace's "Behaviour" reports.
      window._uxa = window._uxa || [];
      window._uxa.push(['trackPageEvent', name]);
    });
    safe(() => window.posthog?.capture?.(name, safeProps));
    safe(() => window._satellite?.track?.(name, safeProps));
  }

  // ─── Marketing-bucket providers ───────────────────────────────────
  if (hasMarketingConsent()) {
    safe(() => {
      // Facebook canonical event mapping (subset of Standard Events).
      const fbqMap: Record<string, string | undefined> = {
        sign_up: 'CompleteRegistration',
        login: undefined,
        job_view: 'ViewContent',
        job_apply: 'Lead',
        search: 'Search',
        purchase: 'Purchase',
        begin_checkout: 'InitiateCheckout',
        add_to_cart: 'AddToCart',
        lead: 'Lead',
        contact: 'Contact',
      };
      const fbName = fbqMap[name];
      if (fbName) window.fbq?.('track', fbName, safeProps);
      else window.fbq?.('trackCustom', name, safeProps);
    });
    safe(() => {
      // LinkedIn — conversions are configured by ID server-side. We forward
      // a generic track() on every event so the LinkedIn rule engine can
      // match on event name.
      if (window.lintrk) window.lintrk('track', { conversion_id: name });
    });
    safe(() => {
      const pintMap: Record<string, string | undefined> = {
        sign_up: 'signup',
        purchase: 'checkout',
        begin_checkout: 'addtocart',
        add_to_cart: 'addtocart',
        lead: 'lead',
        search: 'search',
        job_view: 'pagevisit',
        job_apply: 'lead',
      };
      const pinName = pintMap[name];
      if (pinName) window.pintrk?.('track', pinName, safeProps);
      else window.pintrk?.('track', 'custom', { event_name: name, ...safeProps });
    });
    safe(() => {
      const redditMap: Record<string, string | undefined> = {
        sign_up: 'SignUp',
        login: undefined,
        purchase: 'Purchase',
        begin_checkout: 'AddToCart',
        add_to_cart: 'AddToCart',
        job_view: 'ViewContent',
        job_apply: 'Lead',
        lead: 'Lead',
        search: 'Search',
        contact: 'Lead',
      };
      const r = redditMap[name];
      if (r) window.rdt?.('track', r, safeProps);
      else window.rdt?.('track', 'Custom', { customEventName: name, ...safeProps });
    });
    safe(() => {
      // X / Twitter event IDs are merchant-configured; forward generic.
      window.twq?.('event', `tw-${name}`, safeProps);
    });
    safe(() => {
      const tt = window.ttq;
      if (!tt) return;
      const tiktokMap: Record<string, string | undefined> = {
        sign_up: 'CompleteRegistration',
        login: undefined,
        job_view: 'ViewContent',
        job_apply: 'SubmitForm',
        search: 'Search',
        purchase: 'CompletePayment',
        begin_checkout: 'InitiateCheckout',
        add_to_cart: 'AddToCart',
        lead: 'SubmitForm',
        contact: 'Contact',
      };
      const ttName = tiktokMap[name];
      if (typeof tt === 'function') {
        (tt as (...a: unknown[]) => void)('track', ttName ?? name, safeProps);
      } else if (typeof tt === 'object' && tt.track) {
        tt.track(ttName ?? name, safeProps);
      }
    });
    safe(() => {
      const quoraMap: Record<string, string | undefined> = {
        sign_up: 'CompleteRegistration',
        purchase: 'Purchase',
        begin_checkout: 'InitiateCheckout',
        add_to_cart: 'AddToCart',
        lead: 'Lead',
        job_apply: 'Lead',
        job_view: 'ViewContent',
        search: 'Search',
      };
      const q = quoraMap[name];
      if (q) window.qp?.('track', q);
      else window.qp?.('track', 'GenericEvent', { event_name: name });
    });
    safe(() => {
      const uet = window.uetq;
      if (!uet) return;
      const payload = {
        ec: name,
        ea: 'event',
        ...(typeof safeProps.value === 'number' ? { gv: safeProps.value } : {}),
      };
      if (Array.isArray(uet)) uet.push(payload);
      else uet.push(payload);
    });
    safe(() => {
      const snapMap: Record<string, string | undefined> = {
        sign_up: 'SIGN_UP',
        login: 'LOGIN',
        job_view: 'VIEW_CONTENT',
        job_apply: 'SIGN_UP',
        search: 'SEARCH',
        purchase: 'PURCHASE',
        begin_checkout: 'START_CHECKOUT',
        add_to_cart: 'ADD_CART',
        lead: 'SIGN_UP',
        contact: 'SIGN_UP',
      };
      const s = snapMap[name];
      if (s) window.snaptr?.('track', s, safeProps);
      else window.snaptr?.('track', 'CUSTOM_EVENT_1', { event_name: name, ...safeProps });
    });
  }
}

// =====================================================================
// Identify fan-out
// =====================================================================

function identify(traits: IdentifyTraits): void {
  if (!isBrowser) return;

  // ─── Analytics-bucket providers ───────────────────────────────────
  if (hasAnalyticsConsent()) {
    safe(() => {
      // GA4 user_id — links sessions across devices once the user logs in.
      const gaId = process.env.NEXT_PUBLIC_GA_ID;
      if (gaId && window.gtag) {
        window.gtag('config', gaId, { user_id: traits.userId });
        if (traits.role) window.gtag('set', 'user_properties', { role: traits.role });
      }
    });
    safe(() => {
      // GTM — push to dataLayer so tag rules can react.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'identify',
        user_id: traits.userId,
        user_role: traits.role,
      });
    });
    safe(() => {
      if (window.clarity) {
        window.clarity('identify', traits.userId);
        if (traits.role) window.clarity('set', 'role', traits.role);
      }
    });
    safe(() => {
      // Contentsquare identify — slot 1 is reserved for the visitor's
      // application user-id in our workspace conventions; subsequent
      // slots carry the high-cardinality traits. `setCustomVariable`
      // takes (slot, name, value, scope) where scope='visitor' makes
      // the value persist across sessions (required for cohort
      // segmentation in Contentsquare reports).
      window._uxa = window._uxa || [];
      window._uxa.push(['setCustomVariable', 1, 'user_id', traits.userId, 'visitor']);
      if (traits.role) window._uxa.push(['setCustomVariable', 2, 'role', traits.role, 'visitor']);
      if (traits.city) window._uxa.push(['setCustomVariable', 3, 'city', traits.city, 'visitor']);
      if (traits.state)
        window._uxa.push(['setCustomVariable', 4, 'state', traits.state, 'visitor']);
    });
    safe(() =>
      window.posthog?.identify?.(traits.userId, {
        role: traits.role,
        city: traits.city,
        state: traits.state,
        ...(traits.custom ?? {}),
      }),
    );
  }

  // ─── Marketing-bucket providers ───────────────────────────────────
  if (hasMarketingConsent()) {
    safe(() => {
      // Facebook Advanced Matching — hashed email / phone improves match
      // rate but is only used when caller already hashed them.
      const am: Record<string, unknown> = {};
      if (traits.emailSha256) am.em = traits.emailSha256;
      if (traits.phoneSha256) am.ph = traits.phoneSha256;
      if (traits.firstName) am.fn = traits.firstName.toLowerCase();
      if (Object.keys(am).length > 0) window.fbq?.('init', process.env.NEXT_PUBLIC_FB_PIXEL_ID, am);
    });
    safe(() => {
      // TikTok identify
      const tt = window.ttq;
      if (!tt || typeof tt !== 'object' || !tt.identify) return;
      tt.identify({
        email: traits.emailSha256,
        phone_number: traits.phoneSha256,
        external_id: traits.userId,
      });
    });
  }
}

/**
 * Reset all provider session state — call on logout so the next visitor
 * on the same device isn't attributed to the previous user.
 */
function reset(): void {
  safe(() => window.posthog?.reset?.());
  safe(() => window.gtag?.('config', process.env.NEXT_PUBLIC_GA_ID ?? '', { user_id: null }));
  // Most pixel providers don't expose a reset; we just stop calling identify().
}

export const analytics = {
  pageView,
  track,
  identify,
  reset,
};

export type Analytics = typeof analytics;
