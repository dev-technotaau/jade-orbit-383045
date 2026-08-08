/**
 * Canonical permission registry for the admin PBAC system.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This file is the SINGLE SOURCE OF TRUTH for what an admin can be granted.
 * Everything else — the middleware, the grant editor, the sidebar, the
 * control centre matrix — derives from this tree. Nothing may check a
 * permission key that does not resolve here (`isKnownPermission` guards the
 * write path so typos become 400s instead of silently-ungrantable strings).
 *
 * ── Key shape ──────────────────────────────────────────────────────────
 * Keys are dot-delimited paths built from each node's `segment`:
 *
 *     users.candidates.account.suspend
 *     └┬──┘ └────┬───┘ └──┬──┘ └──┬───┘
 *   domain   subject   group   action
 *
 * Depth is 2–4 levels. Leaves are actions; branches are containers.
 *
 * ── Implication ────────────────────────────────────────────────────────
 * Granting a BRANCH grants every descendant. `users` implies
 * `users.candidates.account.suspend` and everything else beneath it. This
 * is pure prefix logic (see `permission.service.ts#matches`) — there is no
 * expansion step and no stored closure, so adding a node to this tree
 * immediately widens every existing branch grant that contains it. That is
 * deliberate: a "give them Email" grant should cover Email features shipped
 * next quarter without a backfill migration.
 *
 * The inverse — granting a LEAF — grants only that leaf.
 *
 * ── DENY ───────────────────────────────────────────────────────────────
 * Grants carry an effect (ALLOW | DENY) and resolution is longest-prefix-
 * wins, DENY breaking ties. That makes the common enterprise shape
 * expressible in two rows: ALLOW `email`, DENY `email.settings`.
 *
 * ── superAdminOnly ─────────────────────────────────────────────────────
 * Nodes marked `superAdminOnly` can never be granted to an ADMIN — the API
 * rejects them and the editor renders them locked. Per the product rule,
 * admin/super-admin management and the permission system itself are
 * SUPER_ADMIN-exclusive: an admin must never be able to widen their own
 * access or mint a peer. `assertGrantable()` is the enforcement point.
 */

export type PermissionEffect = 'ALLOW' | 'DENY';

export interface PermissionNode {
  /** Path segment — NOT the full key. Full keys are composed on compile. */
  segment: string;
  label: string;
  description?: string;
  /**
   * Never grantable to an ADMIN. Marks the self-referential surfaces
   * (admin management, the permission system, break-glass infra).
   */
  superAdminOnly?: true;
  /**
   * Marks a permission whose grant is high-blast-radius. Purely advisory —
   * the editor renders a warning and the audit trail flags it. Does not
   * change enforcement.
   */
  sensitive?: true;
  children?: PermissionNode[];
}

