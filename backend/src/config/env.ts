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

    FRONTEND_URL: z.string().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().default('*'),




    // Cloudflare R2
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default('whatsapp-media'),
    R2_PUBLIC_URL: z.string().optional(),


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
    /**
     * Display name for the API's HTML pages (root, health, 404) and the OpenAPI
     * docs. The frontend has its own NEXT_PUBLIC_BRAND_NAME; keep them in sync.
     */
    BRAND_NAME: z.string().default('TechnoTaau'),
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

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('900000'), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
    AUTH_RATE_LIMIT_WINDOW_MS: z.string().default('300000'), // 5 minutes
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.string().default('30'),

    // Logging
    LOG_LEVEL: z
      .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
      .default('info'),


    // Field-Level Encryption (AES-256-GCM, 32-byte hex key)
    FIELD_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
      .optional(),

    // Centralized Log Aggregation
    LOG_AGGREGATION_URL: z.string().optional(),
    LOG_AGGREGATION_TOKEN: z.string().optional(),

  });

// The schema carried four cross-field refinements, all now gone with the
// systems they guarded: RS256 JWT key pairing, Firebase service-account JSON
// validation, SUPER_ADMIN_EMAIL/PASSWORD pairing, and a production requirement
// for CF_TURNSTILE_SECRET_KEY. Each read a key that no longer exists.

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Helper to get numeric values

export type Env = z.infer<typeof envSchema>;
