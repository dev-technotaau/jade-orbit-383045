import dotenv from 'dotenv';
dotenv.config();

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

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

  const pool = new Pool({
    connectionString,
    // Keep pool small for managed DB services
    max: parseInt(process.env.DATABASE_POOL_SIZE || '5', 10),
    // Don't hold idle connections — managed DB poolers may reclaim them
    idleTimeoutMillis: 30_000,
    // Allow 30s for initial connection (managed DBs can be slow to wake)
    connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_TIMEOUT || '30', 10) * 1000,
    // Keep connections alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: false,
    // Remote/managed PostgreSQL providers require SSL
    ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Set statement timeout and validate connection on every new/reconnected client
  pool.on('connect', (client) => {
    client.query('SET statement_timeout = 30000').catch(() => {});
  });

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

// Create adapter with pool
// @ts-expect-error - @types/pg version mismatch between top-level and @prisma/adapter-pg's bundled copy
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
