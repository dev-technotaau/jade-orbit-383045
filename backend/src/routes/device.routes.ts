import { Router } from 'express';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import * as deviceController from '../controllers/device.controller';
import { registerFcmTokenSchema, registerPushSubscriptionSchema } from '../schemas/device.schema';

const router = Router();

// All device routes require authentication
router.use(protect);

/**
 * @openapi
 * /api/v1/devices/fcm:
 *   post:
 *     tags: [Devices]
 *     summary: Register an FCM device token
 *     security: [{ bearerAuth: [] }]
 */
router.post('/fcm', validate(registerFcmTokenSchema), deviceController.registerFcmToken);

/**
 * @openapi
 * /api/v1/devices/fcm/{tokenId}:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove an FCM device token
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/fcm/:tokenId', deviceController.removeFcmToken);

/**
 * @openapi
 * /api/v1/devices/push-subscriptions:
 *   post:
 *     tags: [Devices]
 *     summary: Register a web push subscription
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/push-subscriptions',
  validate(registerPushSubscriptionSchema),
  deviceController.registerPushSubscription
);

/**
 * @openapi
 * /api/v1/devices/push-subscriptions/{id}:
 *   delete:
 *     tags: [Devices]
 *     summary: Remove a web push subscription
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/push-subscriptions/:id', deviceController.removePushSubscription);

export default router;
