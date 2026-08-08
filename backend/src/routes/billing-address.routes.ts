import { Router } from 'express';
import { z } from 'zod';
import * as BillingAddressController from '../controllers/billing-address.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';

const router = Router();
router.use(protect);

const idParamsSchema = z.object({ id: z.string().uuid() });

const addressBodySchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).optional().nullable(),
  city: z.string().min(2).max(80),
  stateName: z.string().min(2).max(80),
  stateCode: z.string().regex(/^[0-9]{2}$/, '2-digit GST state code'),
  pincode: z.string().regex(/^[0-9]{6}$/, '6-digit pincode'),
  country: z.string().max(80).optional(),
  countryCode: z.string().length(2).optional(),
  gstNumber: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional()
    .nullable(),
  legalName: z.string().max(120).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const updateBodySchema = addressBodySchema.partial();

router.get('/', BillingAddressController.list);

router.post(
  '/',
  validate({ body: addressBodySchema }),
  audit('CREATE_BILLING_ADDRESS', 'BillingAddress'),
  BillingAddressController.create
);

router.get('/:id', validate({ params: idParamsSchema }), BillingAddressController.get);

router.patch(
  '/:id',
  validate({ params: idParamsSchema, body: updateBodySchema }),
  audit('UPDATE_BILLING_ADDRESS', 'BillingAddress'),
  BillingAddressController.update
);

router.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  audit('DELETE_BILLING_ADDRESS', 'BillingAddress'),
  BillingAddressController.remove
);

router.post(
  '/:id/default',
  validate({ params: idParamsSchema }),
  audit('SET_DEFAULT_BILLING_ADDRESS', 'BillingAddress'),
  BillingAddressController.setDefault
);

export default router;
