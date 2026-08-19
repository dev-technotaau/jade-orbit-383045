import { randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import { templateComponentsSchema } from '../schemas/whatsapp-template-components';
import { graphVersion } from './whatsapp.service';
import { fetchNodeHealthStatus, type WaHealthStatus } from './whatsapp-channel.service';
import { oneLineParam } from '../utils/whatsapp-template-params';
import type {
  Prisma,
  WaTemplateCategory,
  WaTemplateStatus,
  WaTemplateQuality,
} from '@prisma/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GRAPH = 'https://graph.facebook.com';

function metaConfig(): { wabaId: string; token: string } {
  const wabaId = env.META_WHATSAPP_WABA_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!wabaId || !token) {
    throw new AppError(
      'WhatsApp is not configured (WABA id / access token missing)',
      400,
      'WA_NOT_CONFIGURED'
    );
  }
  return { wabaId, token };
}

function mapCategory(c?: string): WaTemplateCategory {
  const up = (c ?? '').toUpperCase();
  return (
    ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(up) ? up : 'UTILITY'
  ) as WaTemplateCategory;
}
/**
 * Every Meta template status we know how to represent — including the spellings
 * that only ever arrive on the webhook (FLAGGED) and the ones that only ever
 * arrive on the sync (PENDING_DELETION).
 *
 * The webhook worker used to keep its own separate table with different
 * membership, so the two paths disagreed about the same template: a FLAGGED
 * template landed PAUSED via the webhook and was mapped straight back to PENDING
 * by the next cron sync, and the badge flapped between the two every time the
 * cron ran.
 */
const TEMPLATE_STATUS_MAP: Record<string, WaTemplateStatus> = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  IN_APPEAL: 'IN_APPEAL',
  // Meta spellings with no enum value of their own.
  FLAGGED: 'PAUSED',
  PENDING_DELETION: 'DISABLED',
  DELETED: 'DISABLED',
  ARCHIVED: 'DISABLED',
  LIMIT_EXCEEDED: 'DISABLED',
};

/**
 * Meta template status -> our enum. Shared with the webhook worker so one
 * template cannot hold two different statuses depending on which path last
 * touched it.
 *
 * Returns null for anything unrecognised rather than guessing. The guess used to
 * be PENDING, which the console renders as "awaiting review" — so a status Meta
 * adds tomorrow for a template that can no longer be SENT would have shown up as
 * one that is about to become sendable, and the operator would have kept it in
 * campaigns until every recipient failed.
 */
export function mapTemplateStatus(raw?: string | null): WaTemplateStatus | null {
  const up = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!up) return null;
  const mapped = TEMPLATE_STATUS_MAP[up];
  if (mapped) return mapped;
  logger.warn(`WhatsApp: unrecognised Meta template status "${up}" — treating it as unusable`);
  return null;
}

/**
 * Meta returns the literal string 'NONE' — not null — as the rejection reason of
 * a template that was never rejected, and the sync stored it verbatim. Every
 * approved template therefore carried `rejectionReason: 'NONE'`, so anything
 * reading the column had to know that one magic string means "no reason".
 */
function normalizeRejectionReason(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.toUpperCase() === 'NONE') return null;
  return value;
}

/**
 * The example values Meta stores on a template's components, in the same shape
 * the builder collects them into `variableSample`.
 *
 * Templates pulled by the sync carried no variableSample at all, so the column
 * was populated for locally-authored templates and empty for every other one —
 * which is worse than having nothing, because a reader cannot tell "this
 * template has no examples" from "this template was authored somewhere else".
 */
function extractVariableSample(components: unknown): Prisma.InputJsonValue | undefined {
  const cs: any[] = Array.isArray(components) ? components : [];
  const out: Record<string, unknown> = {};
  for (const c of cs) {
    const type = String(c?.type ?? '').toUpperCase();
    const example = c?.example;
    if (!example || typeof example !== 'object') continue;
    if (type === 'HEADER') {
      if (Array.isArray(example.header_text)) out.header_text = example.header_text;
      if (Array.isArray(example.header_handle)) out.header_handle = example.header_handle;
    } else if (type === 'BODY') {
      if (Array.isArray(example.body_text)) out.body_text = example.body_text;
      if (Array.isArray(example.body_text_named_params)) {
        out.body_text_named_params = example.body_text_named_params;
      }
    }
  }
  return Object.keys(out).length ? (out as Prisma.InputJsonValue) : undefined;
}
function mapQuality(q?: string): WaTemplateQuality {
  const up = (q ?? '').toUpperCase();
  return (['GREEN', 'YELLOW', 'RED'].includes(up) ? up : 'UNKNOWN') as WaTemplateQuality;
}

