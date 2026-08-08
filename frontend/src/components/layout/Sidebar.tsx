'use client';

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useSocket } from '@/hooks/use-socket';
import { superAdminWhatsappService } from '@/services/super-admin-whatsapp.service';
import { superAdminEmailService } from '@/services/super-admin-email.service';
import {
  LayoutDashboard,
  User,
  Briefcase,
  FileText,
  Inbox,
  Bookmark,
  Settings,
  Building2,
  Users,
  PlusCircle,
  BarChart3,
  Shield,
  ShieldCheck,
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileBarChart,
  HelpCircle,
  Mail,
  MailX,
  AtSign,
  MessageSquare,
  MessageCircle,
  ToggleLeft,
  Sparkles,
  Heart,
  Bell,
  Receipt,
  CreditCard,
  Repeat,
  Coins,
  Layers,
  Tag,
  DollarSign,
  AlertCircle,
  Headphones,
  ListPlus,
  Star,
  Handshake,
  Send,
  Network,
  UserCheck,
  Activity,
  TrendingUp,
  SlidersHorizontal,
  Stamp,
  KeyRound,
  X,
} from 'lucide-react';
import { cn, resolveActiveNavHref } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { ROUTES } from '@/constants/routes';
import Tooltip from '@/components/ui/Tooltip';
import BrandIcon from '@/components/common/BrandIcon';
import { useEntitlements } from '@/hooks/use-entitlements';
import { usePermissions } from '@/hooks/use-permissions';
import { useSidebarPrefs } from '@/hooks/use-sidebar-prefs';
import { PERM } from '@/constants/permissions';
import { getRolePricingHref } from '@/lib/pricing-href';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/types/auth';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Optional feature key this nav item requires. When set, the item is
   * hidden from users whose active entitlement snapshot does not include
   * the feature. Items without a `requiresFeature` are always shown.
   */
  requiresFeature?: string;
  /**
   * Admin PBAC key required to see this item. Hidden from admins who do
   * not hold it; super-admins always pass.
   *
   * Hiding is a UX affordance only — the page itself is guarded by
   * `DashboardLayout`'s `requiredPermission` and the API re-checks every
   * request. An admin who guesses the URL gets a permission-denied screen,
   * not data.
   */
  requiresPermission?: string;
  /**
   * Visible when the admin holds AT LEAST ONE of these.
   *
   * Needed where a single page legitimately serves two subjects — the Users
   * screen serves both `users.candidates.*` and `users.employers.*`, so
   * gating it on the candidate key alone hides it from an
   * employers-only admin who can perfectly well use it.
   */
  requiresAnyPermission?: string[];
  /**
   * Visible to SUPER_ADMIN only, and never grantable. Used for the
   * permission system itself and break-glass infrastructure (queues,
   * Kafka replay) — see the `superAdminOnly` nodes in the backend registry.
   */
  superAdminOnly?: boolean;
  /**
   * When set, the sidebar fetches the unread count for this notification
   * category and renders a small badge next to the label.
   */
  notificationCategory?: string;
  /**
   * When true, the sidebar fetches the count of unread WhatsApp conversations
   * and renders a small badge next to the label (SUPER_ADMIN only).
   */
  whatsappUnread?: boolean;
  /**
   * When true, the sidebar fetches the count of unread email replies and
   * renders a small badge next to the label (SUPER_ADMIN only).
   */
  emailUnread?: boolean;
}

/** A collapsible accordion section of the sidebar. */
export interface NavGroup {
  label: string;
  /** Section glyph — shown on the header + the collapsed rail. */
  icon: LucideIcon;
  /** Optional brand mark (e.g. 'whatsapp') rendered instead of `icon`. */
  brandIcon?: string;
  items: NavItem[];
}

/**
 * The full sidebar layout for a role: a handful of always-visible "top" tabs
 * followed by named, collapsible accordion groups.
 */
export interface NavStructure {
  top: NavItem[];
  groups: NavGroup[];
}

// ───────────────────────────────────────────────────────────────────────
// Billing nav (built per role — two items vary by role)
// ───────────────────────────────────────────────────────────────────────
function buildBillingNav(role: Role | undefined): NavItem[] {
  const items: NavItem[] = [
    { label: 'Plans', href: getRolePricingHref(role), icon: Tag },
    // "My Plans" is the master view of what the user actually HOLDS, as opposed
    // to "Plans" above which is the catalogue. Both roles get it.
    { label: 'My Plans', href: ROUTES.BILLING.MY_PLANS, icon: Layers },
    { label: 'Credits & Quotas', href: ROUTES.BILLING.CREDITS, icon: Coins },
  ];
  if (role === 'EMPLOYER') {
    items.push({
      label: 'Subscriptions',
      href: ROUTES.BILLING.SUBSCRIPTIONS,
      icon: Repeat,
      requiresFeature: 'feature.vendor_leads',
    });
  }
  items.push(
    { label: 'Order History', href: ROUTES.BILLING.ORDERS, icon: Receipt },
    { label: 'Invoices', href: ROUTES.BILLING.INVOICES, icon: FileText },
    { label: 'Payment Methods', href: ROUTES.BILLING.PAYMENT_METHODS, icon: CreditCard },
  );
  return items;
}

