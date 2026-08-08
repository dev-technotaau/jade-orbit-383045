import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { graphVersion } from './whatsapp.service';
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
function mapStatus(s?: string): WaTemplateStatus {
  const up = (s ?? '').toUpperCase();
  const allowed = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'];
  if (up === 'PENDING_DELETION') return 'DISABLED';
  return (allowed.includes(up) ? up : 'PENDING') as WaTemplateStatus;
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
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, filters.limit ?? 50);
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

/** Per-template performance, computed from our own outbound message records. */
export async function getTemplateAnalytics(id: string) {
  const tpl = await prisma.waTemplate.findUnique({ where: { id } });
  if (!tpl) return null;
  const base = {
    templateName: tpl.name,
    type: 'TEMPLATE' as const,
    direction: 'OUTBOUND' as const,
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
  };
}

/** Pull the WABA's templates from Meta and upsert them (status/quality/components). */
export async function syncFromMeta(): Promise<{ synced: number }> {
  const { wabaId, token } = metaConfig();
  let url: string | undefined =
    `${GRAPH}/${graphVersion()}/${wabaId}/message_templates?limit=100&fields=name,language,category,status,quality_score,components,id,rejected_reason`;
  let synced = 0;

  while (url) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(
        data?.error?.message ?? `Meta template list failed (${res.status})`,
        502,
        'WA_META_ERROR'
      );
    }
    for (const t of data.data ?? []) {
      await prisma.waTemplate.upsert({
        where: { name_language: { name: t.name, language: t.language } },
        update: {
          metaId: t.id,
          category: mapCategory(t.category),
          status: mapStatus(t.status),
          quality: mapQuality(t.quality_score?.score),
          components: t.components ?? [],
          rejectionReason: t.rejected_reason ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          metaId: t.id,
          name: t.name,
          language: t.language,
          category: mapCategory(t.category),
          status: mapStatus(t.status),
          quality: mapQuality(t.quality_score?.score),
          components: t.components ?? [],
          rejectionReason: t.rejected_reason ?? null,
          lastSyncedAt: new Date(),
        },
      });
      synced++;
    }
    url = data.paging?.next || undefined;
  }
  return { synced };
}

/** Create + submit a template to Meta, persisting the resulting status. */
export async function createTemplate(input: {
  name: string;
  language: string;
  category: WaTemplateCategory;
  components: any[];
  variableSample?: any;
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
  return prisma.waTemplate.upsert({
    where: { name_language: { name: input.name, language: input.language } },
    update: {
      metaId: data.id,
      category: input.category,
      status: mapStatus(data.status ?? 'PENDING'),
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      createdBy: input.createdBy,
      lastSyncedAt: new Date(),
    },
    create: {
      metaId: data.id,
      name: input.name,
      language: input.language,
      category: input.category,
      status: mapStatus(data.status ?? 'PENDING'),
      components: input.components,
      variableSample: input.variableSample ?? undefined,
      createdBy: input.createdBy,
    },
  });
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

  // Step 2 — upload the bytes to the session; Meta returns the file handle `h`.
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const uploadRes = await fetch(`${GRAPH}/${graphVersion()}/${sessionId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0' },
    // Raw bytes. A Node Buffer is a valid body for undici's fetch at runtime,
    // but TS's narrow BodyInit type rejects it — cast through unknown.
    body: buffer as unknown as BodyInit,
  });
  const uploadData: any = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    throw new AppError(uploadData?.error?.message ?? 'Media upload failed', 502, 'WA_META_ERROR');
  }
  if (!uploadData.h) {
    throw new AppError('Media upload returned no handle', 502, 'WA_META_ERROR');
  }
  return uploadData.h;
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
 *    button). Its button index follows any URL button already emitted.
 *  - `ltoExpirationMs` emits a `limited_time_offer` component carrying the offer
 *    countdown's expiration timestamp (epoch ms) for limited-time-offer templates.
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
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { id: opts.headerImageId } }],
    });
  } else if (opts.headerMediaUrl && opts.headerMediaType) {
    const t = opts.headerMediaType;
    components.push({
      type: 'header',
      parameters: [{ type: t, [t]: { link: opts.headerMediaUrl } }],
    });
  } else if (opts.headerText) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: opts.headerText }] });
  }
  if (opts.bodyNamedParams?.length) {
    // Named-parameter templates ({{name}}): each parameter MUST carry
    // `parameter_name`, else Meta rejects with (#131008) Required parameter is missing.
    components.push({
      type: 'body',
      parameters: opts.bodyNamedParams.map((p) => ({
        type: 'text',
        parameter_name: p.name,
        text: p.text,
      })),
    });
  } else if (opts.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: opts.bodyParams.map((text) => ({ type: 'text', text })),
    });
  }
  // Buttons must carry their authored index. The optional URL button is index 0;
  // the COPY_CODE button (when present) follows it.
  let buttonIndex = 0;
  if (opts.buttonUrlParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(buttonIndex),
      parameters: [{ type: 'text', text: opts.buttonUrlParam }],
    });
    buttonIndex++;
  }
  if (opts.couponCode) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: String(buttonIndex),
      parameters: [{ type: 'coupon_code', coupon_code: opts.couponCode }],
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