export async function listTemplates(filters: {
  status?: WaTemplateStatus;
  category?: WaTemplateCategory;
  q?: string;
  page?: number;
  limit?: number;
}) {
  // `|| 1` catches the same NaN a non-numeric `?page=abc` used to hand Prisma as
  // `skip: NaN`, which failed the whole request.
  const page = Math.max(1, Math.trunc(Number(filters.page ?? 1)) || 1);
  /**
   * The ceiling used to be 100 — which was also exactly what every template
   * picker asked for, so a WABA with more than 100 approved templates silently
   * hid the rest from every send, campaign, sequence and keyword-rule picker.
   * The pickers now search server-side with a small page; this headroom is for
   * the few surfaces that still render the whole list at once.
   *
   * Clamped low as well: `?limit=abc` reached Prisma as `take: NaN` and failed
   * the request, and `?limit=0` returned an empty page with Infinity total pages.
   */
  const requested = Math.trunc(Number(filters.limit ?? 50));
  const limit = Number.isFinite(requested) ? Math.min(500, Math.max(1, requested)) : 50;
  const where: Prisma.WaTemplateWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.waTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waTemplate.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getTemplate(id: string) {
  return prisma.waTemplate.findUnique({ where: { id } });
}

export async function getTemplateByName(name: string, language: string) {
  return prisma.waTemplate.findUnique({ where: { name_language: { name, language } } });
}

/**
 * Per-template performance, computed from our own outbound message records.
 *
 * Two things were wrong with the unfiltered version. It matched on template NAME
 * alone, so a template approved in several languages reported one blended
 * delivery rate — exactly the comparison this page exists to make. And it counted
 * every message ever sent, so a template whose quality has collapsed this week
 * still showed a healthy lifetime average and looked fine.
 *
 * `templateLanguage` was only written from the day that column started being
 * populated, so older rows carry NULL. They are matched too rather than dropped:
 * silently losing all pre-existing history would be a worse lie than including it.
 */
export async function getTemplateAnalytics(id: string, opts: { days?: number } = {}) {
  const tpl = await prisma.waTemplate.findUnique({ where: { id } });
  if (!tpl) return null;
  const days =
    opts.days && Number.isFinite(opts.days) ? Math.min(Math.max(opts.days, 1), 365) : null;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const base = {
    templateName: tpl.name,
    type: 'TEMPLATE' as const,
    direction: 'OUTBOUND' as const,
    OR: [{ templateLanguage: tpl.language }, { templateLanguage: null }],
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const [sent, delivered, read, failed] = await Promise.all([
    prisma.waMessage.count({ where: { ...base, status: { in: ['SENT', 'DELIVERED', 'READ'] } } }),
    prisma.waMessage.count({ where: { ...base, status: { in: ['DELIVERED', 'READ'] } } }),
    prisma.waMessage.count({ where: { ...base, status: 'READ' } }),
    prisma.waMessage.count({ where: { ...base, status: 'FAILED' } }),
  ]);
  const denom = sent || 1;
  return {
    template: {
      id: tpl.id,
      name: tpl.name,
      language: tpl.language,
      category: tpl.category,
      status: tpl.status,
      quality: tpl.quality,
      rejectionReason: tpl.rejectionReason,
    },
    sent,
    delivered,
    read,
    failed,
    deliveryRate: Math.round((delivered / denom) * 100),
    readRate: Math.round((read / denom) * 100),
    /** null = all time. Echoed back so the UI can label what it is showing. */
    days,
    language: tpl.language,
  };
}

/** Per-page timeout for the Graph list call (matches the send path's budget). */
const SYNC_PAGE_TIMEOUT_MS = 15_000;

/**
 * Pull the WABA's templates from Meta and upsert them (status/quality/components),
 * then reconcile anything that no longer exists there.
 *
 * @returns how many templates were upserted, and how many local rows were
 *          disabled because Meta no longer lists them.
 */
export async function syncFromMeta(): Promise<{ synced: number; missing: number }> {
  const { wabaId, token } = metaConfig();
  let url: string | undefined =
    `${GRAPH}/${graphVersion()}/${wabaId}/message_templates?limit=100&fields=name,language,category,status,quality_score,components,id,rejected_reason`;
  let synced = 0;
  // Taken BEFORE the first page: any row whose lastSyncedAt is still older than
  // this once the walk completes was not returned by Meta.
  const runStart = new Date();

  while (url) {
    // The Graph call had no timeout at all, so a hung connection held the whole
    // sync open until the global 30s request timeout killed it — mid-pagination,
    // with half the catalogue updated and the operator told only "Sync failed".
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_PAGE_TIMEOUT_MS);
    const pageUrl = url;
    const res = await (async () => {
      try {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        return await fetch(pageUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch (e) {
        throw new AppError(
          (e as Error).name === 'AbortError'
            ? `Meta did not respond within ${SYNC_PAGE_TIMEOUT_MS / 1000}s — template sync aborted`
            : `Meta template list failed: ${(e as Error).message}`,
          504,
          'WA_META_TIMEOUT'
        );
      } finally {
        clearTimeout(timer);
      }
    })();
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(
        data?.error?.message ?? `Meta template list failed (${res.status})`,
        502,
        'WA_META_ERROR'
      );
    }
    // One page at a time rather than one row at a time: 100 sequential upserts
    // per page turned a routine sync into hundreds of serial round trips.
    await Promise.all(
      (data.data ?? []).map((t: any) =>
        prisma.waTemplate.upsert({
          where: { name_language: { name: t.name, language: t.language } },
          update: {
            metaId: t.id,
            category: mapCategory(t.category),
            // An unrecognised status falls back to DISABLED, not PENDING: a
            // template we cannot interpret must not be offered for sending.
            status: mapTemplateStatus(t.status) ?? 'DISABLED',
            quality: mapQuality(t.quality_score?.score),
            components: t.components ?? [],
            rejectionReason: normalizeRejectionReason(t.rejected_reason),
            // undefined leaves a locally-authored sample alone when Meta returns
            // none of its own.
            variableSample: extractVariableSample(t.components),
            lastSyncedAt: new Date(),
          },
          create: {
            metaId: t.id,
            name: t.name,
            language: t.language,
            category: mapCategory(t.category),
            status: mapTemplateStatus(t.status) ?? 'DISABLED',
            quality: mapQuality(t.quality_score?.score),
            components: t.components ?? [],
            rejectionReason: normalizeRejectionReason(t.rejected_reason),
            variableSample: extractVariableSample(t.components),
            lastSyncedAt: new Date(),
          },
        })
      )
    );
    synced += (data.data ?? []).length;
    url = data.paging?.next || undefined;
  }

  // RECONCILE. The sync only ever added and updated, so a template deleted at
  // Meta kept its local APPROVED row forever — it stayed selectable in every
  // picker and in the campaign wizard, and the failure only surfaced as a
  // per-recipient (#132001) once a whole campaign had been launched against it.
  //
  // Guarded on `synced > 0`: an empty or permission-denied response must never be
  // read as "Meta has no templates" and disable the entire catalogue.
  let missing = 0;
  if (synced > 0) {
    const res = await prisma.waTemplate.updateMany({
      where: {
        metaId: { not: null },
        lastSyncedAt: { lt: runStart },
        status: { not: 'DISABLED' },
      },
      data: {
        status: 'DISABLED',
        rejectionReason: 'No longer present at Meta',
        lastSyncedAt: runStart,
      },
    });
    missing = res.count;
  }

  return { synced, missing };
}

/**
 * Edit an existing template and resubmit it to Meta.
 *
 * Meta allows editing a template that is APPROVED, REJECTED or PAUSED (name and
 * language are immutable; category and components are not). Without this, a
 * REJECTED template was a permanent dead end — the name is taken forever, so the
 * operator could not even recreate it under the same name, and there was no way
 * to act on the rejection reason the sync already stores.
 *
 * Editing returns the template to PENDING: Meta re-reviews every change.
 */
export async function editTemplate(
  id: string,
  input: {
    category?: WaTemplateCategory;
    components: any[];
    variableSample?: any;
    parameterFormat?: 'POSITIONAL' | 'NAMED';
    messageSendTtlSeconds?: number;
  }
) {
  const existing = await prisma.waTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  if (!existing.metaId) {
    throw new AppError(
      'This template has never reached Meta, so there is nothing to edit. Re-create it instead.',
      409,
      'WA_TEMPLATE_NOT_SUBMITTED'
    );
  }

  const { token } = metaConfig();
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${existing.metaId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(input.category ? { category: input.category } : {}),
      components: input.components,
      ...(input.parameterFormat ? { parameter_format: input.parameterFormat } : {}),
      ...(input.messageSendTtlSeconds !== undefined
        ? { message_send_ttl_seconds: input.messageSendTtlSeconds }
        : {}),
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data?.error?.error_user_msg ?? data?.error?.message ?? 'Template edit failed',
      400,
      'WA_TEMPLATE_EDIT_FAILED'
    );
  }

  return prisma.waTemplate.update({
    where: { id },
    data: {
      ...(input.category ? { category: input.category } : {}),
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      // Meta re-reviews an edited template, so the local status must go back to
      // PENDING rather than keep a stale APPROVED that would let it be sent.
      status: 'PENDING',
      rejectionReason: null,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Re-read ONE template from Meta and write its status back.
 *
 * The only way to re-check a template used to be `syncFromMeta`, which walks the
 * entire WABA a page at a time. After submitting a template — the one moment an
 * operator actually wants an answer — that meant either waiting up to six hours
 * for the cron or re-pulling the whole catalogue (hundreds of upserts, and a
 * 504 if any page hangs) to learn whether a single row had been approved.
 *
 * Reuses the sync's field list, mapping helpers and timeout budget, so a
 * refreshed row is indistinguishable from a synced one — two paths that disagree
 * about the same template is exactly the bug the shared `mapTemplateStatus`
 * exists to prevent.
 */
export async function refreshTemplateFromMeta(id: string) {
  const existing = await prisma.waTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  if (!existing.metaId) {
    throw new AppError(
      'This template has never been submitted to Meta, so there is no status to refresh.',
      409,
      'WA_TEMPLATE_NOT_SUBMITTED'
    );
  }

  const { token } = metaConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_PAGE_TIMEOUT_MS);
  const url =
    `${GRAPH}/${graphVersion()}/${existing.metaId}` +
    `?fields=name,language,category,status,quality_score,components,rejected_reason`;
  const res = await (async () => {
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch (e) {
      throw new AppError(
        (e as Error).name === 'AbortError'
          ? `Meta did not respond within ${SYNC_PAGE_TIMEOUT_MS / 1000}s — template refresh aborted`
          : `Meta template read failed: ${(e as Error).message}`,
        504,
        'WA_META_TIMEOUT'
      );
    } finally {
      clearTimeout(timer);
    }
  })();
  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Gone at Meta. The full sync reconciles this case by disabling the row, and
    // a per-template refresh that threw instead would leave the console offering
    // a template every send against it will fail with (#132001).
    if (res.status === 404) {
      return prisma.waTemplate.update({
        where: { id },
        data: {
          status: 'DISABLED',
          rejectionReason: 'No longer present at Meta',
          lastSyncedAt: new Date(),
        },
      });
    }
    throw new AppError(
      data?.error?.error_user_msg ??
        data?.error?.message ??
        `Meta template read failed (${res.status})`,
      502,
      'WA_META_ERROR'
    );
  }

  return prisma.waTemplate.update({
    where: { id },
    data: {
      category: mapCategory(data.category),
      // Same rule as the sync: a status we cannot interpret means the template
      // changed under us, so it must not stay sendable.
      status: mapTemplateStatus(data.status) ?? 'DISABLED',
      quality: mapQuality(data.quality_score?.score),
      // Only overwrite the stored components when Meta actually returned some —
      // a partial response must not blank a template's content.
      ...(Array.isArray(data.components)
        ? {
            components: data.components,
            // undefined leaves a locally-authored sample alone.
            variableSample: extractVariableSample(data.components),
          }
        : {}),
      rejectionReason: normalizeRejectionReason(data.rejected_reason),
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Meta's own send eligibility for one template — the other half of the campaign
 * pre-flight.
 *
 * A template can sit at APPROVED here and still be refused: Meta pauses a
 * template whose quality has collapsed, and the only sign of it used to be the
 * campaign's recipients failing one at a time. Answers `available: false` rather
 * than throwing for a template that was never submitted, or when Graph refuses —
 * an unanswerable check must not fail the launch screen.
 */
export async function getTemplateHealthStatus(id: string): Promise<WaHealthStatus> {
  const tpl = await prisma.waTemplate.findUnique({ where: { id } });
  if (!tpl?.metaId) {
    return {
      available: false,
      canSend: null,
      entities: [],
      checkedAt: null,
      error: 'Template has never been submitted to Meta',
    };
  }
  const { token } = metaConfig();
  return fetchNodeHealthStatus(tpl.metaId, token);
}

/**
 * Delete a template at Meta AND locally.
 *
 * There was no delete at all, which is worse than it sounds: a template name is
 * claimed permanently at Meta, so a typo'd or obsolete template sat in every
 * picker forever with no way to clear it. Deleting only locally would be worse
 * still — the name would stay taken at Meta while disappearing from the console.
 *
 * References are checked first because every one of them is now a hard FK: a raw
 * delete throws an opaque P2003 rather than telling the operator which campaign,
 * variant, step, blueprint or rule is holding it.
 */
export async function deleteTemplate(id: string) {
  const tpl = await prisma.waTemplate.findUnique({ where: { id } });
  if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');

  const [campaigns, rules, steps, scheduled, variants, blueprints] = await Promise.all([
    prisma.waCampaign.count({ where: { templateId: id } }),
    prisma.waKeywordRule.count({ where: { replyTemplateId: id } }),
    prisma.waCampaignStep.count({ where: { templateId: id } }),
    prisma.waScheduledMessage.count({ where: { templateId: id, status: 'PENDING' } }),
    // A/B variants and saved blueprints were both missed. Deleting a template
    // referenced ONLY by a variant left the campaign to fail recipient by
    // recipient at send time with WA_TEMPLATE_NOT_FOUND — hours after launch,
    // per person — instead of refusing here; a blueprint referencing it simply
    // could never create a campaign again.
    prisma.waCampaignVariant.count({ where: { templateId: id } }),
    prisma.waCampaignTemplate.count({ where: { templateId: id } }),
  ]);
  const blockers: string[] = [];
  if (campaigns) blockers.push(`${campaigns} campaign(s)`);
  if (rules) blockers.push(`${rules} keyword rule(s)`);
  if (steps) blockers.push(`${steps} drip step(s)`);
  if (variants) blockers.push(`${variants} A/B variant(s)`);
  if (blueprints) blockers.push(`${blueprints} saved campaign blueprint(s)`);
  if (scheduled) blockers.push(`${scheduled} scheduled message(s)`);
  if (blockers.length) {
    throw new AppError(
      `This template is still used by ${blockers.join(', ')}. Remove those first.`,
      409,
      'WA_TEMPLATE_IN_USE'
    );
  }

  if (tpl.metaId) {
    const { token, wabaId } = metaConfig();
    const url =
      `${GRAPH}/${graphVersion()}/${wabaId}/message_templates` +
      `?hsm_id=${encodeURIComponent(tpl.metaId)}&name=${encodeURIComponent(tpl.name)}`;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    // A 404 means it is already gone at Meta; that must still clear the local
    // row, or the console keeps showing a template nobody can ever remove.
    if (!res.ok && res.status !== 404) {
      throw new AppError(
        data?.error?.error_user_msg ?? data?.error?.message ?? 'Template delete failed',
        400,
        'WA_TEMPLATE_DELETE_FAILED'
      );
    }
  }

  await prisma.waTemplate.delete({ where: { id } });
  return { deleted: true, name: tpl.name, language: tpl.language };
}

/** Create + submit a template to Meta, persisting the resulting status. */
export async function createTemplate(input: {
  name: string;
  language: string;
  category: WaTemplateCategory;
  components: any[];
  variableSample?: any;
  /**
   * NAMED for a body written with {{customer_name}} placeholders. Meta rejects
   * such a template outright when the field is absent, so named templates could
   * only ever be authored outside this console.
   */
  parameterFormat?: 'POSITIONAL' | 'NAMED';
  /**
   * Meta's delivery deadline for messages sent from this template. Without one,
   * an OTP queued behind a rate limit is still delivered after the code has
   * expired — the customer gets a code that no longer works.
   */
  messageSendTtlSeconds?: number;
  createdBy: string;
}) {
  const { wabaId, token } = metaConfig();
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: input.components,
      ...(input.parameterFormat ? { parameter_format: input.parameterFormat } : {}),
      ...(input.messageSendTtlSeconds !== undefined
        ? { message_send_ttl_seconds: input.messageSendTtlSeconds }
        : {}),
      // Without this Meta REJECTS a template whose content it classifies
      // differently from the category we asked for, instead of accepting it under
      // the right one. Operators mislabel MARKETING/UTILITY constantly, and the
      // rejection reason ("category mismatch") is not something the wizard can
      // act on — so the template simply died and its name stayed claimed.
      allow_category_change: true,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data?.error?.error_user_msg ?? data?.error?.message ?? 'Template creation failed',
      400,
      'WA_TEMPLATE_CREATE_FAILED'
    );
  }
  // Persist the category META assigned, not the one we asked for. Category drives
  // both the price we quote and the consent rule the send path enforces, so
  // storing our own guess after Meta overrode it meant a template Meta had
  // classified MARKETING was sent as UTILITY — to contacts who never opted in.
  const finalCategory = data?.category ? mapCategory(data.category) : input.category;
  return prisma.waTemplate.upsert({
    where: { name_language: { name: input.name, language: input.language } },
    update: {
      metaId: data.id,
      category: finalCategory,
      // A just-submitted template that Meta describes with a status we do not
      // recognise is still awaiting review, so PENDING is the right fallback
      // here — unlike the sync, where an unknown status means the template
      // changed under us.
      status: mapTemplateStatus(data.status) ?? 'PENDING',
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      createdBy: input.createdBy,
      lastSyncedAt: new Date(),
    },
    create: {
      metaId: data.id,
      name: input.name,
      language: input.language,
      category: finalCategory,
      // A just-submitted template that Meta describes with a status we do not
      // recognise is still awaiting review, so PENDING is the right fallback
      // here — unlike the sync, where an unknown status means the template
      // changed under us.
      status: mapTemplateStatus(data.status) ?? 'PENDING',
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      createdBy: input.createdBy,
    },
  });
}

/**
 * The placeholder style a body actually uses, for a submission that did not say.
 *
 * Meta rejects a {{word}} body submitted as POSITIONAL and a {{1}} body
 * submitted as NAMED, and neither rejection names the mismatch — so a draft is
 * never submitted without one.
 */
function inferParameterFormat(components: unknown): 'POSITIONAL' | 'NAMED' | undefined {
  const cs: any[] = Array.isArray(components) ? components : [];
  const body = cs.find((c) => String(c?.type ?? '').toUpperCase() === 'BODY');
  const text = typeof body?.text === 'string' ? body.text : '';
  const vars = [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
  if (!vars.length) return undefined;
  return vars.some((v) => !/^\d+$/.test(v)) ? 'NAMED' : 'POSITIONAL';
}

/**
 * Save a half-finished template LOCALLY, without submitting it to Meta.
 *
 * `WaTemplateStatus.LOCAL` was the column default and nothing ever wrote it:
 * every create path went to Meta first. So closing the builder threw the whole
 * thing away — including the uploaded header sample, whose handle had to be
 * re-uploaded from the original file the operator may no longer have.
 *
 * Deliberately does NOT structurally validate the components: a draft is
 * half-finished by definition. `submitDraftTemplate` applies the full rules at
 * the point the submission is actually spent.
 */
export async function saveDraftTemplate(input: {
  name: string;
  language: string;
  category: WaTemplateCategory;
  components: any[];
  variableSample?: any;
  createdBy: string;
}) {
  const existing = await prisma.waTemplate.findUnique({
    where: { name_language: { name: input.name, language: input.language } },
  });
  // A row that already reached Meta owns that name there permanently. Saving a
  // draft over it would leave the console describing a template whose approved
  // content at Meta is something else entirely.
  if (existing?.metaId) {
    throw new AppError(
      'A template with this name and language already exists at Meta — edit that one instead of saving a draft over it.',
      409,
      'WA_TEMPLATE_EXISTS'
    );
  }
  return prisma.waTemplate.upsert({
    where: { name_language: { name: input.name, language: input.language } },
    update: {
      category: input.category,
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      status: 'LOCAL',
      rejectionReason: null,
    },
    create: {
      name: input.name,
      language: input.language,
      category: input.category,
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      status: 'LOCAL',
      createdBy: input.createdBy,
    },
  });
}

/**
 * Submit a saved draft to Meta, reusing the ordinary create path.
 *
 * The full structural rules are applied HERE rather than at save time, because
 * this is the call that spends the template name: Meta claims it permanently the
 * moment it accepts a submission, and a rejected template cannot be recreated
 * under the same name.
 *
 * A delivery deadline (`message_send_ttl_seconds`) is not carried: there is no
 * column for it on a draft row. Submitting from the builder still sets one; a
 * draft submitted straight from the list uses Meta's default.
 */
export async function submitDraftTemplate(id: string, input: { createdBy: string }) {
  const draft = await prisma.waTemplate.findUnique({ where: { id } });
  if (!draft) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  if (draft.metaId) {
    throw new AppError(
      'This template has already been submitted to Meta. Use edit to resubmit it.',
      409,
      'WA_TEMPLATE_ALREADY_SUBMITTED'
    );
  }
  const parsed = templateComponentsSchema.safeParse(draft.components);
  if (!parsed.success) {
    throw new AppError(
      `This draft is not ready to submit: ${parsed.error.issues
        .map((i) => (i.path.length ? `${i.path.join('.')} — ${i.message}` : i.message))
        .join('; ')}`,
      400,
      'WA_TEMPLATE_INVALID'
    );
  }
  const components = parsed.data as any[];
  return createTemplate({
    name: draft.name,
    language: draft.language,
    category: draft.category,
    components,
    variableSample: draft.variableSample ?? undefined,
    parameterFormat: inferParameterFormat(components),
    createdBy: input.createdBy,
  });
}

/** Per-call timeout for the library browse — same budget as a sync page. */
const LIBRARY_TIMEOUT_MS = 15_000;

/**
 * Language the catalogue is browsed in when the caller does not pick one.
 *
 * Meta stores every TRANSLATION of every library template as its own row — on
 * the order of 180 templates x 65 languages — so an unfiltered browse burns the
 * whole first page on one template's translations and reads as "the library
 * only contains account_creation_confirmation_3". Pinning a language yields one
 * row per template, which is what the picker is for; the language to CREATE in
 * is a separate choice made on the selected entry.
 */
const DEFAULT_LIBRARY_LANGUAGE = 'en_US';

/**
 * Page budget for the browse. One language is ~180 entries (two pages at
 * Meta's max page size of 100); the cap only exists so a paging bug upstream
 * cannot spin this into an unbounded crawl of ~12k rows.
 */
const MAX_LIBRARY_PAGES = 6;

/** One entry of Meta's pre-approved template catalogue, as Graph returns it. */
export interface WaLibraryTemplate {
  id?: string;
  name: string;
  language?: string;
  category?: string;
  header?: string;
  body?: string;
  footer?: string;
  buttons?: unknown[];
  body_params?: string[];
  topic?: string;
  usecase?: string;
  industry?: string[];
}

/**
 * Browse Meta's message template library.
 *
 * These are pre-written, pre-approved templates (OTP, order updates, appointment
 * reminders). Creating from one is approved INSTANTLY instead of waiting days
 * for a review that may come back rejected with the name spent — which is the
 * fastest route to a working template on a fresh WABA, and was not reachable
 * from this console at all.
 */
export async function listLibraryTemplates(params: {
  search?: string;
  language?: string;
  category?: string;
  topic?: string;
  usecase?: string;
  limit?: number;
}): Promise<{ items: WaLibraryTemplate[]; unavailable?: boolean }> {
  const { token } = metaConfig();
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.limit ?? 100)) || 100));
  const qs = new URLSearchParams({ limit: String(limit) });
  if (params.search) qs.set('search', params.search);
  if (params.topic) qs.set('topic', params.topic);
  if (params.usecase) qs.set('usecase', params.usecase);
  // Always browse in ONE language — see DEFAULT_LIBRARY_LANGUAGE for why an
  // unfiltered browse makes the catalogue look like a single template.
  qs.set('language', params.language?.trim() || DEFAULT_LIBRARY_LANGUAGE);
  // `category` is deliberately NOT forwarded. Graph accepts the parameter and
  // then ignores it — `category=MARKETING` returns byte-identical UTILITY rows
  // to no filter at all — so sending it would make the dropdown silently lie.
  // Applied locally on the response instead, below.

  // NOTE: the library is a GLOBAL edge — it takes NO node id. Meta's catalogue
  // is the same for every business, so it does not hang off the WABA. Calling
  // `/{wabaId}/message_template_library` returns `(#100) Tried accessing
  // nonexisting field`, which this function used to report as "the library is
  // not enabled for your WABA" — a capability answer to what was really a
  // malformed URL, so the dialog claimed no access on accounts that had it.
  let next: string | null = `${GRAPH}/${graphVersion()}/message_template_library?${qs.toString()}`;
  let items: WaLibraryTemplate[] = [];

  // Cursor paging, so it is sequential by construction: one language is ~180
  // entries and Meta's page size caps at 100, so a single page would silently
  // truncate the catalogue at whatever fits.
  for (let page = 0; next && page < MAX_LIBRARY_PAGES; page++) {
    // Same timeout discipline as syncFromMeta, applied per page: a hung Graph
    // connection must not hold the request open until the global 30s timeout
    // kills it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIBRARY_TIMEOUT_MS);
    const pageUrl: string = next;

    const res = await (async () => {
      try {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        return await fetch(pageUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch (e) {
        throw new AppError(
          (e as Error).name === 'AbortError'
            ? `Meta did not respond within ${LIBRARY_TIMEOUT_MS / 1000}s — template library unavailable`
            : `Meta template library failed: ${(e as Error).message}`,
          504,
          'WA_META_TIMEOUT'
        );
      } finally {
        clearTimeout(timer);
      }
    })();

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Retained as a safety net, but it should no longer fire in normal use: the
      // #100 this used to catch was self-inflicted by addressing the edge under a
      // node id (see the URL note above), and it made a plain bug look like an
      // account-capability limit. Kept because reporting a genuine capability gap
      // as "unavailable" still beats a red 502 on every open of the dialog and on
      // every window refocus, which reads as an outage and React Query retries.
      const code = data?.error?.code;
      const message: string = data?.error?.message ?? '';
      if (code === 100 || /nonexisting field/i.test(message)) {
        logger.info(
          '[whatsapp] template library is not enabled for this WABA — Meta: ' +
            (message || 'no such edge')
        );
        return { items: [], unavailable: true };
      }
      throw new AppError(
        data?.error?.message ?? `Meta template library failed (${res.status})`,
        502,
        'WA_META_ERROR'
      );
    }
    items = items.concat((data.data ?? []) as WaLibraryTemplate[]);
    next = typeof data?.paging?.next === 'string' ? data.paging.next : null;
  }
  // Local category filter — see the note where the query string is built. Meta
  // categorises every library entry as UTILITY or AUTHENTICATION (they are
  // pre-approved, and MARKETING never is), so a MARKETING filter correctly
  // yields nothing rather than the unfiltered list Graph would hand back.
  if (params.category) {
    const want = params.category.trim().toUpperCase();
    items = items.filter((t) => (t.category ?? '').toUpperCase() === want);
  }
  return { items, unavailable: false };
}

/**
 * Read a template's components back off Graph.
 *
 * The library create response carries only `{id, status, category}`, and a local
 * row with an empty components array is actively dangerous: the send path reads
 * components to decide which parameters a template needs, so it would conclude
 * "none" and send an OTP template with no code in it.
 */
async function fetchTemplateComponents(metaId: string, token: string): Promise<any[]> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${metaId}?fields=components`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await res.json().catch(() => ({}));
  return Array.isArray(data?.components) ? data.components : [];
}

/**
 * Create a template FROM the library. Meta supplies the content; we supply the
 * name, the language and the button inputs (a link, a phone number) that the
 * library entry leaves blank.
 */
export async function createFromLibrary(input: {
  name: string;
  language: string;
  category: WaTemplateCategory;
  libraryTemplateName: string;
  buttonInputs?: unknown[];
  createdBy: string;
}) {
  const { wabaId, token } = metaConfig();
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      library_template_name: input.libraryTemplateName,
      ...(input.buttonInputs?.length ? { library_template_button_inputs: input.buttonInputs } : {}),
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data?.error?.error_user_msg ?? data?.error?.message ?? 'Library template creation failed',
      400,
      'WA_TEMPLATE_CREATE_FAILED'
    );
  }
  const components = await fetchTemplateComponents(data.id, token).catch(() => [] as any[]);
  if (!components.length) {
    // The template exists at Meta either way; the next sync fills the gap. Worth
    // a log line because until it does, a send from this template cannot know
    // which parameters it needs.
    logger.warn(
      `WhatsApp: created library template "${input.name}" but could not read its components back — the next sync will fill them in`
    );
  }
  const finalCategory = data?.category ? mapCategory(data.category) : input.category;
  return prisma.waTemplate.upsert({
    where: { name_language: { name: input.name, language: input.language } },
    update: {
      metaId: data.id,
      category: finalCategory,
      status: mapTemplateStatus(data.status) ?? 'PENDING',
      components,
      variableSample: extractVariableSample(components),
      createdBy: input.createdBy,
      rejectionReason: null,
      lastSyncedAt: new Date(),
    },
    create: {
      metaId: data.id,
      name: input.name,
      language: input.language,
      category: finalCategory,
      status: mapTemplateStatus(data.status) ?? 'PENDING',
      components,
      variableSample: extractVariableSample(components),
      createdBy: input.createdBy,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * How many bytes go up per resumable-upload request.
 *
 * The whole point of a resumable session is that a dropped connection costs one
 * chunk rather than the whole file; pushing all 100 MB in a single POST, which
 * is what this did, threw that away and made the operator start a 16 MB video
 * sample again from zero.
 */
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

/** Consecutive failed chunk attempts tolerated before giving up on the file. */
const UPLOAD_MAX_RETRIES = 3;

/**
 * Ask an upload session how many bytes it already holds, so a retry resumes
 * from there. Returns null when Meta will not say, which is not resumable.
 */
async function readUploadOffset(sessionId: string, token: string): Promise<number | null> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${sessionId}`, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => ({}));
  const offset = Number(data?.file_offset);
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
}

/**
 * Upload a media-header SAMPLE to Meta's App-scoped Resumable Upload API and
 * return the resulting `header_handle`. Authoring a template with an IMAGE /
 * VIDEO / DOCUMENT header requires `example.header_handle: ["<handle>"]`, where
 * the handle comes from this two-step flow (create session → upload bytes).
 */
export async function uploadHeaderSampleHandle(buffer: Buffer, mime: string): Promise<string> {
  const appId = env.META_WHATSAPP_APP_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!appId || !token) {
    throw new AppError(
      'Media-header samples need META_WHATSAPP_APP_ID configured',
      400,
      'WA_APP_ID_MISSING'
    );
  }

  // Step 1 — create an upload session (declares the file length + type).
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const sessionRes = await fetch(
    `${GRAPH}/${graphVersion()}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mime)}`,
    // Token via the Authorization header (NOT the URL query) so it can't leak
    // into ingress / Cloudflare / proxy access logs — matches every other Graph
    // call and the step-2 upload below.
    { method: 'POST', headers: { Authorization: `OAuth ${token}` } }
  );
  const sessionData: any = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    throw new AppError(
      sessionData?.error?.message ?? 'Upload session failed',
      502,
      'WA_META_ERROR'
    );
  }
  const sessionId: string = sessionData.id;

  // Step 2 — push the bytes to the session a chunk at a time; Meta returns the
  // file handle `h` on the request that completes the file. A chunk that fails
  // re-reads the session's offset and continues from there instead of starting
  // the file over.
  let offset = 0;
  let failures = 0;
  let handle: string | undefined;
  while (offset < buffer.length) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, buffer.length);
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const uploadRes = await fetch(`${GRAPH}/${graphVersion()}/${sessionId}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_offset: String(offset) },
      // Raw bytes. A Node Buffer is a valid body for undici's fetch at runtime,
      // but TS's narrow BodyInit type rejects it — cast through unknown.
      body: buffer.subarray(offset, end) as unknown as BodyInit,
    });
    const uploadData: any = await uploadRes.json().catch(() => ({}));
    if (uploadRes.ok) {
      if (typeof uploadData?.h === 'string' && uploadData.h) {
        handle = uploadData.h;
        break;
      }
      // Meta reports how far it has taken the file; trust that over our own
      // arithmetic, since a partially accepted chunk would otherwise leave a
      // hole in the middle of the upload.
      const acked = Number(uploadData?.file_offset);
      offset = Number.isFinite(acked) && acked > offset ? acked : end;
      failures = 0;
      continue;
    }
    if (failures >= UPLOAD_MAX_RETRIES) {
      throw new AppError(uploadData?.error?.message ?? 'Media upload failed', 502, 'WA_META_ERROR');
    }
    failures += 1;
    const resumeAt = await readUploadOffset(sessionId, token);
    if (resumeAt === null) {
      throw new AppError(uploadData?.error?.message ?? 'Media upload failed', 502, 'WA_META_ERROR');
    }
    offset = resumeAt;
  }
  if (!handle) {
    throw new AppError('Media upload returned no handle', 502, 'WA_META_ERROR');
  }
  return handle;
}

export interface TemplateSendSpec {
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION' | 'PRODUCT';
  /** TEXT header carrying a {{n}} variable — needs headerText at send. */
  headerHasTextVar: boolean;
  /** IMAGE/VIDEO/DOCUMENT header — needs headerMediaUrl or headerImageId. */
  headerNeedsMedia: boolean;
  /** Highest positional {{n}} in the body (0 when none, or when named). */
  bodyPositional: number;
  /** Named {{word}} body variables. */
  bodyNamed: string[];
  /** URL button with a dynamic {{1}} suffix — needs a per-send value. */
  buttonUrlVar: boolean;
  /**
   * The AUTHORED index of every URL button carrying a {{n}} suffix, in order.
   *
   * Meta allows TWO URL buttons and either may be dynamic, each addressed by its
   * own index. Only the first was ever filled in, so a two-dynamic-URL template
   * — unauthorable here but imported APPROVED by `syncFromMeta`, which stores
   * Meta's components verbatim — was refused for every recipient with (#131008)
   * because the second button got no parameter.
   */
  buttonUrlVarIndexes: number[];
  /**
   * Authentication template: carries an OTP button. The Cloud API requires the
   * one-time code to be sent TWICE — as the body parameter and again as the
   * button parameter — and rejects the send outright if the button component is
   * missing. Nothing emitted it, so the whole AUTHENTICATION category could be
   * authored and approved here and never actually sent.
   */
  needsOtpCode: boolean;
  /** LOCATION header — the pin is supplied per send, not at authoring time. */
  headerNeedsLocation: boolean;
  /** COPY_CODE button — needs a coupon code at send. */
  needsCouponCode: boolean;
  /**
   * LIMITED_TIME_OFFER component WITH a countdown — needs an expiry timestamp.
   *
   * Gated on `has_expiration`: the offer component alone draws the banner, and
   * only the countdown consumes `expiration_time_ms`. Reading the component's
   * mere presence made a `has_expiration: false` template (authorable in
   * Business Manager, imported verbatim by `syncFromMeta`) demand an expiry in
   * the UI and then send Meta a parameter the template never declared.
   */
  needsLtoExpiration: boolean;
  /**
   * CATALOG button — the send MAY name the product whose image heads the card.
   *
   * Optional by Meta's own rule: "if the parameters object is omitted, the
   * product image of the first item in your catalog will be used". So this asks
   * for a value, it never refuses a send without one.
   */
  needsCatalogThumbnail: boolean;
  /**
   * MPM button — the product SECTIONS are chosen at SEND time and are mandatory.
   *
   * There is nowhere else they can come from: a multi-product template is
   * authored with an empty button and Meta requires `sections` plus a thumbnail
   * SKU on the send, so one with neither renders no products at all.
   */
  needsProductSections: boolean;
  /**
   * PRODUCT header (single-product template) — the SKU is supplied per send, in
   * a header parameter rather than on a button.
   */
  needsProduct: boolean;
  /**
   * FLOW button. Takes no MANDATORY parameter (Meta defaults `flow_token`), but
   * a send that names its own token is the only way a submission can be tied
   * back to the Flow it came from — see `templateFlowButton`.
   */
  hasFlowButton: boolean;
  /**
   * The carousel's cards, in authored order — empty for every other template.
   *
   * Each card takes its OWN header media, body values and button values at send
   * time. Nothing emitted them, so a carousel authored in Business Manager could
   * be picked for a campaign and Meta refused every single recipient with
   * (#131008) for missing card parameters.
   */
  carouselCards: TemplateCarouselCardSpec[];
}

/** One button on a carousel card, as authored. */
export interface TemplateCarouselButtonSpec {
  /** Position within the CARD's own buttons array — Meta addresses it by index. */
  index: number;
  /** Meta button type, uppercase (QUICK_REPLY / URL / PHONE_NUMBER / …). */
  type: string;
  /** The button's label. Also the default payload of a quick reply (see below). */
  text: string;
  /** URL button carrying a {{n}} suffix — it takes a per-send value. */
  hasUrlVar: boolean;
}

/** What ONE carousel card requires at send time. */
export interface TemplateCarouselCardSpec {
  /**
   * The card's header format. Meta allows IMAGE or VIDEO only; NONE means the
   * stored card is malformed (it cannot have been approved that way), and the
   * emitter then falls back to the caller's own media type.
   */
  headerFormat: 'IMAGE' | 'VIDEO' | 'NONE';
  /** Highest positional {{n}} in THIS card's body (0 when it has none). */
  bodyPositional: number;
  /** The card's buttons, in authored order. */
  buttons: TemplateCarouselButtonSpec[];
  /** True when one of the card's URL buttons needs a per-send suffix. */
  buttonUrlVar: boolean;
}

/**
 * Parse a carousel template's cards into what each one needs at send time.
 *
 * A card is numbered from {{1}} independently of the bubble and of every other
 * card, and its buttons are addressed by their index WITHIN the card — so none of
 * this can be derived from the bubble's own spec. Returns [] for a template with
 * no CAROUSEL component, which is what makes `carouselCards.length` the test for
 * "is this a carousel" everywhere else.
 */
export function carouselCardSpecs(components: unknown): TemplateCarouselCardSpec[] {
  const cs: any[] = Array.isArray(components) ? components : [];
  const carousel = cs.find((c) => String(c?.type ?? '').toUpperCase() === 'CAROUSEL');
  const cards: any[] = Array.isArray(carousel?.cards) ? carousel.cards : [];
  return cards.map((card) => {
    const comps: any[] = Array.isArray(card?.components) ? card.components : [];
    const find = (t: string) => comps.find((c) => String(c?.type ?? '').toUpperCase() === t);
    const format = String(find('HEADER')?.format ?? 'NONE').toUpperCase();
    const positional = [...String(find('BODY')?.text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(
      (m) => Number(m[1])
    );
    const buttons: TemplateCarouselButtonSpec[] = ((find('BUTTONS')?.buttons ?? []) as any[]).map(
      (b: any, index: number) => {
        const type = String(b?.type ?? '').toUpperCase();
        return {
          index,
          type,
          text: String(b?.text ?? ''),
          hasUrlVar: type === 'URL' && /\{\{\s*\d+\s*\}\}/.test(String(b?.url ?? '')),
        };
      }
    );
    return {
      headerFormat: format === 'IMAGE' || format === 'VIDEO' ? format : 'NONE',
      bodyPositional: positional.length ? Math.max(...positional) : 0,
      buttons,
      buttonUrlVar: buttons.some((b) => b.hasUrlVar),
    };
  });
}

/**
 * Does this template's LIMITED_TIME_OFFER actually run a countdown?
 *
 * The offer component is what draws the "limited time" banner; `has_expiration`
 * is what adds the live countdown, and it is the countdown — not the banner —
 * that the send's `expiration_time_ms` parameter feeds. Both the analyzer and
 * the emitter used to key off the mere PRESENCE of the component, so an offer
 * template authored in Business Manager with `has_expiration: false` had the UI
 * demand an expiry the operator had no way to see the point of, and the send
 * then carried a parameter the approved template never declared.
 *
 * `has_expiration` is optional in Meta's payload, so only an explicit `false`
 * turns the countdown off — an absent flag keeps the historical behaviour.
 */
function templateWantsLtoExpiration(components: unknown): boolean {
  const cs: any[] = Array.isArray(components) ? components : [];
  const lto = cs.find((c: any) => String(c?.type ?? '').toUpperCase() === 'LIMITED_TIME_OFFER');
  return Boolean(lto) && lto?.limited_time_offer?.has_expiration !== false;
}

/**
 * Parse a stored template's Meta `components` into the parameters a SEND must
 * supply.
 *
 * Deliberately mirrors the frontend `analyzeTemplate()` helper: the UI uses it to
 * render the right inputs, and the server uses it to REFUSE a campaign launch —
 * and, via `missingTemplateSendParams`, an individual send — that cannot satisfy
 * them. Client-side checking alone is not enough — a campaign can be created
 * through the API, a template can be edited in Meta after the campaign was built,
 * and the inbox send endpoint has callers that are not this console.
 */
export function analyzeTemplateSpec(components: unknown): TemplateSendSpec {
  const cs: any[] = Array.isArray(components) ? components : [];
  const find = (t: string) => cs.find((c) => String(c?.type ?? '').toUpperCase() === t);
  const header = find('HEADER');
  const body = find('BODY');
  const buttons = find('BUTTONS');

  const varsIn = (text: unknown): string[] =>
    typeof text === 'string' ? [...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]) : [];

  const headerFormat = String(
    header?.format ?? 'NONE'
  ).toUpperCase() as TemplateSendSpec['headerFormat'];
  const bodyVars = varsIn(body?.text);
  const positional = bodyVars.filter((v) => /^\d+$/.test(v)).map(Number);
  const buttonList: any[] = Array.isArray(buttons?.buttons) ? buttons.buttons : [];
  const hasButton = (t: string): boolean =>
    buttonList.some((b: any) => String(b?.type ?? '').toUpperCase() === t);
  // The dynamic URL buttons, by AUTHORED index — the same walk the emitter does,
  // so the analyzer can never disagree with it about how many values a send owes.
  const urlIndexes = templateButtonIndexes(components).urls;

  return {
    headerFormat,
    headerHasTextVar: headerFormat === 'TEXT' && varsIn(header?.text).length > 0,
    headerNeedsMedia: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat),
    bodyPositional: positional.length ? Math.max(...positional) : 0,
    bodyNamed: [...new Set(bodyVars.filter((v) => !/^\d+$/.test(v)))],
    headerNeedsLocation: headerFormat === 'LOCATION',
    needsCouponCode: hasButton('COPY_CODE'),
    needsLtoExpiration: templateWantsLtoExpiration(components),
    needsOtpCode: hasButton('OTP'),
    buttonUrlVar: urlIndexes.length > 0,
    buttonUrlVarIndexes: urlIndexes,
    // Catalogue buttons. CATALOG's thumbnail is optional — Meta falls back to the
    // first item in the bound catalog — while MPM's product sections are not:
    // they exist nowhere but the send payload, so a multi-product template sent
    // without them renders a product list with no products in it.
    needsCatalogThumbnail: hasButton('CATALOG'),
    needsProductSections: hasButton('MPM'),
    // A single-product template carries its SKU in the HEADER, not on a button:
    // Meta stamps the header `format: PRODUCT` and the send fills it in.
    needsProduct: headerFormat === 'PRODUCT' || hasButton('SPM'),
    hasFlowButton: hasButton('FLOW'),
    carouselCards: carouselCardSpecs(components),
  };
}
/** The HEADER a template was APPROVED with, as the send path needs to see it. */
export interface TemplateHeaderSpec {
  format: TemplateSendSpec['headerFormat'];
  /** A TEXT header carrying any {{var}} — it takes a parameter, a static one does not. */
  hasTextVar: boolean;
  /**
   * The header variable's token when it is NAMED ({{customer_name}}), null for a
   * positional {{1}} or a header with no variable. Meta requires `parameter_name`
   * on every parameter of a NAMED template, headers included.
   */
  namedParam: string | null;
}

/**
 * The header the template itself declares — `null` when the caller passed no
 * components, in which case nothing can be known and the caller's own fields
 * decide (the historical behaviour).
 *
 * An EMPTY components array counts as "not supplied": a template row we hold no
 * components for tells us nothing about its header, and treating that as "no
 * header" would drop a header parameter the template really does require.
 */
export function templateHeaderSpec(components: unknown): TemplateHeaderSpec | null {
  if (!Array.isArray(components) || components.length === 0) return null;
  const header = components.find((c: any) => String(c?.type ?? '').toUpperCase() === 'HEADER');
  const declared = String(
    header?.format ?? 'NONE'
  ).toUpperCase() as TemplateSendSpec['headerFormat'];
  // A single-product template shows its product in the header even when the
  // approved components declare no HEADER component at all — the SPM button is
  // what makes it one, and Meta reads the SKU off a header parameter. Without
  // this the send carried no product and the customer saw an empty card.
  const hasSpmButton = components.some(
    (c: any) =>
      String(c?.type ?? '').toUpperCase() === 'BUTTONS' &&
      (Array.isArray(c?.buttons) ? c.buttons : []).some(
        (b: any) => String(b?.type ?? '').toUpperCase() === 'SPM'
      )
  );
  const format: TemplateSendSpec['headerFormat'] =
    declared === 'NONE' && hasSpmButton ? 'PRODUCT' : declared;
  const token =
    format === 'TEXT'
      ? (String(header?.text ?? '').match(/\{\{\s*(\w+)\s*\}\}/)?.[1] ?? null)
      : null;
  return {
    format,
    hasTextVar: token !== null,
    namedParam: token !== null && !/^\d+$/.test(token) ? token : null,
  };
}

/** One section of an MPM (multi-product) template's product list. */
export interface TemplateProductSection {
  /** Section heading shown above its products. Meta caps this at 24 characters. */
  title: string;
  /** The SKUs in this section, as they appear in the bound catalog. */
  productRetailerIds: string[];
}

/**
 * The URL-button values a send is carrying, in dynamic-button order.
 *
 * `buttonUrlParam` is the single-value form every caller used while only ONE
 * dynamic URL button could be filled in; it stays valid and means "the first
 * one". `buttonUrlParams` supersedes it for a template that has two.
 */
export function urlButtonValues(supplied: {
  buttonUrlParam?: string;
  buttonUrlParams?: string[];
}): string[] {
  if (supplied.buttonUrlParams?.length) return supplied.buttonUrlParams;
  return supplied.buttonUrlParam ? [supplied.buttonUrlParam] : [];
}

/**
 * Everything a template needs at send time OTHER than positional body values,
 * phrased for a human — empty when positional body values are all it takes.
 *
 * Several surfaces store a template id and a list of {{n}} values and nothing
 * else: a scheduled message, a keyword auto-reply, a bot-flow `send_template`
 * step, a drip step. They have no field for a header, a link value, a coupon or
 * an offer expiry, so a template that needs one of those is not "partly"
 * sendable from them — it is refused by Meta in full with (#131008), and on the
 * drip path that refusal was caught and retried until the recipient's attempt
 * budget ran out. Naming the gap where the operator PICKS the template is the
 * only point at which they can still choose a different one.
 */
export function templateParamsBeyondBody(spec: TemplateSendSpec): string[] {
  const needs: string[] = [];
  if (spec.headerNeedsMedia) needs.push(`a ${spec.headerFormat.toLowerCase()} header`);
  if (spec.headerHasTextVar) needs.push('header text');
  if (spec.headerNeedsLocation) needs.push('a location pin');
  if (spec.buttonUrlVarIndexes.length > 0) {
    needs.push(
      spec.buttonUrlVarIndexes.length > 1
        ? `${spec.buttonUrlVarIndexes.length} URL-button values`
        : 'a URL-button value'
    );
  }
  if (spec.needsCouponCode) needs.push('a coupon code');
  if (spec.needsLtoExpiration) needs.push('an offer expiry');
  if (spec.needsOtpCode) needs.push('a one-time code');
  if (spec.needsProductSections) needs.push('a product list');
  if (spec.needsProduct) needs.push('a product SKU');
  if (spec.carouselCards.length > 0) needs.push('carousel card media and text');
  // Named body variables are positional values' opposite number: these surfaces
  // store an ordered array, and Meta requires `parameter_name` on every
  // parameter of a NAMED template, so the values cannot be addressed at all.
  if (spec.bodyNamed.length > 0) {
    needs.push(`named body values (${spec.bodyNamed.map((n) => `{{${n}}}`).join(', ')})`);
  }
  return needs;
}

/**
 * Refuse, at SELECTION time, a template that a body-parameters-only surface
 * could never send.
 *
 * `where` names the surface in the operator's own words ("a scheduled message",
 * "a keyword rule") so the message reads as an explanation rather than an API
 * error. Throws WA_TEMPLATE_NOT_FOUND / WA_TEMPLATE_PARAMS_UNSUPPORTED; returns
 * quietly when the template needs nothing but body values.
 */
export async function assertTemplateSendableWithBodyParamsOnly(
  templateId: string,
  where: string
): Promise<void> {
  const tpl = await getTemplate(templateId);
  if (!tpl) throw new AppError('Template not found', 404, 'WA_TEMPLATE_NOT_FOUND');
  const needs = templateParamsBeyondBody(analyzeTemplateSpec(tpl.components));
  if (needs.length === 0) return;
  throw new AppError(
    `Template "${tpl.name}" needs ${needs.join(', ')}, and ${where} can only supply the ` +
      'body variables. WhatsApp refuses a message whose parameters do not match the ' +
      'approved template, so pick a template that needs body values only.',
    400,
    'WA_TEMPLATE_PARAMS_UNSUPPORTED'
  );
}

/**
 * What a template send is still missing, phrased for a human.
 *
 * The campaign launch gate has always run this comparison (in its own,
 * campaign-flavoured wording) so an unsatisfiable broadcast is refused before an
 * audience is spent. The inbox / start-conversation path had no equivalent, so
 * any non-browser caller — an API client, a script, the Chatwoot bridge — could
 * post a template send with no parameters at all and the only feedback was Meta's
 * opaque (#131008). Same spec, same answer, before Graph is ever called.
 *
 * Reports EXTRA parameters as well as missing ones: Meta matches on parameter
 * COUNT and refuses the message either way.
 */
export function missingTemplateSendParams(
  spec: TemplateSendSpec,
  supplied: {
    bodyParams?: string[];
    bodyNamedParams?: Array<{ name: string; text: string }>;
    headerText?: string;
    headerImageId?: string;
    headerMediaUrl?: string;
    headerLocation?: { latitude: number; longitude: number };
    buttonUrlParam?: string;
    buttonUrlParams?: string[];
    otpCode?: string;
    couponCode?: string;
    ltoExpirationMs?: number;
    catalogThumbnailProductId?: string;
    productSections?: TemplateProductSection[];
    productRetailerId?: string;
    carouselCards?: TemplateSendCarouselCard[];
  }
): string[] {
  const missing: string[] = [];
  // An EMPTY parameter is not "unpersonalised" — Meta refuses the whole message —
  // so a blank string counts as missing, not as a default.
  const filled = (v: unknown): boolean => String(v ?? '').trim().length > 0;

  if (
    spec.headerNeedsMedia &&
    !filled(supplied.headerImageId) &&
    !filled(supplied.headerMediaUrl)
  ) {
    const kind = spec.headerFormat.toLowerCase();
    missing.push(
      `${kind === 'image' ? 'an' : 'a'} ${kind} header (an uploaded file or a public URL)`
    );
  }
  if (spec.headerHasTextVar && !filled(supplied.headerText)) missing.push('header text');
  if (spec.headerNeedsLocation) {
    const loc = supplied.headerLocation;
    if (!loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
      missing.push('a location pin (latitude and longitude)');
    }
  }
  // ONE value per dynamic URL button. Meta allows two of them and addresses each
  // by its own index, so a template with two dynamic links and one value supplied
  // is refused in full with (#131008) — for a campaign, once per recipient.
  const urlValues = urlButtonValues(supplied);
  spec.buttonUrlVarIndexes.forEach((_index, n) => {
    if (filled(urlValues[n])) return;
    missing.push(
      spec.buttonUrlVarIndexes.length > 1 ? `link button ${n + 1}'s value` : 'a URL-button value'
    );
  });
  if (spec.needsCouponCode && !filled(supplied.couponCode)) missing.push('a coupon code');
  if (spec.needsLtoExpiration && !supplied.ltoExpirationMs) missing.push('an offer expiry');
  if (spec.needsOtpCode && !filled(supplied.otpCode)) missing.push('a one-time code');
  // MULTI-PRODUCT. The sections ARE the message: they are picked per send and
  // Meta requires both them and the thumbnail SKU, so a template sent without
  // either renders a product list with nothing in it. Refused here so the
  // operator hears it at template selection rather than once per recipient.
  //
  // A CATALOG button is deliberately NOT checked: Meta documents the parameter
  // as optional and falls back to the first item in the bound catalog.
  if (spec.needsProductSections) {
    if (!filled(supplied.catalogThumbnailProductId)) missing.push('a thumbnail product SKU');
    const items = (supplied.productSections ?? []).reduce(
      (n, s) => n + s.productRetailerIds.filter((id) => filled(id)).length,
      0
    );
    if (items === 0) missing.push('at least one product section with products in it');
  }
  if (spec.needsProduct && !filled(supplied.productRetailerId)) {
    missing.push('a product SKU for the header');
  }

  // BODY. A template is stamped NAMED or POSITIONAL as a whole, so only one of
  // these two ever applies.
  if (spec.bodyNamed.length > 0) {
    const byName = new Map((supplied.bodyNamedParams ?? []).map((p) => [p.name, p.text]));
    const blank = spec.bodyNamed.filter((n) => !filled(byName.get(n)));
    if (blank.length > 0) {
      missing.push(`body values for ${blank.map((n) => `{{${n}}}`).join(', ')}`);
    }
  } else if (!spec.needsOtpCode) {
    // AUTHENTICATION templates are exempt from the count: Meta holds their body
    // text itself, so the stored components carry no {{1}} while the send still
    // takes the code as the body parameter (defaulted from `otpCode` by the
    // caller). Counting them would refuse every OTP send.
    const count = (supplied.bodyParams ?? []).filter((v) => filled(v)).length;
    if (count !== spec.bodyPositional) {
      missing.push(
        `${spec.bodyPositional} body value(s) — ${count} supplied` +
          (count > spec.bodyPositional ? ' (extra parameters are refused too)' : '')
      );
    }
  }

  // CAROUSEL. The media, the card text and the card button values live on the
  // CARDS, and Meta refuses the whole message for one missing card parameter.
  const cards = supplied.carouselCards ?? [];
  if (spec.carouselCards.length === 0 && cards.length > 0) {
    missing.push(
      'carousel cards were supplied but this template has no carousel component ' +
        '(they are left over from a different template)'
    );
  }
  if (cards.length > spec.carouselCards.length && spec.carouselCards.length > 0) {
    missing.push(
      `only ${spec.carouselCards.length} carousel card(s) on this template, but ${cards.length} were supplied`
    );
  }
  spec.carouselCards.forEach((card, i) => {
    const value = cards[i];
    const label = `card ${i + 1}`;
    if (!value) {
      missing.push(`${label}'s values`);
      return;
    }
    if (!filled(value.headerMediaId) && !filled(value.headerMediaUrl)) {
      missing.push(`${label}'s ${card.headerFormat === 'VIDEO' ? 'video' : 'image'}`);
    }
    const values = value.bodyParams ?? [];
    const blank = Array.from({ length: card.bodyPositional }, (_, n) => n).filter(
      (n) => !filled(values[n])
    );
    if (blank.length > 0) {
      missing.push(`${label}'s ${blank.map((n) => `{{${n + 1}}}`).join(', ')} value`);
    }
    const cardUrls = urlButtonValues(value);
    card.buttons
      .filter((b) => b.hasUrlVar)
      .forEach((_b, n) => {
        if (filled(cardUrls[n])) return;
        missing.push(`${label}'s button link value`);
      });
  });
  return missing;
}

