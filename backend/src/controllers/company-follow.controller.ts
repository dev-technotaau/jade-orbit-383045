/**
 * Controller for company follow/unfollow + follower listings.
 *
 * Routes (mounted at /api/v1):
 *   - POST   /companies/:idOrSlug/follow         — auth, candidate
 *   - DELETE /companies/:idOrSlug/follow         — auth, candidate
 *   - GET    /companies/:idOrSlug/follow-status  — auth optional
 *   - GET    /candidate/following/companies      — auth, candidate
 *   - GET    /candidate/following/jobs           — auth, candidate
 *   - GET    /employer/followers                 — auth, employer
 */
import type { Request, Response, NextFunction } from 'express';
import {
  follow as followSvc,
  unfollow as unfollowSvc,
  getStatus as getStatusSvc,
  resolveCompanyRef,
  listFollowedCompanies as listFollowedCompaniesSvc,
  listFollowedCompanyJobs as listFollowedCompanyJobsSvc,
  listFollowers as listFollowersSvc,
} from '../services/company-follow.service';
import { AppError, BadRequestError, NotFoundError } from '../exceptions';

function authedUserId(req: Request): string {
  const id = (req as { user?: { id?: string } }).user?.id;
  if (!id) throw new AppError('Authentication required', 401);
  return id;
}

function optionalUserId(req: Request): string | null {
  return (req as { user?: { id?: string } }).user?.id ?? null;
}

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function resolveOrThrow(idOrSlug: string) {
  const ref = await resolveCompanyRef(
    looksLikeUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  );
  if (!ref) throw new NotFoundError('Company not found');
  return ref;
}

export const followCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    // Self-follow guard — employers shouldn't follow their own company.
    if (company.userId === userId) {
      throw new BadRequestError('You cannot follow your own company');
    }
    const status = await followSvc(userId, company.id);
    res.status(200).json({ status: 'success', data: status });
  } catch (err) {
    next(err);
  }
};

export const unfollowCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const status = await unfollowSvc(userId, company.id);
    res.status(200).json({ status: 'success', data: status });
  } catch (err) {
    next(err);
  }
};

export const getFollowStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = optionalUserId(req);
    const idOrSlug = String(req.params.idOrSlug || '');
    if (!idOrSlug) throw new BadRequestError('Company id or slug required');
    const company = await resolveOrThrow(idOrSlug);
    const status = await getStatusSvc(userId, company.id);
    res.status(200).json({ status: 'success', data: status });
  } catch (err) {
    next(err);
  }
};

export const listFollowedCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const sort: 'recent' | 'name' | 'open_jobs' | undefined =
      sortRaw === 'name' || sortRaw === 'open_jobs' || sortRaw === 'recent' ? sortRaw : undefined;
    const result = await listFollowedCompaniesSvc({
      userId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      sort,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const listFollowedJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const result = await listFollowedCompanyJobsSvc({
      userId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const listEmployerFollowers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authedUserId(req);
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const sort: 'recent' | 'name' | undefined =
      sortRaw === 'name' || sortRaw === 'recent' ? sortRaw : undefined;
    const result = await listFollowersSvc({
      employerUserId: userId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      sort,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};
