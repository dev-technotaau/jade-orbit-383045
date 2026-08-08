import { Router } from 'express';
import { z } from 'zod';
import * as PaymentMethodController from '../controllers/payment-method.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';

const router = Router();
router.use(protect);

const idParamsSchema = z.object({ id: z.string().uuid() });

router.get('/', PaymentMethodController.listMethods);
router.post(
  '/:id/default',
  validate({ params: idParamsSchema }),
  audit('SET_DEFAULT_PAYMENT_METHOD', 'PaymentMethodToken'),
  PaymentMethodController.setDefault
);
router.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  audit('REMOVE_PAYMENT_METHOD', 'PaymentMethodToken'),
  PaymentMethodController.remove
);

export default router;
