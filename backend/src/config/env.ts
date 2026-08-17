import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000'),
    /**
     * Reverse-proxy hops Express should trust when deriving the client IP.
     *
     * Read directly from process.env by app.ts and socket.ts before this was
     * declared, so it was neither validated nor discoverable here. It decides
     * which address rate limiting and the DDoS guard attribute a request to --
     * set it too high and a spoofed header picks the identity, too low and every
     * user shares the proxy's address.
     */
    TRUST_PROXY_HOPS: z.string().default('1'),
    /** Grace period for in-flight work during shutdown, before the force exit. */
    SHUTDOWN_TIMEOUT_MS: z.string().default('25000'),
    /**
     * Wall-clock budget for one retention-prune pass, in ms.
     *
     * Named in a warning the prune itself emits when it runs out of budget, so it
     * has to be findable here rather than only in that log line.
     */
    WA_PRUNE_BUDGET_MS: z.string().default('300000'),
    /**
     * How far back full-text message search looks, in days. Bounds the trigram
     * scan on the largest table in the module.
     */
    WA_MESSAGE_SEARCH_WINDOW_DAYS: z.string().default('90'),
    /** Minutes without a webhook before the channel is reported as stale. */
    WA_WEBHOOK_STALE_MINUTES: z.string().default('120'),
    /**
     * Injected by Render on every deploy; used to tag the Sentry release.
     * Declared so it is discoverable and validated, not because we set it.
     */
    RENDER_GIT_COMMIT: z.string().optional(),

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

    // BullMQ. Only the concurrencies are settable: retry depth and job retention
    // are per-queue decisions made in the queue modules (see config/redis.ts),
    // and the four BULLMQ_DEFAULT_JOB_OPTIONS_* / BULLMQ_REMOVE_ON_* vars that
    // once appeared to control them were read by nothing.
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
    /*
     * There is deliberately NO R2_PUBLIC_URL here.
     *
     * The bucket holds every archived inbound WhatsApp attachment — customer
     * photos, ID documents, invoices — and the app guards those behind the app
     * password and `streamMedia`'s enumeration check. Naming a public base URL
     * for the bucket (this deployment used a Cloudflare `*.r2.dev` development
     * domain, which serves it anonymously) puts a second, unauthenticated door
     * on the same data. Reads go through the backend; anything that truly needs
     * a direct browser fetch mints a short-lived signed URL.
     */

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
    /** Label stamped onto createdBy / actorUserId for APP_PASSWORD. Defaults to 'operator'. */
    OPERATOR_LABEL: z.string().optional(),
    /**
     * Named operators: `alice:password-one,bob:password-two`.
     *
     * One password per person, so "who replied to this customer", "who exported
     * the contact list" and "who launched that campaign" have answers. The label
     * is decided by WHICH password unlocked the session and signed into the
     * token (middleware/app-password.ts) — never asserted by the caller — and is
     * what `createdBy`, `actorUserId` and `assignedTo` are stamped with.
     *
     * It also makes revocation per-person: delete a leaver's entry and their
     * outstanding sessions stop verifying, instead of bumping SESSION_EPOCH and
     * signing out the whole team.
     *
     * A password runs to the next comma, so it may contain colons and spaces but
     * not a comma. APP_PASSWORD stays valid alongside these and keeps stamping
     * OPERATOR_LABEL; leave this unset and nothing about the module changes.
     */
    OPERATOR_PASSWORDS: z.string().optional(),
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
    /**
     * RSA private key (PEM) for WhatsApp Flows data-exchange.
     *
     * Only needed for ENDPOINT-BACKED (dynamic) flows — the ones that call back
     * between screens to look something up or validate an entry. Static flows
     * need nothing here. Meta holds the matching public key; requests are
     * RSA-OAEP + AES-128-GCM and are refused outright when this is unset, rather
     * than falling back to anything unencrypted.
     */
    WA_FLOW_PRIVATE_KEY: z.string().optional(),
    WA_FLOW_KEY_PASSPHRASE: z.string().optional(),
    /**
     * Public origin that campaign short links resolve against, e.g.
     * https://api.example.com — the `/l/:code` redirect lives on THIS service.
     *
     * The UI used to build the link from `window.location.origin`, which is the
     * FRONTEND origin on a split deploy. Every tracked link therefore pointed at
     * a host with no /l/ route, and the frontend's own gate bounced the visitor
     * to /unlock. Left unset, the backend derives the origin from the incoming
     * request, which is correct for a normal single-origin or proxied setup.
     */
    PUBLIC_SHORT_LINK_BASE: z.string().url().optional(),
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
     * Bearer token a metrics scraper presents at /metrics.
     *
     * /metrics sits behind requireAppPassword, which refuses the X-App-Password
     * header outright once MFA is enabled — so enabling 2FA silently took the
     * Prometheus scrape offline, and the only documented way back was
     * ALLOW_PASSWORD_HEADER_WITH_MFA=true, which re-opens single-factor access to
     * EVERY operator route just to keep a dashboard alive. A dedicated,
     * scope-limited credential is the right trade.
     */
    METRICS_TOKEN: z.string().min(20).optional(),
    /**
     * API key a website / CRM presents to report a conversion server-to-server.
     *
     * Deliberately NOT the app password. Conversions could only be recorded
     * through the operator console, so reporting one from a checkout page meant
     * handing that page the single credential that unlocks the entire module —
     * which nobody does, so in practice conversions were never recorded and the
     * ROI figures stayed at zero.
     *
     * The ingest route fails closed when this is unset: an unset key must never
     * mean "anyone may post conversions".
     */
    WA_CONVERSION_API_KEY: z.string().min(24).optional(),
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
    // Pinned Graph version. v22.0 is the floor for the Block Users API
    // (/{phone-number-id}/block_users), which is what makes a contact block stop
    // INBOUND messages rather than only our own replies; every other endpoint
    // this module calls behaves identically on it.
    META_WHATSAPP_API_VERSION: z.string().default('v22.0'),
    // How many BATCH JOBS one worker runs at once. Left at 1: the parallelism
    // that matters is inside a batch (WHATSAPP_CAMPAIGN_SEND_CONCURRENCY below),
    // and running whole batches side by side multiplies the counter-recompute
    // and completion work at the tail of each one for nothing.
    WHATSAPP_CAMPAIGN_CONCURRENCY: z.string().default('1'),
    // Sends in flight at once WITHIN one batch. The real per-number ceiling is
    // the campaign's own throttlePerSec, enforced cluster-wide in Redis, so this
    // only has to be wide enough to keep that ceiling reachable across the Graph
    // round trip (~200-400ms). At 1 — which is what a strictly serial batch
    // amounted to — a campaign sent 2-5 messages/second no matter what the
    // operator configured. Raise it only alongside the database connection pool:
    // each in-flight send holds a connection for its writes.
    WHATSAPP_CAMPAIGN_SEND_CONCURRENCY: z.string().default('8'),
    // Per-number send ceiling applied to sends that are not campaign-throttled
    // (send-later dispatch). Kept below Meta's default 80/s throughput.
    WHATSAPP_DEFAULT_THROTTLE_PER_SEC: z.string().default('15'),
    WHATSAPP_PRICE_MARKETING_PAISE: z.string().default('78'), // est. per-message cost for campaign cost preview
    WHATSAPP_PRICE_UTILITY_PAISE: z.string().default('30'),
    WHATSAPP_PRICE_AUTH_PAISE: z.string().default('30'),
    WHATSAPP_OPT_OUT_KEYWORDS: z.string().default('STOP,UNSUBSCRIBE,CANCEL'),
    WHATSAPP_OPT_IN_KEYWORDS: z.string().default('START,UNSTOP,SUBSCRIBE,RESUME'),
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
    /**
     * Key id stamped into every value FIELD_ENCRYPTION_KEY encrypts.
     *
     * Ciphertext is stored as `keyId:iv:tag:data`, so each row records which
     * key wrote it. Bump this (v1 -> v2) in the same deploy that changes
     * FIELD_ENCRYPTION_KEY and move the OLD key into FIELD_ENCRYPTION_KEYS, so
     * existing rows stay readable until `npm run reencrypt` has walked them.
     */
    FIELD_ENCRYPTION_KEY_ID: z
      .string()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/,
        'FIELD_ENCRYPTION_KEY_ID must be a short label such as "v2"'
      )
      .default('v1'),
    /**
     * Retired encryption keys, so a rotation does not orphan stored data: a
     * JSON map of key id -> 64-char hex key, e.g. {"v1":"<previous key>"}.
     *
     * Reads try the named key; anything written before key ids existed is tried
     * against the current key and then each of these. Drop an entry only once
     * `npm run reencrypt` reports zero rows left on it — a value here is the
     * only thing standing between a rotation and unreadable consent evidence,
     * note bodies and TOTP seeds.
     */
    FIELD_ENCRYPTION_KEYS: z.string().optional(),

    // Centralized Log Aggregation
    LOG_AGGREGATION_URL: z.string().optional(),
    LOG_AGGREGATION_TOKEN: z.string().optional(),

    /**
     * Error tracking. Optional in every environment — with no DSN the
     * exception funnel (utils/whatsapp-metrics.ts) only writes its log line,
     * which is exactly the behaviour that existed before, so nothing breaks
     * when it is unset.
     */
    SENTRY_DSN: z.string().optional(),
    /**
     * Environment name events are tagged with. Defaults to NODE_ENV; set it
     * only when several deployments share one Sentry project and a staging
     * blow-up would otherwise be indistinguishable from a production one.
     */
    SENTRY_ENVIRONMENT: z.string().optional(),
    /**
     * Release identifier — a git SHA is ideal. Without one, every issue reads
     * as "first seen: forever ago" and a regression introduced by today's
     * deploy looks identical to a bug that has been there for months. On
     * Render this is picked up from RENDER_GIT_COMMIT automatically.
     */
    SENTRY_RELEASE: z.string().optional(),
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
  })
  /**
   * Encryption key-map consistency, in EVERY environment rather than production
   * only: a key map that disagrees with the write key orphans rows on a laptop
   * exactly as thoroughly as on a server, and the damage only becomes visible
   * much later, at read time, on data nobody can recover.
   *
   * The id pattern is repeated in utils/encryption.ts, which parses the same
   * map at read time; that module imports this one, so the constant cannot be
   * shared without a cycle.
   */
  .superRefine((cfg, ctx) => {
    if (!cfg.FIELD_ENCRYPTION_KEYS) return;

    const reject = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['FIELD_ENCRYPTION_KEYS'], message });

    let parsed: unknown;
    try {
      parsed = JSON.parse(cfg.FIELD_ENCRYPTION_KEYS);
    } catch {
      reject('FIELD_ENCRYPTION_KEYS must be JSON: {"v1":"<64-char hex key>"}');
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      reject('FIELD_ENCRYPTION_KEYS must be a JSON object mapping key id -> 64-char hex key');
      return;
    }

    for (const [id, key] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id)) {
        reject(`FIELD_ENCRYPTION_KEYS key id "${id}" must be a short label such as "v1"`);
      } else if (typeof key !== 'string' || !/^[0-9a-fA-F]{64}$/.test(key)) {
        reject(`FIELD_ENCRYPTION_KEYS["${id}"] must be a 64-char hex string (32 bytes)`);
      } else if (id === cfg.FIELD_ENCRYPTION_KEY_ID && key !== cfg.FIELD_ENCRYPTION_KEY) {
        // The id exists to name exactly one key. If the map redefines the id
        // that new rows are being stamped with, those rows are readable only
        // until something restarts and resolves the id through the map - the
        // silent orphaning this whole mechanism is here to prevent.
        reject(
          `FIELD_ENCRYPTION_KEYS["${id}"] is not FIELD_ENCRYPTION_KEY, but "${id}" is the ` +
            'current FIELD_ENCRYPTION_KEY_ID - give the new key its own id instead'
        );
      }
    }
  })
  /**
   * The operator roster, validated in EVERY environment rather than production
   * only: a typo here is not a degraded feature, it is a person who cannot sign
   * in — or, worse, a credential that silently is not the one they were given.
   *
   * middleware/app-password.ts parses the same string at request time and drops
   * whatever fails these rules, so a mistake never becomes a working-but-wrong
   * login. The rules are repeated rather than imported because that module
   * imports this one, and sharing them would be a cycle.
   */
  .superRefine((cfg, ctx) => {
    if (!cfg.OPERATOR_PASSWORDS) return;

    const reject = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['OPERATOR_PASSWORDS'], message });

    // OPERATOR_LABEL and APP_PASSWORD are the shared account, and it competes
    // for the same label and password space as everyone else.
    const labels = new Set<string>([cfg.OPERATOR_LABEL || 'operator']);
    const passwords = new Set<string>(cfg.APP_PASSWORD ? [cfg.APP_PASSWORD] : []);

    cfg.OPERATOR_PASSWORDS.split(',').forEach((entry, index) => {
      const trimmed = entry.trim();
      if (!trimmed) return;

      const colon = trimmed.indexOf(':');
      if (colon <= 0) {
        // Never echo the entry: an entry missing its colon is usually a bare
        // password, and this message ends up in a boot log.
        reject(`OPERATOR_PASSWORDS entry ${index + 1} must be "label:password"`);
        return;
      }

      const label = trimmed.slice(0, colon).trim();
      const password = trimmed.slice(colon + 1);

      if (!/^[A-Za-z0-9_-]{1,32}$/.test(label)) {
        reject(
          `OPERATOR_PASSWORDS entry ${index + 1} has an unusable label - 1-32 characters of ` +
            'A-Z a-z 0-9 _ - only, because it is signed into the session token'
        );
      } else if (labels.has(label)) {
        reject(
          `OPERATOR_PASSWORDS names "${label}" twice (OPERATOR_LABEL counts as one) - ` +
            'the audit trail could not tell the two apart'
        );
      } else {
        labels.add(label);
      }

      if (password.length < 16) {
        reject(
          `OPERATOR_PASSWORDS entry ${index + 1} has a password shorter than 16 characters - ` +
            'it unlocks everything APP_PASSWORD does'
        );
      } else if (passwords.has(password)) {
        reject(
          `OPERATOR_PASSWORDS entry ${index + 1} reuses a password (APP_PASSWORD counts as one) ` +
            '- whoever signed in with it would be attributed to whichever entry matched first'
        );
      } else {
        passwords.add(password);
      }
    });
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Helper to get numeric values

export type Env = z.infer<typeof envSchema>;
