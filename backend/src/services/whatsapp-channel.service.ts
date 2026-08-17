import { prisma } from '../config/prisma';
import { env } from '../config/env';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import { encryptField, tryDecryptField, warnIfEncryptionDisabled } from '../utils/encryption';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * WhatsApp channel (connected Business number) management and resolution.
 *
 * Channels used to be entirely env-driven: `getDefaultChannel` read
 * META_WHATSAPP_PHONE_ID and the only mutating route refreshed quality from
 * Meta, so `isDefault`/`isActive` were dead columns and onboarding a second
 * number — or rotating an expired token — meant redeploying the backend with
 * new environment variables. The env now seeds the FIRST channel and nothing
 * more; after that the database is the authority and the console is the way in.
 *
 * Graph version is read inline rather than imported from whatsapp.service:
 * that module resolves a channel's token through this one, and reaching back
 * into it for a one-line default would make the two mutually dependent.
 */
const graphBase = (): string =>
  `https://graph.facebook.com/${env.META_WHATSAPP_API_VERSION || 'v22.0'}`;

/** The fields Meta returns for a phone number, used by sync and by the test. */
const NUMBER_FIELDS =
  'quality_rating,messaging_limit_tier,throughput,display_phone_number,verified_name';

/**
 * Get-or-create a channel for a Meta phone-number id (from webhook metadata).
 *
 * Does NOT touch `isDefault` on an existing row. It used to stamp
 * `isDefault = (phoneNumberId === env.META_WHATSAPP_PHONE_ID)` on every upsert,
 * which was right while the env owned the choice and is wrong now that an
 * operator can pick one: the next webhook from the env number would silently
 * take the badge back off the number they chose, and outbound would move with
 * it. The badge is only ever set here for the very first channel, so a fresh
 * install still has a default before anyone opens the settings page.
 */
export async function getOrCreateChannel(phoneNumberId: string, wabaId?: string) {
  const existing = await prisma.waChannel.findUnique({ where: { phoneNumberId } });
  if (existing) {
    if (wabaId && existing.wabaId !== wabaId) {
      return prisma.waChannel.update({ where: { phoneNumberId }, data: { wabaId } });
    }
    return existing;
  }
  const defaults = await prisma.waChannel.count({ where: { isDefault: true } });
  return prisma.waChannel.create({
    data: {
      phoneNumberId,
      wabaId: wabaId ?? env.META_WHATSAPP_WABA_ID ?? '',
      displayPhone: phoneNumberId,
      isDefault: defaults === 0,
      isActive: true,
    },
  });
}

/**
 * The number outbound goes out from when the caller names no channel of its own.
 *
 * Resolved from the database — the `isDefault` row — with the env used only to
 * seed a first channel on an install that has none. That is the whole point of
 * making channels manageable: every campaign, console-initiated conversation and
 * health call now follows the operator's choice instead of an environment
 * variable that only a redeploy can change. Null when nothing is configured yet.
 */