/**
 * Where each parameterised button actually sits in a template's authored BUTTONS
 * array.
 *
 * Meta addresses button components by their INDEX in that array, and the index is
 * NOT derivable from the parameters a send happens to emit: our own template
 * builder appends the COPY_CODE button AFTER the operator's own quick-reply / URL
 * buttons, and a dynamic URL button need not be first either. Numbering them
 * positionally therefore sent `index: "0"` for a button sitting at index >= 1,
 * which Meta rejects with (#131008) — so a coupon template that carried any other
 * button could be authored and approved here and never actually sent.
 *
 * Returns null for a button the template does not have, so a caller without the
 * stored components to hand keeps the old positional behaviour.
 */
export function templateButtonIndexes(components: unknown): {
  /**
   * EVERY dynamic URL button, in authored order. Meta allows two URL buttons and
   * either may carry a {{n}} suffix; keeping only the first meant the second was
   * sent no parameter and Meta refused the whole message with (#131008).
   */
  urls: number[];
  copyCode: number | null;
  otp: number | null;
  /** FLOW button — takes an optional `flow_token` / `flow_action_data` action. */
  flow: number | null;
  /** CATALOG button — takes an optional thumbnail-product action. */
  catalog: number | null;
  /** MPM button — takes the (mandatory) product sections action. */
  mpm: number | null;
} {
  const cs: any[] = Array.isArray(components) ? components : [];
  const buttons: any[] =
    cs.find((c) => String(c?.type ?? '').toUpperCase() === 'BUTTONS')?.buttons ?? [];
  const out = {
    urls: [] as number[],
    copyCode: null as number | null,
    otp: null as number | null,
    flow: null as number | null,
    catalog: null as number | null,
    mpm: null as number | null,
  };
  buttons.forEach((b: any, i: number) => {
    const type = String(b?.type ?? '').toUpperCase();
    // Only a URL button carrying a {{n}} suffix takes a send-time parameter — a
    // static URL button must not be addressed at all.
    if (type === 'URL') {
      if (/\{\{\s*\d+\s*\}\}/.test(String(b?.url ?? ''))) out.urls.push(i);
    } else if (type === 'COPY_CODE') {
      if (out.copyCode === null) out.copyCode = i;
    } else if (type === 'OTP') {
      if (out.otp === null) out.otp = i;
    } else if (type === 'FLOW') {
      if (out.flow === null) out.flow = i;
    } else if (type === 'CATALOG') {
      if (out.catalog === null) out.catalog = i;
    } else if (type === 'MPM') {
      if (out.mpm === null) out.mpm = i;
    }
  });
  return out;
}