// Super-admin financial centre — its own grouped section.
const superAdminBillingNav: NavItem[] = [
  {
    label: 'Financial Centre',
    href: '/super-admin/billing',
    icon: DollarSign,
    requiresPermission: PERM.BILLING_DASHBOARD,
  },
  {
    label: 'Transactions',
    href: '/super-admin/billing/transactions',
    icon: Receipt,
    requiresPermission: PERM.BILLING_TRANSACTIONS_VIEW,
  },
  {
    label: 'Refunds',
    href: '/super-admin/billing/refunds',
    icon: AlertCircle,
    requiresPermission: PERM.BILLING_REFUNDS_VIEW,
  },
  {
    label: 'Settlements',
    href: '/super-admin/billing/settlements',
    icon: DollarSign,
    requiresPermission: PERM.BILLING_SETTLEMENTS_VIEW,
  },
  {
    label: 'Disputes',
    href: '/super-admin/billing/disputes',
    icon: AlertCircle,
    requiresPermission: PERM.BILLING_DISPUTES_VIEW,
  },
  {
    label: 'Plan Catalog',
    href: '/super-admin/billing/plans',
    icon: Tag,
    requiresPermission: PERM.BILLING_PLANS_VIEW,
  },
  {
    label: 'Coupons',
    href: '/super-admin/billing/coupons',
    icon: Tag,
    requiresPermission: PERM.BILLING_COUPONS_VIEW,
  },
  {
    label: 'Quote Requests',
    href: '/super-admin/billing/quotes',
    icon: MessageSquare,
    requiresPermission: PERM.BILLING_QUOTES_VIEW,
  },
  {
    label: 'Fraud Queue',
    href: '/super-admin/billing/fraud',
    icon: Shield,
    requiresPermission: PERM.BILLING_FRAUD_VIEW,
  },
  {
    label: 'Billing Settings',
    href: '/super-admin/billing/settings',
    icon: Settings,
    requiresPermission: PERM.BILLING_SETTINGS_VIEW,
  },
];

// ───────────────────────────────────────────────────────────────────────
// Per-role nav structures (top tabs + accordion groups)
// ───────────────────────────────────────────────────────────────────────

function candidateStructure(): NavStructure {
  return {
    top: [
      { label: 'Dashboard', href: ROUTES.CANDIDATE.DASHBOARD, icon: LayoutDashboard },
      { label: 'Profile', href: ROUTES.CANDIDATE.PROFILE, icon: User },
    ],
    groups: [
      {
        label: 'Job Search',
        icon: Search,
        items: [
          { label: 'Search Jobs', href: ROUTES.CANDIDATE.JOBS, icon: Search },
          { label: 'Find Companies', href: '/candidate/companies', icon: Building2 },
          { label: 'Recommendations', href: ROUTES.CANDIDATE.RECOMMENDATIONS, icon: Sparkles },
          { label: 'Saved Jobs', href: ROUTES.CANDIDATE.SAVED_JOBS, icon: Bookmark },
          { label: 'Job Alerts', href: ROUTES.CANDIDATE.JOB_ALERTS, icon: Bell },
        ],
      },
      {
        label: 'My Activity',
        icon: Activity,
        items: [
          { label: 'Applications', href: ROUTES.CANDIDATE.APPLICATIONS, icon: FileText },
          {
            label: 'Following',
            href: '/candidate/following',
            icon: Heart,
            notificationCategory: 'followed_company_new_job',
          },
          { label: 'My Reviews', href: '/candidate/reviews', icon: Star },
          { label: 'Analytics', href: ROUTES.CANDIDATE.ANALYTICS, icon: BarChart3 },
        ],
      },
      { label: 'Billing', icon: Coins, items: buildBillingNav('CANDIDATE') },
      {
        label: 'Account',
        icon: Settings,
        items: [
          { label: 'Verification', href: ROUTES.CANDIDATE.VERIFICATION, icon: ShieldCheck },
          { label: 'Settings', href: ROUTES.CANDIDATE.SETTINGS, icon: Settings },
          { label: 'Help & Support', href: ROUTES.CANDIDATE.HELP, icon: HelpCircle },
        ],
      },
    ],
  };
}

function employerStructure(): NavStructure {
  return {
    top: [
      { label: 'Dashboard', href: ROUTES.EMPLOYER.DASHBOARD, icon: LayoutDashboard },
      { label: 'Company Profile', href: ROUTES.EMPLOYER.PROFILE, icon: Building2 },
    ],
    groups: [
      {
        label: 'Hiring',
        icon: Briefcase,
        items: [
          {
            label: 'Post Job',
            href: ROUTES.EMPLOYER.POST_JOB,
            icon: PlusCircle,
            requiresFeature: 'feature.job_post',
          },
          {
            label: 'My Jobs',
            href: ROUTES.EMPLOYER.MY_JOBS,
            icon: Briefcase,
            requiresFeature: 'feature.job_post',
          },
          {
            label: 'Applications',
            href: ROUTES.EMPLOYER.APPLICATIONS,
            icon: ClipboardList,
            requiresFeature: 'feature.job_post',
          },
          {
            label: 'Find Candidates',
            href: ROUTES.EMPLOYER.CANDIDATES,
            icon: Users,
            requiresFeature: 'feature.cv_db_access',
          },
          {
            label: 'Saved Candidates',
            href: ROUTES.EMPLOYER.SAVED_CANDIDATES,
            icon: Bookmark,
            requiresFeature: 'feature.cv_db_access',
          },
          {
            label: 'Assisted Hiring',
            href: ROUTES.EMPLOYER.ASSISTED_HIRING,
            icon: Headphones,
            requiresFeature: 'feature.assisted_hiring',
          },
        ],
      },
      {
        label: 'Brand & Insights',
        icon: TrendingUp,
        items: [
          {
            label: 'Followers',
            href: '/employer/followers',
            icon: Heart,
            notificationCategory: 'company_follower',
          },
          {
            label: 'Reviews',
            href: '/employer/reviews',
            icon: Star,
            notificationCategory: 'company_new_review',
          },
          { label: 'Analytics', href: ROUTES.EMPLOYER.ANALYTICS, icon: BarChart3 },
        ],
      },
      {
        // Vendor Connect — an employer capability, not a separate role.
        label: 'Vendor Connect',
        icon: Handshake,
        items: [
          { label: 'Vendor Connect', href: ROUTES.EMPLOYER.VENDOR_HUB, icon: Handshake },
          { label: 'My Vendor Requests', href: ROUTES.EMPLOYER.VENDOR_REQUESTS, icon: Send },
          {
            label: 'Hiring Job Board',
            href: ROUTES.EMPLOYER.VENDOR_JOBS,
            icon: Briefcase,
            requiresFeature: 'feature.vendor_leads',
          },
          {
            label: 'Lead Inbox',
            href: ROUTES.EMPLOYER.VENDOR_LEADS,
            icon: Mail,
            requiresFeature: 'feature.vendor_leads',
          },
          {
            label: 'Vendor Profile',
            href: ROUTES.EMPLOYER.VENDOR_PROFILE,
            icon: Building2,
            requiresFeature: 'feature.vendor_leads',
          },
          { label: 'Recruitment Partners', href: ROUTES.VENDORS_PUBLIC.LIST, icon: Network },
        ],
      },
      { label: 'Billing', icon: Coins, items: buildBillingNav('EMPLOYER') },
      {
        label: 'Account',
        icon: Settings,
        items: [
          { label: 'Team', href: ROUTES.EMPLOYER.TEAM, icon: Users },
          { label: 'Verification', href: ROUTES.EMPLOYER.VERIFICATION, icon: ShieldCheck },
          { label: 'Settings', href: ROUTES.EMPLOYER.SETTINGS, icon: Settings },
          { label: 'Help & Support', href: ROUTES.EMPLOYER.HELP, icon: HelpCircle },
        ],
      },
    ],
  };
}

