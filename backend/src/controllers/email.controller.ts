/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import * as senders from '../services/email-sender.service';
import * as snippets from '../services/email-snippet.service';
import * as optin from '../services/email-optin.service';
import { putBufferToR2 } from '../services/storage.service';
import * as templates from '../services/email-template.service';
import * as campaigns from '../services/email-campaign.service';
import * as contacts from '../services/email-contact.service';
import * as segments from '../services/email-segment.service';
import * as sets from '../services/email-set.service';
import * as suppression from '../services/email-suppression.service';
import * as settings from '../services/email-settings.service';
import * as threads from '../services/email-thread.service';
import * as analytics from '../services/email-analytics.service';
import * as sequence from '../services/email-sequence.service';
import * as bulk from '../services/email-bulk.service';
import * as attach from '../services/email-attachment.service';
import { prisma } from '../config/prisma';
import { formatCsv } from '../utils/email-csv';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });
const num = (v: unknown, d: number): number => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): H =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };

// ── Senders ──────────────────────────────────────────────────────────────────
export const listSenders = wrap(async (_req, res) => ok(res, await senders.listSenders()));
export const createSender = wrap(async (req, res) =>
  ok(res, await senders.createSender({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateSender = wrap(async (req, res) =>
  ok(res, await senders.updateSender(String(req.params.id), req.body))
);
export const deleteSender = wrap(async (req, res) => {
  await senders.deleteSender(String(req.params.id));
  ok(res, { deleted: true });
});
export const verifySender = wrap(async (req, res) =>
  ok(res, await senders.verifySenderDns(String(req.params.id)))
);

// ── Templates ────────────────────────────────────────────────────────────────
export const listTemplates = wrap(async (req, res) =>
  ok(
    res,
    await templates.listTemplates({
      q: req.query.q as string,
      category: req.query.category as any,
      status: req.query.status as any,
    })
  )
);
export const getTemplate = wrap(async (req, res) =>
  ok(res, await templates.getTemplate(String(req.params.id)))
);
export const createTemplate = wrap(async (req, res) =>
  ok(res, await templates.createTemplate({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateTemplate = wrap(async (req, res) =>
  ok(res, await templates.updateTemplate(String(req.params.id), req.body))
);
export const deleteTemplate = wrap(async (req, res) => {
  await templates.deleteTemplate(String(req.params.id));
  ok(res, { deleted: true });
});
export const bulkDeleteTemplates = wrap(async (req, res) => {
  const ids: string[] = req.body.ids ?? [];
  const undoToken = await bulk.createUndoSnapshot(
    'template',
    ids,
    'Deleted templates',
    req.user!.id
  );
  ok(res, { ...(await templates.bulkDeleteTemplates(ids)), undoToken });
});
export const bulkTemplateStatus = wrap(async (req, res) =>
  ok(res, await templates.bulkUpdateTemplateStatus(req.body.ids ?? [], req.body.status))
);
export const bulkDuplicateTemplates = wrap(async (req, res) =>
  ok(res, await templates.bulkDuplicateTemplates(req.body.ids ?? [], req.user!.id), 201)
);
export const previewTemplate = wrap(async (req, res) =>
  ok(
    res,
    await templates.previewTemplate(
      {
        subject: req.body.subject,
        htmlBody: req.body.htmlBody,
        textBody: req.body.textBody,
        preheader: req.body.preheader,
        footerSnippetId: req.body.footerSnippetId,
      },
      req.body.sampleVars ?? {},
      { category: req.body.category, to: req.body.to }
    )
  )
);
export const testSendTemplate = wrap(async (req, res) =>
  ok(
    res,
    await templates.testSendTemplate(
      {
        subject: req.body.subject,
        htmlBody: req.body.htmlBody,
        textBody: req.body.textBody,
        preheader: req.body.preheader,
        category: req.body.category,
        footerSnippetId: req.body.footerSnippetId,
      },
      req.body.to,
      req.body.sampleVars ?? {}
    )
  )
);

// ── Campaigns ────────────────────────────────────────────────────────────────
export const listCampaigns = wrap(async (req, res) =>
  ok(
    res,
    await campaigns.listCampaigns({
      status: req.query.status as any,
      q: req.query.q as string,
      archived: req.query.archived === 'true',
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 30),
    })
  )
);
export const getCampaign = wrap(async (req, res) => {
  const c = await campaigns.getCampaign(String(req.params.id));
  if (!c) {
    res
      .status(404)
      .json({
        success: false,
        error: { message: 'Campaign not found', code: 'EMAIL_CAMPAIGN_NOT_FOUND' },
      });
    return;
  }
  ok(res, c);
});
export const createCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.createCampaign({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.updateCampaign(String(req.params.id), req.body))
);
export const launchCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.launchCampaign(String(req.params.id)))
);
export const pauseCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.pauseCampaign(String(req.params.id)))
);
export const resumeCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.resumeCampaign(String(req.params.id)))
);
export const cancelCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.cancelCampaign(String(req.params.id)))
);
export const retryFailed = wrap(async (req, res) =>
  ok(res, await campaigns.retryFailedRecipients(String(req.params.id)))
);
export const materializeCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.materializeCampaign(String(req.params.id)))
);
export const reconcileCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.reconcileCampaign(String(req.params.id)))
);
export const getCampaignLinks = wrap(async (req, res) =>
  ok(
    res,
    await prisma.emailLink.findMany({
      where: { campaignId: String(req.params.id) },
      orderBy: { clickCount: 'desc' },
    })
  )
);
export const duplicateCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.cloneCampaign(String(req.params.id), { nameSuffix: ' (copy)' }), 201)
);
export const archiveCampaign = wrap(async (req, res) =>
  ok(res, await campaigns.archiveCampaign(String(req.params.id), req.body.archived !== false))
);
export const bulkCampaigns = wrap(async (req, res) => {
  const ids: string[] = req.body.ids ?? [];
  const undoToken =
    req.body.action === 'delete'
      ? await bulk.createUndoSnapshot('campaign', ids, 'Deleted campaigns', req.user!.id)
      : null;
  ok(res, { ...(await campaigns.bulkCampaigns(ids, req.body.action)), undoToken });
});
export const previewAudience = wrap(async (req, res) =>
  ok(res, await campaigns.previewCampaignAudience(String(req.params.id)))
);
export const setVariants = wrap(async (req, res) =>
  ok(res, await campaigns.setVariants(String(req.params.id), req.body.variants))
);
export const setSteps = wrap(async (req, res) =>
  ok(res, await sequence.setSequenceSteps(String(req.params.id), req.body.steps))
);
export const getRecipients = wrap(async (req, res) =>
  ok(
    res,
    await campaigns.getRecipients(
      String(req.params.id),
      num(req.query.page, 1),
      num(req.query.limit, 50),
      req.query.status as any
    )
  )
);
export const exportRecipients = wrap(async (req, res) => {
  const rows = await campaigns.getRecipientsForExport(String(req.params.id));
  const csv = formatCsv(
    ['email', 'name', 'status', 'openCount', 'clickCount', 'sentAt', 'bouncedAt'],
    rows.map((r) => ({
      email: r.email,
      name: r.contact?.name ?? '',
      status: r.status,
      openCount: r.openCount,
      clickCount: r.clickCount,
      sentAt: r.sentAt?.toISOString() ?? '',
      bouncedAt: r.bouncedAt?.toISOString() ?? '',
    }))
  );
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="campaign-${req.params.id}-recipients.csv"`);
  res.status(200).send(csv);
});
export const testSendCampaign = wrap(async (req, res) => {
  const c = await campaigns.getCampaign(String(req.params.id));
  if (!c || !c.templateId) {
    res
      .status(400)
      .json({
        success: false,
        error: { message: 'Campaign has no template', code: 'EMAIL_CAMPAIGN_NO_TEMPLATE' },
      });
    return;
  }
  const tpl = await templates.getTemplate(c.templateId);
  ok(
    res,
    await templates.testSendTemplate(
      {
        subject: c.subjectOverride || tpl.subject,
        htmlBody: tpl.htmlBody,
        textBody: tpl.textBody,
        preheader: tpl.preheader,
        category: tpl.category,
        footerSnippetId: tpl.footerSnippetId,
      },
      req.body.to,
      {}
    )
  );
});
export const saveAsBlueprint = wrap(async (req, res) =>
  ok(res, await campaigns.saveAsBlueprint(String(req.params.id), req.body.name, req.user!.id), 201)
);
export const campaignAnalytics = wrap(async (req, res) => {
  const data = await analytics.campaignAnalytics(String(req.params.id));
  if (!data) {
    res
      .status(404)
      .json({
        success: false,
        error: { message: 'Campaign not found', code: 'EMAIL_CAMPAIGN_NOT_FOUND' },
      });
    return;
  }
  ok(res, data);
});

// ── Blueprints ───────────────────────────────────────────────────────────────
export const listBlueprints = wrap(async (_req, res) => ok(res, await campaigns.listBlueprints()));
export const useBlueprint = wrap(async (req, res) =>
  ok(
    res,
    await campaigns.createCampaignFromBlueprint(
      String(req.params.id),
      req.user!.id,
      req.body?.name
    ),
    201
  )
);
export const deleteBlueprint = wrap(async (req, res) => {
  await campaigns.deleteBlueprint(String(req.params.id));
  ok(res, { deleted: true });
});

// ── Contacts ─────────────────────────────────────────────────────────────────
const csvList = (v: unknown): string[] | undefined => {
  if (!v) return undefined;
  const arr = String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
};
const contactFilterFromQuery = (req: Request) => ({
  q: req.query.q as string,
  subscribeStatus: req.query.subscribeStatus as any,
  tag: req.query.tag as string,
  tags: csvList(req.query.tags),
  onPlatform: req.query.onPlatform === undefined ? undefined : req.query.onPlatform === 'true',
  isBlocked: req.query.isBlocked === undefined ? undefined : req.query.isBlocked === 'true',
  ids: csvList(req.query.ids),
  setId: (req.query.setId as string) || undefined,
});
export const listContacts = wrap(async (req, res) =>
  ok(
    res,
    await contacts.listContacts({
      ...contactFilterFromQuery(req),
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 50),
    })
  )
);
export const getContact = wrap(async (req, res) =>
  ok(res, await contacts.getContact(String(req.params.id)))
);
export const createContact = wrap(async (req, res) =>
  ok(res, await contacts.createContact(req.body), 201)
);
export const updateContact = wrap(async (req, res) =>
  ok(res, await contacts.updateContact(String(req.params.id), req.body))
);
export const deleteContact = wrap(async (req, res) => {
  await contacts.deleteContact(String(req.params.id));
  ok(res, { deleted: true });
});
export const blockContact = wrap(async (req, res) =>
  ok(res, await contacts.setContactBlocked(String(req.params.id), req.body.isBlocked !== false))
);
export const eraseContact = wrap(async (req, res) =>
  ok(res, await contacts.eraseContact(String(req.params.id)))
);
const contactScope = (req: Request) => ({
  ids: req.body.contactIds as string[] | undefined,
  filter: req.body.filter as Record<string, unknown> | undefined,
});
export const bulkTagContacts = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'contact.tag',
      contactScope(req),
      { addTags: req.body.addTags, removeTags: req.body.removeTags },
      { createdBy: req.user!.id }
    )
  )
);
export const bulkUpdateContacts = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'contact.update',
      contactScope(req),
      { subscribeStatus: req.body.subscribeStatus, isBlocked: req.body.isBlocked },
      { createdBy: req.user!.id }
    )
  )
);
export const bulkDeleteContacts = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'contact.delete',
      contactScope(req),
      {},
      { createdBy: req.user!.id, label: 'Deleted contacts' }
    )
  )
);
export const importContactRows = wrap(async (req, res) => {
  const result = await contacts.importContactRows(req.body.rows ?? [], {
    tags: req.body.tags,
    source: req.body.source,
    subscribeStatus: req.body.subscribeStatus,
  });
  ok(
    res,
    {
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      errors: result.errors,
    },
    201
  );
});
export const importContacts = wrap(async (req, res) => {
  const doubleOptIn = req.body.doubleOptIn === true;
  const result = await contacts.importContactsCsv(req.body.csv, {
    tags: req.body.tags,
    source: req.body.source,
    subscribeStatus: doubleOptIn ? 'PENDING' : req.body.subscribeStatus,
    mapping: req.body.mapping,
  });
  // Double opt-in: email each imported address a confirmation link (capped, fire-and-forget).
  if (doubleOptIn) {
    for (const email of result.emails.slice(0, 1000)) {
      void optin.requestDoubleOptIn(email, req.body.source || 'import').catch(() => {});
    }
  }
  ok(
    res,
    {
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      errors: result.errors,
    },
    201
  );
});
export const exportContacts = wrap(async (req, res) => {
  const csv = await contacts.exportContactsCsv(contactFilterFromQuery(req));
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="email-contacts.csv"');
  res.status(200).send(csv);
});

// ── Platform users ───────────────────────────────────────────────────────────
const parseRoles = (v: unknown): Role[] | undefined => {
  if (!v) return undefined;
  const arr = String(v)
    .split(',')
    .map((r) => r.trim().toUpperCase());
  return arr.filter((r): r is Role => (Object.values(Role) as string[]).includes(r));
};
export const listPlatformUsers = wrap(async (req, res) =>
  ok(
    res,
    await contacts.listPlatformUsers({
      roles: parseRoles(req.query.roles),
      verifiedOnly: req.query.verifiedOnly === 'true',
      q: req.query.q as string,
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 50),
    })
  )
);
export const countPlatformUsers = wrap(async (req, res) =>
  ok(res, {
    count: await contacts.countPlatformUsers({
      roles: parseRoles(req.query.roles),
      verifiedOnly: req.query.verifiedOnly === 'true',
    }),
  })
);
/** Materialize platform users matching a role/search filter into EmailContact rows. */
export const syncPlatformUsers = wrap(async (req, res) => {
  const contactIds = await contacts.syncPlatformContacts({
    roles: parseRoles(req.body.roles),
    verifiedOnly: req.body.verifiedOnly === true,
    q: req.body.q || undefined,
    userIds:
      Array.isArray(req.body.userIds) && req.body.userIds.length ? req.body.userIds : undefined,
    activeOnly: true,
  });
  ok(res, { count: contactIds.length, contactIds }, 201);
});
export const exportPlatformUsers = wrap(async (req, res) => {
  const csv = await contacts.exportPlatformUsersCsv({
    roles: parseRoles(req.query.roles),
    verifiedOnly: req.query.verifiedOnly === 'true',
    q: req.query.q as string,
    activeOnly: true,
  });
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="platform-users.csv"');
  res.status(200).send(csv);
});

// ── Segments ─────────────────────────────────────────────────────────────────
export const listSegments = wrap(async (_req, res) => ok(res, await segments.listSegments()));
export const getSegment = wrap(async (req, res) =>
  ok(res, await segments.getSegment(String(req.params.id)))
);
export const createSegment = wrap(async (req, res) =>
  ok(res, await segments.createSegment({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateSegment = wrap(async (req, res) =>
  ok(res, await segments.updateSegment(String(req.params.id), req.body))
);
export const deleteSegment = wrap(async (req, res) => {
  await segments.deleteSegment(String(req.params.id));
  ok(res, { deleted: true });
});
export const segmentSize = wrap(async (req, res) =>
  ok(res, { count: await segments.estimateSegmentSize(String(req.params.id)) })
);

// ── Static sets (named contact lists) ────────────────────────────────────────
export const listSets = wrap(async (_req, res) => ok(res, await sets.listSets()));
export const getSet = wrap(async (req, res) => ok(res, await sets.getSet(String(req.params.id))));
export const createSet = wrap(async (req, res) =>
  ok(res, await sets.createSet({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateSet = wrap(async (req, res) =>
  ok(res, await sets.updateSet(String(req.params.id), req.body))
);
export const deleteSet = wrap(async (req, res) =>
  ok(res, await sets.deleteSet(String(req.params.id)))
);
export const bulkDeleteSets = wrap(async (req, res) => {
  const ids: string[] = req.body.ids ?? [];
  const undoToken = await bulk.createUndoSnapshot('set', ids, 'Deleted sets', req.user!.id);
  ok(res, { ...(await sets.deleteSets(ids)), undoToken });
});
export const listSetMembers = wrap(async (req, res) =>
  ok(
    res,
    await sets.listSetMembers(String(req.params.id), {
      q: req.query.q as string,
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 50),
    })
  )
);
export const addSetMembers = wrap(async (req, res) =>
  ok(res, await sets.addMembers(String(req.params.id), req.body.contactIds ?? []), 201)
);
export const removeSetMembers = wrap(async (req, res) => {
  const setId = String(req.params.id);
  const contactIds: string[] = req.body.contactIds ?? [];
  const undoToken = await bulk.createUndoSnapshot(
    'setMember',
    contactIds,
    'Removed set members',
    req.user!.id,
    { setId }
  );
  ok(res, { ...(await sets.removeMembers(setId, contactIds)), undoToken });
});
export const addSetMembersByAudience = wrap(async (req, res) =>
  ok(
    res,
    await sets.addMembersByAudience(String(req.params.id), {
      audienceType: req.body.audienceType,
      audienceFilter: req.body.audienceFilter,
      segmentId: req.body.segmentId,
      setId: req.body.setId,
    }),
    201
  )
);
export const exportSet = wrap(async (req, res) => {
  const csv = await sets.exportSetCsv(String(req.params.id));
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="set-${req.params.id}.csv"`);
  res.status(200).send(csv);
});

