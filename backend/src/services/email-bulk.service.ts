/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { emitEmail } from '../utils/email-realtime';
import { addBulkActionJob } from '../jobs/email-bulk.queue';
import * as contacts from './email-contact.service';
import * as threads from './email-thread.service';
import * as suppression from './email-suppression.service';
import * as optin from './email-optin.service';
import * as sets from './email-set.service';
import * as templates from './email-template.service';
import * as campaigns from './email-campaign.service';

/**
 * Bulk-action orchestration: sync/async dispatch + undo snapshots.
 *
 * - Ops whose scope can be huge (a whole filter, up to 200k rows) run
 *   synchronously below the threshold and are OFFLOADED to the BullMQ worker
 *   above it (chunked, with live progress on the `EmailBulkJob` row).
 * - Destructive ops that run synchronously first snapshot the affected rows into
 *   `EmailBulkUndo` so an admin can restore them within the TTL. (Async/huge
 *   deletes are not undoable — we don't snapshot 200k rows behind a toast.)
 */

/** Ops targeting more rows than this are pushed to the background worker. */
export const BULK_ASYNC_THRESHOLD = 1000;
/** Safety cap on how many ids a single job resolves. */
const RESOLVE_CAP = 500_000;
/** Rows processed per worker chunk. */
const CHUNK = 500;
/** How long an undo snapshot stays restorable. */
const UNDO_TTL_MS = 15 * 60 * 1000;

export type BulkKind =
  | 'contact.delete'
  | 'contact.tag'
  | 'contact.update'
  | 'thread.action'
  | 'suppression.delete'
  | 'unsubscribe.resubscribe'
  | 'unsubscribe.delete'
  | 'set.delete'
  | 'template.delete'
  | 'template.status'
  | 'template.duplicate'
  | 'campaign.bulk'
  | 'setMember.remove';

export interface BulkScope {
  ids?: string[];
  filter?: Record<string, unknown>;
}

/** Kinds whose scope can be a whole filter (→ eligible for async offload). */
const ASYNC_KINDS = new Set<BulkKind>([
  'contact.delete',
  'contact.tag',
  'contact.update',
  'thread.action',
  'suppression.delete',
  'unsubscribe.resubscribe',
  'unsubscribe.delete',
]);

/** Delete/remove kinds → which undo entity to snapshot before executing. */
const UNDO_ENTITY: Partial<Record<BulkKind, string>> = {
  'contact.delete': 'contact',
  'suppression.delete': 'suppression',
  'unsubscribe.delete': 'unsubscribe',
  'set.delete': 'set',
  'template.delete': 'template',
  'setMember.remove': 'setMember',
};

// ---------------------------------------------------------------------------
// Scope resolution (count + ids) per kind
// ---------------------------------------------------------------------------

function delegateFor(kind: BulkKind): { model: any; where: (f: any) => any } {
  if (kind.startsWith('contact'))
    return { model: prisma.emailContact, where: (f) => contacts.buildContactWhere(f) };
  if (kind === 'thread.action')
    return { model: prisma.emailThread, where: (f) => threads.buildThreadWhere(f) };
  if (kind === 'suppression.delete')
    return { model: prisma.emailSuppression, where: (f) => suppression.buildSuppressionWhere(f) };
  if (kind.startsWith('unsubscribe'))
    return { model: prisma.emailUnsubscribe, where: (f) => optin.buildUnsubscribeWhere(f) };
  // sync-only, id-scoped kinds never hit the filter path
  return { model: prisma.emailContact, where: () => ({}) };
}

async function countScope(kind: BulkKind, scope: BulkScope): Promise<number> {
  if (scope.ids) return scope.ids.length;
  const { model, where } = delegateFor(kind);
  return model.count({ where: where(scope.filter ?? {}) });
}

async function resolveIds(kind: BulkKind, scope: BulkScope): Promise<string[]> {
  if (scope.ids?.length) return [...new Set(scope.ids)];
  if (!scope.filter) return [];
  const { model, where } = delegateFor(kind);
  const rows = await model.findMany({
    where: where(scope.filter),
    select: { id: true },
    take: RESOLVE_CAP,
  });
  return rows.map((r: { id: string }) => r.id);
}

// ---------------------------------------------------------------------------
// Execution — operate on an explicit id array (a chunk, or the whole set)
// ---------------------------------------------------------------------------

