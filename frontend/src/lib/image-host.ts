/**
 * Returns `true` only when the URL belongs to a remote host configured
 * in `next.config.ts` `images.remotePatterns`. For everything else
 * (e.g. user-pasted external logos that we can't pre-whitelist),
 * we pass `unoptimized` to <Image /> so Next.js doesn't 400.
 *
 * Keep this list in lock-step with `next.config.ts`.
 */
const OPTIMISABLE_HOSTS = new Set<string>([
  'res.cloudinary.com',
  'assets.hireadda.in',
  'lh3.googleusercontent.com',
]);

export function isOptimisableImageHost(url: string | null | undefined): boolean {
  if (!url) return false;
  // Relative URLs (/foo/bar.png) are always served by Next's pipeline
  // and are therefore always optimisable.
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const host = new URL(url).hostname;
    return OPTIMISABLE_HOSTS.has(host);
  } catch {
    return false;
  }
}
