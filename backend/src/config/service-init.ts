import { env } from './env';
import logger from './logger';
import {
  displayShutdownStatus,
  displayStartupStatus,
  logServiceShutdown,
  registerService,
} from './service-status';

import { searchService } from '../services/search.service';

/**
 * Initialize all services and check their connection status
 */
export const initializeServices = async (): Promise<void> => {
  logger.info('Initializing services...');

  // ═══════════════════════════════════════════════════════════════
  // CORE
  // ═══════════════════════════════════════════════════════════════

  // Express Server (always ready at this point)
  registerService('Express Server', 'ready');

  // Socket.IO (initialized separately in server.ts)
  registerService('Socket.IO', 'ready');

  // Compression (gzip/brotli via compression middleware)
  registerService('Compression', 'ready', 'gzip/brotli');

  // Request ID Tracking (express-request-id middleware)
  registerService('Request ID Tracking', 'ready', 'X-Request-ID header');

  // Request Timeout (custom timeout middleware)
  registerService('Request Timeout', 'ready', '30s default');

  // ═══════════════════════════════════════════════════════════════
  // DATABASE
  // ═══════════════════════════════════════════════════════════════

  // PostgreSQL (Prisma) — retry for managed DB cold starts
  try {
    const { prisma } = await import('./prisma');
    let connected = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        connected = true;
        break;
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (connected) {
      registerService('PostgreSQL (Prisma)', 'connected');
    } else {
      await prisma.$queryRawUnsafe('SELECT 1');
      registerService('PostgreSQL (Prisma)', 'connected');
    }
  } catch (error) {
    registerService('PostgreSQL (Prisma)', 'error', (error as Error).message?.slice(0, 50));
  }

  // Admin PBAC — seed the baseline system roles so a fresh install can grant
  // a coherent job description instead of hand-picking from 400 keys.
  // Idempotent and non-overwriting; a failure here must not stop boot, since
  // permissions still resolve correctly with zero roles present.
  try {
    const { permissionService } = await import('../services/permission.service');
    const { GRANTABLE_PERMISSION_KEYS } = await import('./permissions');
    await permissionService.ensureSystemRoles();
    registerService(
      'Admin PBAC',
      'ready',
      `${GRANTABLE_PERMISSION_KEYS.length} grantable permissions`
    );
  } catch (error) {
    registerService('Admin PBAC', 'error', (error as Error).message?.slice(0, 50));
  }

  // ═══════════════════════════════════════════════════════════════
  // CACHE & QUEUE
  // ═══════════════════════════════════════════════════════════════

  // Redis
  if (env.REDIS_ENABLED === 'true') {
    try {
      const { redis } = await import('./redis');
      await redis.ping();
      registerService('Redis', 'connected');
    } catch (error) {
      registerService('Redis', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('Redis', 'disabled');
  }

  // BullMQ Workers (leader election status — updated by WorkerLeaderManager)
  if (env.REDIS_ENABLED === 'true') {
    registerService('BullMQ Workers', 'ready', 'Pending leader election');
  } else {
    registerService('BullMQ Workers', 'disabled', 'Requires Redis');
  }

  // BullMQ Job Queue (depends on Redis)
  if (env.REDIS_ENABLED === 'true') {
    registerService('BullMQ Job Queue', 'ready', 'Email queue ready');
  } else {
    registerService('BullMQ Job Queue', 'disabled', 'Requires Redis');
  }

  // SMS Queue (Twilio)
  if (env.REDIS_ENABLED === 'true') {
    registerService('SMS Queue', 'ready', 'Twilio queue ready');
  } else {
    registerService('SMS Queue', 'disabled', 'Requires Redis');
  }

  // WhatsApp Queue (Meta)
  if (env.REDIS_ENABLED === 'true') {
    registerService('WhatsApp Queue', 'ready', 'Meta queue ready');
  } else {
    registerService('WhatsApp Queue', 'disabled', 'Requires Redis');
  }

  // FCM Queue (Mobile Push)
  if (env.REDIS_ENABLED === 'true') {
    registerService('FCM Queue', 'ready', 'Mobile push ready');
  } else {
    registerService('FCM Queue', 'disabled', 'Requires Redis');
  }

  // In-App Queue (Real-time)
  if (env.REDIS_ENABLED === 'true') {
    registerService('In-App Queue', 'ready', 'Socket.IO ready');
  } else {
    registerService('In-App Queue', 'disabled', 'Requires Redis');
  }

  // Web Push Queue (Service Worker)
  if (env.REDIS_ENABLED === 'true') {
    registerService('Web Push Queue', 'ready', 'VAPID push ready');
  } else {
    registerService('Web Push Queue', 'disabled', 'Requires Redis');
  }

  // ═══════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════

  // Elasticsearch
  if (env.ELASTICSEARCH_URL) {
    try {
      const elasticClient = (await import('./elasticsearch')).default;
      const health = await elasticClient.cluster.health();
      registerService('Elasticsearch', 'connected', health.status);

      // Full reindex on every startup: delete → recreate → seed suggestions → backfill from DB
      await searchService.reindexAll();
    } catch (error) {
      registerService('Elasticsearch', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('Elasticsearch', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════

  // JWT Auth
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    registerService('JWT Auth', 'ready');
  } else {
    registerService('JWT Auth', 'error', 'Secret too short');
  }

  // Passport.js
  registerService('Passport.js', 'ready');

  // Google OAuth
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    registerService('Google OAuth', 'connected');
  } else {
    registerService('Google OAuth', 'not_configured');
  }

  // LinkedIn OAuth
  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    registerService('LinkedIn OAuth', 'connected');
  } else {
    registerService('LinkedIn OAuth', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // MESSAGING
  // ═══════════════════════════════════════════════════════════════

  // Kafka
  if (env.KAFKA_BROKERS) {
    try {
      const { kafka } = await import('./kafka');
      if (kafka) {
        const admin = kafka.admin();
        await admin.connect();
        await admin.disconnect();
        registerService('Kafka', 'connected', '4 consolidated topics');
      } else {
        registerService('Kafka', 'not_configured');
      }
    } catch (error) {
      registerService('Kafka', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('Kafka', 'not_configured');
  }

  // Kafka Consumer (leader election status — updated by WorkerLeaderManager)
  if (env.KAFKA_BROKERS) {
    registerService('Kafka Consumer', 'ready', 'Pending leader election');
  } else {
    registerService('Kafka Consumer', 'not_configured');
  }

  // Firebase FCM
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const admin = (await import('./firebase')).default;
      if (admin.apps.length > 0) {
        registerService('Firebase FCM', 'connected');
      } else {
        registerService('Firebase FCM', 'error', 'Not initialized');
      }
    } catch (error) {
      registerService('Firebase FCM', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('Firebase FCM', 'not_configured');
  }

  // Firebase Realtime Database
  if (env.FIREBASE_DATABASE_URL) {
    registerService(
      'Firebase Realtime DB',
      'connected',
      env.FIREBASE_DATABASE_URL.replace(/https?:\/\//, '').slice(0, 40)
    );
  } else {
    registerService('Firebase Realtime DB', 'not_configured');
  }

  // Firebase Auth (Admin SDK)
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    registerService('Firebase Auth', 'connected');
  } else {
    registerService('Firebase Auth', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════

  // Cloudflare R2
  if (env.CLOUDFLARE_ACCOUNT_ID && env.R2_ACCESS_KEY_ID) {
    registerService('Cloudflare R2', 'connected');
  } else {
    registerService('Cloudflare R2', 'not_configured');
  }

  // Cloudinary
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY) {
    registerService('Cloudinary', 'connected');
  } else {
    registerService('Cloudinary', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // EMAIL
  // ═══════════════════════════════════════════════════════════════

  // SMTP (Nodemailer)
  if (env.SMTP_HOST && env.SMTP_USER) {
    registerService('SMTP (Nodemailer)', 'connected', env.SMTP_HOST);
  } else {
    registerService('SMTP (Nodemailer)', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  // Twilio SMS
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
    registerService('Twilio SMS', 'connected');
  } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    registerService('Twilio SMS', 'not_configured', 'TWILIO_PHONE_NUMBER missing');
  } else {
    registerService('Twilio SMS', 'not_configured');
  }

  // WhatsApp (Meta)
  if (env.META_WHATSAPP_PHONE_ID && env.META_WHATSAPP_TOKEN) {
    registerService('WhatsApp (Meta)', 'connected');
  } else {
    registerService('WhatsApp (Meta)', 'not_configured');
  }

  // Web Push (VAPID)
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    registerService('Web Push (VAPID)', 'connected', env.VAPID_SUBJECT?.replace('mailto:', ''));
  } else {
    registerService('Web Push (VAPID)', 'not_configured');
  }

  // Job Alerts
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // JobAlertService is an object export
      const { jobAlertService } = await import('../services/job-alert.service');
      if (jobAlertService) {
        registerService('Job Alerts', 'ready', 'Email + Push notifications');
      } else {
        registerService('Job Alerts', 'not_configured');
      }
    } catch {
      registerService('Job Alerts', 'error', 'Service missing');
    }
  } else {
    registerService('Job Alerts', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // CLOUD SERVICES
  // ═══════════════════════════════════════════════════════════════

  // Google Cloud Talent
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const { jobClient } = await import('./talent');
      if (jobClient) {
        registerService(
          'Google Cloud Talent',
          'connected',
          env.CLOUD_TALENT_TENANT_ID ? undefined : 'CLOUD_TALENT_TENANT_ID missing'
        );
      } else {
        registerService('Google Cloud Talent', 'not_configured');
      }
    } catch (error) {
      registerService('Google Cloud Talent', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('Google Cloud Talent', 'not_configured');
  }

  // Google Document AI
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT && env.DOCUMENT_AI_PROCESSOR_ID) {
    try {
      const { documentAIClient } = await import('./document-ai');
      if (documentAIClient) {
        registerService('Google Document AI', 'connected');
      } else {
        registerService('Google Document AI', 'not_configured');
      }
    } catch (error) {
      registerService('Google Document AI', 'error', (error as Error).message?.slice(0, 50));
    }
  } else if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    registerService('Google Document AI', 'not_configured', 'DOCUMENT_AI_PROCESSOR_ID missing');
  } else {
    registerService('Google Document AI', 'not_configured');
  }

  // BigQuery
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const { bigqueryClient } = await import('./bigquery');
      if (bigqueryClient) {
        registerService('BigQuery', 'connected');
      } else {
        registerService('BigQuery', 'not_configured');
      }
    } catch (error) {
      registerService('BigQuery', 'error', (error as Error).message?.slice(0, 50));
    }
  } else {
    registerService('BigQuery', 'not_configured');
  }

  // Geocoding
  if (env.GEOCODING_PROVIDER) {
    const provider = env.GEOCODING_PROVIDER === 'google' ? 'Google Maps' : 'Nominatim (OSM)';
    registerService('Geocoding', 'connected', provider);
  } else {
    registerService('Geocoding', 'not_configured');
  }

  // Nominatim (OSM) - Explicit check
  if (env.NOMINATIM_BASE_URL) {
    registerService('Nominatim (OSM)', 'connected', env.NOMINATIM_BASE_URL.replace('https://', ''));
  } else {
    registerService('Nominatim (OSM)', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // MONITORING
  // ═══════════════════════════════════════════════════════════════

  // Sentry
  if (env.SENTRY_DSN) {
    registerService('Sentry', 'connected');
  } else {
    registerService('Sentry', 'not_configured', 'DSN not set');
  }

  // OpenTelemetry
  if (env.OTEL_ENABLED === 'true') {
    const endpoint =
      env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/https?:\/\//, '').replace(/\/.*/, '') ||
      'localhost';
    registerService('OpenTelemetry', 'connected', `→ ${endpoint}`);
  } else {
    registerService('OpenTelemetry', 'disabled');
  }

  // Winston Logger (always ready)
  registerService('Winston Logger', 'ready', env.LOG_LEVEL);

  // Morgan HTTP Logger (development only)
  if (env.NODE_ENV === 'development') {
    registerService('Morgan HTTP Logger', 'ready', 'dev format');
  } else {
    registerService('Morgan HTTP Logger', 'disabled', 'Production');
  }

  // Request ID Correlation (express-request-id)
  registerService('Request ID Correlation', 'ready', 'X-Request-ID');

  // Google Analytics (Measurement Protocol)
  if (env.GA_MEASUREMENT_ID && env.GA_API_SECRET) {
    registerService('Google Analytics', 'connected', env.GA_MEASUREMENT_ID);
  } else {
    registerService('Google Analytics', 'not_configured');
  }

  // Grafana Loki (Log Aggregation)
  // In Docker/K8s, logs are shipped to Loki via Promtail (container log driver)
  const isContainerized =
    (await import('fs')).existsSync('/.dockerenv') ||
    process.env.CONTAINER === 'true' ||
    !!process.env.KUBERNETES_SERVICE_HOST;
  if (env.LOG_AGGREGATION_URL) {
    registerService(
      'Grafana Loki',
      'connected',
      env.LOG_AGGREGATION_URL.replace(/https?:\/\//, '').substring(0, 30) + '...'
    );
  } else if (isContainerized) {
    registerService('Grafana Loki', 'ready', 'Logs via Promtail');
  } else {
    registerService('Grafana Loki', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════

  // Cloudflare Turnstile
  if (env.CF_TURNSTILE_SECRET_KEY) {
    registerService('Cloudflare Turnstile', 'connected');
  } else {
    registerService('Cloudflare Turnstile', 'not_configured');
  }

  // Rate Limiting (always enabled)
  registerService('Rate Limiting', 'ready', `${env.RATE_LIMIT_MAX_REQUESTS} req/15min`);

  // CORS
  registerService('CORS', 'ready', env.CORS_ORIGIN === '*' ? 'All origins' : 'Restricted');

  // Helmet (security headers)
  registerService('Helmet', 'ready');

  // CSRF Protection (Double CSRF pattern)
  if (env.CSRF_SECRET) {
    registerService('CSRF Protection', 'ready', 'Double-submit cookie');
  } else {
    registerService('CSRF Protection', 'not_configured');
  }

  // XSS Sanitization (always enabled via middleware)
  registerService('XSS Sanitization', 'ready');

  // HTML Sanitization (DOMPurify)
  try {
    const dompurify = await import('isomorphic-dompurify');
    if (dompurify) {
      registerService('HTML Sanitization', 'ready', 'DOMPurify');
    } else {
      registerService('HTML Sanitization', 'error', 'Package missing');
    }
  } catch {
    registerService('HTML Sanitization', 'error', 'Package missing');
  }

  // WAF (Web App Firewall)
  registerService('WAF (Web App Firewall)', 'ready', 'SQLi + XSS + Path Traversal rules');

  // DDoS Protection
  if (env.REDIS_ENABLED === 'true') {
    registerService('DDoS Protection', 'ready', 'Redis-backed IP rate limiting');
  } else {
    registerService('DDoS Protection', 'disabled', 'Requires Redis');
  }

  // CSP (Content Security Policy)
  registerService('CSP (Content Security Policy)', 'ready', "Strict 'self' + Cloudflare + R2");

  // HPP Protection (always enabled via middleware)
  registerService('HPP Protection', 'ready');

  // MFA (TOTP via Speakeasy)
  if (env.MFA_ENABLED === true) {
    registerService('MFA (TOTP)', 'ready', env.MFA_ISSUER || 'Hire Adda');
  } else {
    registerService('MFA (TOTP)', 'disabled');
  }

  // HIBP Breach Detection (Have I Been Pwned)
  if (env.HIBP_ENABLED === true) {
    registerService('HIBP Breach Detection', 'ready', 'Password breach check');
  } else {
    registerService('HIBP Breach Detection', 'disabled');
  }

  // Cookie Parser (cookie-parser middleware)
  if (env.COOKIE_SECRET) {
    registerService('Cookie Parser', 'ready', 'Signed cookies');
  } else {
    registerService('Cookie Parser', 'ready');
  }

  // OTP Service
  registerService(
    'OTP Service',
    'ready',
    `${env.OTP_LENGTH}-digit / ${env.OTP_EXPIRY_MINUTES}min expiry`
  );

  // Session Management
  registerService('Session Management', 'ready', `Max ${env.MAX_SESSIONS_PER_USER} sessions/user`);

  // WebAuthn (Passkeys)
  if (env.WEBAUTHN_RP_ID) {
    registerService('WebAuthn (Passkeys)', 'ready', `RP: ${env.WEBAUTHN_RP_ID}`);
  } else {
    registerService('WebAuthn (Passkeys)', 'not_configured');
  }

  // ═══════════════════════════════════════════════════════════════
  // FEATURES
  // ═══════════════════════════════════════════════════════════════

  // Feature Flags
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    registerService('Feature Flags', 'connected', 'Firebase Remote Config');
  } else {
    registerService('Feature Flags', 'ready', 'Local defaults only');
  }

  // Audit Logging
  registerService('Audit Logging', 'ready');

  // Swagger API Docs
  registerService('Swagger API Docs', 'ready', '/api-docs');

  // PDF/Resume Generation (Puppeteer + Handlebars)
  registerService('PDF/Resume Generation', 'ready', 'Puppeteer + Handlebars');

  // Excel Reports (ExcelJS)
  registerService('Excel Reports', 'ready', 'ExcelJS');

  // Webhooks
  if (env.WEBHOOK_SECRET) {
    registerService(
      'Webhooks',
      'ready',
      env.WEBHOOK_CALLBACK_URL?.replace(/https?:\/\//, '').slice(0, 40)
    );
  } else {
    registerService('Webhooks', 'not_configured');
  }

  // AI Matching Engine
  try {
    const { matchingService } = await import('../services/matching.service');
    // Check if the service instance exists (it's a named export)
    if (matchingService) {
      registerService('AI Matching Engine', 'ready', 'Vector + Keyword scoring');
    } else {
      registerService('AI Matching Engine', 'not_configured');
    }
  } catch {
    registerService('AI Matching Engine', 'error', 'Service missing');
  }

  // Resume Parsing
  try {
    // Resume parser exports a function called parseResume
    const { parseResume } = await import('../services/resume-parser.service');
    if (typeof parseResume === 'function') {
      registerService('Resume Parsing', 'ready', 'PDF text extraction');
    } else {
      registerService('Resume Parsing', 'not_configured');
    }
  } catch {
    registerService('Resume Parsing', 'error', 'Service missing');
  }

  // Content Moderation
  try {
    const { moderationService } = await import('../services/moderation.service');
    if (moderationService) {
      registerService('Content Moderation', 'ready', 'Text analysis');
    } else {
      registerService('Content Moderation', 'not_configured');
    }
  } catch {
    registerService('Content Moderation', 'error', 'Service missing');
  }

  // Consent Management
  try {
    // ConsentService has static methods, so checking the class export is sufficient
    const { ConsentService } = await import('../services/consent.service');
    if (ConsentService) {
      registerService('Consent Management', 'ready', 'GDPR/CCPA tracking');
    } else {
      registerService('Consent Management', 'not_configured');
    }
  } catch {
    registerService('Consent Management', 'error', 'Service missing');
  }

  // Support Tickets
  try {
    const { ticketService } = await import('../services/ticket.service');
    if (ticketService) {
      registerService('Support Tickets', 'ready', 'Internal system');
    } else {
      registerService('Support Tickets', 'not_configured');
    }
  } catch {
    registerService('Support Tickets', 'error', 'Service missing');
  }

  // Identity Verification
  try {
    const { verificationService } = await import('../services/verification.service');
    if (verificationService) {
      registerService('Identity Verification', 'ready', 'KYC/KYB Workflow');
    } else {
      registerService('Identity Verification', 'not_configured');
    }
  } catch {
    registerService('Identity Verification', 'error', 'Service missing');
  }

  // GDPR Data Export
  try {
    // Function export
    const { collectUserData } = await import('../services/data-export.service');
    if (typeof collectUserData === 'function') {
      registerService('GDPR Data Export', 'ready', 'JSON export generator');
    } else {
      registerService('GDPR Data Export', 'not_configured');
    }
  } catch {
    registerService('GDPR Data Export', 'error', 'Service missing');
  }

  // User Presence
  if (env.FIREBASE_DATABASE_URL) {
    try {
      const { presenceService } = await import('../services/presence.service');
      if (presenceService) {
        registerService('User Presence', 'ready', 'Realtime Online Status');
      } else {
        registerService('User Presence', 'not_configured');
      }
    } catch {
      registerService('User Presence', 'error', 'Service missing');
    }
  } else {
    registerService('User Presence', 'not_configured');
  }

  // QR Code Generation
  try {
    const qrcode = await import('qrcode');
    if (qrcode) {
      registerService('QR Code Generation', 'ready', 'MFA/Device Login');
    } else {
      registerService('QR Code Generation', 'error', 'Package missing');
    }
  } catch {
    registerService('QR Code Generation', 'error', 'Package missing');
  }

  // File Uploads
  if (env.UPLOAD_DIR) {
    registerService('File Uploads', 'ready', `Multer (${env.UPLOAD_MAX_SIZE} bytes max)`);
  } else {
    registerService('File Uploads', 'not_configured');
  }

  // Email Service
  try {
    const { sendEmail } = await import('../services/email.service');
    if (typeof sendEmail === 'function') {
      registerService('Email Service', 'ready', 'Transactional emails');
    } else {
      registerService('Email Service', 'not_configured');
    }
  } catch {
    registerService('Email Service', 'error', 'Service missing');
  }

  // Contact Service
  try {
    const { contactService } = await import('../services/contact.service');
    if (contactService) {
      registerService('Contact Service', 'ready', 'Contact form inquiries');
    } else {
      registerService('Contact Service', 'not_configured');
    }
  } catch {
    registerService('Contact Service', 'error', 'Service missing');
  }

  // Draft Service
  try {
    const { draftService } = await import('../services/draft.service');
    if (draftService) {
      registerService('Draft Service', 'ready', 'Form auto-save');
    } else {
      registerService('Draft Service', 'not_configured');
    }
  } catch {
    registerService('Draft Service', 'error', 'Service missing');
  }

  // Saved Search
  try {
    const { savedSearchService } = await import('../services/saved-search.service');
    if (savedSearchService) {
      registerService('Saved Search', 'ready');
    } else {
      registerService('Saved Search', 'not_configured');
    }
  } catch {
    registerService('Saved Search', 'error', 'Service missing');
  }

  // Saved Candidates
  try {
    const { savedCandidateService } = await import('../services/saved-candidate.service');
    if (savedCandidateService) {
      registerService('Saved Candidates', 'ready', 'Employer shortlists');
    } else {
      registerService('Saved Candidates', 'not_configured');
    }
  } catch {
    registerService('Saved Candidates', 'error', 'Service missing');
  }

  // Profile Views
  try {
    const { profileViewService } = await import('../services/profile-view.service');
    if (profileViewService) {
      registerService('Profile Views', 'ready', 'View tracking');
    } else {
      registerService('Profile Views', 'not_configured');
    }
  } catch {
    registerService('Profile Views', 'error', 'Service missing');
  }

  // Job Templates
  try {
    const { jobTemplateService } = await import('../services/job-template.service');
    if (jobTemplateService) {
      registerService('Job Templates', 'ready', 'Reusable job posts');
    } else {
      registerService('Job Templates', 'not_configured');
    }
  } catch {
    registerService('Job Templates', 'error', 'Service missing');
  }

  // Device Security
  try {
    const { deviceSecurityService } = await import('../services/device-security.service');
    if (deviceSecurityService) {
      registerService('Device Security', 'ready', 'IP/device risk detection');
    } else {
      registerService('Device Security', 'not_configured');
    }
  } catch {
    registerService('Device Security', 'error', 'Service missing');
  }

  // Report Generation
  try {
    const { reportService } = await import('../services/report.service');
    if (reportService) {
      registerService('Report Generation', 'ready', 'Excel/CSV exports');
    } else {
      registerService('Report Generation', 'not_configured');
    }
  } catch {
    registerService('Report Generation', 'error', 'Service missing');
  }

  // Admin Service
  try {
    const { adminService } = await import('../services/admin.service');
    if (adminService) {
      registerService('Admin Service', 'ready', 'Dashboard + moderation');
    } else {
      registerService('Admin Service', 'not_configured');
    }
  } catch {
    registerService('Admin Service', 'error', 'Service missing');
  }

  // Super Admin Service
  try {
    const { superAdminService } = await import('../services/super-admin.service');
    if (superAdminService) {
      registerService('Super Admin Service', 'ready');
    } else {
      registerService('Super Admin Service', 'not_configured');
    }
  } catch {
    registerService('Super Admin Service', 'error', 'Service missing');
  }

  // Candidate Analytics
  try {
    const { candidateAnalyticsService } = await import('../services/candidate-analytics.service');
    if (candidateAnalyticsService) {
      registerService('Candidate Analytics', 'ready', 'Funnel + trends');
    } else {
      registerService('Candidate Analytics', 'not_configured');
    }
  } catch {
    registerService('Candidate Analytics', 'error', 'Service missing');
  }

  // Employer Analytics
  try {
    const { employerAnalyticsService } = await import('../services/employer-analytics.service');
    if (employerAnalyticsService) {
      registerService('Employer Analytics', 'ready', 'Hiring pipeline');
    } else {
      registerService('Employer Analytics', 'not_configured');
    }
  } catch {
    registerService('Employer Analytics', 'error', 'Service missing');
  }

  // Talent Matching (Cloud Talent)
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const { talentMatchingService } = await import('../services/talent-matching.service');
      if (talentMatchingService) {
        registerService('Talent Matching', 'ready', 'Cloud Talent recommendations');
      } else {
        registerService('Talent Matching', 'not_configured');
      }
    } catch {
      registerService('Talent Matching', 'error', 'Service missing');
    }
  } else {
    registerService('Talent Matching', 'not_configured');
  }

  // Kafka Events
  if (env.KAFKA_BROKERS) {
    try {
      const { kafkaEventsService } = await import('../services/kafka-events.service');
      if (kafkaEventsService) {
        registerService('Kafka Events', 'ready', 'Event ring buffer');
      } else {
        registerService('Kafka Events', 'not_configured');
      }
    } catch {
      registerService('Kafka Events', 'error', 'Service missing');
    }
  } else {
    registerService('Kafka Events', 'not_configured');
  }

  // Field Encryption
  if (env.FIELD_ENCRYPTION_KEY) {
    registerService('Field Encryption', 'ready', 'AES-256-GCM');
  } else {
    registerService('Field Encryption', 'not_configured');
  }

  // Data Anonymization (GDPR)
  try {
    const { anonymizeEmail } = await import('../utils/anonymization');
    if (typeof anonymizeEmail === 'function') {
      registerService('Data Anonymization', 'ready', 'GDPR compliance');
    } else {
      registerService('Data Anonymization', 'not_configured');
    }
  } catch {
    registerService('Data Anonymization', 'error', 'Module missing');
  }

  // Maintenance Mode
  registerService('Maintenance Mode', 'ready', 'Feature flag driven');

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULER QUEUES
  // ═══════════════════════════════════════════════════════════════

  if (env.REDIS_ENABLED === 'true') {
    registerService('Scheduler Queue', 'ready', 'Core cron scheduler');
    registerService('Backup Queue', 'ready', 'DB backup');
    registerService('Data Export Queue', 'ready', 'GDPR export');
    registerService('Geocoding Queue', 'ready', env.GEOCODING_PROVIDER || 'Nominatim');
    registerService('Job Expiration Queue', 'ready', 'Auto-expire jobs');
    registerService('Matching Queue', 'ready', 'AI job matching');
    registerService('Profile Reminder Queue', 'ready', 'Completion nudges');
    registerService('Resume Parse Queue', 'ready', 'Document AI async');
    registerService('Scheduled Publish Queue', 'ready', 'Timed job publish');
    registerService('SLA Check Queue', 'ready', 'Ticket SLA monitor');
    registerService('Token Cleanup Queue', 'ready', 'Expired token sweep');
    registerService('Weekly Digest Queue', 'ready', 'Digest emails');
  } else {
    registerService('Scheduler Queue', 'disabled', 'Requires Redis');
    registerService('Backup Queue', 'disabled', 'Requires Redis');
    registerService('Data Export Queue', 'disabled', 'Requires Redis');
    registerService('Geocoding Queue', 'disabled', 'Requires Redis');
    registerService('Job Expiration Queue', 'disabled', 'Requires Redis');
    registerService('Matching Queue', 'disabled', 'Requires Redis');
    registerService('Profile Reminder Queue', 'disabled', 'Requires Redis');
    registerService('Resume Parse Queue', 'disabled', 'Requires Redis');
    registerService('Scheduled Publish Queue', 'disabled', 'Requires Redis');
    registerService('SLA Check Queue', 'disabled', 'Requires Redis');
    registerService('Token Cleanup Queue', 'disabled', 'Requires Redis');
    registerService('Weekly Digest Queue', 'disabled', 'Requires Redis');
  }

  // ═══════════════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════

  // Docker / Kubernetes runtime detection
  const fs = await import('fs');
  const path = await import('path');
  const rootDir = path.resolve(__dirname, '../..');
  const isDocker = fs.existsSync('/.dockerenv') || process.env.CONTAINER === 'true';
  const isKubernetes = !!process.env.KUBERNETES_SERVICE_HOST;
  const isContainerRuntime = isDocker || isKubernetes;

  if (isKubernetes) {
    registerService('Docker', 'ready', 'Running in K8s pod');
  } else if (isDocker) {
    registerService('Docker', 'ready', 'Running in container');
  } else if (
    fs.existsSync(path.join(rootDir, 'Dockerfile')) ||
    fs.existsSync(path.join(rootDir, 'Dockerfile.dev'))
  ) {
    registerService('Docker', 'ready', 'Dockerfile found');
  } else {
    registerService('Docker', 'not_configured');
  }

  // Nginx
  if (isKubernetes) {
    // In K8s, nginx runs as a separate pod/service — probe it
    try {
      const http = await import('http');
      await new Promise<void>((resolve, reject) => {
        const req = http.get('http://nginx:80/', { timeout: 3000 }, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      registerService('Nginx', 'connected', 'K8s service (nginx:80)');
    } catch {
      registerService('Nginx', 'ready', 'K8s nginx-ingress');
    }
  } else if (isDocker) {
    registerService('Nginx', 'ready', 'Reverse proxy (separate container)');
  } else if (fs.existsSync(path.join(rootDir, 'nginx', 'nginx.conf'))) {
    registerService('Nginx', 'ready', 'Reverse proxy config');
  } else {
    registerService('Nginx', 'not_configured');
  }

  // Husky Git Hooks
  if (isContainerRuntime) {
    registerService('Husky Git Hooks', 'ready', 'Dev-only (CI enforced)');
  } else if (fs.existsSync(path.join(rootDir, '.husky'))) {
    registerService('Husky Git Hooks', 'ready', 'Pre-commit hooks');
  } else {
    registerService('Husky Git Hooks', 'not_configured');
  }

  // Prisma ORM
  if (fs.existsSync(path.join(rootDir, 'prisma', 'schema.prisma'))) {
    registerService('Prisma ORM', 'ready', 'Schema + migrations');
  } else {
    registerService('Prisma ORM', 'not_configured');
  }

  // Display status dashboard
  displayStartupStatus();
};

/**
 * Gracefully shutdown all services
 */
export const shutdownServices = async (): Promise<void> => {
  displayShutdownStatus();

  // Prisma
  try {
    const { disconnectPrisma } = await import('./prisma');
    await disconnectPrisma();
    logServiceShutdown('PostgreSQL (Prisma)');
  } catch (error) {
    logger.error('Error disconnecting Prisma:', error);
  }

  // Redis
  if (env.REDIS_ENABLED === 'true') {
    try {
      const { redis } = await import('./redis');
      redis.disconnect();
      logServiceShutdown('Redis');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
    }
  }

  // Kafka Producer (consumers are stopped by WorkerLeaderManager)
  try {
    const { producer } = await import('./kafka');
    if (producer) {
      await producer.disconnect();
    }
    logServiceShutdown('Kafka');
  } catch {
    // Kafka may not be connected
  }

  // Socket.IO
  logServiceShutdown('Socket.IO');

  logger.info('─'.repeat(45));
  logger.info('All services shut down.');
};

export default { initializeServices, shutdownServices };
