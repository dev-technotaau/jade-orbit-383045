import type { PermissionRule } from '../middleware/require-permission';

/**
 * Route → permission tables for the large domain routers.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WhatsApp (~115 routes), Email (~165) and Billing (~35) are too big to
 * gate by decorating each route: the access model would be spread across
 * hundreds of call sites and nobody could review it. Instead each router
 * mounts one `enforcePermissionMap()` fed by the table below, so an entire
 * domain's authorisation model reads top-to-bottom in one place.
 *
 * ── Rules ──────────────────────────────────────────────────────────────
 * • FIRST MATCH WINS. Specific paths MUST precede general ones — put
 *   `/contacts/export` above `/contacts/:id`, or `:id` swallows it.
 * • `:param` matches exactly one segment; a trailing `*` matches the rest.
 * • Paths are relative to the router's mount point.
 * • The `fallback` (second argument at the mount site) catches anything
 *   unmapped. It is deliberately a NARROW key in every domain, so a route
 *   added without a matching rule fails closed instead of inheriting broad
 *   access. If a new endpoint 403s for everyone, the rule is missing —
 *   that is the design working.
 */

// ═══════════════════════════════════════════════════════════════════════
// WhatsApp — mounted at /api/v1/super-admin/whatsapp
// ═══════════════════════════════════════════════════════════════════════

