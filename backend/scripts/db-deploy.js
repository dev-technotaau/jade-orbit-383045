#!/usr/bin/env node
/**
 * `prisma db push`, but not when the only difference is the search indexes.
 *
 * db push reconciles the database to schema.prisma, so it DROPS anything the
 * schema does not declare — including wa_message_text_trgm and the two contact
 * ones. Those cannot be declared: gin_trgm_ops needs the pg_trgm extension, and
 * declaring an extension in Prisma is still a preview feature, so a fresh
 * `db push` on a new client's database would fail before anything could create
 * it (see the note on WaMessage.text in schema.prisma).
 *
 * The result was a drop-and-rebuild on EVERY deploy. Harmless on a small table,
 * but the rebuild runs with statement_timeout lifted, so on a large WaMessage it
 * is unbounded work for no schema change at all.
 *
 * So: ask Prisma what it would do. If every statement is a DROP INDEX for one of
 * those three, there is no real schema change and the push is skipped. Anything
 * else — a new column, a new table, a changed type — pushes as before.
 *
 * Fails OPEN: if the diff cannot be taken (no database yet, older CLI, changed
 * flags), the push runs, because skipping a real migration is the worse error.
 */
const { spawnSync } = require('child_process');

/** Indexes created at runtime by config/service-init.ts, absent from the schema. */
const RUNTIME_INDEXES = ['wa_message_text_trgm', 'wa_contact_name_trgm', 'wa_contact_phone_trgm'];

const run = (args, opts = {}) =>
  spawnSync('npx', ['prisma', ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });

const diff = run([
  'migrate',
  'diff',
  '--from-config-datasource',
  '--to-schema',
  'prisma/schema.prisma',
  '--script',
]);

if (diff.status !== 0 || typeof diff.stdout !== 'string') {
  console.log('[db-deploy] could not diff the database; running db push anyway');
  const push = run(['db', 'push'], { stdio: 'inherit' });
  process.exit(push.status ?? 1);
}

// Keep only real SQL: a statement ends in a semicolon. Comments start with --,
// and the Prisma / dotenvx preamble ("injected env (0) from .env", the datasource
// banner) is neither — an earlier version counted that banner as a pending change
// and so pushed on every single boot, which is the bug this script exists to fix.
const statements = diff.stdout
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.endsWith(';') && !l.startsWith('--'));

const isRuntimeIndexDrop = (stmt) =>
  /^DROP INDEX /i.test(stmt) && RUNTIME_INDEXES.some((name) => stmt.includes(name));

if (statements.length === 0) {
  console.log('[db-deploy] database already matches the schema; nothing to push');
  process.exit(0);
}

if (statements.every(isRuntimeIndexDrop)) {
  console.log(
    `[db-deploy] only difference is ${statements.length} runtime search index(es) that ` +
      'schema.prisma deliberately does not declare — skipping db push so they are not ' +
      'dropped and rebuilt for no reason'
  );
  process.exit(0);
}

console.log(`[db-deploy] ${statements.length} real schema change(s) pending; running db push`);
const push = run(['db', 'push'], { stdio: 'inherit' });
process.exit(push.status ?? 1);
