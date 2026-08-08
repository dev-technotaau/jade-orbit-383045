import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../exceptions';
import {
  getActiveEntitlementsForUser,
  consumeResource,
  releaseResource,
  type EntitlementSnapshot,
} from '../services/entitlement.service';
import logger from '../config/logger';
import type { ResourceUnit } from '@prisma/client';

/**
 * Plan-gate middleware.
 *
 * Two modes:
 *   1. **Check-only** — `minResource: { unit, amount }` — verifies remaining
 *      quota, lets the route handler call `consumeResource()` itself.
 *   2. **Pre-decrement** — `consume: { unit, amount, refType }` — does an
 *      atomic row-locked decrement BEFORE the handler runs, attaches a
 *      rollback function to `res.locals.planGateRollback`, and auto-rolls
 *      back if the response status is ≥ 400 (per plan §6.2 line 440).
 *
 *   router.post(
 *     '/jobs',
 *     protect,
 *     planGate({
 *       require: ['feature.job_post'],
 *       consume: { unit: 'JOB_POST', amount: 1, refType: 'JOB_POST' },
 *     }),
 *     handler,
 *   );
 *
 * Returns **402 Payment Required** when the user has no entitlement, or
 * has insufficient quota. Frontend redirects to /pricing or /billing/upgrade.
 *
 * Skip-for-roles: super-admin / admin paths can pass `skipForRoles: ['SUPER_ADMIN']`
 * to bypass the gate entirely.
 */
export interface PlanGateOptions {
  /** Feature keys (`feature.*`). User must possess ALL by default — set `requireAll=false` for any-of. */
  require: string[];
  /** Optional resource that must have at least N remaining (check-only). */
  minResource?: { unit: ResourceUnit; amount: number };
  /**
   * Pre-decrement quota inside a row-locked transaction. On 4xx/5xx
   * responses, the consumption is automatically rolled back via
   * `releaseResource()`. Use this for endpoints where the side effect of
   * consuming the quota MUST track the success of the operation atomically.
   */
  consume?: { unit: ResourceUnit; amount: number; refType: string };
  requireAll?: boolean;
  /** Roles that bypass the gate completely (no entitlement check). */
  skipForRoles?: string[];
  /** When true, allow the request through even if no entitlement found and just attach the empty snapshot. Useful for read endpoints. */
  optional?: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    entitlement?: EntitlementSnapshot;
    /** Rollback the gate's pre-decrement (set by `consume:` mode). */
    planGateRollback?: () => Promise<void>;
  }
}

export function planGate(opts: PlanGateOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !user.id) {
      return next(new AppError('Unauthenticated', 401, 'UNAUTHENTICATED'));
    }
    if (opts.skipForRoles && opts.skipForRoles.includes(user.role)) {
      return next();
    }

    let snapshot: EntitlementSnapshot;
    try {
      snapshot = await getActiveEntitlementsForUser(user.id);
    } catch (err) {
      logger.error('plan-gate snapshot lookup failed', { userId: user.id, err });
      return next(new AppError('Entitlement check failed', 500, 'ENTITLEMENT_LOOKUP_FAILED'));
    }
    req.entitlement = snapshot;

    if (opts.optional) return next();

    if (!snapshot.hasAnyActive) {
      return next(
        new AppError(
          'No active plan — please purchase or upgrade to continue.',
          402,
          'PAYMENT_REQUIRED'
          // Ideally we'd attach `{ requiredFeatures: opts.require }` for FE UX.
        )
      );
    }

    const requireAll = opts.requireAll !== false;
    const featureCheck = requireAll
      ? opts.require.every((key) => snapshot.features[key] === true)
      : opts.require.some((key) => snapshot.features[key] === true);

    if (!featureCheck) {
      return next(
        new AppError(
          `Your plan doesn't include this feature (${opts.require.join(', ')}). Upgrade to continue.`,
          402,
          'FEATURE_NOT_INCLUDED'
        )
      );
    }

    if (opts.minResource) {
      const res = snapshot.resources[opts.minResource.unit];
      const remaining = res?.totalRemaining ?? 0;
      if (remaining < opts.minResource.amount) {
        return next(
          new AppError(
            `You've used your ${opts.minResource.unit.toLowerCase().replace(/_/g, ' ')} quota for this period.`,
            402,
            'QUOTA_EXHAUSTED'
          )
        );
      }
    }

    // Pre-decrement (§6.2 row-locked transaction). consumeResource() runs
    // an INTERACTIVE transaction with `prisma.$transaction(... { isolationLevel: Serializable })`
    // and updates the EntitlementResource row, so concurrent writes can't
    // double-spend the same unit.
    if (opts.consume) {
      const consumeOpts = opts.consume;
      try {
        const result = await consumeResource({
          userId: user.id,
          unit: consumeOpts.unit,
          amount: consumeOpts.amount,
          refType: consumeOpts.refType,
          refId: 'pending', // updated to the real id after handler success (audit-only)
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        });
        if (!result.consumed) {
          return next(
            new AppError(
              `Quota check failed for ${consumeOpts.unit.toLowerCase().replace(/_/g, ' ')}.`,
              402,
              result.reason === 'NO_ENTITLEMENT' ? 'PAYMENT_REQUIRED' : 'QUOTA_EXHAUSTED'
            )
          );
        }
      } catch (err) {
        // If consumeResource throws QUOTA_EXHAUSTED or anything else, surface
        // a 402 — the caller's fallback path is the same as a check-only fail.
        if (err instanceof AppError) return next(err);
        return next(
          new AppError(
            `Quota check failed for ${consumeOpts.unit.toLowerCase().replace(/_/g, ' ')}.`,
            402,
            'QUOTA_EXHAUSTED'
          )
        );
      }

      // Rollback hook — attached on req for the handler, plus an auto-rollback
      // when the response status indicates failure.
      const rollback = async (): Promise<void> => {
        try {
          await releaseResource({
            userId: user.id,
            unit: consumeOpts.unit,
            amount: consumeOpts.amount,
            refType: consumeOpts.refType,
            refId: 'pending-rollback',
          });
        } catch (err) {
          logger.error('plan-gate auto-rollback failed', {
            userId: user.id,
            unit: consumeOpts.unit,
            err: err instanceof Error ? err.message : err,
          });
        }
      };
      req.planGateRollback = rollback;

      // Auto-rollback when the response is non-success
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          void rollback();
        }
      });
    }

    return next();
  };
}

/**
 * 402 Payment Required helper for routes that detect a paywall after their
 * main work (eg. quota exhausted mid-flight).
 */
export function paymentRequired(message: string, code = 'PAYMENT_REQUIRED'): AppError {
  return new AppError(message, 402, code);
}
