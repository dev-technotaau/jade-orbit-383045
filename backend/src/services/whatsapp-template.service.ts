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
  const { wabaId, token } = metaConfig();
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.limit ?? 50)) || 50));
  const qs = new URLSearchParams({ limit: String(limit) });
  if (params.search) qs.set('search', params.search);
  if (params.language) qs.set('language', params.language);
  if (params.category) qs.set('category', params.category);
  if (params.topic) qs.set('topic', params.topic);
  if (params.usecase) qs.set('usecase', params.usecase);

  // Same timeout discipline as syncFromMeta: a hung Graph connection must not
  // hold the request open until the global 30s timeout kills it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIBRARY_TIMEOUT_MS);
  const url = `${GRAPH}/${graphVersion()}/${wabaId}/message_template_library?${qs.toString()}`;
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
    // Meta code 100 on this edge means "no such field on this node" — the
    // library simply is not exposed to this WABA. That is a CAPABILITY answer,
    // not a gateway failure, and throwing 502 for it made every open of the
    // dialog log a red 502 per query (and again on window refocus), which reads
    // as an outage. React Query also retried it. Report it as "unavailable" and
    // let the UI say so, which it already does.
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
  return { items: (data.data ?? []) as WaLibraryTemplate[], unavailable: false };
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
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  /** TEXT header carrying a {{n}} variable — needs headerText at send. */
  headerHasTextVar: boolean;
  /** IMAGE/VIDEO/DOCUMENT header — needs headerMediaUrl or headerImageId. */
  headerNeedsMedia: boolean;
  /** Highest positional {{n}} in the body (0 when none, or when named). */
  bodyPositional: number;
  /** Named {{word}} body variables. */
  bodyNamed: string[];
  /** URL button with a dynamic {{1}} suffix — needs buttonUrlParam. */
  buttonUrlVar: boolean;
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
  /** LIMITED_TIME_OFFER component — needs an expiry timestamp at send. */
  needsLtoExpiration: boolean;
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
 * Parse a stored template's Meta `components` into the parameters a SEND must
 * supply.
 *
 * Deliberately mirrors the frontend `analyzeTemplate()` helper: the UI uses it to
 * render the right inputs, and the server uses it to REFUSE a launch that cannot
 * satisfy them. Client-side checking alone is not enough — a campaign can be
 * created through the API, and a template can be edited in Meta after the
 * campaign was built.
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

  return {
    headerFormat,
    headerHasTextVar: headerFormat === 'TEXT' && varsIn(header?.text).length > 0,
    headerNeedsMedia: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat),
    bodyPositional: positional.length ? Math.max(...positional) : 0,
    bodyNamed: [...new Set(bodyVars.filter((v) => !/^\d+$/.test(v)))],
    headerNeedsLocation: headerFormat === 'LOCATION',
    needsCouponCode: (buttons?.buttons ?? []).some(
      (b: any) => String(b?.type ?? '').toUpperCase() === 'COPY_CODE'
    ),
    needsLtoExpiration: cs.some(
      (c: any) => String(c?.type ?? '').toUpperCase() === 'LIMITED_TIME_OFFER'
    ),
    needsOtpCode: (buttons?.buttons ?? []).some(
      (b: any) => String(b?.type ?? '').toUpperCase() === 'OTP'
    ),
    buttonUrlVar: (buttons?.buttons ?? []).some(
      (b: any) =>
        String(b?.type ?? '').toUpperCase() === 'URL' &&
        /\{\{\s*\d+\s*\}\}/.test(String(b?.url ?? ''))
    ),
    carouselCards: carouselCardSpecs(components),
  };
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
  url: number | null;
  copyCode: number | null;
  otp: number | null;
} {
  const cs: any[] = Array.isArray(components) ? components : [];
  const buttons: any[] =
    cs.find((c) => String(c?.type ?? '').toUpperCase() === 'BUTTONS')?.buttons ?? [];
  const out: { url: number | null; copyCode: number | null; otp: number | null } = {
    url: null,
    copyCode: null,
    otp: null,
  };
  buttons.forEach((b: any, i: number) => {
    const type = String(b?.type ?? '').toUpperCase();
    // Only a URL button carrying a {{n}} suffix takes a send-time parameter — a
    // static URL button must not be addressed at all.
    if (type === 'URL') {
      if (out.url === null && /\{\{\s*\d+\s*\}\}/.test(String(b?.url ?? ''))) out.url = i;
    } else if (type === 'COPY_CODE') {
      if (out.copyCode === null) out.copyCode = i;
    } else if (type === 'OTP') {
      if (out.otp === null) out.otp = i;
    }
  });
  return out;
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
  /** Value for this card's dynamic {{n}} URL-button suffix. */
  buttonUrlParam?: string;
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
      } else if (button.hasUrlVar && card.buttonUrlParam) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(button.index),
          parameters: [{ type: 'text', text: oneLineParam(card.buttonUrlParam) }],
        });
      }
      // A static URL, a call button or a catalog button takes no parameter and
      // must NOT be addressed at all — Meta rejects the send if it is.
    }
    out.push({ card_index: i, components });
  }
  return out;
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
 * Catalog / product templates carry their product set as authored components at
 * create time — `createTemplate` already persists an arbitrary `components` Json,
 * so no extra send-time mapping is needed for those.
 */
