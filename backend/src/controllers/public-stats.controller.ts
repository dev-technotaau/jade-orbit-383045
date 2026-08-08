/**
 * Public-stats controller — feeds the homepage discovery widgets.
 *
 *   GET /public/company-categories/stats
 *   GET /public/companies/featured
 *   GET /public/role-counts?roles=role1,role2,...
 */
import type { Request, Response, NextFunction } from 'express';
import {
  listCompanyCategoryStats,
  listFeaturedCompanies,
  countJobsForRoles,
  getSitemapLastmods,
} from '../services/public-stats.service';

export const companyCategoryStats = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const items = await listCompanyCategoryStats();
    res.status(200).json({ status: 'success', data: { items } });
  } catch (err) {
    next(err);
  }
};

export const featuredCompanies = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 15, 50);
    const items = await listFeaturedCompanies(limit);
    res.status(200).json({ status: 'success', data: { items } });
  } catch (err) {
    next(err);
  }
};

export const roleCounts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rolesQ = req.query.roles;
    let roles: string[] = [];
    if (typeof rolesQ === 'string') {
      roles = rolesQ
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(rolesQ)) {
      roles = rolesQ.map((s) => String(s).trim()).filter(Boolean);
    }
    const items = await countJobsForRoles(roles);
    res.status(200).json({ status: 'success', data: { items } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /public/sitemap-lastmod
 *
 * Newest `updatedAt` per sitemap dataset, so `/sitemap-index.xml` can stamp each
 * child with a real change time instead of the render time. Anonymous-safe: it
 * returns timestamps only, no content.
 */
export const sitemapLastmods = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getSitemapLastmods();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
