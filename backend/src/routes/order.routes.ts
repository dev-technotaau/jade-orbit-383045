import { Router } from 'express';
import * as OrderController from '../controllers/order.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { requireIdempotencyKey } from '../middleware/idempotency-key';
import {
  createOrderBodySchema,
  verifyOrderBodySchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
} from '../validators/order.validator';

/**
 * `/api/v1/billing/orders/*`
 *
 *   POST   /                    create Razorpay order (idempotency required)
 *   POST   /:id/verify          verify razorpay_signature, mark PAID
 *   GET    /                    list authed user's orders
 *   GET    /:id                 fetch one order with payments+invoices+refunds
 *   POST   /:id/cancel          cancel a pending (CREATED/ATTEMPTED) order
 */
const router = Router();

router.use(protect);

router.post(
  '/',
  requireIdempotencyKey(),
  validate({ body: createOrderBodySchema }),
  audit('CREATE_ORDER', 'Order'),
  OrderController.createOrder
);

router.post(
  '/:id/verify',
  validate({ params: orderIdParamsSchema, body: verifyOrderBodySchema }),
  audit('VERIFY_ORDER_PAYMENT', 'Order'),
  OrderController.verifyOrder
);

router.get('/', validate({ query: listOrdersQuerySchema }), OrderController.listOrders);

router.get('/:id', validate({ params: orderIdParamsSchema }), OrderController.getOrder);

router.post(
  '/:id/cancel',
  validate({ params: orderIdParamsSchema }),
  audit('CANCEL_ORDER', 'Order'),
  OrderController.cancelOrder
);

router.post(
  '/:id/retry',
  validate({ params: orderIdParamsSchema }),
  audit('BILLING_ORDER_RETRIED', 'Order'),
  OrderController.retryOrder
);

export default router;
