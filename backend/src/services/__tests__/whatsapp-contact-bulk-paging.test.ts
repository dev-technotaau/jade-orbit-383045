/**
 * Regression: bulk opt-out must reach EVERY matching contact.
 *
 * The chunk pager used Prisma's `cursor: {id}, skip: 1`. Prisma resolves that
 * cursor with a subselect that finds the row by id alone, ignoring the `where`,
 * and then applies OFFSET 1 — which is only correct while the cursor row still
 * matches the predicate. Every caller here mutates the rows it just processed
 * (opt-out sets optInStatus, block sets isBlocked), so from the second page on
 * the cursor row no longer matched and the OFFSET 1 ate the first genuinely
 * unprocessed row instead.
 *
 * On "select all N matching" that left one contact per chunk still subscribed,
 * reported a smaller count, and flagged nothing — people who asked to leave did
 * not leave. These tests drive more than one chunk so the second page is
 * exercised; a single-page run cannot see the bug.
 */
import type { Prisma } from '@prisma/client';

const BULK_CHUNK = 5000;
const TOTAL = BULK_CHUNK * 2 + 7; // spans three pages, last one partial

interface Row {
  id: string;
  optInStatus: string;
  isBlocked: boolean;
}

let rows: Row[] = [];

/**
 * Minimal stand-in for the two Prisma calls the pager depends on, with the
 * semantics that actually matter: findMany applies the predicate at read time
 * (so mutated rows drop out), and id > cursor is an ordinary filter.
 */
const matches = (r: Row, where: Prisma.WaContactWhereInput): boolean => {
  const w = where as Record<string, unknown>;
  if (Array.isArray(w.AND)) return (w.AND as Prisma.WaContactWhereInput[]).every((c) => matches(r, c));
  if (w.id && typeof w.id === 'object') {
    const gt = (w.id as { gt?: string }).gt;
    if (gt !== undefined && !(r.id > gt)) return false;
  }
  if (typeof w.optInStatus === 'string' && r.optInStatus !== w.optInStatus) return false;
  if (w.optInStatus && typeof w.optInStatus === 'object') {
    const not = (w.optInStatus as { not?: string }).not;
    const notIn = (w.optInStatus as { notIn?: string[] }).notIn;
    if (not !== undefined && r.optInStatus === not) return false;
    if (notIn !== undefined && notIn.includes(r.optInStatus)) return false;
  }
  if (typeof w.isBlocked === 'boolean' && r.isBlocked !== w.isBlocked) return false;
  return true;
};

const findMany = jest.fn(
  async (args: {
    where: Prisma.WaContactWhereInput;
    take?: number;
    cursor?: { id: string };
    skip?: number;
  }) => {
    let hits = rows.filter((r) => matches(r, args.where)).sort((a, b) => (a.id < b.id ? -1 : 1));
    // Emulate Prisma's cursor semantics faithfully: the cursor row is located by
    // id WITHOUT the predicate, then OFFSET is applied to the FILTERED set. This
    // is the behaviour that made the old implementation lose a row per page.
    if (args.cursor) {
      hits = hits.filter((r) => r.id >= args.cursor!.id);
      if (args.skip) hits = hits.slice(args.skip);
    }
    return hits.slice(0, args.take ?? hits.length).map((r) => ({ id: r.id }));
  }
);

const updateMany = jest.fn(async (args: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
  const ids = new Set(args.where.id.in);
  let count = 0;
  for (const r of rows) {
    if (!ids.has(r.id)) continue;
    Object.assign(r, args.data);
    count += 1;
  }
  return { count };
});

jest.mock('../../config/prisma', () => ({
  prisma: {
    waContact: {
      findMany: (...a: unknown[]) => findMany(...(a as [never])),
      updateMany: (...a: unknown[]) => updateMany(...(a as [never])),
      count: jest.fn().mockResolvedValue(0),
    },
    waConsentEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  },
}));

/** The pager, reproduced exactly as the service implements it. */
async function forEachIdChunk(
  where: Prisma.WaContactWhereInput,
  fn: (ids: string[]) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const page = await findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      take: BULK_CHUNK,
    });
    if (page.length === 0) return;
    cursor = page[page.length - 1].id;
    await fn(page.map((r) => r.id));
    if (page.length < BULK_CHUNK) return;
  }
}

beforeEach(() => {
  findMany.mockClear();
  updateMany.mockClear();
  rows = Array.from({ length: TOTAL }, (_, i) => ({
    // Zero-padded so lexical id order matches numeric order, as uuid ordering would not.
    id: `c${String(i).padStart(6, '0')}`,
    optInStatus: 'OPTED_IN',
    isBlocked: false,
  }));
});

describe('bulk paging over a predicate the action invalidates', () => {
  it('opts out EVERY matching contact across chunk boundaries', async () => {
    const seen: string[] = [];
    await forEachIdChunk({ optInStatus: { not: 'OPTED_OUT' } }, async (ids) => {
      seen.push(...ids);
      await updateMany({ where: { id: { in: ids } }, data: { optInStatus: 'OPTED_OUT' } });
    });

    expect(seen).toHaveLength(TOTAL);
    expect(new Set(seen).size).toBe(TOTAL);
    expect(rows.filter((r) => r.optInStatus !== 'OPTED_OUT')).toHaveLength(0);
  });

  it('blocks every matching contact when the predicate excludes blocked rows', async () => {
    const seen: string[] = [];
    await forEachIdChunk({ isBlocked: false }, async (ids) => {
      seen.push(...ids);
      await updateMany({ where: { id: { in: ids } }, data: { isBlocked: true } });
    });

    expect(seen).toHaveLength(TOTAL);
    expect(rows.filter((r) => !r.isBlocked)).toHaveLength(0);
  });

  it('demonstrates the cursor/skip form this replaced loses one row per page', async () => {
    // Guards the reasoning behind the fix: if anyone reintroduces cursor+skip:1
    // on a self-invalidating predicate, it silently under-processes again.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await findMany({
        where: { optInStatus: { not: 'OPTED_OUT' } },
        take: BULK_CHUNK,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1].id;
      seen.push(...page.map((r) => r.id));
      await updateMany({
        where: { id: { in: page.map((r) => r.id) } },
        data: { optInStatus: 'OPTED_OUT' },
      });
      if (page.length < BULK_CHUNK) break;
    }

    expect(seen.length).toBeLessThan(TOTAL);
    expect(rows.filter((r) => r.optInStatus !== 'OPTED_OUT').length).toBeGreaterThan(0);
  });
});
