import dotenv from 'dotenv';
dotenv.config();

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool, type PoolClient } from 'pg';
// Safe: env.ts imports only dotenv and zod, so there is no cycle back to here.
import { env } from './env';

// Ensure Decimal fields serialize as numbers in JSON responses (not strings)
(Prisma.Decimal.prototype as any).toJSON = function () {
  return Number(this);
};

// Singleton pattern for PrismaClient
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

const createPool = () => {
  let connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Strip stray quotes (common copy-paste mistake in env dashboards)
  connectionString = connectionString.replace(/^["']+|["']+$/g, '');

  // Strip ?pgbouncer=true — Prisma-only param that pg Pool doesn't understand
  connectionString = connectionString.replace(/[?&]pgbouncer=true/gi, '').replace(/\?$/, '');

  // Detect if connecting to a remote/managed DB (Neon, Supabase, Railway, etc.)
  const isLocalhost =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const isRemote = !isLocalhost;

  /**
   * TLS, driven by DATABASE_SSL_MODE.
   *
   * This used to be inferred purely from "is the host localhost", always with
   * `rejectUnauthorized: false` — encryption without authentication, so a
   * man-in-the-middle on the path to the database still works. That is the
   * right DEFAULT for managed providers (their certs rarely chain-verify from a
   * bare Node client without shipping their CA), but it should be a decision,
   * not a hardcode.
   *
   * `verify-full` / `verify-ca` turn on real certificate verification for
   * deployments that can supply a trusted chain.
   *
   * Note this is an explicit knob now rather than a declared-and-ignored one:
   * both the host platform and its docker env carried a DATABASE_SSL_MODE that
   * nothing ever read.
   */
  const sslMode = process.env.DATABASE_SSL_MODE || (isRemote ? 'require' : 'disable');
  const verifies = sslMode === 'verify-full' || sslMode === 'verify-ca';
  const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: verifies };

  const pool = new Pool({
    connectionString,
    // Keep pool small for managed DB services
    // From the VALIDATED env, not `process.env`.
    //
    // Reading it raw here bypassed `env.ts`, whose declared default is 10 — so
    // the effective pool was 5 while the workers declare 27 concurrent job slots
    // (inbound 10, webhook 5, autoreply 4, media 4, scheduler 2, campaign 1,
    // import 1) and every API request competes for the same connections. Under a
    // campaign that is a queue of `P2024` pool timeouts, which the send path
    // then recorded as permanently FAILED recipients.
    max: parseInt(env.DATABASE_POOL_SIZE, 10) || 10,
    // Don't hold idle connections — managed DB poolers may reclaim them
    idleTimeoutMillis: 30_000,
    // Allow 30s for initial connection (managed DBs can be slow to wake)
    // Same divergence: env.ts declares 10 seconds, this said 30.
    connectionTimeoutMillis: (parseInt(env.DATABASE_POOL_TIMEOUT, 10) || 10) * 1000,
    // Keep connections alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
    // TLS per DATABASE_SSL_MODE (see above).
    ...(ssl === false ? {} : { ssl }),
  });

  // Statement timeout, applied once per physical connection.
  //
  // This was a pool.on('connect') listener firing the SET without awaiting it.
  // pg does not await those listeners, so the SET raced the first real query on
  // the same client and every new connection emitted:
  //
  //   DeprecationWarning: Calling client.query() when the client is already
  //   executing a query ... will be removed in pg@9.0
  //
  // The tidy-looking alternative — passing `options: '-c statement_timeout=...'`
  // in the Pool config — is a DEAD END behind a pooler. Measured against the
  // live Supabase session pooler: the startup packet is accepted, connect()
  // succeeds, and statement_timeout stays at the 2min default. It would have
  // read as fixed while doing nothing.
  //
  // So the SET stays, but is awaited before the client is handed out. pg calls
  // connect() two ways — `await pool.connect()`, and `this.connect(callback)`
  // from inside Pool.query() — and BOTH must keep working: handling only the
  // promise form silently breaks every pool.query() in the app.
  const STATEMENT_TIMEOUT_SQL = 'SET statement_timeout = 30000';
  const APPLIED = Symbol('statementTimeoutApplied');
  type TaggedClient = PoolClient & { [APPLIED]?: boolean };

  const rawConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;

  const connectWithTimeout = async (): Promise<PoolClient> => {
    const client = (await rawConnect()) as TaggedClient;
    if (!client[APPLIED]) {
      try {
        await client.query(STATEMENT_TIMEOUT_SQL);
        client[APPLIED] = true;
      } catch {
        // A pooler that refuses SET must not render the connection unusable —
        // the query still runs, just under the server-side default.
      }
    }
    return client;
  };

  type ConnectCallback = (err: Error | null, client?: PoolClient, release?: () => void) => void;
  (pool as unknown as { connect: (cb?: ConnectCallback) => Promise<PoolClient> | void }).connect =
    function (cb?: ConnectCallback) {
      if (typeof cb === 'function') {
        // async/await rather than .then(onOk, onErr): the two-argument form does
        // not read as handled rejection to promise/catch-or-return, and a
        // callback invoked inside .then() is its own lint smell.
        void (async () => {
          try {
            const client = await connectWithTimeout();
            cb(null, client, () => client.release());
          } catch (err) {
            cb(err as Error);
          }
        })();
        return undefined;
      }
      return connectWithTimeout();
    };

  // Handle pool-level errors: log and evict the failed client so the pool
  // replaces it with a fresh connection on the next checkout.
  pool.on('error', (err, client) => {
    console.error('PG pool error (client evicted):', err.message);
    // Release the errored client back to the pool with an error flag so it
    // gets destroyed rather than reused. The `release(err)` call is only
    // available when the client was checked out — for idle-client errors the
    // pool already handles eviction internally.
    try {
      (client as any)?.release?.(err);
    } catch {
      // client may already be released
    }
  });

  return pool;
};

// Get or create pool
const pool = globalForPrisma.pool ?? createPool();

// Create adapter with pool.
//
// This carried a `@ts-expect-error` for a @types/pg mismatch between the
// top-level copy and the one @prisma/adapter-pg bundled. Prisma 7.9 aligned
// them, so the directive became an error in its own right ("unused
// '@ts-expect-error'"). Removed rather than downgraded to `@ts-ignore` —
// if the mismatch ever returns, a real error is better than a silent one.
const adapter = new PrismaPg(pool);

// ---------------------------------------------------------------------------
// Prisma client with transient-error retry ($extends)
// ---------------------------------------------------------------------------

// Error codes / patterns that indicate a transient failure worth retrying
const TRANSIENT_ERROR_CODES = new Set([
  'P2024', // Timed out fetching a new connection from the pool
  'P2034', // Transaction conflict (write conflict / deadlock)
]);

const TRANSIENT_ERROR_PATTERNS = [
  'connection reset',
  'connection terminated',
  'connection refused',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'socket hang up',
  'terminating connection due to administrator command',
  'server closed the connection unexpectedly',
  'SSL connection has been closed unexpectedly',
  'Connection terminated unexpectedly',
];

function isTransientError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (TRANSIENT_ERROR_CODES.has(error.code)) return true;
  }

  // Check message patterns for connection-level failures
  const message = (error as Error)?.message ?? '';
  return TRANSIENT_ERROR_PATTERNS.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 150; // 150ms, 300ms

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && isTransientError(error)) {
        const delay = BASE_DELAY_MS * 2 ** attempt; // 150, 300
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError; // unreachable, satisfies TS
}

const basePrisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Wrap all Prisma operations with automatic transient-error retry
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return withRetry(() => query(args));
      },
    },
  },
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

// Graceful shutdown helper
export const disconnectPrisma = async (): Promise<void> => {
  await basePrisma.$disconnect();
  await pool.end();
};

export default prisma;
