/**
 * Report dataset KIT — the shared types and value-coercion helpers every
 * dataset file builds on.
 *
 * Split out of `report-datasets.ts` once the catalogue outgrew a single file:
 * the datasets now live in `report-datasets.ts` (core platform + revenue) and
 * `report-datasets-extra.ts` (messaging, ledgers, ops and metrics), and both
 * import from here. Keeping the types in a leaf module avoids a circular
 * import between the two dataset files and the registry index.
 *
 * Original notes follow.
 *
 * Report dataset registry.
 *
 * The reports page used to offer exactly three fixed exports (users, jobs,
 * analytics) with no column, filter or range control — and the `role`/`status`/
 * `startDate`/`endDate` params the controller accepted were never sent by the
 * UI, so every export silently dumped a whole table.
 *
 * This registry is the data half of the replacement: one entry per reportable
 * dataset, declaring
 *   · which date fields a range can be applied to,
 *   · which filters the UI should offer (options come from the Prisma enums, so
 *     they cannot drift from the schema),
 *   · which columns exist, which are on by default, and which are PII, and
 *   · how to count and page the rows.
 *
 * Design notes for anyone adding a dataset:
 *
 *   1. `count` and `page` call Prisma DIRECTLY with a typed `select`. That is
 *      deliberate — a loose delegate wrapper would let a mistyped field name
 *      through to runtime, where Prisma throws "Unknown field". Typed selects
 *      make that a compile error instead.
 *   2. `page` must return primitives only (string | number | boolean | null).
 *      The writers stringify whatever they are given; nested objects would
 *      serialise as "[object Object]".
 *   3. Mark every column that carries contact details, financial identifiers or
 *      free-text a person wrote about themselves as `pii: true`. Those are
 *      withheld unless the caller explicitly opts in, and that opt-in is
 *      audited — see `report.service.ts`.
 *   4. Filter `key` must be a real Prisma field on the model, because the
 *      generic where-builder assigns `where[key] = value` verbatim.
 */
import type { Prisma } from '@prisma/client';
import { Role } from '@prisma/client';

/**
 * Roles a user-facing export may contain.
 *
 * Staff accounts are deliberately absent. A "users report" means the platform's
 * USERS — candidates and employers — and an admin roster is a different thing
 * with a different audience: it carries every admin's email, mobile and
 * last-login, which is exactly the admin-management data that is never
 * delegable to an ADMIN (the registry marks `users.admins.*` superAdminOnly).
 * Leaving staff in meant anyone holding `reports.exports.users` could download
 * the full admin roster as a spreadsheet, sidestepping that rule entirely.
 *
 * Super-admins who want the admin list have /super-admin/admins, which is the
 * surface built for it.
 */
export const EXPORTABLE_USER_ROLES: Role[] = [Role.CANDIDATE, Role.EMPLOYER];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ReportColumnDef {
  key: string;
  label: string;
  /**
   * Contact details, financial identifiers or personal free text. Withheld
   * unless the run opts in, and the opt-in is written to the audit log.
   */
  pii?: boolean;
  /** Selected when the caller sends no explicit column list. */
  default?: boolean;
}

export interface ReportFilterDef {
  key: string;
  label: string;
  kind: 'enum' | 'boolean';
  /** Allowed values for `enum`, sourced from the Prisma enum so it can't drift. */
  options?: string[];
}

export interface ReportDateFieldDef {
  key: string;
  label: string;
}

/** Where-clause + paging window handed to a dataset's `count` / `page`. */
export interface DatasetQuery {
  where: Record<string, unknown>;
  skip: number;
  take: number;
}

export interface ReportDatasetDef {
  key: string;
  label: string;
  group: string;
  description: string;
  /** First entry is the default the UI pre-selects. */
  dateFields: ReportDateFieldDef[];
  filters: ReportFilterDef[];
  columns: ReportColumnDef[];
  count(q: Pick<DatasetQuery, 'where'>): Promise<number>;
  page(q: DatasetQuery): Promise<Record<string, unknown>[]>;
}

/* ------------------------------------------------------------------ */
/* Value coercion — writers expect primitives                          */
/* ------------------------------------------------------------------ */

/** ISO string for a date, or null. Keeps CSV/JSON stable and sortable. */
export const dt = (v: Date | null | undefined): string | null => v?.toISOString() ?? null;

/** Paise → rupees, as a number so spreadsheets can sum the column. */
export const rupees = (paise: number | null | undefined): number | null =>
  paise == null ? null : paise / 100;

/** Prisma Decimal | number | null → number | null. */
export const num = (v: Prisma.Decimal | number | null | undefined): number | null => {
  if (v == null) return null;
  return typeof v === 'number' ? v : Number(v);
};

/** String[] → comma-joined, so array columns stay one cell. */
export const list = (v: string[] | null | undefined): string | null =>
  v && v.length > 0 ? v.join(', ') : null;

export const fullName = (
  p: { firstName?: string | null; lastName?: string | null } | null | undefined
): string | null => {
  if (!p) return null;
  const n = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return n || null;
};

export const enumOptions = (e: Record<string, string>): string[] => Object.values(e);