export const WHATSAPP_PERMISSION_RULES: PermissionRule[] = [
  // ── Channels & agents ──
  { method: 'GET', path: '/channels', permission: 'whatsapp.channels.view' },
  { method: 'POST', path: '/channels/sync', permission: 'whatsapp.channels.sync' },
  { method: 'GET', path: '/agents', permission: 'whatsapp.inbox.assign' },

  // ── Analytics (before the bare /analytics catch) ──
  { method: 'GET', path: '/analytics/conversions', permission: 'whatsapp.analytics.view' },
  { method: 'GET', path: '/analytics/*', permission: 'whatsapp.analytics.view' },
  { method: 'GET', path: '/analytics', permission: 'whatsapp.analytics.view' },
  // A WRITE endpoint — it persists a WaConversion row. It was mapped to the
  // read key, so a view-only analytics grant could author funnel data.
  { method: 'POST', path: '/conversions', permission: 'whatsapp.analytics.record' },

  // ── Settings ──
  { method: 'GET', path: '/settings', permission: 'whatsapp.settings.view' },
  { method: 'PUT', path: '/settings', permission: 'whatsapp.settings.edit' },

  // ── Automation ──
  { method: '*', path: '/keyword-rules', permission: 'whatsapp.automation.keyword_rules' },
  { method: '*', path: '/keyword-rules/:id', permission: 'whatsapp.automation.keyword_rules' },
  { method: '*', path: '/canned-replies', permission: 'whatsapp.automation.canned_replies' },
  { method: '*', path: '/canned-replies/:id', permission: 'whatsapp.automation.canned_replies' },
  { method: '*', path: '/faqs', permission: 'whatsapp.automation.faqs' },
  { method: '*', path: '/faqs/reorder', permission: 'whatsapp.automation.faqs' },
  { method: '*', path: '/faqs/:id', permission: 'whatsapp.automation.faqs' },

  // ── Templates ──
  { method: 'GET', path: '/templates', permission: 'whatsapp.templates.view' },
  { method: 'POST', path: '/templates/sync', permission: 'whatsapp.templates.sync' },
  { method: 'POST', path: '/templates/media-handle', permission: 'whatsapp.templates.create' },
  { method: 'POST', path: '/templates', permission: 'whatsapp.templates.create' },
  { method: 'GET', path: '/templates/:id/analytics', permission: 'whatsapp.templates.analytics' },
  { method: 'GET', path: '/templates/:id', permission: 'whatsapp.templates.view' },
  { method: 'DELETE', path: '/templates/:id', permission: 'whatsapp.templates.delete' },

  // ── Contacts (specific paths first) ──
  { method: 'GET', path: '/contacts/export', permission: 'whatsapp.contacts.export' },
  {
    method: 'GET',
    path: '/contacts/platform-users',
    permission: 'whatsapp.contacts.platform_users',
  },
  { method: 'POST', path: '/contacts/import', permission: 'whatsapp.contacts.import' },
  { method: 'POST', path: '/contacts/bulk', permission: 'whatsapp.contacts.edit' },
  { method: 'GET', path: '/contacts', permission: 'whatsapp.contacts.view' },
  { method: 'GET', path: '/contacts/:id/export', permission: 'whatsapp.contacts.export' },
  { method: 'GET', path: '/contacts/:id/platform-context', permission: 'whatsapp.contacts.view' },
  { method: 'GET', path: '/contacts/:id', permission: 'whatsapp.contacts.view' },
  { method: 'PATCH', path: '/contacts/:id', permission: 'whatsapp.contacts.edit' },
  // Hard erasure is a DPDP operation, not an ordinary delete.
  { method: 'DELETE', path: '/contacts/:id', permission: 'whatsapp.contacts.erase' },

  // ── Segments & suppression ──
  { method: 'GET', path: '/segments', permission: 'whatsapp.segments.view' },
  { method: 'GET', path: '/segments/:id', permission: 'whatsapp.segments.view' },
  { method: '*', path: '/segments', permission: 'whatsapp.segments.edit' },
  { method: '*', path: '/segments/:id', permission: 'whatsapp.segments.edit' },
  { method: 'GET', path: '/suppressions', permission: 'whatsapp.suppression.view' },
  { method: '*', path: '/suppressions', permission: 'whatsapp.suppression.edit' },
  { method: '*', path: '/suppressions/:id', permission: 'whatsapp.suppression.edit' },

  // ── Campaigns ──
  { method: 'GET', path: '/campaign-templates', permission: 'whatsapp.campaigns.view' },
  { method: 'POST', path: '/campaign-templates/:id/use', permission: 'whatsapp.campaigns.create' },
  { method: 'DELETE', path: '/campaign-templates/:id', permission: 'whatsapp.campaigns.delete' },
  { method: 'GET', path: '/campaigns', permission: 'whatsapp.campaigns.view' },
  { method: 'POST', path: '/campaigns', permission: 'whatsapp.campaigns.create' },
  {
    method: 'GET',
    path: '/campaigns/:id/recipients/export',
    permission: 'whatsapp.campaigns.analytics',
  },
  { method: 'GET', path: '/campaigns/:id/conversions', permission: 'whatsapp.campaigns.analytics' },
  { method: 'GET', path: '/campaigns/:id/*', permission: 'whatsapp.campaigns.view' },
  { method: 'GET', path: '/campaigns/:id', permission: 'whatsapp.campaigns.view' },
  { method: 'POST', path: '/campaigns/:id/send', permission: 'whatsapp.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/launch', permission: 'whatsapp.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/test-send', permission: 'whatsapp.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/retry-failed', permission: 'whatsapp.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/pause', permission: 'whatsapp.campaigns.control' },
  { method: 'POST', path: '/campaigns/:id/resume', permission: 'whatsapp.campaigns.control' },
  { method: 'POST', path: '/campaigns/:id/cancel', permission: 'whatsapp.campaigns.control' },
  { method: 'PATCH', path: '/campaigns/:id', permission: 'whatsapp.campaigns.edit' },
  { method: 'DELETE', path: '/campaigns/:id', permission: 'whatsapp.campaigns.delete' },
  { method: '*', path: '/campaigns/:id/*', permission: 'whatsapp.campaigns.edit' },

  // ── Inbox ──
  { method: 'GET', path: '/unread-total', permission: 'whatsapp.inbox.view' },
  { method: 'GET', path: '/media/:id', permission: 'whatsapp.inbox.view' },
  { method: 'GET', path: '/conversations', permission: 'whatsapp.inbox.view' },
  { method: 'POST', path: '/conversations', permission: 'whatsapp.inbox.reply' },
  { method: 'POST', path: '/conversations/bulk', permission: 'whatsapp.inbox.status' },
  { method: 'GET', path: '/conversations/:id/transcript', permission: 'whatsapp.inbox.view' },

  // ── Conversation sub-resources: MUST precede the `/conversations/:id/*`
  // catch-all below. First-match-wins, and that catch-all is a GET rule, so
  // reading notes and the scheduled-message queue was resolving to
  // `whatsapp.inbox.view` — an admin granted only inbox-view could read
  // every internal note and every queued send, both of which the registry
  // sells as separate grants.
  { method: '*', path: '/conversations/:id/notes', permission: 'whatsapp.inbox.notes' },
  { method: '*', path: '/conversations/:id/notes/:noteId', permission: 'whatsapp.inbox.notes' },
  {
    method: '*',
    path: '/conversations/:id/scheduled',
    permission: 'whatsapp.automation.scheduled',
  },
  {
    method: '*',
    path: '/conversations/:id/scheduled/:msgId',
    permission: 'whatsapp.automation.scheduled',
  },

  { method: 'GET', path: '/conversations/:id/*', permission: 'whatsapp.inbox.view' },
  { method: 'GET', path: '/conversations/:id', permission: 'whatsapp.inbox.view' },
  { method: 'POST', path: '/conversations/:id/assign', permission: 'whatsapp.inbox.assign' },
  { method: 'POST', path: '/conversations/:id/media', permission: 'whatsapp.inbox.media' },
  { method: 'POST', path: '/conversations/:id/csat', permission: 'whatsapp.inbox.csat' },
  { method: 'POST', path: '/conversations/:id/read', permission: 'whatsapp.inbox.status' },
  { method: 'POST', path: '/conversations/:id/status', permission: 'whatsapp.inbox.status' },
  { method: 'POST', path: '/conversations/:id/archive', permission: 'whatsapp.inbox.status' },
  { method: 'POST', path: '/conversations/:id/snooze', permission: 'whatsapp.inbox.status' },
  { method: 'POST', path: '/conversations/:id/clear', permission: 'whatsapp.inbox.status' },
  { method: 'PUT', path: '/conversations/:id/labels', permission: 'whatsapp.inbox.status' },
  // Everything else on a conversation is an outbound message of some shape
  // (text, template, media, reaction, location, interactive).
  { method: '*', path: '/conversations/:id/*', permission: 'whatsapp.inbox.reply' },
];

