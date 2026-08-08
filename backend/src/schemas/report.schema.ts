import { z } from 'zod';
import { JobStatus, Role } from '@prisma/client';

/**
 * Quick-export query params.
 *
 * `role` and `status` are validated against the Prisma enums rather than left as
 * free strings: an unrecognised value used to reach Prisma and surface as a 500,
 * where it should be a 400. Everything stays optional, so an unfiltered export
 * behaves exactly as it always did.
 */
export const exportReportSchema = z.object({
  query: z.object({
    role: z.enum(Role).optional(),
    status: z.enum(JobStatus).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

/* ------------------------------------------------------------------ */
/* Custom report builder                                              */
/* ------------------------------------------------------------------ */

/**
 * A filter value is either an enum string or a boolean. The service validates
 * each key against the dataset's declared filters, so this stays permissive on
 * shape and strict on membership downstream.
 */
const reportFilterValue = z.union([z.string().max(120), z.boolean()]);

const reportSpecBody = z.object({
  dataset: z.string().min(1).max(64),
  columns: z.array(z.string().min(1).max(64)).max(80).optional(),
  dateField: z.string().min(1).max(64).optional(),
  /** Absolute instants — the client resolves presets in the viewer's timezone. */
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  filters: z.record(z.string().max(64), reportFilterValue).optional(),
  format: z.enum(['csv', 'xlsx', 'json', 'pdf']).optional(),
  limit: z.coerce.number().int().min(1).max(100_000).optional(),
  /** Opt in to PII columns. Audited on every run. */
  includePii: z.boolean().optional(),
});

export const generateReportSchema = z.object({ body: reportSpecBody });

/** Same spec, used for the row-count preview the builder shows before running. */
export const previewReportSchema = z.object({ body: reportSpecBody });

export type ReportSpecBody = z.infer<typeof reportSpecBody>;
