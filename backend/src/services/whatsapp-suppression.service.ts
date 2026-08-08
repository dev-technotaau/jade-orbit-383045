import { prisma } from '../config/prisma';
import { normalizeWaPhone } from './whatsapp-contact.service';

/**
 * Suppression list — phones that must never receive a campaign, regardless of
 * opt-in status. Maintained out-of-band (manual blocklist, complaints, hard
 * bounces) and consulted by the campaign audience materializer.
 */
export async function listSuppressions() {
  return prisma.waSuppression.findMany({ orderBy: { createdAt: 'desc' } });
}

/**
 * Add (or refresh) a suppressed phone. Phone is normalized to E.164 and upserted
 * by its unique `phone`, so re-adding an existing number just updates its reason.
 */
export async function addSuppression(input: {
  phone: string;
  reason?: string | null;
  createdBy?: string | null;
}) {
  const phone = normalizeWaPhone(input.phone);
  return prisma.waSuppression.upsert({
    where: { phone },
    update: {
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
    create: {
      phone,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
}

export async function removeSuppression(id: string) {
  return prisma.waSuppression.delete({ where: { id } });
}

/**
 * Load every suppressed phone as a Set for O(1) membership checks during
 * campaign audience filtering. Phones are already normalized at write time.
 */
export async function getSuppressedPhoneSet(): Promise<Set<string>> {
  const rows = await prisma.waSuppression.findMany({ select: { phone: true } });
  return new Set(rows.map((r) => r.phone));
}
