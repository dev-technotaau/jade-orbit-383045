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

/**
 * Is this phone on the do-not-contact list?
 *
 * The list was only ever consulted when a campaign audience was materialized —
 * i.e. once, possibly days before the campaign ran, and never for the drip,
 * scheduled-message, one-off template or bridge paths at all. A number added to
 * the list after materialization (a complaint, a legal request) kept receiving
 * messages from every already-built campaign. "Must never receive a campaign,
 * regardless of opt-in status" has to be enforced at the send, not at the plan.
 *
 * Indexed unique lookup, so this is cheap enough to run per send.
 */
export async function isSuppressed(phone: string | null | undefined): Promise<boolean> {
  if (!phone) return false;
  const normalized = normalizeWaPhone(phone);
  if (!normalized) return false;
  try {
    const hit = await prisma.waSuppression.findUnique({
      where: { phone: normalized },
      select: { id: true },
    });
    return hit != null;
  } catch {
    // Fail OPEN deliberately: a database blip must not silently halt every
    // send. The materializer's list check still applies, and the failure is
    // visible in the logs of whatever called us.
    return false;
  }
}
