import { env } from './env';
import logger from './logger';
import {
  displayShutdownStatus,
  displayStartupStatus,
  logServiceShutdown,
  registerService,
} from './service-status';

/**
 * Text-search indexes Prisma cannot declare.
 *
 * Every search box in the module compiles to a leading-wildcard LIKE/ILIKE
 * (Prisma `contains`), and no btree index can answer one — so an inbox message
 * search was an unindexed scan of WaMessage, the largest table here, evaluated
 * once per candidate conversation under a 30s statement timeout: typing three
 * characters was a reliable way to stall the database. pg_trgm GIN is the one
 * index type that serves `%q%`.
 *
 * Raw DDL rather than `@@index(..., type: Gin)` in the schema, because the
 * operator classes need the pg_trgm extension and declaring THAT in Prisma is
 * still a preview feature — a fresh `db push` would fail on "operator class
 * gin_trgm_ops does not exist" before anything could create it.
 *
 * CONCURRENTLY, so a first boot against a populated database does not hold an
 * ACCESS EXCLUSIVE lock on WaMessage and park every send behind the build.
 * Re-checked on every boot on purpose: `db push` reconciles the database against
 * the Prisma schema and will drop indexes the schema does not declare, so these
 * have to be able to come back on their own after a deploy.
 */
/**
 * Indexes created at runtime rather than declared in `schema.prisma`.
 *
 * NOTE the name: these are not all trigram search indexes any more. The label
 * one is here for a different reason — see its own comment — but the mechanism
 * is the same, and so is the reason it has to be re-checked on every boot.
 */
const SEARCH_INDEXES: Array<{ name: string; ddl: string }> = [
  {
    name: 'wa_message_text_trgm',
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "wa_message_text_trgm" ON "WaMessage" USING gin ("text" gin_trgm_ops)',
  },
  {
    name: 'wa_contact_name_trgm',
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "wa_contact_name_trgm" ON "WaContact" USING gin ("name" gin_trgm_ops)',
  },
  {
    name: 'wa_contact_phone_trgm',
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "wa_contact_phone_trgm" ON "WaContact" USING gin ("phone" gin_trgm_ops)',
  },
  {
    /**
     * Label filtering on the inbox list (`labels: { hasSome: [...] }`).
     *
     * The ORDERED page is fine without it — `@@index([archivedAt, lastMessageAt
     * DESC])` serves the LIMIT 50. What degrades is the companion `count()` over
     * the whole filtered set, which has no such shortcut and re-runs on every
     * socket invalidation and every 60s poll while a label filter is active.
     *
     * Created here rather than as `@@index([labels], type: Gin)` for the same
     * reason as the three above: `db push` would build it holding an ACCESS
     * EXCLUSIVE lock on WaConversation, parking the whole inbox behind it.
     * `WaContact.tags` has the same GIN index, declared in the schema, from
     * before that lesson.
     */
    /**
     * The contacts list's default ordering.
     *
     * `orderBy: { createdAt: 'desc' }` had no index at all, so every page load
     * sorted the entire contact table — and the companion `count()` scans it
     * too. WaContact has six other declared indexes and never got the one its
     * own list query uses.
     *
     * Here rather than in the schema for the same reason as the two below it:
     * `db push` would build it holding an ACCESS EXCLUSIVE lock on the table
     * the whole console reads.
     */
    name: 'wa_contact_created_at',
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "wa_contact_created_at" ON "WaContact" ("createdAt" DESC)',
  },
  {
    name: 'wa_conversation_labels_gin',
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "wa_conversation_labels_gin" ON "WaConversation" USING gin ("labels")',
  },
];

/**
 * Create the pg_trgm extension and the search indexes above if they are missing.
 *
 * Reports rather than throws — like everything else in this file, it must never
 * be able to stop a boot. A deployment whose database role cannot CREATE
 * EXTENSION still runs; its searches are just as slow as they were before.
 */
/**
 * Build the search indexes AFTER the port is open.
 *
 * They are recreated on most boots because `prisma db push` drops anything the
 * schema does not declare, and these cannot be declared (gin_trgm_ops needs the
 * pg_trgm extension). Awaiting that rebuild before app.listen meant a large
 * WaMessage table could hold the port closed indefinitely — the statement
 * timeout is deliberately lifted for this DDL — and a deploy that never binds a
 * port is failed by the platform. CREATE INDEX CONCURRENTLY takes no write lock,
 * so serving traffic during the build is safe; search falls back to a sequential
 * scan until it lands, which is what it did before the index existed at all.
 */