export async function getDefaultChannel() {
  const chosen = await prisma.waChannel.findFirst({
    where: { isDefault: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (chosen) return chosen;

  const phoneNumberId = env.META_WHATSAPP_PHONE_ID;
  if (!phoneNumberId) return null;
  const channel = await getOrCreateChannel(phoneNumberId, env.META_WHATSAPP_WABA_ID);
  if (channel.isDefault && channel.isActive) return channel;

  // No channel is marked default and active: a fresh install, or a row the
  // webhook created before the env was configured. Promote the env-configured
  // number once. This can never overwrite an operator's choice, because we only
  // reach it when there is no active default at all.
  await prisma.waChannel.updateMany({
    where: { isDefault: true, id: { not: channel.id } },
    data: { isDefault: false },
  });
  return prisma.waChannel.update({
    where: { id: channel.id },
    data: { isDefault: true, isActive: true },
  });
}

/**
 * The Meta phone-number id a channel sends from, cached in-process.
 *
 * Read on every single outbound message, and `phoneNumberId` is the row's
 * natural key so it cannot change under us — a database round-trip per send
 * would buy nothing. The short TTL only covers a channel being deleted and
 * recreated.
 */
const CHANNEL_PHONE_ID_TTL_MS = 5 * 60_000;
const channelPhoneIds = new Map<string, { phoneNumberId: string; at: number }>();

export async function getChannelPhoneNumberId(channelId: string): Promise<string | null> {
  const cached = channelPhoneIds.get(channelId);
  if (cached && Date.now() - cached.at < CHANNEL_PHONE_ID_TTL_MS) return cached.phoneNumberId;
  const row = await prisma.waChannel.findUnique({
    where: { id: channelId },
    select: { phoneNumberId: true },
  });
  if (!row?.phoneNumberId) return null;
  channelPhoneIds.set(channelId, { phoneNumberId: row.phoneNumberId, at: Date.now() });
  return row.phoneNumberId;
}

// ── Per-channel access tokens ────────────────────────────────────────────────
//
// Stored encrypted (utils/encryption) and NEVER returned by the API. A null
// token means "use META_WHATSAPP_TOKEN", so a single-number install that has
// always run off the env keeps working with nothing to configure.

const CHANNEL_TOKEN_TTL_MS = 60_000;
const channelTokens = new Map<string, { token: string | null; at: number }>();

/** Drop a cached token so a rotation takes effect on the next send, not in a minute. */
export function invalidateChannelToken(phoneNumberId?: string): void {
  if (phoneNumberId) channelTokens.delete(phoneNumberId);
  else channelTokens.clear();
}

/**
 * The Cloud API token to send from a given number with.
 *
 * Falls back to the env token, which is what every existing deployment uses. A
 * token that cannot be decrypted is logged and treated as absent rather than
 * passed to Meta as garbage: a 401 from Graph on every send is a far harder
 * thing to diagnose than one line naming the key that is missing.
 */
export async function getChannelAccessToken(
  phoneNumberId?: string | null
): Promise<string | undefined> {
  const fallback = env.META_WHATSAPP_TOKEN;
  if (!phoneNumberId) return fallback;

  const cached = channelTokens.get(phoneNumberId);
  if (cached && Date.now() - cached.at < CHANNEL_TOKEN_TTL_MS) return cached.token ?? fallback;

  const row = await prisma.waChannel
    .findUnique({ where: { phoneNumberId }, select: { accessToken: true } })
    .catch(() => null);

  let token: string | null = null;
  if (row?.accessToken) {
    const result = tryDecryptField(row.accessToken);
    if (result.ok) {
      token = result.value;
    } else {
      logger.error(
        `WhatsApp channel ${phoneNumberId}: stored access token could not be decrypted ` +
          `(${result.error.message}) — falling back to META_WHATSAPP_TOKEN`
      );
    }
  }
  channelTokens.set(phoneNumberId, { token, at: Date.now() });
  return token ?? fallback;
}

/** A channel as the API returns it: no token, just whether one is set. */
function toPublicChannel<T extends { accessToken: string | null }>(row: T) {
  const { accessToken, ...rest } = row;
  return { ...rest, hasToken: accessToken !== null };
}

export async function listChannels() {
  const rows = await prisma.waChannel.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toPublicChannel);
}

export interface CreateChannelInput {
  phoneNumberId: string;
  wabaId?: string;
  displayPhone?: string;
  displayName?: string;
  /** This number's own Cloud API token; omitted means "use the env token". */
  accessToken?: string;
  /** Make it the number outbound goes out from. */
  isDefault?: boolean;
}

/** Connect another WhatsApp number without a redeploy. */
export async function createChannel(input: CreateChannelInput) {
  const phoneNumberId = input.phoneNumberId.trim();
  const existing = await prisma.waChannel.findUnique({ where: { phoneNumberId } });
  if (existing) {
    throw new AppError(
      'That phone number ID is already connected',
      409,
      'WA_CHANNEL_ALREADY_EXISTS'
    );
  }
  if (input.accessToken) warnIfEncryptionDisabled('WhatsApp channel token');

  // The very first channel has to be the default, or nothing would send.
  const defaults = await prisma.waChannel.count({ where: { isDefault: true } });
  const isDefault = input.isDefault === true || defaults === 0;

  const channel = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.waChannel.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.waChannel.create({
      data: {
        phoneNumberId,
        wabaId: input.wabaId?.trim() || env.META_WHATSAPP_WABA_ID || '',
        // Until Meta health sync fills in the real number, the phone-number id is
        // the only thing that tells two connected numbers apart on screen.
        displayPhone: input.displayPhone?.trim() || phoneNumberId,
        displayName: input.displayName?.trim() || null,
        isDefault,
        isActive: true,
        ...(input.accessToken
          ? { accessToken: encryptField(input.accessToken), tokenUpdatedAt: new Date() }
          : {}),
      },
    });
  });
  invalidateChannelToken(phoneNumberId);
  return toPublicChannel(channel);
}

export interface UpdateChannelInput {
  wabaId?: string;
  displayPhone?: string;
  displayName?: string | null;
  /** A new token, or null to clear it and fall back to the env token. */
  accessToken?: string | null;
}

/** Edit a channel's identifiers or rotate its token. */
export async function updateChannel(id: string, patch: UpdateChannelInput) {
  const channel = await prisma.waChannel.findUnique({ where: { id } });
  if (!channel) throw new AppError('Channel not found', 404, 'WA_CHANNEL_NOT_FOUND');

  const data: {
    wabaId?: string;
    displayPhone?: string;
    displayName?: string | null;
    accessToken?: string | null;
    tokenUpdatedAt?: Date | null;
  } = {};
  if (patch.wabaId !== undefined) data.wabaId = patch.wabaId.trim();
  if (patch.displayPhone !== undefined) data.displayPhone = patch.displayPhone.trim();
  if (patch.displayName !== undefined) data.displayName = patch.displayName?.trim() || null;
  if (patch.accessToken !== undefined) {
    if (patch.accessToken) warnIfEncryptionDisabled('WhatsApp channel token');
    data.accessToken = patch.accessToken ? encryptField(patch.accessToken) : null;
    data.tokenUpdatedAt = patch.accessToken ? new Date() : null;
  }

  const updated = await prisma.waChannel.update({ where: { id }, data });
  invalidateChannelToken(channel.phoneNumberId);
  return toPublicChannel(updated);
}

