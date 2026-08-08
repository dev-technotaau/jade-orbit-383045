/**
 * Permission keys referenced by the UI itself.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The full tree (400+ nodes, with labels and descriptions) lives on the
 * server and is fetched for the grant editor. This file holds only the
 * subset the frontend hard-codes: nav item gates and page guards.
 *
 * ── Why a partial copy is safe here ────────────────────────────────────
 * A typo in this file FAILS CLOSED. An unknown key resolves to "not
 * allowed", so the nav item hides and the page guard blocks — visible and
 * harmless. The dangerous direction (a stale key silently granting access)
 * cannot happen, because the server never consults this file.
 *
 * Keys must match `backend/src/config/permissions.ts`. When you add a
 * navigable surface, add its key in both places.
 */

export const PERM = {
  // ── Users ──
  USERS: 'users',
  USERS_CANDIDATES_VIEW: 'users.candidates.account.view',
  USERS_EMPLOYERS_VIEW: 'users.employers.account.view',
  USERS_CREATE: 'users.create',
  USERS_CANDIDATES_ACTIVITY_APPS: 'users.candidates.activity.applications',
  USERS_EMPLOYERS_ACTIVITY_JOBS: 'users.employers.activity.jobs',
  USERS_BULK: 'users.bulk',

  // ── Jobs ──
  JOBS_VIEW: 'jobs.listing.view',
  JOBS_MODERATION: 'jobs.moderation',
  JOBS_AUTHOR_CREATE: 'jobs.authoring.create',
  JOBS_AUTHOR_EDIT: 'jobs.authoring.edit',
  JOBS_APPLICATIONS_VIEW: 'jobs.applications.view',

  // ── Trust & safety ──
  VERIFICATIONS_CANDIDATE_VIEW: 'verifications.candidate.view',
  VERIFICATIONS_EMPLOYER_VIEW: 'verifications.employer.view',
  VERIFICATIONS_CANDIDATE_APPROVE: 'verifications.candidate.approve',
  VERIFICATIONS_CANDIDATE_REJECT: 'verifications.candidate.reject',
  VERIFICATIONS_EMPLOYER_APPROVE: 'verifications.employer.approve',
  VERIFICATIONS_EMPLOYER_REJECT: 'verifications.employer.reject',
  MODERATION_KEYWORDS_VIEW: 'moderation.keywords.view',
  REVIEWS_VIEW: 'reviews.view',

  // ── Help desk ──
  SUPPORT_TICKETS_VIEW: 'support.tickets.view',
  SUPPORT_TICKETS_VIEW_ALL: 'support.tickets.view_all',
  SUPPORT_CONTACT_VIEW: 'support.contact.view',
  SUPPORT_ANALYTICS: 'support.analytics',
  SUPPORT_TICKETS_ASSIGN: 'support.tickets.assign',
  SUPPORT_TICKETS_STATUS: 'support.tickets.status',
  SUPPORT_TICKETS_REPLY: 'support.tickets.reply',

  // ── WhatsApp ──
  WA_INBOX_VIEW: 'whatsapp.inbox.view',
  WA_TEMPLATES_VIEW: 'whatsapp.templates.view',
  WA_CONTACTS_VIEW: 'whatsapp.contacts.view',
  WA_CONTACTS_PLATFORM_USERS: 'whatsapp.contacts.platform_users',
  WA_CAMPAIGNS_VIEW: 'whatsapp.campaigns.view',
  WA_ANALYTICS_VIEW: 'whatsapp.analytics.view',
  WA_SETTINGS_VIEW: 'whatsapp.settings.view',

  // ── Email ──
  EMAIL_INBOX_VIEW: 'email.inbox.view',
  EMAIL_MAILBOX_VIEW: 'email.mailbox.view',
  EMAIL_TEMPLATES_VIEW: 'email.templates.view',
  EMAIL_CAMPAIGNS_VIEW: 'email.campaigns.view',
  EMAIL_CONTACTS_VIEW: 'email.contacts.view',
  EMAIL_SETS_VIEW: 'email.sets.view',
  EMAIL_CONTACTS_PLATFORM_USERS: 'email.contacts.platform_users',
  EMAIL_ANALYTICS_VIEW: 'email.analytics.view',
  EMAIL_SUPPRESSION_VIEW: 'email.suppression.view',
  EMAIL_UNSUBSCRIBES_VIEW: 'email.unsubscribes.view',
  EMAIL_SETTINGS_VIEW: 'email.settings.view',

  // ── Billing ──
  BILLING_DASHBOARD: 'billing.dashboard',
  BILLING_ORDERS_VIEW: 'billing.orders.view',
  BILLING_TRANSACTIONS_VIEW: 'billing.transactions.view',
  BILLING_SUBSCRIPTIONS_VIEW: 'billing.subscriptions.view',
  BILLING_INVOICES_VIEW: 'billing.invoices.view',
  BILLING_REFUNDS_VIEW: 'billing.refunds.view',
  BILLING_SETTLEMENTS_VIEW: 'billing.settlements.view',
  BILLING_DISPUTES_VIEW: 'billing.disputes.view',
  BILLING_PLANS_VIEW: 'billing.plans.view',
  BILLING_COUPONS_VIEW: 'billing.coupons.view',
  BILLING_QUOTES_VIEW: 'billing.quotes.view',
  BILLING_FRAUD_VIEW: 'billing.fraud.view',
  BILLING_ENTITLEMENTS_VIEW: 'billing.entitlements.view',
  BILLING_LEDGER_VIEW: 'billing.ledger.view',
  BILLING_WEBHOOKS_VIEW: 'billing.webhooks.view',
  BILLING_AUDIT: 'billing.audit',
  BILLING_SETTINGS_VIEW: 'billing.settings.view',

  // ── Other domains ──
  VENDORS_VIEW: 'vendors.view',
  ASSISTED_HIRING_VIEW: 'assisted_hiring.view',
  CURATED_VIEW: 'curated_listings.view',
  RESUME_WATERMARK_CONFIG_VIEW: 'resume_watermark.config.view',
  RESUME_WATERMARK_ON_PLATFORM_VIEW: 'resume_watermark.on_platform.view',
  RESUME_WATERMARK_OFF_PLATFORM_VIEW: 'resume_watermark.off_platform.view',
  FOLLOWS_VIEW: 'follows.view',
  FOLLOWS_STATS: 'follows.stats',
  TEAMS_VIEW: 'teams.view',

  // ── Analytics & reports ──
  ANALYTICS: 'analytics',
  ANALYTICS_OVERVIEW: 'analytics.overview',
  ANALYTICS_USERS: 'analytics.users',
  ANALYTICS_JOBS: 'analytics.jobs',
  ANALYTICS_APPLICATIONS: 'analytics.applications',
  ANALYTICS_LIVE: 'analytics.live',
  ANALYTICS_TRENDING: 'analytics.trending',
  JOBS_APPLICATIONS_STATS: 'jobs.applications.stats',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORTS_USERS: 'reports.exports.users',
  REPORTS_EXPORTS_JOBS: 'reports.exports.jobs',
  REPORTS_EXPORTS_ANALYTICS: 'reports.exports.analytics',

  // ── Per-action keys used to gate controls inside a page ──
  JOBS_MODERATION_APPROVE: 'jobs.moderation.approve',
  JOBS_MODERATION_FLAG: 'jobs.moderation.flag',
  JOBS_MODERATION_DELETE: 'jobs.moderation.delete',
  MODERATION_KEYWORDS_ADD: 'moderation.keywords.add',
  MODERATION_KEYWORDS_REMOVE: 'moderation.keywords.remove',
  REVIEWS_APPROVE: 'reviews.approve',
  REVIEWS_DELETE: 'reviews.delete',
  USERS_CANDIDATES_SUSPEND: 'users.candidates.account.suspend',
  USERS_CANDIDATES_ACTIVATE: 'users.candidates.account.activate',
  USERS_CANDIDATES_DELETE: 'users.candidates.account.delete',
  USERS_EMPLOYERS_SUSPEND: 'users.employers.account.suspend',
  USERS_EMPLOYERS_ACTIVATE: 'users.employers.account.activate',
  USERS_EMPLOYERS_DELETE: 'users.employers.account.delete',
  WA_SETTINGS_EDIT: 'whatsapp.settings.edit',
  BILLING_SETTINGS_EDIT: 'billing.settings.edit',
  BILLING_COUPONS_ANALYTICS: 'billing.coupons.analytics',

  // ── Platform ──
  PLATFORM_AUDIT_LOGS_VIEW: 'platform.audit_logs.view',
  PLATFORM_FEATURE_FLAGS_VIEW: 'platform.feature_flags.view',
  PLATFORM_SYSTEM_CONFIG_VIEW: 'platform.system_config.view',
  PLATFORM_EMAIL_TEMPLATES_VIEW: 'platform.email_templates.view',

  // ── Super-admin only (never grantable) ──
  ADMIN_CONTROL: 'admin_control',
  ADMIN_CONTROL_VIEW: 'admin_control.view',
  ADMIN_CONTROL_GRANTS: 'admin_control.grants',
  ADMIN_CONTROL_ROLES: 'admin_control.roles',
  ADMIN_CONTROL_ACTIVITY: 'admin_control.activity',
  ADMIN_CONTROL_LOCKS: 'admin_control.locks',
  USERS_ADMINS: 'users.admins',
} as const;

export type PermissionKey = (typeof PERM)[keyof typeof PERM];

/**
 * Accent classes for role chips, keyed by the `color` token stored on
 * AdminRole. Kept as a static map (not interpolated) so Tailwind's JIT can
 * see every class name at build time.
 */
export const ROLE_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 ring-blue-200',
  violet: 'bg-violet-100 text-violet-700 ring-violet-200',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-700 ring-amber-200',
  rose: 'bg-rose-100 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  cyan: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
};

export const ROLE_COLOR_OPTIONS = Object.keys(ROLE_COLORS);

export function roleColorClass(color: string | null | undefined): string {
  return ROLE_COLORS[color ?? 'slate'] ?? ROLE_COLORS.slate;
}
