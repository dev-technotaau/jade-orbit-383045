import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../config/prisma';
import { env, getOtpLength, getOtpExpiryMinutes } from '../config/env';
import {
  generateBackupCodes,
  hashToken,
  compareTokens,
  generateSecureToken,
  generateOtp,
} from '../utils/crypto';
import { encryptField, decryptField } from '../utils/encryption';
import { AuditService } from './audit.service';
import { AppError } from '../middleware/error';
import logger from '../config/logger';
import bcrypt from 'bcryptjs';
import type { TokenPayload } from '../utils/jwt';
import { signAccessToken } from '../utils/jwt';
import { createRefreshToken } from './token.service';
import { sessionService } from './session.service';
import { emailQueue } from '../jobs/email.queue';
import { mfaRecoveryOtp as mfaRecoveryOtpTemplate } from '../templates/email/security';
import { twoFactorDisabled } from '../templates/email/security';

const TRUSTED_DEVICE_DAYS = 30;

/**
 * Generate a new MFA secret for a user.
 * Guards against calling when MFA is already enabled.
 */
export const generateMfaSecret = async (
  userId: string,
  email: string
): Promise<{ secret: string; qrCodeUrl: string }> => {
  // Guard: prevent re-setup when MFA is already enabled
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });
  if (existing?.mfaEnabled) {
    throw new AppError('MFA is already enabled. Disable it first to reconfigure.', 400);
  }

  const secret = speakeasy.generateSecret({
    name: `${env.MFA_ISSUER}:${email}`,
    issuer: env.MFA_ISSUER,
    length: 32,
  });

  // Encrypt the secret at rest
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecret: encryptField(secret.base32),
      mfaEnabled: false,
    },
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  // Audit
  AuditService.log({
    action: 'MFA_SETUP_INITIATED',
    entity: 'User',
    entityId: userId,
    performedBy: userId,
  }).catch(() => {});

  logger.debug(`MFA secret generated for user ${userId}`);

  return {
    secret: secret.base32,
    qrCodeUrl,
  };
};

/**
 * Enable MFA after user verifies with a valid TOTP token.
 */
