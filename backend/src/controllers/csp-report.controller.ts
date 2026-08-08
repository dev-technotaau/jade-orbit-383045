import type { Request, Response } from 'express';
import logger from '../config/logger';

/**
 * Handle CSP violation reports from browsers.
 *
 * Supports two formats:
 * 1. Legacy report-uri (application/csp-report): { "csp-report": { ... } }
 * 2. Reporting API v1 (application/reports+json): [{ type, body: { ... } }]
 */
export const handleCspReport = (req: Request, res: Response): void => {
  const body = req.body;

  // Reporting API v1 format — array of report objects
  if (Array.isArray(body)) {
    for (const entry of body) {
      if (entry.type === 'csp-violation' && entry.body) {
        const r = entry.body;
        logger.warn('CSP Violation Report (v1)', {
          documentUri: r.documentURL,
          violatedDirective: r.effectiveDirective,
          blockedUri: r.blockedURL,
          sourceFile: r.sourceFile,
          lineNumber: r.lineNumber,
          columnNumber: r.columnNumber,
          disposition: r.disposition,
        });
      }
    }
  } else {
    // Legacy report-uri format — { "csp-report": { ... } } or flat object
    const report = body?.['csp-report'] || body;

    if (report) {
      logger.warn('CSP Violation Report', {
        documentUri: report['document-uri'],
        violatedDirective: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        sourceFile: report['source-file'],
        lineNumber: report['line-number'],
        columnNumber: report['column-number'],
      });
    }
  }

  // Allow cross-origin CSP reports (frontend → backend are different origins in dev)
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(204).send();
};
