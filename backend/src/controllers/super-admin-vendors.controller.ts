import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/super-admin-team-vendor.service';
import { AppError, BadRequestError } from '../exceptions';
import { hasPermission } from '../middleware/require-permission';
import { Role } from '@prisma/client';

const parseBool = (v: unknown): boolean | undefined => {
  if (v === undefined) return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.listVendors({
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      isVerified: parseBool(req.query.isVerified),
      isPublic: parseBool(req.query.isPublic),
      hasActiveSub: parseBool(req.query.hasActiveSub),
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.getVendorDetail(String(req.params.id));

    // ── Field-level scoping ──
    // The route is gated on `vendors.view`, which means "read this vendor's
    // profile". The payload carried three things that are NOT that:
    //   • `leads` — 50 rows naming the EMPLOYER (id, email, name) who sent
    //     each hiring requirement, plus the job they were hiring for
    //   • `contactReveals` / `revealCount` — the VENDOR_LEAD reveal ledger
    //   • `reviews` — 100 rows naming the REVIEWER (id, email, name)
    // All three are third-party PII belonging to people who are not the
    // vendor. Same shape as the verification documents and the employer
    // contact fields: the sensitive part rides inside a payload gated by the
    // list key, so the narrow key never gets a chance to mean anything.
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const canLeads = isSuper || (await hasPermission(req, 'vendors.leads'));
    const canReviews = isSuper || (await hasPermission(req, 'vendors.reviews.view'));

    res.status(200).json({
      status: 'success',
      data: {
        ...result,
        leads: canLeads ? result.leads : [],
        contactReveals: canLeads ? result.contactReveals : [],
        revealCount: canLeads ? result.revealCount : 0,
        leadsRedacted: !canLeads && result.leads.length > 0,
        reviews: canReviews ? result.reviews : [],
        reviewsRedacted: !canReviews && result.reviews.length > 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const setVerified = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const v = await svc.setVendorVerified({
      superAdminUserId: req.user.id,
      vendorProfileId: String(req.params.id),
      isVerified: Boolean(req.body?.isVerified),
    });
    res.status(200).json({ status: 'success', data: v });
  } catch (err) {
    next(err);
  }
};

export const setVisibility = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const v = await svc.setVendorVisibility({
      superAdminUserId: req.user.id,
      vendorProfileId: String(req.params.id),
      isPublic: Boolean(req.body?.isPublic),
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    res.status(200).json({ status: 'success', data: v });
  } catch (err) {
    next(err);
  }
};

export const deleteReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const reviewId = String(req.params.reviewId);
    if (!reviewId) throw new BadRequestError('reviewId required');
    await svc.moderateDeleteReview({
      superAdminUserId: req.user.id,
      reviewId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};

// Combined teams + vendors analytics — lives in the vendors controller
// because the SA dashboard tile is in the vendor area, but the data is
// pulled from the shared service.
export const analytics = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await svc.getAnalytics();
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};
