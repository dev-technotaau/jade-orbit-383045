import type { Request, Response, NextFunction } from 'express';
import * as SubscriptionService from '../services/subscription.service';
import { success, created } from '../utils/response';
import type {
  CreateSubscriptionBody,
  CancelSubscriptionBody,
  PauseSubscriptionBody,
  ToggleAutoRenewBody,
} from '../validators/subscription.validator';

export const createSubscription = async (
  req: Request<unknown, unknown, CreateSubscriptionBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SubscriptionService.createSubscription({
      userId: req.user!.id,
      planCode: req.body.planCode,
      totalCount: req.body.totalCount ?? null,
      startAt: req.body.startAt ? new Date(req.body.startAt) : null,
      customerNotify: req.body.customerNotify,
      notifyEmail: req.body.notifyEmail ?? req.user!.email,
      notifyPhone: req.body.notifyPhone,
      couponCode: req.body.couponCode,
      metadata: req.body.metadata,
    });

    created(
      res,
      {
        subscription: {
          id: result.subscription.id,
          status: result.subscription.status,
          autoRenew: result.subscription.autoRenew,
          totalCount: result.subscription.totalCount,
          paidCount: result.subscription.paidCount,
          remainingCount: result.subscription.remainingCount,
          currentStart: result.subscription.currentStart,
          currentEnd: result.subscription.currentEnd,
          nextChargeAt: result.subscription.nextChargeAt,
          shortUrl: result.subscription.shortUrl,
        },
        razorpay: result.razorpay,
        plan: {
          code: result.plan.code,
          name: result.plan.name,
          slug: result.plan.slug,
          basePricePaise: result.plan.basePricePaise,
          billingCycle: result.plan.billingCycle,
        },
      },
      'Subscription created'
    );
  } catch (err) {
    next(err);
  }
};

export const listSubscriptions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const subs = await SubscriptionService.listSubscriptionsForUser(req.user!.id);
    success(res, subs, 'Subscriptions fetched');
  } catch (err) {
    next(err);
  }
};

export const getSubscription = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SubscriptionService.getSubscriptionForUser(req.params.id, req.user!.id);
    success(res, sub, 'Subscription fetched');
  } catch (err) {
    next(err);
  }
};

export const cancelSubscription = async (
  req: Request<{ id: string }, unknown, CancelSubscriptionBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SubscriptionService.cancelSubscription({
      subscriptionId: req.params.id,
      userId: req.user!.id,
      reason: req.body.reason,
      cancelImmediately: req.body.cancelImmediately,
    });
    success(
      res,
      {
        id: sub.id,
        status: sub.status,
        cancelAtCycleEnd: sub.cancelAtCycleEnd,
        endedAt: sub.endedAt,
      },
      'Subscription cancelled'
    );
  } catch (err) {
    next(err);
  }
};

export const pauseSubscription = async (
  req: Request<{ id: string }, unknown, PauseSubscriptionBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SubscriptionService.pauseSubscription({
      subscriptionId: req.params.id,
      userId: req.user!.id,
      reason: req.body.reason,
    });
    success(res, { id: sub.id, status: sub.status, pausedAt: sub.pausedAt }, 'Subscription paused');
  } catch (err) {
    next(err);
  }
};

export const resumeSubscription = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SubscriptionService.resumeSubscription({
      subscriptionId: req.params.id,
      userId: req.user!.id,
    });
    success(res, { id: sub.id, status: sub.status }, 'Subscription resumed');
  } catch (err) {
    next(err);
  }
};

export const toggleAutoRenew = async (
  req: Request<{ id: string }, unknown, ToggleAutoRenewBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SubscriptionService.toggleAutoRenew({
      subscriptionId: req.params.id,
      userId: req.user!.id,
      autoRenew: req.body.autoRenew,
      reason: req.body.reason,
    });
    success(
      res,
      {
        id: sub.id,
        status: sub.status,
        autoRenew: sub.autoRenew,
        cancelAtCycleEnd: sub.cancelAtCycleEnd,
      },
      'Auto-renew updated'
    );
  } catch (err) {
    next(err);
  }
};
