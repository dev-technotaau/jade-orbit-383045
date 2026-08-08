import type { Request, Response, NextFunction } from 'express';
import {
  getTimeSeries,
  getSlaMetrics,
  getAgentProductivity,
  getCostSummary,
  getOptOutTrend,
  getHourlyHeatmap,
  getKeywordBreakdown,
  getChannelHealthHistory,
  getCsatSummary,
} from '../services/whatsapp-analytics.service';
import { getMetaAnalytics } from '../services/whatsapp-meta-analytics.service';

/** Parse a `?days` query param into a positive integer (defaults to 30). */
function parseDays(raw: unknown): number {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** GET /analytics/timeseries — daily message buckets for the last N days. */
export const getMessageTimeSeries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getTimeSeries(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/meta — official Meta Graph analytics (templates / conversations / pricing). */
export const getMeta = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getMetaAnalytics(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/sla — conversation first-response / resolution SLA metrics. */
export const getSla = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getSlaMetrics() });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/agents — per-staff message + conversation productivity. */
export const getAgents = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getAgentProductivity() });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/cost — actual vs. estimated spend + per-category breakdown. */
export const getCost = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getCostSummary() });
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

/** GET /analytics/heatmap — message volume by weekday × hour for the last N days. */
export const getHeatmap = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getHourlyHeatmap(parseDays(req.query.days)) });
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
    res.json({ success: true, data: await getKeywordBreakdown(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/health-history — channel quality/tier snapshots for the last N days. */
export const getHealthHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getChannelHealthHistory(parseDays(req.query.days)) });
  } catch (e) {
    next(e);
  }
};

/** GET /analytics/csat — average CSAT, rated count, and 1-5 distribution. */
export const getCsat = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getCsatSummary() });
  } catch (e) {
    next(e);
  }
};
