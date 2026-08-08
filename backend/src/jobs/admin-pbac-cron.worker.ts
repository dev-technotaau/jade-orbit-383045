import logger from '../config/logger';
import { permissionService } from '../services/permission.service';
import { resourceLockService } from '../services/resource-lock.service';
import { adminActivityService } from '../services/admin-activity.service';
import { env } from '../config/env';

/**
 * Handlers for the PBAC housekeeping crons.
 * See `admin-pbac-cron.queue.ts` for why these are hygiene, not enforcement.
 */

export async function handlePbacSweepLocks(): Promise<{ removed: number }> {
  const removed = await resourceLockService.sweepExpired();
  return { removed };
}

export async function handlePbacSweepGrants(): Promise<{
  grants: number;
  assignments: number;
  activityPruned: number;
}> {
  const { grants, assignments } = await permissionService.sweepExpired();

  // Activity is operational telemetry rather than a compliance record — the
  // curated AuditLog is what survives long-term — so it is trimmed on a
  // rolling window. Configurable because "how long do we keep admin
  // behavioural data" is a policy question, not an engineering one.
  const retentionDays = Number(env.ADMIN_ACTIVITY_RETENTION_DAYS ?? 90);
  const activityPruned = await adminActivityService.pruneOlderThan(retentionDays);

  if (activityPruned > 0) {
    logger.info(
      `PBAC sweep: pruned ${activityPruned} activity row(s) older than ${retentionDays}d`
    );
  }

  return { grants, assignments, activityPruned };
}
