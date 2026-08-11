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
  registerService(
    'Turnstile (bot protection)',
    env.CF_TURNSTILE_SECRET_KEY ? 'ready' : env.NODE_ENV === 'production' ? 'error' : 'disabled',
    env.CF_TURNSTILE_SECRET_KEY
      ? 'Challenge on /unlock'
      : env.NODE_ENV === 'production'
        ? 'CF_TURNSTILE_SECRET_KEY unset — /unlock will reject every attempt'
        : 'CF_TURNSTILE_SECRET_KEY unset — challenge skipped (non-production)'
  );

  // MFA state lives in the database, so this is a read rather than a config
  // check. Never let it stop a boot (see the header of this file).
  try {
    const { isMfaEnabled } = await import('../services/whatsapp-mfa.service');
    const on = await isMfaEnabled();
    registerService(
      'Two-Factor Auth (TOTP)',
      on ? 'ready' : 'disabled',
      on ? 'Shared authenticator secret' : 'Not enrolled — set up at /whatsapp/security'
    );
  } catch (error) {
    registerService('Two-Factor Auth (TOTP)', 'error', (error as Error).message);
  }

  {
    // Field encryption is optional by construction (encryptField passes the
    // value through without a key). Surface it in the banner rather than
    // letting a deployment quietly store PII in the clear.
    const { isEncryptionEnabled, warnIfEncryptionDisabled } = await import('../utils/encryption');
    warnIfEncryptionDisabled('boot');
    registerService(
      'Field Encryption',
      isEncryptionEnabled() ? 'ready' : 'not_configured',
      isEncryptionEnabled()
        ? 'AES-256-GCM (consent evidence, notes)'
        : 'FIELD_ENCRYPTION_KEY unset - consent evidence + notes stored in plaintext'
    );
  }

  registerService(
    'App Password',
    env.APP_PASSWORD ? 'ready' : 'not_configured',
    env.APP_PASSWORD ? 'Single shared secret' : 'APP_PASSWORD unset — every gated route will 500'
  );

  /* ── Datastores ───────────────────────────────────────── */
  try {
    const { prisma } = await import('./prisma');
    await prisma.$queryRawUnsafe('SELECT 1');

    // The module ships no migration history — the schema is applied with
    // `prisma db push`, which is a manual step nothing enforces. A deployment
    // that skips it connects fine, boots green, and then fails on the first
    // query with a raw Postgres "relation does not exist". Check once, here,
    // and say exactly what to run.
    const tables = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name LIKE 'Wa%'`
    );
    const waTables = Number(tables?.[0]?.count ?? 0);
    if (waTables === 0) {
      registerService(
        'PostgreSQL (Prisma)',
        'error',
        'connected, but the schema has never been applied — run: npm --prefix backend run db:deploy'
      );
      logger.error(
        'Database has no Wa* tables. The schema has not been applied to this ' +
          'database. Run `npm --prefix backend run db:deploy` (prisma db push) ' +
          'before starting the server.'
      );
    } else {
      registerService('PostgreSQL (Prisma)', 'ready', `${waTables} WhatsApp tables`);
    }
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
    registerService('Cloudflare R2', r2 ? 'ready' : 'not_configured', 'WhatsApp media storage');
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

  registerService('Swagger API Docs', 'ready', '/api-docs');

  displayStartupStatus();
};

export const shutdownServices = async (): Promise<void> => {
  displayShutdownStatus();

  // Campaign counter recomputes are coalesced behind a short timer; flush them
  // before the database goes away, or the last few status webhooks of a run are
  // never reflected in the campaign's totals.
  try {
    const { flushPendingCounterRecomputes } = await import('../services/whatsapp-campaign.service');
    await flushPendingCounterRecomputes();
  } catch (error) {
    logger.error('Error flushing campaign counter recomputes:', error);
  }

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
