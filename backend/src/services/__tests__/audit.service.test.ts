/**
 * Tests for the audit trail (src/services/audit.service.ts).
 *
 * The integrity block is the one that matters. `verifyIntegrity` shipped
 * unused, and re-reading it explains why: it hashed `JSON.stringify(details)`,
 * but `details` is a Prisma `Json` column, which on PostgreSQL is `jsonb` — and
 * jsonb normalises key order on write. Hash the object going in, hash it coming
 * out, get two different values, and every row with more than one detail key
 * reports as TAMPERED. A verifier that cries wolf is worse than none, so nobody
 * called it.
 *
 * Canonical serialisation removes ordering from the equation. These tests pin
 * that down, including the fallback that stops old rows alarming on upgrade.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const prismaMock = {
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
};
jest.mock('../../config/prisma', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AuditService, __testing } from '../audit.service';

const { canonicalJson, generateChecksum, checkIntegrity } = __testing;

/** A row as Prisma hands it back, with a checksum computed the current way. */
function rowWith(details: unknown, overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-03-01T10:00:00.000Z');
  const base = {
    id: 'a1',
    action: 'WA_CAMPAIGN_LAUNCH',
    entity: 'WaCampaign',
    entityId: 'camp1',
    performedBy: 'operator',
    details,
    ipAddress: '1.2.3.4',
    userAgent: 'Chrome',
    isArchived: false,
    createdAt,
  };
  const checksum = generateChecksum(
    base.action,
    base.entity,
    base.entityId,
    base.performedBy,
    details ?? {},
    createdAt.toISOString()
  );
  return { ...base, checksum, ...overrides };
}

beforeEach(() => jest.clearAllMocks());

