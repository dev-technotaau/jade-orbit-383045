import type { Request, Response, NextFunction } from 'express';
import {
  listSuppressions,
  streamSuppressionsForExport,
  importSuppressions,
  addSuppression,
  removeSuppression,
} from '../services/whatsapp-suppression.service';
import { safeCsvCell } from '../utils/whatsapp-csv';
import logger from '../config/logger';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, q } = req.query;
    const result = await listSuppressions({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      q: (q as string) || undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * Bulk-load a supplied do-not-contact list (one POST, up to 5000 numbers).
 *
 * Compliance lists arrive as files, not as one number typed at a time — without
 * this a legally supplied DNC list could not be honoured at all.
 */
export const importList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await importSuppressions({
      phones: (req.body.phones ?? []) as string[],
      reason: req.body.reason,
      createdBy: req.user?.id ?? null,
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

/**
 * Wait for the response socket to drain.
 *
 * Without this the export writes every page as fast as Postgres returns it and
 * Node buffers whatever the client has not read yet, which puts the whole file
 * back in memory for any operator on a slow connection — the very thing
 * streaming is here to avoid. Also settles when the client goes away, so a
 * cancelled download cannot leave this awaiting a 'drain' that will never fire.
 */
function waitForDrain(res: Response): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

/**
 * The suppression list as CSV, so it can be handed to an auditor or a partner.
 *
 * Streamed page by page rather than joined into one string: the list is
 * unbounded (see `streamSuppressionsForExport`), and a six-figure DNC list must
 * not have to fit in the heap twice before the download starts.
 */
export const exportList = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const q = (req.query.q as string) || undefined;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wa-suppressions.csv"');
  let clientGone = false;
  res.once('close', () => {
    clientGone = true;
  });
  // safeCsvCell guards against both CSV-structure breakage and formula injection.
  res.write(`${['phone', 'reason', 'createdAt'].map(safeCsvCell).join(',')}\n`);
  try {
    for await (const page of streamSuppressionsForExport({ q })) {
      // The operator cancelled the download; stop paging the table for a file
      // nobody is reading any more.
      if (clientGone) return;
      const chunk = page
        .map((r) => [r.phone, r.reason ?? '', r.createdAt.toISOString()].map(safeCsvCell).join(','))
        .join('\n');
      if (!res.write(`${chunk}\n`)) await waitForDrain(res);
    }
    res.end();
  } catch (e) {
    // Rows are already on the wire, so the JSON error envelope can no longer be
    // sent and `next(e)` would throw inside the error handler. Destroying the
    // response truncates the chunked body, which makes the download FAIL for the
    // client instead of landing as a short file that looks complete.
    logger.error(`WhatsApp suppression export failed mid-stream: ${(e as Error).message}`);
    res.destroy(e as Error);
  }
};

export const add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const suppression = await addSuppression({
      phone: req.body.phone,
      reason: req.body.reason,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: suppression });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await removeSuppression(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
