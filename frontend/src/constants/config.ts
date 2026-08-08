export const APP_CONFIG = {
  name: 'Hire Adda',
  description: "India's Leading Job Portal & Recruitment Platform",
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@hireadda.in',
} as const;

/** API base URL without the version prefix (e.g. /api/v1 → /api). Useful for
 *  endpoints that live outside the versioned namespace such as /csrf-token or
 *  /config/*.  */
export const API_BASE_URL = APP_CONFIG.apiUrl.replace(/\/v\d+$/, '');

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  JOBS_PER_PAGE: 20,
  CANDIDATES_PER_PAGE: 20,
  APPLICATIONS_PER_PAGE: 15,
  NOTIFICATIONS_PER_PAGE: 20,
  USERS_PER_PAGE: 25,
  AUDIT_LOGS_PER_PAGE: 50,
} as const;

export const FILE_LIMITS = {
  RESUME_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  AVATAR_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  LOGO_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  COVER_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  RESUME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  RESUME_EXTENSIONS: ['.pdf', '.doc', '.docx'],
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
} as const;

/** Fallback defaults — overridden by usePasswordRules() which fetches from backend */
export const PASSWORD_RULES_DEFAULTS = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: true,
} as const;

export type PasswordRules = {
  MIN_LENGTH: number;
  MAX_LENGTH: number;
  REQUIRE_UPPERCASE: boolean;
  REQUIRE_LOWERCASE: boolean;
  REQUIRE_NUMBER: boolean;
  REQUIRE_SPECIAL: boolean;
};

export type AccountSecurity = {
  MAX_LOGIN_ATTEMPTS: number;
  LOCK_DURATION_MINUTES: number;
  SESSION_TIMEOUT_HOURS: number;
  MAX_SESSIONS_PER_USER: number;
  PASSWORD_RESET_EXPIRY_HOURS: number;
  PASSWORD_RESET_MAX_ATTEMPTS: number;
};

export const ACCOUNT_SECURITY_DEFAULTS: AccountSecurity = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_DURATION_MINUTES: 15,
  SESSION_TIMEOUT_HOURS: 24,
  MAX_SESSIONS_PER_USER: 5,
  PASSWORD_RESET_EXPIRY_HOURS: 1,
  PASSWORD_RESET_MAX_ATTEMPTS: 5,
};

export type SecurityConfig = {
  password: PasswordRules;
  account: AccountSecurity;
};

/** Fallback defaults — overridden by useOtpConfig() which fetches from backend */
export const OTP_CONFIG_DEFAULTS = {
  LENGTH: 6,
  RESEND_COOLDOWN: 60, // seconds
  EXPIRY: 600, // 10 minutes (matches backend OTP_EXPIRY_MINUTES)
  MAX_RESEND_ATTEMPTS: 5,
} as const;

export type OtpConfig = {
  LENGTH: number;
  RESEND_COOLDOWN: number;
  EXPIRY: number;
  MAX_RESEND_ATTEMPTS: number;
};