export const enableMfa = async (
  userId: string,
  token: string,
  password?: string
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true, password: true },
  });

  if (!user?.mfaSecret) {
    return { success: false, error: 'MFA not set up. Please generate a secret first.' };
  }

  if (user.mfaEnabled) {
    return { success: false, error: 'MFA is already enabled.' };
  }

  // Verify password before enabling MFA (skipped for privileged super-admin operations)
  if (password) {
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      return { success: false, error: 'Invalid password.' };
    }
  }

  // Decrypt the stored secret for verification
  const decryptedSecret = decryptField(user.mfaSecret);

  const isValid = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!isValid) {
    return { success: false, error: 'Invalid MFA code.' };
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes(10);
  const hashedCodes = backupCodes.map((code) => hashToken(code));

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: hashedCodes,
    },
  });

  logger.info(`MFA enabled for user ${userId}`);

  // Audit
  AuditService.log({
    action: 'MFA_ENABLED',
    entity: 'User',
    entityId: userId,
    performedBy: userId,
  }).catch(() => {});

  // Notify user
  const enabledUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      isEmailVerified: true,
      isWhatsappVerified: true,
      whatsappNumber: true,
      mobileNumber: true,
    },
  });
  if (enabledUser?.isEmailVerified) {
    void import('../templates/email/security')
      .then(({ twoFactorEnabled }) => {
        const tmpl = twoFactorEnabled('Authenticator App');
        return import('../jobs/email.queue').then(({ emailQueue }) => {
          return emailQueue.add('send-email', {
            to: enabledUser.email,
            subject: tmpl.subject,
            html: tmpl.html,
            text: tmpl.text,
          });
        });
      })
      .catch(() => {});
  }

  // Also notify via WhatsApp (fire-and-forget)
  try {
    const target = enabledUser?.isWhatsappVerified
      ? enabledUser.whatsappNumber || enabledUser.mobileNumber
      : null;
    if (target) {
      const { twoFactorChangedWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = twoFactorChangedWhatsapp('enabled', 'authenticator app');
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp two_factor_changed', waErr);
  }

  return {
    success: true,
    backupCodes,
  };
};

/**
 * Disable MFA for a user (requires password + TOTP verification).
 */
export const disableMfa = async (
  userId: string,
  password: string,
  token: string
): Promise<{ success: boolean; error?: string }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, mfaSecret: true, mfaEnabled: true },
  });

  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (!user.mfaEnabled) {
    return { success: false, error: 'MFA is not enabled.' };
  }

  if (!user.password) {
    return { success: false, error: 'Account uses social login (no password set).' };
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return { success: false, error: 'Invalid password.' };
  }

  // Decrypt secret for TOTP verification
  const decryptedSecret = decryptField(user.mfaSecret!);

  const isTokenValid = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!isTokenValid) {
    return { success: false, error: 'Invalid MFA code.' };
  }

  // Disable MFA and revoke trusted devices
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    }),
    prisma.mfaTrustedDevice.deleteMany({ where: { userId } }),
  ]);

  logger.info(`MFA disabled for user ${userId}`);

  // Audit
  AuditService.log({
    action: 'MFA_DISABLED',
    entity: 'User',
    entityId: userId,
    performedBy: userId,
  }).catch(() => {});

  // Notify user
  const disabledUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      isEmailVerified: true,
      isWhatsappVerified: true,
      whatsappNumber: true,
      mobileNumber: true,
    },
  });
  if (disabledUser?.isEmailVerified) {
    void import('../templates/email/security')
      .then(({ twoFactorDisabled }) => {
        const tmpl = twoFactorDisabled('Authenticator App');
        return import('../jobs/email.queue').then(({ emailQueue }) => {
          return emailQueue.add('send-email', {
            to: disabledUser.email,
            subject: tmpl.subject,
            html: tmpl.html,
            text: tmpl.text,
          });
        });
      })
      .catch(() => {});
  }

  // Also notify via WhatsApp (fire-and-forget)
  try {
    const target = disabledUser?.isWhatsappVerified
      ? disabledUser.whatsappNumber || disabledUser.mobileNumber
      : null;
    if (target) {
      const { twoFactorChangedWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = twoFactorChangedWhatsapp('disabled', 'authenticator app');
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp two_factor_changed', waErr);
  }

  return { success: true };
};

/**
 * Verify a TOTP token or backup code for a user.
 * Uses timing-safe comparison for backup codes.
 */
export const verifyMfaToken = async (userId: string, token: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true, mfaBackupCodes: true },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    return false;
  }

  // Decrypt secret for TOTP verification
  const decryptedSecret = decryptField(user.mfaSecret);

  // Try TOTP verification first
  const isValid = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (isValid) {
    return true;
  }

  // Try backup codes if TOTP fails (timing-safe comparison)
  const normalizedInput = token.replace(/-/g, '').toUpperCase();
  const backupCodeIndex = user.mfaBackupCodes.findIndex((stored) => {
    try {
      return compareTokens(normalizedInput, stored);
    } catch {
      return false;
    }
  });

  if (backupCodeIndex !== -1) {
    // Remove used backup code
    const updatedCodes = [...user.mfaBackupCodes];
    updatedCodes.splice(backupCodeIndex, 1);

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: updatedCodes },
    });

    logger.info(`Backup code used for user ${userId}`);

    // Audit
    AuditService.log({
      action: 'MFA_BACKUP_CODE_USED',
      entity: 'User',
      entityId: userId,
      performedBy: userId,
      details: { remainingCodes: updatedCodes.length },
    }).catch(() => {});

    return true;
  }

  // Audit failed verification
  AuditService.log({
    action: 'MFA_VERIFY_FAILED',
    entity: 'User',
    entityId: userId,
    performedBy: userId,
  }).catch(() => {});

  return false;
};

/**
 * Check if MFA is enabled for a user.
 */
export const isMfaEnabled = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });

  return user?.mfaEnabled ?? false;
};