/**
 * The admin console nav — ONE structure shared by ADMIN and SUPER_ADMIN.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This used to be two hand-maintained trees: a thin `adminStructure()` and
 * a large `superAdminStructure()`. That modelled access as a fixed
 * two-tier hierarchy, which is exactly what the PBAC work replaces.
 *
 * Now there is one tree, and every item declares the permission that
 * unlocks it. An admin sees precisely the items they hold permissions for;
 * a super-admin sees everything. Granting `whatsapp.inbox.view` therefore
 * makes the real WhatsApp Inbox page appear in that admin's sidebar — no
 * duplicated `/admin/whatsapp` page, no drift between two copies of the
 * same screen.
 *
 * The `/super-admin/*` hrefs are shared surfaces, not a claim about who may
 * open them: the pages are permission-guarded, and the API re-checks every
 * request. The path prefix is kept for URL stability.
 *
 * `superAdminOnly: true` marks the handful of items that are never
 * delegable — admin management, the permission system, and break-glass
 * infrastructure. Those mirror the `superAdminOnly` nodes in the backend
 * registry, so they can be neither granted nor navigated to.
 */
function adminConsoleStructure(role: string | undefined): NavStructure {
  const isSuper = role === 'SUPER_ADMIN';

  return {
    top: [
      {
        label: 'Dashboard',
        href: isSuper ? ROUTES.SUPER_ADMIN.DASHBOARD : ROUTES.ADMIN.DASHBOARD,
        icon: LayoutDashboard,
      },
      {
        label: isSuper ? 'Platform Analytics' : 'Analytics',
        href: isSuper ? ROUTES.SUPER_ADMIN.ANALYTICS : ROUTES.ADMIN.ANALYTICS,
        icon: BarChart3,
        requiresPermission: PERM.ANALYTICS_OVERVIEW,
      },
    ],
    groups: [
      {
        label: 'People & Access',
        icon: Users,
        items: [
          {
            label: 'Manage Users',
            href: isSuper ? ROUTES.SUPER_ADMIN.USERS : ROUTES.ADMIN.USERS,
            icon: Users,
            // One screen, two subjects. Gating on the candidate key alone
            // would hide Users entirely from an employers-only admin.
            requiresAnyPermission: [PERM.USERS_CANDIDATES_VIEW, PERM.USERS_EMPLOYERS_VIEW],
          },
          {
            label: 'Manage Admins',
            href: ROUTES.SUPER_ADMIN.ADMINS,
            icon: Shield,
            superAdminOnly: true,
          },
          {
            label: 'Admin Control Centre',
            href: '/super-admin/admin-control',
            icon: KeyRound,
            superAdminOnly: true,
          },
          {
            label: 'Teams',
            href: '/super-admin/teams',
            icon: Users,
            requiresPermission: PERM.TEAMS_VIEW,
          },
        ],
      },
      {
        label: 'Content & Moderation',
        icon: Shield,
        items: [
          {
            label: 'Jobs',
            href: isSuper ? ROUTES.SUPER_ADMIN.JOBS : ROUTES.ADMIN.JOBS,
            icon: Briefcase,
            requiresPermission: PERM.JOBS_VIEW,
          },
          {
            label: 'Post a Job',
            href: ROUTES.SUPER_ADMIN.JOB_NEW,
            icon: PlusCircle,
            requiresPermission: PERM.JOBS_AUTHOR_CREATE,
          },
          {
            label: 'Applications',
            href: ROUTES.ADMIN.APPLICATIONS,
            icon: FileText,
            requiresPermission: PERM.JOBS_APPLICATIONS_VIEW,
          },
          {
            label: 'Verifications',
            href: ROUTES.ADMIN.VERIFICATIONS,
            icon: ShieldCheck,
            // One queue, two subjects — gating on the candidate key alone
            // hid it entirely from an employer-scoped reviewer.
            requiresAnyPermission: [
              PERM.VERIFICATIONS_CANDIDATE_VIEW,
              PERM.VERIFICATIONS_EMPLOYER_VIEW,
            ],
          },
          {
            label: 'Moderation',
            href: ROUTES.ADMIN.MODERATION,
            icon: Shield,
            requiresPermission: PERM.MODERATION_KEYWORDS_VIEW,
          },
          {
            label: 'Reviews',
            href: '/super-admin/reviews',
            icon: Star,
            notificationCategory: 'review_auto_flagged',
            requiresPermission: PERM.REVIEWS_VIEW,
          },
          {
            label: 'Curated Listings',
            href: '/super-admin/curated-listings',
            icon: ListPlus,
            requiresPermission: PERM.CURATED_VIEW,
          },
          {
            label: 'Resume Watermark',
            href: ROUTES.SUPER_ADMIN.RESUME_WATERMARK,
            icon: Stamp,
            // Any-of, NOT the domain root. Prefix matching runs
            // parent→child: a grant on `resume_watermark` satisfies
            // `resume_watermark.on_platform.view`, but the reverse is false,
            // so gating on the root would hide the item from an admin
            // granted only the tab they can actually use. Gating on
            // `config.view` alone had the same effect for the same reason —
            // the page's DEFAULT tab is on-platform, not settings.
            requiresAnyPermission: [
              PERM.RESUME_WATERMARK_ON_PLATFORM_VIEW,
              PERM.RESUME_WATERMARK_OFF_PLATFORM_VIEW,
              PERM.RESUME_WATERMARK_CONFIG_VIEW,
            ],
          },
          {
            label: 'Follow Graph',
            href: '/super-admin/follows',
            icon: Heart,
            requiresPermission: PERM.FOLLOWS_VIEW,
          },
        ],
      },
      {
        label: 'Vendors & Hiring',
        icon: Handshake,
        items: [
          {
            label: 'Vendors',
            href: '/super-admin/vendors',
            icon: Building2,
            requiresPermission: PERM.VENDORS_VIEW,
          },
          {
            label: 'Assisted Hiring',
            href: '/super-admin/assisted-hiring',
            icon: Headphones,
            requiresPermission: PERM.ASSISTED_HIRING_VIEW,
          },
        ],
      },
      {
        label: 'Support',
        icon: Headphones,
        items: [
          {
            label: 'Support Tickets',
            href: ROUTES.ADMIN.TICKETS,
            icon: MessageSquare,
            // `.view` = own assignments, `.view_all` = whole queue. Either
            // makes the page useful, so gating on `.view` alone hid it from
            // agents granted only the broader key.
            requiresAnyPermission: [PERM.SUPPORT_TICKETS_VIEW, PERM.SUPPORT_TICKETS_VIEW_ALL],
          },
          {
            label: 'Ticket Analytics',
            href: ROUTES.SUPER_ADMIN.TICKETS,
            icon: BarChart3,
            requiresPermission: PERM.SUPPORT_ANALYTICS,
          },
          {
            label: 'Email Templates',
            href: ROUTES.ADMIN.EMAIL_TEMPLATES,
            icon: Mail,
            requiresPermission: PERM.PLATFORM_EMAIL_TEMPLATES_VIEW,
          },
        ],
      },
      {
        label: 'WhatsApp',
        icon: MessageCircle,
        brandIcon: 'whatsapp',
        items: [
          {
            label: 'Inbox',
            href: ROUTES.SUPER_ADMIN.WHATSAPP,
            icon: MessageCircle,
            whatsappUnread: true,
            requiresPermission: PERM.WA_INBOX_VIEW,
          },
          {
            label: 'Templates',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_TEMPLATES,
            icon: FileText,
            requiresPermission: PERM.WA_TEMPLATES_VIEW,
          },
          {
            label: 'Contacts',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_CONTACTS,
            icon: Users,
            requiresPermission: PERM.WA_CONTACTS_VIEW,
          },
          {
            label: 'Platform Users',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_PLATFORM_USERS,
            icon: UserCheck,
            requiresPermission: PERM.WA_CONTACTS_PLATFORM_USERS,
          },
          {
            label: 'Campaigns',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGNS,
            icon: Send,
            requiresPermission: PERM.WA_CAMPAIGNS_VIEW,
          },
          {
            label: 'Analytics',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_ANALYTICS,
            icon: BarChart3,
            requiresPermission: PERM.WA_ANALYTICS_VIEW,
          },
          {
            label: 'Settings',
            href: ROUTES.SUPER_ADMIN.WHATSAPP_SETTINGS,
            icon: Settings,
            requiresPermission: PERM.WA_SETTINGS_VIEW,
          },
        ],
      },
      {
        label: 'Email',
        icon: Mail,
        items: [
          {
            label: 'Inbox',
            href: ROUTES.SUPER_ADMIN.EMAIL,
            icon: Inbox,
            emailUnread: true,
            requiresPermission: PERM.EMAIL_INBOX_VIEW,
          },
          {
            label: 'Mailbox',
            href: ROUTES.SUPER_ADMIN.EMAIL_MAIL,
            icon: AtSign,
            requiresPermission: PERM.EMAIL_MAILBOX_VIEW,
          },
          {
            label: 'Templates',
            href: ROUTES.SUPER_ADMIN.EMAIL_TEMPLATES,
            icon: FileText,
            requiresPermission: PERM.EMAIL_TEMPLATES_VIEW,
          },
          {
            label: 'Campaigns',
            href: ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGNS,
            icon: Send,
            requiresPermission: PERM.EMAIL_CAMPAIGNS_VIEW,
          },
          {
            label: 'Contacts',
            href: ROUTES.SUPER_ADMIN.EMAIL_CONTACTS,
            icon: Users,
            requiresPermission: PERM.EMAIL_CONTACTS_VIEW,
          },
          {
            label: 'Sets',
            href: ROUTES.SUPER_ADMIN.EMAIL_SETS,
            icon: ListPlus,
            requiresPermission: PERM.EMAIL_SETS_VIEW,
          },
          {
            label: 'Platform Users',
            href: ROUTES.SUPER_ADMIN.EMAIL_PLATFORM_USERS,
            icon: UserCheck,
            requiresPermission: PERM.EMAIL_CONTACTS_PLATFORM_USERS,
          },
          {
            label: 'Analytics',
            href: ROUTES.SUPER_ADMIN.EMAIL_ANALYTICS,
            icon: BarChart3,
            requiresPermission: PERM.EMAIL_ANALYTICS_VIEW,
          },
          {
            label: 'Suppression',
            href: ROUTES.SUPER_ADMIN.EMAIL_SUPPRESSION,
            icon: Shield,
            requiresPermission: PERM.EMAIL_SUPPRESSION_VIEW,
          },
          {
            label: 'Unsubscribes',
            href: ROUTES.SUPER_ADMIN.EMAIL_UNSUBSCRIBES,
            icon: MailX,
            requiresPermission: PERM.EMAIL_UNSUBSCRIBES_VIEW,
          },
          {
            label: 'Settings',
            href: ROUTES.SUPER_ADMIN.EMAIL_SETTINGS,
            icon: Settings,
            requiresPermission: PERM.EMAIL_SETTINGS_VIEW,
          },
        ],
      },
      { label: 'Billing & Finance', icon: Coins, items: superAdminBillingNav },
      {
        label: 'Platform',
        icon: SlidersHorizontal,
        items: [
          {
            label: 'Audit Logs',
            href: ROUTES.ADMIN.AUDIT_LOGS,
            icon: ClipboardList,
            requiresPermission: PERM.PLATFORM_AUDIT_LOGS_VIEW,
          },
          {
            label: 'Reports',
            href: ROUTES.ADMIN.REPORTS,
            icon: FileBarChart,
            requiresPermission: PERM.REPORTS_VIEW,
          },
          {
            label: 'Feature Flags',
            href: ROUTES.SUPER_ADMIN.FEATURE_FLAGS,
            icon: ToggleLeft,
            requiresPermission: PERM.PLATFORM_FEATURE_FLAGS_VIEW,
          },
          {
            label: 'System Config',
            href: ROUTES.SUPER_ADMIN.CONFIG,
            icon: Settings,
            requiresPermission: PERM.PLATFORM_SYSTEM_CONFIG_VIEW,
          },
          // Every admin needs their own security/settings page — it is where
          // MFA and sessions live, so it is never permission-gated.
          {
            label: isSuper ? 'Security' : 'Settings',
            href: isSuper ? ROUTES.SUPER_ADMIN.SETTINGS : ROUTES.ADMIN.SETTINGS,
            icon: Shield,
          },
        ],
      },
    ],
  };
}