// ── Suppression / unsubscribes ───────────────────────────────────────────────
export const listSuppressions = wrap(async (req, res) =>
  ok(
    res,
    await suppression.listSuppressions({
      q: req.query.q as string,
      reason: req.query.reason as string,
    })
  )
);
export const addSuppression = wrap(async (req, res) =>
  ok(
    res,
    await suppression.addSuppression({
      email: req.body.email,
      reason: req.body.reason ?? 'manual',
      source: 'admin',
      createdBy: req.user!.id,
    }),
    201
  )
);
export const removeSuppression = wrap(async (req, res) => {
  await suppression.removeSuppression(String(req.params.id));
  ok(res, { deleted: true });
});
export const importSuppressions = wrap(async (req, res) =>
  ok(
    res,
    await suppression.importSuppressionRows(req.body.rows ?? [], {
      source: 'import',
      createdBy: req.user!.id,
    }),
    201
  )
);
export const bulkDeleteSuppressions = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'suppression.delete',
      { ids: req.body.ids, filter: req.body.filter },
      {},
      { createdBy: req.user!.id, label: 'Removed suppressions' }
    )
  )
);
const suppressionFilterFromQuery = (req: Request) => ({
  q: req.query.q as string,
  reason: req.query.reason as string,
});
export const exportSuppressions = wrap(async (req, res) => {
  const rows = await suppression.listSuppressions(suppressionFilterFromQuery(req));
  const csv = formatCsv(
    ['email', 'reason', 'source', 'createdAt'],
    rows.map((r) => ({
      email: r.email,
      reason: r.reason ?? '',
      source: r.source ?? '',
      createdAt: r.createdAt.toISOString(),
    }))
  );
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="email-suppressions.csv"');
  res.status(200).send(csv);
});
const unsubscribeFilterFromQuery = (req: Request) => ({
  q: req.query.q as string,
  method: req.query.method as string,
});
export const listUnsubscribes = wrap(async (req, res) =>
  ok(
    res,
    await optin.listUnsubscribes({
      ...unsubscribeFilterFromQuery(req),
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 50),
    })
  )
);
export const exportUnsubscribes = wrap(async (req, res) => {
  const csv = await optin.exportUnsubscribesCsv(unsubscribeFilterFromQuery(req));
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="email-unsubscribes.csv"');
  res.status(200).send(csv);
});
export const bulkResubscribe = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'unsubscribe.resubscribe',
      { ids: req.body.ids, filter: req.body.filter },
      {},
      { createdBy: req.user!.id }
    )
  )
);
export const bulkDeleteUnsubscribes = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'unsubscribe.delete',
      { ids: req.body.ids, filter: req.body.filter },
      {},
      { createdBy: req.user!.id, label: 'Deleted unsubscribe records' }
    )
  )
);