/** Narrowest sensible default: reading the inbox. */
export const WHATSAPP_FALLBACK = 'whatsapp.inbox.view';

// ═══════════════════════════════════════════════════════════════════════
// Email — mounted at /api/v1/super-admin/email
// ═══════════════════════════════════════════════════════════════════════

export const EMAIL_PERMISSION_RULES: PermissionRule[] = [
  // ── Webmail (entirely separate from the campaign system) ──
  { method: 'GET', path: '/mailbox/accounts', permission: 'email.mailbox.view' },
  { method: 'POST', path: '/mailbox/accounts', permission: 'email.mailbox.accounts' },
  { method: 'POST', path: '/mailbox/accounts/test', permission: 'email.mailbox.accounts' },
  { method: 'PUT', path: '/mailbox/accounts/:id', permission: 'email.mailbox.accounts' },
  { method: 'DELETE', path: '/mailbox/accounts/:id', permission: 'email.mailbox.accounts' },
  { method: 'POST', path: '/mailbox/accounts/:id/test', permission: 'email.mailbox.accounts' },
  { method: 'POST', path: '/mailbox/accounts/:id/send', permission: 'email.mailbox.send' },
  { method: 'POST', path: '/mailbox/accounts/:id/draft', permission: 'email.mailbox.send' },
  { method: 'POST', path: '/mailbox/accounts/:id/attachments', permission: 'email.mailbox.send' },
  {
    method: 'POST',
    path: '/mailbox/accounts/:id/forward-attachments',
    permission: 'email.mailbox.send',
  },
  { method: 'GET', path: '/mailbox/accounts/:id/*', permission: 'email.mailbox.view' },
  { method: 'GET', path: '/mailbox/accounts/:id', permission: 'email.mailbox.view' },
  // Folder/flag/move/copy/delete mutations on a mailbox.
  { method: '*', path: '/mailbox/accounts/:id/*', permission: 'email.mailbox.send' },

  // ── Analytics ──
  { method: 'GET', path: '/analytics/export', permission: 'email.analytics.export' },
  { method: 'GET', path: '/analytics/*', permission: 'email.analytics.view' },

  // ── Settings ──
  { method: 'GET', path: '/settings', permission: 'email.settings.view' },
  { method: 'PUT', path: '/settings', permission: 'email.settings.edit' },

  // ── Senders ──
  { method: 'GET', path: '/senders', permission: 'email.senders.view' },
  { method: 'POST', path: '/senders/:id/verify', permission: 'email.senders.verify' },
  { method: 'POST', path: '/senders', permission: 'email.senders.create' },
  { method: 'PUT', path: '/senders/:id', permission: 'email.senders.edit' },
  { method: 'DELETE', path: '/senders/:id', permission: 'email.senders.delete' },

  // ── Templates ──
  { method: 'POST', path: '/templates/preview', permission: 'email.templates.preview' },
  { method: 'POST', path: '/templates/lint', permission: 'email.templates.preview' },
  { method: 'POST', path: '/templates/plain-text', permission: 'email.templates.preview' },
  { method: 'POST', path: '/templates/test', permission: 'email.templates.test_send' },
  { method: 'POST', path: '/templates/bulk-delete', permission: 'email.templates.delete' },
  { method: 'POST', path: '/templates/bulk-duplicate', permission: 'email.templates.create' },
  { method: 'POST', path: '/templates/bulk-status', permission: 'email.templates.edit' },
  { method: 'GET', path: '/templates', permission: 'email.templates.view' },
  { method: 'POST', path: '/templates', permission: 'email.templates.create' },
  { method: 'GET', path: '/templates/:id/versions', permission: 'email.templates.versions' },
  { method: 'POST', path: '/templates/:id/restore', permission: 'email.templates.versions' },
  { method: 'POST', path: '/templates/:id/duplicate', permission: 'email.templates.create' },
  { method: 'GET', path: '/templates/:id', permission: 'email.templates.view' },
  { method: 'PUT', path: '/templates/:id', permission: 'email.templates.edit' },
  { method: 'DELETE', path: '/templates/:id', permission: 'email.templates.delete' },

  // ── Snippets & canned replies ──
  { method: 'GET', path: '/snippets', permission: 'email.templates.view' },
  { method: '*', path: '/snippets', permission: 'email.templates.edit' },
  { method: '*', path: '/snippets/:id', permission: 'email.templates.edit' },
  { method: 'GET', path: '/canned-replies', permission: 'email.automation.canned_replies' },
  { method: '*', path: '/canned-replies', permission: 'email.automation.canned_replies' },
  { method: '*', path: '/canned-replies/:id', permission: 'email.automation.canned_replies' },

  // ── Automation ──
  { method: '*', path: '/rules', permission: 'email.automation.rules' },
  { method: '*', path: '/rules/:id', permission: 'email.automation.rules' },
  { method: '*', path: '/scheduled', permission: 'email.automation.scheduled' },
  { method: '*', path: '/scheduled/:id', permission: 'email.automation.scheduled' },

  // ── Campaigns ──
  { method: 'GET', path: '/campaign-templates', permission: 'email.campaigns.view' },
  { method: 'POST', path: '/campaign-templates/:id/use', permission: 'email.campaigns.create' },
  { method: 'DELETE', path: '/campaign-templates/:id', permission: 'email.campaigns.delete' },
  { method: 'POST', path: '/campaigns/bulk', permission: 'email.campaigns.edit' },
  { method: 'GET', path: '/campaigns', permission: 'email.campaigns.view' },
  { method: 'POST', path: '/campaigns', permission: 'email.campaigns.create' },
  {
    method: 'GET',
    path: '/campaigns/:id/recipients/export',
    permission: 'email.campaigns.recipients',
  },
  { method: 'GET', path: '/campaigns/:id/recipients', permission: 'email.campaigns.recipients' },
  { method: 'GET', path: '/campaigns/:id/analytics', permission: 'email.campaigns.analytics' },
  { method: 'GET', path: '/campaigns/:id/*', permission: 'email.campaigns.view' },
  { method: 'GET', path: '/campaigns/:id', permission: 'email.campaigns.view' },
  { method: 'POST', path: '/campaigns/:id/launch', permission: 'email.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/test-send', permission: 'email.campaigns.test_send' },
  { method: 'POST', path: '/campaigns/:id/retry-failed', permission: 'email.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/materialize', permission: 'email.campaigns.send' },
  { method: 'POST', path: '/campaigns/:id/pause', permission: 'email.campaigns.control' },
  { method: 'POST', path: '/campaigns/:id/resume', permission: 'email.campaigns.control' },
  { method: 'POST', path: '/campaigns/:id/cancel', permission: 'email.campaigns.control' },
  {
    method: 'POST',
    path: '/campaigns/:id/stop-recurrence',
    permission: 'email.campaigns.control',
  },
  { method: 'POST', path: '/campaigns/:id/archive', permission: 'email.campaigns.archive' },
  { method: 'POST', path: '/campaigns/:id/duplicate', permission: 'email.campaigns.create' },
  { method: 'PUT', path: '/campaigns/:id', permission: 'email.campaigns.edit' },
  { method: 'DELETE', path: '/campaigns/:id', permission: 'email.campaigns.delete' },
  { method: '*', path: '/campaigns/:id/*', permission: 'email.campaigns.edit' },

  // ── Contacts ──
  { method: 'GET', path: '/contacts/export', permission: 'email.contacts.export' },
  { method: 'POST', path: '/contacts/import', permission: 'email.contacts.import' },
  { method: 'POST', path: '/contacts/import-rows', permission: 'email.contacts.import' },
  { method: 'POST', path: '/contacts/bulk-delete', permission: 'email.contacts.delete' },
  { method: 'POST', path: '/contacts/bulk-tag', permission: 'email.contacts.bulk' },
  { method: 'POST', path: '/contacts/bulk-update', permission: 'email.contacts.bulk' },
  { method: 'GET', path: '/contacts', permission: 'email.contacts.view' },
  { method: 'POST', path: '/contacts', permission: 'email.contacts.create' },
  { method: 'GET', path: '/contacts/:id/data-export', permission: 'email.contacts.export' },
  { method: 'GET', path: '/contacts/:id/timeline', permission: 'email.contacts.view' },
  { method: 'GET', path: '/contacts/:id', permission: 'email.contacts.view' },
  { method: 'POST', path: '/contacts/:id/block', permission: 'email.contacts.edit' },
  { method: 'POST', path: '/contacts/:id/erase', permission: 'email.contacts.delete' },
  { method: 'PUT', path: '/contacts/:id', permission: 'email.contacts.edit' },
  { method: 'DELETE', path: '/contacts/:id', permission: 'email.contacts.delete' },

  // ── Sets ──
  { method: 'POST', path: '/sets/bulk-delete', permission: 'email.sets.delete' },
  { method: 'GET', path: '/sets', permission: 'email.sets.view' },
  { method: 'POST', path: '/sets', permission: 'email.sets.create' },
  { method: 'GET', path: '/sets/:id/export', permission: 'email.sets.view' },
  { method: 'GET', path: '/sets/:id/members', permission: 'email.sets.view' },
  { method: 'GET', path: '/sets/:id', permission: 'email.sets.view' },
  { method: 'PUT', path: '/sets/:id', permission: 'email.sets.edit' },
  { method: 'DELETE', path: '/sets/:id', permission: 'email.sets.delete' },
  { method: '*', path: '/sets/:id/*', permission: 'email.sets.edit' },

  // ── Segments ──
  { method: 'GET', path: '/segments', permission: 'email.segments.view' },
  { method: 'GET', path: '/segments/:id/size', permission: 'email.segments.view' },
  { method: 'GET', path: '/segments/:id', permission: 'email.segments.view' },
  { method: '*', path: '/segments', permission: 'email.segments.edit' },
  { method: '*', path: '/segments/:id', permission: 'email.segments.edit' },

  // ── Suppression & unsubscribes ──
  { method: 'GET', path: '/suppressions/export', permission: 'email.suppression.view' },
  { method: 'GET', path: '/suppressions', permission: 'email.suppression.view' },
  { method: '*', path: '/suppressions', permission: 'email.suppression.edit' },
  { method: '*', path: '/suppressions/*', permission: 'email.suppression.edit' },
  { method: 'GET', path: '/unsubscribes/export', permission: 'email.unsubscribes.view' },
  { method: 'GET', path: '/unsubscribes', permission: 'email.unsubscribes.view' },
  { method: '*', path: '/unsubscribes/*', permission: 'email.unsubscribes.edit' },

  // ── Threads (reply inbox) ──
  { method: 'GET', path: '/threads/unread-count', permission: 'email.inbox.view' },
  { method: 'GET', path: '/threads', permission: 'email.inbox.view' },
  { method: 'POST', path: '/threads/bulk', permission: 'email.inbox.status' },
  { method: 'GET', path: '/threads/:id', permission: 'email.inbox.view' },
  { method: 'POST', path: '/threads/:id/reply', permission: 'email.inbox.reply' },
  { method: 'POST', path: '/threads/:id/schedule', permission: 'email.inbox.reply' },
  { method: 'POST', path: '/threads/:id/assign', permission: 'email.inbox.assign' },
  { method: 'POST', path: '/threads/:id/notes', permission: 'email.inbox.notes' },
  { method: '*', path: '/threads/:id/*', permission: 'email.inbox.status' },

  // ── Platform users, bulk jobs, assets ──
  { method: 'GET', path: '/platform-users/export', permission: 'email.contacts.export' },
  { method: 'POST', path: '/platform-users/sync', permission: 'email.contacts.platform_users' },
  { method: 'GET', path: '/platform-users/*', permission: 'email.contacts.platform_users' },
  { method: 'GET', path: '/platform-users', permission: 'email.contacts.platform_users' },
  { method: 'GET', path: '/bulk-jobs', permission: 'email.bulk_jobs.view' },
  { method: 'GET', path: '/bulk-jobs/:id', permission: 'email.bulk_jobs.view' },
  { method: 'POST', path: '/undo/:id', permission: 'email.bulk_jobs.undo' },
  // Outbound attachment/asset staging — used by both the campaign composer
  // and the reply inbox, so the lower of the two bars applies.
  { method: 'POST', path: '/attachments', permission: 'email.inbox.attachments' },
  { method: 'POST', path: '/assets', permission: 'email.templates.edit' },
];

