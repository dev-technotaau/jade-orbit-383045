import type { Request, Response, NextFunction } from 'express';
import {
  getTimeSeries,
  getSlaMetrics,
  getAgentProductivity,
  getCostSummary,
  getOptOutTrend,
  getOptOutSummary,
  getHourlyHeatmap,
  getKeywordBreakdown,
  getChannelHealthHistory,
  getCsatSummary,
  getCtwaReport,
  getCtwaContacts,
  getSegmentPerformance,
  getCohortReport,
  buildAnalyticsReport,
  analyticsReportToCsv,
  clampDays,
  clampMonths,
} from '../services/whatsapp-analytics.service';
import type { WaHeatmapDirection } from '../services/whatsapp-analytics.service';
import { getClickSeries } from '../services/whatsapp-shortlink.service';
import { getMetaAnalytics, clampMetaDays } from '../services/whatsapp-meta-analytics.service';

/**
 * CSV cell shared by the exports below: quotes what needs quoting and defuses a
 * leading =, +, - or @, which Excel and Sheets treat as a formula.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Parse a `?days` query param into a positive integer (defaults to 30).
 *
 * Clamped with the same helper the DB aggregates use. The DB endpoints defended
 * themselves downstream, but the Meta endpoint passed the raw number straight to
 * Graph and into a per-`days` Redis key — so `?days=100000` asked Meta for a
 * 274-year window (an error the panel rendered as "not available") and minted a
 * fresh 30-minute cache entry for every value tried.
 */
function parseDays(raw: unknown): number {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? clampDays(n) : 30;
}

/**
 * Same, but `undefined` when no window was asked for.
 *
 * The SLA / agent / cost / CSAT endpoints are lifetime aggregates by default —
 * substituting 30 days for a missing param would silently change what an
 * existing caller gets back.
 */
function parseOptionalDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? clampDays(n) : undefined;
}

/**
 * Parse `?channelId` — which connected WhatsApp number an aggregate is about.
 *
 * `undefined` means every number, which is what a single-number deployment
 * always sees and what every existing caller sent. Not validated against the
 * channel table here: an unknown id simply matches no messages, and the queries
 * bind it as a parameter.
 */
function parseChannelId(raw: unknown): string | undefined {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v || undefined;
}

/**
 * Parse `?months` for the cohort report, defaulting to six.
 *
 * Cohorts are counted in months rather than days on purpose — a retention curve
 * over a seven-day window is one point — so this is a separate parameter with its
 * own bound rather than a reuse of `?days`.
 */
function parseMonths(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 6;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? clampMonths(n) : 6;
}

