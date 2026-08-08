import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { graphVersion } from './whatsapp.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * WhatsApp channel (connected Business number) resolution. Platform-scoped —
 * usually one channel, but modelled as many so multiple numbers can coexist.
 */

/** Get-or-create a channel for a Meta phone-number id (from webhook metadata). */
export async function getOrCreateChannel(phoneNumberId: string, wabaId?: string) {
  return prisma.waChannel.upsert({
    where: { phoneNumberId },
    update: wabaId ? { wabaId } : {},
    create: {
      phoneNumberId,
      wabaId: wabaId ?? env.META_WHATSAPP_WABA_ID ?? '',
      displayPhone: phoneNumberId,
      isDefault: true,
      isActive: true,
    },
  });
}

/** The default channel (from env). Null when WhatsApp isn't configured yet. */
export async function getDefaultChannel() {
  const phoneNumberId = env.META_WHATSAPP_PHONE_ID;
  if (!phoneNumberId) return null;
  return getOrCreateChannel(phoneNumberId, env.META_WHATSAPP_WABA_ID);
}

export async function listChannels() {
  return prisma.waChannel.findMany({ orderBy: { createdAt: 'asc' } });
}

/** Pull the live quality rating + messaging tier from Meta onto the channel. */
export async function syncChannelHealth() {
  const channel = await getDefaultChannel();
  if (!channel) throw new AppError('WhatsApp is not configured', 400, 'WA_NOT_CONFIGURED');
  const token = env.META_WHATSAPP_TOKEN;
  if (!token) throw new AppError('WhatsApp access token missing', 400, 'WA_NOT_CONFIGURED');

  // `messaging_limit_tier` (the old daily-conversation tier) is no longer
  // returned for numbers on Meta's new per-message pricing model — those expose
  // `throughput.level` (STANDARD ≈ 80 msg/s, HIGH ≈ 1000 msg/s) instead. Fetch
  // both and prefer whichever Meta provides.
  const fields =
    'quality_rating,messaging_limit_tier,throughput,display_phone_number,verified_name';
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${channel.phoneNumberId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(data?.error?.message ?? 'Channel health sync failed', 502, 'WA_META_ERROR');
  }
  const quality = String(data.quality_rating ?? 'UNKNOWN').toUpperCase();
  return prisma.waChannel.update({
    where: { id: channel.id },
    data: {
      qualityRating: ['GREEN', 'YELLOW', 'RED'].includes(quality) ? (quality as any) : 'UNKNOWN',
      messagingTier: data.messaging_limit_tier ?? data.throughput?.level ?? channel.messagingTier,
      displayPhone: data.display_phone_number ?? channel.displayPhone,
      displayName: data.verified_name ?? channel.displayName,
    },
  });
}
