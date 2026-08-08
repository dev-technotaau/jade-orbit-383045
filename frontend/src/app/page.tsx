import { redirect } from 'next/navigation';

/**
 * Root redirect.
 *
 * This was the host application's marketing homepage — 1,066 lines of hero,
 * stats, job categories, testimonials and CTAs. An operator tool has no landing
 * page: there is one destination.
 *
 * The middleware (src/proxy.ts) normally handles `/` before this renders,
 * sending locked visitors to /unlock and unlocked ones to /whatsapp. This exists
 * as the fallback for any path where the middleware does not run, so `/` can
 * never 404.
 */
export default function RootPage() {
  redirect('/whatsapp');
}
