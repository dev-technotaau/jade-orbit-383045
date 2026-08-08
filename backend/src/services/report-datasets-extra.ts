/**
 * Extended report datasets — messaging, ledgers, operations and METRICS.
 *
 * Split from `report-datasets.ts` purely for file size; both are concatenated
 * into one registry there. Shared types and coercion helpers come from
 * `report-dataset-kit.ts`.
 *
 * ── Metrics datasets ────────────────────────────────────────────────
 * Everything else in the catalogue is row-level. The `metrics_*` entries are
 * aggregates: one row per time bucket rather than one row per record, which is
 * what makes "platform growth" or "revenue by week" exportable at all.
 *
 * They bucket with `date_trunc` via `$queryRaw` because Prisma's `groupBy`
 * cannot group by a truncated date. All values are bound parameters — never
 * interpolated — and the granularity is mapped through a fixed allow-list, so
 * no caller-supplied text reaches the SQL.
 *
 * Granularity rides in as a FILTER (`granularity`), which means the generic
 * where-builder in `report.service.ts` places it in `where` alongside real
 * column filters. Each metrics dataset pulls it back out of `where` itself and
 * never passes it to a query — see `readGranularity`. That keeps the dataset
 * interface unchanged at the cost of this one convention.
 */
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import {
  EmailEventType,
  EmailSubscribeStatus,
  LedgerEntryType,
  OrderStatus,
  QuoteRequestStatus,
  SettlementStatus,
  VendorLeadStatus,
  VerificationStatus,
  VerificationType,
  WaConversationStatus,
  WaDirection,
  WaMessageStatus,
  WaOptInStatus,
} from '@prisma/client';
import { dt, enumOptions, list, rupees, type ReportDatasetDef } from './report-dataset-kit';

/* ================================================================== */
/* Group: WhatsApp                                                     */
/* ================================================================== */