/**
 * Choose the number outbound goes out from.
 *
 * One row carries the badge, enforced in a transaction rather than by a partial
 * unique index so the swap is atomic on every database this runs on: two rows
 * badged "Default" leaves the settings page unable to say which number a new
 * conversation would use, which is the state the old env-stamping produced.
 */
export async function setDefaultChannel(id: string) {
  const channel = await prisma.waChannel.findUnique({ where: { id } });
  if (!channel) throw new AppError('Channel not found', 404, 'WA_CHANNEL_NOT_FOUND');
  if (!channel.isActive) {
    throw new AppError(
      'That channel is deactivated — activate it before making it the default',
      400,
      'WA_CHANNEL_INACTIVE'
    );
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.waChannel.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
    return tx.waChannel.update({ where: { id }, data: { isDefault: true } });
  });
  return toPublicChannel(updated);
}

/**
 * Activate or deactivate a channel.
 *
 * Deactivating the default is refused: `getDefaultChannel` would fall back to
 * the env number, so a number the operator has just switched off would quietly
 * start sending again. Nominate the replacement first.
 */
export async function setChannelActive(id: string, isActive: boolean) {
  const channel = await prisma.waChannel.findUnique({ where: { id } });
  if (!channel) throw new AppError('Channel not found', 404, 'WA_CHANNEL_NOT_FOUND');
  if (!isActive && channel.isDefault) {
    throw new AppError(
      'This is the default number. Make another channel the default before deactivating it.',
      400,
      'WA_CHANNEL_IS_DEFAULT'
    );
  }
  const updated = await prisma.waChannel.update({ where: { id }, data: { isActive } });
  return toPublicChannel(updated);
}

/**
 * Append a health snapshot ONLY when something actually changed.
 *
 * Two writers (the 15-minute cron and the quality webhook) each inserted a row
 * unconditionally, so a healthy channel produced ~96 identical rows a day
 * forever — nothing prunes this table — and the "health history" chart was a
 * flat line drawn from thousands of duplicate points. A snapshot series is only
 * useful if a row means "this is when it changed".
 */
export async function recordChannelHealthSnapshot(
  channelId: string,
  quality: string,
  tier: string | null
): Promise<void> {
  const latest = await prisma.waChannelHealthSnapshot.findFirst({
    where: { channelId },
    orderBy: { createdAt: 'desc' },
    select: { quality: true, tier: true },
  });
  if (latest && latest.quality === quality && (latest.tier ?? null) === tier) return;
  await prisma.waChannelHealthSnapshot.create({ data: { channelId, quality, tier } });
}

