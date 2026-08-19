import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import { env } from '../config/env';
import { metaFlowIdFromToken } from './whatsapp-template.service';

/**
 * WhatsApp Flows — Meta's native multi-screen forms.
 *
 * The module could already SEND a flow by id (whatsapp-send.service.ts, kind
 * 'flow') and parsed the `nfm_reply` that comes back. Everything around that was
 * missing: no way to see which flows exist, what state they are in, or to publish
 * one — so an operator worked inside Meta's Flow Builder and copied ids across by
 * hand, with no local record of what was actually deployed.
 *
 * This wraps the Flows Management API and keeps a local mirror (WaFlow) so the
 * console can list, publish, deprecate and preview them.
 */

const GRAPH = 'https://graph.facebook.com';

/**
 * Meta’s Graph responses are open-ended, but everything this service reads is
 * either a declared field or accessed defensively. Typed rather than `any` so the
 * lint ratchet keeps meaning something.
 */
interface GraphJson {
  [key: string]: unknown;
  id?: string | number;
  data?: Array<Record<string, unknown>>;
  paging?: { cursors?: { after?: string } };
  preview?: { preview_url?: string; expires_at?: string };
  validation_errors?: unknown;
  error?: { message?: string; error_user_msg?: string };
}
const graphVersion = () => env.META_WHATSAPP_API_VERSION || 'v22.0';

function metaConfig(): { wabaId: string; token: string } {
  const wabaId = env.META_WHATSAPP_WABA_ID;
  const token = env.META_WHATSAPP_TOKEN;
  if (!wabaId || !token) {
    throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  }
  return { wabaId, token };
}

