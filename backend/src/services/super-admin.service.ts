import { prisma } from '../config/prisma';
import redis from '../config/redis';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/error';
import bcrypt from 'bcryptjs';
import logger from '../config/logger';
import {
  env,
  getOtpExpiryMinutes,
  getOtpLength,
  getOtpMaxResendAttempts,
  getOtpResendCooldown,
} from '../config/env';
import { uploadImage, uploadOptions, deleteImage, extractPublicId } from '../config/cloudinary';
import { revokeAllUserTokens } from './token.service';
import { sessionService } from './session.service';
import { checkPasswordBreach, validatePasswordStrength } from '../utils/breach-detection';
import { hashToken, generateOtp } from '../utils/crypto';
import { emailQueue } from '../jobs/email.queue';
import {
  verifyEmail as verifyEmailTemplate,
  passwordResetOtp as passwordResetOtpTemplate,
} from '../templates/email/auth';

const SALT_ROUNDS = 12;

class SuperAdminService {
  async createAdmin(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    mobileNumber?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 400);

    if (data.mobileNumber) {
      const dupMobile = await prisma.user.findUnique({
        where: { mobileNumber: data.mobileNumber },
      });
      if (dupMobile) throw new AppError('Mobile number already registered', 400);
    }

    /* Same password policy and duplicate checks self-registration runs. Before
       this, an account created from the super-admin panel only had to clear the
       schema's 8-character minimum — so a password rejected at /auth/register
       could be set here. `validatePasswordStrength` reads the same env-driven
       rules (PASSWORD_MIN_LENGTH, REQUIRE_UPPERCASE, …) both paths share. */
    const strengthCheck = validatePasswordStrength(data.password);
    if (!strengthCheck.isValid) {
      throw new AppError(strengthCheck.errors.join('. '), 400);
    }