// ── Analytics ────────────────────────────────────────────────────────────────
/** Parse ?from&to into a valid Date range, ignoring unparseable values (no NaN → SQL). */
const range = (req: Request) => {
  const parse = (v: unknown): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return { from: parse(req.query.from), to: parse(req.query.to) };
};
const tzOf = (req: Request): string | undefined =>
  req.query.tz ? String(req.query.tz) : undefined;

export const analyticsOverview = wrap(async (req, res) =>
  ok(res, await analytics.overview(range(req)))
);
export const analyticsTimeseries = wrap(async (req, res) =>
  ok(res, await analytics.timeseries(range(req), tzOf(req)))
);
export const analyticsDeliverability = wrap(async (req, res) =>
  ok(res, await analytics.deliverability(range(req)))
);
export const analyticsHeatmap = wrap(async (req, res) =>
  ok(res, await analytics.openHeatmap(range(req), tzOf(req)))
);
export const analyticsTopLinks = wrap(async (req, res) =>
  ok(res, await analytics.topLinks(range(req), num(req.query.limit, 20)))
);
export const analyticsClients = wrap(async (req, res) =>
  ok(res, await analytics.clientBreakdown(range(req)))
);
export const analyticsDomains = wrap(async (req, res) =>
  ok(res, await analytics.domainBreakdown(range(req), num(req.query.limit, 15)))
);
export const analyticsLeaderboard = wrap(async (req, res) =>
  ok(res, await analytics.engagementLeaderboard(num(req.query.limit, 20)))
);
export const analyticsListGrowth = wrap(async (req, res) =>
  ok(res, await analytics.listGrowth(range(req), tzOf(req)))
);
export const analyticsBounceReasons = wrap(async (req, res) =>
  ok(res, await analytics.bounceReasons(range(req)))
);

