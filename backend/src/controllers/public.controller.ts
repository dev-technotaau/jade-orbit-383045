/**
 * Public-API controller — handlers for `/api/v1/public/*`.
 *
 * Auth is optional on every route here; we read `req.user` if present
 * (the optional-auth middleware fills it when a valid token is sent),
 * and pass `authenticated: !!req.user` into the services so sanitisation
 * and the soft-wall behave correctly.
 */
import type { Request, Response, NextFunction } from 'express';
import { searchPublicJobs, getPublicJobBySlug } from '../services/public-jobs.service';
import {
  searchPublicCompanies,
  getPublicCompanyBySlug,
  getCompanyJobs,
} from '../services/public-companies.service';
import { BadRequestError } from '../exceptions';

function isAuthenticated(req: Request): boolean {
  return Boolean((req as any).user?.id);
}

function toInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalise a caller-supplied date to ISO, or drop it.
 *
 * This value goes straight into an Elasticsearch `range` on `createdAt`. It
 * used to be forwarded with only a `typeof === 'string'` check, so anything
 * unparseable reached the query builder and made a PUBLIC endpoint 500.
 *
 * A bare day-count (the frontend's Date Posted filter sends `'7'`) is also
 * wrong here — ES reads a bare number as epoch millis, i.e. 1970, so the filter
 * silently matched everything. Rejecting it is better than pretending: the
 * caller gets unfiltered results rather than a crash, and the frontend fix
 * sends a real ISO date.
 */
function toIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export const searchJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await searchPublicJobs({
      query: typeof q.q === 'string' ? q.q : undefined,
      skills: typeof q.skills === 'string' ? q.skills : undefined,
      designation: typeof q.designation === 'string' ? q.designation : undefined,
      cities: typeof q.cities === 'string' ? q.cities : undefined,
      location: typeof q.location === 'string' ? q.location : undefined,
      experienceMin: toInt(q.experienceMin),
      experienceMax: toInt(q.experienceMax),
      workMode: typeof q.workMode === 'string' ? q.workMode : undefined,
      jobType: typeof q.jobType === 'string' ? q.jobType : undefined,
      industry: typeof q.industry === 'string' ? q.industry : undefined,
      department: typeof q.department === 'string' ? q.department : undefined,
      category: typeof q.category === 'string' ? q.category : undefined,
      qualification: typeof q.qualification === 'string' ? q.qualification : undefined,
      shiftType: typeof q.shiftType === 'string' ? q.shiftType : undefined,
      salaryMin: toInt(q.salaryMin),
      salaryMax: toInt(q.salaryMax),
      postedAfter: toIsoDate(q.postedAfter),
      sortBy: typeof q.sortBy === 'string' ? (q.sortBy as any) : undefined,
      page: toInt(q.page),
      limit: toInt(q.limit),
      authenticated: isAuthenticated(req),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getJobBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug || '');
    if (!slug) throw new BadRequestError('Slug is required');
    const result = await getPublicJobBySlug(slug, isAuthenticated(req));
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const searchCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await searchPublicCompanies({
      query: typeof q.q === 'string' ? q.q : undefined,
      industry: typeof q.industry === 'string' ? q.industry : undefined,
      location: typeof q.location === 'string' ? q.location : undefined,
      city: typeof q.city === 'string' ? q.city : undefined,
      cities: typeof q.cities === 'string' ? q.cities : undefined,
      size: typeof q.size === 'string' ? q.size : undefined,
      category: typeof q.category === 'string' ? q.category : undefined,
      isVerified: q.isVerified === 'true',
      hasOpenJobs: q.hasOpenJobs === 'true',
      featured: q.featured === 'true',
      sortBy: typeof q.sortBy === 'string' ? (q.sortBy as any) : undefined,
      page: toInt(q.page),
      limit: toInt(q.limit),
      authenticated: isAuthenticated(req),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getCompanyBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug || '');
    if (!slug) throw new BadRequestError('Slug is required');
    const userId = (req as { user?: { id?: string } }).user?.id ?? null;
    const result = await getPublicCompanyBySlug(slug, isAuthenticated(req), userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /public/companies/:slug/jobs — paginated, filterable jobs feed
 * for the company-detail Jobs tab. Returns dynamic facets so the
 * filter pills only show options that exist in the company's posted
 * jobs.
 */
export const getCompanyJobsBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug || '');
    if (!slug) throw new BadRequestError('Slug is required');
    const q = req.query;
    const result = await getCompanyJobs({
      slug,
      jobType: typeof q.jobType === 'string' ? q.jobType : undefined,
      workMode: typeof q.workMode === 'string' ? q.workMode : undefined,
      location: typeof q.location === 'string' ? q.location : undefined,
      experienceLevel: typeof q.experienceLevel === 'string' ? q.experienceLevel : undefined,
      department: typeof q.department === 'string' ? q.department : undefined,
      page: toInt(q.page),
      limit: toInt(q.limit),
      authenticated: isAuthenticated(req),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};
