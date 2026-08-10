/**
 * App configuration.
 *
 * Pruned from the host platform's 239-line version, which also carried
 * PAGINATION, FILE_LIMITS, PASSWORD_RULES_DEFAULTS, ACCOUNT_SECURITY_DEFAULTS,
 * OTP_CONFIG_DEFAULTS, EXPERIENCE_BUCKETS and 76 React Query keys across 18
 * feature groups.
 *
 * `QUERY_KEYS` is gone too: after the feature-flag system was removed its only
 * remaining entries were the flag keys, and every WhatsApp surface declares its
 * own inline key (`['wa-contacts', …]`, `['wa-segments']`) rather than routing
 * through a shared table.
 */

export const APP_CONFIG = {
  /** Display name. Falls back the same way Logo.tsx does, so the two agree. */
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'TechnoTaau',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
} as const;

/**
 * Largest file the UI will attempt to upload, in bytes.
 *
 * The backend's multer accepts 16 MB, but the browser does not talk to the
 * backend directly: every request goes through the Next.js BFF proxy, which
 * buffers the whole body (`await request.arrayBuffer()`) before forwarding it.
 * Serverless platforms cap that request body — Vercel at 4.5 MB — so anything
 * larger dies inside the proxy with a platform error that never reaches our
 * error handling, and the operator sees an upload that just fails.
 *
 * Refusing early with a clear message beats failing at the end of a 12 MB
 * upload. Raise NEXT_PUBLIC_MAX_UPLOAD_MB on a self-hosted deployment where the
 * proxy has no such cap (the backend's own 16 MB limit still applies).
 */
export const MAX_UPLOAD_BYTES =
  Math.round(parseFloat(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || '4') * 1024 * 1024) ||
  4 * 1024 * 1024;

/** Human-readable form of {@link MAX_UPLOAD_BYTES}, for error copy. */
export const MAX_UPLOAD_LABEL = `${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;

/**
 * Throws a operator-readable error when a picked file is too large for the
 * proxy to carry. Call before building the FormData, not after.
 */
export function assertUploadSize(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
        `The maximum upload size is ${MAX_UPLOAD_LABEL}.`,
    );
  }
}