/** The FLOW button a template carries, with the Flow it opens. */
export interface TemplateFlowButtonSpec {
  /** Position in the template's authored BUTTONS array. */
  index: number;
  /** The Flow's id ON META (WaFlow.metaId), as authored on the button. */
  metaFlowId: string | null;
}

/**
 * The template's FLOW button, or null when it has none.
 *
 * Separate from `templateButtonIndexes` because the send path needs the Flow's
 * id as well as the button's position: the per-send `flow_token` is minted from
 * it (see `mintTemplateFlowToken`), which is what makes a submission traceable
 * back to the Flow that produced it.
 */
export function templateFlowButton(components: unknown): TemplateFlowButtonSpec | null {
  const cs: any[] = Array.isArray(components) ? components : [];
  const buttons: any[] =
    cs.find((c) => String(c?.type ?? '').toUpperCase() === 'BUTTONS')?.buttons ?? [];
  const index = buttons.findIndex((b: any) => String(b?.type ?? '').toUpperCase() === 'FLOW');
  if (index < 0) return null;
  const raw = buttons[index]?.flow_id;
  const metaFlowId = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
  return { index, metaFlowId };
}

/** Marks a `flow_token` this console minted, so an inbound reply can decode it. */
export const TEMPLATE_FLOW_TOKEN_PREFIX = 'watpl1';

