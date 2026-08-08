/**
 * Role-aware destination for "go to pricing" CTAs.
 *
 * We have three pricing surfaces:
 *   - /pricing            — all plans (catch-all)
 *   - /pricing/employer   — employer plans only
 *   - /pricing/candidate  — candidate plans only
 *
 * Most "Upgrade" / "No active plan" / "Buy plan" CTAs sit on pages that
 * already know the visitor's role (candidate dashboard, employer
 * dashboard, billing flows). Those should send the user to the
 * role-specific landing page so they don't have to scroll past plans
 * irrelevant to them. Generic surfaces (public marketing header,
 * "back to all plans" footer links) keep linking to `/pricing`.
 *
 * Vendor Connect is an employer add-on plan, so it lives on the
 * employer pricing surface.
 */
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/constants/routes';
import type { Role } from '@/types/auth';

export function getRolePricingHref(role: Role | undefined | null): string {
  if (role === 'CANDIDATE') return ROUTES.BILLING.PRICING_CANDIDATE;
  if (role === 'EMPLOYER') return ROUTES.BILLING.PRICING_EMPLOYER;
  return ROUTES.BILLING.PRICING;
}

/**
 * React hook variant — pulls the role from the auth store and reacts
 * to role changes (e.g. switching from candidate to employer mode).
 * Returns the all-plans page for unauthenticated visitors so SSR
 * fallbacks don't link to a 404-able role-scoped path.
 */
export function usePricingHref(): string {
  const role = useAuthStore((s) => s.user?.role);
  return getRolePricingHref(role);
}
