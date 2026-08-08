import type { Request, Response, NextFunction } from 'express';
import { deviceService } from '../services/device.service';
import { AppError } from '../middleware/error';

// ===============================
// Register FCM Token
// ===============================
export const registerFcmToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { token, platform, deviceName } = req.body;

    const deviceToken = await deviceService.registerFcmToken(
      req.user.id,
      token,
      platform,
      deviceName
    );

    res.status(201).json({
      status: 'success',
      message: 'FCM token registered successfully',
      data: { deviceToken },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Remove FCM Token
// ===============================
export const removeFcmToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { tokenId } = req.params;

    await deviceService.removeFcmToken(req.user.id, tokenId as string);

    res.status(200).json({
      status: 'success',
      message: 'FCM token removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Register Push Subscription
// ===============================
export const registerPushSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { endpoint, keys, userAgent } = req.body;

    const subscription = await deviceService.registerPushSubscription(
      req.user.id,
      endpoint,
      keys.p256dh,
      keys.auth,
      userAgent
    );

    res.status(201).json({
      status: 'success',
      message: 'Push subscription registered successfully',
      data: { subscription },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Remove Push Subscription
// ===============================
export const removePushSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { id } = req.params;

    await deviceService.removePushSubscription(req.user.id, id as string);

    res.status(200).json({
      status: 'success',
      message: 'Push subscription removed successfully',
    });
  } catch (error) {
    next(error);
  }
};
