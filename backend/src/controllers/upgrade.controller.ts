import type { Request, Response, NextFunction } from 'express';
import * as UpgradeService from '../services/upgrade.service';
import * as DowngradeService from '../services/downgrade.service';
import { success, created, noContent } from '../utils/response';
import { commitIdempotency } from '../middleware/idempotency-key';

interface PreviewBody {
  toPlanCode: string;
  buyerStateCode?: string;
  buyerIsIndian?: boolean;
}

interface ExecuteBody extends PreviewBody {
  notes?: Record<string, string | number>;
}

export const previewUpgrade = async (
  req: Request<unknown, unknown, PreviewBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const preview = await UpgradeService.previewUpgrade({
      userId: req.user!.id,
      toPlanCode: req.body.toPlanCode,
      buyerStateCode: req.body.buyerStateCode,
      buyerIsIndian: req.body.buyerIsIndian,
    });
    success(res, preview, 'Upgrade preview computed');
  } catch (err) {
    next(err);
  }
};

export const executeUpgrade = async (
  req: Request<unknown, unknown, ExecuteBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const idemKey =
      (req as Request & { __idemKey?: string }).__idemKey ??
      `upgrade-${req.user!.id}-${Date.now()}`;
    const result = await UpgradeService.executeUpgrade({
      userId: req.user!.id,
      toPlanCode: req.body.toPlanCode,
      buyerStateCode: req.body.buyerStateCode,
      buyerIsIndian: req.body.buyerIsIndian,
      idempotencyKey: idemKey,
      notes: req.body.notes,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      deviceFingerprint: req.get('x-device-fingerprint') ?? undefined,
    });

    const responseBody = {
      success: true as const,
      data: {
        upgradeChangeId: result.upgradeChangeId,
        order: {
          id: result.order.id,
          status: result.order.status,
          totalPaise: result.order.totalPaise,
          currency: result.order.currency,
          receiptNumber: result.order.receiptNumber,
          prorationPaise: result.order.prorationPaise,
          taxPaise: result.order.taxPaise,
        },
        razorpay: result.razorpay,
        zeroAmountAutoApply: result.zeroAmountAutoApply,
        preview: result.preview,
      },
      message: result.zeroAmountAutoApply
        ? 'Upgrade applied — no payment required'
        : 'Upgrade order created — proceed to payment',
    };

    await commitIdempotency(req as Request, 201, responseBody);
    res.status(201).json(responseBody);
    void created;
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Downgrade scheduling (§5.4)
// =====================================================================

export const scheduleDowngrade = async (
  req: Request<
    unknown,
    unknown,
    { fromEntitlementId?: string; toPlanId?: string; toPlanCode?: string; notes?: string }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await DowngradeService.scheduleDowngrade({
      userId: req.user!.id,
      fromEntitlementId: req.body.fromEntitlementId,
      toPlanId: req.body.toPlanId,
      toPlanCode: req.body.toPlanCode,
      notes: req.body.notes,
    });
    success(res, result, 'Downgrade scheduled — effective at end of current period');
  } catch (err) {
    next(err);
  }
};

export const getPendingDowngrade = async (
  req: Request<{ entitlementId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await DowngradeService.getPendingDowngrade({
      userId: req.user!.id,
      entitlementId: req.params.entitlementId,
    });
    success(res, result, result ? 'Pending downgrade found' : 'No pending downgrade');
  } catch (err) {
    next(err);
  }
};

export const cancelPendingDowngrade = async (
  req: Request<{ entitlementId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await DowngradeService.cancelPendingDowngrade({
      userId: req.user!.id,
      entitlementId: req.params.entitlementId,
    });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
