import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { normalizeWaPhone } from './whatsapp-contact.service';
import { encryptJson } from '../utils/encryption';

/**
 * Self-serve WhatsApp opt-in/out for the currently logged-in user. Resolves the
 * user's WhatsApp number (falling back to mobile number), normalizes it to
 * E.164, and upserts a WaContact keyed by that phone — linking it to the user
 * and recording consent provenance. This is the user opting THEIR OWN number in
 * or out (no admin override); the contact row is the system of record for the
 * 24h window, marketing caps, and DPDP consent evidence.
 */
export async function selfServeWhatsappOptIn(userId: string, optIn: boolean) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, whatsappNumber: true, mobileNumber: true },
  });
  if (!user) {
    throw new AppError('User not found.', 404, 'NOT_FOUND');
  }

  const phoneRaw = user.whatsappNumber || user.mobileNumber;
  if (!phoneRaw) {
    throw new AppError(
      'No WhatsApp or mobile number on file. Add a number to your profile first.',
      400,
      'NO_PHONE_ON_FILE'
    );
  }

  const phone = normalizeWaPhone(phoneRaw);
  const now = new Date();
  const consentEvidence: Prisma.InputJsonValue = encryptJson({
    source: 'self-serve',
    userId,
    at: now.toISOString(),
  });

  const optInData = optIn
    ? {
        optInStatus: 'OPTED_IN' as const,
        optInSource: 'self-serve',
        optInAt: now,
        optOutAt: null,
        consentEvidence,
      }
    : {
        optInStatus: 'OPTED_OUT' as const,
        optInSource: 'self-serve',
        optOutAt: now,
        consentEvidence,
      };

  return prisma.waContact.upsert({
    where: { phone },
    create: {
      phone,
      name: user.firstName ?? null,
      userId,
      ...optInData,
    },
    update: {
      userId,
      ...optInData,
    },
  });
}
