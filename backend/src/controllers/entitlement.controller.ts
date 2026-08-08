import type { Request, Response, NextFunction } from 'express';
import {
  getActiveEntitlementsForUser,
  manuallyGrantEntitlement,
  revokeEntitlement,
} from '../services/entitlement.service';
import { success, created } from '../utils/response';

interface ManualGrantBody {
  userId: string;
  planId: string;
  validityDays: number;
  notes?: string;
}

interface RevokeBody {
  reason: string;
}

export const getMyEntitlements = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const snapshot = await getActiveEntitlementsForUser(req.user!.id);
    success(res, snapshot, 'Entitlements fetched');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Super-admin
// =====================================================================

export const getUserEntitlementsAdmin = async (
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const snapshot = await getActiveEntitlementsForUser(req.params.userId);
    success(res, snapshot, 'Entitlements fetched');
  } catch (err) {
    next(err);
  }
};

export const grantManualEntitlement = async (
  req: Request<unknown, unknown, ManualGrantBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ent = await manuallyGrantEntitlement({
      userId: req.body.userId,
      planId: req.body.planId,
      validityDays: req.body.validityDays,
      notes: req.body.notes,
      createdBy: req.user!.id,
    });
    created(res, ent, 'Entitlement granted');
  } catch (err) {
    next(err);
  }
};

export const revokeEntitlementAdmin = async (
  req: Request<{ id: string }, unknown, RevokeBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ent = await revokeEntitlement({
      entitlementId: req.params.id,
      reason: req.body.reason,
      revokedBy: req.user!.id,
    });
    success(res, ent, 'Entitlement revoked');
  } catch (err) {
    next(err);
  }
};