/** Every Flows call goes through here so error shape and auth stay consistent. */
async function graph(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {}
): Promise<GraphJson> {
  const { token } = metaConfig();
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(`${GRAPH}/${graphVersion()}/${path}${qs}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as GraphJson;
  if (!res.ok) {
    throw new AppError(
      data?.error?.error_user_msg ?? data?.error?.message ?? 'Flows API call failed',
      400,
      'WA_FLOW_API_FAILED'
    );
  }
  return data;
}

/** Local mirror, newest first. */
export async function listFlows() {
  return prisma.waFlow.findMany({ orderBy: { updatedAt: 'desc' } });
}

export async function getFlow(id: string) {
  const flow = await prisma.waFlow.findUnique({ where: { id } });
  if (!flow) throw new AppError('Flow not found', 404, 'WA_FLOW_NOT_FOUND');
  return flow;
}

/**
 * Pull every flow on the WABA and upsert it locally.
 *
 * Paginated deliberately: Meta pages `/flows`, and a single unpaginated page was
 * exactly the bug that made template sync silently miss templates.
 */
export async function syncFlows(): Promise<{ synced: number }> {
  const { wabaId } = metaConfig();
  let after: string | undefined;
  let synced = 0;

  do {
    const page = await graph(`${wabaId}/flows`, {
      query: {
        limit: '50',
        fields: 'id,name,status,categories,validation_errors,endpoint_uri',
        ...(after ? { after } : {}),
      },
    });
    for (const f of page?.data ?? []) {
      await prisma.waFlow.upsert({
        where: { metaId: String(f.id) },
        update: {
          name: String(f.name ?? 'Untitled'),
          status: String(f.status ?? 'DRAFT').toUpperCase(),
          categories: Array.isArray(f.categories) ? f.categories.map(String) : [],
          endpointUri: typeof f.endpoint_uri === 'string' ? f.endpoint_uri : null,
          validationErrors: (f.validation_errors as never) ?? undefined,
          lastSyncedAt: new Date(),
        },
        create: {
          metaId: String(f.id),
          name: String(f.name ?? 'Untitled'),
          status: String(f.status ?? 'DRAFT').toUpperCase(),
          categories: Array.isArray(f.categories) ? f.categories.map(String) : [],
          endpointUri: typeof f.endpoint_uri === 'string' ? f.endpoint_uri : null,
          validationErrors: (f.validation_errors as never) ?? undefined,
          lastSyncedAt: new Date(),
        },
      });
      synced += 1;
    }
    after = page?.paging?.cursors?.after;
  } while (after);

  logger.info(`WhatsApp Flows sync complete: ${synced} flow(s)`);
  return { synced };
}

/** Create a flow on Meta (DRAFT) and mirror it locally. */
export async function createFlow(input: {
  name: string;
  categories: string[];
  endpointUri?: string;
}) {
  const { wabaId } = metaConfig();
  const data = await graph(`${wabaId}/flows`, {
    method: 'POST',
    body: {
      name: input.name,
      categories: input.categories,
      ...(input.endpointUri ? { endpoint_uri: input.endpointUri } : {}),
    },
  });
  return prisma.waFlow.create({
    data: {
      metaId: String(data.id),
      name: input.name,
      status: 'DRAFT',
      categories: input.categories,
      endpointUri: input.endpointUri ?? null,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Replace a flow's JSON.
 *
 * Meta validates on upload and returns `validation_errors` rather than failing
 * the request, so those are persisted and surfaced instead of being swallowed —
 * an invalid flow that looks saved is worse than a rejected one.
 */
export async function updateFlowJson(id: string, flowJson: unknown) {
  const flow = await getFlow(id);
  const data = await graph(`${flow.metaId}/assets`, {
    method: 'POST',
    body: { name: 'flow.json', asset_type: 'FLOW_JSON', file: JSON.stringify(flowJson) },
  });
  return prisma.waFlow.update({
    where: { id },
    data: {
      flowJson: flowJson as never,
      validationErrors: data?.validation_errors ?? undefined,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Publish. Irreversible in one direction: a published flow can be deprecated but
 * never returned to draft, so the caller is expected to confirm first.
 */
export async function publishFlow(id: string) {
  const flow = await getFlow(id);
  await graph(`${flow.metaId}/publish`, { method: 'POST' });
  return prisma.waFlow.update({
    where: { id },
    data: { status: 'PUBLISHED', lastSyncedAt: new Date() },
  });
}

/** Deprecate a published flow. It stops being sendable; existing sessions finish. */
export async function deprecateFlow(id: string) {
  const flow = await getFlow(id);
  await graph(`${flow.metaId}/deprecate`, { method: 'POST' });
  return prisma.waFlow.update({
    where: { id },
    data: { status: 'DEPRECATED', lastSyncedAt: new Date() },
  });
}

/** Delete a DRAFT flow. Meta refuses for anything published. */
export async function deleteFlow(id: string) {
  const flow = await getFlow(id);
  await graph(String(flow.metaId), { method: 'DELETE' });
  await prisma.waFlow.delete({ where: { id } });
  return { deleted: true };
}

/**
 * A short-lived web preview URL, so the flow can be reviewed without sending it
 * to a real customer. Meta expires these, so the expiry is stored alongside.
 */
export async function getFlowPreview(id: string) {
  const flow = await getFlow(id);
  const data = await graph(String(flow.metaId), { query: { fields: 'preview.invalidate(false)' } });
  const url: string | undefined = data?.preview?.preview_url;
  const expires = data?.preview?.expires_at ? new Date(data.preview.expires_at) : null;
  await prisma.waFlow.update({
    where: { id },
    data: { previewUrl: url ?? null, previewExpires: expires },
  });
  return { previewUrl: url ?? null, expiresAt: expires };
}

/** Submissions for a flow (or all flows when no id is given). */
export async function listFlowResponses(flowId?: string, page = 1, limit = 20) {
  const where = flowId ? { flowId } : {};
  const [items, total] = await Promise.all([
    prisma.waFlowResponse.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.waFlowResponse.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Promote an inbound `nfm_reply` into a queryable submission row.
 *
 * The inbound worker already parsed the reply into WaMessage.payload, where
 * nothing read it — so what a customer actually filled in was captured and
 * invisible. Best-effort: a failure here must never break message ingestion.
 */
export async function recordFlowResponse(input: {
  conversationId: string;
  contactId: string;
  messageId: string;
  flowToken?: string | null;
  responseJson: unknown;
}): Promise<void> {
  try {
    // The reply carries the token we sent, not the flow id, so resolve the flow
    // through the token when we can and leave it null rather than guessing.
    const flow = input.flowToken
      ? await prisma.waFlowResponse
          .findFirst({ where: { flowToken: input.flowToken }, select: { flowId: true } })
          .catch(() => null)
      : null;

    // The lookup above can only ever find a flow on the SECOND submission under
    // one token — nothing seeds that table with a flowId — so in practice every
    // row landed with `flowId: null` and the Flows page's per-flow response list
    // was empty however many customers completed the Flow. A token minted by the
    // template send path names the Flow itself (see mintTemplateFlowToken), so
    // decode it when the lookup comes back empty.
    let flowId = flow?.flowId ?? null;
    if (!flowId) {
      const metaId = metaFlowIdFromToken(input.flowToken);
      if (metaId) {
        flowId =
          (
            await prisma.waFlow
              .findUnique({ where: { metaId }, select: { id: true } })
              .catch(() => null)
          )?.id ?? null;
      }
    }

    await prisma.waFlowResponse.create({
      data: {
        conversationId: input.conversationId,
        contactId: input.contactId,
        messageId: input.messageId,
        flowToken: input.flowToken ?? null,
        flowId,
        responseJson: input.responseJson as never,
      },
    });
  } catch (err) {
    logger.warn(
      `Failed to record WhatsApp Flow response for message ${input.messageId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }
}