// ── Settings ─────────────────────────────────────────────────────────────────
export const getSettings = wrap(async (_req, res) => ok(res, await settings.getEmailSettings()));
export const updateSettings = wrap(async (req, res) =>
  ok(res, await settings.updateEmailSettings(req.body))
);

// ── Inbox (threads) ──────────────────────────────────────────────────────────
export const listThreads = wrap(async (req, res) =>
  ok(
    res,
    await threads.listThreads({
      status: req.query.status as any,
      assignedTo: req.query.assignedTo as string,
      q: req.query.q as string,
      label: req.query.label as string,
      unread: req.query.unread === 'true',
      archived: req.query.archived === 'true',
      snoozed: req.query.snoozed === 'true',
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 30),
    })
  )
);
export const unreadThreadCount = wrap(async (_req, res) =>
  ok(res, { count: await threads.getUnreadThreadCount() })
);
export const getThread = wrap(async (req, res) =>
  ok(res, await threads.getThread(String(req.params.id)))
);
export const markThreadRead = wrap(async (req, res) =>
  ok(res, await threads.markThreadRead(String(req.params.id)))
);
export const assignThread = wrap(async (req, res) =>
  ok(res, await threads.assignThread(String(req.params.id), req.body.userId ?? null))
);
export const setThreadStatus = wrap(async (req, res) =>
  ok(res, await threads.setThreadStatus(String(req.params.id), req.body.status))
);
export const setThreadLabels = wrap(async (req, res) =>
  ok(res, await threads.setThreadLabels(String(req.params.id), req.body.labels))
);
export const snoozeThread = wrap(async (req, res) =>
  ok(
    res,
    await threads.snoozeThread(
      String(req.params.id),
      req.body.until ? new Date(req.body.until) : null
    )
  )
);
export const archiveThread = wrap(async (req, res) =>
  ok(res, await threads.archiveThread(String(req.params.id), req.body.archived !== false))
);
export const bulkThreads = wrap(async (req, res) =>
  ok(
    res,
    await bulk.runBulk(
      'thread.action',
      { ids: req.body.ids, filter: req.body.filter },
      {
        action: req.body.action,
        userId: req.body.userId,
        status: req.body.status,
        until: req.body.until,
        labels: req.body.labels,
      },
      { createdBy: req.user!.id }
    )
  )
);