/**
 * Mint the per-send `flow_token` for a template's FLOW button.
 *
 * Meta defaults this field, so nothing was REJECTED for its absence — but the
 * default is opaque, and the submission that comes back is then attributable to
 * a contact (the inbound worker knows the thread) and to nothing else. Every
 * WaFlowResponse row therefore carried `flowId: null`, so the Flows page's
 * per-flow response list was permanently empty for template-launched Flows.
 *
 * The token names the Flow and carries a random tail, so two sends of the same
 * template are still distinguishable. It is echoed back verbatim on the
 * `nfm_reply`, where `recordFlowResponse` decodes it.
 */
export function mintTemplateFlowToken(metaFlowId: string | null): string {
  const tail = randomUUID();
  return metaFlowId ? `${TEMPLATE_FLOW_TOKEN_PREFIX}.${metaFlowId}.${tail}` : tail;
}

/** The Meta Flow id inside a token minted by `mintTemplateFlowToken`, if any. */
export function metaFlowIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 3 || parts[0] !== TEMPLATE_FLOW_TOKEN_PREFIX) return null;
  return parts[1] || null;
}

/** The runtime values ONE carousel card is sent with. */
export interface TemplateSendCarouselCard {
  /**
   * The card's header media as an uploaded media id. Preferred over a link: Meta
   * re-fetches a URL on every single send, once per card, so a ten-card carousel
   * to a large audience is ten fetches of the operator's host per recipient.
   */
  headerMediaId?: string;
  /** The card's header media as a public URL. */
  headerMediaUrl?: string;
  /**
   * The media kind, for callers that pass no `templateComponents`. Ignored when
   * the stored card says IMAGE or VIDEO — the approved template is the authority.
   */
  headerMediaType?: 'image' | 'video';
  /** Positional values for the card body's own {{n}} placeholders. */
  bodyParams?: string[];
  /** Value for this card's FIRST dynamic {{n}} URL-button suffix. */
  buttonUrlParam?: string;
  /**
   * One value per dynamic URL button on THIS card, in authored order.
   *
   * A card may carry two URL buttons and Meta lets both be dynamic. The single
   * `buttonUrlParam` above was reused for every one of them, so the second
   * button was sent the first button's link.
   */
  buttonUrlParams?: string[];
}