describe('canonicalJson', () => {
  it('serialises the same object identically regardless of key order', () => {
    // This is the entire bug, in one assertion.
    expect(canonicalJson({ zebra: 1, apple: 2 })).toBe(canonicalJson({ apple: 2, zebra: 1 }));
    expect(JSON.stringify({ zebra: 1, apple: 2 })).not.toBe(JSON.stringify({ apple: 2, zebra: 1 }));
  });

  it('sorts nested objects too', () => {
    const a = { outer: { z: 1, a: 2 }, list: [{ y: 1, b: 2 }] };
    const b = { list: [{ b: 2, y: 1 }], outer: { a: 2, z: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('preserves array ORDER, which is meaningful', () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('handles primitives and null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(5)).toBe('5');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson({})).toBe('{}');
  });
});

describe('integrity checking', () => {
  it('verifies a row whose details came back in a different key order', () => {
    // Exactly what jsonb does on read. The old implementation failed here.
    const row = rowWith({ zebra: 1, apple: 2 });
    const reordered = { ...row, details: { apple: 2, zebra: 1 } };
    expect(checkIntegrity(reordered as any)).toBe('valid');
  });

  it('detects a tampered field', () => {
    const row = rowWith({ count: 1 });
    expect(checkIntegrity({ ...row, action: 'WA_SOMETHING_ELSE' } as any)).toBe('invalid');
    expect(checkIntegrity({ ...row, performedBy: 'someone-else' } as any)).toBe('invalid');
    expect(checkIntegrity({ ...row, entityId: 'other' } as any)).toBe('invalid');
  });

  it('detects tampered details', () => {
    const row = rowWith({ recipients: 10 });
    expect(checkIntegrity({ ...row, details: { recipients: 999 } } as any)).toBe('invalid');
  });

  it('detects a back-dated row', () => {
    const row = rowWith({ a: 1 });
    expect(checkIntegrity({ ...row, createdAt: new Date('2020-01-01T00:00:00.000Z') } as any)).toBe(
      'invalid'
    );
  });

  it('reports a row with no checksum as unverifiable, not invalid', () => {
    // Saying "invalid" for a row written before checksums existed would be an
    // accusation rather than an observation.
    const row = rowWith({ a: 1 });
    expect(checkIntegrity({ ...row, checksum: null } as any)).toBe('unverifiable');
  });

  it('still accepts rows hashed the OLD way, so an upgrade does not cry wolf', () => {
    const createdAt = new Date('2026-03-01T10:00:00.000Z');
    const details = { zebra: 1, apple: 2 };
    const legacy = generateChecksum(
      'WA_X',
      'WaY',
      'id1',
      'operator',
      details,
      createdAt.toISOString(),
      true // pre-canonicalisation
    );
    const row = {
      id: 'a1',
      action: 'WA_X',
      entity: 'WaY',
      entityId: 'id1',
      performedBy: 'operator',
      details,
      ipAddress: null,
      userAgent: null,
      isArchived: false,
      createdAt,
      checksum: legacy,
    };
    expect(checkIntegrity(row as any)).toBe('valid');
  });
});

describe('list', () => {
  it('returns rows with an integrity verdict and strips the raw checksum', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([rowWith({ a: 1 })]);
    prismaMock.auditLog.count.mockResolvedValue(1);

    const res = await AuditService.list({});

    expect(res.items[0].integrity).toBe('valid');
    // The checksum is an internal detail; exposing it invites someone to
    // "helpfully" recompute and rewrite it.
    expect(res.items[0]).not.toHaveProperty('checksum');
  });

  it('hides archived rows by default and includes them on request', async () => {
    await AuditService.list({});
    const where1 = prismaMock.auditLog.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where1)).toContain('"isArchived":false');

    jest.clearAllMocks();
    await AuditService.list({ includeArchived: true });
    const where2 = prismaMock.auditLog.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where2)).not.toContain('isArchived');
  });

  it('caps the page size so a caller cannot ask for the whole table', async () => {
    await AuditService.list({}, 1, 100_000);
    expect(prismaMock.auditLog.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('orders newest first', async () => {
    await AuditService.list({});
    expect(prismaMock.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('does NOT search the details payload', async () => {
    // details is where redaction happens; a LIKE over it could surface whatever
    // slipped past, and jsonb text search would be unindexable anyway.
    await AuditService.list({ q: 'secret' });
    const where = JSON.stringify(prismaMock.auditLog.findMany.mock.calls[0][0].where);
    expect(where).toContain('performedBy');
    expect(where).not.toContain('details');
  });

  it('applies a date range', async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    await AuditService.list({ from, to });
    const where = prismaMock.auditLog.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('createdAt');
  });
});

describe('verifyRange', () => {
  it('counts each verdict and names the offenders', async () => {
    const good = rowWith({ a: 1 });
    const bad = { ...rowWith({ a: 1 }), id: 'bad1', action: 'MUTATED' };
    const unknown = { ...rowWith({ a: 1 }), id: 'old1', checksum: null };
    prismaMock.auditLog.findMany.mockResolvedValue([good, bad, unknown]);

    const res = await AuditService.verifyRange({});

    expect(res).toMatchObject({ checked: 3, valid: 1, invalid: 1, unverifiable: 1 });
    expect(res.invalidIds).toEqual(['bad1']);
  });
});

describe('exportCsv', () => {
  it('emits a header and one row per entry', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([rowWith({ n: 1 })]);
    const csv = await AuditService.exportCsv({});
    const [header, row] = csv.split('\n');
    expect(header).toBe(
      'id,createdAt,action,entity,entityId,performedBy,ipAddress,userAgent,integrity,details'
    );
    expect(row).toContain('WA_CAMPAIGN_LAUNCH');
    expect(row).toContain('valid');
  });

  it('NEUTRALISES formula injection', async () => {
    // A cell starting with = + - @ is executed by Excel and Sheets on open, and
    // an audit log is full of attacker-influenced strings (user agents, ids).
    prismaMock.auditLog.findMany.mockResolvedValue([
      { ...rowWith({ a: 1 }), userAgent: '=cmd|calc!A1', performedBy: '+1', entityId: '-2' },
    ]);
    const csv = await AuditService.exportCsv({});
    expect(csv).toContain(`"'=cmd|calc!A1"`);
    expect(csv).toContain(`"'+1"`);
    expect(csv).toContain(`"'-2"`);
  });

  it('escapes embedded quotes', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      { ...rowWith({ a: 1 }), userAgent: 'say "hello"' },
    ]);
    const csv = await AuditService.exportCsv({});
    expect(csv).toContain('"say ""hello"""');
  });
});

describe('log', () => {
  it('stores a checksum that verifies immediately', async () => {
    await AuditService.log({
      action: 'WA_TEST',
      entity: 'WaThing',
      entityId: 'x1',
      performedBy: 'operator',
      details: { zebra: 1, apple: 2 },
    });

    const written = prismaMock.auditLog.create.mock.calls[0][0].data;
    // Simulate jsonb handing the keys back in a different order.
    expect(
      checkIntegrity({ ...written, details: { apple: 2, zebra: 1 }, isArchived: false } as any)
    ).toBe('valid');
  });

  it('never throws — a failed audit write must not fail the action', async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(
      AuditService.log({ action: 'A', entity: 'E', performedBy: 'operator' })
    ).resolves.toBeUndefined();
  });
});