export function getNavStructure(role: string | undefined): NavStructure {
  switch (role) {
    case 'CANDIDATE':
      return candidateStructure();
    case 'EMPLOYER':
      return employerStructure();
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return adminConsoleStructure(role);
    default:
      return { top: [], groups: [] };
  }
}

/**
 * Build the nav predicate from the two independent gates an item can carry.
 *
 * Feature gating (entitlements) and permission gating (admin PBAC) are
 * orthogonal and never apply to the same item in practice — entitlements
 * gate candidate/employer surfaces, permissions gate the admin console —
 * but both are evaluated so a future item could use either.
 *
 * ── Loading semantics differ on purpose ────────────────────────────────
 * While ENTITLEMENTS load we keep items (optimistic): the cost of a brief
 * extra item is a dead click, and hiding paid features from a paying user
 * mid-load reads as a billing bug.
 *
 * While PERMISSIONS load we DROP items (pessimistic): the cost of guessing
 * wrong is briefly showing an admin the full super-admin console, which
 * reads as a security hole even though every click would 403. The sidebar
 * renders a skeleton for that fraction of a second instead.
 */
export function buildNavFilter({
  hasFeature,
  entitlementsLoading,
  can,
  canAny,
  isSuperAdmin,
  permissionsLoading,
}: {
  hasFeature: (key: string) => boolean;
  entitlementsLoading: boolean;
  can: (key: string) => boolean;
  canAny: (...keys: string[]) => boolean;
  isSuperAdmin: boolean;
  permissionsLoading: boolean;
}) {
  return (it: NavItem): boolean => {
    if (it.superAdminOnly && !isSuperAdmin) return false;

    if (it.requiresFeature && !entitlementsLoading && !hasFeature(it.requiresFeature)) {
      return false;
    }

    if (!isSuperAdmin && (it.requiresPermission || it.requiresAnyPermission?.length)) {
      if (permissionsLoading) return false;
      if (it.requiresPermission && !can(it.requiresPermission)) return false;
      if (it.requiresAnyPermission?.length && !canAny(...it.requiresAnyPermission)) return false;
    }

    return true;
  };
}