export const QUERY_KEYS = {
  AUTH: {
    ME: ['auth', 'me'],
  },
  JOBS: {
    LIST: ['jobs', 'list'],
    DETAIL: (id: string) => ['jobs', 'detail', id],
    SEARCH: (filters: Record<string, unknown>) => ['jobs', 'search', filters],
    APPLIED: ['jobs', 'applied'],
    SAVED: ['jobs', 'saved'],
    MY_JOBS: ['jobs', 'my-jobs'],
    APPLICATIONS: (jobId: string) => ['jobs', 'applications', jobId],
    APPLICATION_DETAIL: (id: string) => ['jobs', 'application', id],
  },
  CANDIDATES: {
    PROFILE: ['candidates', 'profile'],
    DASHBOARD: ['candidates', 'dashboard'],
    COMPLETENESS: ['candidates', 'completeness'],
    PROFILE_VIEWS: ['candidates', 'profile-views'],
    SEARCH: (filters: Record<string, unknown>) => ['candidates', 'search', filters],
    DETAIL: (id: string) => ['candidates', 'detail', id],
    ANALYTICS: (filters: Record<string, unknown>) => ['candidates', 'analytics', filters],
    JOB_ALERTS: ['candidates', 'job-alerts'],
    JOB_ALERT_MATCHES: (id: string) => ['candidates', 'job-alert-matches', id],
    PARSED_RESUME: ['candidates', 'parsed-resume'],
  },
  EMPLOYERS: {
    DASHBOARD: ['employers', 'dashboard'],
    COMPANY: ['employers', 'company'],
    COMPLETENESS: ['employers', 'completeness'],
    PROFILE_VIEWS: ['employers', 'profile-views'],
    SAVED_CANDIDATES: ['employers', 'saved-candidates'],
    APPLICATIONS: ['employers', 'applications'],
    ANALYTICS: (filters: Record<string, unknown>) => ['employers', 'analytics', filters],
    PUBLIC_PROFILE: (id: string) => ['employers', 'public-profile', id],
  },
  NOTIFICATIONS: {
    LIST: ['notifications', 'list'],
    UNREAD_COUNT: ['notifications', 'unread-count'],
  },
  SESSIONS: {
    LIST: ['sessions', 'list'],
  },
  DRAFTS: {
    LIST: ['drafts', 'list'],
    DETAIL: (id: string) => ['drafts', 'detail', id],
  },
  ADMIN: {
    STATS: ['admin', 'stats'],
    COMPREHENSIVE_STATS: ['admin', 'comprehensive-stats'],
    USERS: (filters: Record<string, unknown>) => ['admin', 'users', filters],
    USER_DETAIL: (id: string) => ['admin', 'user', id],
    ACTIVITY: ['admin', 'activity'],
    ANALYTICS: (filters: Record<string, unknown>) => ['admin', 'analytics', filters],
    AUDIT_LOGS: (filters: Record<string, unknown>) => ['admin', 'audit-logs', filters],
    JOBS: (filters: Record<string, unknown>) => ['admin', 'jobs', filters],
    APPLICATIONS: (filters: Record<string, unknown>) => ['admin', 'applications', filters],
    APPLICATION_STATS: ['admin', 'application-stats'],
    EMAIL_TEMPLATES: ['admin', 'email-templates'],
    EMAIL_PREVIEW: (template: string) => ['admin', 'email-preview', template],
    MODERATION_KEYWORDS: ['admin', 'moderation-keywords'],
    LIVE_COUNTERS: ['admin', 'live-counters'],
    KAFKA_EVENTS: ['admin', 'kafka-events'],
    DAILY_ACTIVE_USERS: ['admin', 'daily-active-users'],
  },
  WEBAUTHN: {
    CREDENTIALS: ['webauthn', 'credentials'],
  },
  WEBHOOKS: {
    LIST: ['webhooks', 'list'],
    DETAIL: (id: string) => ['webhooks', 'detail', id],
    DELIVERIES: (id: string) => ['webhooks', id, 'deliveries'],
  },
  RECOMMENDATIONS: {
    JOBS: ['recommendations', 'jobs'],
    CANDIDATES: (jobId: string) => ['recommendations', 'candidates', jobId],
    FEED: (filters: Record<string, unknown>) => ['recommendations', 'feed', filters],
  },
  CONFIG: {
    OTP: ['config', 'otp'],
    SECURITY: ['config', 'security'],
  },
  FEATURE_FLAGS: {
    CLIENT: ['feature-flags', 'client'],
    ALL: ['feature-flags', 'all'],
  },
  ADVANCED_ANALYTICS: {
    SKILLS: ['advanced-analytics', 'skills'],
    FUNNEL: (startDate?: string, endDate?: string) => [
      'advanced-analytics',
      'funnel',
      startDate,
      endDate,
    ],
    USER_GROWTH: (startDate?: string, endDate?: string) => [
      'advanced-analytics',
      'user-growth',
      startDate,
      endDate,
    ],
    SALARY: ['advanced-analytics', 'salary'],
    JOB_TRENDS: (startDate?: string, endDate?: string) => [
      'advanced-analytics',
      'job-trends',
      startDate,
      endDate,
    ],
  },
  VERIFICATIONS: {
    MINE: ['verifications', 'mine'],
    PENDING: (filters: Record<string, unknown>) => ['verifications', 'pending', filters],
    ALL: (filters: Record<string, unknown>) => ['verifications', 'all', filters],
    STATS: ['verifications', 'stats'],
  },
  SAVED_SEARCHES: {
    LIST: (type?: string) => ['saved-searches', 'list', type],
  },
  TICKETS: {
    MY_LIST: ['tickets', 'my-list'],
    ALL_LIST: ['tickets', 'all-list'],
    DETAIL: (id: string) => ['tickets', 'detail', id],
    STATS: ['tickets', 'stats'],
    ANALYTICS: ['tickets', 'analytics'],
  },
  SUPER_ADMIN: {
    ADMINS: ['super-admin', 'admins'],
    USER_SESSIONS: (id: string) => ['super-admin', 'user-sessions', id],
  },
} as const;

export const EXPERIENCE_BUCKETS: readonly {
  label: string;
  min: number;
  max: number | undefined;
}[] = [
  { label: 'Fresher', min: 0, max: 1 },
  { label: '1-3 years', min: 1, max: 3 },
  { label: '3-5 years', min: 3, max: 5 },
  { label: '5-8 years', min: 5, max: 8 },
  { label: '8-12 years', min: 8, max: 12 },
  { label: '12+ years', min: 12, max: undefined },
];
