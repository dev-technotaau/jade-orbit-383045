import prisma from '../config/prisma';

export type ConsentType = 'terms' | 'privacy' | 'marketing' | 'cookies' | 'data-processing';

export class ConsentService {
  /**
   * Record user consent for a specific type and version.
   */
  static async giveConsent(userId: string, type: ConsentType, version: string, ipAddress?: string) {
    // Revoke any existing consent of the same type first
    await prisma.userConsent.updateMany({
      where: { userId, type, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return prisma.userConsent.create({
      data: { userId, type, version, ipAddress },
    });
  }

  /**
   * Revoke user consent for a specific type.
   */
  static async revokeConsent(userId: string, type: ConsentType) {
    return prisma.userConsent.updateMany({
      where: { userId, type, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Get all active consents for a user.
   */
  static async getUserConsents(userId: string) {
    return prisma.userConsent.findMany({
      where: { userId, revokedAt: null },
      orderBy: { givenAt: 'desc' },
    });
  }

  /**
   * Check if a user has active consent of a specific type.
   */
  static async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    const consent = await prisma.userConsent.findFirst({
      where: { userId, type, revokedAt: null },
    });
    return !!consent;
  }

  /**
   * Get full consent history for a user (including revoked).
   */
  static async getConsentHistory(userId: string) {
    return prisma.userConsent.findMany({
      where: { userId },
      orderBy: { givenAt: 'desc' },
    });
  }
}
