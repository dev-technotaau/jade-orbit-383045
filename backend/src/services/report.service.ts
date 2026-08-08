import { prisma } from '../config/prisma';
import { Role, JobStatus } from '@prisma/client';
import { describeDatasets, getDataset } from './report-datasets';
import { EXPORTABLE_USER_ROLES } from './report-dataset-kit';
import type { ReportColumnDef, ReportDatasetDef } from './report-dataset-kit';
import { BadRequestError, NotFoundError } from '../exceptions';
import logger from '../config/logger';

/* ==================================================================== */
/* Custom report builder                                                */
/* ==================================================================== */

export type ReportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';

export interface ReportSpec {
  dataset: string;
  /** Column keys to include. Empty/omitted → the dataset's defaults. */
  columns?: string[];
  /** Which date field the range applies to. Defaults to the dataset's first. */
  dateField?: string;
  /**
   * Absolute instants. The CLIENT resolves presets ("last 7 days") in the
   * viewer's timezone and sends the resulting instants, so the server never has
   * to guess a timezone — and a report re-run from a saved URL is reproducible.
   */
  from?: string;
  to?: string;
  /** `{ prismaField: value }`, validated against the dataset's filter defs. */
  filters?: Record<string, string | boolean>;
  format?: ReportFormat;
  /** Hard row ceiling for this run. Clamped to MAX_ROWS. */
  limit?: number;
  /**
   * Opt in to contact / financial / personal-text columns. Off by default, and
   * every run records the choice in the audit log.
   */
  includePii?: boolean;
}

export interface GeneratedReport {
  buffer: Buffer;
  filename: string;
  contentType: string;
  rowCount: number;
  /** True when the row cap cut the result short. */
  truncated: boolean;
}

/** Absolute ceiling, whatever the caller asks for — keeps a run bounded. */
const MAX_ROWS = 100_000;
/** Applied when the caller does not specify a limit. */
const DEFAULT_ROWS = 5_000;
/** Page size for the batched fetch loop, so no run materialises a whole table. */
const BATCH = 1_000;

const CONTENT_TYPES: Record<ReportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
};

/**
 * `{ gte, lte }` for a createdAt-style filter, or undefined when neither bound
 * is given. Shared by the quick exports so all three interpret a range the same
 * way. Invalid dates are ignored rather than throwing — these are query params
 * on a download link, and a bad one should not 500 the export.
 */