/**
 * Regenerate backup codes (requires password + TOTP verification).
 */
export const regenerateBackupCodes = async (
  userId: string,
  password: string,
  token: string
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, mfaSecret: true, mfaEnabled: true },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    return { success: false, error: 'MFA is not enabled.' };
  }

  if (!user.password) {
    return { success: false, error: 'Account uses social login (no password set).' };
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return { success: false, error: 'Invalid password.' };
  }

  const decryptedSecret = decryptField(user.mfaSecret);
  const isTokenValid = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!isTokenValid) {
    return { success: false, error: 'Invalid MFA code.' };
  }

  // Generate new backup codes
  const backupCodes = generateBackupCodes(10);
  const hashedCodes = backupCodes.map((code) => hashToken(code));

  await prisma.user.update({
    where: { id: userId },
    data: { mfaBackupCodes: hashedCodes },
  });

  logger.info(`Backup codes regenerated for user ${userId}`);

  // Audit
  AuditService.log({
    action: 'MFA_BACKUP_CODES_REGENERATED',
    entity: 'User',
    entityId: userId,
    performedBy: userId,
  }).catch(() => {});

  // Notify user
  const notifUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isEmailVerified: true },
  });
  if (notifUser?.isEmailVerified) {
    void import('../templates/email/security')
      .then(({ twoFactorEnabled }) => {
        const tmpl = twoFactorEnabled('Backup Codes Regenerated');
        return import('../jobs/email.queue').then(({ emailQueue }) => {
          return emailQueue.add('send-email', {
            to: notifUser.email,
            subject: 'Backup Codes Regenerated',
            html: tmpl.html,
            text: tmpl.text,
          });
        });
      })
      .catch(() => {});
  }

  return { success: true, backupCodes };
};

/**
 * Get the number of remaining backup codes for a user.
 */
export const getBackupCodeCount = async (userId: string): Promise<number> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaBackupCodes: true, mfaEnabled: true },
  });

  if (!user?.mfaEnabled) return 0;
  return user.mfaBackupCodes.length;
};

// ===============================
// Trusted Devices
// ===============================

/**
 * Create a trusted device token (skip MFA for 30 days).
 * Returns the plain token to store in a cookie on the client.
 */