/**
 * Drop gated items the user can't access, then drop any group that became
 * empty. Preserves each group's `icon`. Shared by the desktop + mobile
 * sidebars so they stay in lockstep.
 */
export function filterStructureByFeature(
  structure: NavStructure,
  keep: (it: NavItem) => boolean,
): NavStructure {
  return {
    top: structure.top.filter(keep),
    groups: structure.groups
      .map((g) => ({ ...g, items: g.items.filter(keep) }))
      .filter((g) => g.items.length > 0),
  };
}

/** Flat list of every navigable item (top + all group items). */
export function flattenNav(structure: NavStructure): NavItem[] {
  return [...structure.top, ...structure.groups.flatMap((g) => g.items)];
}

// ───────────────────────────────────────────────────────────────────────
// Shared nav renderer (desktop + mobile)
// ───────────────────────────────────────────────────────────────────────

/**
 * Renders the sidebar nav: an optional filter box + pinned zone, the always-
 * visible top items, then the grouped accordion sections (or, when
 * `collapsed`, an icon rail with hover/focus flyouts).
 *
 * Expansion is MULTI-OPEN and PERSISTED per role (via useSidebarPrefs → backend
 * + localStorage): the user's stored open-set wins; absent that, a role-scoped
 * default opens either all sections (≤5-group roles) or the active + first two
 * (denser roles). The section owning the active route is always force-open so
 * the highlighted item is never hidden — and its header carries an active accent
 * even when other sections are collapsed.
 */