export function startSearchIndexBuild(): void {
  const startedAt = Date.now();
  void (async () => {
    try {
      const { ok: built, detail } = await ensureSearchIndexes();
      const secs = Math.round((Date.now() - startedAt) / 1000);
      if (built) logger.info(`Search indexes ready in ${secs}s — ${detail}`);
      else logger.warn(`Search indexes incomplete after ${secs}s — ${detail}`);
    } catch (error) {
      logger.warn(`Search index build failed: ${(error as Error).message}`);
    }
  })();
}

async function ensureSearchIndexes(): Promise<{ ok: boolean; detail: string }> {
  const { prisma } = await import('./prisma');

  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  } catch (error) {
    logger.warn(
      'Could not enable the pg_trgm extension: ' +
        (error as Error).message +
        ' — contact and message search will run unindexed table scans. ' +
        'Run `CREATE EXTENSION pg_trgm;` as a superuser once.'
    );
    return { ok: false, detail: 'pg_trgm unavailable — search runs unindexed' };
  }

  let created = 0;
  let unusable = 0;
  for (const index of SEARCH_INDEXES) {
    // Each one on its own: a single index that cannot be built must not stop
    // the other two from existing.
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ valid: boolean }>>(
        `SELECT i.indisvalid AS valid
           FROM pg_class c
           JOIN pg_namespace ns ON ns.oid = c.relnamespace
           JOIN pg_index i ON i.indexrelid = c.oid
          WHERE c.relname = $1 AND ns.nspname = current_schema()`,
        index.name
      );
      if (rows.length > 0) {
        // An index left behind INVALID by an aborted CONCURRENTLY build satisfies
        // IF NOT EXISTS while answering no queries at all, so it would silently
        // never be rebuilt. Name it instead of dropping it: a drop here could
        // cancel a build another instance is running right now.
        if (!rows[0].valid) {
          // Rebuild it rather than warning forever. The previous code told an
          // operator to run DROP INDEX CONCURRENTLY by hand and then `continue`d,
          // so a build cancelled by the timeout above was never retried -- the
          // index stayed invalid for the life of the deployment.
          logger.warn(`Search index ${index.name} is INVALID (an aborted build) — rebuilding.`);
          try {
            await prisma.$executeRawUnsafe('SET statement_timeout = 0');
            await prisma.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${index.name}"`);
          } catch (dropError) {
            unusable += 1;
            logger.warn(
              `Could not drop invalid index ${index.name}: ${(dropError as Error).message}`
            );
            continue;
          }
          // fall through to the create below
        } else {
          continue;
        }
      }
      // Lift the pool's 30s statement_timeout for the DDL only.
      //
      // config/prisma.ts sets statement_timeout=30000 on every pooled connection.
      // A trigram GIN build over a multi-million-row WaMessage takes far longer,
      // so Postgres cancelled it -- and a cancelled CONCURRENTLY build leaves an
      // INVALID index that answers no queries yet is still maintained on every
      // write. Search stayed an unindexed scan while the hottest table paid GIN
      // maintenance for nothing. It only passed review because an empty database
      // builds instantly.
      await prisma.$executeRawUnsafe('SET statement_timeout = 0');
      try {
        await prisma.$executeRawUnsafe(index.ddl);
      } finally {
        await prisma.$executeRawUnsafe('SET statement_timeout = 30000').catch(() => {
          /* connection is going back to the pool either way */
        });
      }
      created += 1;
      logger.info(`Created search index ${index.name} (pg_trgm)`);
    } catch (error) {
      unusable += 1;
      logger.warn(`Could not create search index ${index.name}: ${(error as Error).message}`);
    }
  }

  if (unusable > 0) {
    return {
      ok: false,
      detail: `${SEARCH_INDEXES.length - unusable}/${SEARCH_INDEXES.length} pg_trgm indexes usable`,
    };
  }
  return {
    ok: true,
    detail:
      created > 0
        ? `pg_trgm, ${created} index(es) created`
        : `pg_trgm, ${SEARCH_INDEXES.length} indexes present`,
  };
}

/**
 * Rows scanned per boot PER TABLE by the erasure-index backfill, and the page
 * size it walks in. 20k covers a normal webhook retention several times over; the
 * bound exists so a database that somehow holds far more cannot turn a boot into
 * a long-running scan.
 */
const PHONE_BACKFILL_MAX_ROWS = 20_000;
const PHONE_BACKFILL_PAGE = 500;

