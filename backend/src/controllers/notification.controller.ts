import type { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { AppError } from '../middleware/error';

// ===============================
// Get Notifications (paginated)
// ===============================
export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { isRead, category, type, page, limit } = req.query;

    const filters = {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      category: category as string | undefined,
      type: type as string | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    };

    const result = await notificationService.getNotifications(req.user.id, filters);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Mark Single Notification as Read
// ===============================
export const markAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { id } = req.params;

    await notificationService.markAsRead(req.user.id, id as string);

    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Mark All Notifications as Read
// ===============================
export const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    await notificationService.markAllAsRead(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Get Unread Count
// ===============================
export const getUnreadCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const count = await notificationService.getUnreadCount(req.user.id, category);

    res.status(200).json({
      status: 'success',
      data: { count },
    });
  } catch (error) {
    next(error);
  }
};
