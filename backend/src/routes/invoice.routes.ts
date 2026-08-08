import { Router } from 'express';
import { z } from 'zod';
import * as InvoiceController from '../controllers/invoice.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { Role, InvoiceStatus } from '@prisma/client';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';

const idParamsSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(InvoiceStatus).optional(),
});
const adminListQuerySchema = listQuerySchema.extend({
  userId: z.string().uuid().optional(),
});

// User-facing
const userRouter = Router();
userRouter.use(protect);
userRouter.get('/', validate({ query: listQuerySchema }), InvoiceController.listMyInvoices);
userRouter.get('/:id', validate({ params: idParamsSchema }), InvoiceController.getMyInvoice);
userRouter.get(
  '/:id/pdf',
  validate({ params: idParamsSchema }),
  InvoiceController.downloadMyInvoicePdf
);

// Super-admin
const superAdminRouter = Router();
superAdminRouter.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
superAdminRouter.use(trackAdminActivity);
superAdminRouter.get(
  '/',
  requirePermission('billing.invoices.view'),
  validate({ query: adminListQuerySchema }),
  InvoiceController.listAllInvoicesAdmin
);
superAdminRouter.post(
  '/:id/void',
  requirePermission('billing.invoices.regenerate'),
  validate({
    params: idParamsSchema,
    body: z.object({ reason: z.string().min(2).max(500) }),
  }),
  audit('VOID_INVOICE', 'Invoice'),
  InvoiceController.voidInvoiceAdmin
);
superAdminRouter.post(
  '/:id/regenerate',
  requirePermission('billing.invoices.regenerate'),
  validate({ params: idParamsSchema }),
  audit('REGENERATE_INVOICE_PDF', 'Invoice'),
  InvoiceController.regenerateInvoicePdf
);

export { userRouter as invoiceUserRouter, superAdminRouter as invoiceSuperAdminRouter };
export default userRouter;
