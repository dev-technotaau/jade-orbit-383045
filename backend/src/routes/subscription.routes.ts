import { Router } from 'express';
import * as SubscriptionController from '../controllers/subscription.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { requireIdempotencyKey } from '../middleware/idempotency-key';
import {
  createSubscriptionBodySchema,
  subscriptionIdParamsSchema,
  cancelSubscriptionBodySchema,
  pauseSubscriptionBodySchema,
  toggleAutoRenewBodySchema,
} from '../validators/subscription.validator';

/**
 * `/api/v1/billing/subscriptions/*`
 *
 *   POST   /                            create subscription (idempotent)
 *   GET    /                            list authed user's subscriptions
 *   GET    /:id                         fetch one subscription with events + payments
 *   POST   /:id/cancel                  cancel (default: at cycle end)
 *   POST   /:id/pause                   pause (Razorpay subscription only)
 *   POST   /:id/resume                  resume from pause
 *   POST   /:id/toggle-autorenew        flip auto-renew flag
 */
const router = Router();
router.use(protect);

router.post(
  '/',
  requireIdempotencyKey(),
  validate({ body: createSubscriptionBodySchema }),
  audit('CREATE_SUBSCRIPTION', 'Subscription'),
  SubscriptionController.createSubscription
);

router.get('/', SubscriptionController.listSubscriptions);

router.get(
  '/:id',
  validate({ params: subscriptionIdParamsSchema }),
  SubscriptionController.getSubscription
);

router.post(
  '/:id/cancel',
  validate({ params: subscriptionIdParamsSchema, body: cancelSubscriptionBodySchema }),
  audit('CANCEL_SUBSCRIPTION', 'Subscription'),
  SubscriptionController.cancelSubscription
);

router.post(
  '/:id/pause',
  validate({ params: subscriptionIdParamsSchema, body: pauseSubscriptionBodySchema }),
  audit('PAUSE_SUBSCRIPTION', 'Subscription'),
  SubscriptionController.pauseSubscription
);

router.post(
  '/:id/resume',
  validate({ params: subscriptionIdParamsSchema }),
  audit('RESUME_SUBSCRIPTION', 'Subscription'),
  SubscriptionController.resumeSubscription
);

router.post(
  '/:id/toggle-autorenew',
  validate({ params: subscriptionIdParamsSchema, body: toggleAutoRenewBodySchema }),
  audit('TOGGLE_SUBSCRIPTION_AUTORENEW', 'Subscription'),
  SubscriptionController.toggleAutoRenew
);

export default router;