/** Ask Meta for one number's quality, tier and verified name. */
async function fetchNumberFromMeta(
  phoneNumberId: string,
  token: string
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(`${graphBase()}/${phoneNumberId}?fields=${NUMBER_FIELDS}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Meta returned ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Pull the live quality rating + messaging tier from Meta onto a channel.
 *
 * `channelId` omitted syncs the default channel (what the cron and the settings
 * button do). Uses that channel's OWN token, so a second number on another WABA
 * is checked with the credential that can actually see it.
 */
export async function syncChannelHealth(channelId?: string) {
  const channel = channelId
    ? await prisma.waChannel.findUnique({ where: { id: channelId } })
    : await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const token = await getChannelAccessToken(channel.phoneNumberId);
  if (!token) throw new AppError('WhatsApp access token missing', 400, 'WA_NOT_CONFIGURED');

  const result = await fetchNumberFromMeta(channel.phoneNumberId, token);
  if (!result.ok) throw new AppError(result.error, 502, 'WA_META_ERROR');

  // `messaging_limit_tier` (the old daily-conversation tier) is no longer
  // returned for numbers on Meta's new per-message pricing model — those expose
  // `throughput.level` (STANDARD ≈ 80 msg/s, HIGH ≈ 1000 msg/s) instead. Fetch
  // both and prefer whichever Meta provides.
  const data = result.data;
  const quality = String(data.quality_rating ?? 'UNKNOWN').toUpperCase();
  await prisma.waChannel.update({
    where: { id: channel.id },
    data: {
      qualityRating: ['GREEN', 'YELLOW', 'RED'].includes(quality) ? (quality as any) : 'UNKNOWN',
      messagingTier: data.messaging_limit_tier ?? data.throughput?.level ?? channel.messagingTier,
      displayPhone: data.display_phone_number ?? channel.displayPhone,
      displayName: data.verified_name ?? channel.displayName,
    },
  });

  // Meta's own send eligibility, in a SEPARATE request on purpose: an account
  // whose token cannot read `health_status` would fail the whole ?fields= list
  // if it were folded into the call above, taking the quality rating — the one
  // number this sync has always produced — down with it.
  await refreshHealthStatus(channel.id, channel.phoneNumberId, token).catch(() => {});

  // Re-read so the reply carries the health columns the call above just wrote.
  // Stripped: this is returned straight to the browser by POST /channels/sync,
  // and the row carries the encrypted access token.
  const updated = await prisma.waChannel.findUniqueOrThrow({ where: { id: channel.id } });
  return toPublicChannel(updated);
}

// ── Send eligibility (`health_status`) ───────────────────────────────────────
//
// Meta will say, before anything is sent, whether the number, its WABA and the
// business behind it are allowed to send at all. Nothing asked: the first sign
// of an ineligible number was a campaign's worth of failed recipients, by which
// point the audience had been materialized and the quality rating had already
// taken the hit.

/** One entity in Meta's eligibility tree (the number, its WABA, the business). */
export interface WaHealthEntity {
  /** PHONE_NUMBER | WABA | BUSINESS | MESSAGE_TEMPLATE. */
  type: string;
  id: string | null;
  /** AVAILABLE | LIMITED | BLOCKED. */
  canSend: string;
  errors: Array<{ code: number | null; description: string; solution: string | null }>;
}

export interface WaHealthStatus {
  /** Did Meta answer at all — false means the CHECK failed, not that sending is blocked. */
  available: boolean;
  /** AVAILABLE | LIMITED | BLOCKED, or null when Meta did not say. */
  canSend: string | null;
  entities: WaHealthEntity[];
  checkedAt: string | null;
  error?: string;
}

/** Normalise Graph's `health_status` block into the shape the console renders. */
function normalizeHealthStatus(raw: any): { canSend: string | null; entities: WaHealthEntity[] } {
  const canSend =
    typeof raw?.can_send_message === 'string' ? raw.can_send_message.toUpperCase() : null;
  const entities: WaHealthEntity[] = Array.isArray(raw?.entities)
    ? raw.entities.map((e: any) => ({
        type: String(e?.entity_type ?? 'UNKNOWN').toUpperCase(),
        id: e?.id != null ? String(e.id) : null,
        canSend: String(e?.can_send_message ?? 'UNKNOWN').toUpperCase(),
        errors: Array.isArray(e?.errors)
          ? e.errors.map((err: any) => ({
              code: Number.isFinite(Number(err?.error_code)) ? Number(err.error_code) : null,
              description: String(err?.error_description ?? ''),
              solution: err?.possible_solution ? String(err.possible_solution) : null,
            }))
          : [],
      }))
    : [];
  return { canSend, entities };
}

/**
 * Read `health_status` off ANY Graph node that carries it — a phone number or a
 * message template. Shared so the campaign pre-flight asks about the template
 * with exactly the same parsing and the same never-throws contract as the
 * channel sync uses for the number.
 */
export async function fetchNodeHealthStatus(
  nodeId: string,
  token: string
): Promise<WaHealthStatus> {
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(`${graphBase()}/${nodeId}?fields=health_status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        available: false,
        canSend: null,
        entities: [],
        checkedAt: null,
        error: body?.error?.message ?? `Meta returned ${res.status}`,
      };
    }
    const { canSend, entities } = normalizeHealthStatus(body?.health_status);
    return { available: true, canSend, entities, checkedAt: new Date().toISOString() };
  } catch (e) {
    return {
      available: false,
      canSend: null,
      entities: [],
      checkedAt: null,
      error: (e as Error).message,
    };
  }
}

/** Fetch `health_status` for one number and write it onto the channel row. */
async function refreshHealthStatus(
  channelId: string,
  phoneNumberId: string,
  token: string
): Promise<WaHealthStatus> {
  const status = await fetchNodeHealthStatus(phoneNumberId, token);
  if (!status.available) return status;
  await prisma.waChannel.update({
    where: { id: channelId },
    data: {
      healthStatus: status.canSend,
      healthEntities: status.entities as any,
      healthCheckedAt: new Date(status.checkedAt as string),
    },
  });
  return status;
}

/**
 * Meta's live send eligibility for a number — the pre-flight check.
 *
 * Answers rather than throws when Graph refuses: an eligibility check that
 * could not be made is not the same as a number that cannot send, and failing a
 * campaign preview over it would be worse than saying so.
 */
export async function getPhoneHealthStatus(channelId?: string): Promise<WaHealthStatus> {
  const { channel, token } = await channelWithToken(channelId);
  return refreshHealthStatus(channel.id, channel.phoneNumberId, token);
}

// ── Access-token lifecycle ───────────────────────────────────────────────────
//
// Nothing ever asked Meta whether the credential was still valid. An operator
// who pasted a 24-hour or 60-day USER token instead of a system-user token — the
// README's step 2 is one line — had a console that worked for a day and then
// failed every single send with an OAuth error that surfaced only as per-message
// FAILED rows, with nothing anywhere naming the cause.