export function buildTemplateSendComponents(opts: {
  bodyParams?: string[];
  /** Named body params ({{name}} templates) — Cloud API requires `parameter_name`. */
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  headerImageId?: string;
  /** Header media by public URL (image/video/document) when no uploaded media id. */
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  buttonUrlParam?: string;
  couponCode?: string;
  ltoExpirationMs?: number;
  /** One-time code for an AUTHENTICATION template (body + button parameter). */
  otpCode?: string;
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
  if (opts.ltoExpirationMs !== undefined) {
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
  if (opts.headerImageId) {
    // An uploaded media id is valid for video and document headers too, and it
    // was always emitted as `image` — so picking a file for a DOCUMENT-header
    // template sent Meta an image parameter for a document component and the
    // whole send was rejected. Fall back to 'image' only when the caller did not
    // say (the historical behaviour, and the common case).
    const t = opts.headerMediaType ?? 'image';
    components.push({
      type: 'header',
      parameters: [{ type: t, [t]: { id: opts.headerImageId } }],
    });
  } else if (opts.headerMediaUrl && opts.headerMediaType) {
    const t = opts.headerMediaType;
    components.push({
      type: 'header',
      parameters: [{ type: t, [t]: { link: opts.headerMediaUrl } }],
    });
  } else if (opts.headerLocation) {
    // LOCATION headers are authored with no configuration and the builder told the
    // operator the pin is "filled in per send" — but nothing ever filled it, and
    // the send had no location parameter at all.
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: String(opts.headerLocation.latitude),
            longitude: String(opts.headerLocation.longitude),
            ...(opts.headerLocation.name ? { name: opts.headerLocation.name } : {}),
            ...(opts.headerLocation.address ? { address: opts.headerLocation.address } : {}),
          },
        },
      ],
    });
  } else if (opts.headerText) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: oneLineParam(opts.headerText) }],
    });
  }
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
  if (opts.buttonUrlParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(authored.url ?? buttonIndex),
      parameters: [{ type: 'text', text: oneLineParam(opts.buttonUrlParam) }],
    });
    buttonIndex++;
  }
  if (opts.couponCode) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: String(authored.copyCode ?? buttonIndex),
      parameters: [{ type: 'coupon_code', coupon_code: opts.couponCode }],
    });
    buttonIndex++;
  }
  if (opts.otpCode) {
    // Authentication templates: Meta requires sub_type "url" carrying the same
    // code that appears in the body. Both halves are mandatory — a body parameter
    // alone is rejected with (#131008). The OTP button is normally the template's
    // only button, so index 0 stays the fallback.
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(authored.otp ?? 0),
      parameters: [{ type: 'text', text: oneLineParam(opts.otpCode) }],
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
