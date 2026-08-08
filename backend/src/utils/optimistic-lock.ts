import { AppError } from '../middleware/error';

/**
 * Optimistic concurrency control for admin edits.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * When two admins open the same record and both save, the second save
 * silently destroys the first's work. Pessimistic locking (block admin B
 * from opening it at all) is the obvious fix and the wrong one: locks get
 * stranded by closed laptops, and the common case — two people looking,
 * one editing — becomes needlessly hostile.
 *
 * So instead: let both edit, and detect the collision at write time.
 *
 * The client sends back the `updatedAt` it loaded. If the stored row has
 * moved on, the write is refused with 409 and the UI shows a diff. Nothing
 * is lost, and no lock can strand anything.
 *
 *     const job = await prisma.jobPost.findUnique({ where: { id } });
 *     assertUnmodified(job, req.body.expectedUpdatedAt, 'Job');
 *     await prisma.jobPost.update({ ... });
 *
 * This is the CORRECTNESS boundary. `ResourceLock` (see
 * resource-lock.service.ts) is the courtesy layer that stops the collision
 * happening in the first place — but it is advisory, and an expired or
 * bypassed lock must never permit a stale overwrite. That is why this check
 * exists independently and why it is the one that returns 409.
 *
 * ── Millisecond precision ──────────────────────────────────────────────
 * Postgres `timestamp(3)` and JS `Date` both carry milliseconds, and
 * `toISOString()` round-trips them exactly, so string comparison of the
 * canonical ISO form is safe. We compare epoch millis rather than strings
 * anyway, so a client that sends `2026-08-03T10:00:00.000+00:00` instead of
 * `...Z` still matches.
 */

export const CONFLICT_CODE = 'STALE_WRITE';

export interface ConflictDetails {
  entity: string;
  /** What the client thought it was editing. */
  expected: string | null;
  /** What is actually stored now. */
  actual: string;
}

/**
 * Throw 409 when the record has changed since the client loaded it.
 *
 * `expectedUpdatedAt` is intentionally optional-but-checked: passing
 * `undefined` means the client opted out of conflict detection, which is
 * fine for create-only or idempotent flows. Passing a WRONG value is the
 * error case. Callers that must not be bypassed should validate presence in
 * their zod schema.
 */
export function assertUnmodified(
  record: { updatedAt: Date } | null,
  expectedUpdatedAt: string | Date | undefined | null,
  entity = 'Record'
): void {
  if (!record) throw new AppError(`${entity} not found`, 404, 'NOT_FOUND');
  if (expectedUpdatedAt === undefined || expectedUpdatedAt === null) return;

  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) {
    throw new AppError(
      'expectedUpdatedAt is not a valid timestamp',
      400,
      'INVALID_EXPECTED_VERSION'
    );
  }

  if (expected.getTime() !== record.updatedAt.getTime()) {
    const err = new AppError(
      `This ${entity.toLowerCase()} was changed by someone else while you were editing. ` +
        `Review their changes before saving again.`,
      409,
      CONFLICT_CODE
    );
    // Carried through the error handler so the client can render a diff
    // instead of a bare "conflict" toast.
    (err as AppError & { details?: ConflictDetails }).details = {
      entity,
      expected: expected.toISOString(),
      actual: record.updatedAt.toISOString(),
    };
    throw err;
  }
}

/**
 * Conditional-update guard for the update-in-place shape, where re-reading
 * first would open its own race.
 *
 * Adds `updatedAt: expected` to the WHERE clause so the database decides.
 * A zero-row result means either "gone" or "changed" — the caller
 * disambiguates with a follow-up read, which is cheap because it only
 * happens on the conflict path.
 *
 *     const where = withVersion({ id }, body.expectedUpdatedAt);
 *     const { count } = await prisma.jobPost.updateMany({ where, data });
 *     if (count === 0) await explainFailedUpdate(...);
 */
export function withVersion<T extends Record<string, unknown>>(
  where: T,
  expectedUpdatedAt: string | Date | undefined | null
): T & { updatedAt?: Date } {
  if (expectedUpdatedAt === undefined || expectedUpdatedAt === null) return where;
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) {
    throw new AppError(
      'expectedUpdatedAt is not a valid timestamp',
      400,
      'INVALID_EXPECTED_VERSION'
    );
  }
  return { ...where, updatedAt: expected };
}