export function SidebarNavTree({
  structure,
  pathname,
  collapsed,
  role,
  onNavigate,
  onExpandRail,
  showTools = true,
}: {
  structure: NavStructure;
  pathname: string;
  collapsed: boolean;
  role?: string;
  onNavigate?: () => void;
  /** Desktop only: expand the collapsed rail (called when a rail section is activated). */
  onExpandRail?: () => void;
  /** Whether to render the filter box + pinned zone (off for the collapsed rail). */
  showTools?: boolean;
}) {
  const prefs = useSidebarPrefs(role);
  const [filter, setFilter] = useState('');

  // Active href resolved GLOBALLY via longest-prefix match, so exactly one tab
  // highlights even when a parent route prefixes a child in another group.
  const activeHref = useMemo(
    () =>
      resolveActiveNavHref(
        flattenNav(structure).map((i) => i.href),
        pathname,
      ),
    [structure, pathname],
  );
  const activeGroup = useMemo(
    () => structure.groups.find((g) => g.items.some((i) => i.href === activeHref))?.label ?? null,
    [structure.groups, activeHref],
  );

  // Resolve pinned hrefs → live items (drop stale / feature-gated-out ones).
  const pinnedItems = useMemo(() => {
    if (!prefs.pins.length) return [];
    const map = new Map(flattenNav(structure).map((i) => [i.href, i]));
    return prefs.pins.map((href) => map.get(href)).filter((i): i is NavItem => Boolean(i));
  }, [prefs.pins, structure]);

  // Base open-set (user override, else role default). The active group is
  // unioned in at render so the highlighted item is never hidden.
  const baseOpen = useMemo(() => {
    if (prefs.expandedOverride) return new Set(prefs.expandedOverride);
    if (structure.groups.length <= 5) return new Set(structure.groups.map((g) => g.label));
    const s = new Set<string>();
    if (activeGroup) s.add(activeGroup);
    structure.groups.slice(0, 2).forEach((g) => s.add(g.label));
    return s;
  }, [prefs.expandedOverride, structure.groups, activeGroup]);

  const q = filter.trim().toLowerCase();
  const isGroupOpen = (label: string) => baseOpen.has(label) || label === activeGroup;
  const toggleGroup = (label: string) => {
    const next = new Set(baseOpen);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    prefs.setExpanded([...next]);
  };
  const expandToSection = (label: string) => {
    if (!baseOpen.has(label)) prefs.setExpanded([...baseOpen, label]);
    onExpandRail?.();
  };

  // ── Collapsed icon rail ──
  if (collapsed) {
    return (
      <RailNav
        structure={structure}
        activeHref={activeHref}
        activeGroup={activeGroup}
        pinnedItems={pinnedItems}
        onExpandToSection={expandToSection}
        onNavigate={onNavigate}
      />
    );
  }

  // ── Expanded tree ──
  const headerKeydown = (e: ReactKeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const headers = Array.from(
      (e.currentTarget.closest('[data-nav-tree]') ?? document).querySelectorAll<HTMLElement>(
        '[data-section-header]',
      ),
    );
    const idx = headers.indexOf(e.currentTarget as HTMLElement);
    if (idx < 0) return;
    e.preventDefault();
    const target =
      e.key === 'Home'
        ? headers[0]
        : e.key === 'End'
          ? headers[headers.length - 1]
          : e.key === 'ArrowDown'
            ? headers[(idx + 1) % headers.length]
            : headers[(idx - 1 + headers.length) % headers.length];
    target?.focus();
  };

  return (
    <div data-nav-tree>
      {showTools && (
        <div className="mb-2 px-1">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter nav…"
              aria-label="Filter navigation"
              className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pr-7 pl-8 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter('')}
                aria-label="Clear filter"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {showTools && !q && pinnedItems.length > 0 && (
        <PinnedZone
          items={pinnedItems}
          activeHref={activeHref}
          prefs={prefs}
          onNavigate={onNavigate}
        />
      )}

      <NavItemsList
        items={q ? structure.top.filter((i) => i.label.toLowerCase().includes(q)) : structure.top}
        activeHref={activeHref}
        prefs={prefs}
        onNavigate={onNavigate}
      />

      <div className="mt-2 space-y-0.5">
        {structure.groups.map((g) => {
          const matched = q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items;
          if (q && matched.length === 0) return null;
          return (
            <AccordionGroup
              key={g.label}
              group={g}
              items={matched}
              expanded={q ? true : isGroupOpen(g.label)}
              isActiveSection={g.label === activeGroup}
              activeHref={activeHref}
              prefs={prefs}
              onToggle={() => toggleGroup(g.label)}
              onNavigate={onNavigate}
              onHeaderKeyDown={headerKeydown}
              // During a filter the panels are forced open + non-collapsible.
              staticOpen={Boolean(q)}
            />
          );
        })}
      </div>
    </div>
  );
}

type SidebarPrefsApi = ReturnType<typeof useSidebarPrefs>;

function PinnedZone({
  items,
  activeHref,
  prefs,
  onNavigate,
}: {
  items: NavItem[];
  activeHref: string | null;
  prefs: SidebarPrefsApi;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-2">
      <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
        Pinned
      </p>
      <ul className="space-y-1">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isActive = item.href === activeHref;
          return (
            <li key={item.href} className="group/pin relative">
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'focus-visible:ring-primary flex items-center gap-3 rounded-lg py-2 pr-14 pl-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'bg-primary-light text-primary font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
                )}
              >
                {isActive && (
                  <span className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r" />
                )}
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.notificationCategory && (
                  <NavItemUnreadBadge category={item.notificationCategory} />
                )}
                {item.whatsappUnread && <WhatsappUnreadBadge />}
                {item.emailUnread && <EmailUnreadBadge />}
              </Link>
              {/* Reorder / unpin controls — appear on hover/focus of the row. */}
              <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/pin:opacity-100 group-hover/pin:opacity-100">
                <button
                  type="button"
                  onClick={() => prefs.movePin(item.href, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${item.label} up`}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-white hover:text-[var(--text)] disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => prefs.movePin(item.href, 1)}
                  disabled={idx === items.length - 1}
                  aria-label={`Move ${item.label} down`}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-white hover:text-[var(--text)] disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => prefs.togglePin(item.href)}
                  aria-label={`Unpin ${item.label}`}
                  className="text-primary rounded p-0.5 hover:bg-white"
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mx-3 mt-2 border-t border-[var(--border)]" />
    </div>
  );
}

/**
 * Renders a section's glyph — a brand mark (e.g. WhatsApp) when the group
 * declares `brandIcon`, otherwise its lucide `icon`. Inherits currentColor so
 * it tracks the header's muted / active-section colour.
 */
function SectionGlyph({ group, className }: { group: NavGroup; className?: string }) {
  if (group.brandIcon) return <BrandIcon name={group.brandIcon} className={className} />;
  const Icon = group.icon;
  return <Icon className={className} />;
}

function AccordionGroup({
  group,
  items,
  expanded,
  isActiveSection,
  activeHref,
  prefs,
  onToggle,
  onNavigate,
  onHeaderKeyDown,
  staticOpen,
}: {
  group: NavGroup;
  items: NavItem[];
  expanded: boolean;
  isActiveSection: boolean;
  activeHref: string | null;
  prefs: SidebarPrefsApi;
  onToggle: () => void;
  onNavigate?: () => void;
  onHeaderKeyDown: (e: ReactKeyboardEvent) => void;
  staticOpen?: boolean;
}) {
  const panelId = `navgrp-${group.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const badgedItems = group.items.filter(
    (i) => i.notificationCategory || i.whatsappUnread || i.emailUnread,
  );
  return (
    <div>
      <button
        type="button"
        data-section-header
        onClick={onToggle}
        onKeyDown={onHeaderKeyDown}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          'focus-visible:ring-primary relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
          isActiveSection
            ? 'text-primary'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]',
        )}
      >
        {isActiveSection && (
          <span className="bg-primary absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-r" />
        )}
        <SectionGlyph group={group} className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {!expanded &&
            badgedItems.map((i) =>
              i.whatsappUnread ? (
                <WhatsappUnreadBadge key={i.href} compact />
              ) : i.emailUnread ? (
                <EmailUnreadBadge key={i.href} compact />
              ) : (
                <HeaderUnreadBadge key={i.href} category={i.notificationCategory as string} />
              ),
            )}
          {!staticOpen && (
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
            />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-0.5 pb-1 pl-2.5">
              <NavItemsList
                items={items}
                activeHref={activeHref}
                prefs={prefs}
                onNavigate={onNavigate}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItemsList({
  items,
  activeHref,
  prefs,
  onNavigate,
}: {
  items: NavItem[];
  activeHref: string | null;
  prefs?: SidebarPrefsApi;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon;
        const pinned = prefs?.isPinned(item.href) ?? false;
        return (
          <li key={item.href} className="group/row relative">
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-primary flex items-center gap-3 rounded-lg py-2 pr-8 pl-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
              )}
            >
              {isActive && (
                <span className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r" />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.notificationCategory && (
                <NavItemUnreadBadge category={item.notificationCategory} />
              )}
              {item.whatsappUnread && <WhatsappUnreadBadge />}
              {item.emailUnread && <EmailUnreadBadge />}
            </Link>
            {prefs && (
              <button
                type="button"
                onClick={() => prefs.togglePin(item.href)}
                aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                aria-pressed={pinned}
                className={cn(
                  'absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 transition-opacity hover:bg-white',
                  pinned
                    ? 'text-primary opacity-100'
                    : 'text-[var(--text-muted)] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-[var(--text)]',
                )}
              >
                <Star className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Collapsed icon rail (one glyph per section + hover/focus flyout)
// ───────────────────────────────────────────────────────────────────────

function RailNav({
  structure,
  activeHref,
  activeGroup,
  pinnedItems,
  onExpandToSection,
  onNavigate,
}: {
  structure: NavStructure;
  activeHref: string | null;
  activeGroup: string | null;
  pinnedItems: NavItem[];
  onExpandToSection: (label: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <RailIconList items={structure.top} activeHref={activeHref} onNavigate={onNavigate} />
      {pinnedItems.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-[var(--border)]" />
          <RailIconList items={pinnedItems} activeHref={activeHref} onNavigate={onNavigate} />
        </>
      )}
      <div className="mx-2 my-1 border-t border-[var(--border)]" />
      <ul className="space-y-1">
        {structure.groups.map((g) => (
          <RailSection
            key={g.label}
            group={g}
            activeHref={activeHref}
            isActiveSection={g.label === activeGroup}
            onActivate={() => onExpandToSection(g.label)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}

function RailIconList({
  items,
  activeHref,
  onNavigate,
}: {
  items: NavItem[];
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === activeHref;
        return (
          <li key={item.href}>
            <Tooltip content={item.label} position="right">
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-primary relative flex items-center justify-center rounded-lg px-2 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
                )}
              >
                {isActive && (
                  <span className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r" />
                )}
                <Icon className="h-5 w-5 shrink-0" />
                {(item.whatsappUnread || item.emailUnread) && (
                  <span className="bg-primary absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-white" />
                )}
              </Link>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function RailSection({
  group,
  activeHref,
  isActiveSection,
  onActivate,
  onNavigate,
}: {
  group: NavGroup;
  activeHref: string | null;
  isActiveSection: boolean;
  onActivate: () => void;
  onNavigate?: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right + 8 });
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPos(null), 140);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <li className="relative" onMouseEnter={open} onMouseLeave={scheduleClose}>
      <button
        ref={btnRef}
        type="button"
        onClick={onActivate}
        onFocus={open}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPos(null);
        }}
        aria-haspopup="menu"
        aria-label={`${group.label} section`}
        className={cn(
          'focus-visible:ring-primary relative flex w-full items-center justify-center rounded-lg px-2 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none',
          isActiveSection
            ? 'bg-primary-light text-primary'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
        )}
      >
        {isActiveSection && (
          <span className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r" />
        )}
        <SectionGlyph group={group} className="h-5 w-5 shrink-0" />
      </button>
      {pos &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            role="menu"
            aria-label={group.label}
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="animate-slide-down z-[60] min-w-[204px] rounded-xl border border-[var(--border)] bg-white p-1 shadow-lg"
          >
            <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
              <SectionGlyph group={group} className="h-3.5 w-3.5" />
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => {
                    setPos(null);
                    onNavigate?.();
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary-light text-primary font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.notificationCategory && (
                    <NavItemUnreadBadge category={item.notificationCategory} />
                  )}
                  {item.whatsappUnread && <WhatsappUnreadBadge />}
                  {item.emailUnread && <EmailUnreadBadge />}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </li>
  );
}

// sessionStorage key for persisting sidebar scrollTop (chrome remounts per nav).
const SIDEBAR_SCROLL_KEY = 'ha:sidebar-scroll';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUIStore();
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { can, canAny, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (typeof window === 'undefined') return;
    const saved = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved === null) return;
    const top = Number(saved);
    if (!Number.isFinite(top)) return;
    const id = window.requestAnimationFrame(() => {
      if (nav.isConnected) nav.scrollTop = top;
    });
    return () => window.cancelAnimationFrame(id);
  }, [entitlementsLoading]);

  const structure = filterStructureByFeature(
    getNavStructure(user?.role),
    buildNavFilter({
      hasFeature,
      entitlementsLoading,
      can,
      canAny,
      isSuperAdmin,
      permissionsLoading,
    }),
  );

  return (
    <aside
      className={cn(
        'sticky top-18 hidden h-[calc(100vh-4.5rem)] flex-col border-r border-[var(--border)] bg-white transition-all duration-300 lg:flex',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <nav
        ref={navRef}
        data-lenis-prevent
        onScroll={(e) => {
          if (typeof window === 'undefined') return;
          window.sessionStorage.setItem(
            SIDEBAR_SCROLL_KEY,
            String((e.currentTarget as HTMLElement).scrollTop),
          );
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
      >
        <SidebarNavTree
          structure={structure}
          pathname={pathname}
          collapsed={sidebarCollapsed}
          role={user?.role}
          onExpandRail={sidebarCollapsed ? toggleSidebarCollapsed : undefined}
        />
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[var(--border)] p-3">
        <Tooltip
          content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          position="right"
        >
          <button
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex w-full items-center justify-center rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

/**
 * Inline unread-count badge for sidebar nav items. Polls every 30s via the
 * existing useUnreadCount hook (paused when tab hidden). Hides at zero.
 */
function NavItemUnreadBadge({ category }: { category: string }) {
  const { data } = useUnreadCount(category);
  const count = data?.data?.count ?? 0;
  if (count <= 0) return null;
  return (
    <span
      className="bg-primary ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Unread badge for the WhatsApp Inbox nav item. Real-time via socket + 60s
 * poll fallback; hides at zero. `compact` renders the smaller header/rollup
 * variant.
 *
 * Gated on the PERMISSION, not the role: the nav item it hangs off is
 * permission-gated and the backend serves the count on the same key, so a
 * role check here meant a granted admin saw the Inbox link with a
 * permanently absent badge. `can()` short-circuits true for super-admins.
 */
function WhatsappUnreadBadge({ compact = false }: { compact?: boolean }) {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const enabled = can(PERM.WA_INBOX_VIEW);
  const { data } = useQuery({
    queryKey: ['wa-inbox-unread-total'],
    queryFn: () => superAdminWhatsappService.getUnreadTotal(),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!socket || !enabled) return;
    const onMessage = (d: { message?: { direction?: string } }) => {
      if (d?.message?.direction === 'INBOUND') {
        qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
      }
    };
    const onConversation = () => {
      qc.invalidateQueries({ queryKey: ['wa-inbox-unread-total'] });
    };
    socket.on('wa:message', onMessage);
    socket.on('wa:conversation', onConversation);
    return () => {
      socket.off('wa:message', onMessage);
      socket.off('wa:conversation', onConversation);
    };
  }, [socket, enabled, qc]);
  const count = data?.data?.total ?? 0;
  if (!enabled || count <= 0) return null;
  if (compact) {
    return (
      <span
        className="bg-primary inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
        aria-label={`${count} unread WhatsApp messages`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return (
    <span
      className="bg-primary ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
      aria-label={`${count} unread WhatsApp messages`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Unread badge for the Email Inbox nav item. Real-time via socket + 60s poll
 * fallback; hides at zero. `compact` renders the smaller header/rollup
 * variant.
 *
 * Permission-gated for the same reason as its WhatsApp twin above.
 */
function EmailUnreadBadge({ compact = false }: { compact?: boolean }) {
  const { socket } = useSocket();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const enabled = can(PERM.EMAIL_INBOX_VIEW);
  const { data } = useQuery({
    queryKey: ['email-inbox-unread-total'],
    queryFn: () => superAdminEmailService.getUnreadCount(),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!socket || !enabled) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['email-inbox-unread-total'] });
    socket.on('email:message', invalidate);
    socket.on('email:thread', invalidate);
    return () => {
      socket.off('email:message', invalidate);
      socket.off('email:thread', invalidate);
    };
  }, [socket, enabled, qc]);
  const count = data?.data?.count ?? 0;
  if (!enabled || count <= 0) return null;
  if (compact) {
    return (
      <span
        className="bg-primary inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
        aria-label={`${count} unread email replies`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return (
    <span
      className="bg-primary ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
      aria-label={`${count} unread email replies`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Compact unread badge rolled up onto a collapsed accordion header so a folded
 * group still surfaces its items' unread signal. Same 30s poll; hides at zero.
 */
function HeaderUnreadBadge({ category }: { category: string }) {
  const { data } = useUnreadCount(category);
  const count = data?.data?.count ?? 0;
  if (count <= 0) return null;
  return (
    <span
      className="bg-primary inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