/** GET /analytics/timeseries — daily message buckets for the last N days. */
export const getMessageTimeSeries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getTimeSeries(parseDays(req.query.days), parseChannelId(req.query.channelId)),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/meta — official Meta Graph analytics (templates / conversations / pricing). */
export const getMeta = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Meta's window is tighter than our own 365-day ceiling — clamp to what
    // Graph will answer so a wider dashboard range degrades to 90 days of real
    // numbers instead of an error banner.
    res.json({
      success: true,
      data: await getMetaAnalytics(clampMetaDays(parseDays(req.query.days))),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/sla — conversation first-response / resolution SLA metrics. */
export const getSla = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getSlaMetrics(parseOptionalDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/agents — per-staff message + conversation productivity. */
export const getAgents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getAgentProductivity(parseOptionalDays(req.query.days)),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/cost — actual vs. estimated spend + per-category breakdown. */
export const getCost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getCostSummary(
        parseOptionalDays(req.query.days),
        parseChannelId(req.query.channelId)
      ),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/optout — daily opt-out counts for the last N days. */
export const getOptOut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getOptOutTrend(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/**
 * Parse `?direction` for the heatmap. Anything unrecognised falls back to the
 * inbound default rather than erroring — the panel polls this every minute, and
 * a 400 would blank the card instead of drawing the view the operator wanted.
 */
function parseHeatmapDirection(raw: unknown): WaHeatmapDirection {
  const v = String(raw ?? '').toUpperCase();
  return v === 'OUTBOUND' || v === 'ALL' ? v : 'INBOUND';
}

/**
 * GET /analytics/heatmap — message volume by weekday × hour for the last N days.
 *
 * `?direction=INBOUND` (default) | `OUTBOUND` | `ALL`.
 */
export const getHeatmap = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await getHourlyHeatmap(
      parseDays(req.query.days),
      parseHeatmapDirection(req.query.direction),
      parseChannelId(req.query.channelId)
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/keywords — top words from recent inbound messages. */
export const getKeywords = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getKeywordBreakdown(
        parseDays(req.query.days),
        20,
        parseChannelId(req.query.channelId)
      ),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /analytics/health-history — quality/tier snapshots for the last N days.
 *
 * `channelId` picks which connected number; omitted means the default one.
 */
export const getHealthHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelId = (req.query.channelId as string) || undefined;
    res.json({
      success: true,
      data: await getChannelHealthHistory(parseDays(req.query.days), channelId),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /analytics/segments — per-saved-segment performance, plus campaigns split
 * by how their audience was chosen.
 *
 * Lifetime by default like the other summary endpoints; `?days` scopes it and
 * `?channelId` picks one connected number.
 */
export const getSegments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getSegmentPerformance(
        parseOptionalDays(req.query.days),
        parseChannelId(req.query.channelId)
      ),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/cohorts — acquisition cohorts by month (`?months`, default 6). */
export const getCohorts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await getCohortReport(
        parseMonths(req.query.months),
        parseChannelId(req.query.channelId)
      ),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/csat — average CSAT, rated count, and 1-5 distribution. */
export const getCsat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getCsatSummary(parseOptionalDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/optout-summary — opt-out rate + per-campaign attribution. */
export const getOptOutSummaryReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getOptOutSummary(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/clicks — daily short-link click series. */
export const getClicks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getClickSeries(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/ctwa — click-to-WhatsApp acquisition by ad source. */
export const getCtwa = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getCtwaReport(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /analytics/ctwa/export — one row per CTWA-acquired contact, with the
 * ctwa_clid Meta's Ads Manager joins offline conversions on. That id was already
 * in the database and there was no way to get it back out.
 */
export const exportCtwa = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rows = await getCtwaContacts(parseDays(req.query.days));
    const csv = [
      [
        'phone',
        'name',
        'ctwaClid',
        'sourceId',
        'sourceType',
        'headline',
        // Both dates, because they answer different questions: which ad first
        // brought them in, and which ad this clid belongs to.
        'firstClickAt',
        'lastClickAt',
        'createdAt',
      ]
        .map(csvCell)
        .join(','),
      ...rows.map((r) =>
        [
          r.phone,
          r.name,
          r.ctwaClid,
          r.ctwaSourceId,
          r.ctwaSourceType,
          r.ctwaHeadline,
          r.ctwaFirstClickAt ? r.ctwaFirstClickAt.toISOString() : '',
          r.ctwaLastClickAt ? r.ctwaLastClickAt.toISOString() : '',
          r.createdAt.toISOString(),
        ]
          .map(csvCell)
          .join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wa-ctwa-contacts.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /analytics/export?days&format=csv|json — the whole dashboard as one file.
 *
 * There was no export of any kind, so an operator running campaigns for a client
 * had to screenshot the page to report on it.
 */
export const exportAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const days = parseDays(req.query.days);
    const report = await buildAnalyticsReport(days);
    const stamp = report.generatedAt.slice(0, 10);
    if (String(req.query.format ?? 'csv').toLowerCase() === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="wa-analytics-${days}d-${stamp}.json"`
      );
      res.send(JSON.stringify(report, null, 2));
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wa-analytics-${days}d-${stamp}.csv"`
    );
    res.send(analyticsReportToCsv(report));
  } catch (e) {
    next(e);
  }
};