function buildCreatedAtRange(filters?: {
  startDate?: string;
  endDate?: string;
}): { gte?: Date; lte?: Date } | undefined {
  if (!filters?.startDate && !filters?.endDate) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (filters.startDate) {
    const d = new Date(filters.startDate);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (filters.endDate) {
    const d = new Date(filters.endDate);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return range.gte || range.lte ? range : undefined;
}

/** CSV cell escaping: quote when the value contains a delimiter, quote or newline. */
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

class ReportService {
  /**
   * Generate users report data (structured for Excel export)
   */
  async generateUsersReport(filters?: { role?: Role; startDate?: string; endDate?: string }) {
    const where: any = {};

    // Staff never appear in a users export — see EXPORTABLE_USER_ROLES. An
    // explicit `role` narrows WITHIN that set rather than replacing it, so a
    // crafted `?role=ADMIN` yields nothing instead of the admin roster.
    where.role = { in: EXPORTABLE_USER_ROLES };
    if (filters?.role && EXPORTABLE_USER_ROLES.includes(filters.role)) {
      where.role = filters.role;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isEmailVerified: true,
        isMobileVerified: true,
        isActive: true,
        isSuspended: true,
        mobileNumber: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Return structured data that can be converted to Excel/CSV
    const headers = [
      'ID',
      'Email',
      'First Name',
      'Last Name',
      'Role',
      'Email Verified',
      'Mobile',
      'Mobile Verified',
      'Active',
      'Suspended',
      'Created At',
      'Last Login',
    ];
    const rows = users.map((u) => [
      u.id,
      u.email,
      u.firstName || '',
      u.lastName || '',
      u.role,
      u.isEmailVerified ? 'Yes' : 'No',
      u.mobileNumber || '',
      u.isMobileVerified ? 'Yes' : 'No',
      u.isActive ? 'Yes' : 'No',
      u.isSuspended ? 'Yes' : 'No',
      u.createdAt.toISOString(),
      u.lastLoginAt?.toISOString() || 'Never',
    ]);

    return { headers, rows, totalCount: users.length };
  }

  /**
   * Generate jobs report data
   */
  async generateJobsReport(filters?: { status?: JobStatus; startDate?: string; endDate?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const jobs = await prisma.jobPost.findMany({
      where,
      include: {
        company: { select: { companyName: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'ID',
      'Title',
      'Company',
      'Location',
      'Type',
      'Status',
      'Salary Range',
      'Experience',
      'Applications',
      'Views',
      'Created At',
      'Expires At',
    ];
    const rows = jobs.map((j) => [
      j.id,
      j.title,
      j.company.companyName,
      j.location,
      j.type,
      j.status,
      `${Number(j.salaryMin || 0)} - ${Number(j.salaryMax || 0)} ${j.currency}`,
      `${j.experienceMin} - ${j.experienceMax || 'Any'} yrs`,
      j._count.applications,
      j.views,
      j.createdAt.toISOString(),
      j.expiresAt?.toISOString() || 'None',
    ]);

    return { headers, rows, totalCount: jobs.length };
  }

  /**
   * Generate analytics summary report.
   *
   * `filters` is optional and additive: with no range this returns lifetime
   * totals exactly as it always did, so the existing no-argument callers are
   * unaffected. With a range, every count is scoped to rows CREATED in it —
   * which is what "platform activity between these dates" means for each of
   * these entities.
   */
  async generateAnalyticsSummary(filters?: { startDate?: string; endDate?: string }) {
    const range = buildCreatedAtRange(filters);
    const scoped = <T extends Record<string, unknown>>(where: T) =>
      range ? { ...where, createdAt: range } : where;

    // JobApplication stamps `appliedAt`, not `createdAt`.
    const appWhere = range ? { appliedAt: range } : {};

    const [
      totalUsers,
      totalCandidates,
      totalEmployers,
      totalAdmins,
      suspendedUsers,
      verifiedEmailUsers,
      totalJobs,
      activeJobs,
      totalApplications,
      verifiedEmployers,
      totalCompanies,
    ] = await prisma.$transaction([
      prisma.user.count({ where: scoped({}) }),
      prisma.user.count({ where: scoped({ role: Role.CANDIDATE }) }),
      prisma.user.count({ where: scoped({ role: Role.EMPLOYER }) }),
      prisma.user.count({ where: scoped({ role: Role.ADMIN }) }),
      prisma.user.count({ where: scoped({ isSuspended: true }) }),
      prisma.user.count({ where: scoped({ isEmailVerified: true }) }),
      prisma.jobPost.count({ where: scoped({}) }),
      prisma.jobPost.count({ where: scoped({ status: JobStatus.OPEN }) }),
      prisma.jobApplication.count({ where: appWhere }),
      prisma.companyProfile.count({ where: scoped({ isVerified: true }) }),
      prisma.companyProfile.count({ where: scoped({}) }),
    ]);

    // ── Breakdowns ──
    // `groupBy` rather than a count per enum member: one query each instead of
    // 4–9, and it stays correct when an enum gains a value.
    const [jobsByStatus, jobsByType, jobsByWorkMode, appsByStatus, verificationsByStatus] =
      await Promise.all([
        prisma.jobPost.groupBy({ by: ['status'], where: scoped({}), _count: { _all: true } }),
        prisma.jobPost.groupBy({ by: ['type'], where: scoped({}), _count: { _all: true } }),
        prisma.jobPost.groupBy({ by: ['workMode'], where: scoped({}), _count: { _all: true } }),
        prisma.jobApplication.groupBy({
          by: ['status'],
          where: appWhere,
          _count: { _all: true },
        }),
        prisma.verificationRequest.groupBy({
          by: ['status'],
          where: scoped({}),
          _count: { _all: true },
        }),
      ]);

    // ── Top-N ──
    const [topLocationsRaw, topCompaniesRaw] = await Promise.all([
      prisma.jobPost.groupBy({
        by: ['location'],
        where: scoped({}),
        _count: { _all: true },
        orderBy: { _count: { location: 'desc' } },
        take: 10,
      }),
      prisma.jobPost.groupBy({
        by: ['companyId'],
        where: scoped({}),
        _count: { _all: true },
        orderBy: { _count: { companyId: 'desc' } },
        take: 10,
      }),
    ]);

    const companyNames = new Map<string, string>();
    if (topCompaniesRaw.length) {
      const rows = await prisma.companyProfile.findMany({
        where: { id: { in: topCompaniesRaw.map((c) => c.companyId).filter(Boolean) as string[] } },
        select: { id: true, companyName: true },
      });
      for (const r of rows) companyNames.set(r.id, r.companyName);
    }

    // ── Daily trend ──
    // Bounded to 90 days so an "all time" export cannot pull every row on the
    // platform into memory just to bucket it. Only the timestamp is selected.
    const TREND_DAYS = 90;
    const trendEnd = range?.lte ?? new Date();
    const earliestAllowed = new Date(trendEnd.getTime() - (TREND_DAYS - 1) * 86400000);
    const trendStart = range?.gte && range.gte > earliestAllowed ? range.gte : earliestAllowed;
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    const [trendUsers, trendJobs, trendApps] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: trendStart, lte: trendEnd } },
        select: { createdAt: true },
      }),
      prisma.jobPost.findMany({
        where: { createdAt: { gte: trendStart, lte: trendEnd } },
        select: { createdAt: true },
      }),
      prisma.jobApplication.findMany({
        where: { appliedAt: { gte: trendStart, lte: trendEnd } },
        select: { appliedAt: true },
      }),
    ]);

    const buckets = new Map<string, { users: number; jobs: number; applications: number }>();
    const bump = (d: Date, field: 'users' | 'jobs' | 'applications') => {
      const k = dayKey(d);
      const b = buckets.get(k) ?? { users: 0, jobs: 0, applications: 0 };
      b[field] += 1;
      buckets.set(k, b);
    };
    trendUsers.forEach((r) => bump(r.createdAt, 'users'));
    trendJobs.forEach((r) => bump(r.createdAt, 'jobs'));
    trendApps.forEach((r) => bump(r.appliedAt, 'applications'));

    const trend = [...buckets.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) =>
      rows
        .map((r) => ({ label: String(r[key] ?? 'Unspecified'), count: r._count._all }))
        .sort((a, b) => b.count - a.count);

    return {
      summary: {
        totalUsers,
        totalCandidates,
        totalEmployers,
        totalAdmins,
        suspendedUsers,
        verifiedEmailUsers,
        totalCompanies,
        verifiedEmployers,
        totalJobs,
        activeJobs,
        totalApplications,
        applicationsPerJob: totalJobs > 0 ? +(totalApplications / totalJobs).toFixed(2) : 0,
      },
      jobsByStatus: count(jobsByStatus, 'status'),
      jobsByType: count(jobsByType, 'type'),
      jobsByWorkMode: count(jobsByWorkMode, 'workMode'),
      applicationsByStatus: count(appsByStatus, 'status'),
      verificationsByStatus: count(verificationsByStatus, 'status'),
      topLocations: count(topLocationsRaw, 'location'),
      topCompanies: topCompaniesRaw.map((c) => ({
        label: companyNames.get(c.companyId ?? '') ?? 'Unknown company',
        count: c._count._all,
      })),
      trend,
      trendFrom: dayKey(trendStart),
      trendTo: dayKey(trendEnd),
      periodStart: filters?.startDate ?? null,
      periodEnd: filters?.endDate ?? null,
      generatedAt: new Date().toISOString(),
    };
  }
  /**
   * Export users report as Excel
   */
  async exportUsersExcel(filters?: {
    role?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const data = await this.generateUsersReport(filters as any);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users Report');

    // Header row with styling
    sheet.addRow(data.headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Data rows
    data.rows.forEach((row) => sheet.addRow(row));

    // Auto-width columns
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = Math.min(len, 50);
      });
      col.width = maxLen + 2;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Export jobs report as Excel
   */
  async exportJobsExcel(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const data = await this.generateJobsReport(filters as any);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Jobs Report');

    sheet.addRow(data.headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    data.rows.forEach((row) => sheet.addRow(row));

    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = Math.min(len, 50);
      });
      col.width = maxLen + 2;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Export analytics summary as PDF
   */
  async exportAnalyticsPdf(filters?: { startDate?: string; endDate?: string }): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const summary = await this.generateAnalyticsSummary(filters);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(20).text('Hire Adda - Analytics Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${summary.generatedAt}`, { align: 'center' });
      if (summary.periodStart || summary.periodEnd) {
        doc
          .fontSize(10)
          .text(
            `Period: ${summary.periodStart ? new Date(summary.periodStart).toDateString() : 'start'} to ${
              summary.periodEnd ? new Date(summary.periodEnd).toDateString() : 'now'
            }`,
            { align: 'center' }
          );
      } else {
        doc.fontSize(10).text('Period: all time', { align: 'center' });
      }
      doc.moveDown(1.5);

      /* ── Layout helpers ───────────────────────────────────────────────
         pdfkit auto-paginates text but not our two-column rows, so each
         writer checks the remaining height first. Without this the tables
         ran off the bottom of page 1 and the rest of the report was simply
         invisible — which is what "only a few lines" looked like. */
      const BOTTOM = doc.page.height - doc.page.margins.bottom;
      const LEFT = doc.page.margins.left;
      const RIGHT = doc.page.width - doc.page.margins.right;

      const ensure = (needed: number) => {
        if (doc.y + needed > BOTTOM) doc.addPage();
      };

      const section = (heading: string) => {
        ensure(60);
        doc.moveDown(0.8);
        doc.fontSize(13).fillColor('#111').text(heading, { underline: true });
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor('#333');
      };

      /** Label on the left, right-aligned value on the right. */
      const row = (label: string, value: string | number) => {
        ensure(16);
        const y = doc.y;
        doc.text(String(label), LEFT, y, { width: (RIGHT - LEFT) * 0.62, continued: false });
        doc.text(String(value), LEFT + (RIGHT - LEFT) * 0.62, y, {
          width: (RIGHT - LEFT) * 0.38,
          align: 'right',
        });
        doc.y = y + 14;
      };

      /** A labelled breakdown, with a total and an empty-state line. */
      const breakdown = (heading: string, rows: { label: string; count: number }[]) => {
        section(heading);
        if (!rows.length) {
          doc.fillColor('#777').text('No data in this period.');
          doc.fillColor('#333');
          return;
        }
        const total = rows.reduce((a, r) => a + r.count, 0);
        for (const r of rows) {
          const pct = total > 0 ? ` (${((r.count / total) * 100).toFixed(1)}%)` : '';
          row(r.label, `${r.count}${pct}`);
        }
        if (rows.length > 1) {
          ensure(18);
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold');
          row('Total', total);
          doc.font('Helvetica');
        }
      };

      const s = summary.summary;

      section('Platform Summary');
      row('Total Users', s.totalUsers);
      row('  Candidates', s.totalCandidates);
      row('  Employers', s.totalEmployers);
      row('  Admins', s.totalAdmins);
      row('Suspended Users', s.suspendedUsers);
      row('Email-Verified Users', s.verifiedEmailUsers);
      row('Companies', s.totalCompanies);
      row('  Verified Companies', s.verifiedEmployers);
      row('Total Jobs', s.totalJobs);
      row('  Active (open) Jobs', s.activeJobs);
      row('Total Applications', s.totalApplications);
      row('Applications per Job', s.applicationsPerJob);

      breakdown('Jobs by Status', summary.jobsByStatus);
      breakdown('Jobs by Type', summary.jobsByType);
      breakdown('Jobs by Work Mode', summary.jobsByWorkMode);
      breakdown('Applications by Status', summary.applicationsByStatus);
      breakdown('Verifications by Status', summary.verificationsByStatus);
      breakdown('Top Locations by Job Count', summary.topLocations);
      breakdown('Top Companies by Job Count', summary.topCompanies);

      // Daily trend last, because it is the longest table.
      section(`Daily Activity (${summary.trendFrom} to ${summary.trendTo})`);
      if (!summary.trend.length) {
        doc.fillColor('#777').text('No activity in this period.');
        doc.fillColor('#333');
      } else {
        ensure(20);
        doc.font('Helvetica-Bold');
        const hy = doc.y;
        const col = (RIGHT - LEFT) / 4;
        doc.text('Date', LEFT, hy, { width: col });
        doc.text('New Users', LEFT + col, hy, { width: col, align: 'right' });
        doc.text('New Jobs', LEFT + col * 2, hy, { width: col, align: 'right' });
        doc.text('Applications', LEFT + col * 3, hy, { width: col, align: 'right' });
        doc.y = hy + 14;
        doc.font('Helvetica');

        for (const t of summary.trend) {
          ensure(16);
          const y = doc.y;
          doc.text(t.date, LEFT, y, { width: col });
          doc.text(String(t.users), LEFT + col, y, { width: col, align: 'right' });
          doc.text(String(t.jobs), LEFT + col * 2, y, { width: col, align: 'right' });
          doc.text(String(t.applications), LEFT + col * 3, y, { width: col, align: 'right' });
          doc.y = y + 13;
        }
      }

      doc.end();
    });
  }

  /* ================================================================== */
  /* Custom report builder                                              */
  /*                                                                    */
  /* Everything above this line is the ORIGINAL three fixed exports and */
  /* stays byte-for-byte as it was — the /reports/{users,jobs,analytics} */
  /* endpoints still call it, and ADMIN still reaches those. The methods */
  /* below power the new SUPER_ADMIN-only builder.                       */
  /* ================================================================== */

  /** Dataset catalogue for the builder UI (metadata only, no query fns). */
  listDatasets() {
    return describeDatasets();
  }

  /**
   * Resolve a spec into the dataset, the effective column list and the Prisma
   * where clause. Shared by `countReport` and `generateReport` so the row
   * estimate the UI shows and the file it downloads can never disagree.
   */
  private resolveSpec(spec: ReportSpec): {
    dataset: ReportDatasetDef;
    columns: ReportColumnDef[];
    where: Record<string, unknown>;
    withheldPii: string[];
  } {
    const dataset = getDataset(spec.dataset);
    if (!dataset) throw new NotFoundError(`Unknown report dataset "${spec.dataset}"`);

    /* ---- Columns ---- */
    const requested =
      spec.columns && spec.columns.length > 0
        ? spec.columns
        : dataset.columns.filter((c) => c.default).map((c) => c.key);

    const unknown = requested.filter((k) => !dataset.columns.some((c) => c.key === k));
    if (unknown.length > 0) {
      throw new BadRequestError(`Unknown column(s) for ${dataset.key}: ${unknown.join(', ')}`);
    }

    // Preserve the dataset's declared order rather than the request order, so
    // two runs with the same columns produce identically-shaped files.
    let columns = dataset.columns.filter((c) => requested.includes(c.key));

    // PII gate. Withheld columns are reported back rather than silently dropped.
    const withheldPii: string[] = [];
    if (!spec.includePii) {
      columns = columns.filter((c) => {
        if (c.pii) {
          withheldPii.push(c.key);
          return false;
        }
        return true;
      });
    }
    if (columns.length === 0) {
      throw new BadRequestError(
        withheldPii.length > 0
          ? 'Every selected column is PII. Enable "include personal data" or pick other columns.'
          : 'Select at least one column.'
      );
    }

    /* ---- Where: date range + filters ---- */
    const where: Record<string, unknown> = {};

    if (spec.from || spec.to) {
      const dateField = spec.dateField ?? dataset.dateFields[0]?.key;
      if (!dateField || !dataset.dateFields.some((f) => f.key === dateField)) {
        throw new BadRequestError(`"${dateField}" is not a date field on ${dataset.key}`);
      }
      const range: Record<string, Date> = {};
      if (spec.from) {
        const d = new Date(spec.from);
        if (Number.isNaN(d.getTime())) throw new BadRequestError('`from` is not a valid date');
        range.gte = d;
      }
      if (spec.to) {
        const d = new Date(spec.to);
        if (Number.isNaN(d.getTime())) throw new BadRequestError('`to` is not a valid date');
        range.lte = d;
      }
      if (range.gte && range.lte && range.gte > range.lte) {
        throw new BadRequestError('`from` must be before `to`');
      }
      where[dateField] = range;
    }

    for (const [key, value] of Object.entries(spec.filters ?? {})) {
      const def = dataset.filters.find((f) => f.key === key);
      if (!def) throw new BadRequestError(`Unknown filter "${key}" for ${dataset.key}`);
      if (value === '' || value == null) continue; // "any" — leave unconstrained
      if (def.kind === 'boolean') {
        where[key] = typeof value === 'boolean' ? value : value === 'true';
      } else {
        const v = String(value);
        if (def.options && !def.options.includes(v)) {
          throw new BadRequestError(`"${v}" is not a valid value for ${key}`);
        }
        where[key] = v;
      }
    }

    return { dataset, columns, where, withheldPii };
  }

  /** Row estimate for the builder, so a super-admin sees the size before running. */
  async countReport(spec: ReportSpec): Promise<{ count: number; withheldPii: string[] }> {
    const { dataset, where, withheldPii } = this.resolveSpec(spec);
    return { count: await dataset.count({ where }), withheldPii };
  }

  /**
   * Build the report. Rows are fetched in pages of `BATCH` up to the effective
   * limit so a large dataset never lands in memory all at once.
   */
  async generateReport(
    spec: ReportSpec,
    actor: { id: string; role: string }
  ): Promise<GeneratedReport> {
    const { dataset, columns, where, withheldPii } = this.resolveSpec(spec);
    const format: ReportFormat = spec.format ?? 'csv';
    const limit = Math.min(Math.max(1, spec.limit ?? DEFAULT_ROWS), MAX_ROWS);

    const total = await dataset.count({ where });
    const target = Math.min(total, limit);

    const rows: Record<string, unknown>[] = [];
    for (let skip = 0; skip < target; skip += BATCH) {
      const take = Math.min(BATCH, target - skip);
      rows.push(...(await dataset.page({ where, skip, take })));
    }

    const truncated = total > target;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${dataset.key}-report-${stamp}.${format}`;

    const buffer = await this.writeReport(format, dataset, columns, rows, {
      truncated,
      total,
      includePii: Boolean(spec.includePii),
    });

    /* Audit every run. The PII decision is the point of the record — it is what
       makes a later "who exported customer emails, and when?" answerable. */
    void (async () => {
      try {
        const { AuditService } = await import('./audit.service');
        await AuditService.log({
          action: 'ADMIN_REPORT_GENERATED',
          entity: 'Report',
          entityId: dataset.key,
          performedBy: actor.id,
          details: {
            dataset: dataset.key,
            format,
            rowCount: rows.length,
            totalMatching: total,
            truncated,
            includePii: Boolean(spec.includePii),
            piiColumnsIncluded: spec.includePii
              ? columns.filter((c) => c.pii).map((c) => c.key)
              : [],
            piiColumnsWithheld: withheldPii,
            columns: columns.map((c) => c.key),
            dateField: spec.dateField ?? null,
            from: spec.from ?? null,
            to: spec.to ?? null,
            filters: spec.filters ?? {},
            actorRole: actor.role,
          },
        });
      } catch (err) {
        logger.warn('Report audit log failed', { err });
      }
    })();

    logger.info('Report generated', {
      dataset: dataset.key,
      format,
      rowCount: rows.length,
      includePii: Boolean(spec.includePii),
      actorId: actor.id,
    });

    return {
      buffer,
      filename,
      contentType: CONTENT_TYPES[format],
      rowCount: rows.length,
      truncated,
    };
  }

  /** Serialise rows in the requested format. */
  private async writeReport(
    format: ReportFormat,
    dataset: ReportDatasetDef,
    columns: ReportColumnDef[],
    rows: Record<string, unknown>[],
    meta: { truncated: boolean; total: number; includePii: boolean }
  ): Promise<Buffer> {
    const headers = columns.map((c) => c.label);
    const keys = columns.map((c) => c.key);

    if (format === 'json') {
      return Buffer.from(
        JSON.stringify(
          {
            dataset: dataset.key,
            label: dataset.label,
            generatedAt: new Date().toISOString(),
            rowCount: rows.length,
            totalMatching: meta.total,
            truncated: meta.truncated,
            includesPersonalData: meta.includePii,
            columns: columns.map((c) => ({ key: c.key, label: c.label, pii: Boolean(c.pii) })),
            rows: rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null]))),
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    if (format === 'csv') {
      const lines = [headers.map(csvCell).join(',')];
      for (const row of rows) lines.push(keys.map((k) => csvCell(row[k])).join(','));
      // BOM so Excel opens UTF-8 (₹, accented names) correctly on Windows.
      return Buffer.from('﻿' + lines.join('\r\n'), 'utf-8');
    }

    if (format === 'xlsx') {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(dataset.label.slice(0, 31) || 'Report');

      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      for (const row of rows) sheet.addRow(keys.map((k) => row[k] ?? null));

      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > maxLen) maxLen = Math.min(len, 50);
        });
        col.width = maxLen + 2;
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    // ---- PDF ----
    const PDFDocument = (await import('pdfkit')).default;
    return new Promise<Buffer>((resolve, reject) => {
      // Landscape: tabular reports are wider than tall.
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(`Hire Adda — ${dataset.label}`, { align: 'left' });
      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .fillColor('#555')
        .text(
          `Generated ${new Date().toISOString()} · ${rows.length} of ${meta.total} rows` +
            (meta.truncated ? ' (truncated)' : '') +
            (meta.includePii ? ' · includes personal data' : '')
        );
      doc.moveDown(0.8);
      doc.fillColor('#000');

      const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = usable / columns.length;
      const rowHeight = 16;

      const drawHeader = () => {
        doc.fontSize(8).font('Helvetica-Bold');
        let x = doc.page.margins.left;
        const y = doc.y;
        for (const h of headers) {
          doc.text(String(h), x + 2, y, { width: colWidth - 4, height: rowHeight, ellipsis: true });
          x += colWidth;
        }
        doc
          .moveTo(doc.page.margins.left, y + rowHeight - 4)
          .lineTo(doc.page.width - doc.page.margins.right, y + rowHeight - 4)
          .strokeColor('#cccccc')
          .stroke();
        doc.y = y + rowHeight;
        doc.font('Helvetica');
      };

      drawHeader();
      for (const row of rows) {
        if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawHeader();
        }
        let x = doc.page.margins.left;
        const y = doc.y;
        doc.fontSize(8);
        for (const k of keys) {
          const v = row[k];
          doc.text(v == null ? '' : String(v), x + 2, y, {
            width: colWidth - 4,
            height: rowHeight,
            ellipsis: true,
          });
          x += colWidth;
        }
        doc.y = y + rowHeight;
      }

      doc.end();
    });
  }
}

export const reportService = new ReportService();