/** Below this many days to expiry the token is called out as needing replacing. */
export const TOKEN_EXPIRY_WARN_DAYS = 7;

export interface WaTokenHealth {
  /** Did `debug_token` answer at all. */
  ok: boolean;
  /** Meta's own verdict. False means every send is already failing with OAuth 190. */
  valid: boolean;
  /** Null for a never-expiring system-user token — Meta reports `expires_at: 0`. */
  expiresAt: string | null;
  /** Whole days until expiry; null when it never expires. */
  daysRemaining: number | null;
  scopes: string[];
  checkedAt: string | null;
  error?: string;
}

/**
 * The credential `debug_token` is inspected WITH.
 *
 * Meta wants an app access token (`{app-id}|{app-secret}`) here. Falling back to
 * the token under inspection works for a system-user token issued to the same
 * app, which is the normal single-tenant setup — so the check still runs on an
 * install that never configured the app secret.
 */
function debugTokenCredential(inputToken: string): string {
  const appId = env.META_WHATSAPP_APP_ID;
  const appSecret = env.META_WHATSAPP_APP_SECRET;
  return appId && appSecret ? `${appId}|${appSecret}` : inputToken;
}

/**
 * Ask Meta when this number's access token expires, and persist the answer.
 *
 * Answers rather than throws, for the same reason as `testChannel`: a failed
 * check is something to report on the settings page, not a reason to fail the
 * health cron that also carries the quality rating.
 */
export async function checkTokenHealth(channelId?: string): Promise<WaTokenHealth> {
  const { channel, token } = await channelWithToken(channelId);
  const checkedAt = new Date();
  const params = new URLSearchParams({
    input_token: token,
    access_token: debugTokenCredential(token),
  });
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(`${graphBase()}/debug_token?${params.toString()}`);
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        valid: false,
        expiresAt: null,
        daysRemaining: null,
        scopes: [],
        checkedAt: null,
        error: body?.error?.message ?? `Meta returned ${res.status}`,
      };
    }
    const data = body?.data ?? {};
    const valid = data.is_valid === true;
    // `expires_at: 0` is Meta for 'never expires' — a system-user token, which is
    // the only credential this product should be running on. Storing the epoch
    // instead would have read as 'expired in 1970' on every settings page.
    const expiresAtSec = Number(data.expires_at ?? 0);
    const expiresAt =
      Number.isFinite(expiresAtSec) && expiresAtSec > 0 ? new Date(expiresAtSec * 1000) : null;
    const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : [];
    await prisma.waChannel.update({
      where: { id: channel.id },
      data: {
        tokenValid: valid,
        tokenExpiresAt: expiresAt,
        tokenScopes: scopes,
        tokenCheckedAt: checkedAt,
      },
    });
    return {
      ok: true,
      valid,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: expiresAt
        ? Math.floor((expiresAt.getTime() - checkedAt.getTime()) / 86_400_000)
        : null,
      scopes,
      checkedAt: checkedAt.toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      valid: false,
      expiresAt: null,
      daysRemaining: null,
      scopes: [],
      checkedAt: null,
      error: (e as Error).message,
    };
  }
}

// ── Business profile + number registration ───────────────────────────────────
//
// The only phone-number call this module ever made was a READ of quality and
// tier. Everything a customer actually sees about the number — the about line,
// the description, the address, the email, the websites, the category, the
// profile photo — lived exclusively in Meta Business Manager, as did registering
// the number and setting its mandatory six-digit two-step PIN. A console sold to
// manage a WhatsApp number could not manage that number's identity at all.

/** The profile fields Meta returns, and the only ones this module writes. */
const PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';

/**
 * Meta's fixed industry list for `vertical`. Anything outside it is rejected by
 * Graph, so it is enumerated here (and mirrored in the settings form) rather
 * than discovered from a 400.
 */
export const WA_PROFILE_VERTICALS = [
  'UNDEFINED',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'NOT_A_BIZ',
] as const;
export type WaProfileVertical = (typeof WA_PROFILE_VERTICALS)[number];

export interface WaBusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
}

/** Resolve the channel + a usable token, or fail with the reason. */
async function channelWithToken(channelId?: string) {
  const channel = channelId
    ? await prisma.waChannel.findUnique({ where: { id: channelId } })
    : await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const token = await getChannelAccessToken(channel.phoneNumberId);
  if (!token) throw new AppError('WhatsApp access token missing', 400, 'WA_NOT_CONFIGURED');
  return { channel, token };
}

