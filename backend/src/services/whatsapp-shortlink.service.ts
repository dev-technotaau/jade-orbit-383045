import crypto from 'crypto';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import type { WaShortLink } from '@prisma/client';

/** Number of base36 characters in a generated short-link code. */
const CODE_LENGTH = 8;

/**
 * Generate a short, URL-safe code from cryptographically strong randomness
 * (NEVER Math.random). We pull a few extra random bytes and base36-encode them,
 * then slice to a fixed length so the code is compact and unguessable.
 */
function generateCode(): string {
  // 6 bytes -> a comfortably-large base36 string; slice to CODE_LENGTH chars.
  return BigInt('0x' + crypto.randomBytes(6).toString('hex'))
    .toString(36)
    .padStart(CODE_LENGTH, '0')
    .slice(0, CODE_LENGTH);
}

/**
 * Create a trackable short link. Retries on the (astronomically rare) unique
 * code collision so a caller never sees a spurious P2002.
 */
export async function createShortLink(input: {
  targetUrl: string;
  campaignId?: string | null;
  createdBy?: string | null;
}): Promise<WaShortLink> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.waShortLink.create({
        data: {
          code: generateCode(),
          targetUrl: input.targetUrl,
          campaignId: input.campaignId ?? null,
          createdBy: input.createdBy ?? null,
        },
      });
    } catch (err) {
      // P2002 = unique code collision; regenerate and retry. Anything else throws.
      if ((err as { code?: string })?.code === 'P2002') continue;
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique short-link code');
}

/**
 * Record a click on a short link and return its target URL for redirect, or
 * null when the code is unknown. Best-effort: a write failure (e.g. the click
 * row) never blocks the redirect, and this never throws.
 */
export async function recordClick(
  code: string,
  meta: { contactId?: string | null; ip?: string | null; userAgent?: string | null }
): Promise<string | null> {
  try {
    const link = await prisma.waShortLink.findUnique({ where: { code } });
    if (!link) return null;
    await prisma.$transaction([
      prisma.waLinkClick.create({
        data: {
          shortLinkId: link.id,
          contactId: meta.contactId ?? null,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      }),
      prisma.waShortLink.update({
        where: { id: link.id },
        data: { clickCount: { increment: 1 } },
      }),
    ]);
    return link.targetUrl;
  } catch (err) {
    logger.warn(`WhatsApp short-link click record failed for ${code}: ${(err as Error).message}`);
    // Try to still resolve the target so the redirect works even if logging failed.
    const link = await prisma.waShortLink.findUnique({ where: { code } }).catch(() => null);
    return link?.targetUrl ?? null;
  }
}

/** All short links for a campaign with their click counts (CTR analytics). */
export async function getCampaignLinkStats(campaignId: string): Promise<WaShortLink[]> {
  return prisma.waShortLink.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
}