/**
 * Walk one table's un-indexed rows and fill its `phones` column.
 *
 * Paged with an explicit `id > lastId` rather than Prisma's `cursor` + `skip: 1`.
 * The page is filtered to rows whose `phones` is still empty and the loop UPDATEs
 * rows OUT of that filter as it goes, so by the time the next page is asked for
 * the cursor row is usually no longer in the filtered set — and the `skip: 1`
 * then stepped over the first genuinely un-indexed row instead of over the
 * cursor. One row per page was left unindexed, which is one row per page an
 * erasure would fail to find.
 */
async function backfillPhoneColumn(opts: {
  page: (afterId: string | undefined) => Promise<Array<{ id: string; payload: unknown }>>;
  extract: (payload: unknown) => string[];
  write: (id: string, phones: string[]) => Promise<unknown>;
}): Promise<{ scanned: number; filled: number; capped: boolean }> {
  let lastId: string | undefined;
  let scanned = 0;
  let filled = 0;

  while (scanned < PHONE_BACKFILL_MAX_ROWS) {
    const page = await opts.page(lastId);
    if (page.length === 0) break;
    lastId = page[page.length - 1].id;
    scanned += page.length;

    for (const row of page) {
      const phones = opts.extract(row.payload);
      if (phones.length === 0) continue;
      await opts.write(row.id, phones);
      filled += 1;
    }
    if (page.length < PHONE_BACKFILL_PAGE) break;
  }

  return { scanned, filled, capped: scanned >= PHONE_BACKFILL_MAX_ROWS };
}

/**
 * Backfill the `phones` erasure index on BOTH webhook tables, for rows written
 * before the column existed.
 *
 * DPDP erasure finds a data subject's webhook rows through that column (see
 * eraseContactData) — the inbound envelopes (`WaWebhookEvent`) and the bodies we
 * forwarded to subscribers (`WebhookDelivery`) alike. Both erasure statements
 * were switched from `payload::text LIKE` to an indexed `phones && ARRAY[...]`
 * containment, and a row whose array is empty matches NOTHING: until its
 * retention TTL ages it out, an erasure redacts none of the pre-deploy rows the
 * old predicate did find, while the operator is told the erasure completed.
 * Backfilling only the inbound table left exactly that hole open on the delivery
 * log for its full 30-day window.
 *
 * Deliberately in TypeScript rather than raw jsonb SQL: it reuses the exact
 * extractors the ingest paths use, so the two can never disagree about which
 * fields hold a sender. Bounded and paged, so it terminates; rows that genuinely
 * name nobody (status-only events, payloads with no phone-ish key) are skipped
 * rather than rewritten, which is why re-running this on a later boot is cheap.
 */
async function backfillWebhookPhones(): Promise<{ ok: boolean; detail: string }> {
  const { prisma } = await import('./prisma');
  const { metaEnvelopePhones, payloadPhones } = await import('../utils/webhook-phone-index');

  const events = await backfillPhoneColumn({
    page: (afterId) =>
      prisma.waWebhookEvent.findMany({
        where: { phones: { isEmpty: true }, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true, payload: true },
        orderBy: { id: 'asc' },
        take: PHONE_BACKFILL_PAGE,
      }),
    extract: metaEnvelopePhones,
    write: (id, phones) => prisma.waWebhookEvent.update({ where: { id }, data: { phones } }),
  });

  const deliveries = await backfillPhoneColumn({
    page: (afterId) =>
      prisma.webhookDelivery.findMany({
        where: { phones: { isEmpty: true }, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true, payload: true },
        orderBy: { id: 'asc' },
        take: PHONE_BACKFILL_PAGE,
      }),
    extract: payloadPhones,
    write: (id, phones) => prisma.webhookDelivery.update({ where: { id }, data: { phones } }),
  });

  const capped = events.capped || deliveries.capped;
  if (capped) {
    logger.warn(
      `Webhook erasure index: stopped after ${events.scanned} event(s) and ` +
        `${deliveries.scanned} delivery row(s). Restart to continue, or let the ` +
        'retention prune age the remainder out.'
    );
  }
  const filled = events.filled + deliveries.filled;
  return {
    ok: !capped,
    detail:
      filled > 0
        ? `${events.filled} event(s), ${deliveries.filled} delivery row(s) indexed`
        : 'up to date',
  };
}

/**
 * Lowest Graph API version the module's Cloud API calls actually work against.
 *
 * Bump this alongside any new version-gated edge. It is v22.0 because that is
 * where Meta introduced the Block Users API (`POST /{phone-number-id}/block_users`,
 * see whatsapp.service.ts) — on an older pin every block request answers a 404
 * that reads like the number being wrong.
 */