/** POST to a phone-number edge, surfacing Meta's own message on failure. */
async function postToNumber(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<any> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let res: Response;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    res = await fetch(`${graphBase()}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AppError((e as Error).message, 502, 'WA_META_ERROR');
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data?.error?.error_user_msg ?? data?.error?.message ?? `Meta returned ${res.status}`,
      502,
      'WA_META_ERROR'
    );
  }
  return data;
}

/** The customer-facing profile for a number, straight from Meta. */
export async function getBusinessProfile(channelId?: string): Promise<WaBusinessProfile> {
  const { channel, token } = await channelWithToken(channelId);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let res: Response;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    res = await fetch(
      `${graphBase()}/${channel.phoneNumberId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    throw new AppError((e as Error).message, 502, 'WA_META_ERROR');
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(body?.error?.message ?? `Meta returned ${res.status}`, 502, 'WA_META_ERROR');
  }
  // Graph wraps the profile in a single-element `data` array.
  const p = (Array.isArray(body?.data) ? body.data[0] : body) ?? {};
  return {
    about: p.about ?? null,
    address: p.address ?? null,
    description: p.description ?? null,
    email: p.email ?? null,
    profilePictureUrl: p.profile_picture_url ?? null,
    websites: Array.isArray(p.websites) ? p.websites.map(String) : [],
    vertical: p.vertical ?? null,
  };
}

export interface UpdateBusinessProfileInput {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  /** Resumable-upload handle for a new profile photo (see uploadHeaderSampleHandle). */
  profilePictureHandle?: string;
}

/**
 * Write the customer-facing profile back to Meta, then read it again.
 *
 * Only the keys the caller supplied are sent: Graph treats an omitted field as
 * "leave it alone", so copying every key here would blank whatever the operator
 * did not fill in. Meta's own limits (about 139 chars, description 512, at most
 * two websites) are enforced by the request schema, so the operator gets a
 * field-level message instead of an opaque Graph 400.
 */
export async function updateBusinessProfile(
  channelId: string | undefined,
  patch: UpdateBusinessProfileInput
): Promise<WaBusinessProfile> {
  const { channel, token } = await channelWithToken(channelId);
  const body: Record<string, unknown> = { messaging_product: 'whatsapp' };
  if (patch.about !== undefined) body.about = patch.about;
  if (patch.address !== undefined) body.address = patch.address;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.websites !== undefined) body.websites = patch.websites;
  if (patch.vertical !== undefined) body.vertical = patch.vertical;
  if (patch.profilePictureHandle !== undefined) {
    body.profile_picture_handle = patch.profilePictureHandle;
  }
  if (Object.keys(body).length === 1) return getBusinessProfile(channel.id);

  await postToNumber(`${channel.phoneNumberId}/whatsapp_business_profile`, token, body);
  // Read back rather than echo the patch: Meta normalises several of these
  // fields, and the settings form has to show what customers will actually see.
  return getBusinessProfile(channel.id);
}

/**
 * Register (or re-register) the number for Cloud API use with its six-digit
 * two-step PIN.
 *
 * This is the step a number migration needs, and it was only possible in Meta
 * Business Manager. `pin` is NEVER stored — Meta is the only place it needs to
 * exist; what is stored is when it was last set, which is the question an
 * operator actually asks afterwards.
 */
export async function registerPhoneNumber(channelId: string | undefined, pin: string) {
  const { channel, token } = await channelWithToken(channelId);
  await postToNumber(`${channel.phoneNumberId}/register`, token, {
    messaging_product: 'whatsapp',
    pin,
  });
  const now = new Date();
  const updated = await prisma.waChannel.update({
    where: { id: channel.id },
    data: { registeredAt: now, pinUpdatedAt: now },
  });
  return toPublicChannel(updated);
}

/**
 * Deregister the number from the Cloud API.
 *
 * Leaves the channel row otherwise intact: the conversation history on this
 * number is still the operator's, and dropping it because the number moved to
 * another platform would be unrecoverable.
 */
export async function deregisterPhoneNumber(channelId?: string) {
  const { channel, token } = await channelWithToken(channelId);
  await postToNumber(`${channel.phoneNumberId}/deregister`, token, {});
  const updated = await prisma.waChannel.update({
    where: { id: channel.id },
    data: { registeredAt: null },
  });
  return toPublicChannel(updated);
}

/**
 * Rotate the two-step verification PIN on an already-registered number.
 *
 * Separate from `registerPhoneNumber` because they are different operations at
 * Meta and different intents here: one brings a number online, the other changes
 * a credential on a number that is already carrying traffic.
 */
export async function setTwoStepPin(channelId: string | undefined, pin: string) {
  const { channel, token } = await channelWithToken(channelId);
  await postToNumber(String(channel.phoneNumberId), token, { pin });
  const updated = await prisma.waChannel.update({
    where: { id: channel.id },
    data: { pinUpdatedAt: new Date() },
  });
  return toPublicChannel(updated);
}

// ── Commerce (catalog) settings ──────────────────────────────────────────────
//
// There was no commerce support at all: the template wizard could attach a
// CATALOG button, and the catalog it opened could not be bound, browsed or
// configured from here — so an operator could get a catalog template approved
// and then had no way to make it point at anything, and the resulting cart came
// back as an UNSUPPORTED message with no line items.