/**
 * Build the `carousel` component: one entry per card, each with its own header
 * media, body values and button parameters.
 *
 * The cards are driven by the AUTHORED card list whenever the template's stored
 * components are to hand. Meta matches cards by `card_index` against the approved
 * template and refuses the whole message if the count disagrees — so emitting
 * however many cards a caller happened to supply would turn one operator mistake
 * (a card left blank in the campaign wizard) into a rejection for every recipient.
 */
function buildCarouselCards(
  cards: TemplateSendCarouselCard[],
  authored: TemplateCarouselCardSpec[]
): any[] {
  const count = authored.length || cards.length;
  const out: any[] = [];
  for (let i = 0; i < count; i += 1) {
    const card = cards[i] ?? {};
    const spec = authored[i];
    const kind: 'image' | 'video' =
      spec?.headerFormat === 'IMAGE' || spec?.headerFormat === 'VIDEO'
        ? (spec.headerFormat.toLowerCase() as 'image' | 'video')
        : (card.headerMediaType ?? 'image');
    const components: any[] = [];
    if (card.headerMediaId) {
      components.push({
        type: 'header',
        parameters: [{ type: kind, [kind]: { id: card.headerMediaId } }],
      });
    } else if (card.headerMediaUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: kind, [kind]: { link: card.headerMediaUrl } }],
      });
    }
    if (card.bodyParams?.length) {
      components.push({
        type: 'body',
        parameters: card.bodyParams.map((text) => ({ type: 'text', text: oneLineParam(text) })),
      });
    }
    // Card buttons carry the index they occupy in THIS card's buttons array, not
    // a running count across the carousel — the same rule the bubble's buttons
    // follow (see `templateButtonIndexes`).
    const cardUrlValues = urlButtonValues(card);
    let cardUrlSlot = 0;
    for (const button of spec?.buttons ?? []) {
      if (button.type === 'QUICK_REPLY') {
        // Meta's carousel send format addresses every quick reply and expects a
        // payload — the string handed back on the `button` webhook when the card
        // is tapped. The button's own label is the payload Meta uses for a
        // non-carousel quick reply, so using it here keeps a tapped card
        // matching the same opt-out keywords and CSAT ratings the inbound worker
        // already resolves from `button.payload`.
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(button.index),
          parameters: [{ type: 'payload', payload: oneLineParam(button.text) || `card_${i + 1}` }],
        });
      } else if (button.hasUrlVar) {
        // Each dynamic URL button on the card takes its OWN value, in the order
        // the card authored them.
        const value = cardUrlValues[cardUrlSlot];
        cardUrlSlot += 1;
        if (value) {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: String(button.index),
            parameters: [{ type: 'text', text: oneLineParam(value) }],
          });
        }
      }
      // A static URL, a call button or a catalog button takes no parameter and
      // must NOT be addressed at all — Meta rejects the send if it is.
    }
    out.push({ card_index: i, components });
  }
  return out;
}

