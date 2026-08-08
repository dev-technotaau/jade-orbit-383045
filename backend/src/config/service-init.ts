import { env } from './env';
import logger from './logger';
import {
  displayShutdownStatus,
  displayStartupStatus,
  logServiceShutdown,
  registerService,
} from './service-status';

/**
 * Boot-status reporter.
 *
 * Probes each dependency once at startup and prints the status banner. Every
 * probe is wrapped in try/catch and NOTHING here is load-bearing — a failure
 * marks a service degraded in the banner, it does not stop the server. Keep it
 * that way: this file must never be able to prevent a boot.
 *
 * The host platform reported 109 services here, most of which no longer exist.
 * This reports only what this module actually depends on.
 */
export const initializeServices = async (): Promise<void> => {
  logger.info('Initializing services...');

  /* ── Core ─────────────────────────────────────────────── */
  registerService('Express Server', 'ready');
  registerService('Socket.IO', 'ready'); // initialised in server.ts
  registerService('Compression', 'ready', 'gzip/brotli');
  registerService('Cookie Parser', 'ready');
  registerService('Winston Logger', 'ready');
  registerService('Request ID Correlation', 'ready');
  registerService('Request Timeout', 'ready', '30s');

  /* ── Security ─────────────────────────────────────────── */
  registerService('Helmet', 'ready');
  registerService('CORS', 'ready', env.CORS_ORIGIN);
  registerService('CSRF Protection', 'ready');
  registerService('HPP Protection', 'ready');
  registerService('XSS Sanitization', 'ready');
  registerService('Rate Limiting', 'ready');
  registerService('DDoS Protection', 'ready');
  registerService('WAF (Web App Firewall)', 'ready');
  registerService('Maintenance Mode', 'ready');
  registerService(
    'App Password',
    env.APP_PASSWORD ? 'ready' : 'not_configured',
    env.APP_PASSWORD ? 'Single shared secret' : 'APP_PASSWORD unset — every gated route will 500'
  );

  /* ── Datastores ───────────────────────────────────────── */
  try {
    const { prisma } = await import('./prisma');
    await prisma.$queryRawUnsafe('SELECT 1');
    registerService('PostgreSQL (Prisma)', 'ready');
  } catch (error) {
    registerService('PostgreSQL (Prisma)', 'error', (error as Error).message);
  }

  if (env.REDIS_ENABLED === 'true') {
    try {
      const { redis } = await import('./redis');
      await redis.ping();
      registerService('Redis', 'ready');
      // BullMQ rides on the same connection, so its readiness follows Redis.
      registerService('BullMQ Job Queue', 'ready');
    } catch (error) {
      registerService('Redis', 'error', (error as Error).message);
      registerService('BullMQ Job Queue', 'error', 'Redis unavailable');
    }
  } else {
    registerService('Redis', 'disabled');
    registerService('BullMQ Job Queue', 'disabled', 'Redis disabled');
  }

  /* ── Media storage (WhatsApp inbound/outbound attachments) ── */
  try {
    const r2 = await import('./r2');
    registerService(
      'Cloudflare R2',
      r2 ? 'ready' : 'not_configured',
      'WhatsApp media storage'
    );
  } catch {
    registerService('Cloudflare R2', 'not_configured');
  }

  /* ── WhatsApp (Meta Cloud API) ────────────────────────── */
  const waReady = Boolean(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_ID);
  registerService(
    'WhatsApp (Meta)',
    waReady ? 'ready' : 'not_configured',
    waReady
      ? `Cloud API ${env.META_WHATSAPP_API_VERSION}`
      : 'META_WHATSAPP_TOKEN / META_WHATSAPP_PHONE_ID unset'
  );
  registerService(
    'WhatsApp Webhook',
    env.META_WHATSAPP_APP_SECRET ? 'ready' : 'not_configured',
    env.META_WHATSAPP_APP_SECRET
      ? 'X-Hub-Signature-256 verified'
      : 'META_WHATSAPP_APP_SECRET unset — inbound webhooks cannot be verified'
  );

  /* ── Observability ────────────────────────────────────── */
  registerService('Sentry', env.SENTRY_DSN ? 'ready' : 'not_configured');
  registerService(
    'OpenTelemetry',
    env.OTEL_ENABLED === 'true' ? 'ready' : 'disabled',
    env.OTEL_EXPORTER_OTLP_ENDPOINT
  );
  registerService('Swagger API Docs', 'ready', '/api-docs');

  try {
    await import('./feature-flags');
    registerService('Feature Flags', 'ready');
  } catch {
    registerService('Feature Flags', 'error');
  }

  displayStartupStatus();
};

export const shutdownServices = async (): Promise<void> => {
  displayShutdownStatus();

  try {
    const { disconnectPrisma } = await import('./prisma');
    await disconnectPrisma();
    logServiceShutdown('PostgreSQL (Prisma)');
  } catch (error) {
    logger.error('Error disconnecting Prisma:', error);
  }

  if (env.REDIS_ENABLED === 'true') {
    try {
      const { redis } = await import('./redis');
      redis.disconnect();
      logServiceShutdown('Redis');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
    }
  }
};