export interface WaCommerceSettings {
  /** Customers can add to a cart and submit an order from the catalog. */
  isCartEnabled: boolean;
  /** The catalog is reachable from the business profile. */
  isCatalogVisible: boolean;
  /** Catalog bound to this number — the id every product message must carry. */
  catalogId: string | null;
  /** Catalogs connected to this number's WABA, for the picker. */
  catalogs: Array<{ id: string; name: string }>;
}

/** Catalogs connected to a WABA. Answers [] rather than throwing — the picker is optional. */
async function fetchWabaCatalogs(
  wabaId: string,
  token: string
): Promise<Array<{ id: string; name: string }>> {
  if (!wabaId) return [];
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(`${graphBase()}/${wabaId}/product_catalogs?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body?.data)) return [];
    return body.data.map((c: any) => ({ id: String(c.id), name: String(c.name ?? c.id) }));
  } catch {
    // A WABA with no Commerce Manager setup answers with a permission error;
    // that is a normal state, not something to fail the settings page over.
    return [];
  }
}

/** Cart/catalog visibility for a number, plus the catalogs it could be bound to. */
export async function getCommerceSettings(channelId?: string): Promise<WaCommerceSettings> {
  const { channel, token } = await channelWithToken(channelId);
  let settings: any = {};
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(`${graphBase()}/${channel.phoneNumberId}/whatsapp_commerce_settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) settings = (Array.isArray(body?.data) ? body.data[0] : body) ?? {};
  } catch {
    /* fall through to the defaults below — the local catalog binding still shows */
  }
  return {
    isCartEnabled: settings.is_cart_enabled === true,
    isCatalogVisible: settings.is_catalog_visible === true,
    catalogId: channel.catalogId,
    catalogs: await fetchWabaCatalogs(channel.wabaId, token),
  };
}

/**
 * Turn the cart / catalog visibility on or off, and bind the catalog product
 * messages will be addressed against.
 *
 * The two halves land in different places on purpose: cart and visibility are
 * Meta's state for the NUMBER, while the bound catalog id is ours — Meta has no
 * per-number catalog field, and a single/multi-product message has to name a
 * catalog explicitly at send time.
 */
export async function updateCommerceSettings(
  channelId: string | undefined,
  patch: { isCartEnabled?: boolean; isCatalogVisible?: boolean; catalogId?: string | null }
): Promise<WaCommerceSettings> {
  const { channel, token } = await channelWithToken(channelId);

  if (patch.isCartEnabled !== undefined || patch.isCatalogVisible !== undefined) {
    const params = new URLSearchParams();
    if (patch.isCartEnabled !== undefined) {
      params.set('is_cart_enabled', String(patch.isCartEnabled));
    }
    if (patch.isCatalogVisible !== undefined) {
      params.set('is_catalog_visible', String(patch.isCatalogVisible));
    }
    await postToNumber(
      `${channel.phoneNumberId}/whatsapp_commerce_settings?${params.toString()}`,
      token,
      {}
    );
  }
  if (patch.catalogId !== undefined) {
    await prisma.waChannel.update({
      where: { id: channel.id },
      data: { catalogId: patch.catalogId || null },
    });
  }
  return getCommerceSettings(channel.id);
}

/** Meta's own caps on the conversational-automation edge. */
export const WA_ICE_BREAKER_MAX = 4;
export const WA_ICE_BREAKER_TEXT_MAX = 80;
export const WA_COMMAND_MAX = 30;
export const WA_COMMAND_NAME_MAX = 32;
export const WA_COMMAND_DESCRIPTION_MAX = 256;

/**
 * What a customer sees BEFORE they have written anything — Meta's native
 * conversational components for the number.
 *
 * `enableWelcomeMessage` makes Meta send us a `request_welcome` webhook the
 * moment a customer opens the thread; the ice breakers (`prompts`) are the
 * tappable suggestions shown on an empty chat; `commands` are the slash-commands
 * the composer offers.
 */
export interface WaConversationalAutomation {
  enableWelcomeMessage: boolean;
  prompts: string[];
  commands: Array<{ name: string; description: string }>;
}

/**
 * Read the number's conversational automation.
 *
 * It hangs off the phone-number node as a field rather than living on a sub-edge
 * of its own, so this is a `?fields=` read, not a GET on
 * `/conversational_automation`.
 */
export async function getConversationalAutomation(
  channelId?: string
): Promise<WaConversationalAutomation> {
  const { channel, token } = await channelWithToken(channelId);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let res: Response;
  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    res = await fetch(
      `${graphBase()}/${channel.phoneNumberId}?fields=conversational_automation`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    throw new AppError((e as Error).message, 502, 'WA_META_ERROR');
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(body?.error?.message ?? `Meta returned ${res.status}`, 502, 'WA_META_ERROR');
  }
  const ca = body?.conversational_automation ?? {};
  return {
    enableWelcomeMessage: ca.enable_welcome_message === true,
    prompts: Array.isArray(ca.prompts) ? ca.prompts.map(String) : [],
    commands: Array.isArray(ca.commands)
      ? ca.commands.map((c: any) => ({
          name: String(c?.command_name ?? ''),
          description: String(c?.command_description ?? ''),
        }))
      : [],
  };
}