    // Advisory only, exactly as in registration: a breached password is
    // surfaced to the operator, not blocked.
    const breachCheck = await checkPasswordBreach(data.password);

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Generate 6-digit OTP for email verification
    const verificationOtp = generateOtp(6);
    const hashedOtp = hashToken(verificationOtp);
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const admin = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        mobileNumber: data.mobileNumber ?? null,
        role: Role.ADMIN,
        isEmailVerified: false,
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: verificationExpires,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // Send verification email with OTP
    try {
      const emailContent = verifyEmailTemplate(verificationOtp);
      await emailQueue.add('send-email', {
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to queue verification email for admin ${data.email}`, error);
    }

    logger.info(`Admin account created: ${data.email} (verification email sent)`);
    /* `breachWarning` mirrors what /auth/register returns: the account is created
       either way, but the operator is told the password appears in a known
       breach corpus so they can rotate it before handing it over. */
    return { ...admin, breachWarning: breachCheck.warning };
  }

  async listAdmins(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [admins, total] = await prisma.$transaction([
      prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          isSuspended: true,
          isEmailVerified: true,
          /* `mfaEnabled` was missing here, so every row arrived `undefined` and
             the Admin MFA tab rendered "MFA Disabled" + a "Setup MFA" button for
             admins who already had it on — including in the expanded row detail.
             The flag itself was always written correctly by enableMfa(); it just
             never left the server on this endpoint. */
          mfaEnabled: true,
          createdAt: true,
          lastLoginAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } } }),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    return { items: admins, total, page, limit, totalPages, hasMore: page < totalPages };
  }

  async removeAdmin(adminId: string, superAdminId: string) {
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (admin.role === Role.SUPER_ADMIN) throw new AppError('Cannot remove a super admin', 403);
    if (admin.role !== Role.ADMIN) throw new AppError('User is not an admin', 400);

    // Strip PBAC access before demoting.
    //
    // Grants and role assignments survive a demotion — they key on the user
    // id, not the role — so a demoted admin's full permission set sat
    // dormant and unreachable. Promote that account back to ADMIN later (a
    // returning employee, a re-engaged contractor) and every old permission
    // silently reactivated, including anything since revoked from their
    // peers. Revoking here makes re-promotion start from zero, which is the
    // only defensible default.
    const { permissionService } = await import('./permission.service');
    const [grantCount, roleCount] = await Promise.all([
      prisma.adminPermissionGrant.count({ where: { adminId } }),
      prisma.adminRoleAssignment.count({ where: { adminId } }),
    ]);
    await permissionService.revokeAllGrants(adminId);

    await prisma.user.update({ where: { id: adminId }, data: { role: Role.CANDIDATE } });

    await prisma.auditLog.create({
      data: {
        action: 'REMOVE_ADMIN',
        entity: 'User',
        entityId: adminId,
        performedBy: superAdminId,
        details: { revokedGrants: grantCount, revokedRoles: roleCount },
      },
    });

    logger.info(`Admin ${adminId} removed by super admin ${superAdminId}`);
  }

  async getSystemConfig() {
    const configs = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(configs.map((c) => [c.key, c.value]));
  }

  async updateSystemConfig(key: string, value: any, adminId: string) {
    await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, updatedBy: adminId },
      update: { value, updatedBy: adminId },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_SYSTEM_CONFIG',
        entity: 'SystemConfig',
        entityId: key,
        performedBy: adminId,
        details: { value },
      },
    });
  }

  // ── User Management ──

  async createUser(
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: Role;
      mobileNumber?: string;
    },
    superAdminId: string,
    /**
     * The CALLER's role. Required to decide whether an ADMIN target is
     * permitted — see the guard below. Optional only so existing internal
     * callers keep compiling; omitting it is treated as the restrictive
     * case (non-super-admin), so the default fails closed.
     */
    actorRole?: Role
  ) {
    if (data.role === Role.SUPER_ADMIN) {
      throw new AppError('Cannot create super admin accounts', 403);
    }

    // A delegated ADMIN holding `users.create` must not be able to mint a
    // peer. This endpoint is otherwise a complete bypass of the
    // `superAdminOnly` lock on POST /admins and of the role-promotion lock
    // on PATCH /users/:id/role — both of which already close the same door
    // from a different side. Mirrors admin.service.ts#updateUserRole.
    if (data.role === Role.ADMIN && actorRole !== Role.SUPER_ADMIN) {
      throw new AppError(
        'Only a super-admin can create admin accounts.',
        403,
        'SUPER_ADMIN_REQUIRED'
      );
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 400);

    if (data.mobileNumber) {
      const dupMobile = await prisma.user.findUnique({
        where: { mobileNumber: data.mobileNumber },
      });
      if (dupMobile) throw new AppError('Mobile number already registered', 400);
    }

    /* Same password policy and duplicate checks self-registration runs. Before
       this, an account created from the super-admin panel only had to clear the
       schema's 8-character minimum — so a password rejected at /auth/register
       could be set here. `validatePasswordStrength` reads the same env-driven
       rules (PASSWORD_MIN_LENGTH, REQUIRE_UPPERCASE, …) both paths share. */
    const strengthCheck = validatePasswordStrength(data.password);
    if (!strengthCheck.isValid) {
      throw new AppError(strengthCheck.errors.join('. '), 400);
    }

    // Advisory only, exactly as in registration: a breached password is
    // surfaced to the operator, not blocked.
    const breachCheck = await checkPasswordBreach(data.password);

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Generate 6-digit OTP for email verification
    const verificationOtp = generateOtp(6);
    const hashedOtp = hashToken(verificationOtp);
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        mobileNumber: data.mobileNumber ?? null,
        role: data.role,
        isEmailVerified: false,
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: verificationExpires,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // Send verification email with OTP
    try {
      const emailContent = verifyEmailTemplate(verificationOtp);
      await emailQueue.add('send-email', {
        to: data.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to queue verification email for ${data.email}`, error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        entity: 'User',
        entityId: user.id,
        performedBy: superAdminId,
        details: { role: data.role },
      },
    });