const waContactsDataset: ReportDatasetDef = {
  key: 'wa_contacts',
  label: 'WhatsApp contacts',
  group: 'WhatsApp',
  description: 'Opt-in state, tags and last-touch timestamps per WhatsApp contact.',
  dateFields: [
    { key: 'createdAt', label: 'Added' },
    { key: 'optInAt', label: 'Opted in' },
    { key: 'lastInboundAt', label: 'Last inbound' },
    { key: 'lastOutboundAt', label: 'Last outbound' },
  ],
  filters: [
    {
      key: 'optInStatus',
      label: 'Opt-in status',
      kind: 'enum',
      options: enumOptions(WaOptInStatus),
    },
    { key: 'isBlocked', label: 'Blocked', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Contact ID', default: true },
    { key: 'phone', label: 'Phone', default: true, pii: true },
    { key: 'name', label: 'Name', pii: true },
    { key: 'userId', label: 'Platform user ID', default: true },
    { key: 'optInStatus', label: 'Opt-in status', default: true },
    { key: 'optInSource', label: 'Opt-in source' },
    { key: 'tags', label: 'Tags', default: true },
    { key: 'isBlocked', label: 'Blocked', default: true },
    { key: 'lastInboundAt', label: 'Last inbound', default: true },
    { key: 'lastOutboundAt', label: 'Last outbound', default: true },
    { key: 'createdAt', label: 'Added', default: true },
  ],
  count: ({ where }) => prisma.waContact.count({ where: where as Prisma.WaContactWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.waContact.findMany({
      where: where as Prisma.WaContactWhereInput,
      select: {
        id: true,
        phone: true,
        name: true,
        userId: true,
        optInStatus: true,
        optInSource: true,
        tags: true,
        isBlocked: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      userId: c.userId,
      optInStatus: c.optInStatus,
      optInSource: c.optInSource,
      tags: list(c.tags),
      isBlocked: c.isBlocked,
      lastInboundAt: dt(c.lastInboundAt),
      lastOutboundAt: dt(c.lastOutboundAt),
      createdAt: dt(c.createdAt),
    }));
  },
};

const waConversationsDataset: ReportDatasetDef = {
  key: 'wa_conversations',
  label: 'WhatsApp conversations',
  group: 'WhatsApp',
  description: 'Inbox threads with response times, resolution and CSAT.',
  dateFields: [
    { key: 'createdAt', label: 'Opened' },
    { key: 'firstResponseAt', label: 'First response' },
    { key: 'resolvedAt', label: 'Resolved' },
    { key: 'lastMessageAt', label: 'Last message' },
  ],
  filters: [
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      options: enumOptions(WaConversationStatus),
    },
  ],
  columns: [
    { key: 'id', label: 'Conversation ID', default: true },
    { key: 'contactId', label: 'Contact ID', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'assignedTo', label: 'Assigned to' },
    { key: 'unreadCount', label: 'Unread' },
    { key: 'messageCount', label: 'Messages', default: true },
    { key: 'csatScore', label: 'CSAT', default: true },
    { key: 'firstResponseAt', label: 'First response', default: true },
    { key: 'resolvedAt', label: 'Resolved', default: true },
    { key: 'lastMessageAt', label: 'Last message', default: true },
    { key: 'createdAt', label: 'Opened', default: true },
  ],
  count: ({ where }) =>
    prisma.waConversation.count({ where: where as Prisma.WaConversationWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.waConversation.findMany({
      where: where as Prisma.WaConversationWhereInput,
      select: {
        id: true,
        contactId: true,
        status: true,
        assignedTo: true,
        unreadCount: true,
        csatScore: true,
        firstResponseAt: true,
        resolvedAt: true,
        lastMessageAt: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      status: c.status,
      assignedTo: c.assignedTo,
      unreadCount: c.unreadCount,
      messageCount: c._count.messages,
      csatScore: c.csatScore,
      firstResponseAt: dt(c.firstResponseAt),
      resolvedAt: dt(c.resolvedAt),
      lastMessageAt: dt(c.lastMessageAt),
      createdAt: dt(c.createdAt),
    }));
  },
};

const waMessagesDataset: ReportDatasetDef = {
  key: 'wa_messages',
  label: 'WhatsApp messages',
  group: 'WhatsApp',
  description: 'Per-message delivery state and billed cost. Message BODIES are excluded.',
  dateFields: [
    { key: 'createdAt', label: 'Created' },
    { key: 'sentAt', label: 'Sent' },
    { key: 'deliveredAt', label: 'Delivered' },
    { key: 'readAt', label: 'Read' },
  ],
  filters: [
    { key: 'direction', label: 'Direction', kind: 'enum', options: enumOptions(WaDirection) },
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(WaMessageStatus) },
    { key: 'billable', label: 'Billable', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Message ID', default: true },
    { key: 'wamid', label: 'WhatsApp ID' },
    { key: 'conversationId', label: 'Conversation ID', default: true },
    { key: 'contactId', label: 'Contact ID', default: true },
    { key: 'campaignId', label: 'Campaign ID' },
    { key: 'direction', label: 'Direction', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'templateName', label: 'Template' },
    { key: 'pricingCategory', label: 'Pricing category' },
    { key: 'cost', label: 'Cost (₹)', default: true },
    { key: 'billable', label: 'Billable', default: true },
    { key: 'errorCode', label: 'Error code' },
    { key: 'errorTitle', label: 'Error' },
    { key: 'sentAt', label: 'Sent', default: true },
    { key: 'deliveredAt', label: 'Delivered', default: true },
    { key: 'readAt', label: 'Read' },
  ],
  count: ({ where }) => prisma.waMessage.count({ where: where as Prisma.WaMessageWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.waMessage.findMany({
      where: where as Prisma.WaMessageWhereInput,
      // `text` / `payload` are deliberately NOT selected: this is a delivery and
      // cost report, and conversation content is not audit-log-safe material.
      select: {
        id: true,
        wamid: true,
        conversationId: true,
        contactId: true,
        campaignId: true,
        direction: true,
        type: true,
        status: true,
        templateName: true,
        pricingCategory: true,
        costPaise: true,
        billable: true,
        errorCode: true,
        errorTitle: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((m) => ({
      id: m.id,
      wamid: m.wamid,
      conversationId: m.conversationId,
      contactId: m.contactId,
      campaignId: m.campaignId,
      direction: m.direction,
      type: m.type,
      status: m.status,
      templateName: m.templateName,
      pricingCategory: m.pricingCategory,
      cost: rupees(m.costPaise),
      billable: m.billable,
      errorCode: m.errorCode,
      errorTitle: m.errorTitle,
      sentAt: dt(m.sentAt),
      deliveredAt: dt(m.deliveredAt),
      readAt: dt(m.readAt),
    }));
  },
};

const waConversionsDataset: ReportDatasetDef = {
  key: 'wa_conversions',
  label: 'WhatsApp conversions',
  group: 'WhatsApp',
  description: 'Attributed conversions and their value, per campaign.',
  dateFields: [{ key: 'createdAt', label: 'Converted' }],
  filters: [],
  columns: [
    { key: 'id', label: 'Conversion ID', default: true },
    { key: 'campaignId', label: 'Campaign ID', default: true },
    { key: 'contactId', label: 'Contact ID', default: true },
    { key: 'value', label: 'Value (₹)', default: true },
    { key: 'note', label: 'Note' },
    { key: 'createdAt', label: 'Converted', default: true },
  ],
  count: ({ where }) =>
    prisma.waConversion.count({ where: where as Prisma.WaConversionWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.waConversion.findMany({
      where: where as Prisma.WaConversionWhereInput,
      select: {
        id: true,
        campaignId: true,
        contactId: true,
        valuePaise: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      campaignId: c.campaignId,
      contactId: c.contactId,
      value: rupees(c.valuePaise),
      note: c.note,
      createdAt: dt(c.createdAt),
    }));
  },
};

/* ================================================================== */
/* Group: Email                                                        */
/* ================================================================== */

const emailContactsDataset: ReportDatasetDef = {
  key: 'email_contacts',
  label: 'Email contacts',
  group: 'Email',
  description: 'Subscribe state, engagement recency, bounce and complaint counts.',
  dateFields: [
    { key: 'createdAt', label: 'Added' },
    { key: 'subscribedAt', label: 'Subscribed' },
    { key: 'unsubscribedAt', label: 'Unsubscribed' },
    { key: 'lastOpenedAt', label: 'Last opened' },
    { key: 'lastEmailedAt', label: 'Last emailed' },
  ],
  filters: [
    {
      key: 'subscribeStatus',
      label: 'Subscribe status',
      kind: 'enum',
      options: enumOptions(EmailSubscribeStatus),
    },
    { key: 'isBlocked', label: 'Blocked', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Contact ID', default: true },
    { key: 'email', label: 'Email', default: true, pii: true },
    { key: 'name', label: 'Name', pii: true },
    { key: 'userId', label: 'Platform user ID', default: true },
    { key: 'subscribeStatus', label: 'Status', default: true },
    { key: 'subscribeSource', label: 'Source' },
    { key: 'tags', label: 'Tags', default: true },
    { key: 'bounceCount', label: 'Bounces', default: true },
    { key: 'complaintCount', label: 'Complaints', default: true },
    { key: 'isBlocked', label: 'Blocked', default: true },
    { key: 'lastOpenedAt', label: 'Last opened', default: true },
    { key: 'lastClickedAt', label: 'Last clicked' },
    { key: 'lastEmailedAt', label: 'Last emailed', default: true },
    { key: 'createdAt', label: 'Added', default: true },
  ],
  count: ({ where }) =>
    prisma.emailContact.count({ where: where as Prisma.EmailContactWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.emailContact.findMany({
      where: where as Prisma.EmailContactWhereInput,
      select: {
        id: true,
        email: true,
        name: true,
        userId: true,
        subscribeStatus: true,
        subscribeSource: true,
        tags: true,
        bounceCount: true,
        complaintCount: true,
        isBlocked: true,
        lastOpenedAt: true,
        lastClickedAt: true,
        lastEmailedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      userId: c.userId,
      subscribeStatus: c.subscribeStatus,
      subscribeSource: c.subscribeSource,
      tags: list(c.tags),
      bounceCount: c.bounceCount,
      complaintCount: c.complaintCount,
      isBlocked: c.isBlocked,
      lastOpenedAt: dt(c.lastOpenedAt),
      lastClickedAt: dt(c.lastClickedAt),
      lastEmailedAt: dt(c.lastEmailedAt),
      createdAt: dt(c.createdAt),
    }));
  },
};

const emailEventsDataset: ReportDatasetDef = {
  key: 'email_events',
  label: 'Email events',
  group: 'Email',
  description: 'Raw delivery/open/click/bounce events, including machine-open flags.',
  dateFields: [{ key: 'createdAt', label: 'When' }],
  filters: [
    { key: 'eventType', label: 'Event', kind: 'enum', options: enumOptions(EmailEventType) },
    { key: 'machineOpen', label: 'Machine open', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Event ID' },
    { key: 'eventType', label: 'Event', default: true },
    { key: 'campaignId', label: 'Campaign ID', default: true },
    { key: 'contactId', label: 'Contact ID', default: true },
    { key: 'recipientId', label: 'Recipient ID' },
    { key: 'url', label: 'Clicked URL' },
    { key: 'bounceType', label: 'Bounce type', default: true },
    { key: 'reason', label: 'Reason', default: true },
    { key: 'machineOpen', label: 'Machine open' },
    { key: 'ip', label: 'IP', pii: true },
    { key: 'userAgent', label: 'User agent', pii: true },
    { key: 'createdAt', label: 'When', default: true },
  ],
  count: ({ where }) => prisma.emailEvent.count({ where: where as Prisma.EmailEventWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.emailEvent.findMany({
      where: where as Prisma.EmailEventWhereInput,
      select: {
        id: true,
        eventType: true,
        campaignId: true,
        contactId: true,
        recipientId: true,
        url: true,
        bounceType: true,
        reason: true,
        machineOpen: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      campaignId: e.campaignId,
      contactId: e.contactId,
      recipientId: e.recipientId,
      url: e.url,
      bounceType: e.bounceType,
      reason: e.reason,
      machineOpen: e.machineOpen,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: dt(e.createdAt),
    }));
  },
};

const emailUnsubscribesDataset: ReportDatasetDef = {
  key: 'email_unsubscribes',
  label: 'Email unsubscribes',
  group: 'Email',
  description: 'Who unsubscribed, from which campaign, and by what method.',
  dateFields: [{ key: 'createdAt', label: 'When' }],
  filters: [],
  columns: [
    { key: 'id', label: 'ID' },
    { key: 'email', label: 'Email', default: true, pii: true },
    { key: 'contactId', label: 'Contact ID', default: true },
    { key: 'campaignId', label: 'Campaign ID', default: true },
    { key: 'method', label: 'Method', default: true },
    { key: 'ip', label: 'IP', pii: true },
    { key: 'createdAt', label: 'When', default: true },
  ],
  count: ({ where }) =>
    prisma.emailUnsubscribe.count({ where: where as Prisma.EmailUnsubscribeWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.emailUnsubscribe.findMany({
      where: where as Prisma.EmailUnsubscribeWhereInput,
      select: {
        id: true,
        email: true,
        contactId: true,
        campaignId: true,
        method: true,
        ip: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      contactId: u.contactId,
      campaignId: u.campaignId,
      method: u.method,
      ip: u.ip,
      createdAt: dt(u.createdAt),
    }));
  },
};

const emailSuppressionDataset: ReportDatasetDef = {
  key: 'email_suppression',
  label: 'Email suppression list',
  group: 'Email',
  description: 'Addresses that must never be mailed again, and why.',
  dateFields: [{ key: 'createdAt', label: 'Added' }],
  filters: [],
  columns: [
    { key: 'id', label: 'ID' },
    { key: 'email', label: 'Email', default: true, pii: true },
    { key: 'reason', label: 'Reason', default: true },
    { key: 'source', label: 'Source', default: true },
    { key: 'createdBy', label: 'Added by' },
    { key: 'createdAt', label: 'Added', default: true },
  ],
  count: ({ where }) =>
    prisma.emailSuppression.count({ where: where as Prisma.EmailSuppressionWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.emailSuppression.findMany({
      where: where as Prisma.EmailSuppressionWhereInput,
      select: {
        id: true,
        email: true,
        reason: true,
        source: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((s) => ({
      id: s.id,
      email: s.email,
      reason: s.reason,
      source: s.source,
      createdBy: s.createdBy,
      createdAt: dt(s.createdAt),
    }));
  },
};

/* ================================================================== */
/* Group: Ledgers                                                      */
/* ================================================================== */

const billingLedgerDataset: ReportDatasetDef = {
  key: 'billing_ledger',
  label: 'Billing ledger',
  group: 'Ledgers',
  description: 'Double-entry money movement — the finance-grade transaction list.',
  dateFields: [{ key: 'createdAt', label: 'Posted' }],
  filters: [
    { key: 'type', label: 'Entry type', kind: 'enum', options: enumOptions(LedgerEntryType) },
  ],
  columns: [
    { key: 'id', label: 'Entry ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'amount', label: 'Amount (₹)', default: true },
    { key: 'currency', label: 'Currency', default: true },
    { key: 'refType', label: 'Ref type', default: true },
    { key: 'refId', label: 'Ref ID' },
    { key: 'orderId', label: 'Order ID', default: true },
    { key: 'narration', label: 'Narration', default: true },
    { key: 'createdAt', label: 'Posted', default: true },
  ],
  count: ({ where }) =>
    prisma.billingLedger.count({ where: where as Prisma.BillingLedgerWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.billingLedger.findMany({
      where: where as Prisma.BillingLedgerWhereInput,
      select: {
        id: true,
        userId: true,
        type: true,
        amountPaise: true,
        currency: true,
        refType: true,
        refId: true,
        orderId: true,
        narration: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((l) => ({
      id: l.id,
      userId: l.userId,
      type: l.type,
      amount: rupees(l.amountPaise),
      currency: l.currency,
      refType: l.refType,
      refId: l.refId,
      orderId: l.orderId,
      narration: l.narration,
      createdAt: dt(l.createdAt),
    }));
  },
};

const settlementsDataset: ReportDatasetDef = {
  key: 'settlements',
  label: 'Settlements',
  group: 'Ledgers',
  description: 'Razorpay payouts to the bank, with fees and tax withheld.',
  dateFields: [
    { key: 'settledOnDate', label: 'Settled on' },
    { key: 'createdAt', label: 'Recorded' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(SettlementStatus) },
  ],
  columns: [
    { key: 'id', label: 'Settlement ID' },
    { key: 'razorpaySettlementId', label: 'Razorpay ID', default: true },
    { key: 'utr', label: 'Bank UTR', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'amount', label: 'Gross (₹)', default: true },
    { key: 'fees', label: 'Fees (₹)', default: true },
    { key: 'tax', label: 'Tax (₹)', default: true },
    { key: 'net', label: 'Net (₹)', default: true },
    { key: 'txnCount', label: 'Transactions', default: true },
    { key: 'settledOnDate', label: 'Settled on', default: true },
  ],
  count: ({ where }) => prisma.settlement.count({ where: where as Prisma.SettlementWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.settlement.findMany({
      where: where as Prisma.SettlementWhereInput,
      select: {
        id: true,
        razorpaySettlementId: true,
        utr: true,
        status: true,
        amountPaise: true,
        feesPaise: true,
        taxPaise: true,
        netPaise: true,
        settledOnDate: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { settledOnDate: 'desc' },
      skip,
      take,
    });
    return rows.map((s) => ({
      id: s.id,
      razorpaySettlementId: s.razorpaySettlementId,
      utr: s.utr,
      status: s.status,
      amount: rupees(s.amountPaise),
      fees: rupees(s.feesPaise),
      tax: rupees(s.taxPaise),
      net: rupees(s.netPaise),
      txnCount: s._count.transactions,
      settledOnDate: dt(s.settledOnDate),
    }));
  },
};

const resourceLedgerDataset: ReportDatasetDef = {
  key: 'resource_ledger',
  label: 'Quota ledger',
  group: 'Ledgers',
  description: 'Every grant, consume, rollback and expiry of a quota unit.',
  dateFields: [{ key: 'createdAt', label: 'When' }],
  filters: [],
  columns: [
    { key: 'id', label: 'Entry ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'entitlementResourceId', label: 'Resource ID', default: true },
    { key: 'delta', label: 'Delta', default: true },
    { key: 'reason', label: 'Reason', default: true },
    { key: 'refType', label: 'Ref type', default: true },
    { key: 'refId', label: 'Ref ID' },
    { key: 'notes', label: 'Notes' },
    { key: 'ipAddress', label: 'IP', pii: true },
    { key: 'createdAt', label: 'When', default: true },
  ],
  count: ({ where }) =>
    prisma.resourceLedger.count({ where: where as Prisma.ResourceLedgerWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.resourceLedger.findMany({
      where: where as Prisma.ResourceLedgerWhereInput,
      select: {
        id: true,
        userId: true,
        entitlementResourceId: true,
        delta: true,
        reason: true,
        refType: true,
        refId: true,
        notes: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      entitlementResourceId: r.entitlementResourceId,
      delta: r.delta,
      reason: r.reason,
      refType: r.refType,
      refId: r.refId,
      notes: r.notes,
      ipAddress: r.ipAddress,
      createdAt: dt(r.createdAt),
    }));
  },
};

const quotesDataset: ReportDatasetDef = {
  key: 'quotes',
  label: 'Enterprise quote requests',
  group: 'Ledgers',
  description: 'Inbound enterprise enquiries, SLA clock and assignment.',
  dateFields: [
    { key: 'createdAt', label: 'Received' },
    { key: 'slaDueAt', label: 'SLA due' },
    { key: 'contactedAt', label: 'Contacted' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(QuoteRequestStatus) },
  ],
  columns: [
    { key: 'id', label: 'Quote ID', default: true },
    { key: 'companyName', label: 'Company', default: true },
    { key: 'contactPerson', label: 'Contact person', pii: true },
    { key: 'email', label: 'Email', pii: true },
    { key: 'phone', label: 'Phone', pii: true },
    { key: 'employeeRange', label: 'Company size', default: true },
    { key: 'requiredCvCount', label: 'CVs needed', default: true },
    { key: 'budgetRange', label: 'Budget', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'assignedToId', label: 'Assigned to' },
    { key: 'slaDueAt', label: 'SLA due', default: true },
    { key: 'contactedAt', label: 'Contacted', default: true },
    { key: 'createdAt', label: 'Received', default: true },
  ],
  count: ({ where }) =>
    prisma.quoteRequest.count({ where: where as Prisma.QuoteRequestWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.quoteRequest.findMany({
      where: where as Prisma.QuoteRequestWhereInput,
      select: {
        id: true,
        companyName: true,
        contactPerson: true,
        email: true,
        phone: true,
        employeeRange: true,
        requiredCvCount: true,
        budgetRange: true,
        status: true,
        assignedToId: true,
        slaDueAt: true,
        contactedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((q) => ({
      id: q.id,
      companyName: q.companyName,
      contactPerson: q.contactPerson,
      email: q.email,
      phone: q.phone,
      employeeRange: q.employeeRange,
      requiredCvCount: q.requiredCvCount,
      budgetRange: q.budgetRange,
      status: q.status,
      assignedToId: q.assignedToId,
      slaDueAt: dt(q.slaDueAt),
      contactedAt: dt(q.contactedAt),
      createdAt: dt(q.createdAt),
    }));
  },
};

/* ================================================================== */
/* Group: Operations                                                   */
/* ================================================================== */

const verificationsDataset: ReportDatasetDef = {
  key: 'verifications',
  label: 'Verification requests',
  group: 'Operations',
  description: 'KYC / document verifications with SLA, escalation and reviewer.',
  dateFields: [
    { key: 'createdAt', label: 'Raised' },
    { key: 'reviewedAt', label: 'Reviewed' },
    { key: 'slaDeadline', label: 'SLA deadline' },
    { key: 'escalatedAt', label: 'Escalated' },
  ],
  filters: [
    { key: 'type', label: 'Type', kind: 'enum', options: enumOptions(VerificationType) },
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(VerificationStatus) },
    { key: 'autoEscalated', label: 'Auto-escalated', kind: 'boolean' },
  ],
  columns: [
    { key: 'id', label: 'Request ID', default: true },
    { key: 'userId', label: 'User ID', default: true },
    { key: 'type', label: 'Type', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'priority', label: 'Priority', default: true },
    { key: 'reviewedBy', label: 'Reviewer' },
    { key: 'adminComments', label: 'Reviewer comments' },
    { key: 'currentApprovalLevel', label: 'Approval level' },
    { key: 'autoEscalated', label: 'Auto-escalated' },
    { key: 'slaDeadline', label: 'SLA deadline', default: true },
    { key: 'reviewedAt', label: 'Reviewed', default: true },
    { key: 'createdAt', label: 'Raised', default: true },
  ],
  count: ({ where }) =>
    prisma.verificationRequest.count({ where: where as Prisma.VerificationRequestWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.verificationRequest.findMany({
      where: where as Prisma.VerificationRequestWhereInput,
      // `documentUrl` / `data` withheld: those are the identity documents.
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        priority: true,
        reviewedBy: true,
        adminComments: true,
        currentApprovalLevel: true,
        autoEscalated: true,
        slaDeadline: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((v) => ({
      id: v.id,
      userId: v.userId,
      type: v.type,
      status: v.status,
      priority: v.priority,
      reviewedBy: v.reviewedBy,
      adminComments: v.adminComments,
      currentApprovalLevel: v.currentApprovalLevel,
      autoEscalated: v.autoEscalated,
      slaDeadline: dt(v.slaDeadline),
      reviewedAt: dt(v.reviewedAt),
      createdAt: dt(v.createdAt),
    }));
  },
};

const vendorLeadsDataset: ReportDatasetDef = {
  key: 'vendor_leads',
  label: 'Vendor leads',
  group: 'Operations',
  description: 'Hiring leads routed to recruitment partners, and their responses.',
  dateFields: [
    { key: 'createdAt', label: 'Routed' },
    { key: 'respondedAt', label: 'Responded' },
    { key: 'expiresAt', label: 'Expires' },
  ],
  filters: [
    { key: 'status', label: 'Status', kind: 'enum', options: enumOptions(VendorLeadStatus) },
  ],
  columns: [
    { key: 'id', label: 'Lead ID', default: true },
    { key: 'vendorProfileId', label: 'Vendor ID', default: true },
    { key: 'jobPostId', label: 'Job ID', default: true },
    { key: 'employerId', label: 'Employer user ID', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'contactEmail', label: 'Contact email', pii: true },
    { key: 'contactPhone', label: 'Contact phone', pii: true },
    { key: 'respondedAt', label: 'Responded', default: true },
    { key: 'expiresAt', label: 'Expires' },
    { key: 'createdAt', label: 'Routed', default: true },
  ],
  count: ({ where }) => prisma.vendorLead.count({ where: where as Prisma.VendorLeadWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.vendorLead.findMany({
      where: where as Prisma.VendorLeadWhereInput,
      select: {
        id: true,
        vendorProfileId: true,
        jobPostId: true,
        employerId: true,
        status: true,
        contactEmail: true,
        contactPhone: true,
        respondedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((l) => ({
      id: l.id,
      vendorProfileId: l.vendorProfileId,
      jobPostId: l.jobPostId,
      employerId: l.employerId,
      status: l.status,
      contactEmail: l.contactEmail,
      contactPhone: l.contactPhone,
      respondedAt: dt(l.respondedAt),
      expiresAt: dt(l.expiresAt),
      createdAt: dt(l.createdAt),
    }));
  },
};

const webhookDeliveriesDataset: ReportDatasetDef = {
  key: 'webhook_deliveries',
  label: 'Webhook deliveries',
  group: 'Operations',
  description: 'Outbound webhook attempts with status code and failure reason.',
  dateFields: [{ key: 'createdAt', label: 'Attempted' }],
  filters: [{ key: 'success', label: 'Succeeded', kind: 'boolean' }],
  columns: [
    { key: 'id', label: 'Delivery ID', default: true },
    { key: 'webhookId', label: 'Endpoint ID', default: true },
    { key: 'event', label: 'Event', default: true },
    { key: 'statusCode', label: 'HTTP status', default: true },
    { key: 'success', label: 'Succeeded', default: true },
    { key: 'attempt', label: 'Attempt #', default: true },
    { key: 'error', label: 'Error', default: true },
    { key: 'createdAt', label: 'Attempted', default: true },
  ],
  count: ({ where }) =>
    prisma.webhookDelivery.count({ where: where as Prisma.WebhookDeliveryWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.webhookDelivery.findMany({
      where: where as Prisma.WebhookDeliveryWhereInput,
      // `payload` / `response` withheld — they can contain customer data.
      select: {
        id: true,
        webhookId: true,
        event: true,
        statusCode: true,
        success: true,
        attempt: true,
        error: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((d) => ({
      id: d.id,
      webhookId: d.webhookId,
      event: d.event,
      statusCode: d.statusCode,
      success: d.success,
      attempt: d.attempt,
      error: d.error,
      createdAt: dt(d.createdAt),
    }));
  },
};

const contactMessagesDataset: ReportDatasetDef = {
  key: 'contact_messages',
  label: 'Contact-form messages',
  group: 'Operations',
  description: 'Public contact-form submissions and whether they were answered.',
  dateFields: [
    { key: 'createdAt', label: 'Received' },
    { key: 'repliedAt', label: 'Replied' },
  ],
  filters: [{ key: 'isRead', label: 'Read', kind: 'boolean' }],
  columns: [
    { key: 'id', label: 'Message ID', default: true },
    { key: 'name', label: 'Name', pii: true },
    { key: 'email', label: 'Email', pii: true },
    { key: 'subject', label: 'Subject', default: true },
    { key: 'isRead', label: 'Read', default: true },
    { key: 'repliedAt', label: 'Replied', default: true },
    { key: 'createdAt', label: 'Received', default: true },
  ],
  count: ({ where }) =>
    prisma.contactMessage.count({ where: where as Prisma.ContactMessageWhereInput }),
  page: async ({ where, skip, take }) => {
    const rows = await prisma.contactMessage.findMany({
      where: where as Prisma.ContactMessageWhereInput,
      // `message` body withheld — subject + timestamps answer the ops question.
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        isRead: true,
        repliedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      subject: m.subject,
      isRead: m.isRead,
      repliedAt: dt(m.repliedAt),
      createdAt: dt(m.createdAt),
    }));
  },
};

/* ================================================================== */
/* Group: Metrics (aggregate / time-series)                            */
/* ================================================================== */

type Granularity = 'day' | 'week' | 'month';

/**
 * Pull `granularity` out of the generic where-clause and map it through a fixed
 * allow-list. Returns the bucket unit plus the where-clause with the pseudo
 * filter removed, so the remainder can still be used as real SQL predicates.
 */
function readGranularity(where: Record<string, unknown>): {
  unit: Granularity;
  rest: Record<string, unknown>;
} {
  const { granularity, ...rest } = where;
  const unit: Granularity = granularity === 'week' || granularity === 'month' ? granularity : 'day';
  return { unit, rest };
}

/**
 * `{ gte, lte }` out of the where-clause for the given column, as SQL bounds.
 * Metrics datasets take their range from the same `dateFields` mechanism as
 * every other dataset, so the UI needs no special case.
 */
function readRange(
  rest: Record<string, unknown>,
  field: string
): { from: Date | null; to: Date | null } {
  const raw = rest[field] as { gte?: Date; lte?: Date } | undefined;
  return { from: raw?.gte ?? null, to: raw?.lte ?? null };
}

/** Shared granularity filter, offered on every metrics dataset. */
const GRANULARITY_FILTER = {
  key: 'granularity',
  label: 'Bucket by',
  kind: 'enum' as const,
  options: ['day', 'week', 'month'],
};

/**
 * Count the buckets a range spans. Used as the dataset `count` so the UI's row
 * estimate is the number of rows the export will contain.
 */
async function countBuckets(
  table: Prisma.Sql,
  column: Prisma.Sql,
  unit: Granularity,
  from: Date | null,
  to: Date | null
): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT date_trunc(${unit}, ${column})) AS n
    FROM ${table}
    WHERE (${from}::timestamptz IS NULL OR ${column} >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR ${column} <= ${to}::timestamptz)`;
  return Number(rows[0]?.n ?? 0);
}

const dailySignupsDataset: ReportDatasetDef = {
  key: 'metrics_signups',
  label: 'Signups over time',
  group: 'Metrics',
  description: 'Registrations per bucket, split by role. One row per period.',
  dateFields: [{ key: 'createdAt', label: 'Registered' }],
  filters: [GRANULARITY_FILTER],
  columns: [
    { key: 'period', label: 'Period', default: true },
    { key: 'total', label: 'Total signups', default: true },
    { key: 'candidates', label: 'Candidates', default: true },
    { key: 'employers', label: 'Employers', default: true },
    { key: 'admins', label: 'Admins', default: true },
    { key: 'verified', label: 'Email verified', default: true },
  ],
  count: async ({ where }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'createdAt');
    return countBuckets(Prisma.sql`"User"`, Prisma.sql`"createdAt"`, unit, from, to);
  },
  page: async ({ where, skip, take }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'createdAt');
    const rows = await prisma.$queryRaw<
      {
        period: Date;
        total: bigint;
        candidates: bigint;
        employers: bigint;
        admins: bigint;
        verified: bigint;
      }[]
    >`
      SELECT date_trunc(${unit}, "createdAt") AS period,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "role" = 'CANDIDATE') AS candidates,
             COUNT(*) FILTER (WHERE "role" = 'EMPLOYER') AS employers,
             COUNT(*) FILTER (WHERE "role" IN ('ADMIN', 'SUPER_ADMIN')) AS admins,
             COUNT(*) FILTER (WHERE "isEmailVerified") AS verified
      FROM "User"
      WHERE (${from}::timestamptz IS NULL OR "createdAt" >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR "createdAt" <= ${to}::timestamptz)
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${take} OFFSET ${skip}`;
    return rows.map((r) => ({
      period: r.period.toISOString().slice(0, 10),
      total: Number(r.total),
      candidates: Number(r.candidates),
      employers: Number(r.employers),
      admins: Number(r.admins),
      verified: Number(r.verified),
    }));
  },
};

const jobMetricsDataset: ReportDatasetDef = {
  key: 'metrics_jobs',
  label: 'Job posting over time',
  group: 'Metrics',
  description: 'Jobs posted per bucket, with openings and views.',
  dateFields: [{ key: 'createdAt', label: 'Posted' }],
  filters: [GRANULARITY_FILTER],
  columns: [
    { key: 'period', label: 'Period', default: true },
    { key: 'jobsPosted', label: 'Jobs posted', default: true },
    { key: 'openings', label: 'Total openings', default: true },
    { key: 'views', label: 'Total views', default: true },
    { key: 'featured', label: 'Featured', default: true },
    { key: 'closed', label: 'Closed', default: true },
  ],
  count: async ({ where }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'createdAt');
    return countBuckets(Prisma.sql`"JobPost"`, Prisma.sql`"createdAt"`, unit, from, to);
  },
  page: async ({ where, skip, take }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'createdAt');
    const rows = await prisma.$queryRaw<
      {
        period: Date;
        jobs: bigint;
        openings: bigint | null;
        views: bigint | null;
        featured: bigint;
        closed: bigint;
      }[]
    >`
      SELECT date_trunc(${unit}, "createdAt") AS period,
             COUNT(*) AS jobs,
             SUM("numberOfOpenings") AS openings,
             SUM("views") AS views,
             COUNT(*) FILTER (WHERE "isFeatured") AS featured,
             COUNT(*) FILTER (WHERE "status" = 'CLOSED') AS closed
      FROM "JobPost"
      WHERE (${from}::timestamptz IS NULL OR "createdAt" >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR "createdAt" <= ${to}::timestamptz)
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${take} OFFSET ${skip}`;
    return rows.map((r) => ({
      period: r.period.toISOString().slice(0, 10),
      jobsPosted: Number(r.jobs),
      openings: Number(r.openings ?? 0),
      views: Number(r.views ?? 0),
      featured: Number(r.featured),
      closed: Number(r.closed),
    }));
  },
};

const applicationMetricsDataset: ReportDatasetDef = {
  key: 'metrics_applications',
  label: 'Application funnel over time',
  group: 'Metrics',
  description: 'Applications per bucket with the shortlist → hire funnel.',
  dateFields: [{ key: 'appliedAt', label: 'Applied' }],
  filters: [GRANULARITY_FILTER],
  columns: [
    { key: 'period', label: 'Period', default: true },
    { key: 'applications', label: 'Applications', default: true },
    { key: 'viewed', label: 'Viewed', default: true },
    { key: 'shortlisted', label: 'Shortlisted', default: true },
    { key: 'selected', label: 'Selected', default: true },
    { key: 'hired', label: 'Hired', default: true },
    { key: 'rejected', label: 'Rejected', default: true },
  ],
  count: async ({ where }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'appliedAt');
    return countBuckets(Prisma.sql`"JobApplication"`, Prisma.sql`"appliedAt"`, unit, from, to);
  },
  page: async ({ where, skip, take }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'appliedAt');
    const rows = await prisma.$queryRaw<
      {
        period: Date;
        total: bigint;
        viewed: bigint;
        shortlisted: bigint;
        selected: bigint;
        hired: bigint;
        rejected: bigint;
      }[]
    >`
      SELECT date_trunc(${unit}, "appliedAt") AS period,
             COUNT(*) AS total,
             COUNT("viewedAt") AS viewed,
             COUNT(*) FILTER (WHERE "status" = 'SHORTLISTED') AS shortlisted,
             COUNT("selectedAt") AS selected,
             COUNT("hiredAt") AS hired,
             COUNT(*) FILTER (WHERE "status" = 'REJECTED') AS rejected
      FROM "JobApplication"
      WHERE (${from}::timestamptz IS NULL OR "appliedAt" >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR "appliedAt" <= ${to}::timestamptz)
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${take} OFFSET ${skip}`;
    return rows.map((r) => ({
      period: r.period.toISOString().slice(0, 10),
      applications: Number(r.total),
      viewed: Number(r.viewed),
      shortlisted: Number(r.shortlisted),
      selected: Number(r.selected),
      hired: Number(r.hired),
      rejected: Number(r.rejected),
    }));
  },
};

const revenueMetricsDataset: ReportDatasetDef = {
  key: 'metrics_revenue',
  label: 'Revenue over time',
  group: 'Metrics',
  description: 'Paid orders, gross, discount, tax and net revenue per bucket.',
  dateFields: [{ key: 'paidAt', label: 'Paid' }],
  filters: [GRANULARITY_FILTER],
  columns: [
    { key: 'period', label: 'Period', default: true },
    { key: 'paidOrders', label: 'Paid orders', default: true },
    { key: 'gross', label: 'Gross (₹)', default: true },
    { key: 'discount', label: 'Discount (₹)', default: true },
    { key: 'tax', label: 'Tax (₹)', default: true },
    { key: 'total', label: 'Collected (₹)', default: true },
    { key: 'avgOrderValue', label: 'Avg order (₹)', default: true },
    { key: 'payingUsers', label: 'Paying users', default: true },
  ],
  count: async ({ where }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'paidAt');
    // Only PAID orders carry revenue, so the bucket count must match the query.
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT date_trunc(${unit}, "paidAt")) AS n
      FROM "Order"
      WHERE "status" = ${OrderStatus.PAID}::"OrderStatus"
        AND "paidAt" IS NOT NULL
        AND (${from}::timestamptz IS NULL OR "paidAt" >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR "paidAt" <= ${to}::timestamptz)`;
    return Number(rows[0]?.n ?? 0);
  },
  page: async ({ where, skip, take }) => {
    const { unit, rest } = readGranularity(where);
    const { from, to } = readRange(rest, 'paidAt');
    const rows = await prisma.$queryRaw<
      {
        period: Date;
        orders: bigint;
        gross: bigint | null;
        discount: bigint | null;
        tax: bigint | null;
        total: bigint | null;
        users: bigint;
      }[]
    >`
      SELECT date_trunc(${unit}, "paidAt") AS period,
             COUNT(*) AS orders,
             SUM("originalAmountPaise") AS gross,
             SUM("discountPaise") AS discount,
             SUM("taxPaise") AS tax,
             SUM("totalPaise") AS total,
             COUNT(DISTINCT "userId") AS users
      FROM "Order"
      WHERE "status" = ${OrderStatus.PAID}::"OrderStatus"
        AND "paidAt" IS NOT NULL
        AND (${from}::timestamptz IS NULL OR "paidAt" >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR "paidAt" <= ${to}::timestamptz)
      GROUP BY period
      ORDER BY period DESC
      LIMIT ${take} OFFSET ${skip}`;
    return rows.map((r) => {
      const orders = Number(r.orders);
      const total = Number(r.total ?? 0);
      return {
        period: r.period.toISOString().slice(0, 10),
        paidOrders: orders,
        gross: rupees(Number(r.gross ?? 0)),
        discount: rupees(Number(r.discount ?? 0)),
        tax: rupees(Number(r.tax ?? 0)),
        total: rupees(total),
        avgOrderValue: orders > 0 ? rupees(Math.round(total / orders)) : 0,
        payingUsers: Number(r.users),
      };
    });
  },
};

/* ================================================================== */

/**
 * Appended to the core registry in `report-datasets.ts`. Keep new entries in
 * their group so the picker stays grouped in a sensible order.
 */
export const EXTRA_REPORT_DATASETS: ReportDatasetDef[] = [
  // WhatsApp
  waContactsDataset,
  waConversationsDataset,
  waMessagesDataset,
  waConversionsDataset,
  // Email
  emailContactsDataset,
  emailEventsDataset,
  emailUnsubscribesDataset,
  emailSuppressionDataset,
  // Ledgers
  billingLedgerDataset,
  settlementsDataset,
  resourceLedgerDataset,
  quotesDataset,
  // Operations
  verificationsDataset,
  vendorLeadsDataset,
  webhookDeliveriesDataset,
  contactMessagesDataset,
  // Metrics
  dailySignupsDataset,
  jobMetricsDataset,
  applicationMetricsDataset,
  revenueMetricsDataset,
];