/**
 * The ONE header parameter a template send may carry.
 *
 * Driven by the header the template was APPROVED with whenever its components
 * are to hand, because Meta refuses the whole message with (#131008) both for a
 * missing header parameter AND for one the template did not ask for. `authored`
 * is null only when the caller supplied no components; then the fields it filled
 * in pick the branch, exactly as before.
 */
function buildTemplateHeaderParameter(
  opts: {
    headerText?: string;
    headerImageId?: string;
    headerMediaUrl?: string;
    headerMediaType?: 'image' | 'video' | 'document';
    headerMediaFilename?: string;
    headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
    productRetailerId?: string;
    catalogId?: string;
  },
  authored: TemplateHeaderSpec | null
): any | null {
  const authoredKind =
    authored?.format === 'IMAGE' || authored?.format === 'VIDEO' || authored?.format === 'DOCUMENT'
      ? (authored.format.toLowerCase() as 'image' | 'video' | 'document')
      : null;
  const wantsMedia = authored
    ? authoredKind !== null
    : Boolean(opts.headerImageId || opts.headerMediaUrl);
  if (wantsMedia) {
    // The approved template names the media KIND. Requiring the caller to restate
    // it meant a send that passed `headerMediaUrl` alone had its header component
    // dropped in SILENCE — and Meta then refused every message with (#131008),
    // which on a campaign is the whole audience, while the launch pre-flight saw
    // a URL present and waved the launch through.
    //
    // An uploaded media id is valid for video and document headers too, and it
    // was always emitted as `image` — so picking a file for a DOCUMENT-header
    // template sent Meta an image parameter for a document component and the
    // whole send was rejected.
    const kind = authoredKind ?? opts.headerMediaType ?? 'image';
    // DOCUMENT headers carry the name the attachment shows on the handset. Meta
    // only accepts `filename` on a document parameter, and without it the
    // customer receives an invoice or a brochure named after the media id or the
    // URL's last path segment — while the identical file sent as an ordinary
    // document message in the same thread arrives correctly named, because that
    // path has always passed one.
    const named =
      kind === 'document' && opts.headerMediaFilename?.trim()
        ? { filename: opts.headerMediaFilename.trim() }
        : {};
    if (opts.headerImageId) return { type: kind, [kind]: { id: opts.headerImageId, ...named } };
    if (opts.headerMediaUrl) return { type: kind, [kind]: { link: opts.headerMediaUrl, ...named } };
    return null;
  }
  // A SINGLE-PRODUCT template puts its product in the HEADER, not on a button:
  // Meta stamps the header `format: PRODUCT` and the send names the SKU plus the
  // catalog it lives in. Nothing emitted it, so such a template — creatable via
  // the API and importable from Business Manager — went out with no product at
  // all and Meta refused it.
  if (authored ? authored.format === 'PRODUCT' : Boolean(opts.productRetailerId)) {
    if (!opts.productRetailerId || !opts.catalogId) return null;
    return {
      type: 'product',
      product: {
        product_retailer_id: opts.productRetailerId,
        catalog_id: opts.catalogId,
      },
    };
  }
  if (authored ? authored.format === 'LOCATION' : Boolean(opts.headerLocation)) {
    // LOCATION headers are authored with no configuration and the builder told the
    // operator the pin is "filled in per send" — but nothing ever filled it, and
    // the send had no location parameter at all.
    if (!opts.headerLocation) return null;
    return {
      type: 'location',
      location: {
        latitude: String(opts.headerLocation.latitude),
        longitude: String(opts.headerLocation.longitude),
        ...(opts.headerLocation.name ? { name: opts.headerLocation.name } : {}),
        ...(opts.headerLocation.address ? { address: opts.headerLocation.address } : {}),
      },
    };
  }
  // A TEXT header takes a parameter only when it actually carries a variable:
  // addressing a static header is as fatal as omitting a required one, and a
  // stale `headerText` left over from a previously selected template would
  // otherwise fail every recipient.
  if (authored ? authored.format === 'TEXT' && authored.hasTextVar : Boolean(opts.headerText)) {
    if (!opts.headerText) return null;
    return {
      type: 'text',
      // NAMED templates ({{customer_name}}) require `parameter_name` on EVERY
      // parameter, the header included. Such a template cannot be authored here
      // but imports APPROVED from Business Manager (the sync stores Meta's
      // components verbatim), and every send of one was refused with (#131008).
      ...(authored?.namedParam ? { parameter_name: authored.namedParam } : {}),
      text: oneLineParam(opts.headerText),
    };
  }
  return null;
}

/**
 * Build the Cloud API `components` array for SENDING a template, from the
 * runtime variable values. Phase 2 supports the common cases: positional body
 * text variables, an optional header (text or image), and a dynamic URL-button
 * parameter. (Richer mapping arrives with the campaign builder in Phase 4.)
 *
 * Marketing extras are additive and opt-in:
 *  - `couponCode` emits a `copy_code` button parameter so the recipient can copy
 *    the code with one tap (the template must be authored with a COPY_CODE
 *    button). Its button index is read off the template's own buttons array when
 *    `templateComponents` is supplied.
 *  - `ltoExpirationMs` emits a `limited_time_offer` component carrying the offer
 *    countdown's expiration timestamp (epoch ms) for limited-time-offer templates.
 *  - `carouselCards` emits the `carousel` component, one entry per authored card,
 *    each carrying that card's own media, body values and button parameters.
 *
 * Catalogue templates pick their PRODUCTS at send time, not at authoring time:
 * `catalogThumbnailProductId` names the SKU whose image heads a CATALOG card
 * (optional — Meta falls back to the first item in the bound catalog),
 * `productSections` is the MPM button's product list (mandatory: it exists
 * nowhere else), and `productRetailerId` + `catalogId` fill a single-product
 * template's PRODUCT header. This used to say no send-time mapping was needed,
 * which was true only of the authored button itself.
 *
 * Buttons that carry NO variable — a static URL, a phone number, a plain quick
 * reply — are part of the approved template and must not be addressed at all:
 * Meta refuses the message with (#131008) for a parameter it did not ask for
 * just as readily as for a missing one.
 */