async function executeIds(
  kind: BulkKind,
  ids: string[],
  payload: any,
  createdBy?: string | null
): Promise<number> {
  if (!ids.length) return 0;
  switch (kind) {
    case 'contact.delete':
      return (await contacts.bulkDeleteContacts({ contactIds: ids })).deleted;
    case 'contact.tag':
      return (
        await contacts.bulkTag({
          contactIds: ids,
          addTags: payload.addTags,
          removeTags: payload.removeTags,
        })
      ).updated;
    case 'contact.update':
      return (
        await contacts.bulkUpdateContacts({
          contactIds: ids,
          subscribeStatus: payload.subscribeStatus,
          isBlocked: payload.isBlocked,
        })
      ).updated;
    case 'thread.action':
      return (
        await threads.bulkThreads({ ids }, payload.action, {
          userId: payload.userId,
          status: payload.status,
          until: payload.until ? new Date(payload.until) : null,
          labels: payload.labels,
        })
      ).affected;
    case 'suppression.delete':
      return (await suppression.bulkRemoveSuppressions({ ids })).deleted;
    case 'unsubscribe.resubscribe':
      return (await optin.bulkResubscribe({ ids })).resubscribed;
    case 'unsubscribe.delete':
      return (await optin.bulkDeleteUnsubscribes({ ids })).deleted;
    case 'set.delete':
      return (await sets.deleteSets(ids)).deleted;
    case 'template.delete':
      return (await templates.bulkDeleteTemplates(ids)).deleted;
    case 'template.status':
      return (await templates.bulkUpdateTemplateStatus(ids, payload.status)).updated;
    case 'template.duplicate':
      return (await templates.bulkDuplicateTemplates(ids, createdBy)).created;
    case 'campaign.bulk':
      return (await campaigns.bulkCampaigns(ids, payload.action)).affected;
    case 'setMember.remove':
      return (await sets.removeMembers(payload.setId, ids)).removed;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Undo snapshots
// ---------------------------------------------------------------------------

interface SnapshotTable {
  model: string;
  rows: any[];
}

/** Capture the rows a destructive op is about to remove (parent-first order). */
async function captureSnapshot(
  entity: string,
  ids: string[],
  opts: { setId?: string } = {}
): Promise<SnapshotTable[]> {
  const inIds = { in: ids };
  switch (entity) {
    case 'contact':
      return [
        {
          model: 'emailContact',
          rows: await prisma.emailContact.findMany({ where: { id: inIds } }),
        },
        {
          model: 'emailContactSetMember',
          rows: await prisma.emailContactSetMember.findMany({ where: { contactId: inIds } }),
        },
      ];
    case 'suppression':
      return [
        {
          model: 'emailSuppression',
          rows: await prisma.emailSuppression.findMany({ where: { id: inIds } }),
        },
      ];
    case 'unsubscribe':
      return [
        {
          model: 'emailUnsubscribe',
          rows: await prisma.emailUnsubscribe.findMany({ where: { id: inIds } }),
        },
      ];
    case 'set':
      return [
        {
          model: 'emailContactSet',
          rows: await prisma.emailContactSet.findMany({ where: { id: inIds } }),
        },
        {
          model: 'emailContactSetMember',
          rows: await prisma.emailContactSetMember.findMany({ where: { setId: inIds } }),
        },
      ];
    case 'template':
      return [
        {
          model: 'emailTemplate',
          rows: await prisma.emailTemplate.findMany({ where: { id: inIds } }),
        },
        {
          model: 'emailTemplateVersion',
          rows: await prisma.emailTemplateVersion.findMany({ where: { templateId: inIds } }),
        },
      ];
    case 'campaign':
      return [
        {
          model: 'emailCampaign',
          rows: await prisma.emailCampaign.findMany({ where: { id: inIds } }),
        },
        {
          model: 'emailCampaignVariant',
          rows: await prisma.emailCampaignVariant.findMany({ where: { campaignId: inIds } }),
        },
        {
          model: 'emailCampaignStep',
          rows: await prisma.emailCampaignStep.findMany({ where: { campaignId: inIds } }),
        },
      ];
    case 'setMember':
      return [
        {
          model: 'emailContactSetMember',
          rows: await prisma.emailContactSetMember.findMany({
            where: { setId: opts.setId, contactId: inIds },
          }),
        },
      ];
  }
  return [];
}

function stripNulls(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export async function createUndoSnapshot(
  entity: string,
  ids: string[],
  label: string | null,
  createdBy?: string | null,
  opts: { setId?: string } = {}
): Promise<string | null> {
  if (!ids.length) return null;
  const tables = await captureSnapshot(entity, ids, opts);
  if (!tables[0]?.rows.length) return null;
  const undo = await prisma.emailBulkUndo.create({
    data: {
      entity,
      action: entity === 'setMember' ? 'remove' : 'delete',
      label,
      count: tables[0].rows.length,
      snapshot: { tables } as any,
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
      createdBy: createdBy ?? null,
    },
  });
  return undo.id;
}

/** Restore a snapshot (re-create the removed rows, parent tables first). */
export async function restoreUndo(id: string): Promise<{ restored: number }> {
  const undo = await prisma.emailBulkUndo.findUnique({ where: { id } });
  if (!undo) throw new AppError('Undo snapshot not found', 404, 'EMAIL_UNDO_NOT_FOUND');
  if (undo.restoredAt) throw new AppError('Already restored', 409, 'EMAIL_UNDO_DONE');
  if (undo.expiresAt < new Date())
    throw new AppError('The undo window has expired', 410, 'EMAIL_UNDO_EXPIRED');
  const tables = ((undo.snapshot as any)?.tables ?? []) as SnapshotTable[];
  let restored = 0;
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (!t.rows.length) continue;
    const delegate = (prisma as any)[t.model];
    const res = await delegate.createMany({ data: t.rows.map(stripNulls), skipDuplicates: true });
    if (i === 0) restored = res.count;
  }
  await prisma.emailBulkUndo.update({ where: { id }, data: { restoredAt: new Date() } });
  return { restored };
}

/** Cron sweep — drop expired undo snapshots. */
export async function sweepExpiredUndos(): Promise<number> {
  const res = await prisma.emailBulkUndo.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}

// ---------------------------------------------------------------------------
// Dispatch — the single entry point every bulk controller calls
// ---------------------------------------------------------------------------

export interface BulkResult {
  async: boolean;
  jobId?: string;
  total?: number;
  affected?: number;
  undoToken?: string | null;
}

export async function runBulk(
  kind: BulkKind,
  scope: BulkScope,
  payload: any = {},
  ctx: { createdBy?: string | null; label?: string | null } = {}
): Promise<BulkResult> {
  const count = await countScope(kind, scope);

  // Offload huge filter-scoped ops to the worker (no undo — see file header).
  if (ASYNC_KINDS.has(kind) && count > BULK_ASYNC_THRESHOLD) {
    const job = await prisma.emailBulkJob.create({
      data: {
        kind,
        total: count,
        input: { scope, payload } as any,
        createdBy: ctx.createdBy ?? null,
      },
    });
    await addBulkActionJob(job.id);
    return { async: true, jobId: job.id, total: count };
  }

  // Synchronous path.
  const ids = await resolveIds(kind, scope);
  let undoEntity = UNDO_ENTITY[kind];
  if (kind === 'campaign.bulk' && payload.action === 'delete') undoEntity = 'campaign';

  let undoToken: string | null = null;
  if (undoEntity && ids.length) {
    undoToken = await createUndoSnapshot(undoEntity, ids, ctx.label ?? null, ctx.createdBy, {
      setId: payload.setId,
    });
  }

  const affected = await executeIds(kind, ids, payload, ctx.createdBy);
  return { async: false, affected, undoToken };
}

// ---------------------------------------------------------------------------
// Worker entry + progress reads
// ---------------------------------------------------------------------------

/** Process one enqueued bulk job — chunked, with live progress writes. */
export async function processBulkJob(jobId: string): Promise<void> {
  const job = await prisma.emailBulkJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'COMPLETED') return;
  const input = (job.input as any) ?? {};
  const scope: BulkScope = input.scope ?? {};
  const payload = input.payload ?? {};

  await prisma.emailBulkJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
  try {
    const ids = await resolveIds(job.kind as BulkKind, scope);
    await prisma.emailBulkJob.update({ where: { id: jobId }, data: { total: ids.length } });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        succeeded += await executeIds(job.kind as BulkKind, chunk, payload, job.createdBy);
      } catch {
        failed += chunk.length;
      }
      processed += chunk.length;
      await prisma.emailBulkJob.update({
        where: { id: jobId },
        data: { processed, succeeded, failed },
      });
      emitEmail('email:bulk:progress', {
        id: jobId,
        kind: job.kind,
        status: 'RUNNING',
        total: ids.length,
        processed,
        succeeded,
        failed,
      });
    }

    await prisma.emailBulkJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', result: { summary: { succeeded, failed } } as any },
    });
    emitEmail('email:bulk:progress', {
      id: jobId,
      kind: job.kind,
      status: 'COMPLETED',
      total: ids.length,
      processed,
      succeeded,
      failed,
    });
  } catch (e) {
    const error = (e as Error).message;
    await prisma.emailBulkJob.update({ where: { id: jobId }, data: { status: 'FAILED', error } });
    emitEmail('email:bulk:progress', { id: jobId, kind: job.kind, status: 'FAILED', error });
  }
}

export async function getBulkJob(id: string) {
  const job = await prisma.emailBulkJob.findUnique({ where: { id } });
  if (!job) throw new AppError('Bulk job not found', 404, 'EMAIL_BULK_JOB_NOT_FOUND');
  return job;
}

export async function listBulkJobs(limit = 20) {
  return prisma.emailBulkJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, limit),
  });
}
