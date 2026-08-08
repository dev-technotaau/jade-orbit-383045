'use client';

import { useReportWebVitals } from 'next/web-vitals';
import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/lib/analytics';

/**
 * Per-metric "poor" thresholds aligned with Google's Web Vitals guidance.
 * Used for dev-mode warnings AND for tagging Sentry events with the
 * rating bucket so the Insights tab can filter on "poor" only.
 */
const POOR_THRESHOLD: Record<string, number> = {
  LCP: 2500,
  FID: 100,
  CLS: 0.1,
  INP: 200,
  TTFB: 800,
  FCP: 1800,
};

const NEEDS_IMPROVEMENT_THRESHOLD: Record<string, number> = {
  LCP: 4000,
  FID: 300,
  CLS: 0.25,
  INP: 500,
  TTFB: 1800,
  FCP: 3000,
};

function ratingFor(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const poor = POOR_THRESHOLD[name];
  const needs = NEEDS_IMPROVEMENT_THRESHOLD[name];
  if (poor == null || needs == null) return 'good';
  if (value <= poor) return 'good';
  if (value <= needs) return 'needs-improvement';
  return 'poor';
}

export default function WebVitals() {
  useReportWebVitals((metric) => {
    const rating = ratingFor(metric.name, metric.value);

    // 1. Google Analytics 4 — per-pageview Web Vitals events.
    trackEvent('web_vitals', metric.name, metric.id, Math.round(metric.value));

    // 2. Sentry — Web Vitals as measurements on the current transaction
    //    (powers the Performance / Insights tab's percentile breakdowns)
    //    + a tagged breadcrumb so the rating bucket is visible on every
    //    error / session-replay tied to this pageview.
    try {
      const activeSpan = Sentry.getActiveSpan();
      if (activeSpan) {
        // Float-precision attribute; CLS is unitless, others are in ms.
        activeSpan.setAttribute(`webvital.${metric.name.toLowerCase()}.value`, metric.value);
        activeSpan.setAttribute(`webvital.${metric.name.toLowerCase()}.rating`, rating);
        activeSpan.setAttribute(`webvital.${metric.name.toLowerCase()}.delta`, metric.delta);
      }
      Sentry.addBreadcrumb({
        category: 'web-vital',
        message: `${metric.name}: ${metric.value.toFixed(2)} (${rating})`,
        level: rating === 'poor' ? 'warning' : 'info',
        data: {
          name: metric.name,
          value: metric.value,
          delta: metric.delta,
          id: metric.id,
          rating,
        },
      });
    } catch {
      /* Sentry not initialized yet — drop silently */
    }

    // 3. Dev-mode console warnings on poor metrics for fast iteration.
    if (process.env.NODE_ENV === 'development' && rating === 'poor') {
      console.warn(
        `[Web Vitals] Poor ${metric.name}: ${metric.value.toFixed(2)} (threshold ${POOR_THRESHOLD[metric.name]})`,
      );
    }
  });

  return null;
}
