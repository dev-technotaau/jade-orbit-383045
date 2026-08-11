import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import logger from '../config/logger';
import prisma from '../config/prisma';

interface AuditLogData {
  action: string;
  entity: string;
  entityId?: string;
  performedBy: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Deterministic JSON: object keys sorted, recursively.
 *
 * The checksum below hashes the `details` payload, and `details` is a Prisma
 * `Json` column — which on PostgreSQL is `jsonb`. jsonb does NOT preserve key
 * order: it normalises on write and hands back a differently-ordered object on
 * read. So hashing `JSON.stringify(details)` produces one value going in and a
 * different value coming out, and the integrity check reports every row with
 * more than one detail key as TAMPERED.
 *
 * That is why `verifyIntegrity` had no callers — a verifier that cries wolf on
 * legitimate data is worse than none, so it was written and quietly never used.
 * Canonicalising both sides removes the ordering from the equation entirely.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** SHA-256 over the row's immutable fields. */
function generateChecksum(
  action: string,
  entity: string,
  entityId: string | undefined,
  performedBy: string,
  details: unknown,
  createdAt: string,
  /** Pre-canonicalisation serialisation, kept only to re-verify old rows. */
  legacy = false
): string {
  const serialised = legacy ? JSON.stringify(details) : canonicalJson(details);
  const payload = `${action}|${entity}|${entityId || ''}|${performedBy}|${serialised}|${createdAt}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Outcome of re-hashing a row. */
export type IntegrityState = 'valid' | 'invalid' | 'unverifiable';

export interface AuditFilters {
  action?: string;
  entity?: string;
  entityId?: string;
  performedBy?: string;
  ipAddress?: string;
  /** Free text across action, entity, entityId, actor and IP. */
  q?: string;
  from?: Date;
  to?: Date;
  includeArchived?: boolean;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string | null;
  details: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  isArchived: boolean;
  createdAt: Date;
  integrity: IntegrityState;
}

/** Build the Prisma `where` from the filter set. Shared by list/stats/export. */
function buildWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (f.action) and.push({ action: f.action });
  if (f.entity) and.push({ entity: f.entity });
  if (f.entityId) and.push({ entityId: f.entityId });
  if (f.performedBy) and.push({ performedBy: f.performedBy });
  if (f.ipAddress) and.push({ ipAddress: f.ipAddress });
  if (!f.includeArchived) and.push({ isArchived: false });

  if (f.from || f.to) {
    and.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.to ? { lte: f.to } : {}),
      },
    });
  }

  if (f.q) {
    // `details` is deliberately NOT searched: the middleware redacts message
    // content out of it, and a LIKE over jsonb would both be unindexable and
    // risk surfacing whatever slipped past redaction.
    and.push({
      OR: [
        { action: { contains: f.q, mode: 'insensitive' } },
        { entity: { contains: f.q, mode: 'insensitive' } },
        { entityId: { contains: f.q, mode: 'insensitive' } },
        { performedBy: { contains: f.q, mode: 'insensitive' } },
        { ipAddress: { contains: f.q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

type RawRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string | null;
  details: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  checksum: string | null;
  isArchived: boolean;
  createdAt: Date;
};

/** Re-hash a row and say whether it still matches what was recorded. */
function checkIntegrity(row: RawRow): IntegrityState {
  // Rows written before checksums existed cannot be judged either way. Saying
  // "unverifiable" is honest; saying "invalid" would be an accusation.
  if (!row.checksum) return 'unverifiable';

  const args = [
    row.action,
    row.entity,
    row.entityId ?? undefined,
    row.performedBy ?? '',
    row.details ?? {},
    row.createdAt.toISOString(),
  ] as const;

  if (generateChecksum(...args) === row.checksum) return 'valid';
  // Rows written before canonicalisation hashed the raw jsonb read-back order.
  // Accept those rather than flagging a wave of false tampering on upgrade.
  if (generateChecksum(...args, true) === row.checksum) return 'valid';
  return 'invalid';
}

const toRow = (r: RawRow): AuditRow => {
  const { checksum: _checksum, ...rest } = r;
  return { ...rest, integrity: checkIntegrity(r) };
};

export class AuditService {
  static async log(data: AuditLogData) {
    try {
      const now = new Date();
      const checksum = generateChecksum(
        data.action,
        data.entity,
        data.entityId,
        data.performedBy,
        data.details || {},
        now.toISOString()
      );

      await prisma.auditLog.create({
        data: {
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          performedBy: data.performedBy,
          details: (data.details ?? {}) as object,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          checksum,
          createdAt: now,
        },
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error as Error);
    }
  }

  /** One page of the trail, newest first, each row integrity-checked. */
  static async list(
    filters: AuditFilters,
    page = 1,
    limit = 50
  ): Promise<{
    items: AuditRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const where = buildWhere(filters);
    const take = Math.min(Math.max(limit, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map(toRow),
      total,
      page: Math.max(page, 1),
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  static async getById(id: string): Promise<AuditRow | null> {
    const row = await prisma.auditLog.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  /**
   * Headline numbers for the viewer: volume, the busiest actions and entities,
   * who is acting, and a per-day series for the sparkline.
   */
  static async stats(filters: AuditFilters): Promise<{
    total: number;
    byAction: Array<{ action: string; count: number }>;
    byEntity: Array<{ entity: string; count: number }>;
    byActor: Array<{ performedBy: string; count: number }>;
    perDay: Array<{ day: string; count: number }>;
    /** True when the 30-day series hit its scan cap and is therefore partial. */
    perDayTruncated: boolean;
    oldest: Date | null;
  }> {
    const where = buildWhere(filters);

    const [total, byAction, byEntity, byActor, oldestRow] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: { _all: true },
        orderBy: { _count: { entity: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['performedBy'],
        where,
        _count: { _all: true },
        orderBy: { _count: { performedBy: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    // Per-day counts for the last 30 days, RESPECTING the active filters.
    //
    // Prisma's groupBy cannot bucket by date, and the obvious raw-SQL version
    // silently ignored the filter set — a chart labelled "filtered" that showed
    // unfiltered data. Pulling timestamps and bucketing in JS keeps one source
    // of truth for the where-clause. Bounded so a wide range cannot pull the
    // table into memory; `perDayTruncated` says so rather than quietly lying.
    const PER_DAY_SCAN_CAP = 20_000;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stamps = await prisma.auditLog.findMany({
      where: { AND: [where, { createdAt: { gte: since } }] },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: PER_DAY_SCAN_CAP,
    });

    const buckets = new Map<string, number>();
    for (const { createdAt } of stamps) {
      const day = createdAt.toISOString().slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    const perDayRaw = [...buckets.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    return {
      total,
      byAction: byAction.map((r) => ({ action: r.action, count: r._count._all })),
      byEntity: byEntity.map((r) => ({ entity: r.entity, count: r._count._all })),
      byActor: byActor
        .filter((r) => r.performedBy)
        .map((r) => ({ performedBy: r.performedBy as string, count: r._count._all })),
      perDay: perDayRaw,
      perDayTruncated: stamps.length === PER_DAY_SCAN_CAP,
      oldest: oldestRow?.createdAt ?? null,
    };
  }

  /** Distinct values, for the filter dropdowns. */
  static async facets(): Promise<{ actions: string[]; entities: string[]; actors: string[] }> {
    const [actions, entities, actors] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, take: 500 }),
      prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, take: 200 }),
      prisma.auditLog.findMany({
        distinct: ['performedBy'],
        select: { performedBy: true },
        take: 200,
      }),
    ]);
    return {
      actions: actions.map((a) => a.action).sort(),
      entities: entities.map((e) => e.entity).sort(),
      actors: actors
        .map((a) => a.performedBy)
        .filter((a): a is string => !!a)
        .sort(),
    };
  }

  /**
   * Sweep a filtered range and report how much of it still verifies.
   *
   * This is the point of storing a checksum at all: without a way to ask "has
   * anything in here been altered", the column is decoration.
   */
  static async verifyRange(
    filters: AuditFilters,
    max = 10_000
  ): Promise<{
    checked: number;
    valid: number;
    invalid: number;
    unverifiable: number;
    invalidIds: string[];
  }> {
    const rows = await prisma.auditLog.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      take: max,
    });

    let valid = 0;
    let invalid = 0;
    let unverifiable = 0;
    const invalidIds: string[] = [];

    for (const row of rows) {
      const state = checkIntegrity(row);
      if (state === 'valid') valid++;
      else if (state === 'unverifiable') unverifiable++;
      else {
        invalid++;
        if (invalidIds.length < 100) invalidIds.push(row.id);
      }
    }

    if (invalid > 0) {
      logger.error(
        `Audit integrity check FAILED for ${invalid} of ${rows.length} row(s). ` +
          `First offenders: ${invalidIds.slice(0, 5).join(', ')}`
      );
    }
    return { checked: rows.length, valid, invalid, unverifiable, invalidIds };
  }

  /**
   * CSV of the filtered trail. Capped — an unbounded export of a table with a
   * 180-day retention window is a memory problem, not a feature.
   */
  static async exportCsv(filters: AuditFilters, max = 50_000): Promise<string> {
    const rows = await prisma.auditLog.findMany({
      where: buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      take: max,
    });

    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      // Guard against CSV formula injection — a cell starting with = + - @ is
      // executed by Excel and Sheets on open.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const header = [
      'id',
      'createdAt',
      'action',
      'entity',
      'entityId',
      'performedBy',
      'ipAddress',
      'userAgent',
      'integrity',
      'details',
    ].join(',');

    const lines = rows.map((r) =>
      [
        esc(r.id),
        esc(r.createdAt.toISOString()),
        esc(r.action),
        esc(r.entity),
        esc(r.entityId),
        esc(r.performedBy),
        esc(r.ipAddress),
        esc(r.userAgent),
        esc(checkIntegrity(r)),
        esc(r.details),
      ].join(',')
    );

    return [header, ...lines].join('\n');
  }

  /**
   * Verify the integrity of a single audit log entry.
   */
  static async verifyIntegrity(auditLogId: string): Promise<boolean> {
    const log = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
    if (!log) return false;
    return checkIntegrity(log) === 'valid';
  }

  /**
   * Archive audit logs older than a given date (for compliance retention).
   */
  static async archiveLogs(olderThan: Date): Promise<number> {
    const result = await prisma.auditLog.updateMany({
      where: { createdAt: { lt: olderThan }, isArchived: false },
      data: { isArchived: true },
    });
    logger.info(`Archived ${result.count} audit logs older than ${olderThan.toISOString()}`);
    return result.count;
  }
}

/** Exported for tests — the serialisation the checksum depends on. */
export const __testing = { canonicalJson, generateChecksum, checkIntegrity };
