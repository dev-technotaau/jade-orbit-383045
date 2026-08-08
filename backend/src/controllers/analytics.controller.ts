import type { Request, Response, NextFunction } from 'express';
import { bigqueryService } from '../services/bigquery.service';

/**
 * GET /api/v1/analytics/advanced/user-growth
 */
export const getUserGrowth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await bigqueryService.queryUserGrowth(
      (startDate as string) || new Date(Date.now() - 30 * 86400000).toISOString(),
      (endDate as string) || new Date().toISOString()
    );

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/analytics/advanced/application-funnel
 */
export const getApplicationFunnel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await bigqueryService.queryApplicationFunnel(
      (startDate as string) || new Date(Date.now() - 30 * 86400000).toISOString(),
      (endDate as string) || new Date().toISOString()
    );

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/analytics/advanced/popular-skills
 */
export const getPopularSkills = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await bigqueryService.queryPopularSkills(limit);

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/analytics/advanced/salary-trends
 */
export const getSalaryTrends = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { industry, location } = req.query;
    const data = await bigqueryService.querySalaryTrends(
      industry as string | undefined,
      location as string | undefined
    );

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/analytics/advanced/job-trends
 */
export const getJobTrends = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await bigqueryService.queryJobPostingTrends(
      (startDate as string) || new Date(Date.now() - 30 * 86400000).toISOString(),
      (endDate as string) || new Date().toISOString()
    );

    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
