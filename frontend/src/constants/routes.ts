import { OPEN_CONV_PARAM } from '@/lib/wa-open-conv';

/**
 * Frontend route paths.
 *
 * The host platform's version carried 155 keys across 10 groups — public
 * marketing pages, auth, candidate and employer dashboards, admin, billing,
 * vendors — plus PUBLIC_ROUTES / AUTH_ROUTES / ROLE_DASHBOARDS derived from
 * them. None of those pages exist here, and with a single app password there is
 * no role to route by, so ROLE_DASHBOARDS had nothing left to map.
 *
 * The `SUPER_ADMIN` group name is kept because the campaign pages spell it that
 * way; it carries no authorization meaning.
 */
export const ROUTES = {
  SUPER_ADMIN: {
    // The module root. Redirects in proxy.ts, app/page.tsx, use-auth.ts and
    // Logo.tsx spell this literally — Next route paths are file-system paths —
    // so it is listed here for completeness rather than because it is imported.
    WHATSAPP: '/whatsapp',
    WHATSAPP_CONTACTS: '/whatsapp/contacts',
    WHATSAPP_CAMPAIGNS: '/whatsapp/campaigns',
    WHATSAPP_CAMPAIGN_NEW: '/whatsapp/campaigns/new',
    WHATSAPP_CAMPAIGN_DETAIL: (id: string) => `/whatsapp/campaigns/${id}`,
    // The global send-later queue (every conversation's scheduled messages).
    WHATSAPP_SCHEDULED: '/whatsapp/scheduled',
    // Permalink to a single inbox thread. The inbox keeps its open conversation
    // in the query string (see lib/wa-open-conv), so this is the address to
    // bookmark, paste into a ticket, or link to from another page — there is no
    // `/whatsapp/[conversationId]` segment to route to.
    WHATSAPP_CONVERSATION: (id: string) => `/whatsapp?${OPEN_CONV_PARAM}=${encodeURIComponent(id)}`,
  },
} as const;