export const EMAIL_FALLBACK = 'email.inbox.view';

// ═══════════════════════════════════════════════════════════════════════
// Billing — mounted at /api/v1/super-admin/billing
// ═══════════════════════════════════════════════════════════════════════

export const BILLING_PERMISSION_RULES: PermissionRule[] = [
  { method: 'GET', path: '/dashboard', permission: 'billing.dashboard' },
  // Unmapped, so it fell through to the fallback (billing.dashboard) while the
  // page gated on billing.coupons.analytics — granting the advertised key did
  // not open the page.
  { method: 'GET', path: '/coupons/analytics', permission: 'billing.coupons.analytics' },
  { method: 'GET', path: '/audit', permission: 'billing.audit' },
  { method: 'GET', path: '/ledger', permission: 'billing.ledger.view' },

  // ── Orders ──
  { method: 'GET', path: '/orders', permission: 'billing.orders.view' },
  { method: 'GET', path: '/orders/:id', permission: 'billing.orders.view' },
  { method: 'POST', path: '/orders/:id/force-cancel', permission: 'billing.orders.cancel' },
  // Marking an unpaid order paid mints entitlements without money moving —
  // it is a credit grant wearing an order's clothes.
  { method: 'POST', path: '/orders/:id/mark-paid', permission: 'billing.entitlements.grant' },

  // ── Transactions & payments ──
  { method: 'GET', path: '/transactions', permission: 'billing.transactions.view' },
  { method: 'GET', path: '/transactions/:id', permission: 'billing.transactions.view' },
  { method: 'POST', path: '/payments/:id/retry-capture', permission: 'billing.refunds.process' },

  // ── Refunds ──
  { method: 'GET', path: '/refund-requests', permission: 'billing.refunds.view' },
  { method: 'GET', path: '/refund-requests/:id', permission: 'billing.refunds.view' },
  { method: 'POST', path: '/refund-requests/:id/review', permission: 'billing.refunds.approve' },
  { method: 'GET', path: '/refunds', permission: 'billing.refunds.view' },
  { method: 'GET', path: '/refunds/:id', permission: 'billing.refunds.view' },
  { method: 'POST', path: '/refunds', permission: 'billing.refunds.process' },

  // ── Settlements & disputes ──
  { method: 'GET', path: '/settlements', permission: 'billing.settlements.view' },
  { method: 'GET', path: '/settlements/:id', permission: 'billing.settlements.view' },
  { method: 'POST', path: '/settlements/sync', permission: 'billing.settlements.view' },
  { method: 'GET', path: '/disputes', permission: 'billing.disputes.view' },
  { method: 'GET', path: '/disputes/:id', permission: 'billing.disputes.view' },

  // ── Subscriptions ──
  { method: 'GET', path: '/subscriptions', permission: 'billing.subscriptions.view' },
  { method: 'GET', path: '/subscriptions/:id', permission: 'billing.subscriptions.view' },

  // ── Fraud ──
  // The Billing Settings PAGE is built entirely from the fraud ruleset, so
  // these two carry the settings keys rather than the fraud ones — otherwise
  // billing.settings.* would be a registry node with zero enforcement and the
  // page would 403 for anyone granted exactly what its nav item advertises.
  // (The registry's former `billing.fraud.rules` node was the same thing
  // said twice, so it is gone — these keys are the ruleset's keys.)
  { method: 'GET', path: '/fraud/rules', permission: 'billing.settings.view' },
  { method: 'PATCH', path: '/fraud/rules/:id', permission: 'billing.settings.edit' },
  { method: 'GET', path: '/fraud/flags', permission: 'billing.fraud.view' },
  { method: 'POST', path: '/fraud/flag', permission: 'billing.fraud.resolve' },
  { method: 'POST', path: '/fraud/flags/:id/review', permission: 'billing.fraud.resolve' },

  // ── Webhooks ──
  { method: 'GET', path: '/webhooks', permission: 'billing.webhooks.view' },
  { method: 'GET', path: '/webhooks/:id', permission: 'billing.webhooks.view' },
  { method: 'POST', path: '/webhooks/:id/replay', permission: 'billing.webhooks.replay' },

  // ── Per-user billing ──
  { method: 'GET', path: '/users/:userId/summary', permission: 'billing.orders.view' },
  { method: 'POST', path: '/users/:userId/grant-plan', permission: 'billing.entitlements.grant' },
];

export const BILLING_FALLBACK = 'billing.dashboard';
