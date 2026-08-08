import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller';
import { validate } from '../validators/validate';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { Role } from '@prisma/client';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookIdSchema,
} from '../schemas/webhook.schema';

const router = Router();

// All webhook routes require authentication
router.use(protect);

// Only EMPLOYER, ADMIN, and SUPER_ADMIN can manage webhooks
router.use(restrictTo(Role.EMPLOYER, Role.ADMIN, Role.SUPER_ADMIN));

router.post('/', validate(createWebhookSchema), webhookController.createWebhook);
router.get('/', webhookController.listWebhooks);
router.get('/:id', validate(webhookIdSchema), webhookController.getWebhook);
router.patch('/:id', validate(updateWebhookSchema), webhookController.updateWebhook);
router.delete('/:id', validate(webhookIdSchema), webhookController.deleteWebhook);
router.get('/:id/deliveries', validate(webhookIdSchema), webhookController.getDeliveries);
router.post('/:id/test', validate(webhookIdSchema), webhookController.testWebhook);

export default router;