export function buildTemplateSendComponents(opts: {
  bodyParams?: string[];
  /** Named body params ({{name}} templates) — Cloud API requires `parameter_name`. */
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  headerImageId?: string;
  /** Header media by public URL (image/video/document) when no uploaded media id. */
  headerMediaUrl?: string;
  /**
   * The media kind, for callers that pass no `templateComponents`. Ignored when
   * the stored template names an IMAGE / VIDEO / DOCUMENT header — the approved
   * template is the authority, exactly as it is for a carousel card's media.
   */
  headerMediaType?: 'image' | 'video' | 'document';
  /**
   * DOCUMENT header: the name the attachment shows on the recipient's handset.
   *
   * Ignored for image and video headers — Meta accepts `filename` on a document
   * parameter only.
   */
  headerMediaFilename?: string;
  /** Value for the FIRST dynamic URL button — the single-button shorthand. */
  buttonUrlParam?: string;
  /** One value per dynamic URL button, in authored order (Meta allows two). */
  buttonUrlParams?: string[];
  couponCode?: string;
  ltoExpirationMs?: number;
  /** One-time code for an AUTHENTICATION template (body + button parameter). */
  otpCode?: string;
  /**
   * FLOW button: the correlation id Meta echoes back on the Flow submission.
   * Optional to Meta (it defaults one), but a default cannot be traced back to
   * the Flow, so the send path mints one — see `mintTemplateFlowToken`.
   */
  flowToken?: string;
  /** FLOW button: data handed to the Flow's entry screen (`flow_action_data`). */
  flowActionData?: Record<string, unknown>;
  /**
   * CATALOG button: the SKU whose image heads the card. Optional — Meta uses the
   * first item in the bound catalog when it is omitted.
   */
  catalogThumbnailProductId?: string;
  /** MPM button: the product list, by section. Mandatory for such a template. */
  productSections?: TemplateProductSection[];
  /** PRODUCT header (single-product template): the SKU to show. */
  productRetailerId?: string;
  /** The catalog the product SKUs live in — resolved from the channel, not the caller. */
  catalogId?: string;
  /** LOCATION header pin, supplied per send. */
  headerLocation?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  /** Per-card runtime values for a CAROUSEL template, in card order. */
  carouselCards?: TemplateSendCarouselCard[];
  /**
   * The template's stored Meta `components`. Supplied so a button parameter
   * carries the index the button ACTUALLY occupies rather than the order we
   * happen to emit parameters in.
   */
  templateComponents?: unknown;
}): any[] {
  const components: any[] = [];
  // Whether the AUTHORED template is known at all. When it is, the template — not
  // the caller's leftover fields — decides which components may be emitted: Meta
  // refuses a message for a parameter the template did not ask for exactly as
  // firmly as for a missing one. This matters most on the campaign path, where a
  // single shared `templateParams` set is forwarded to every A/B variant and drip
  // step: a coupon or an offer expiry filled in for the base template used to be
  // emitted against a variant that has neither, failing that variant's entire
  // slice of the audience with (#131008).
  const authoredKnown =
    Array.isArray(opts.templateComponents) && opts.templateComponents.length > 0;
  const wantsLto = authoredKnown
    ? templateWantsLtoExpiration(opts.templateComponents)
    : opts.ltoExpirationMs !== undefined;
  if (wantsLto && opts.ltoExpirationMs !== undefined) {
    components.push({
      type: 'limited_time_offer',
      parameters: [
        {
          type: 'limited_time_offer',
          limited_time_offer: { expiration_time_ms: opts.ltoExpirationMs },
        },
      ],
    });
  }
  // WHICH header parameter may be emitted is decided by the TEMPLATE, not by the
  // fields the caller happened to fill in — see buildTemplateHeaderParameter.
  const headerParam = buildTemplateHeaderParameter(
    opts,
    templateHeaderSpec(opts.templateComponents)
  );
  if (headerParam) components.push({ type: 'header', parameters: [headerParam] });
  if (opts.bodyNamedParams?.length) {
    // Named-parameter templates ({{name}}): each parameter MUST carry
    // `parameter_name`, else Meta rejects with (#131008) Required parameter is missing.
    components.push({
      type: 'body',
      parameters: opts.bodyNamedParams.map((p) => ({
        type: 'text',
        parameter_name: p.name,
        text: oneLineParam(p.text),
      })),
    });
  } else if (opts.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: opts.bodyParams.map((text) => ({ type: 'text', text: oneLineParam(text) })),
    });
  }
  // The cards, straight after the bubble's body — the order Meta documents for a
  // carousel send. Sized from the AUTHORED cards, so an operator who filled in
  // three cards of four sends a fourth card with no media (which Meta's error
  // names) rather than a carousel of the wrong length (which it does not).
  // Gated on the TEMPLATE, not on the caller's payload. Trusting
  // opts.carouselCards alone meant stale cards -- carried over in campaign state
  // from a previously-selected template -- were emitted against a template with
  // no carousel component, which Meta rejects for every recipient.
  const cardSpecs = carouselCardSpecs(opts.templateComponents);
  if (cardSpecs.length > 0 && opts.carouselCards?.length) {
    components.push({
      type: 'carousel',
      cards: buildCarouselCards(opts.carouselCards, cardSpecs),
    });
  }
  // Buttons carry the index they occupy in the template's AUTHORED buttons array.
  // Numbering them by the order we emit parameters in was only ever right for a
  // template whose sole button is the parameterised one: the wizard appends the
  // COPY_CODE button after the operator's own buttons, so a coupon template with
  // a quick reply or a static URL button sent index "0" for a button at index >= 1
  // and Meta refused the entire send with (#131008). The positional counter
  // survives only as the fallback for callers that pass no template components.
  const authored = templateButtonIndexes(opts.templateComponents);
  let buttonIndex = 0;
  // One component per DYNAMIC URL button. Meta allows two URL buttons and either
  // may carry a {{n}} suffix; only the first was ever addressed, so the second
  // was sent nothing and Meta refused the whole message with (#131008).
  //
  // Which buttons exist is decided by the TEMPLATE whenever its components are to
  // hand — the same rule the header and the carousel follow. A link value left
  // over from a previously selected template used to be emitted as index 0 against
  // a template with no dynamic URL button at all, which Meta refuses outright.
  const urlValues = urlButtonValues(opts);
  const urlIndexes: Array<number | null> = authoredKnown
    ? authored.urls
    : urlValues.map(() => null);
  urlIndexes.forEach((index, n) => {
    const value = urlValues[n];
    if (!value) return;
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(index ?? buttonIndex),
      parameters: [{ type: 'text', text: oneLineParam(value) }],
    });
    buttonIndex++;
  });
  // Only for a template that actually HAS a copy-code button. A campaign-wide
  // coupon is forwarded to every template the campaign can send, so addressing a
  // button that is not there refused the message outright.
  if (opts.couponCode && (!authoredKnown || authored.copyCode !== null)) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: String(authored.copyCode ?? buttonIndex),
      parameters: [{ type: 'coupon_code', coupon_code: opts.couponCode }],
    });
    buttonIndex++;
  }
  if (opts.otpCode && (!authoredKnown || authored.otp !== null)) {
    // Authentication templates: Meta requires sub_type "url" carrying the same
    // code that appears in the body. Both halves are mandatory — a body parameter
    // alone is rejected with (#131008). The OTP button is normally the template's
    // only button, so index 0 stays the fallback for a caller that supplied no
    // components; when they ARE known, a template with no OTP button is not
    // addressed at all.
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(authored.otp ?? 0),
      parameters: [{ type: 'text', text: oneLineParam(opts.otpCode) }],
    });
  }
  // FLOW. Nothing here is mandatory — Meta defaults `flow_token` — so the
  // component is emitted ONLY for a template that actually has a flow button and
  // only when there is something to say. Addressing a button the template does
  // not have is refused with (#131008) just as firmly as omitting a required one.
  if (authored.flow !== null && (opts.flowToken || opts.flowActionData)) {
    components.push({
      type: 'button',
      sub_type: 'flow',
      index: String(authored.flow),
      parameters: [
        {
          type: 'action',
          action: {
            ...(opts.flowToken ? { flow_token: opts.flowToken } : {}),
            ...(opts.flowActionData ? { flow_action_data: opts.flowActionData } : {}),
          },
        },
      ],
    });
  }
  // CATALOG. The thumbnail is the one thing a catalog template's send can say,
  // and it is optional: omitting the parameters object makes Meta use the first
  // item in the bound catalog. So this is emitted only when a SKU was chosen.
  if (authored.catalog !== null && opts.catalogThumbnailProductId) {
    components.push({
      type: 'button',
      sub_type: 'catalog',
      index: String(authored.catalog),
      parameters: [
        {
          type: 'action',
          action: { thumbnail_product_retailer_id: opts.catalogThumbnailProductId },
        },
      ],
    });
  }
  // MPM. The product sections are the message: they are chosen per send, Meta
  // requires them alongside the thumbnail SKU, and nothing emitted either — so a
  // multi-product template was approvable here and could never be sent.
  if (authored.mpm !== null && opts.productSections?.length) {
    components.push({
      type: 'button',
      sub_type: 'mpm',
      index: String(authored.mpm),
      parameters: [
        {
          type: 'action',
          action: {
            ...(opts.catalogThumbnailProductId
              ? { thumbnail_product_retailer_id: opts.catalogThumbnailProductId }
              : {}),
            // A section with no products is refused by Meta and would fail the
            // whole message, so an empty one is dropped rather than sent.
            sections: opts.productSections
              .map((section) => ({
                title: section.title,
                product_items: section.productRetailerIds
                  .filter((id) => String(id ?? '').trim().length > 0)
                  .map((id) => ({ product_retailer_id: id })),
              }))
              .filter((section) => section.product_items.length > 0),
          },
        },
      ],
    });
  }
  return components;
}

/**
 * Render a template's BODY text with the runtime variable values substituted —
 * the human-readable message we store on the outbound record so the chat bubble
 * shows the actual content (not an empty bubble). Handles both positional
 * ({{1}}) and named ({{name}}) placeholders; leaves any unmatched placeholder
 * as-is. Returns the raw body text when there are no variables (e.g. hello_world).
 */
export function renderTemplateBody(
  components: unknown,
  opts: { bodyParams?: string[]; bodyNamedParams?: Array<{ name: string; text: string }> } = {}
): string {
  const comps = Array.isArray(components)
    ? (components as Array<{ type?: string; text?: string }>)
    : [];
  const body = comps.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
  let text = body?.text ?? '';
  if (!text) return '';
  if (opts.bodyNamedParams?.length) {
    for (const p of opts.bodyNamedParams) {
      text = text.replace(
        new RegExp(`\\{\\{\\s*${escapeRegExp(p.name)}\\s*\\}\\}`, 'g'),
        p.text ?? ''
      );
    }
  }
  if (opts.bodyParams?.length) {
    text = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => opts.bodyParams?.[Number(n) - 1] ?? _m);
  }
  return text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
