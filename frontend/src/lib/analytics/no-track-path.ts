/**
 * Internal/admin route prefixes where marketing + analytics trackers (Meta
 * Pixel, GA, GTM) must NOT load. These are authenticated staff surfaces — firing
 * a marketing pixel there is pointless, pollutes conversion analytics, tracks
 * admin activity, and (when an ad-blocker closes the request) spams the console
 * with ERR_CONNECTION_CLOSED. User-facing dashboards (employer/candidate/vendor)
 * are intentionally NOT excluded — conversions happen there.
 */
const NO_TRACK_PREFIXES = ['/super-admin', '/admin'];

export function isNoTrackPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return NO_TRACK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
