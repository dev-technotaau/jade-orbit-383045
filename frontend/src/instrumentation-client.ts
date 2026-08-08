// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { initBrowserOtel } from './lib/otel-browser';

Sentry.init({
  dsn: 'https://ddac50f607355da437c26072b71f9ab1@o4510877481304064.ingest.us.sentry.io/4510877498277888',

  // Integrations — explicitly enable BrowserTracing so Sentry's
  // Performance / Insights tab gets Web Vitals percentiles + slowest
  // transactions out of the box. `enableInp` captures Interaction-to-
  // Next-Paint (the Core Web Vital that replaced FID in March 2024).
  // `enableLongAnimationFrame` emits the new LoAF entries so we can see
  // which animation frames were blocked. `enableHTTPTimings` exposes
  // DNS / TCP / TTFB breakdowns inside Sentry's request spans.
  integrations: [
    Sentry.browserTracingIntegration({
      enableInp: true,
      enableLongAnimationFrame: true,
      enableHTTPTimings: true,
    }),
    Sentry.replayIntegration(),
  ],

  // Sample 10% of traces in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

// Initialize OpenTelemetry for browser-side distributed tracing
initBrowserOtel();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
