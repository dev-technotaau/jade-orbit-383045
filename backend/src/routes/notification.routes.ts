import { Router } from 'express';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import * as notificationController from '../controllers/notification.controller';
import { listNotificationsSchema, markReadSchema } from '../schemas/notification.schema';

const router = Router();

// All notification routes require authentication
router.use(protect);

// Static paths MUST come before /:id routes

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get user notifications (paginated)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', validate(listNotificationsSchema), notificationController.getNotifications);

/**
 * @openapi
 * /api/v1/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get unread notification count
 *     security: [{ bearerAuth: [] }]
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @openapi
 * /api/v1/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * @openapi
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/read', validate(markReadSchema), notificationController.markAsRead);

export default router;