// ── Bulk jobs (async progress) + undo ─────────────────────────────────────────
export const listBulkJobs = wrap(async (req, res) =>
  ok(res, await bulk.listBulkJobs(num(req.query.limit, 20)))
);
export const getBulkJob = wrap(async (req, res) =>
  ok(res, await bulk.getBulkJob(String(req.params.id)))
);
export const restoreUndo = wrap(async (req, res) =>
  ok(res, await bulk.restoreUndo(String(req.params.id)))
);
export const addThreadNote = wrap(async (req, res) =>
  ok(res, await threads.addNote(String(req.params.id), req.user!.id, req.body.body), 201)
);
export const replyThread = wrap(async (req, res) =>
  ok(res, await threads.sendThreadReply(String(req.params.id), req.user!.id, req.body), 201)
);
export const scheduleThreadReply = wrap(async (req, res) =>
  ok(
    res,
    await threads.scheduleReply({
      threadId: String(req.params.id),
      ...req.body,
      sendAt: new Date(req.body.sendAt),
      createdBy: req.user!.id,
    }),
    201
  )
);
export const cancelScheduledReply = wrap(async (req, res) =>
  ok(res, await threads.cancelScheduledReply(String(req.params.id)))
);
export const listScheduled = wrap(async (_req, res) =>
  ok(res, await threads.listScheduledMessages())
);

