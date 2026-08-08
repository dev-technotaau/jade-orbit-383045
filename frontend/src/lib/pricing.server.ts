/**
 * Server-side helper for the public pricing pages. Used by `/pricing`,
 * `/pricing/employer` and `/pricing/candidate` to fetch the public plan
 * catalog without going through the authenticated axios client.
 *
 * Uses `BACKEND_INTERNAL_URL` when set (k8s server-to-server) and falls
 * back to `NEXT_PUBLIC_API_URL`. 5-minute revalidation matches the
 * backend cache TTL on `/plans`.
 */
import type { Plan } from '@/types/billing';

export async function fetchPublicPlans(): Promise<Plan[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/plans`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.data) ? (body.data as Plan[]) : [];
  } catch {
    return [];
  }
}
