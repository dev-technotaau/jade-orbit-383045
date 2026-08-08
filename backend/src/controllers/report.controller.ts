import type { Request, Response, NextFunction } from 'express';
import { reportService } from '../services/report.service';
import type { ReportSpecBody } from '../schemas/report.schema';

export const exportUsersExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filters = {
      role: req.query.role as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };
    const buffer = await reportService.exportUsersExcel(filters);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="users-report.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportJobsExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };
    const buffer = await reportService.exportJobsExcel(filters);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="jobs-report.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportAnalyticsPdf = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // The date range used to be dropped on the floor here — the PDF was always
    // lifetime totals no matter what the caller asked for.
    const buffer = await reportService.exportAnalyticsPdf({
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-report.pdf"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/* ==================================================================== */
/* Custom report builder (SUPER_ADMIN only — see report.routes.ts)      */
/* ==================================================================== */

/** GET /reports/datasets — catalogue for the builder UI. */
export const listReportDatasets = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: reportService.listDatasets() });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /reports/preview — how many rows the current spec would return.
 * Lets a super-admin see the size (and which PII columns are being withheld)
 * before committing to a download.
 */
export const previewReport = async (
  req: Request<unknown, unknown, ReportSpecBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await reportService.countReport(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /reports/generate — build and stream the file back.
 *
 * POST rather than GET because the spec is a nested object (columns, filters)
 * that does not survive a query string cleanly, and because a URL carrying an
 * `includePii` flag would end up in browser history and access logs.
 */
export const generateReport = async (
  req: Request<unknown, unknown, ReportSpecBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const actor = req.user!;
    const report = await reportService.generateReport(req.body, {
      id: actor.id,
      role: String(actor.role),
    });

    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    // Surfaced as response headers so the UI can report the outcome without
    // parsing a binary body.
    res.setHeader('X-Report-Row-Count', String(report.rowCount));
    res.setHeader('X-Report-Truncated', String(report.truncated));
    res.setHeader('Access-Control-Expose-Headers', 'X-Report-Row-Count, X-Report-Truncated');
    res.send(report.buffer);
  } catch (error) {
    next(error);
  }
};