/**
 * Write the number's conversational automation, then read it back.
 *
 * A first-time customer opened the thread to an empty screen: no ice breakers,
 * no command list, no welcome. The product's own greeting and FAQ menu only fire
 * AFTER an inbound message, so the customer had to guess what to type before the
 * console could offer them anything — which is exactly the friction ice breakers
 * exist to remove, and it could only be configured in Meta Business Manager.
 *
 * Meta REPLACES the whole set on every write (there is no per-prompt edit), so
 * an omitted key is filled in from the current value rather than sent empty —
 * otherwise saving the commands alone would silently delete the ice breakers.
 */
export async function updateConversationalAutomation(
  channelId: string | undefined,
  patch: Partial<WaConversationalAutomation>
): Promise<WaConversationalAutomation> {
  const { channel, token } = await channelWithToken(channelId);
  const current = await getConversationalAutomation(channel.id);
  const next: WaConversationalAutomation = {
    enableWelcomeMessage: patch.enableWelcomeMessage ?? current.enableWelcomeMessage,
    prompts: patch.prompts ?? current.prompts,
    commands: patch.commands ?? current.commands,
  };

  const params = new URLSearchParams();
  params.set('enable_welcome_message', String(next.enableWelcomeMessage));
  params.set('prompts', JSON.stringify(next.prompts));
  params.set(
    'commands',
    JSON.stringify(
      next.commands.map((c) => ({ command_name: c.name, command_description: c.description }))
    )
  );
  await postToNumber(
    `${channel.phoneNumberId}/conversational_automation?${params.toString()}`,
    token,
    {}
  );
  // Read back rather than echo the patch: Meta trims and normalises the strings,
  // and the settings form has to show what customers will actually be offered.
  return getConversationalAutomation(channel.id);
}

/**
 * The catalog a product message from this channel is addressed against.
 *
 * Falls back to the default channel's binding so a send from a number that has
 * not been bound individually still works on a single-catalog account.
 */
export async function getChannelCatalogId(channelId: string): Promise<string | null> {
  const row = await prisma.waChannel.findUnique({
    where: { id: channelId },
    select: { catalogId: true },
  });
  if (row?.catalogId) return row.catalogId;
  const fallback = await prisma.waChannel.findFirst({
    where: { isDefault: true, catalogId: { not: null } },
    select: { catalogId: true },
  });
  return fallback?.catalogId ?? null;
}

/**
 * Can we still talk to Meta as this number?
 *
 * Answers rather than throws. An expired or revoked token is the failure this
 * exists to surface, and it used to reach the operator as a generic red toast
 * from the health sync — no indication that the credential was the problem, and
 * nothing they could press to find out. The reply names what Meta said.
 */
export async function testChannel(id: string): Promise<{
  ok: boolean;
  usingEnvToken: boolean;
  displayPhone?: string;
  displayName?: string | null;
  qualityRating?: string;
  /** What Meta says about the credential itself — expiry, scopes, validity. */
  token?: WaTokenHealth;
  /** Meta's send eligibility for the number, its WABA and the business. */
  health?: WaHealthStatus;
  error?: string;
}> {
  const channel = await prisma.waChannel.findUnique({ where: { id } });
  if (!channel) throw new AppError('Channel not found', 404, 'WA_CHANNEL_NOT_FOUND');
  const usingEnvToken = channel.accessToken === null;
  const token = await getChannelAccessToken(channel.phoneNumberId);
  if (!token) {
    return {
      ok: false,
      usingEnvToken,
      error: 'No access token is configured for this channel, and META_WHATSAPP_TOKEN is unset.',
    };
  }

  const result = await fetchNumberFromMeta(channel.phoneNumberId, token);
  if (!result.ok) return { ok: false, usingEnvToken, error: result.error };
  // A number that answers today is not the same as a number that will still be
  // sending next week: a 60-day user token passes this test right up until the
  // hour it lapses. Ask when it expires while we are here, and refresh Meta's
  // own eligibility verdict, so 'Test connections' answers the question the
  // operator actually has rather than only the one they typed.
  const [tokenHealth, health] = await Promise.all([
    checkTokenHealth(channel.id),
    refreshHealthStatus(channel.id, channel.phoneNumberId, token),
  ]);
  return {
    ok: true,
    usingEnvToken,
    displayPhone: result.data.display_phone_number ?? channel.displayPhone,
    displayName: result.data.verified_name ?? channel.displayName,
    qualityRating: String(result.data.quality_rating ?? 'UNKNOWN').toUpperCase(),
    token: tokenHealth,
    health,
  };
}
