import logger from '../config/logger';

type LocalHandler = (eventType: string, data: any) => Promise<void>;

interface ServiceEntry {
  /** Current: local function call. Future: HTTP URL to microservice */
  localHandler: LocalHandler;
}

/**
 * Cross-service event router — abstraction layer for routing Kafka events
 * to service handlers.
 *
 * Current state: all handlers are local function calls within the monolith.
 * Future migration path: replace `localHandler` with an HTTP URL and use
 * fetch() to call the external microservice. This provides a clean
 * seam for splitting the monolith without changing consumer logic.
 *
 * Usage in consumer.ts:
 *   await eventRouter.routeToService('user-service', eventType, data);
 *
 * When splitting to microservices:
 *   1. Deploy the microservice
 *   2. Change the entry from { localHandler: fn } to { url: 'http://user-svc/events' }
 *   3. The router handles the HTTP call transparently
 */
class EventRouter {
  private registry = new Map<string, ServiceEntry>();

  /**
   * Register a service with its local handler.
   */
  register(serviceName: string, handler: LocalHandler): void {
    this.registry.set(serviceName, { localHandler: handler });
    logger.debug(`EventRouter: registered service "${serviceName}"`);
  }

  /**
   * Route an event to the appropriate service.
   * Currently calls local handler directly.
   * Future: check for URL in registry entry and use HTTP if present.
   */
  async routeToService(serviceName: string, eventType: string, data: any): Promise<void> {
    const entry = this.registry.get(serviceName);
    if (!entry) {
      logger.warn(`EventRouter: no handler registered for service "${serviceName}"`);
      return;
    }

    // Current: local function call (monolith)
    // Future migration: if (entry.url) { await fetch(entry.url, { method: 'POST', body: JSON.stringify({ eventType, data }) }); }
    await entry.localHandler(eventType, data);
  }

  /**
   * Check if a service is registered.
   */
  hasService(serviceName: string): boolean {
    return this.registry.has(serviceName);
  }

  /**
   * List all registered services.
   */
  getRegisteredServices(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const eventRouter = new EventRouter();

// ── Register local service handlers ──────────────────────────────────
// Each handler receives (eventType, data) and processes it locally.
// When splitting services, these will be replaced with HTTP calls.

eventRouter.register('user-service', async (eventType, data) => {
  // Handles: USER_REGISTERED, USER_LOGIN, SESSION_CREATED, SESSION_REVOKED,
  // AVATAR_CHANGED, RESUME_UPLOADED, VERIFICATION_SUBMITTED/APPROVED/REJECTED
  logger.debug(`[user-service] Processing ${eventType} for user ${data.userId || 'unknown'}`);
});

eventRouter.register('job-service', async (eventType, data) => {
  // Handles: JOB_POSTED, JOB_UPDATED, JOB_CLOSED, SEARCH_PERFORMED,
  // ADMIN_JOB_REJECTED
  logger.debug(`[job-service] Processing ${eventType} for job ${data.jobId || 'unknown'}`);
});

eventRouter.register('application-service', async (eventType, data) => {
  // Handles: APPLICATION_SUBMITTED, APPLICATION_STATUS_CHANGED
  logger.debug(
    `[application-service] Processing ${eventType} for application ${data.applicationId || 'unknown'}`
  );
});

eventRouter.register('notification-service', async (eventType, data) => {
  // Handles: NOTIFICATION_SENT, NOTIFICATION_READ
  logger.debug(
    `[notification-service] Processing ${eventType} for user ${data.userId || 'unknown'}`
  );
});

eventRouter.register('admin-service', async (eventType, data) => {
  // Handles: ADMIN_USER_SUSPENDED, ADMIN_ROLE_CHANGED, COMPANY_VERIFIED,
  // COMPANY_PROFILE_UPDATED
  logger.debug(
    `[admin-service] Processing ${eventType} for target ${data.userId || data.companyId || 'unknown'}`
  );
});