// ── Canned replies + rules ───────────────────────────────────────────────────
export const listCanned = wrap(async (_req, res) => ok(res, await threads.listCannedReplies()));
export const createCanned = wrap(async (req, res) =>
  ok(res, await threads.createCannedReply({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateCanned = wrap(async (req, res) =>
  ok(res, await threads.updateCannedReply(String(req.params.id), req.body))
);
export const deleteCanned = wrap(async (req, res) => {
  await threads.deleteCannedReply(String(req.params.id));
  ok(res, { deleted: true });
});
export const listRules = wrap(async (_req, res) => ok(res, await threads.listRules()));
export const createRule = wrap(async (req, res) =>
  ok(res, await threads.createRule({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateRule = wrap(async (req, res) =>
  ok(res, await threads.updateRule(String(req.params.id), req.body))
);
export const deleteRule = wrap(async (req, res) => {
  await threads.deleteRule(String(req.params.id));
  ok(res, { deleted: true });
});

// ── Templates: duplicate / versions / lint / plain-text ──────────────────────
export const duplicateTemplate = wrap(async (req, res) =>
  ok(res, await templates.duplicateTemplate(String(req.params.id), req.user!.id), 201)
);
export const templateVersions = wrap(async (req, res) =>
  ok(res, await templates.listTemplateVersions(String(req.params.id)))
);
export const restoreTemplate = wrap(async (req, res) =>
  ok(
    res,
    await templates.restoreTemplateVersion(
      String(req.params.id),
      Number(req.body.version),
      req.user!.id
    )
  )
);
export const lintTemplateHandler = wrap(async (req, res) =>
  ok(
    res,
    templates.lintTemplate({
      subject: req.body.subject ?? '',
      htmlBody: req.body.htmlBody ?? '',
      textBody: req.body.textBody,
    })
  )
);
export const plainText = wrap(async (req, res) =>
  ok(res, { text: templates.htmlToPlainText(String(req.body.htmlBody || '')) })
);

// ── Snippets (reusable content blocks) ───────────────────────────────────────
export const listSnippets = wrap(async (req, res) =>
  ok(res, await snippets.listSnippets(req.query.category as string))
);
export const createSnippet = wrap(async (req, res) =>
  ok(res, await snippets.createSnippet({ ...req.body, createdBy: req.user!.id }), 201)
);
export const updateSnippet = wrap(async (req, res) =>
  ok(res, await snippets.updateSnippet(String(req.params.id), req.body))
);
export const deleteSnippet = wrap(async (req, res) => {
  await snippets.deleteSnippet(String(req.params.id));
  ok(res, { deleted: true });
});

// ── Asset upload (images) → R2 ───────────────────────────────────────────────
export const uploadAsset = wrap(async (req, res) => {
  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string }
    | undefined;
  if (!file) {
    res
      .status(400)
      .json({ success: false, error: { message: 'No file uploaded', code: 'EMAIL_NO_FILE' } });
    return;
  }
  const ext =
    (file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `email-assets/${crypto.randomUUID()}.${ext}`;
  const { url } = await putBufferToR2(
    file.buffer,
    key,
    file.mimetype || 'application/octet-stream'
  );
  ok(res, { url }, 201);
});

// ── Outbound attachment staging (campaign + reply sends) → R2 ────────────────
export const uploadOutboundAttachment = wrap(async (req, res) => {
  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string }
    | undefined;
  if (!file) {
    res
      .status(400)
      .json({ success: false, error: { message: 'No file uploaded', code: 'EMAIL_NO_FILE' } });
    return;
  }
  ok(res, await attach.stageOutboundAttachment(file.buffer, file.originalname, file.mimetype), 201);
});

// ── Contact detail / GDPR export ─────────────────────────────────────────────
export const contactTimeline = wrap(async (req, res) =>
  ok(res, await contacts.getContactTimeline(String(req.params.id)))
);
export const contactDataExport = wrap(async (req, res) => {
  const data = await contacts.exportContactData(String(req.params.id));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="contact-${req.params.id}.json"`);
  res.status(200).send(JSON.stringify(data, null, 2));
});

// ── Analytics: bounce/complaint drill-down, events feed, comparison, export ───
export const analyticsBounces = wrap(async (req, res) =>
  ok(
    res,
    await analytics.bounceComplaintEvents({
      campaignId: req.query.campaignId as string,
      type: req.query.type as 'BOUNCE' | 'COMPLAINT' | undefined,
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 50),
    })
  )
);
export const analyticsEvents = wrap(async (req, res) =>
  ok(
    res,
    await analytics.listEvents({
      eventType: req.query.eventType as string,
      campaignId: req.query.campaignId as string,
      page: num(req.query.page, 1),
      limit: num(req.query.limit, 100),
    })
  )
);
export const analyticsCompare = wrap(async (req, res) =>
  ok(
    res,
    await analytics.compareCampaigns(
      String(req.query.ids || '')
        .split(',')
        .filter(Boolean)
    )
  )
);
export const analyticsExport = wrap(async (req, res) => {
  const csv = await analytics.overviewCsv(range(req));
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="email-analytics.csv"');
  res.status(200).send(csv);
});

// ── Campaign: stop recurrence / delete ───────────────────────────────────────
export const stopRecurrence = wrap(async (req, res) =>
  ok(res, await campaigns.stopRecurrence(String(req.params.id)))
);
export const deleteCampaign = wrap(async (req, res) => {
  await campaigns.deleteCampaign(String(req.params.id));
  ok(res, { deleted: true });
});