/** A compiled, flattened view of one node. */
export interface CompiledPermission {
  key: string;
  segment: string;
  label: string;
  description?: string;
  /** Dot-path of the parent, or null for a domain root. */
  parent: string | null;
  /** 1 for domain roots. */
  depth: number;
  isLeaf: boolean;
  /** True when this node OR any ancestor is superAdminOnly. */
  superAdminOnly: boolean;
  sensitive: boolean;
  /** Full keys of every descendant (not including self). */
  descendants: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// Reusable action clusters
//
// Most subjects expose the same verbs. These builders keep the tree honest
// (the same verb means the same thing everywhere) and keep this file
// readable — a hand-written 900-line literal drifts within a month.
// ═══════════════════════════════════════════════════════════════════════

const view = (what: string): PermissionNode => ({
  segment: 'view',
  label: 'View',
  description: `Read ${what}.`,
});
const create = (what: string): PermissionNode => ({
  segment: 'create',
  label: 'Create',
  description: `Create ${what}.`,
});
const edit = (what: string): PermissionNode => ({
  segment: 'edit',
  label: 'Edit',
  description: `Modify ${what}.`,
});
const remove = (what: string, sensitive?: true): PermissionNode => ({
  segment: 'delete',
  label: 'Delete',
  description: `Permanently delete ${what}.`,
  ...(sensitive ? { sensitive } : {}),
});
const exportData = (what: string): PermissionNode => ({
  segment: 'export',
  label: 'Export',
  description: `Download ${what} as CSV/XLSX.`,
  sensitive: true,
});

/** view + create + edit + delete, in that order. */
const crud = (what: string, deleteSensitive?: true): PermissionNode[] => [
  view(what),
  create(what),
  edit(what),
  remove(what, deleteSensitive),
];

/**
 * The account-lifecycle cluster shared by candidates and employers. Split
 * from profile editing on purpose: a support agent usually needs
 * `account.view` + `profile.edit` but must NOT be able to delete accounts.
 */
const accountGroup = (who: string): PermissionNode => ({
  segment: 'account',
  label: 'Account',
  description: `Account lifecycle for ${who}.`,
  children: [
    view(`${who} accounts, including contact details and status`),
    {
      segment: 'suspend',
      label: 'Suspend',
      description: `Suspend a ${who} account, blocking sign-in.`,
    },
    {
      segment: 'activate',
      label: 'Activate',
      description: `Lift a suspension and restore ${who} access.`,
    },
    {
      segment: 'deactivate',
      label: 'Deactivate',
      description: `Soft-disable a ${who} account.`,
    },
    {
      segment: 'delete',
      label: 'Delete',
      description: `Permanently erase a ${who} account and its data.`,
      sensitive: true,
    },
    // No `export` node: per-subject exports run through
    // `users.bulk.export` (the bulk endpoint) and `reports.exports.users`.
  ],
});

/**
 * Credential operations. Every one of these can be used to take over an
 * account, so the whole group is sensitive and is deliberately NOT bundled
 * into `account` — a help-desk role gets `account.view` without ever being
 * able to rotate someone's email out from under them.
 */
const credentialsGroup = (who: string): PermissionNode => ({
  segment: 'credentials',
  label: 'Credentials',
  description: `Managed credential changes for ${who} (each step is OTP-verified).`,
  sensitive: true,
  children: [
    {
      segment: 'password',
      label: 'Reset password',
      description: 'Send a reset OTP and set a new password.',
      sensitive: true,
    },
    {
      segment: 'email',
      label: 'Change email',
      description: 'Initiate and confirm an email change.',
      sensitive: true,
    },
    {
      segment: 'mobile',
      label: 'Change mobile',
      description: 'Initiate, confirm or remove the mobile number.',
    },
    {
      segment: 'whatsapp',
      label: 'Change WhatsApp',
      description: 'Verify, change or remove the WhatsApp number.',
    },
    // No `mfa` node: the MFA endpoints (`/users/:id/mfa/*`) are
    // `superAdminOnly` and exist solely to manage ADMIN accounts, which
    // `denyAdminTargets` keeps out of every delegable route anyway.
  ],
});

const sessionsGroup = (who: string): PermissionNode => ({
  segment: 'sessions',
  label: 'Sessions',
  description: `Active device sessions for ${who}.`,
  children: [
    view('active sessions, devices and sign-in locations'),
    {
      segment: 'revoke',
      label: 'Revoke',
      description: 'Force sign-out of one or all sessions.',
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════
// The tree
// ═══════════════════════════════════════════════════════════════════════

export const PERMISSION_TREE: PermissionNode[] = [
  // ── Users ────────────────────────────────────────────────────────────
  {
    segment: 'users',
    label: 'Users',
    description: 'Candidate and employer account administration.',
    children: [
      {
        segment: 'candidates',
        label: 'Candidates',
        description: 'Job-seeker accounts.',
        children: [
          accountGroup('candidate'),
          credentialsGroup('candidates'),
          sessionsGroup('candidates'),
          {
            segment: 'profile',
            label: 'Profile',
            description: 'The candidate profile record itself.',
            children: [
              view('profile, resume metadata, skills and experience'),
              edit('profile fields on the candidate’s behalf'),
              {
                segment: 'avatar',
                label: 'Manage avatar',
                description: 'Upload or remove the profile photo.',
              },
              {
                segment: 'resume',
                label: 'Access resume',
                description: 'Download the candidate’s resume file.',
                sensitive: true,
              },
              {
                segment: 'contact',
                label: 'View contact fields',
                description:
                  'Reveal the candidate’s private phone and email — the data an employer must spend a CV unlock to see.',
                sensitive: true,
              },
            ],
          },
          {
            segment: 'activity',
            label: 'Activity',
            description: 'What the candidate has done on the platform.',
            children: [
              {
                segment: 'applications',
                label: 'View applications',
                description: 'See every job this candidate applied to.',
              },
              {
                segment: 'verifications',
                label: 'View verifications',
                description: 'See submitted verification requests.',
              },
              {
                segment: 'audit',
                label: 'View audit trail',
                description: 'See the account’s audit-log entries.',
              },
            ],
          },
        ],
      },
      {
        segment: 'employers',
        label: 'Employers',
        description: 'Hiring-side accounts.',
        children: [
          accountGroup('employer'),
          credentialsGroup('employers'),
          sessionsGroup('employers'),
          {
            segment: 'company',
            label: 'Company profile',
            description: 'The company record attached to the employer.',
            children: [
              view('company profile, branding and contact details'),
              edit('company profile fields'),
              {
                segment: 'logo',
                label: 'Manage branding',
                description: 'Upload or remove logo and cover image.',
              },
              {
                segment: 'contact',
                label: 'View contact fields',
                description:
                  'Reveal the private employer contact fields (email, phone) that are stripped from public payloads.',
                sensitive: true,
              },
            ],
          },
          {
            segment: 'activity',
            label: 'Activity',
            description: 'What the employer has done on the platform.',
            children: [
              {
                segment: 'jobs',
                label: 'View posted jobs',
                description: 'See every job this employer posted.',
              },
              {
                segment: 'verifications',
                label: 'View verifications',
                description: 'See submitted verification requests.',
              },
              {
                segment: 'audit',
                label: 'View audit trail',
                description: 'See the account’s audit-log entries.',
              },
            ],
          },
        ],
      },
      {
        segment: 'create',
        label: 'Create user',
        description: 'Provision a new candidate or employer account.',
        sensitive: true,
      },
      {
        segment: 'bulk',
        label: 'Bulk operations',
        description: 'Actions that fan out across many accounts at once.',
        sensitive: true,
        children: [
          {
            segment: 'export',
            label: 'Bulk export',
            description: 'Export a filtered user set to file.',
            sensitive: true,
          },
          {
            segment: 'notify',
            label: 'Bulk notify',
            description: 'Send a notification to many users at once.',
            sensitive: true,
          },
          { segment: 'suspend', label: 'Bulk suspend', description: 'Suspend many accounts.' },
          { segment: 'activate', label: 'Bulk activate', description: 'Reactivate many accounts.' },
        ],
      },
      {
        // Excluded from every admin grant by product rule: an admin must not
        // be able to mint, edit or delete a peer or a super-admin.
        segment: 'admins',
        label: 'Admin accounts',
        description: 'Create, edit and remove admin accounts.',
        superAdminOnly: true,
        children: [
          view('admin accounts'),
          create('admin accounts'),
          edit('admin accounts'),
          remove('admin accounts', true),
        ],
      },
    ],
  },

  // ── Jobs ─────────────────────────────────────────────────────────────
  {
    segment: 'jobs',
    label: 'Jobs',
    description: 'Job postings across the platform.',
    children: [
      {
        segment: 'listing',
        label: 'Listings',
        description: 'Browsing and reading job posts.',
        // No `export` node: job exports run through `reports.exports.jobs`
        // (report.routes.ts). A second key here would be inert.
        children: [view('all job posts, including drafts and expired')],
      },
      {
        segment: 'moderation',
        label: 'Moderation',
        description: 'Approving, rejecting and policing job content.',
        children: [
          {
            segment: 'approve',
            label: 'Approve',
            description: 'Publish a pending job post.',
          },
          {
            segment: 'reject',
            label: 'Reject',
            description: 'Reject a job post with a reason.',
          },
          { segment: 'flag', label: 'Flag / unflag', description: 'Mark a job for review.' },
          {
            segment: 'delete',
            label: 'Delete',
            description: 'Remove a job post from the platform.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'authoring',
        label: 'Post on behalf',
        description: 'Create and edit jobs for a company, bypassing plan gating.',
        sensitive: true,
        children: [create('a job on behalf of any company'), edit('any job regardless of owner')],
      },
      {
        segment: 'applications',
        label: 'Applications',
        description: 'Candidate applications to job posts.',
        children: [
          view('applications and their pipeline status'),
          {
            segment: 'stats',
            label: 'View statistics',
            description: 'Aggregate application funnel metrics.',
          },
          // No `export` node — application extracts run through `reports.*`.
        ],
      },
    ],
  },

  // ── Verifications ────────────────────────────────────────────────────
  {
    segment: 'verifications',
    label: 'Verifications',
    description: 'Identity, document and employment verification review.',
    children: [
      {
        segment: 'candidate',
        label: 'Candidate verifications',
        children: [
          view('candidate verification requests'),
          { segment: 'approve', label: 'Approve', description: 'Mark a request verified.' },
          { segment: 'reject', label: 'Reject', description: 'Reject with a reason.' },
        ],
      },
      {
        segment: 'employer',
        label: 'Employer verifications',
        children: [
          view('employer/company verification requests'),
          { segment: 'approve', label: 'Approve', description: 'Mark a request verified.' },
          { segment: 'reject', label: 'Reject', description: 'Reject with a reason.' },
        ],
      },
      {
        segment: 'documents',
        label: 'Documents',
        description: 'The uploaded evidence itself.',
        sensitive: true,
        // No separate `download` node: a document IS its storage URL, so
        // handing over the URL and permitting the download are the same act.
        // Splitting them would have promised a distinction the API cannot
        // make. `view` is what the payload redaction checks.
        children: [
          {
            segment: 'view',
            label: 'View documents',
            description: 'Open and download submitted identity and employment documents.',
            sensitive: true,
          },
        ],
      },
    ],
  },

  // ── Moderation ───────────────────────────────────────────────────────
  {
    segment: 'moderation',
    label: 'Moderation',
    description: 'Content policy enforcement.',
    children: [
      {
        segment: 'keywords',
        label: 'Keyword filters',
        description: 'The banned-term list applied to user content.',
        children: [
          view('the moderation keyword list'),
          { segment: 'add', label: 'Add keyword', description: 'Add a term to the filter.' },
          {
            segment: 'remove',
            label: 'Remove keyword',
            description: 'Remove a term from the filter.',
          },
        ],
      },
      // No `queue` node: there is no moderation-queue endpoint. Flagged
      // jobs are actioned through `jobs.moderation.*` and flagged reviews
      // through `reviews.*`; a standalone queue key enforced nothing.
    ],
  },

  // ── Reviews ──────────────────────────────────────────────────────────
  {
    segment: 'reviews',
    label: 'Company reviews',
    description: 'Employer reviews written by candidates.',
    children: [
      view('submitted company reviews'),
      { segment: 'approve', label: 'Approve', description: 'Publish a pending review.' },
      { segment: 'reject', label: 'Reject', description: 'Reject a pending review.' },
      remove('a published review', true),
      {
        segment: 'reports',
        label: 'Abuse reports',
        description: 'Reader reports against a review.',
        // Resolving a report IS moderating the review it targets, which is
        // `reviews.approve` / `.reject` / `.delete` — there is no separate
        // resolve endpoint, so no `resolve` node.
        children: [view('abuse reports filed against reviews')],
      },
      // No `aggregates` node: rating rollups are public data served by the
      // company endpoints, with no admin-only surface to gate.
    ],
  },

  // ── Help desk ────────────────────────────────────────────────────────
  {
    segment: 'support',
    label: 'Help desk',
    description: 'Support tickets and inbound contact messages.',
    children: [
      {
        segment: 'tickets',
        label: 'Support tickets',
        children: [
          view('tickets assigned to you'),
          {
            segment: 'view_all',
            label: 'View all tickets',
            description: 'See every ticket, not just your own assignments.',
          },
          { segment: 'reply', label: 'Reply', description: 'Post a reply to the requester.' },
          {
            segment: 'notes',
            label: 'Internal notes',
            description: 'Read and write notes not visible to the requester.',
          },
          { segment: 'assign', label: 'Assign', description: 'Route a ticket to an agent.' },
          {
            segment: 'status',
            label: 'Change status',
            description: 'Move a ticket through its lifecycle.',
          },
          // No `priority` node, for the same reason as `delete` below: the
          // ticket API exposes assign, status, reply and close — priority is
          // set at creation and never changed through an endpoint.
          { segment: 'close', label: 'Close / reopen', description: 'Close or reopen a ticket.' },
          // NOTE: there is deliberately no `delete` here. A ticket-deletion
          // node existed but no `deleteTicket` endpoint has ever been
          // implemented, so it was an inert toggle — the Access Matrix
          // advertised a power that did nothing. Re-add it alongside the
          // endpoint, not before.
        ],
      },
      {
        segment: 'contact',
        label: 'Contact messages',
        description: 'Submissions from the public contact form.',
        // Replies to a contact message are sent from the mailbox, not
        // through an API route, so there is no `respond` node to enforce.
        children: [view('inbound contact-form messages'), remove('a contact message')],
      },
      {
        segment: 'analytics',
        label: 'Support analytics',
        description: 'Ticket volume, SLA and agent performance.',
      },
    ],
  },

  // ── WhatsApp ─────────────────────────────────────────────────────────
  {
    segment: 'whatsapp',
    label: 'WhatsApp',
    description: 'The WhatsApp Business messaging system.',
    children: [
      {
        segment: 'inbox',
        label: 'Inbox',
        description: 'Live conversations with contacts.',
        children: [
          view('conversations and message history'),
          { segment: 'reply', label: 'Reply', description: 'Send a message in a conversation.' },
          {
            segment: 'media',
            label: 'Send media',
            description: 'Attach images, documents and audio to a reply.',
          },
          { segment: 'assign', label: 'Assign', description: 'Assign a conversation to an agent.' },
          {
            segment: 'notes',
            label: 'Conversation notes',
            description: 'Read and write internal notes on a conversation.',
          },
          {
            segment: 'status',
            label: 'Change status',
            description: 'Open, close or mark a conversation read.',
          },
          {
            segment: 'csat',
            label: 'CSAT',
            description: 'Trigger and read satisfaction surveys.',
          },
        ],
      },
      {
        segment: 'contacts',
        label: 'Contacts',
        children: [
          // `view` + `edit` only. Contacts arrive by import or inbound
          // message — there is no create route; blocking is a status set
          // through the same PATCH as any other edit; and deletion is the
          // DPDP `erase` below, which is deliberately its own key.
          view('the WhatsApp contact list'),
          edit('contact details, tags and status'),
          {
            segment: 'import',
            label: 'Import',
            description: 'Bulk-import contacts from CSV/XLSX/vCard.',
          },
          exportData('the contact list'),
          {
            segment: 'platform_users',
            label: 'Platform users',
            description: 'Browse and sync platform accounts into contacts.',
          },
          {
            segment: 'erase',
            label: 'Erase (DPDP)',
            description: 'Hard-erase a contact and its messages for a data-deletion request.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'templates',
        label: 'Templates',
        children: [
          view('message templates and their approval status'),
          create('a message template for Meta approval'),
          remove('a message template'),
          {
            segment: 'sync',
            label: 'Sync with Meta',
            description: 'Pull template status from Meta.',
          },
          {
            segment: 'analytics',
            label: 'Template analytics',
            description: 'Per-template delivery and read metrics.',
          },
        ],
      },
      {
        segment: 'campaigns',
        label: 'Campaigns',
        children: [
          ...crud('campaigns', true),
          {
            segment: 'send',
            label: 'Send',
            description: 'Launch a campaign to its audience.',
            sensitive: true,
          },
          {
            segment: 'control',
            label: 'Pause / resume / cancel',
            description: 'Control a running campaign.',
          },
          {
            segment: 'analytics',
            label: 'Campaign analytics',
            description: 'Delivery, read and conversion metrics.',
          },
        ],
      },
      {
        segment: 'automation',
        label: 'Automation',
        description: 'Rules that reply without a human.',
        children: [
          {
            segment: 'keyword_rules',
            label: 'Keyword rules',
            description: 'Manage auto-reply keyword triggers.',
          },
          {
            segment: 'canned_replies',
            label: 'Canned replies',
            description: 'Manage saved reply snippets.',
          },
          { segment: 'faqs', label: 'FAQs', description: 'Manage the auto-answer FAQ set.' },
          {
            segment: 'scheduled',
            label: 'Scheduled messages',
            description: 'Manage queued one-off sends.',
          },
        ],
      },
      {
        segment: 'segments',
        label: 'Segments',
        description: 'Saved audience definitions.',
        children: [view('saved segments'), edit('segment definitions')],
      },
      {
        segment: 'suppression',
        label: 'Suppression list',
        children: [view('suppressed numbers'), edit('the suppression list')],
      },
      {
        segment: 'analytics',
        label: 'Analytics',
        // No `export` node — unlike the email side there is no WhatsApp
        // analytics export route.
        children: [
          view('WhatsApp analytics dashboards'),
          {
            segment: 'record',
            label: 'Record conversions',
            description: 'Log a campaign conversion event into the funnel dataset.',
          },
        ],
      },
      {
        segment: 'channels',
        label: 'Channels',
        description: 'The connected WhatsApp Business numbers.',
        children: [
          view('channel configuration and health'),
          { segment: 'sync', label: 'Sync', description: 'Refresh channel state from Meta.' },
        ],
      },
      {
        segment: 'settings',
        label: 'Settings',
        description: 'Business hours, auto-reply behaviour and channel defaults.',
        sensitive: true,
        children: [view('WhatsApp settings'), edit('WhatsApp settings')],
      },
    ],
  },

  // ── Email ────────────────────────────────────────────────────────────
  {
    segment: 'email',
    label: 'Email',
    description: 'The campaign email system and reply inbox.',
    children: [
      {
        segment: 'inbox',
        label: 'Reply inbox',
        description: 'Inbound replies to campaigns.',
        children: [
          view('email threads and messages'),
          { segment: 'reply', label: 'Reply', description: 'Send a reply in a thread.' },
          { segment: 'assign', label: 'Assign', description: 'Assign a thread to an agent.' },
          {
            segment: 'notes',
            label: 'Thread notes',
            description: 'Read and write internal notes.',
          },
          { segment: 'status', label: 'Change status', description: 'Open, close or mark read.' },
          {
            segment: 'attachments',
            label: 'Send attachments',
            description: 'Attach files to a reply.',
          },
        ],
      },
      {
        segment: 'mailbox',
        label: 'Webmail',
        description: 'The one-on-one IMAP/SMTP client.',
        sensitive: true,
        children: [
          view('mailbox folders and messages'),
          {
            segment: 'send',
            label: 'Send mail',
            description: 'Compose and send from a connected account.',
          },
          {
            segment: 'accounts',
            label: 'Manage accounts',
            description: 'Add or remove connected IMAP/SMTP accounts.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'contacts',
        label: 'Contacts',
        children: [
          ...crud('email contacts', true),
          {
            segment: 'import',
            label: 'Import',
            description: 'Bulk-import from CSV/XLSX/JSON/vCard.',
          },
          exportData('the contact list'),
          {
            segment: 'bulk',
            label: 'Bulk actions',
            description: 'Tag, re-status, block or delete in bulk.',
            sensitive: true,
          },
          {
            segment: 'platform_users',
            label: 'Platform users',
            description: 'Browse and sync platform accounts into contacts.',
          },
        ],
      },
      {
        segment: 'sets',
        label: 'Contact sets',
        description: 'Frozen, explicitly-membered lists.',
        children: crud('contact sets'),
      },
      {
        segment: 'segments',
        label: 'Segments',
        description: 'Dynamic, filter-backed audiences.',
        children: [view('saved segments'), edit('segment definitions')],
      },
      {
        segment: 'templates',
        label: 'Templates',
        children: [
          ...crud('email templates', true),
          {
            segment: 'versions',
            label: 'Version history',
            description: 'View and restore template versions.',
          },
          {
            segment: 'preview',
            label: 'Preview',
            description: 'Render a template with sample data.',
          },
          {
            segment: 'test_send',
            label: 'Test send',
            description: 'Send a one-off test to yourself.',
          },
        ],
      },
      {
        segment: 'campaigns',
        label: 'Campaigns',
        children: [
          ...crud('campaigns', true),
          {
            segment: 'send',
            label: 'Send',
            description: 'Launch a campaign to its audience.',
            sensitive: true,
          },
          {
            segment: 'control',
            label: 'Pause / resume / cancel',
            description: 'Control a running campaign.',
          },
          {
            segment: 'test_send',
            label: 'Test send',
            description: 'Send a test copy before launching.',
          },
          {
            segment: 'analytics',
            label: 'Campaign analytics',
            description: 'Open, click and conversion metrics.',
          },
          {
            segment: 'recipients',
            label: 'Recipients',
            description: 'Inspect and export the recipient roster.',
          },
          {
            segment: 'archive',
            label: 'Archive',
            description: 'Soft-archive a finished campaign.',
          },
        ],
      },
      {
        segment: 'senders',
        label: 'Sending identities',
        description: 'From-addresses and their domain verification.',
        sensitive: true,
        children: [
          ...crud('sending identities'),
          { segment: 'verify', label: 'Verify', description: 'Run domain/DKIM verification.' },
        ],
      },
      {
        segment: 'suppression',
        label: 'Suppression list',
        children: [view('suppressed addresses'), edit('the suppression list')],
      },
      {
        segment: 'unsubscribes',
        label: 'Unsubscribes',
        children: [view('unsubscribe records'), edit('unsubscribe records')],
      },
      {
        segment: 'automation',
        label: 'Automation',
        children: [
          {
            segment: 'rules',
            label: 'Inbound rules',
            description: 'Keyword rules applied to inbound replies.',
          },
          {
            segment: 'canned_replies',
            label: 'Canned replies',
            description: 'Manage saved reply snippets.',
          },
          {
            segment: 'scheduled',
            label: 'Scheduled messages',
            description: 'Manage queued one-off sends.',
          },
          // No `autoreply` node: the welcome/away responder is configured
          // entirely inside the email settings document, so it is governed by
          // `email.settings.edit` — the only route that can change it.
        ],
      },
      {
        segment: 'analytics',
        label: 'Analytics',
        children: [view('email analytics dashboards'), exportData('analytics data')],
      },
      {
        segment: 'bulk_jobs',
        label: 'Bulk jobs',
        description: 'Offloaded bulk operations and their undo snapshots.',
        children: [
          view('bulk job progress'),
          { segment: 'undo', label: 'Undo', description: 'Roll back a completed bulk operation.' },
        ],
      },
      {
        segment: 'settings',
        label: 'Settings',
        description: 'Business hours, auto-reply and deliverability defaults.',
        sensitive: true,
        children: [view('email settings'), edit('email settings')],
      },
    ],
  },

  // ── Billing ──────────────────────────────────────────────────────────
  {
    segment: 'billing',
    label: 'Billing centre',
    description: 'Payments, plans, invoices and revenue operations.',
    sensitive: true,
    children: [
      {
        segment: 'dashboard',
        label: 'Financial dashboard',
        description: 'Revenue, MRR and collection overview.',
      },
      {
        segment: 'orders',
        label: 'Orders',
        children: [
          // No `export` or `notes` node: the orders API is list/detail plus
          // force-cancel and mark-paid. Order exports run through
          // `reports.*`, and there is no order-annotation endpoint or column.
          view('orders and their payment state'),
          { segment: 'cancel', label: 'Cancel', description: 'Cancel an unpaid or pending order.' },
        ],
      },
      {
        segment: 'transactions',
        label: 'Transactions',
        children: [view('payment transactions')],
      },
      {
        segment: 'subscriptions',
        label: 'Subscriptions',
        // View only. Pause / resume / cancel are SUBSCRIBER actions on
        // /subscriptions/me — correctly scoped to the caller's own record —
        // and there is no admin route that changes someone else's cycle.
        children: [view('subscriptions and their billing cycle')],
      },
      {
        segment: 'invoices',
        label: 'Invoices',
        children: [
          // Admin invoice routes are list, void and regenerate. PDF download
          // is the CUSTOMER's own /me/invoices/:id/pdf, and invoices are
          // emailed automatically on issue — neither is a delegable action.
          view('issued invoices'),
          {
            segment: 'regenerate',
            label: 'Regenerate',
            description: 'Rebuild or void an invoice document.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'refunds',
        label: 'Refunds',
        sensitive: true,
        children: [
          view('refunds and refund requests'),
          {
            segment: 'approve',
            label: 'Approve',
            description: 'Approve a refund request.',
            sensitive: true,
          },
          { segment: 'reject', label: 'Reject', description: 'Reject a refund request.' },
          {
            segment: 'process',
            label: 'Process',
            description: 'Execute the refund against the gateway.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'settlements',
        label: 'Settlements',
        children: [view('gateway settlements')],
      },
      {
        segment: 'disputes',
        label: 'Disputes',
        // View only: dispute evidence is submitted in the Razorpay
        // dashboard, not through this API.
        children: [view('chargebacks and disputes')],
      },
      {
        segment: 'plans',
        label: 'Plan catalogue',
        sensitive: true,
        children: [
          // No `delete`: retiring a plan is `archive` (below). Hard-deleting
          // one would orphan every order that referenced it, so no endpoint
          // does it.
          view('the plan catalogue'),
          create('a plan'),
          edit('plan pricing and features'),
          {
            segment: 'publish',
            label: 'Publish',
            description: 'Make a plan version live.',
            sensitive: true,
          },
          {
            segment: 'archive',
            label: 'Archive',
            description: 'Retire a plan from the catalogue.',
          },
        ],
      },
      {
        segment: 'coupons',
        label: 'Coupons',
        children: [
          ...crud('coupons', true),
          {
            segment: 'analytics',
            label: 'Coupon analytics',
            description: 'Redemption and revenue impact.',
          },
        ],
      },
      {
        segment: 'quotes',
        label: 'Quote requests',
        children: [
          view('enterprise quote requests'),
          { segment: 'respond', label: 'Respond', description: 'Send a custom offer.' },
          { segment: 'convert', label: 'Convert', description: 'Turn a quote into an order.' },
        ],
      },
      {
        segment: 'fraud',
        label: 'Fraud queue',
        sensitive: true,
        children: [
          view('fraud signals and flagged payments'),
          { segment: 'resolve', label: 'Resolve', description: 'Clear or uphold a fraud signal.' },
          // No `rules` node: the fraud RULESET is what the Billing Settings
          // page edits, so it is governed by `billing.settings.{view,edit}`.
          // A second key for the same two routes would have meant one of the
          // pair always enforcing nothing.
        ],
      },
      {
        segment: 'entitlements',
        label: 'Entitlements & credits',
        sensitive: true,
        children: [
          view('entitlements, credits and quota balances'),
          {
            segment: 'grant',
            label: 'Grant',
            description: 'Award credits or an entitlement manually.',
            sensitive: true,
          },
          {
            segment: 'revoke',
            label: 'Revoke',
            description: 'Withdraw an entitlement.',
            sensitive: true,
          },
          // No `adjust`: the entitlement API grants and revokes. A balance
          // correction is a grant of the delta or a revoke — both covered.
        ],
      },
      {
        segment: 'ledger',
        label: 'Billing ledger',
        children: [view('the double-entry billing ledger')],
      },
      {
        segment: 'webhooks',
        label: 'Gateway webhooks',
        children: [
          view('Razorpay webhook events'),
          {
            segment: 'replay',
            label: 'Replay',
            description: 'Re-process a webhook event.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'audit',
        label: 'Billing audit',
        description: 'The billing-specific audit trail.',
      },
      {
        segment: 'settings',
        label: 'Billing settings',
        description: 'Tax, invoicing and gateway configuration.',
        sensitive: true,
        children: [view('billing settings'), edit('billing settings')],
      },
    ],
  },

  // ── Vendors ──────────────────────────────────────────────────────────
  {
    segment: 'vendors',
    label: 'Vendors',
    description: 'Recruitment-partner directory and moderation.',
    children: [
      view('the vendor directory and individual vendor profiles'),
      {
        segment: 'verify',
        label: 'Verify / unverify',
        description: 'Toggle a vendor’s verified badge.',
      },
      {
        segment: 'visibility',
        label: 'Manage visibility',
        description: 'Show or hide a vendor from the public directory.',
      },
      {
        segment: 'reviews',
        label: 'Vendor reviews',
        children: [
          // There is no separate list ROUTE — reviews ride inside the vendor
          // detail payload, each carrying the reviewer's id, email and name.
          // So this gates the FIELD, not a route: `vendors.view` means "read
          // the vendor's own profile", which is not the same disclosure as
          // "read the identities of everyone who reviewed them".
          view('vendor reviews, including reviewer identity'),
          remove('a vendor review', true),
        ],
      },
      {
        segment: 'leads',
        label: 'View leads',
        description:
          'Reveal the hiring requirements routed to a vendor — including the employer’s identity and email, and the contact-reveal ledger.',
        sensitive: true,
      },
      {
        segment: 'analytics',
        label: 'Vendor analytics',
        description: 'Directory and lead-flow metrics.',
      },
    ],
  },

  // ── Assisted hiring ──────────────────────────────────────────────────
  {
    segment: 'assisted_hiring',
    label: 'Assisted hiring',
    description: 'The done-for-you sourcing service queue.',
    children: [
      view('the assisted-hiring request queue'),
      { segment: 'claim', label: 'Claim', description: 'Take ownership of a request.' },
      {
        segment: 'workflow',
        label: 'Workflow',
        description: 'Move a request through its stages.',
        children: [
          {
            segment: 'schedule_call',
            label: 'Schedule call',
            description: 'Book the intake call.',
          },
          { segment: 'start', label: 'Start sourcing', description: 'Begin the sourcing stage.' },
          {
            segment: 'deliver',
            label: 'Deliver',
            description: 'Send matched profiles to the employer.',
          },
          { segment: 'complete', label: 'Complete', description: 'Close a fulfilled request.' },
          { segment: 'cancel', label: 'Cancel', description: 'Cancel a request.' },
        ],
      },
      {
        segment: 'profiles',
        label: 'Matched profiles',
        children: [
          { segment: 'add', label: 'Add profile', description: 'Attach a candidate to a request.' },
          {
            segment: 'remove',
            label: 'Remove profile',
            description: 'Detach a candidate from a request.',
          },
        ],
      },
    ],
  },

  // ── Curated listings ─────────────────────────────────────────────────
  {
    segment: 'curated_listings',
    label: 'Curated listings',
    description: 'Hand-picked job collections surfaced on the public site.',
    children: [
      ...crud('curated listings'),
      { segment: 'reorder', label: 'Reorder', description: 'Change the display order.' },
      // No `publish` node: visibility is a field on the listing, changed
      // through the same PATCH as any other field — `curated_listings.edit`.
    ],
  },

  // ── Resume watermark ─────────────────────────────────────────────────
  {
    segment: 'resume_watermark',
    label: 'Resume watermark',
    description: 'On- and off-platform resume watermarking.',
    sensitive: true,
    children: [
      {
        segment: 'config',
        label: 'Configuration',
        children: [view('watermark defaults'), edit('watermark defaults')],
      },
      {
        segment: 'on_platform',
        label: 'On-platform resumes',
        sensitive: true,
        children: [
          view('platform candidate resumes eligible for watermarking'),
          {
            segment: 'download',
            label: 'Download',
            description: 'Download a watermarked resume.',
            sensitive: true,
          },
          {
            segment: 'bulk_download',
            label: 'Bulk download',
            description: 'Download many watermarked resumes at once.',
            sensitive: true,
          },
        ],
      },
      {
        segment: 'off_platform',
        label: 'Off-platform candidates',
        children: [
          ...crud('off-platform candidate records', true),
          {
            segment: 'upload',
            label: 'Upload resume',
            description: 'Attach a resume file to an off-platform candidate.',
          },
          {
            segment: 'download',
            label: 'Download',
            description: 'Download a watermarked resume.',
            sensitive: true,
          },
          {
            segment: 'bulk_download',
            label: 'Bulk download',
            description: 'Download many watermarked resumes at once.',
            sensitive: true,
          },
        ],
      },
    ],
  },

  // ── Follow graph ─────────────────────────────────────────────────────
  {
    segment: 'follows',
    label: 'Follow graph',
    description: 'Who follows which company.',
    children: [
      view('follow relationships and per-company follower lists'),
      {
        segment: 'stats',
        label: 'View statistics',
        description: 'Aggregate follow-graph metrics.',
      },
      // No `export` node — the follow graph has no export endpoint.
    ],
  },

  // ── Teams ────────────────────────────────────────────────────────────
  {
    segment: 'teams',
    label: 'Employer teams',
    description: 'Multi-seat employer team membership.',
    children: [
      view('employer teams and their members'),
      {
        segment: 'revoke',
        label: 'Revoke member',
        description: 'Force-remove a seat from a team.',
        sensitive: true,
      },
    ],
  },

  // ── Analytics ────────────────────────────────────────────────────────
  {
    segment: 'analytics',
    label: 'Analytics',
    description: 'Platform-wide metrics and dashboards.',
    children: [
      {
        segment: 'overview',
        label: 'Overview dashboard',
        description: 'The headline admin dashboard stats.',
      },
      {
        segment: 'users',
        label: 'User analytics',
        description: 'Signup, activation and retention metrics.',
      },
      { segment: 'jobs', label: 'Job analytics', description: 'Posting and fill-rate metrics.' },
      {
        segment: 'applications',
        label: 'Application analytics',
        description: 'Funnel and conversion metrics.',
      },
      // No `revenue` node: the admin analytics service returns no monetisation
      // data at all (revenue lives entirely behind `billing.dashboard`), so
      // this was an inert toggle the Access Matrix presented as real. Add it
      // back if and when analytics starts carrying revenue figures.
      {
        segment: 'live',
        label: 'Live counters',
        description: 'Real-time online users and activity counters.',
      },
      {
        segment: 'trending',
        label: 'Trending',
        description: 'Trending searches and job categories.',
      },
      // Analytics exports are gated by `reports.exports.*` (the endpoints
      // live on the reports router), so a second `analytics.export` node
      // would be an inert duplicate. Deliberately absent.
    ],
  },

  // ── Reports ──────────────────────────────────────────────────────────
  {
    segment: 'reports',
    label: 'Reports & exports',
    description: 'Ad-hoc and scheduled data exports.',
    sensitive: true,
    children: [
      view('available report datasets'),
      {
        segment: 'preview',
        label: 'Preview',
        description: 'Render a report before generating it.',
      },
      {
        segment: 'generate',
        label: 'Generate',
        description: 'Run a report and produce a file.',
        sensitive: true,
      },
      {
        segment: 'exports',
        label: 'Canned exports',
        sensitive: true,
        children: [
          {
            segment: 'users',
            label: 'Export users',
            description: 'Full user export to Excel.',
            sensitive: true,
          },
          {
            segment: 'jobs',
            label: 'Export jobs',
            description: 'Full job export to Excel.',
            sensitive: true,
          },
          { segment: 'analytics', label: 'Export analytics', description: 'Analytics PDF export.' },
        ],
      },
      {
        segment: 'jobs_monitor',
        label: 'Export job monitor',
        description: 'Track and cancel running export jobs.',
        children: [
          view('running and completed export jobs'),
          { segment: 'cancel', label: 'Cancel', description: 'Abort a running export job.' },
        ],
      },
    ],
  },

  // ── Platform ─────────────────────────────────────────────────────────
  {
    segment: 'platform',
    label: 'Platform',
    description: 'Infrastructure, configuration and operational tooling.',
    sensitive: true,
    children: [
      {
        segment: 'audit_logs',
        label: 'Audit logs',
        // No `export` node — `/admin/audit-logs` is read-only; bulk audit
        // extracts go through `reports.*`.
        children: [view('the platform audit trail')],
      },
      {
        segment: 'feature_flags',
        label: 'Feature flags',
        sensitive: true,
        // Read-only: the flags API exposes no write route. Flag VALUES live
        // in SystemConfig and are changed through `platform.system_config.edit`.
        children: [view('feature flags and their rollout state')],
      },
      {
        segment: 'system_config',
        label: 'System configuration',
        sensitive: true,
        children: [view('system configuration values'), edit('system configuration values')],
      },
      // No `maintenance` node: the switch is the `maintenanceMode` entry in
      // SystemConfig, read publicly via /feature-flags/client and written
      // through PATCH /super-admin/config — i.e. `platform.system_config.*`
      // already governs it, and a second pair of keys enforced nothing.
      {
        segment: 'email_templates',
        label: 'Transactional templates',
        description: 'The system email templates (not campaigns).',
        children: [
          view('transactional email templates'),
          {
            segment: 'preview',
            label: 'Preview',
            description: 'Render a template with sample data.',
          },
          {
            segment: 'test_send',
            label: 'Test send',
            description: 'Send a template to a test address.',
          },
        ],
      },
      // No `webhooks` node: /webhooks is a SELF-SERVICE surface — every
      // handler scopes to `req.user.id`, so an admin there manages only
      // their own endpoints, exactly as an employer does. There is no
      // platform-wide webhook administration to delegate. (Razorpay's
      // inbound events are separate, under `billing.webhooks.*`.)
      //
      // Stronger reason it can never come back as-is: the router admits
      // EMPLOYER, and `requirePermission` denies any non-ADMIN outright
      // (require-permission.ts — `if (req.user.role !== 'ADMIN') return
      // next(denial(keys))`). Attaching a permission to these routes would
      // 403 every employer managing their own webhook. The node was not
      // merely unwired, it was UNWIREABLE on the endpoint it named.
      // No `security` node: session listing and revocation are per-USER and
      // already gated by `users.{candidates,employers}.sessions.{view,revoke}`
      // through `requireSubjectPermission`. A parallel platform-wide trio
      // named nothing the routes actually check.
      // ── Break-glass infrastructure: SUPER_ADMIN only ──
      {
        segment: 'queues',
        label: 'Job queues',
        description: 'The Bull Board queue monitor — can drain and retry live jobs.',
        superAdminOnly: true,
      },
      {
        segment: 'kafka',
        label: 'Kafka',
        description: 'Event stream viewer, dead-letter queue and replay.',
        superAdminOnly: true,
        children: [
          view('recent Kafka events'),
          { segment: 'dlq', label: 'Dead-letter queue', description: 'Inspect failed events.' },
          { segment: 'replay', label: 'Replay', description: 'Re-emit events into the stream.' },
        ],
      },
    ],
  },

  // ── Admin control: SUPER_ADMIN only, never grantable ─────────────────
  {
    segment: 'admin_control',
    label: 'Admin control centre',
    description:
      'The permission system itself — roles, grants, the access matrix and admin activity oversight.',
    superAdminOnly: true,
    children: [
      view('the admin control centre'),
      {
        segment: 'grants',
        label: 'Manage grants',
        description: 'Grant and revoke permissions on an admin.',
      },
      {
        segment: 'roles',
        label: 'Manage roles',
        description: 'Create and edit reusable permission role templates.',
      },
      {
        segment: 'activity',
        label: 'Admin activity',
        description: 'The cross-admin activity feed.',
      },
      {
        segment: 'locks',
        label: 'Session locks',
        description: 'View and force-release editing locks held by admins.',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Compilation + lookup
// ═══════════════════════════════════════════════════════════════════════

const INDEX = new Map<string, CompiledPermission>();

function compile(
  nodes: PermissionNode[],
  parent: string | null,
  depth: number,
  inheritedSuperAdminOnly: boolean
): string[] {
  const keysAtThisLevel: string[] = [];

  for (const node of nodes) {
    const key = parent ? `${parent}.${node.segment}` : node.segment;
    const superAdminOnly = inheritedSuperAdminOnly || node.superAdminOnly === true;

    if (INDEX.has(key)) {
      // A duplicate key silently shadows an earlier node and would make
      // grants ambiguous. Fail at import time rather than in production.
      throw new Error(`Duplicate permission key in registry: "${key}"`);
    }

    const descendants = node.children?.length
      ? compile(node.children, key, depth + 1, superAdminOnly)
      : [];

    INDEX.set(key, {
      key,
      segment: node.segment,
      label: node.label,
      description: node.description,
      parent,
      depth,
      isLeaf: !node.children?.length,
      superAdminOnly,
      sensitive: node.sensitive === true,
      descendants,
    });

    keysAtThisLevel.push(key, ...descendants);
  }

  return keysAtThisLevel;
}

compile(PERMISSION_TREE, null, 1, false);

/** Every key in the registry, in tree order. */
export const ALL_PERMISSION_KEYS: string[] = [...INDEX.keys()];

/** Keys an ADMIN may actually be granted (excludes the super-admin-only subtrees). */
export const GRANTABLE_PERMISSION_KEYS: string[] = ALL_PERMISSION_KEYS.filter(
  (k) => !INDEX.get(k)!.superAdminOnly
);

export function getPermission(key: string): CompiledPermission | undefined {
  return INDEX.get(key);
}

export function isKnownPermission(key: string): boolean {
  return INDEX.has(key);
}

/** True when the key exists AND may be granted to a non-super-admin. */
export function isGrantablePermission(key: string): boolean {
  const node = INDEX.get(key);
  return Boolean(node) && !node!.superAdminOnly;
}

/**
 * Expand a set of keys to include every descendant. Used by the UI's
 * "what does this actually unlock?" preview and by the role-diff view —
 * NOT by enforcement, which uses prefix matching and needs no expansion.
 */
export function expandKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const node = INDEX.get(key);
    if (!node) continue;
    out.add(key);
    for (const d of node.descendants) out.add(d);
  }
  return out;
}

/** Ancestor chain for a key, nearest-first: `a.b.c` → `['a.b', 'a']`. */
export function ancestorsOf(key: string): string[] {
  const parts = key.split('.');
  const out: string[] = [];
  for (let i = parts.length - 1; i > 0; i--) out.push(parts.slice(0, i).join('.'));
  return out;
}

/**
 * Stable fingerprint of the registry's shape. The frontend compares this
 * against the tree it last fetched so a deploy that adds permissions
 * invalidates any cached copy instead of rendering a stale editor.
 */
export const PERMISSION_REGISTRY_VERSION: string = (() => {
  let hash = 0;
  for (const key of ALL_PERMISSION_KEYS) {
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
  }
  return `v1-${ALL_PERMISSION_KEYS.length}-${(hash >>> 0).toString(36)}`;
})();
