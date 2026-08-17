/**
 * Re-encrypt every field-encrypted column onto the current key.
 *
 *   npm run reencrypt -- --dry-run        # report only, writes nothing
 *   npm run reencrypt                     # rewrite
 *   node dist/scripts/reencrypt-fields.js # on a built image (same flags)
 *
 * Rotating FIELD_ENCRYPTION_KEY without this leaves every stored value written
 * under the old key unreadable, with no way to find those rows again — which is
 * why the deploy notes used to say "back it up before you change it" and offer
 * nothing else. The rotation is now:
 *
 *   1. keep the live key in FIELD_ENCRYPTION_KEYS  ({"v1":"<old hex>"})
 *   2. set FIELD_ENCRYPTION_KEY=<new hex> and FIELD_ENCRYPTION_KEY_ID=v2
 *   3. deploy — old rows still decrypt through the map, new writes are v2
 *   4. run this script until it reports 0 rows left on the old key
 *   5. drop the old key from FIELD_ENCRYPTION_KEYS
 *
 * Safe to re-run and safe to interrupt: each row is rewritten independently and
 * rows already on the current key are skipped.
 */

import { prisma, disconnectPrisma } from '../config/prisma';
import {
  currentKeyId,
  encryptField,
  encryptJson,
  isEncrypted,
  isEncryptionEnabled,
  keyIdOf,
  tryDecryptField,
} from '../utils/encryption';

const BATCH_SIZE = 500;
const MAX_REPORTED_FAILURES = 20;

interface Tally {
  scanned: number;
  rewritten: number;
  alreadyCurrent: number;
  adopted: number;
  failures: Array<{ id: string; reason: string }>;
}

type Action =
  | { kind: 'skip' }
  | { kind: 'write'; value: string; wasPlaintext: boolean }
  | { kind: 'fail'; reason: string };

/**
 * What to do with one stored value: leave it, re-stamp it onto the current key,
 * or report it as unreadable.
 */
function plan(stored: unknown, json: boolean): Action {
  if (stored == null) return { kind: 'skip' };

  if (typeof stored !== 'string') {
    // A `Json` column still holding a plaintext object, from before consent
    // evidence was encrypted. Adopt it in exactly the format the write path
    // produces, so nothing downstream can tell the two apart.
    return json
      ? { kind: 'write', value: encryptJson(stored), wasPlaintext: true }
      : { kind: 'skip' };
  }

  if (!isEncrypted(stored)) {
    return { kind: 'write', value: encryptField(stored), wasPlaintext: true };
  }

  if (keyIdOf(stored) === currentKeyId()) return { kind: 'skip' };

  const opened = tryDecryptField(stored);
  if (!opened.ok) return { kind: 'fail', reason: opened.error.message };

  return { kind: 'write', value: encryptField(opened.value), wasPlaintext: false };
}

/**
 * Page through one column by id cursor and re-stamp it. Cursor paging (rather
 * than offset) stays correct while the rows underneath are being updated.
 */
