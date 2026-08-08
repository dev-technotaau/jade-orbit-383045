import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000'),

    // Database
    DATABASE_URL: z.string(),
    DATABASE_POOL_SIZE: z.string().default('10'),
    DATABASE_POOL_TIMEOUT: z.string().default('10'),

    // CSRF
    CSRF_SECRET: z.string().min(32),

    // BFF (Backend-For-Frontend) — shared secret for Next.js API route proxying
    BFF_SECRET: z.string().min(32).optional(),

    // Cookie maxAge (days) — controls how long auth cookies persist in the browser
    COOKIE_ACCESS_MAX_AGE_DAYS: z.string().default('7'),
    COOKIE_REFRESH_MAX_AGE_DAYS: z.string().default('30'),

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
    BULLMQ_WHATSAPP_CONCURRENCY: z.string().default('10'),
    BULLMQ_WEBHOOK_CONCURRENCY: z.string().default('5'),
    BULLMQ_SCHEDULER_CONCURRENCY: z.string().default('2'),
    SMTP_SECURE: z.string().default('false'),
    EMAIL_MAX_SEND_PER_HOUR: z.string().default('100'),
    EMAIL_MAX_SEND_PER_DAY: z.string().default('300'),

    // File Upload
    UPLOAD_MAX_SIZE: z.string().default('5242880'), // 5MB

    // Frontend URL (for CORS)
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().default('*'),

    // Sentry
    SENTRY_DSN: z.string().optional(),

    // Cloudflare R2
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default('talent-bridge-resumes'),
    R2_PUBLIC_URL: z.string().optional(),

    // Cloudflare Turnstile
    CF_TURNSTILE_SECRET_KEY: z.string().optional(),
    MFA_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    // Breach Detection
    HIBP_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    /**
     * The single shared secret gating this module.
     *
     * There are no user accounts, roles or sessions — `requireAppPassword`
     * (middleware/app-password.ts) compares this against an HMAC cookie or an
     * X-App-Password header. Optional in the schema so local tooling and tests
     * can boot without it, but the middleware FAILS CLOSED when it is absent:
     * an unset password must never mean "everyone is allowed".
     *
     * Min length is a deliberate floor — this is the only credential there is.
     */
    APP_PASSWORD: z.string().min(16).optional(),
    /** Optional label stamped onto createdBy / actorUserId. Defaults to 'operator'. */
    OPERATOR_LABEL: z.string().optional(),
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
    WHATSAPP_CAMPAIGN_CONCURRENCY: z.string().default('1'),
    WHATSAPP_PRICE_MARKETING_PAISE: z.string().default('78'), // est. per-message cost for campaign cost preview
    WHATSAPP_PRICE_UTILITY_PAISE: z.string().default('30'),
    WHATSAPP_PRICE_AUTH_PAISE: z.string().default('30'),
    WHATSAPP_OPT_OUT_KEYWORDS: z.string().default('STOP,UNSUBSCRIBE,CANCEL'),
    WHATSAPP_CHATWOOT_BRIDGE_ENABLED: z.string().default('false'), // Phase 6 Chatwoot bridge
    CHATWOOT_BASE_URL: z.string().optional(), // self-hosted Chatwoot base URL
    CHATWOOT_BRIDGE_SECRET: z.string().optional(), // gates the outbound send-proxy
    CHATWOOT_INBOUND_PHONE: z.string().optional(), // phone segment for Chatwoot's /webhooks/whatsapp/{phone}

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
    SUPER_ADMIN_PASSWORD: z
      .string()
      .min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters')
      .optional(),

    // OpenTelemetry
    OTEL_ENABLED: z.string().default('true'),
    OTEL_SERVICE_NAME: z.string().default('hire-adda-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318/v1/traces'),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),

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

    // ============================================================
    // Razorpay Payment Suite
    // ============================================================
    // All optional — if any is missing the billing system degrades
    // gracefully. Required for production billing flows.
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
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
    HA_BILLING_STATE_CODE: z.string().optional(), // 2-digit GST code
    HA_GST_INCLUSIVE_PRICING: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    HA_E_INVOICE_REQUIRED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    BILLING_FRAUD_ENABLED: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    BILLING_BIGQUERY_SYNC_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
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