const MIN_GRAPH_VERSION = 22;

/**
 * The newest Graph version this build knows about, used only to notice a pin
 * drifting toward Meta's ~2-year deprecation window. Deliberately a constant
 * rather than a live lookup: a stale one means no warning, never a false one.
 */
const KNOWN_LATEST_GRAPH_VERSION = 23;

/** Majors behind `KNOWN_LATEST_GRAPH_VERSION` before the pin is called out. */
const GRAPH_VERSION_STALE_AFTER = 8;

/**
 * What is wrong with the configured `META_WHATSAPP_API_VERSION`, or null.
 *
 * Every Graph call in the module interpolates this one string, so the pin going
 * out of support does not degrade anything gradually — it stops every send,
 * every template sync and every webhook subscription at the same moment, with
 * Meta's own error as the only clue. Saying it at boot is the only warning
 * there is.
 *
 * `fatal` separates "nothing will work" (a pin that is not a version at all)
 * from "this will bite you later" (an old but real one), which is the difference
 * between an error and a warning in the banner.
 */
function graphVersionWarning(pin: string): { fatal: boolean; message: string } | null {
  const match = /^v(\d+)\.(\d+)$/.exec(pin.trim());
  if (!match) {
    return {
      fatal: true,
      message: `"${pin}" is not a Graph version (expected vNN.N) — every Cloud API call will 404`,
    };
  }
  const major = parseInt(match[1], 10);
  if (major < MIN_GRAPH_VERSION) {
    return {
      fatal: false,
      message: `pinned to ${pin}, below the v${MIN_GRAPH_VERSION}.0 floor — version-gated edges (block_users) answer 404 on it`,
    };
  }
  const behind = KNOWN_LATEST_GRAPH_VERSION - major;
  if (behind >= GRAPH_VERSION_STALE_AFTER) {
    return {
      fatal: false,
      message: `pinned to ${pin}, ${behind} versions behind v${KNOWN_LATEST_GRAPH_VERSION}.0 — Meta sunsets a version about two years after release, and a sunset stops every send at once`,
    };
  }
  return null;
}

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
  {
    // Both of these are Redis-backed. With REDIS_ENABLED=false the limiter falls
    // back to a per-process MemoryStore and the DDoS middleware no-ops entirely —
    // but the banner reported both "ready" regardless, so an operator running
    // without Redis believed abuse controls were enforced when they were not.
    const { redis } = await import('./redis');
    const redisOn = (redis as unknown as { status?: string }).status !== 'disabled';
    registerService(
      'Rate Limiting',
      redisOn ? 'ready' : 'not_configured',
      redisOn
        ? 'Redis-backed, shared across instances'
        : 'REDIS_ENABLED=false — per-process MemoryStore, not shared across instances'
    );
    registerService(
      'DDoS Protection',
      redisOn ? 'ready' : 'disabled',
      redisOn ? undefined : 'REDIS_ENABLED=false — per-IP thresholds are NOT enforced'
    );
  }
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
  let schemaApplied = false;
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
      schemaApplied = true;
      registerService('PostgreSQL (Prisma)', 'ready', `${waTables} WhatsApp tables`);
    }
  } catch (error) {
    registerService('PostgreSQL (Prisma)', 'error', (error as Error).message);
  }

  // Only once the tables exist — indexing a table that has never been created
  // would just be three "relation does not exist" warnings on top of the schema
  // error already reported above.
  if (!schemaApplied) {
    registerService('Search Indexes', 'not_configured', 'schema not applied');
  } else {
    // Reported, not awaited — see startSearchIndexBuild below.
    registerService('Search Indexes', 'ready', 'building in background (pg_trgm)');

    try {
      const { ok, detail } = await backfillWebhookPhones();
      registerService('Webhook Erasure Index', ok ? 'ready' : 'not_configured', detail);
    } catch (error) {
      registerService('Webhook Erasure Index', 'error', (error as Error).message);
    }
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
  const graphWarning = graphVersionWarning(env.META_WHATSAPP_API_VERSION);
  if (graphWarning) logger.warn(`WhatsApp Graph API version: ${graphWarning.message}`);
  registerService(
    'WhatsApp (Meta)',
    !waReady ? 'not_configured' : graphWarning?.fatal ? 'error' : 'ready',
    waReady
      ? `Cloud API ${env.META_WHATSAPP_API_VERSION}${graphWarning ? ` — ${graphWarning.message}` : ''}`
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
