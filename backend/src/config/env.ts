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
    /**
     * Direct (non-pooled) connection, for the Prisma CLI only.
     *
     * Optional: prisma.config.js resolves `DIRECT_URL || DATABASE_URL`, so an
     * unset value falls back correctly for a plain Postgres. It is REQUIRED
     * whenever DATABASE_URL points at a transaction pooler — Supabase's 6543,
     * PgBouncer, Neon's pooled host — because `db push` and `migrate` cannot run
     * through one.
     *
     * Declared here so it is validated and discoverable. The host platform kept
     * a DIRECT_URL in its docker env that no code ever read, and a
     * DATABASE_SSL_MODE in env.ts with zero consumers; both looked configured
     * and configured nothing.
     */
    DIRECT_URL: z.string().optional(),
    DATABASE_POOL_SIZE: z.string().default('10'),
    DATABASE_POOL_TIMEOUT: z.string().default('10'),
    /**
     * TLS for the database connection.
     *
     * `require` encrypts but does NOT verify the server certificate;
     * `verify-full` also checks it, which is what actually defends against an
     * active man-in-the-middle. `disable` is for a local Postgres only.
     *
     * Defaults to `require` because every managed provider mandates TLS and
     * most present certificates that a bare Node client cannot chain-verify
     * without their CA bundle.
     */
    DATABASE_SSL_MODE: z
      .enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])
      .default('require'),

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
    /**
     * Comma-separated allowed origins. `*` means "reflect whatever origin asked"
     * — which, combined with `credentials: true`, is the browser-accepted form of
     * wildcard-with-credentials and voids the premise the CSRF design is written
     * on (only allowed origins can read /api/csrf-token). Fine locally; refused
     * in production by the superRefine below.
     */
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
     * Session generation. Mixed into the unlock token's HMAC message, so
     * incrementing it invalidates every outstanding cookie and socket
     * immediately — without changing APP_PASSWORD, which the whole team knows.
     *
     * Bump this when someone leaves, a device is lost, or a token may have
     * leaked. Operators simply unlock again with the same password.
     */
    /**
     * Cloudflare Turnstile — the bot check in front of the app password.
     * REQUIRED in production (see the superRefine below); without it the one
     * credential in the system is defended by rate limiting alone.
     *
     * Local development: Cloudflare's always-passes test key is
     *   1x0000000000000000000000000000000AA
     * and the matching frontend site key is 1x00000000000000000000AA.
     */
    CF_TURNSTILE_SECRET_KEY: z.string().optional(),
    SESSION_EPOCH: z.string().default('1'),
    /**
     * Absolute session lifetime in seconds (default 12h). Signed INTO the unlock
     * token, so the server enforces it — the cookie's own maxAge is only a hint
     * to the browser. Keep the frontend's NEXT_PUBLIC/SESSION_MAX_AGE_SECONDS in
     * step so the cookie expires at the same moment the token does.
     */
    SESSION_MAX_AGE_SECONDS: z.string().default('43200'),
    /**
     * Allow the X-App-Password header to authenticate even when MFA is enabled.
     *
     * Default false, because the header is checked against APP_PASSWORD directly
     * and would otherwise be a complete second-factor bypass for API callers.
     * Set to 'true' only if a script genuinely needs single-factor access, and
     * know that it re-opens that hole.
     */
    ALLOW_PASSWORD_HEADER_WITH_MFA: z.string().default('false'),
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
    /**
     * 100 was a public-site default and is far too low here. This is an internal
     * console: every operator's traffic arrives through the same BFF egress
     * address, so they share one bucket, and a single open inbox tab spends
     * requests continuously (conversation list, unread badge, thread polling).
     * The real burst protection is ddosProtection(); this is the slow ceiling.
     */
    RATE_LIMIT_MAX_REQUESTS: z.string().default('2000'),
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
  })
  /**
   * Production preflight.
   *
   * Every credential below is `.optional()` because local development and the
   * test suite legitimately run without them. In production they are not
   * optional at all — and each one fails *late* and *quietly*: no APP_PASSWORD
   * and requireAppPassword fails closed on every request (the console looks
   * broken, not misconfigured); no META_WHATSAPP_TOKEN and every send fails at
   * the Graph call; no META_WHATSAPP_APP_SECRET and every inbound webhook is
   * rejected as unsigned, so the inbox just stays empty.
   *
   * A missing variable should stop the deploy, not produce a green instance
   * that silently does nothing. The parse failure below already exits(1).
   *
   * The schema also carried four cross-field refinements that were removed with
   * the systems they guarded (RS256 JWT key pairing, Firebase service-account
   * JSON, SUPER_ADMIN_EMAIL/PASSWORD, a production CF_TURNSTILE_SECRET_KEY).
   */
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV !== 'production') return;

    const required: Array<[keyof typeof cfg, string]> = [
      ['APP_PASSWORD', 'the only credential protecting the console'],
      ['META_WHATSAPP_TOKEN', 'required to send anything via the Cloud API'],
      ['META_WHATSAPP_PHONE_ID', 'required to send anything via the Cloud API'],
      ['META_WHATSAPP_APP_SECRET', 'webhook signature verification fails closed without it'],
      ['META_WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'Meta cannot complete the webhook handshake'],
      ['BFF_SECRET', 'the frontend proxy cannot authenticate to this API'],
    ];

    for (const [key, why] of required) {
      if (!cfg[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key as string],
          message: `${String(key)} is required in production - ${why}`,
        });
      }
    }

    if (cfg.CORS_ORIGIN === '*') {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message:
          "CORS_ORIGIN must not be '*' in production - with credentials enabled it " +
          'reflects any origin, which defeats the CSRF protection. Set it to the ' +
          "frontend's origin (comma-separated for several).",
      });
    }

    if (!cfg.CF_TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['CF_TURNSTILE_SECRET_KEY'],
        message:
          'CF_TURNSTILE_SECRET_KEY is required in production - without it the app ' +
          'password has no bot protection in front of it, only rate limiting.',
      });
    }

    if (!cfg.FIELD_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIELD_ENCRYPTION_KEY'],
        message:
          'FIELD_ENCRYPTION_KEY is required in production - without it, opt-in ' +
          'evidence and operator notes about customers are written to the database ' +
          'in plaintext, silently.',
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

export type Env = z.infer<typeof envSchema>;
