import type { Request, Response, NextFunction } from 'express';
import { isFeatureEnabled, getFlag } from '../config/feature-flags';

/**
 * Maintenance mode middleware.
 * Checks the `maintenanceMode` feature flag and returns 503 if enabled.
 * Should be mounted after health routes so liveness/readiness probes still work.
 *
 * Optional Remote Config keys:
 *   - `maintenanceMessage`    (string) — custom message shown to users
 *   - `maintenanceReturnTime` (string) — ISO-8601 timestamp for the countdown timer
 *
 * Whitelisted endpoints that bypass maintenance mode:
 *   - /api/v1/feature-flags/* — Frontend needs to check maintenance status
 *   - /api/v1/public/*        — Public endpoints should remain available
 *   - /api/v1/config/*        — Public config endpoints
 */
export const maintenanceCheck = () => {
  // Endpoints that should bypass maintenance mode
  // Note: Middleware is mounted at /api, so paths start with /v1/...
  const WHITELIST_PATTERNS = [/^\/v1\/feature-flags/, /^\/v1\/public/, /^\/v1\/config/];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if current path matches any whitelist pattern
      const isWhitelisted = WHITELIST_PATTERNS.some((pattern) => pattern.test(req.path));

      if (isWhitelisted) {
        // Allow whitelisted endpoints to pass through
        next();
        return;
      }

      const inMaintenance = await isFeatureEnabled('maintenanceMode');
      if (inMaintenance) {
        const message = await getFlag<string>(
          'maintenanceMessage',
          'Service is currently under maintenance. Please try again later.'
        );
        const estimatedReturnTime = await getFlag<string>('maintenanceReturnTime', '');

        res.status(503).json({
          status: 'error',
          error: {
            message,
            code: 'MAINTENANCE_MODE',
            ...(estimatedReturnTime && { estimatedReturnTime }),
          },
        });
        return;
      }
      next();
    } catch {
      // If flag check fails, don't block requests
      next();
    }
  };
};
