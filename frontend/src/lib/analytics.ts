/**
 * Backward-compatibility shim.
 *
 * The original `pageView`, `trackEvent`, `trackConversion`, `fbPageView`,
 * and `fbEvent` exports are widely scattered across pages and components.
 * Rather than touch every callsite, this module forwards each legacy call
 * to the unified `analytics` facade so all providers — including the
 * newly-added Clarity, Hotjar, LinkedIn, Pinterest, Reddit, X, TikTok,
 * Quora, Bing UET, Snap, PostHog, Cloudflare Insights, and Adobe — see
 * the same events that GA + FB used to see alone.
 *
 * New code should import directly from `@/lib/analytics/track`.
 */

import { analytics } from '@/lib/analytics/track';
import { hasAnalyticsConsent, hasMarketingConsent } from '@/lib/analytics/consent';

// Re-export the unified facade so it's reachable from this entry point too.
export { analytics } from '@/lib/analytics/track';
export type { AnalyticsEvent, IdentifyTraits } from '@/lib/analytics/types';

/** Legacy GA4 page-view shim — now fans out to all enabled providers. */
export function pageView(url: string): void {
  analytics.pageView(url);
}

/** Legacy GA4 event shim — fans out to all providers via `trackCustom`. */
export function trackEvent(action: string, category: string, label?: string, value?: number): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  try {
    window.gtag?.('event', action, {
      event_category: category,
      event_label: label,
      value,
    });
  } catch {
    // Analytics failures are never user-facing.
  }
  // Mirror into other analytics buckets for funnel completeness.
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: action,
      event_category: category,
      event_label: label,
      value,
    });
  } catch {
    /* noop */
  }
  try {
    window.posthog?.capture?.(action, { category, label, value });
  } catch {
    /* noop */
  }
  try {
    window.clarity?.('event', action);
  } catch {
    /* noop */
  }
}

/** Legacy GA conversion shim. */
export function trackConversion(conversionId: string): void {
  if (typeof window === 'undefined' || !hasMarketingConsent()) return;
  try {
    window.gtag?.('event', 'conversion', { send_to: conversionId });
  } catch {
    /* noop */
  }
}

/** Legacy Facebook page-view shim — call sites still scattered across app. */
export function fbPageView(): void {
  if (typeof window === 'undefined' || !hasMarketingConsent()) return;
  try {
    window.fbq?.('track', 'PageView');
  } catch {
    /* noop */
  }
}

/** Legacy Facebook custom-event shim. */
export function fbEvent(event: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !hasMarketingConsent()) return;
  try {
    window.fbq?.('track', event, params);
  } catch {
    /* noop */
  }
}

// Re-export window-augmentation declarations so legacy imports keep working.
import '@/lib/analytics/types';
