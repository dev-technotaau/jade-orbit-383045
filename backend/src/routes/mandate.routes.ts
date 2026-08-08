import { Router } from 'express';
import { z } from 'zod';
import * as MandateController from '../controllers/mandate.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';

const router = Router();
router.use(protect);

const idParamsSchema = z.object({ id: z.string().uuid() });

router.get('/', MandateController.list);

router.get('/:id', validate({ params: idParamsSchema }), MandateController.get);

router.post(
  '/:id/cancel',
  validate({ params: idParamsSchema }),
  audit('CANCEL_MANDATE', 'Mandate'),
  MandateController.cancel
);

export default router;
