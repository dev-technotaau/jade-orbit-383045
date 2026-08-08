// Sentry must be initialized before any other imports
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load .env before reading SENTRY_DSN (instrument.ts runs before the app's dotenv.config)
dotenv.config();

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Set sampling rate for profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Capture unhandled promise rejections
    integrations: [
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.expressIntegration(),
      Sentry.prismaIntegration(),
    ],

    // Filter out sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-csrf-token'];
      }
      // Redact sensitive fields from request body
      if (event.request?.data && typeof event.request.data === 'object') {
        const sensitive = [
          'password',
          'newPassword',
          'currentPassword',
          'confirmPassword',
          'token',
          'secret',
          'mfaCode',
          'otp',
          'refreshToken',
        ];
        for (const key of sensitive) {
          if (key in (event.request.data as Record<string, unknown>)) {
            (event.request.data as Record<string, unknown>)[key] = '[REDACTED]';
          }
        }
      }
      return event;
    },
  });

  console.log('✅ Sentry initialized');
} else {
  console.warn('⚠️ Sentry DSN not configured - error tracking disabled');
}

export default Sentry;
