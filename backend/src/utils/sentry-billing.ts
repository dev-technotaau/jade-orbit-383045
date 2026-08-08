/**
 * Tiny helper around Sentry breadcrumbs for billing state transitions.
 * Sentry is optional in dev — failures are swallowed.
 */

export interface BillingBreadcrumb {
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

export async function billingBreadcrumb(crumb: BillingBreadcrumb): Promise<void> {
  try {
    const Sentry = await import('@sentry/node');
    Sentry.addBreadcrumb({
      category: 'billing',
      level: crumb.level ?? 'info',
      message: crumb.message,
      data: crumb.data,
    });
  } catch {
    /* Sentry optional */
  }
}

export async function billingException(
  err: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(err, { tags: { area: 'billing' }, extra: context });
  } catch {
    /* Sentry optional */
  }
}