export const createTrustedDevice = async (
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> => {
  const plainToken = generateSecureToken(32);
  const tokenHash = hashToken(plainToken);

  await prisma.mfaTrustedDevice.create({
    data: {
      userId,
      tokenHash,
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return plainToken;
};

/**
 * Verify a trusted device token. Returns true if valid and not expired.
 */
export const verifyTrustedDevice = async (userId: string, token: string): Promise<boolean> => {
  if (!token) return false;

  const tokenHash = hashToken(token);
  const device = await prisma.mfaTrustedDevice.findFirst({
    where: {
      userId,
      tokenHash,
      expiresAt: { gt: new Date() },
    },
  });

  return !!device;
};

/**
 * Revoke all trusted devices for a user.
 */
export const revokeTrustedDevices = async (userId: string): Promise<void> => {
  await prisma.mfaTrustedDevice.deleteMany({ where: { userId } });
};

// ===============================
// MFA Recovery — Email OTP flow
// ===============================

/**
 * Request MFA recovery via email OTP.
 * Silent return if user not found or MFA not enabled (prevent enumeration).
 */
export const requestMfaRecovery = async (email: string): Promise<void> => {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      role: true,
      mfaEnabled: true,
      lockUntil: true,
      isWhatsappVerified: true,
      whatsappNumber: true,
      mobileNumber: true,
    },
  });

  // Silent return — prevent enumeration
  if (!user || !user.mfaEnabled) return;

  // Admin MFA is managed by Super Admin only — no self-service recovery
  if (user.role === 'ADMIN') {
    throw new AppError(
      'Admin MFA recovery is not available. Contact a Super Admin.',
      403,
      'ADMIN_MFA_MANAGED'
    );
  }

  // Check account lock
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(
      'Account is temporarily locked. Please try again later.',
      423,
      'ACCOUNT_LOCKED'
    );
  }

  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);
  const expiresAt = new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaRecoveryToken: hashedOtp,
      mfaRecoveryExpires: expiresAt,
    },
  });

  // Send recovery email
  try {
    const emailContent = mfaRecoveryOtpTemplate(otp);
    await emailQueue.add('send-email', {
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error(`Failed to queue MFA recovery email for ${normalizedEmail}`, error);
  }

  // Also send recovery OTP via WhatsApp (fire-and-forget)
  try {
    const target = user.isWhatsappVerified ? user.whatsappNumber || user.mobileNumber : null;
    if (target) {
      const { mfaRecoveryOtpWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = mfaRecoveryOtpWhatsapp(otp);
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp mfa_recovery_otp', waErr);
  }

  if (env.NODE_ENV !== 'production') {
    logger.info(`DEV: MFA Recovery OTP for ${normalizedEmail}: ${otp}`);
  }

  AuditService.log({
    action: 'MFA_RECOVERY_REQUESTED',
    entity: 'User',
    entityId: user.id,
    performedBy: user.id,
  }).catch(() => {});
};

/**
 * Verify MFA recovery OTP → disable MFA → issue tokens → log user in.
 */
export const verifyMfaRecovery = async (
  email: string,
  otp: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{
  user: {
    id: string;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    isEmailVerified: boolean;
    mfaEnabled: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}> => {
  const normalizedEmail = email.toLowerCase();
  const hashedOtp = hashToken(otp);

  const user = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      mfaRecoveryToken: hashedOtp,
      mfaRecoveryExpires: { gt: new Date() },
    },
  });

  // Admin MFA is managed by Super Admin only — no self-service recovery
  if (user?.role === 'ADMIN') {
    throw new AppError(
      'Admin MFA recovery is not available. Contact a Super Admin.',
      403,
      'ADMIN_MFA_MANAGED'
    );
  }

  if (!user) {
    // Increment login attempts on the user (if found by email) to prevent brute-force
    const target = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, loginAttempts: true },
    });
    if (target) {
      const newAttempts = target.loginAttempts + 1;
      const lockData: Record<string, unknown> = { loginAttempts: newAttempts };
      if (newAttempts >= parseInt(env.MAX_LOGIN_ATTEMPTS, 10)) {
        lockData.lockUntil = new Date(
          Date.now() + parseInt(env.ACCOUNT_LOCK_DURATION_MINUTES, 10) * 60 * 1000
        );
      }
      await prisma.user.update({ where: { id: target.id }, data: lockData });
    }
    throw new AppError('Invalid or expired recovery code', 401, 'INVALID_RECOVERY_CODE');
  }

  // Transaction: disable MFA + clear recovery token + reset security fields
  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        mfaRecoveryToken: null,
        mfaRecoveryExpires: null,
        loginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Remove all trusted devices
    await tx.mfaTrustedDevice.deleteMany({ where: { userId: user.id } });

    return updated;
  });

  // Create session and generate tokens with sessionId
  const session = await sessionService.createSession(updatedUser.id, userAgent, ipAddress);
  const tokenPayload: TokenPayload = {
    userId: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
    sessionId: session.id,
  };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = await createRefreshToken(updatedUser.id, userAgent, ipAddress, session.id);

  // Send security notification email (fire-and-forget)
  try {
    const emailContent = twoFactorDisabled('Authenticator App');
    emailQueue
      .add('send-email', {
        to: updatedUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
      .catch(() => {});
  } catch {
    // ignore
  }

  AuditService.log({
    action: 'MFA_RECOVERY_COMPLETED',
    entity: 'User',
    entityId: updatedUser.id,
    performedBy: updatedUser.id,
    details: { method: 'email_otp' },
  }).catch(() => {});

  return {
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      isEmailVerified: updatedUser.isEmailVerified,
      mfaEnabled: false,
      createdAt: updatedUser.createdAt,
      lastLoginAt: updatedUser.lastLoginAt,
    },
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
};
