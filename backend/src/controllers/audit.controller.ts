import type { Request, Response } from 'express';
import { AuditService, type AuditFilters } from '../services/audit.service';
import { AppError } from '../middleware/error';
import { asyncHandler } from '../utils/async-handler';

/**
 * Audit trail — the read side.
 *
 * The module records 71 distinct actions across 65 routes and, until now, had
 * no way to read any of it back: the only consumer of the `AuditLog` table was
 * the retention cron that deletes from it. That made the trail write-only — the
 * failed-unlock history, every campaign launch, every contact erasure, all
 * landing in Postgres reachable only through a database client.
 */

/** Parse and bound the shared filter set. */
function parseFilters(req: Request): AuditFilters {
  const q = req.query as Record<string, string | undefined>;

  const date = (v: string | undefined, label: string): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw new AppError(`\`${label}\` is not a valid date`, 400, 'WA_AUDIT_BAD_DATE');
    }
    return d;
  };

  const from = date(q.from, 'from');
  const to = date(q.to, 'to');
  if (from && to && from > to) {
    throw new AppError('`from` is after `to`', 400, 'WA_AUDIT_BAD_RANGE');
  }

  return {
    action: q.action || undefined,
    entity: q.entity || undefined,
    entityId: q.entityId || undefined,
    performedBy: q.performedBy || undefined,
    ipAddress: q.ipAddress || undefined,
    q: q.q?.trim() || undefined,
    from,
    to,
    includeArchived: q.includeArchived === 'true',
  };
}

/** GET /whatsapp/audit — paginated, filtered, integrity-checked. */
export const listAudit = asyncHandler(async (req: Request, res: Response) => {
  const filters = parseFilters(req);
  const page = parseInt((req.query.page as string) || '1', 10) || 1;
  const limit = parseInt((req.query.limit as string) || '50', 10) || 50;

  const data = await AuditService.list(filters, page, limit);
  res.status(200).json({ success: true, data });
});

/** GET /whatsapp/audit/stats — headline counts + a 30-day series. */
export const auditStats = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await AuditService.stats(parseFilters(req)) });
});

/** GET /whatsapp/audit/facets — distinct values for the filter dropdowns. */
export const auditFacets = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await AuditService.facets() });
});

/**
 * GET /whatsapp/audit/verify — re-hash the filtered range.
 *
 * The answer to "has anything in here been altered". Without it the checksum
 * column is decoration.
 */
export const verifyAudit = asyncHandler(async (req: Request, res: Response) => {
  const data = await AuditService.verifyRange(parseFilters(req));
  // A tampered trail is not a 200-and-carry-on situation; make it loud in the
  // payload so the UI can shout rather than render a quiet number.
  res.status(200).json({ success: true, data: { ...data, tampered: data.invalid > 0 } });
});

/** GET /whatsapp/audit/export — CSV of the filtered trail. */
export const exportAudit = asyncHandler(async (req: Request, res: Response) => {
  const csv = await AuditService.exportCsv(parseFilters(req));
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.csv"`);
  res.status(200).send(csv);
});

/** GET /whatsapp/audit/:id — one entry, with its full detail payload. */
export const getAuditEntry = asyncHandler(async (req: Request, res: Response) => {
  const row = await AuditService.getById(String(req.params.id));
  if (!row) throw new AppError('Audit entry not found', 404, 'WA_AUDIT_NOT_FOUND');
  res.status(200).json({ success: true, data: row });
});
