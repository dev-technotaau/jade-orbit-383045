import type { Request, Response, NextFunction } from 'express';
import type { ResourceLockMode } from '@prisma/client';
import { AppError } from '../middleware/error';
import { resourceLockService } from '../services/resource-lock.service';
import { adminActivityService } from '../services/admin-activity.service';
import { getIO } from '../socket';
import logger from '../config/logger';

/**
 * Soft-lock / presence endpoints.
 *
 * Available to every admin (not just super-admins) — presence is only
 * useful if all the people who might collide can participate in it.
 *
 * These endpoints intentionally carry NO permission gate. Holding a lock
 * confers no ability to read or write the underlying record; that is
 * decided by the record's own endpoint. Gating presence behind the resource
 * permission would mean an admin who lacks access could not even be told
 * "someone else is here", while gaining nothing — the lock table stores
 * only ids the caller already supplied.
 */

/** Room name for live lock updates on one resource. */
const roomFor = (resourceType: string, resourceId: string) => `lock:${resourceType}:${resourceId}`;

function broadcast(resourceType: string, resourceId: string, payload: unknown): void {
  try {
    getIO().to(roomFor(resourceType, resourceId)).emit('admin:lock', payload);
  } catch (err) {
    // Polling fallback in the client covers a missing socket layer.
    logger.debug('Lock broadcast skipped:', (err as Error).message);
  }
}

function readParams(req: Request): { resourceType: string; resourceId: string } {
  const resourceType = (req.body?.resourceType ?? req.query.resourceType) as string;
  const resourceId = (req.body?.resourceId ?? req.query.resourceId) as string;
  if (!resourceType || !resourceId) {
    throw new AppError('resourceType and resourceId are required', 400, 'INVALID_RESOURCE');
  }
  return { resourceType, resourceId };
}

export const getLockState = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { resourceType, resourceId } = readParams(req);
    const state = await resourceLockService.getState(resourceType, resourceId, req.user.id);

    // "Who edited this recently" rides along with presence so an edit screen
    // needs one request, not two, to render its full collision context.
    const recentEditors = await adminActivityService.getRecentEditors(resourceId, req.user.id);

    res.status(200).json({ status: 'success', data: { ...state, recentEditors } });
  } catch (error) {
    next(error);
  }
};

export const acquireLock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { resourceType, resourceId } = readParams(req);
    const mode = (req.body?.mode as ResourceLockMode) ?? 'VIEWING';
    const takeover = req.body?.takeover === true;

    if (mode !== 'VIEWING' && mode !== 'EDITING') {
      throw new AppError('mode must be VIEWING or EDITING', 400, 'INVALID_MODE');
    }

    const state = await resourceLockService.acquire(
      resourceType,
      resourceId,
      req.user.id,
      mode,
      takeover
    );

    // Broadcast the bare state — it goes to every watcher, so it must not
    // carry anything computed for one caller.
    broadcast(resourceType, resourceId, state);

    // `recentEditors` IS per-caller (it excludes you), so it rides only on
    // the direct response. Attaching it here as well as on GET matters
    // because the client acquires on mount and never calls GET, so without
    // this the "someone changed this recently" note was permanently empty.
    const recentEditors = await adminActivityService.getRecentEditors(resourceId, req.user.id);
    res.status(200).json({ status: 'success', data: { ...state, recentEditors } });
  } catch (error) {
    next(error);
  }
};

export const heartbeatLock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { resourceType, resourceId } = readParams(req);
    const state = await resourceLockService.heartbeat(resourceType, resourceId, req.user.id);
    // Refreshed on every beat so a change made after the page loaded still
    // surfaces without a reload.
    const recentEditors = await adminActivityService.getRecentEditors(resourceId, req.user.id);
    res.status(200).json({ status: 'success', data: { ...state, recentEditors } });
  } catch (error) {
    next(error);
  }
};

export const releaseLock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { resourceType, resourceId } = readParams(req);
    await resourceLockService.release(resourceType, resourceId, req.user.id);

    const state = await resourceLockService.getState(resourceType, resourceId, req.user.id);
    broadcast(resourceType, resourceId, state);
    res.status(200).json({ status: 'success', data: state });
  } catch (error) {
    next(error);
  }
};

/** Batch presence for a list view. */
export const getLockStates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { resourceType, resourceIds } = req.body as {
      resourceType: string;
      resourceIds: string[];
    };
    if (!resourceType || !Array.isArray(resourceIds)) {
      throw new AppError('resourceType and resourceIds[] are required', 400, 'INVALID_RESOURCE');
    }
    const data = await resourceLockService.getStateForMany(resourceType, resourceIds, req.user.id);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
