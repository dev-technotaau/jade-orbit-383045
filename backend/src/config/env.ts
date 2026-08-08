import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000'),
    COOKIE_SECRET: z.string().min(32),

    // Database
    DATABASE_URL: z.string(),
    DATABASE_POOL_SIZE: z.string().default('10'),
    DATABASE_POOL_TIMEOUT: z.string().default('10'),

    // CSRF
    CSRF_SECRET: z.string().min(32),

    // BFF (Backend-For-Frontend) — shared secret for Next.js API route proxying
    BFF_SECRET: z.string().min(32).optional(),

    // Public-facing canonical URL — drives sitemap absolutes, IndexNow
    // host token, deep-link generators. Same value the frontend uses
    // for NEXT_PUBLIC_APP_URL.
    NEXT_PUBLIC_APP_URL: z.string().default('https://hireadda.in'),

    // IndexNow site key (32+ char URL-safe). Defaults to the dev-mode
    // key so non-prod deploys still produce valid payloads (which the
    // service guards against actually submitting).
    INDEXNOW_KEY: z.string().default('c43d83f87126d18729b99c85048ac0f8'),

    // Cookie maxAge (days) — controls how long auth cookies persist in the browser
    COOKIE_ACCESS_MAX_AGE_DAYS: z.string().default('7'),
    COOKIE_REFRESH_MAX_AGE_DAYS: z.string().default('30'),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('RS256'),
    // For RS256 — required when JWT_ALGORITHM=RS256 (validated via superRefine below)
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),

    // Redis
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().default('6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_TLS: z.string().default('false'),
    REDIS_URL: z.string().optional(),
    REDIS_ENABLED: z.string().default('true'),

    // BullMQ
    BULLMQ_DEFAULT_JOB_OPTIONS_ATTEMPTS: z.string().default('3'),
    BULLMQ_DEFAULT_JOB_OPTIONS_BACKOFF: z.string().default('1000'),
    BULLMQ_REMOVE_ON_COMPLETE: z.string().default('100'),
    BULLMQ_REMOVE_ON_FAIL: z.string().default('500'),

    // BullMQ Worker Concurrency
    BULLMQ_EMAIL_CONCURRENCY: z.string().default('5'),
    BULLMQ_SMS_CONCURRENCY: z.string().default('5'),
    BULLMQ_FCM_CONCURRENCY: z.string().default('5'),
    BULLMQ_WHATSAPP_CONCURRENCY: z.string().default('10'),
    BULLMQ_WEBPUSH_CONCURRENCY: z.string().default('5'),
    BULLMQ_INAPP_CONCURRENCY: z.string().default('10'),
    BULLMQ_WEBHOOK_CONCURRENCY: z.string().default('5'),
    BULLMQ_MATCHING_CONCURRENCY: z.string().default('3'),
    BULLMQ_GEOCODING_CONCURRENCY: z.string().default('1'),
    BULLMQ_RESUME_PARSE_CONCURRENCY: z.string().default('2'),
    BULLMQ_ES_REINDEX_CONCURRENCY: z.string().default('3'),
    BULLMQ_SCHEDULER_CONCURRENCY: z.string().default('2'),
    BULLMQ_ONBOARDING_DRIP_CONCURRENCY: z.string().default('3'),
    BULLMQ_IMAGE_PROCESSING_CONCURRENCY: z.string().default('2'),
    BULLMQ_FOLLOWER_NOTIFY_CONCURRENCY: z.string().default('5'),
    BULLMQ_REVIEW_AGGREGATE_CONCURRENCY: z.string().default('5'),

    // Email
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_REPLY_TO: z.string().optional(),
    SMTP_FROM_NAME: z.string().default('Hire Adda'),
    SMTP_SECURE: z.string().default('false'),
    EMAIL_MAX_SEND_PER_HOUR: z.string().default('100'),
    EMAIL_MAX_SEND_PER_DAY: z.string().default('300'),

    // Email — bulk campaign system (super-admin) + tracking + IMAP inbound (new)
    EMAIL_CAMPAIGN_RATE_PER_SEC: z.string().default('20'),
    BULLMQ_EMAIL_CAMPAIGN_CONCURRENCY: z.string().default('1'),
    EMAIL_TRACKING_BASE_URL: z.string().optional(), // e.g. https://api.hireadda.in
    EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(), // HMAC secret for unsubscribe/tracking tokens
    EMAIL_BOUNCE_DOMAIN: z.string().optional(), // VERP return-path domain, e.g. bounce.hireadda.in
    IMAP_HOST: z.string().optional(),
    IMAP_PORT: z.string().default('993'),
    IMAP_USER: z.string().optional(),
    IMAP_PASS: z.string().optional(),
    IMAP_SECURE: z.string().default('true'),
    EMAIL_BOUNCE_MAILBOX: z.string().default('INBOX'),
    EMAIL_REPLIES_MAILBOX: z.string().default('INBOX'),
    IMAP_POLL_INTERVAL_MS: z.string().default('60000'),

    // File Upload
    UPLOAD_MAX_SIZE: z.string().default('5242880'), // 5MB
    UPLOAD_DIR: z.string().default('uploads'),

    // Frontend URL (for CORS)
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().default('*'),

    // Sentry
    SENTRY_DSN: z.string().optional(),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    // Cloudflare R2
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default('talent-bridge-resumes'),
    R2_PUBLIC_URL: z.string().optional(),

    // Cloudflare Turnstile
    CF_TURNSTILE_SECRET_KEY: z.string().optional(),

    // MFA Configuration
    MFA_ISSUER: z.string().default('HireAdda'),
    MFA_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    // WebAuthn (Passkeys)
    WEBAUTHN_RP_ID: z.string().default('localhost'),
    WEBAUTHN_RP_NAME: z.string().default('Hire Adda'),
    WEBAUTHN_ORIGIN: z.string().default('http://localhost:3000'),

    // Breach Detection
    HIBP_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    // Elasticsearch
    ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
    ELASTICSEARCH_USERNAME: z.string().optional(),
    ELASTICSEARCH_PASSWORD: z.string().optional(),
    ELASTICSEARCH_API_KEY: z.string().optional(),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().default('/api/auth/google/callback'),

    // LinkedIn OAuth
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_CALLBACK_URL: z.string().default('/api/auth/linkedin/callback'),

    // Google Cloud Platform
    GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
    GOOGLE_CLOUD_LOCATION_ID: z.string().default('us-central1'),
    DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
    CLOUD_TALENT_TENANT_ID: z.string().optional(),

    // Vertex AI (Gemini) — used by the resume-parser pipeline to turn
    // OCR'd resume text into structured candidate-profile fields.
    // Location is a *real* GCP region (us-central1, asia-south1, etc.)
    // separate from GOOGLE_CLOUD_LOCATION_ID which on Document AI can be
    // the multi-region pseudo-location 'us'. As of mid-2026 only the 2.5
    // family is GA in our project — 1.5/2.0 versions return 404. Pro for
    // accuracy; swap to gemini-2.5-flash for cheaper/faster batch.
    VERTEX_AI_LOCATION: z.string().default('us-central1'),
    VERTEX_AI_MODEL: z.string().default('gemini-2.5-pro'),

    // Google Analytics
    GA_MEASUREMENT_ID: z.string().optional(),
    GA_API_SECRET: z.string().optional(),

    // Firebase Cloud Messaging
    FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
    FIREBASE_DATABASE_URL: z.string().optional(),

    // Web Push (VAPID)
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    // SMS & WhatsApp
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),

    /**
     * API Key + Secret — Twilio's recommended credential for application use.
     * Preferred over the master Auth Token when both are present, because a
     * leaked key can be revoked in isolation without rotating the account
     * credential that every other integration also depends on.
     */
    TWILIO_API_KEY_SID: z.string().optional(),
    TWILIO_API_KEY_SECRET: z.string().optional(),

    /**
     * Messaging Service SID. Preferred over a bare `from` number: it owns the
     * sender pool, sticky sender and — for India — the DLT sender-ID and
     * content-template registration that unregistered A2P traffic is filtered
     * for. When set, `from` is omitted and Twilio picks the sender.
     */
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

    /**
     * Verify Service SID. When set, OTP delivery moves to Twilio Verify,
     * which owns code generation, expiry, attempt limiting and — critically
     * for India — ships pre-registered DLT templates so codes are not carrier
     * filtered. Unset = the app's own OTP + plain SMS path.
     */
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    /** Public URL Twilio POSTs delivery receipts to. Enables status tracking. */
    TWILIO_STATUS_CALLBACK_URL: z.string().optional(),

    /**
     * Seconds Twilio may keep trying before dropping the message. An OTP that
     * arrives after it expires is worse than one that never arrives — default
     * 600s matches the OTP validity window.
     */
    TWILIO_SMS_VALIDITY_PERIOD: z.string().default('600'),

    /** HTTP timeout for the Twilio client itself, in ms. */
    TWILIO_HTTP_TIMEOUT_MS: z.string().default('10000'),

    /** Optional Twilio region/edge pinning (e.g. `ie1` / `sydney`). */
    TWILIO_REGION: z.string().optional(),
    TWILIO_EDGE: z.string().optional(),

    /** Country calling code applied to numbers supplied without one. */
    DEFAULT_COUNTRY_CODE: z.string().default('91'),
    META_WHATSAPP_PHONE_ID: z.string().optional(),
    // Min length fail-fasts a truncated/garbled token at boot instead of silently
    // failing every Graph send at runtime (Meta tokens are long; app secrets 32-hex).
    META_WHATSAPP_TOKEN: z.string().min(20).optional(),
    // WhatsApp system (super-admin inbox + campaigns) — Cloud API webhook + management
    META_WHATSAPP_WABA_ID: z.string().optional(),
    META_WHATSAPP_APP_ID: z.string().optional(), // Meta App ID — resumable-upload session URL (media-header samples)
    META_WHATSAPP_APP_SECRET: z.string().min(16).optional(), // webhook X-Hub-Signature-256 HMAC
    META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(), // GET hub.challenge handshake
    META_WHATSAPP_API_VERSION: z.string().default('v21.0'), // pinned Graph version (bumped from v17.0)
    WHATSAPP_CAMPAIGN_BATCH_SIZE: z.string().default('100'),
    WHATSAPP_CAMPAIGN_THROTTLE_PER_SEC: z.string().default('15'),
    WHATSAPP_CAMPAIGN_CONCURRENCY: z.string().default('1'),
    WHATSAPP_PRICE_MARKETING_PAISE: z.string().default('78'), // est. per-message cost for campaign cost preview
    WHATSAPP_PRICE_UTILITY_PAISE: z.string().default('30'),
    WHATSAPP_PRICE_AUTH_PAISE: z.string().default('30'),
    WHATSAPP_OPT_OUT_KEYWORDS: z.string().default('STOP,UNSUBSCRIBE,CANCEL'),
    WHATSAPP_CHATWOOT_BRIDGE_ENABLED: z.string().default('false'), // Phase 6 Chatwoot bridge
    CHATWOOT_BASE_URL: z.string().optional(), // self-hosted Chatwoot base URL
    CHATWOOT_BRIDGE_SECRET: z.string().optional(), // gates the outbound send-proxy
    CHATWOOT_INBOUND_PHONE: z.string().optional(), // phone segment for Chatwoot's /webhooks/whatsapp/{phone}

    // SMS Cost Control — Essential SMS (OTP, security) always enabled
    // Transactional SMS (job matches, reminders) can be toggled
    ENABLE_TRANSACTIONAL_SMS: z.string().default('true'),

    // Apache Kafka
    KAFKA_BROKERS: z.string().default('localhost:9092'),
    KAFKA_CLIENT_ID: z.string().default(`hire-adda-${process.env.NODE_ENV || 'development'}`),
    KAFKA_USERNAME: z.string().optional(),
    KAFKA_PASSWORD: z.string().optional(),
    KAFKA_SASL_MECHANISM: z.string().default('plain'),

    // OTP Configuration
    OTP_EXPIRY_MINUTES: z.string().default('10'),
    OTP_LENGTH: z
      .string()
      .default('6')
      .refine((v) => {
        const n = parseInt(v, 10);
        return n >= 4 && n <= 8;
      }, 'OTP_LENGTH must be between 4 and 8'),
    OTP_MAX_RESEND_ATTEMPTS: z.string().default('5'),
    OTP_RESEND_COOLDOWN_SECONDS: z.string().default('60'),

    // Password Reset
    PASSWORD_RESET_EXPIRY_HOURS: z.string().default('1'),
    PASSWORD_RESET_MAX_ATTEMPTS: z.string().default('5'),

    // Account Security
    MAX_LOGIN_ATTEMPTS: z.string().default('5'),
    ACCOUNT_LOCK_DURATION_MINUTES: z.string().default('15'),
    SESSION_TIMEOUT_HOURS: z.string().default('24'),
    MAX_SESSIONS_PER_USER: z.string().default('5'),

    // Password Validation
    PASSWORD_MIN_LENGTH: z.string().default('8'),
    PASSWORD_MAX_LENGTH: z.string().default('128'),
    PASSWORD_REQUIRE_UPPERCASE: z.string().default('true'),
    PASSWORD_REQUIRE_LOWERCASE: z.string().default('true'),
    PASSWORD_REQUIRE_NUMBER: z.string().default('true'),
    PASSWORD_REQUIRE_SPECIAL: z.string().default('true'),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('900000'), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
    AUTH_RATE_LIMIT_WINDOW_MS: z.string().default('300000'), // 5 minutes
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.string().default('30'),

    // Logging
    LOG_LEVEL: z
      .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
      .default('info'),

    // Webhooks
    WEBHOOK_SECRET: z.string().min(32, 'WEBHOOK_SECRET must be at least 32 characters').optional(),
    WEBHOOK_CALLBACK_URL: z.string().optional(),

    // Super Admin
    SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email').optional(),
    SUPER_ADMIN_PASSWORD: z
      .string()
      .min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters')
      .optional(),

    // OpenTelemetry
    OTEL_ENABLED: z.string().default('true'),
    OTEL_SERVICE_NAME: z.string().default('hire-adda-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318/v1/traces'),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),

    // Geocoding
    GEOCODING_PROVIDER: z.enum(['nominatim', 'google']).default('nominatim'),
    NOMINATIM_BASE_URL: z.string().default('https://nominatim.openstreetmap.org'),
    NOMINATIM_USER_AGENT: z.string().default('HireAdda/1.0'),
    GOOGLE_GEOCODING_API_KEY: z.string().optional(),

    // Database Security
    DATABASE_SSL_MODE: z
      .enum(['disable', 'require', 'verify-ca', 'verify-full'])
      .default('require'),

    // Field-Level Encryption (AES-256-GCM, 32-byte hex key)
    FIELD_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
      .optional(),

    // Centralized Log Aggregation
    LOG_AGGREGATION_URL: z.string().optional(),
    LOG_AGGREGATION_TOKEN: z.string().optional(),

    // Backup Configuration
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
    OPENSEARCH_SNAPSHOT_REPO: z.string().default('hire_adda_repo'),

    // Admin PBAC — how long the admin activity feed is retained. This is
    // behavioural telemetry ("who did what recently"), not the compliance
    // record; AuditLog is the long-lived trail and is unaffected by this.
    ADMIN_ACTIVITY_RETENTION_DAYS: z.coerce.number().default(90),

    // ============================================================
    // Razorpay Payment Suite
    // ============================================================
    // All optional — if any is missing the billing system degrades
    // gracefully. Required for production billing flows.
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAY_API_BASE_URL: z.string().default('https://api.razorpay.com/v1'),
    RAZORPAY_DEFAULT_CURRENCY: z.string().default('INR'),
    RAZORPAY_PAYMENT_CAPTURE_AUTO: z
      .string()
      .default('false') // we capture from webhook handler
      .transform((v) => v === 'true'),
    RAZORPAY_INTERNATIONAL_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),

    // Razorpay subscription notify channels (used in checkout options)
    RAZORPAY_NOTIFY_EMAIL: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    RAZORPAY_NOTIFY_SMS: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),

    // ============================================================
    // Hire Adda billing identity (seller side — printed on invoices)
    // ============================================================
    HA_GSTIN: z.string().optional(),
    HA_LEGAL_NAME: z.string().default('Hire Adda'),
    HA_TRADE_NAME: z.string().default('Hire Adda'),
    HA_BILLING_LINE1: z.string().optional(),
    HA_BILLING_LINE2: z.string().optional(),
    HA_BILLING_CITY: z.string().optional(),
    HA_BILLING_STATE_NAME: z.string().optional(),
    HA_BILLING_STATE_CODE: z.string().optional(), // 2-digit GST code
    HA_BILLING_PINCODE: z.string().optional(),
    HA_BILLING_COUNTRY: z.string().default('India'),
    HA_PAN: z.string().optional(),
    HA_CIN: z.string().optional(),
    HA_UDYAM_NUMBER: z.string().optional(),
    HA_SUPPORT_EMAIL: z.string().optional(),
    HA_SUPPORT_PHONE: z.string().optional(),

    // ============================================================
    // Tax / GST / Invoice settings
    // ============================================================
    HA_HSN_SAC_CODE: z.string().default('998314'),
    HA_GST_RATE_PERCENT: z.coerce.number().default(18),
    HA_GST_INCLUSIVE_PRICING: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    HA_INVOICE_PREFIX: z.string().default('HA'),
    HA_FY_START_MONTH: z.coerce.number().default(4), // April
    HA_E_INVOICE_REQUIRED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    HA_E_INVOICE_API_URL: z.string().optional(),
    HA_E_INVOICE_USERNAME: z.string().optional(),
    HA_E_INVOICE_PASSWORD: z.string().optional(),
    HA_PLACE_OF_SUPPLY_DEFAULT_STATE: z.string().default('03'), // Punjab — Hire Adda HQ
    HA_GST_EXPORT_WITH_LUT: z.string().default('true'), // 0% on export-of-services when LUT filed; falls back to SystemConfig key gst.export.with_lut

    // ============================================================
    // Billing operational settings
    // ============================================================
    BILLING_REFUND_WINDOW_DAYS: z.coerce.number().default(2),
    BILLING_CUSTOM_OFFER_EXPIRY_DAYS: z.coerce.number().default(7),
    BILLING_AUTO_RENEW_RETRY_MAX: z.coerce.number().default(4),
    BILLING_GRACE_PERIOD_DAYS: z.coerce.number().default(3),
    BILLING_EMI_MIN_AMOUNT_PAISE: z.coerce.number().default(300000), // ₹3000
    BILLING_ORDER_EXPIRY_MINUTES: z.coerce.number().default(30),
    BILLING_INVOICE_PDF_RETENTION_DAYS: z.coerce.number().default(2555), // ~7 years
    BILLING_FRAUD_ENABLED: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    BILLING_FRAUD_MULTI_ACCOUNT_THRESHOLD: z.coerce.number().default(3),
    BILLING_FRAUD_VELOCITY_WINDOW_SECONDS: z.coerce.number().default(300),
    BILLING_FRAUD_VELOCITY_THRESHOLD: z.coerce.number().default(5),
    BILLING_BIGQUERY_SYNC_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    BILLING_BQ_DATASET: z.string().default('hire_adda_analytics'),
    BILLING_BQ_TABLE: z.string().default('billing_events'),

    // BullMQ concurrency for new billing queues
    BULLMQ_RAZORPAY_WEBHOOK_CONCURRENCY: z.string().default('5'),
    BULLMQ_BILLING_REMINDER_CONCURRENCY: z.string().default('5'),
    BULLMQ_BILLING_RETRY_CONCURRENCY: z.string().default('3'),
    BULLMQ_INVOICE_GEN_CONCURRENCY: z.string().default('2'),
    BULLMQ_SETTLEMENT_SYNC_CONCURRENCY: z.string().default('1'),
    BULLMQ_FRAUD_SCAN_CONCURRENCY: z.string().default('3'),
    BULLMQ_ENTITLEMENT_EXPIRY_CONCURRENCY: z.string().default('2'),
    BULLMQ_BIGQUERY_BILLING_CONCURRENCY: z.string().default('5'),
    BULLMQ_PAYMENT_STATUS_POLL_CONCURRENCY: z.string().default('2'),
  })
  .superRefine((data, ctx) => {
    // Turnstile must be configured in production. The middleware now fails
    // closed without it, so a missing key would take down every CAPTCHA-guarded
    // endpoint at request time — this turns that into a startup failure instead,
    // which is the loud, early version of the same signal.
    if (data.NODE_ENV === 'production' && !data.CF_TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        message: 'CF_TURNSTILE_SECRET_KEY is required in production',
        path: ['CF_TURNSTILE_SECRET_KEY'],
      });
    }

    // RS256 requires both private and public keys
    if (data.JWT_ALGORITHM === 'RS256') {
      if (!data.JWT_PRIVATE_KEY) {
        ctx.addIssue({
          code: 'custom',
          message: 'JWT_PRIVATE_KEY is required when JWT_ALGORITHM is RS256',
          path: ['JWT_PRIVATE_KEY'],
        });
      }
      if (!data.JWT_PUBLIC_KEY) {
        ctx.addIssue({
          code: 'custom',
          message: 'JWT_PUBLIC_KEY is required when JWT_ALGORITHM is RS256',
          path: ['JWT_PUBLIC_KEY'],
        });
      }
    }

    // Validate Firebase service account JSON if provided
    if (data.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const parsed = JSON.parse(data.FIREBASE_SERVICE_ACCOUNT);
        if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
          ctx.addIssue({
            code: 'custom',
            message:
              'FIREBASE_SERVICE_ACCOUNT JSON must contain project_id, private_key, and client_email',
            path: ['FIREBASE_SERVICE_ACCOUNT'],
          });
        }
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'FIREBASE_SERVICE_ACCOUNT must be valid JSON',
          path: ['FIREBASE_SERVICE_ACCOUNT'],
        });
      }
    }

    // Super admin: if email is set, password must also be set
    if (data.SUPER_ADMIN_EMAIL && !data.SUPER_ADMIN_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        message: 'SUPER_ADMIN_PASSWORD is required when SUPER_ADMIN_EMAIL is set',
        path: ['SUPER_ADMIN_PASSWORD'],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Helper to get numeric values
export const getPort = (): number => parseInt(env.PORT, 10);
export const getRedisPort = (): number => parseInt(env.REDIS_PORT, 10);
export const getMaxUploadSize = (): number => parseInt(env.UPLOAD_MAX_SIZE, 10);
export const isRedisTlsEnabled = (): boolean => env.REDIS_TLS === 'true';

// BullMQ helpers
export const getBullMQAttempts = (): number =>
  parseInt(env.BULLMQ_DEFAULT_JOB_OPTIONS_ATTEMPTS, 10);
export const getBullMQBackoff = (): number => parseInt(env.BULLMQ_DEFAULT_JOB_OPTIONS_BACKOFF, 10);
export const getBullMQRemoveOnComplete = (): number => parseInt(env.BULLMQ_REMOVE_ON_COMPLETE, 10);
export const getBullMQRemoveOnFail = (): number => parseInt(env.BULLMQ_REMOVE_ON_FAIL, 10);

// Security helpers
export const getOtpExpiryMinutes = (): number => parseInt(env.OTP_EXPIRY_MINUTES, 10);
export const getOtpLength = (): number => parseInt(env.OTP_LENGTH, 10);
export const getOtpMaxResendAttempts = (): number => parseInt(env.OTP_MAX_RESEND_ATTEMPTS, 10);
export const getOtpResendCooldown = (): number => parseInt(env.OTP_RESEND_COOLDOWN_SECONDS, 10);
export const getPasswordResetExpiryHours = (): number =>
  parseInt(env.PASSWORD_RESET_EXPIRY_HOURS, 10);
export const getMaxLoginAttempts = (): number => parseInt(env.MAX_LOGIN_ATTEMPTS, 10);
export const getAccountLockDuration = (): number => parseInt(env.ACCOUNT_LOCK_DURATION_MINUTES, 10);
export const getSessionTimeout = (): number => parseInt(env.SESSION_TIMEOUT_HOURS, 10);
export const getPasswordResetMaxAttempts = (): number =>
  parseInt(env.PASSWORD_RESET_MAX_ATTEMPTS, 10);
export const getMaxSessionsPerUser = (): number => parseInt(env.MAX_SESSIONS_PER_USER, 10);

// Password validation helpers
export const getPasswordMinLength = (): number => parseInt(env.PASSWORD_MIN_LENGTH, 10);
export const getPasswordMaxLength = (): number => parseInt(env.PASSWORD_MAX_LENGTH, 10);
export const getPasswordRequireUppercase = (): boolean => env.PASSWORD_REQUIRE_UPPERCASE === 'true';
export const getPasswordRequireLowercase = (): boolean => env.PASSWORD_REQUIRE_LOWERCASE === 'true';
export const getPasswordRequireNumber = (): boolean => env.PASSWORD_REQUIRE_NUMBER === 'true';
export const getPasswordRequireSpecial = (): boolean => env.PASSWORD_REQUIRE_SPECIAL === 'true';

// Email helpers
export const getEmailMaxSendPerHour = (): number => parseInt(env.EMAIL_MAX_SEND_PER_HOUR, 10);
export const getEmailMaxSendPerDay = (): number => parseInt(env.EMAIL_MAX_SEND_PER_DAY, 10);
export const isSmtpSecure = (): boolean => env.SMTP_SECURE === 'true';

// Rate Limit helpers
export const getRateLimitWindowMs = (): number => parseInt(env.RATE_LIMIT_WINDOW_MS, 10);
export const getRateLimitMaxRequests = (): number => parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10);
export const getAuthRateLimitWindowMs = (): number => parseInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 10);
export const getAuthRateLimitMaxAttempts = (): number =>
  parseInt(env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 10);

// ============================================================
// Razorpay / Billing helpers
// ============================================================
export const isRazorpayConfigured = (): boolean =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const isRazorpayWebhookConfigured = (): boolean => Boolean(env.RAZORPAY_WEBHOOK_SECRET);

export const isRazorpayLiveMode = (): boolean =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_ID.startsWith('rzp_live_'));

export const isHaGstConfigured = (): boolean => Boolean(env.HA_GSTIN && env.HA_BILLING_STATE_CODE);

export type Env = z.infer<typeof envSchema>;