async function walk(
  page: (cursor?: string) => Promise<Array<{ id: string; value: unknown }>>,
  write: (id: string, value: string) => Promise<unknown>,
  opts: { dryRun: boolean; json?: boolean }
): Promise<Tally> {
  const tally: Tally = { scanned: 0, rewritten: 0, alreadyCurrent: 0, adopted: 0, failures: [] };
  let cursor: string | undefined;

  for (;;) {
    const rows = await page(cursor);
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      if (row.value == null) continue;
      tally.scanned++;

      const action = plan(row.value, opts.json === true);
      if (action.kind === 'skip') {
        tally.alreadyCurrent++;
        continue;
      }
      if (action.kind === 'fail') {
        tally.failures.push({ id: row.id, reason: action.reason });
        continue;
      }

      if (!opts.dryRun) await write(row.id, action.value);
      tally.rewritten++;
      if (action.wasPlaintext) tally.adopted++;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return tally;
}

/** `take`/`cursor` arguments for the next page. */
function pageArgs(cursor?: string) {
  return {
    take: BATCH_SIZE,
    orderBy: { id: 'asc' as const },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');

  if (!isEncryptionEnabled()) {
    console.error(
      '[reencrypt] FIELD_ENCRYPTION_KEY is not set - there is no key to re-encrypt onto. ' +
        'Set it (keeping the previous key in FIELD_ENCRYPTION_KEYS) and run this again.'
    );
    return 1;
  }

  console.info(
    `[reencrypt] target key id "${currentKeyId()}"${dryRun ? ' - DRY RUN, nothing is written' : ''}`
  );

  const results: Array<[string, Tally]> = [
    [
      'WaContact.consentEvidence',
      await walk(
        async (cursor) =>
          (
            await prisma.waContact.findMany({
              ...pageArgs(cursor),
              select: { id: true, consentEvidence: true },
            })
          ).map((r) => ({ id: r.id, value: r.consentEvidence })),
        (id, value) => prisma.waContact.update({ where: { id }, data: { consentEvidence: value } }),
        { dryRun, json: true }
      ),
    ],
    [
      'WaConversationNote.body',
      await walk(
        async (cursor) =>
          (
            await prisma.waConversationNote.findMany({
              ...pageArgs(cursor),
              select: { id: true, body: true },
            })
          ).map((r) => ({ id: r.id, value: r.body })),
        (id, value) => prisma.waConversationNote.update({ where: { id }, data: { body: value } }),
        { dryRun }
      ),
    ],
    [
      'WaMfaConfig.secret',
      await walk(
        async (cursor) =>
          (
            await prisma.waMfaConfig.findMany({
              ...pageArgs(cursor),
              select: { id: true, secret: true },
            })
          ).map((r) => ({ id: r.id, value: r.secret })),
        (id, value) => prisma.waMfaConfig.update({ where: { id }, data: { secret: value } }),
        { dryRun }
      ),
    ],
    [
      'WaMfaConfig.pendingSecret',
      await walk(
        async (cursor) =>
          (
            await prisma.waMfaConfig.findMany({
              ...pageArgs(cursor),
              select: { id: true, pendingSecret: true },
            })
          ).map((r) => ({ id: r.id, value: r.pendingSecret })),
        (id, value) => prisma.waMfaConfig.update({ where: { id }, data: { pendingSecret: value } }),
        { dryRun }
      ),
    ],
  ];

  const failures: Array<{ column: string; id: string; reason: string }> = [];

  for (const [column, tally] of results) {
    failures.push(...tally.failures.map((f) => ({ column, ...f })));
    console.info(
      `[reencrypt] ${column}: ${tally.scanned} scanned, ` +
        `${tally.rewritten} ${dryRun ? 'to re-encrypt' : 're-encrypted'} ` +
        `(${tally.adopted} previously plaintext), ` +
        `${tally.alreadyCurrent} already on "${currentKeyId()}", ` +
        `${tally.failures.length} unreadable`
    );
  }

  if (failures.length === 0) {
    console.info(
      dryRun
        ? '[reencrypt] dry run complete - every value is readable.'
        : `[reencrypt] done - every stored value is now on key "${currentKeyId()}".`
    );
    return 0;
  }

  // Loud and itemised: an unreadable row means a key is missing from
  // FIELD_ENCRYPTION_KEYS, and the fix (restore it, re-run) is only possible
  // while somebody still has the old key.
  console.error(`[reencrypt] ${failures.length} value(s) no configured key can decrypt:`);
  for (const f of failures.slice(0, MAX_REPORTED_FAILURES)) {
    console.error(`[reencrypt]   ${f.column} id=${f.id} - ${f.reason}`);
  }
  if (failures.length > MAX_REPORTED_FAILURES) {
    console.error(`[reencrypt]   ... and ${failures.length - MAX_REPORTED_FAILURES} more`);
  }
  console.error(
    '[reencrypt] Add the key that wrote them to FIELD_ENCRYPTION_KEYS and run this again.'
  );
  return 1;
}

async function run(): Promise<void> {
  let code = 1;
  try {
    code = await main();
  } catch (err) {
    console.error('[reencrypt] aborted:', err);
  } finally {
    await disconnectPrisma().catch(() => {});
  }
  process.exit(code);
}

void run();
