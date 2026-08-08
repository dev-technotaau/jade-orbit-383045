import { Router } from 'express';
import { z } from 'zod';
import * as UpgradeController from '../controllers/upgrade.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { requireIdempotencyKey } from '../middleware/idempotency-key';

/**
 * Plan upgrades / downgrades.
 *   POST   /billing/upgrade/preview    — pro-rata + carry-forward + final price
 *   POST   /billing/upgrade            — execute upgrade (creates new order)
 *
 * Downgrades work via the same endpoints; the preview's `changeType` flags
 * which one we're about to do.
 */
const previewBodySchema = z.object({
  toPlanCode: z.string().min(2).max(64),
  buyerStateCode: z.string().length(2).optional(),
  buyerIsIndian: z.boolean().optional(),
});

const executeBodySchema = previewBodySchema.extend({
  notes: z.record(z.string().max(64), z.union([z.string().max(256), z.number()])).optional(),
});

const router = Router();
router.use(protect);

router.post('/preview', validate({ body: previewBodySchema }), UpgradeController.previewUpgrade);

router.post(
  '/',
  requireIdempotencyKey(),
  validate({ body: executeBodySchema }),
  audit('UPGRADE_PLAN', 'Order'),
  UpgradeController.executeUpgrade
);

// ───── Downgrade scheduling (§5.4) ─────
const scheduleDowngradeSchema = z
  .object({
    fromEntitlementId: z.string().uuid().optional(),
    toPlanId: z.string().uuid().optional(),
    toPlanCode: z.string().min(2).max(64).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((b) => Boolean(b.toPlanId || b.toPlanCode), {
    message: 'toPlanId or toPlanCode is required',
  });

const entIdParamsSchema = z.object({ entitlementId: z.string().uuid() });

router.post(
  '/downgrade/schedule',
  validate({ body: scheduleDowngradeSchema }),
  audit('SCHEDULE_DOWNGRADE', 'Entitlement'),
  UpgradeController.scheduleDowngrade
);

router.get(
  '/downgrade/:entitlementId',
  validate({ params: entIdParamsSchema }),
  UpgradeController.getPendingDowngrade
);

router.delete(
  '/downgrade/:entitlementId',
  validate({ params: entIdParamsSchema }),
  audit('CANCEL_PENDING_DOWNGRADE', 'Entitlement'),
  UpgradeController.cancelPendingDowngrade
);

export default router;