    logger.info(
      `User created by super admin: ${data.email} (${data.role}) (verification email sent)`
    );
    /* `breachWarning` mirrors what /auth/register returns: the account is created
       either way, but the operator is told the password appears in a known
       breach corpus so they can rotate it before handing it over. */
    return { ...user, breachWarning: breachCheck.warning };
  }

  async updateUserProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      mobileNumber?: string | null;
      whatsappNumber?: string | null;
      isMobileVerified?: boolean;
      isWhatsappVerified?: boolean;
    },
    superAdminId: string,
    /**
     * The CALLER's role and id, used to enforce the `credentials.*` split
     * below. Optional so existing internal callers keep compiling; omitting
     * `actorRole` is treated as the restrictive case, so the default fails
     * closed.
     */
    actorRole?: Role,
    actorId?: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN && userId !== superAdminId) {
      throw new AppError('Cannot modify another super admin', 403);
    }

    // ADMIN accounts must use OTP-verified routes for contact info changes
    if (user.role === Role.ADMIN) {
      const blocked = [
        'email',
        'mobileNumber',
        'whatsappNumber',
        'isMobileVerified',
        'isWhatsappVerified',
      ] as const;
      for (const field of blocked) {
        if (data[field] !== undefined) {
          throw new AppError(
            `Cannot directly modify ${field} for admin accounts. Use the verified management endpoints.`,
            400
          );
        }
      }
    }

    // ── Credential fields need the credential permission, not `profile.edit` ──
    //
    // This route is gated on `users.candidates.profile.edit` /
    // `users.employers.company.edit` — ordinary help-desk grants. But the
    // payload also carries email, mobile, WhatsApp and their verified flags,
    // which the registry deliberately splits into a SEPARATE `credentials.*`
    // group precisely so a help-desk role cannot rotate someone's login out
    // from under them (see config/permissions.ts, credentialsGroup).
    //
    // Without this, an admin with only `profile.edit` could set a candidate's
    // email to an address they control — `isEmailVerified` is never reset, so
    // the new address inherits verified status — then run a password reset and
    // take the account over. The mobile path is the same via SMS OTP.
    //
    // Super-admins short-circuit inside `hasCallerPermission`.
    if (actorRole !== Role.SUPER_ADMIN && actorId) {
      const subject = user.role === Role.EMPLOYER ? 'users.employers' : 'users.candidates';
      const needs: [boolean, string][] = [
        [data.email !== undefined, `${subject}.credentials.email`],
        [
          data.mobileNumber !== undefined || data.isMobileVerified !== undefined,
          `${subject}.credentials.mobile`,
        ],
        [
          data.whatsappNumber !== undefined || data.isWhatsappVerified !== undefined,
          `${subject}.credentials.whatsapp`,
        ],
      ];
      for (const [touched, key] of needs) {
        if (!touched) continue;
        const { can } = await import('./permission.service');
        if (!(await can(actorId, actorRole ?? 'ADMIN', key))) {
          throw new AppError(
            `Changing this contact field requires the "${key}" permission.`,
            403,
            'PERMISSION_DENIED'
          );
        }
      }
    }

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new AppError('Email already in use', 400);
    }

    // Mobile uniqueness check
    if (
      data.mobileNumber !== undefined &&
      data.mobileNumber !== null &&
      data.mobileNumber !== user.mobileNumber
    ) {
      const existing = await prisma.user.findFirst({
        where: { mobileNumber: data.mobileNumber, NOT: { id: userId } },
      });
      if (existing) throw new AppError('Mobile number already in use', 409);
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.email) {
      updateData.email = data.email;
      // A rotated address must be re-proven. Without this the new email
      // inherited the old one's verified status, so an operator-set address
      // was immediately usable for sign-in and password reset.
      if (data.email !== user.email) updateData.isEmailVerified = false;
    }

    // Mobile number handling
    if (data.mobileNumber !== undefined) {
      updateData.mobileNumber = data.mobileNumber; // null removes it
      if (data.mobileNumber === null) {
        // Removing number → clear verified
        updateData.isMobileVerified = false;
      } else if (data.mobileNumber !== user.mobileNumber) {
        // Number changed → reset verified unless explicitly set true
        updateData.isMobileVerified = data.isMobileVerified === true ? true : false;
      }
    }
    if (data.isMobileVerified !== undefined && updateData.isMobileVerified === undefined) {
      const effectiveMobile =
        data.mobileNumber !== undefined ? data.mobileNumber : user.mobileNumber;
      if (data.isMobileVerified && !effectiveMobile) {
        throw new AppError('Cannot verify mobile without a number', 400);
      }
      updateData.isMobileVerified = data.isMobileVerified;
    }

    // WhatsApp number handling
    if (data.whatsappNumber !== undefined) {
      updateData.whatsappNumber = data.whatsappNumber;
      if (data.whatsappNumber === null) {
        updateData.isWhatsappVerified = false;
      } else if (data.whatsappNumber !== user.whatsappNumber) {
        updateData.isWhatsappVerified = data.isWhatsappVerified === true ? true : false;
      }
    }
    if (data.isWhatsappVerified !== undefined && updateData.isWhatsappVerified === undefined) {
      const effectiveWhatsapp =
        data.whatsappNumber !== undefined ? data.whatsappNumber : user.whatsappNumber;
      if (data.isWhatsappVerified && !effectiveWhatsapp) {
        throw new AppError('Cannot verify WhatsApp without a number', 400);
      }
      updateData.isWhatsappVerified = data.isWhatsappVerified;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mobileNumber: true,
        isMobileVerified: true,
        whatsappNumber: true,
        isWhatsappVerified: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_USER_PROFILE',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
        details: JSON.parse(JSON.stringify(data)),
      },
    });

    return updated;
  }

  async sendAdminPasswordResetOtp(userId: string, superAdminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.ADMIN) {
      throw new AppError(
        'Admin accounts require verified password change. Use the /password/initiate endpoint.',
        400
      );
    }
    if (user.role === Role.SUPER_ADMIN && userId !== superAdminId) {
      throw new AppError('Cannot reset another super admin password', 403);
    }

    const otp = generateOtp(6);
    const hashedOtp = hashToken(otp);
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: hashedOtp, emailVerificationExpires: expires },
    });

    try {
      const emailContent = passwordResetOtpTemplate(otp);
      await emailQueue.add('send-email', {
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to queue password reset OTP email for ${user.email}`, error);
    }

    logger.info(`Password reset OTP sent to ${user.email} by super admin ${superAdminId}`);
  }

  async adminResetPassword(userId: string, newPassword: string, otp: string, superAdminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.ADMIN) {
      throw new AppError(
        'Admin accounts require verified password change. Use the /password/confirm endpoint.',
        400
      );
    }
    if (user.role === Role.SUPER_ADMIN && userId !== superAdminId) {
      throw new AppError('Cannot change another super admin password', 403);
    }

    // Verify OTP
    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      throw new AppError('No verification code found. Please request a new one.', 400);
    }
    if (user.emailVerificationExpires < new Date()) {
      throw new AppError('Verification code has expired. Please request a new one.', 400);
    }
    const hashedOtp = hashToken(otp);
    if (hashedOtp !== user.emailVerificationToken) {
      throw new AppError('Invalid verification code', 400);
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.isValid) throw new AppError(strengthCheck.errors.join('. '), 400);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    await revokeAllUserTokens(userId);
    await sessionService.revokeAllSessions(userId);

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_RESET_PASSWORD',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
      },
    });

    logger.info(`Password reset by super admin for user ${userId}`);
  }

  async uploadUserAvatar(userId: string, file: Express.Multer.File, superAdminId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { candidateProfile: true },
    });
    if (!user) throw new AppError('User not found', 404);

    const uploadResult = await uploadImage(file.buffer, uploadOptions.profileImage);
    const avatarUrl = uploadResult.secure_url;

    // Delete old avatar from Cloudinary
    if (user.avatar) {
      const oldPublicId = extractPublicId(user.avatar);
      if (oldPublicId) deleteImage(oldPublicId).catch(() => {});
    }

    if (user.candidateProfile) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } }),
        prisma.candidateProfile.update({ where: { userId }, data: { profileImage: avatarUrl } }),
      ]);
    } else {
      await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } });
    }

    await prisma.auditLog.create({
      data: {
        action: 'UPLOAD_USER_AVATAR',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
      },
    });

    return { avatar: avatarUrl };
  }

  async removeUserAvatar(userId: string, superAdminId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { candidateProfile: true },
    });
    if (!user) throw new AppError('User not found', 404);

    if (user.candidateProfile) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { avatar: null } }),
        prisma.candidateProfile.update({ where: { userId }, data: { profileImage: null } }),
      ]);
    } else {
      await prisma.user.update({ where: { id: userId }, data: { avatar: null } });
    }

    // Delete from Cloudinary
    if (user.avatar) {
      const publicId = extractPublicId(user.avatar);
      if (publicId) deleteImage(publicId).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        action: 'REMOVE_USER_AVATAR',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
      },
    });
  }

  async getUserSessions(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    return sessionService.listActiveSessions(userId);
  }

  async revokeUserSessions(userId: string, superAdminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN && userId !== superAdminId) {
      throw new AppError('Cannot revoke another super admin sessions', 403);
    }

    await revokeAllUserTokens(userId);
    await sessionService.revokeAllSessions(userId);

    await prisma.auditLog.create({
      data: {
        action: 'REVOKE_USER_SESSIONS',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
      },
    });

    logger.info(`All sessions revoked for user ${userId} by super admin ${superAdminId}`);
  }

  async revokeUserSession(userId: string, sessionId: string, superAdminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN && userId !== superAdminId) {
      throw new AppError('Cannot revoke another super admin session', 403);
    }

    await sessionService.revokeSession(userId, sessionId);

    await prisma.auditLog.create({
      data: {
        action: 'REVOKE_USER_SESSION',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
        details: { sessionId },
      },
    });

    logger.info(`Session ${sessionId} revoked for user ${userId} by super admin ${superAdminId}`);
  }

  async deactivateUser(userId: string, superAdminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === Role.SUPER_ADMIN) throw new AppError('Cannot deactivate a super admin', 403);
    if (userId === superAdminId) throw new AppError('Cannot deactivate yourself', 400);

    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

    await prisma.auditLog.create({
      data: {
        action: 'DEACTIVATE_USER',
        entity: 'User',
        entityId: userId,
        performedBy: superAdminId,
      },
    });

    logger.info(`User ${userId} deactivated by super admin ${superAdminId}`);
  }

  // ── Admin Email / Mobile / WhatsApp Managed Verification ──

  private enforceResendLimits(lastSentAt: Date | null, resendCount: number): void {
    const cooldown = getOtpResendCooldown();
    const maxAttempts = getOtpMaxResendAttempts();
    if (resendCount >= maxAttempts) {
      throw new AppError(
        'Maximum resend attempts reached. Please try again later.',
        429,
        'OTP_MAX_RESEND'
      );
    }
    if (lastSentAt) {
      const elapsed = (Date.now() - lastSentAt.getTime()) / 1000;
      if (elapsed < cooldown) {
        const remaining = Math.ceil(cooldown - elapsed);
        throw new AppError(
          `Please wait ${remaining} seconds before requesting another code`,
          429,
          'OTP_COOLDOWN'
        );
      }
    }
  }

  private async verifySuperAdminPassword(superAdminId: string, password: string): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { id: superAdminId },
      select: { password: true },
    });
    if (!admin?.password) throw new AppError('Super admin password not found', 500);
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) throw new AppError('Invalid password', 401);
  }

  private async verifyTargetIsAdmin(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role !== Role.ADMIN) {
      throw new AppError('This operation is only available for admin accounts', 400);
    }
    return user;
  }

  // ── Email ──

  async initiateAdminEmailChange(
    targetUserId: string,
    data: { newEmail: string; password: string },
    superAdminId: string
  ) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    await this.verifySuperAdminPassword(superAdminId, data.password);

    const newEmail = data.newEmail.toLowerCase();
    if (newEmail === user.email) {
      throw new AppError('New email must be different from current email', 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) throw new AppError('Email already in use', 400);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        pendingEmail: newEmail,
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
        emailOtpResendCount: 0,
        emailOtpLastSentAt: new Date(),
      },
    });

    try {
      const emailContent = verifyEmailTemplate(otp);
      await emailQueue.add('send-email', {
        to: newEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to send admin email change OTP to ${newEmail}`, error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_EMAIL_CHANGE_INITIATED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { newEmail },
      },
    });

    logger.info(
      `Admin email change initiated for ${targetUserId} to ${newEmail} by super admin ${superAdminId}`
    );
  }

  async confirmAdminEmailChange(targetUserId: string, otp: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.pendingEmail) throw new AppError('No pending email change', 400);

    const hashedOtp = hashToken(otp);
    if (user.emailVerificationToken !== hashedOtp) {
      throw new AppError('Invalid verification code', 400);
    }
    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      throw new AppError('Verification code has expired', 400);
    }

    const oldEmail = user.email;

    await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email: user.pendingEmail! } });
      if (existingUser) throw new AppError('Email already in use', 400);

      await tx.user.update({
        where: { id: targetUserId },
        data: {
          email: user.pendingEmail!,
          isEmailVerified: true,
          pendingEmail: null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          emailOtpResendCount: 0,
          emailOtpLastSentAt: null,
        },
      });
    });

    // Notify old email
    try {
      const { emailChanged } = await import('../templates/email/security');
      const tmpl = emailChanged(user.firstName || 'there', user.pendingEmail!);
      await emailQueue.add('send-email', {
        to: oldEmail,
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
      });
    } catch (error) {
      logger.error('Failed to send admin email change notification', error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_EMAIL_CHANGED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { oldEmail, newEmail: user.pendingEmail },
      },
    });

    logger.info(
      `Admin email changed for ${targetUserId} from ${oldEmail} to ${user.pendingEmail} by ${superAdminId}`
    );
  }

  async resendAdminEmailOtp(targetUserId: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.pendingEmail) throw new AppError('No pending email change', 400);

    this.enforceResendLimits(user.emailOtpLastSentAt, user.emailOtpResendCount);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
        emailOtpResendCount: user.emailOtpResendCount + 1,
        emailOtpLastSentAt: new Date(),
      },
    });

    try {
      const emailContent = verifyEmailTemplate(otp);
      await emailQueue.add('send-email', {
        to: user.pendingEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error('Failed to resend admin email OTP', error);
    }

    logger.info(`Resent admin email OTP for ${targetUserId} by ${superAdminId}`);
  }

  // ── Mobile ──

  async initiateAdminMobileChange(
    targetUserId: string,
    data: { mobileNumber: string; password?: string },
    superAdminId: string
  ) {
    const user = await this.verifyTargetIsAdmin(targetUserId);

    // If admin already has a mobile, require super admin password (this is a "change")
    if (user.mobileNumber) {
      if (!data.password) {
        throw new AppError('Password is required when changing an existing mobile number', 400);
      }
      await this.verifySuperAdminPassword(superAdminId, data.password);
    }

    if (data.mobileNumber === user.mobileNumber) {
      throw new AppError('New mobile number must be different from current number', 400);
    }

    const existing = await prisma.user.findFirst({
      where: { mobileNumber: data.mobileNumber, NOT: { id: targetUserId } },
    });
    if (existing) throw new AppError('Mobile number already in use', 409);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        pendingMobileNumber: data.mobileNumber,
        mobileVerificationToken: hashedOtp,
        mobileVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
        mobileOtpResendCount: 0,
        mobileOtpLastSentAt: new Date(),
      },
    });

    if (env.NODE_ENV !== 'production') {
      logger.info(`DEV: Admin mobile OTP for ${data.mobileNumber}: ${otp}`);
    }

    try {
      const { addSMSJob } = await import('../jobs/sms.queue');
      await addSMSJob({
        to: data.mobileNumber,
        body: `Your verification OTP is: ${otp}. Valid for ${getOtpExpiryMinutes()} minutes.`,
        purpose: 'otp.admin_mobile_change',
      });
    } catch (error) {
      logger.error('Failed to send admin mobile OTP', error);
    }

    await prisma.auditLog.create({
      data: {
        action: user.mobileNumber ? 'ADMIN_MOBILE_CHANGE_INITIATED' : 'ADMIN_MOBILE_ADD_INITIATED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { mobileNumber: data.mobileNumber },
      },
    });

    logger.info(`Admin mobile change initiated for ${targetUserId} by ${superAdminId}`);
  }

  async confirmAdminMobileChange(targetUserId: string, otp: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.pendingMobileNumber) throw new AppError('No pending mobile number change', 400);

    const hashedOtp = hashToken(otp);
    if (user.mobileVerificationToken !== hashedOtp) {
      throw new AppError('Invalid verification code', 400);
    }
    if (!user.mobileVerificationExpires || user.mobileVerificationExpires < new Date()) {
      throw new AppError('Verification code has expired', 400);
    }

    const hasSeparateWhatsapp = !!user.whatsappNumber;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { mobileNumber: user.pendingMobileNumber! },
      });
      if (existing) throw new AppError('Mobile number already in use', 409);

      await tx.user.update({
        where: { id: targetUserId },
        data: {
          mobileNumber: user.pendingMobileNumber,
          isMobileVerified: true,
          // Reset WhatsApp if using mobile for WhatsApp (no separate whatsapp number)
          ...(hasSeparateWhatsapp
            ? {}
            : {
                isWhatsappVerified: false,
                whatsappVerificationToken: null,
                whatsappVerificationExpires: null,
                whatsappOtpResendCount: 0,
                whatsappOtpLastSentAt: null,
              }),
          pendingMobileNumber: null,
          mobileVerificationToken: null,
          mobileVerificationExpires: null,
          mobileOtpResendCount: 0,
          mobileOtpLastSentAt: null,
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_MOBILE_CHANGED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { mobileNumber: user.pendingMobileNumber, whatsappReset: !hasSeparateWhatsapp },
      },
    });

    logger.info(
      `Admin mobile changed for ${targetUserId} to ${user.pendingMobileNumber} by ${superAdminId}`
    );
  }

  async resendAdminMobileOtp(targetUserId: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.pendingMobileNumber) throw new AppError('No pending mobile number change', 400);

    this.enforceResendLimits(user.mobileOtpLastSentAt, user.mobileOtpResendCount);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        mobileVerificationToken: hashedOtp,
        mobileVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
        mobileOtpResendCount: user.mobileOtpResendCount + 1,
        mobileOtpLastSentAt: new Date(),
      },
    });

    if (env.NODE_ENV !== 'production') {
      logger.info(`DEV: Resent admin mobile OTP for ${user.pendingMobileNumber}: ${otp}`);
    }

    try {
      const { addSMSJob } = await import('../jobs/sms.queue');
      await addSMSJob({
        to: user.pendingMobileNumber,
        body: `Your verification OTP is: ${otp}. Valid for ${getOtpExpiryMinutes()} minutes.`,
        purpose: 'otp.admin_mobile_change_resend',
      });
    } catch (error) {
      logger.error('Failed to resend admin mobile OTP', error);
    }

    logger.info(`Resent admin mobile OTP for ${targetUserId} by ${superAdminId}`);
  }

  async removeAdminMobile(targetUserId: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.mobileNumber) throw new AppError('Admin has no mobile number to remove', 400);

    const hasSeparateWhatsapp = !!user.whatsappNumber;

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        mobileNumber: null,
        isMobileVerified: false,
        pendingMobileNumber: null,
        mobileVerificationToken: null,
        mobileVerificationExpires: null,
        mobileOtpResendCount: 0,
        mobileOtpLastSentAt: null,
        // Reset WhatsApp if using mobile for WhatsApp
        ...(hasSeparateWhatsapp
          ? {}
          : {
              isWhatsappVerified: false,
              whatsappVerificationToken: null,
              whatsappVerificationExpires: null,
              whatsappOtpResendCount: 0,
              whatsappOtpLastSentAt: null,
            }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_MOBILE_REMOVED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
      },
    });

    logger.info(`Admin mobile removed for ${targetUserId} by ${superAdminId}`);
  }

  // ── WhatsApp ──

  async initiateAdminWhatsappVerify(
    targetUserId: string,
    data: { mobileNumber: string; whatsappNumber?: string },
    superAdminId: string
  ) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    if (!user.mobileNumber && !data.mobileNumber) {
      throw new AppError('No mobile number provided', 400);
    }

    const effectiveMobile = data.mobileNumber || user.mobileNumber!;
    const targetNumber = data.whatsappNumber || effectiveMobile;

    // Block if already verified with same number
    if (user.isWhatsappVerified) {
      const currentWhatsapp = user.whatsappNumber || user.mobileNumber;
      if (targetNumber === currentWhatsapp) {
        throw new AppError('WhatsApp already verified with this number', 400);
      }
    }

    const separateWhatsapp =
      data.whatsappNumber && data.whatsappNumber !== effectiveMobile ? data.whatsappNumber : null;

    if (separateWhatsapp) {
      const existing = await prisma.user.findFirst({
        where: { whatsappNumber: separateWhatsapp, id: { not: targetUserId } },
      });
      if (existing) {
        throw new AppError('This WhatsApp number is already in use by another account', 400);
      }
    }

    this.enforceResendLimits(user.whatsappOtpLastSentAt, user.whatsappOtpResendCount);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);
    const expiryMinutes = getOtpExpiryMinutes();

    await redis.set(
      `whatsapp:pending:${targetUserId}`,
      JSON.stringify({ number: separateWhatsapp, targetNumber }),
      'EX',
      expiryMinutes * 60
    );

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        whatsappVerificationToken: hashedOtp,
        whatsappVerificationExpires: new Date(Date.now() + expiryMinutes * 60 * 1000),
        whatsappOtpResendCount: user.whatsappOtpResendCount + 1,
        whatsappOtpLastSentAt: new Date(),
      },
    });

    try {
      const { otpWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = otpWhatsapp(otp);
      await whatsappQueue.add('send-whatsapp', {
        to: targetNumber,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    } catch (error) {
      logger.error('Failed to send admin WhatsApp OTP', error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_WHATSAPP_VERIFY_INITIATED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { targetNumber },
      },
    });

    logger.info(
      `Admin WhatsApp OTP sent to ${targetNumber} for ${targetUserId} by ${superAdminId}`
    );
  }

  async initiateAdminWhatsappChange(
    targetUserId: string,
    data: { newWhatsappNumber: string; password: string },
    superAdminId: string
  ) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    await this.verifySuperAdminPassword(superAdminId, data.password);

    const currentWhatsapp = user.whatsappNumber || user.mobileNumber;
    if (data.newWhatsappNumber === currentWhatsapp) {
      throw new AppError('New WhatsApp number must be different from current', 400);
    }

    const storeNumber =
      data.newWhatsappNumber === user.mobileNumber ? null : data.newWhatsappNumber;
    const targetNumber = data.newWhatsappNumber;

    if (storeNumber) {
      const existing = await prisma.user.findFirst({
        where: { whatsappNumber: storeNumber, id: { not: targetUserId } },
      });
      if (existing) {
        throw new AppError('This WhatsApp number is already in use by another account', 400);
      }
    }

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);
    const expiryMinutes = getOtpExpiryMinutes();

    await redis.set(
      `whatsapp:pending:${targetUserId}`,
      JSON.stringify({ number: storeNumber, targetNumber }),
      'EX',
      expiryMinutes * 60
    );

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        whatsappVerificationToken: hashedOtp,
        whatsappVerificationExpires: new Date(Date.now() + expiryMinutes * 60 * 1000),
        whatsappOtpResendCount: user.whatsappOtpResendCount + 1,
        whatsappOtpLastSentAt: new Date(),
      },
    });

    if (env.NODE_ENV !== 'production') {
      logger.info(`DEV: Admin WhatsApp change OTP for ${targetNumber}: ${otp}`);
    }

    try {
      const { otpWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = otpWhatsapp(otp);
      await whatsappQueue.add('send-whatsapp', {
        to: targetNumber,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    } catch (error) {
      logger.error('Failed to send admin WhatsApp change OTP', error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_WHATSAPP_CHANGE_INITIATED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { targetNumber },
      },
    });

    logger.info(
      `Admin WhatsApp change initiated for ${targetUserId} to ${targetNumber} by ${superAdminId}`
    );
  }

  async confirmAdminWhatsappOtp(targetUserId: string, otp: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);

    const hashedOtp = hashToken(otp);
    if (user.whatsappVerificationToken !== hashedOtp) {
      throw new AppError('Invalid or expired OTP', 400);
    }
    if (!user.whatsappVerificationExpires || user.whatsappVerificationExpires < new Date()) {
      throw new AppError('Verification code has expired', 400);
    }

    const pendingKey = `whatsapp:pending:${targetUserId}`;
    const pendingData = await redis.get(pendingKey);
    let whatsappNumber: string | null = null;
    if (pendingData) {
      const parsed = JSON.parse(pendingData) as { number: string | null; targetNumber: string };
      whatsappNumber = parsed.number ?? (user.mobileNumber ? null : parsed.targetNumber);
      await redis.del(pendingKey);
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        whatsappNumber,
        isWhatsappVerified: true,
        whatsappVerificationToken: null,
        whatsappVerificationExpires: null,
        whatsappOtpResendCount: 0,
        whatsappOtpLastSentAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_WHATSAPP_VERIFIED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
        details: { whatsappNumber: whatsappNumber || user.mobileNumber },
      },
    });

    logger.info(`Admin WhatsApp verified for ${targetUserId} by ${superAdminId}`);
  }

  async removeAdminWhatsappNumber(targetUserId: string, superAdminId: string) {
    await this.verifyTargetIsAdmin(targetUserId);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        whatsappNumber: null,
        isWhatsappVerified: false,
        whatsappVerificationToken: null,
        whatsappVerificationExpires: null,
        whatsappOtpResendCount: 0,
        whatsappOtpLastSentAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_WHATSAPP_REMOVED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
      },
    });

    logger.info(`Admin WhatsApp removed for ${targetUserId} by ${superAdminId}`);
  }

  // ── Admin Password (verified change) ──

  async initiateAdminPasswordChange(
    targetUserId: string,
    data: { password: string; newPassword: string },
    superAdminId: string
  ) {
    const user = await this.verifyTargetIsAdmin(targetUserId);
    await this.verifySuperAdminPassword(superAdminId, data.password);

    const strengthCheck = validatePasswordStrength(data.newPassword);
    if (!strengthCheck.isValid) throw new AppError(strengthCheck.errors.join('. '), 400);

    // Hash new password and store temporarily in Redis
    const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
    const expiryMinutes = getOtpExpiryMinutes();
    await redis.set(`admin:pw:pending:${targetUserId}`, hashedPassword, 'EX', expiryMinutes * 60);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: new Date(Date.now() + expiryMinutes * 60 * 1000),
        emailOtpResendCount: 0,
        emailOtpLastSentAt: new Date(),
      },
    });

    try {
      const emailContent = passwordResetOtpTemplate(otp);
      await emailQueue.add('send-email', {
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to send admin password change OTP to ${user.email}`, error);
    }

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_PASSWORD_CHANGE_INITIATED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
      },
    });

    logger.info(
      `Admin password change initiated for ${targetUserId} by super admin ${superAdminId}`
    );
  }

  async confirmAdminPasswordChange(targetUserId: string, otp: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);

    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      throw new AppError('No verification code found. Please request a new one.', 400);
    }
    if (user.emailVerificationExpires < new Date()) {
      throw new AppError('Verification code has expired. Please request a new one.', 400);
    }
    const hashedOtp = hashToken(otp);
    if (hashedOtp !== user.emailVerificationToken) {
      throw new AppError('Invalid verification code', 400);
    }

    // Retrieve pending password from Redis
    const pendingKey = `admin:pw:pending:${targetUserId}`;
    const hashedPassword = await redis.get(pendingKey);
    if (!hashedPassword) {
      throw new AppError('No pending password change found. Please start again.', 400);
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        password: hashedPassword,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        emailOtpResendCount: 0,
        emailOtpLastSentAt: null,
      },
    });

    await redis.del(pendingKey);
    await revokeAllUserTokens(targetUserId);
    await sessionService.revokeAllSessions(targetUserId);

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_PASSWORD_CHANGED',
        entity: 'User',
        entityId: targetUserId,
        performedBy: superAdminId,
      },
    });

    logger.info(`Admin password changed for ${targetUserId} by super admin ${superAdminId}`);
  }

  async resendAdminPasswordOtp(targetUserId: string, superAdminId: string) {
    const user = await this.verifyTargetIsAdmin(targetUserId);

    // Ensure a pending password change exists
    const pendingKey = `admin:pw:pending:${targetUserId}`;
    const pending = await redis.get(pendingKey);
    if (!pending) {
      throw new AppError('No pending password change. Please initiate a new one.', 400);
    }

    this.enforceResendLimits(user.emailOtpLastSentAt, user.emailOtpResendCount);

    const otp = generateOtp(getOtpLength());
    const hashedOtp = hashToken(otp);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        emailVerificationToken: hashedOtp,
        emailVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
        emailOtpResendCount: user.emailOtpResendCount + 1,
        emailOtpLastSentAt: new Date(),
      },
    });

    try {
      const emailContent = passwordResetOtpTemplate(otp);
      await emailQueue.add('send-email', {
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error('Failed to resend admin password change OTP', error);
    }

    logger.info(`Resent admin password OTP for ${targetUserId} by ${superAdminId}`);
  }
}

export const superAdminService = new SuperAdminService();
