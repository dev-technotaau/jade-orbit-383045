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
