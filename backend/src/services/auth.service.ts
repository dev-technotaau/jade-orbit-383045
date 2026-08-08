import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import redis from '../config/redis';
import {
  env,
  getOtpExpiryMinutes,
  getOtpLength,
  getOtpMaxResendAttempts,
  getOtpResendCooldown,
  getPasswordResetExpiryHours,
} from '../config/env';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import { hashToken, generateOtp } from '../utils/crypto';
import type { TokenPayload } from '../utils/jwt';
import { signAccessToken } from '../utils/jwt';
import { checkPasswordBreach, validatePasswordStrength } from '../utils/breach-detection';
import {
  createRefreshToken,
  revokeToken,
  revokeAllUserTokens,
  isTokenValid,
  getTokenRecord,
} from './token.service';
import { verifyMfaToken, verifyTrustedDevice, createTrustedDevice } from './mfa.service';
import type {
  RegisterInput,
  LoginInput,
  ResetPasswordInput,
  InitiateChangePasswordInput,
  ConfirmChangePasswordInput,
  ForgotPasswordInput,
} from '../schemas/auth.schema';
import type { Role, Prisma } from '@prisma/client';
import { emailQueue } from '../jobs/email.queue';
import {
  verifyEmail as verifyEmailTemplate,
  passwordResetOtp as passwordResetOtpTemplate,
  changePasswordOtp as changePasswordOtpTemplate,
  loginAlert,
} from '../templates/email/auth';
import { sessionService } from './session.service';
import { checkImpossibleTravel } from '../utils/impossible-travel';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { sendWelcomeEmail, sendWelcomeWhatsapp } from './welcome.service';
import { KafkaTopics } from '../kafka/topics';
import { trackEvent, getClientId } from './analytics.service';
import { checkOtpAttempts, resetOtpAttempts } from '../utils/otp-rate-limit';

const SALT_ROUNDS = 12;

/**
 * Re-index a user's candidate profile in Elasticsearch after user-level
 * fields change (e.g. verification status). No-op if the user has no
 * candidate profile. Fire-and-forget — failures are logged, not thrown.
 */
async function reindexCandidateIfExists(userId: string): Promise<void> {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (profile) {
      const { searchService } = await import('./search.service');
      await searchService.indexCandidate(profile);
    }
  } catch (err) {
    logger.error(`Failed to re-index candidate after user update (${userId})`, err);
  }
}

function enforceResendLimits(lastSentAt: Date | null, resendCount: number): void {
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

// ===============================
// Registration
// ===============================
export const register = async (
  data: RegisterInput
): Promise<{
  user: { id: string; email: string; role: Role };
  breachWarning?: string;
}> => {
  const { password, firstName, lastName, role } = data;
  const email = data.email?.toLowerCase();

  // Check if user already exists (Email or Mobile)
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: email || undefined }, { mobileNumber: data.mobileNumber || undefined }],
    },
  });

  if (existingUser) {
    if (existingUser.email === email) throw new AppError('Email already registered', 400);
    if (existingUser.mobileNumber === data.mobileNumber) {
      throw new AppError('Mobile number already registered', 400);
    }
  }

  // Validate password strength
  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.isValid) {
    throw new AppError(strengthCheck.errors.join('. '), 400);
  }

  // Check for password breach
  const breachCheck = await checkPasswordBreach(password);

  // Hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Generate OTP for email verification
  const verificationOtp = generateOtp(getOtpLength());
  const hashedVerificationOtp = hashToken(verificationOtp);
  const verificationExpires = new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000);

  // Create user — NO tokens issued until email is verified
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: role as Role,
      mobileNumber: data.mobileNumber,
      emailVerificationToken: hashedVerificationOtp,
      emailVerificationExpires: verificationExpires,
      emailOtpLastSentAt: new Date(),
    },
  });

  logger.info(`New user registered: ${email} (${role})`);

  // Create company profile for employers if companyName was provided
  if (role === 'EMPLOYER' && data.companyName) {
    await prisma.companyProfile
      .create({ data: { userId: user.id, companyName: data.companyName } })
      .catch((err) => logger.error('Failed to create company profile during registration', err));
  }

  // Auto-grant the EMP_FREE plan so new employers see the dashboard with a
  // working quota on day one, instead of a paywall (per payment.md spec:
  // "employer shouldn't get access … until he purchase a plan" — EMP_FREE
  // IS a plan, just zero-priced). Best-effort — never blocks registration.
  if (role === 'EMPLOYER') {
    void (async () => {
      try {
        const freePlan = await prisma.plan.findUnique({ where: { code: 'EMP_FREE' } });
        if (!freePlan) {
          logger.warn('EMP_FREE plan not found in catalog — auto-grant skipped', {
            userId: user.id,
          });
          return;
        }
        const { manuallyGrantEntitlement } = await import('./entitlement.service');
        await manuallyGrantEntitlement({
          userId: user.id,
          planId: freePlan.id,
          validityDays: freePlan.validityDays ?? 7,
          source: 'BONUS',
          notes: 'Auto-granted on employer registration',
          createdBy: 'system',
        });
        logger.info(`Auto-granted EMP_FREE to new employer ${user.id}`);
      } catch (err) {
        logger.error('Auto-grant EMP_FREE failed (non-fatal)', err);
      }
    })();
  }

  // Send verification email with OTP
  try {
    const emailContent = verifyEmailTemplate(verificationOtp);
    await emailQueue.add('send-email', {
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error(`Failed to queue verification email for ${email}`, error);
  }

  // Mobile verification happens later from profile/settings — NOT during registration

  // Publish Kafka event
  publishEvent(KafkaTopics.USER_REGISTERED, user.id, {
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // GA4: track sign_up
  trackEvent(getClientId(user.id), {
    name: 'sign_up',
    params: { method: 'email', role: user.role },
  }).catch(() => {});

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    breachWarning: breachCheck.warning,
  };
};

/**
 * Generate Access and Refresh tokens for a user
 */
export const generateTokens = async (
  user: { id: string; email: string; role: string | Role },
  userAgent: string | undefined,
  ipAddress: string | undefined,
  sessionId?: string
) => {
  // Create session if not provided
  let sid = sessionId;
  if (!sid) {
    const session = await sessionService.createSession(user.id, userAgent, ipAddress);
    sid = session.id;
  }

  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: sid,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = await createRefreshToken(user.id, userAgent, ipAddress, sid);

  return { accessToken, refreshToken, sessionId: sid };
};

// ===============================
// Login
// ===============================
export const login = async (
  data: LoginInput,
  userAgent?: string,
  ipAddress?: string
): Promise<{
  user: {
    id: string;
    email: string;
    role: Role;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    isEmailVerified: boolean;
    mfaEnabled: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    companyProfile?: { logo: string | null; coverImage: string | null; companyName: string } | null;
  };
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  requireMfa?: boolean;
  trustedDeviceToken?: string;
}> => {
  const { password, mfaCode } = data;
  const email = data.email?.toLowerCase();

  // Find user (include company profile basics for immediate header display)
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      companyProfile: { select: { logo: true, coverImage: true, companyName: true } },
    },
  });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Check if account is suspended
  if (user.isSuspended) {
    throw new AppError('Your account has been suspended. Please contact support.', 403);
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw new AppError(`Account is locked. Try again in ${minutesLeft} minutes.`, 423);
  }

  // Verify password
  if (!user.password) {
    throw new AppError('Invalid email or password', 401);
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    // Increment login attempts
    const maxAttempts = parseInt(env.MAX_LOGIN_ATTEMPTS, 10);
    const newAttempts = user.loginAttempts + 1;

    if (newAttempts >= maxAttempts) {
      // Lock account
      const lockDuration = parseInt(env.ACCOUNT_LOCK_DURATION_MINUTES, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: newAttempts,
          lockUntil: new Date(Date.now() + lockDuration * 60 * 1000),
        },
      });
      logger.warn(`Account locked due to failed attempts: ${email}`);
      throw new AppError(
        `Too many failed attempts. Account locked for ${lockDuration} minutes.`,
        423
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: newAttempts },
    });

    throw new AppError('Invalid email or password', 401);
  }

  // Check email verification (after password to prevent enumeration)
  if (!user.isEmailVerified) {
    throw new AppError(
      'Please verify your email before logging in. Check your inbox for the verification code.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  // Check MFA
  let trustedDeviceToken: string | undefined;
  if (user.mfaEnabled) {
    // Check if device is trusted (skip MFA)
    const isTrusted = data.trustDeviceToken
      ? await verifyTrustedDevice(user.id, data.trustDeviceToken)
      : false;

    if (!isTrusted) {
      if (!mfaCode) {
        return {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
            isEmailVerified: user.isEmailVerified,
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            companyProfile: user.companyProfile,
          },
          accessToken: '',
          refreshToken: '',
          requireMfa: true,
        };
      }

      const isMfaValid = await verifyMfaToken(user.id, mfaCode);
      if (!isMfaValid) {
        // Increment login attempts on MFA failure (prevents brute-force)
        const newAttempts = user.loginAttempts + 1;
        const lockData: Record<string, unknown> = { loginAttempts: newAttempts };
        if (newAttempts >= parseInt(env.MAX_LOGIN_ATTEMPTS, 10)) {
          lockData.lockUntil = new Date(
            Date.now() + parseInt(env.ACCOUNT_LOCK_DURATION_MINUTES, 10) * 60 * 1000
          );
        }
        await prisma.user.update({ where: { id: user.id }, data: lockData });
        throw new AppError('Invalid MFA code', 401);
      }

      // Create trusted device token if user opted in
      if (data.trustDevice) {
        trustedDeviceToken = await createTrustedDevice(user.id, userAgent, ipAddress);
      }
    }
  }

  // Reset login attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
    },
  });

  logger.info(`User logged in: ${email}`);

  // Impossible travel detection (non-blocking)
  if (ipAddress && user.lastLoginIp) {
    checkImpossibleTravel(ipAddress, user.lastLoginIp, user.lastLoginAt)
      .then((warning) => {
        if (warning) {
          // Send security alert email
          const alertContent = loginAlert(
            new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            ipAddress,
            userAgent
          );
          return emailQueue
            .add('send-email', {
              to: user.email,
              subject: '⚠️ Suspicious Login Detected — Hire Adda',
              html: alertContent.html,
              text: alertContent.text,
            })
            .catch(() => {});
        }
        return undefined;
      })
      .catch(() => {});
  }

  // Create session and generate tokens with sessionId
  const session = await sessionService.createSession(user.id, userAgent, ipAddress);
  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: session.id,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = await createRefreshToken(user.id, userAgent, ipAddress, session.id);

  // Publish Kafka events
  publishEvent(KafkaTopics.USER_LOGIN, user.id, { userId: user.id, email: user.email });
  publishEvent(KafkaTopics.SESSION_CREATED, user.id, { userId: user.id, sessionId: session.id });

  // GA4: track login
  trackEvent(getClientId(user.id), { name: 'login', params: { method: 'email' } }).catch(() => {});

  // Presence is owned entirely by the live client connection (Firebase
  // RTDB onDisconnect) — the server no longer writes online on login.
  // A one-time server write had no disconnect cleanup, so it could leave
  // a permanent "online" ghost if the browser tracker never started.

  // Post-login security checks: device fingerprint, geolocation anomaly (fire-and-forget)
  void import('../services/device-security.service')
    .then(({ postLoginChecks }) => {
      const fingerprint = (data as Record<string, unknown>).deviceFingerprint as string | undefined;
      return postLoginChecks(user.id, ipAddress || '', userAgent || '', fingerprint);
    })
    .catch(() => {});

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isEmailVerified: user.isEmailVerified,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      companyProfile: user.companyProfile,
    },
    accessToken,
    refreshToken,
    sessionId: session.id,
    trustedDeviceToken,
  };
};

// ===============================
// Logout
// ===============================
export const logout = async (
  refreshToken: string,
  userId?: string,
  sessionId?: string
): Promise<void> => {
  await revokeToken(refreshToken);

  // Revoke the session if sessionId is provided
  if (sessionId && userId) {
    sessionService.revokeSession(userId, sessionId).catch(() => {});
  }

  // No server-side presence write on logout: the logging-out tab's
  // tracker removes its own connection child on unmount, and other live
  // devices stay correctly online. Forcing the whole user offline here
  // would wrongly hide their other sessions.
  logger.debug('User logged out');
};

// ===============================
// Logout Everywhere
// ===============================
export const logoutEverywhere = async (userId: string): Promise<void> => {
  await revokeAllUserTokens(userId);
  await sessionService.revokeAllSessions(userId);

  // Notify user via email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      isEmailVerified: true,
      isWhatsappVerified: true,
      whatsappNumber: true,
      mobileNumber: true,
    },
  });
  if (user?.isEmailVerified) {
    void import('../templates/email/security')
      .then(({ sessionRevokedAll }) => {
        const tmpl = sessionRevokedAll(user.firstName || 'there');
        return emailQueue.add('send-email', {
          to: user.email,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
        });
      })
      .catch(() => {});
  }

  // Also notify via WhatsApp (fire-and-forget)
  try {
    const target =
      user && user.isWhatsappVerified ? user.whatsappNumber || user.mobileNumber : null;
    if (target) {
      const { sessionsRevokedWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = sessionsRevokedWhatsapp();
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp sessions revoked', waErr);
  }

  logger.info(`User logged out from all devices: ${userId}`);
};

// ===============================
// Refresh Tokens
// ===============================
export const refreshTokens = async (
  oldRefreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; sessionId?: string }> => {
  // Validate old token
  const isValid = await isTokenValid(oldRefreshToken);
  if (!isValid) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Get token record with user
  const tokenRecord = await getTokenRecord(oldRefreshToken);
  if (!tokenRecord?.user) {
    throw new AppError('User not found', 401);
  }

  // Preserve sessionId from old token
  const sessionId = tokenRecord.sessionId || undefined;

  // Revoke old token
  await revokeToken(oldRefreshToken);

  // Update lastActiveAt so session timeout resets on token refresh.
  // Must be awaited: the BFF retries /auth/me immediately after refresh,
  // and the auth middleware checks lastActiveAt for session timeout.
  // Fire-and-forget here causes a race where the retry sees stale lastActiveAt,
  // triggering session timeout and permanently locking the user out.
  await prisma.user.update({
    where: { id: tokenRecord.user.id },
    data: { lastActiveAt: new Date() },
  });

  // Update session lastSeenAt
  if (sessionId) {
    sessionService.updateLastSeen(sessionId);
  }

  // Generate new tokens with same sessionId
  const tokenPayload: TokenPayload = {
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    role: tokenRecord.user.role,
    sessionId: sessionId || '',
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = await createRefreshToken(
    tokenRecord.user.id,
    userAgent,
    ipAddress,
    sessionId
  );

  return { accessToken, refreshToken, sessionId };
};

// ===============================
// Verify Email
// ===============================
export const verifyEmail = async (
  token: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{
  user: {
    id: string;
    email: string;
    role: Role;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    mobileNumber: string | null;
    isMobileVerified: boolean;
    isWhatsappVerified: boolean;
    whatsappNumber: string | null;
    isActive: boolean;
    isSuspended: boolean;
    isEmailVerified: boolean;
    mfaEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}> => {
  const hashedToken = hashToken(token);

  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new AppError('Invalid or expired verification token', 400);
  }

  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      emailOtpResendCount: 0,
      emailOtpLastSentAt: null,
      lastLoginAt: now,
      lastLoginIp: ipAddress,
    },
  });

  // Reset OTP attempt counter after successful verification
  resetOtpAttempts(user.id).catch(() => {});

  logger.info(`Email verified: ${user.email}`);
  reindexCandidateIfExists(user.id).catch(() => {});

  // Fire the welcome EMAIL now that email is verified — the registration-time
  // welcome skipped it because email wasn't verified yet. Fire-and-forget.
  sendWelcomeEmail(user.id).catch(() => {});

  // Generate tokens so user is auto-logged-in after verification (session created inside)
  const { accessToken, refreshToken, sessionId } = await generateTokens(user, userAgent, ipAddress);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      mobileNumber: user.mobileNumber,
      isMobileVerified: user.isMobileVerified,
      isWhatsappVerified: user.isWhatsappVerified,
      whatsappNumber: user.whatsappNumber,
      isActive: user.isActive,
      isSuspended: user.isSuspended,
      isEmailVerified: true,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: now,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    accessToken,
    refreshToken,
    sessionId,
  };
};

// ===============================
// Forgot Password
// ===============================
export const forgotPassword = async (data: ForgotPasswordInput): Promise<void> => {
  const email = data.email?.toLowerCase();
  const { mobileNumber } = data;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: email || undefined }, { mobileNumber: mobileNumber || undefined }],
    },
  });

  if (!user) {
    // Return success to prevent enumeration
    return;
  }

  // Rate-limit OTP sends per user
  await checkOtpAttempts(user.id);

  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);
  const resetExpires = new Date(Date.now() + getPasswordResetExpiryHours() * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedOtp,
      passwordResetExpires: resetExpires,
    },
  });

  if (mobileNumber && user.mobileNumber === mobileNumber) {
    // Send SMS OTP
    if (env.NODE_ENV !== 'production') {
      logger.info(`DEV: Password Reset OTP for ${mobileNumber}: ${otp}`);
    }
    try {
      const { addSMSJob } = await import('../jobs/sms.queue');
      await addSMSJob({
        to: mobileNumber,
        body: `Your password reset OTP is: ${otp}. Valid for 15 minutes.`,
        purpose: 'otp.password_reset',
        userId: user.id,
      });
    } catch (error) {
      logger.error('Failed to send SMS OTP', error);
    }
  } else if (email && user.email === email) {
    // Send Email OTP
    try {
      const emailContent = passwordResetOtpTemplate(otp);
      await emailQueue.add('send-email', {
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (error) {
      logger.error(`Failed to queue password reset email for ${email}`, error);
    }
  }

  // Also notify via WhatsApp (fire-and-forget)
  try {
    const target = user.isWhatsappVerified ? user.whatsappNumber || user.mobileNumber : null;
    if (target) {
      const { passwordResetWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = passwordResetWhatsapp(otp);
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp password reset', waErr);
  }
};

// ===============================
// Reset Password
// ===============================
// ===============================
// Reset Password (with OTP/Token)
// ===============================
export const resetPassword = async (data: ResetPasswordInput): Promise<void> => {
  const { token, otp, password } = data;

  // We expect 'token' to be the OTP in the new flow, or 'otp' field explicitly
  const verificationCode = otp || token;

  if (!verificationCode) {
    throw new AppError('OTP or Token is required', 400);
  }

  const hashedToken = hashToken(verificationCode);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  // Rate-limit OTP verification attempts
  await checkOtpAttempts(user.id);

  // Validate password strength
  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.isValid) {
    throw new AppError(strengthCheck.errors.join('. '), 400);
  }

  // Check for breach
  const breachCheck = await checkPasswordBreach(password);
  if (breachCheck.isBreached) {
    logger.warn(`User attempting to use breached password during reset: ${user.email}`);
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Update password and clear reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  // Revoke all refresh tokens for security
  await revokeAllUserTokens(user.id);

  // Reset OTP attempt counter after successful reset
  resetOtpAttempts(user.id).catch(() => {});

  // GA4: track password_reset
  trackEvent(getClientId(user.id), { name: 'password_reset' }).catch(() => {});

  logger.info(`Password reset completed: ${user.email}`);
};

// ===============================
// Change Password - Initiate
// ===============================
export const initiateChangePassword = async (
  userId: string,
  data: InitiateChangePasswordInput
): Promise<void> => {
  const { currentPassword } = data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  if (user.password) {
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) throw new AppError('Current password is incorrect', 401);
  } else {
    throw new AppError('Account uses social login. Use reset password flow.', 400);
  }

  // Generate OTP
  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);

  // Reuse passwordResetToken for change-password OTP (same "proof of ownership" purpose)
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: hashedOtp,
      passwordResetExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
    },
  });

  // Send OTP via Email
  try {
    const emailContent = changePasswordOtpTemplate(otp);
    await emailQueue.add('send-email', {
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error(`Failed to email Change Password OTP to ${user.email}`, error);
  }

  logger.info(`Change Password initiated for ${user.email}`);
};

// ===============================
// Change Password - Confirm
// ===============================
export const confirmChangePassword = async (
  userId: string,
  data: ConfirmChangePasswordInput
): Promise<void> => {
  const { otp, newPassword } = data;
  const hashedOtp = hashToken(otp);

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      passwordResetToken: hashedOtp,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) throw new AppError('Invalid or expired OTP', 400);

  // Validate strength & breach
  const strengthCheck = validatePasswordStrength(newPassword);
  if (!strengthCheck.isValid) throw new AppError(strengthCheck.errors.join('. '), 400);

  const breachCheck = await checkPasswordBreach(newPassword);
  if (breachCheck.isBreached) logger.warn(`User uses breached pass: ${user.email}`);

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  await revokeAllUserTokens(userId);

  // Notify user about password change (fire-and-forget)
  void import('./notification.service')
    .then(({ notificationService }) => {
      return notificationService.notifyPasswordChanged(userId);
    })
    .catch(() => {});

  logger.info(`Password changed for user ${userId}`);
};

// ===============================
// UI preferences (sidebar pins / section expansion / collapsed rail)
// ===============================
/**
 * Client-managed UI preferences. Stored as an opaque JSON blob on the user; the
 * shape is owned by the frontend. Returns {} when unset.
 */
export const getUiPreferences = async (userId: string): Promise<Record<string, unknown>> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { uiPreferences: true },
  });
  return (user?.uiPreferences as Record<string, unknown> | null) ?? {};
};

/** Shallow-merge a preferences patch (e.g. `{ sidebar: {...} }`) onto the stored blob. */
export const updateUiPreferences = async (
  userId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const existing = await getUiPreferences(userId);
  const next = { ...existing, ...patch };
  await prisma.user.update({
    where: { id: userId },
    data: { uiPreferences: next as Prisma.InputJsonValue },
  });
  return next;
};

// ===============================
// Get Current User
// ===============================
export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      avatar: true,
      mobileNumber: true,
      isMobileVerified: true,
      isWhatsappVerified: true,
      whatsappNumber: true,
      isActive: true,
      isSuspended: true,
      isEmailVerified: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      // Include company profile basics so the header can display logo immediately
      companyProfile: {
        select: {
          logo: true,
          coverImage: true,
          companyName: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

// ===============================
// Resend Email Verification
// ===============================
export const resendEmailVerification = async (rawEmail: string): Promise<void> => {
  const email = rawEmail.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Silent return to prevent email enumeration
  if (!user || user.isEmailVerified) return;

  // Rate-limit OTP sends per user
  await checkOtpAttempts(user.id);

  enforceResendLimits(user.emailOtpLastSentAt, user.emailOtpResendCount);

  const verificationOtp = generateOtp(getOtpLength());
  const hashedVerificationOtp = hashToken(verificationOtp);
  const verificationExpires = new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: hashedVerificationOtp,
      emailVerificationExpires: verificationExpires,
      emailOtpResendCount: user.emailOtpResendCount + 1,
      emailOtpLastSentAt: new Date(),
    },
  });

  try {
    const emailContent = verifyEmailTemplate(verificationOtp);
    await emailQueue.add('send-email', {
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error('Failed to queue verification email', error);
  }
  logger.info(`Resent email verification for ${user.email}`);
};

// ===============================
// Verify Mobile
// ===============================
export const verifyMobile = async (mobileNumber: string, otp: string): Promise<void> => {
  const hashedOtp = hashToken(otp); // Assuming OTPs are hashed in DB for security

  const user = await prisma.user.findFirst({
    where: {
      mobileNumber,
      mobileVerificationToken: hashedOtp, // In real app, check hash match
      mobileVerificationExpires: { gt: new Date() },
    },
  });

  // NOTE: For MVP/Dev without SMS, we might store plain OTP or use a fixed one.
  // If using `generateSecureToken(6, true)` it returns numeric string.
  // For this implementation, let's assume `mobileVerificationToken` stores the HASHED OTP.

  if (!user) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  // Rate-limit OTP verification attempts
  await checkOtpAttempts(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isMobileVerified: true,
      mobileVerificationToken: null,
      mobileVerificationExpires: null,
      mobileOtpResendCount: 0,
      mobileOtpLastSentAt: null,
    },
  });

  // Reset OTP attempt counter after successful verification
  resetOtpAttempts(user.id).catch(() => {});

  logger.info(`Mobile verified: ${mobileNumber}`);
  reindexCandidateIfExists(user.id).catch(() => {});

  // Fire the welcome SMS on first mobile verification (respects the SMS flag).
};

// ===============================
// Resend Mobile OTP
// ===============================
export const resendMobileOtp = async (mobileNumber: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { mobileNumber } });
  if (!user) return; // Silent return to prevent mobile number enumeration

  if (user.isMobileVerified) throw new AppError('Mobile already verified', 400);

  // Rate-limit OTP sends per user
  await checkOtpAttempts(user.id);

  enforceResendLimits(user.mobileOtpLastSentAt, user.mobileOtpResendCount);

  // Generate new OTP
  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mobileVerificationToken: hashedOtp,
      mobileVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
      mobileOtpResendCount: user.mobileOtpResendCount + 1,
      mobileOtpLastSentAt: new Date(),
    },
  });

  // TODO: Send SMS via Queue
  if (env.NODE_ENV !== 'production') {
    logger.info(`DEV: Resent Mobile OTP for ${mobileNumber}: ${otp}`);
  }

  try {
    const { addSMSJob } = await import('../jobs/sms.queue');
    await addSMSJob({
      to: mobileNumber,
      body: `Your verification OTP is: ${otp}. Valid for 10 minutes.`,
      purpose: 'otp.mobile_verify_resend',
    });
  } catch (error) {
    logger.error('Failed to send SMS OTP', error);
  }
};

// ===============================
// Get effective WhatsApp number
// ===============================
export const getWhatsappNumber = (user: {
  whatsappNumber: string | null;
  mobileNumber: string | null;
}): string | null => {
  return user.whatsappNumber || user.mobileNumber;
};

// ===============================
// Verify WhatsApp (Send OTP)
// ===============================
export const verifyWhatsapp = async (
  userId: string,
  mobileNumber: string,
  whatsappNumber?: string
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.mobileNumber && !mobileNumber) throw new AppError('No mobile number provided', 400);
  // Allow re-verification when switching from mobile to separate number (or vice versa)
  const effectiveMobile = mobileNumber || user.mobileNumber!;
  const targetNumber = whatsappNumber || effectiveMobile;

  // Block only if already verified with the SAME target number
  if (user.isWhatsappVerified) {
    const currentWhatsapp = user.whatsappNumber || user.mobileNumber;
    if (targetNumber === currentWhatsapp) {
      throw new AppError('WhatsApp already verified with this number', 400);
    }
  }
  const separateWhatsapp =
    whatsappNumber && whatsappNumber !== effectiveMobile ? whatsappNumber : null;

  // Check if WhatsApp number is already used by another user
  if (separateWhatsapp) {
    const existingUser = await prisma.user.findFirst({
      where: { whatsappNumber: separateWhatsapp, id: { not: userId } },
    });
    if (existingUser) {
      throw new AppError('This WhatsApp number is already in use by another account', 400);
    }
  }

  enforceResendLimits(user.whatsappOtpLastSentAt, user.whatsappOtpResendCount);

  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);
  const expiryMinutes = getOtpExpiryMinutes();

  // Store pending WhatsApp number in Redis — only persisted to DB after OTP confirmation
  await redis.set(
    `whatsapp:pending:${userId}`,
    JSON.stringify({ number: separateWhatsapp, targetNumber }),
    'EX',
    expiryMinutes * 60
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappVerificationToken: hashedOtp,
      whatsappVerificationExpires: new Date(Date.now() + expiryMinutes * 60 * 1000),
      whatsappOtpResendCount: user.whatsappOtpResendCount + 1,
      whatsappOtpLastSentAt: new Date(),
    },
  });

  // Send OTP via WhatsApp
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
    logger.error('Failed to send WhatsApp OTP', error);
  }

  logger.info(`WhatsApp OTP sent to ${targetNumber}`);
};

// ===============================
// Confirm WhatsApp OTP
// ===============================
export const confirmWhatsappOtp = async (
  userId: string,
  _mobileNumber: string,
  otp: string
): Promise<void> => {
  const hashedOtp = hashToken(otp);
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      whatsappVerificationToken: hashedOtp,
      whatsappVerificationExpires: { gt: new Date() },
    },
  });
  if (!user) throw new AppError('Invalid or expired OTP', 400);

  // Read pending WhatsApp number from Redis (stored during send OTP step)
  const pendingKey = `whatsapp:pending:${userId}`;
  const pendingData = await redis.get(pendingKey);
  let whatsappNumber: string | null = null;
  if (pendingData) {
    const parsed = JSON.parse(pendingData) as { number: string | null; targetNumber: string };
    // parsed.number is null when WhatsApp uses the same number as mobile.
    // If mobile is also null, store the actual targetNumber so notifications can reach the user.
    whatsappNumber = parsed.number ?? (user.mobileNumber ? null : parsed.targetNumber);
    await redis.del(pendingKey);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappNumber,
      isWhatsappVerified: true,
      whatsappVerificationToken: null,
      whatsappVerificationExpires: null,
      whatsappOtpResendCount: 0,
      whatsappOtpLastSentAt: null,
    },
  });
  const verifiedNumber = whatsappNumber || user.mobileNumber;
  logger.info(`WhatsApp verified for ${verifiedNumber}`);
  reindexCandidateIfExists(userId).catch(() => {});

  // Fire the WhatsApp welcome on FIRST verification only (not on number change).
  if (!user.isWhatsappVerified) sendWelcomeWhatsapp(userId).catch(() => {});
};

// ===============================
// Change WhatsApp Number
// ===============================
export const changeWhatsappNumber = async (
  userId: string,
  data: { newWhatsappNumber: string; password: string }
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  // Verify password
  if (!user.password) {
    throw new AppError('Cannot change WhatsApp number for social login accounts', 400);
  }
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) throw new AppError('Invalid password', 401);

  const currentWhatsapp = user.whatsappNumber || user.mobileNumber;
  if (data.newWhatsappNumber === currentWhatsapp) {
    throw new AppError('New WhatsApp number must be different from current', 400);
  }

  // If new number equals mobile number, store null (meaning "same as mobile")
  const storeNumber = data.newWhatsappNumber === user.mobileNumber ? null : data.newWhatsappNumber;
  const targetNumber = data.newWhatsappNumber;

  // Check if WhatsApp number is already used by another user
  if (storeNumber) {
    const existingUser = await prisma.user.findFirst({
      where: { whatsappNumber: storeNumber, id: { not: userId } },
    });
    if (existingUser) {
      throw new AppError('This WhatsApp number is already in use by another account', 400);
    }
  }

  // Generate OTP and store pending number in Redis (not DB) until verified
  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);
  const expiryMinutes = getOtpExpiryMinutes();

  // Store pending WhatsApp number in Redis — only persisted to DB after OTP confirmation
  await redis.set(
    `whatsapp:pending:${userId}`,
    JSON.stringify({ number: storeNumber, targetNumber }),
    'EX',
    expiryMinutes * 60
  );

  // Keep old WhatsApp verification active until confirmWhatsappOtp switches to the new number.
  // This way notifications keep flowing to the old number during the OTP window.
  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappVerificationToken: hashedOtp,
      whatsappVerificationExpires: new Date(Date.now() + expiryMinutes * 60 * 1000),
      whatsappOtpResendCount: user.whatsappOtpResendCount + 1,
      whatsappOtpLastSentAt: new Date(),
    },
  });

  if (env.NODE_ENV !== 'production') {
    logger.info(`DEV: WhatsApp change OTP for ${targetNumber}: ${otp}`);
  }

  // Send OTP to new WhatsApp number
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
    logger.error('Failed to send WhatsApp OTP for number change', error);
  }

  logger.info(`WhatsApp number change initiated for user ${userId} to ${targetNumber}`);
};

// ===============================
// Remove Separate WhatsApp Number
// ===============================
export const removeWhatsappNumber = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappNumber: null,
      isWhatsappVerified: false,
      whatsappVerificationToken: null,
      whatsappVerificationExpires: null,
      whatsappOtpResendCount: 0,
      whatsappOtpLastSentAt: null,
    },
  });

  logger.info(`Separate WhatsApp number removed for user ${userId}, reverted to mobile number`);
  reindexCandidateIfExists(userId).catch(() => {});
};

// ===============================
// Change Email (2-step: initiate → confirm)
// ===============================
export const initiateChangeEmail = async (
  userId: string,
  data: { newEmail: string; password: string }
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  // Verify password
  if (!user.password) throw new AppError('Cannot change email for social login accounts', 400);
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) throw new AppError('Invalid password', 401);

  // Normalize new email
  const newEmail = data.newEmail.toLowerCase();

  // Check new email is different
  if (newEmail === user.email) {
    throw new AppError('New email must be different from current email', 400);
  }

  // Check if new email is already taken
  const existingUser = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existingUser) throw new AppError('Email already in use', 400);

  // Generate OTP and store as pending (do NOT change user.email yet)
  const verificationOtp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(verificationOtp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      pendingEmail: newEmail,
      emailVerificationToken: hashedOtp,
      emailVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
      emailOtpResendCount: 0,
      emailOtpLastSentAt: new Date(),
    },
  });

  // Send verification email to NEW address
  try {
    const emailContent = verifyEmailTemplate(verificationOtp);
    await emailQueue.add('send-email', {
      to: data.newEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error('Failed to send email verification', error);
  }

  logger.info(`Email change initiated for user ${userId} to ${data.newEmail}`);
};

export const confirmChangeEmail = async (userId: string, otp: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.pendingEmail) throw new AppError('No pending email change', 400);

  // Verify OTP
  const hashedOtp = hashToken(otp);
  if (user.emailVerificationToken !== hashedOtp) {
    throw new AppError('Invalid verification code', 400);
  }
  if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    throw new AppError('Verification code has expired', 400);
  }

  const oldEmail = user.email;

  // Atomic check-and-update to prevent race conditions
  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email: user.pendingEmail! } });
    if (existingUser) throw new AppError('Email already in use', 400);

    await tx.user.update({
      where: { id: userId },
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

  const newEmail = user.pendingEmail!;

  // Notify old email address using template
  try {
    const { emailChanged } = await import('../templates/email/security');
    const tmpl = emailChanged(user.firstName || 'there', newEmail);
    await emailQueue.add('send-email', {
      to: oldEmail,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
  } catch (error) {
    logger.error('Failed to send email change notification', error);
  }

  // Also notify via WhatsApp (fire-and-forget)
  try {
    const target = user.isWhatsappVerified ? user.whatsappNumber || user.mobileNumber : null;
    if (target) {
      const { emailChangedWhatsapp } = await import('../templates/whatsapp');
      const { whatsappQueue } = await import('../jobs/whatsapp.queue');
      const tmpl = emailChangedWhatsapp(newEmail);
      await whatsappQueue.add('send-whatsapp', {
        to: target,
        templateName: tmpl.templateName,
        components: tmpl.components,
      });
    }
  } catch (waErr) {
    logger.error('Failed to enqueue WhatsApp email changed', waErr);
  }

  logger.info(`Email changed for user ${userId} from ${oldEmail} to ${newEmail}`);
  reindexCandidateIfExists(userId).catch(() => {});
};

export const resendChangeEmailOtp = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.pendingEmail) throw new AppError('No pending email change', 400);

  enforceResendLimits(user.emailOtpLastSentAt, user.emailOtpResendCount);

  const verificationOtp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(verificationOtp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationToken: hashedOtp,
      emailVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
      emailOtpResendCount: user.emailOtpResendCount + 1,
      emailOtpLastSentAt: new Date(),
    },
  });

  try {
    const emailContent = verifyEmailTemplate(verificationOtp);
    await emailQueue.add('send-email', {
      to: user.pendingEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (error) {
    logger.error('Failed to resend email verification', error);
  }

  logger.info(`Resent email change OTP for user ${userId}`);
};

// ===============================
// Change Mobile (2-step: initiate → confirm)
// ===============================
export const initiateChangeMobile = async (
  userId: string,
  data: { newMobileNumber: string; password: string }
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  // Verify password
  if (!user.password) throw new AppError('Cannot change mobile for social login accounts', 400);
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) throw new AppError('Invalid password', 401);

  // Check new number is different
  if (data.newMobileNumber === user.mobileNumber) {
    throw new AppError('New mobile number must be different from current number', 400);
  }

  // Check if number is already taken
  const existingUser = await prisma.user.findFirst({
    where: { mobileNumber: data.newMobileNumber },
  });
  if (existingUser) throw new AppError('Mobile number already in use', 400);

  // Generate OTP and store as pending
  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      pendingMobileNumber: data.newMobileNumber,
      mobileVerificationToken: hashedOtp,
      mobileVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
      mobileOtpResendCount: 0,
      mobileOtpLastSentAt: new Date(),
    },
  });

  // Send SMS to NEW number
  if (env.NODE_ENV !== 'production') {
    logger.info(`DEV: Mobile change OTP for ${data.newMobileNumber}: ${otp}`);
  }

  try {
    const { addSMSJob } = await import('../jobs/sms.queue');
    await addSMSJob({
      to: data.newMobileNumber,
      body: `Your verification OTP is: ${otp}. Valid for ${getOtpExpiryMinutes()} minutes.`,
      purpose: 'otp.mobile_change',
      userId,
    });
  } catch (error) {
    logger.error('Failed to send SMS OTP for mobile change', error);
  }

  logger.info(`Mobile change initiated for user ${userId} to ${data.newMobileNumber}`);
};

export const confirmChangeMobile = async (userId: string, otp: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.pendingMobileNumber) throw new AppError('No pending mobile number change', 400);

  // Verify OTP
  const hashedOtp = hashToken(otp);
  if (user.mobileVerificationToken !== hashedOtp) {
    throw new AppError('Invalid verification code', 400);
  }
  if (!user.mobileVerificationExpires || user.mobileVerificationExpires < new Date()) {
    throw new AppError('Verification code has expired', 400);
  }

  // Atomic check-and-update to prevent race conditions
  // Only reset WhatsApp verification if user uses mobile number for WhatsApp (whatsappNumber is null)
  const hasSeparateWhatsapp = !!user.whatsappNumber;

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findFirst({
      where: { mobileNumber: user.pendingMobileNumber! },
    });
    if (existingUser) throw new AppError('Mobile number already in use', 400);

    await tx.user.update({
      where: { id: userId },
      data: {
        mobileNumber: user.pendingMobileNumber,
        isMobileVerified: true,
        // Only reset WhatsApp if user was using mobile for WhatsApp
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

  logger.info(`Mobile changed for user ${userId} to ${user.pendingMobileNumber}`);
  reindexCandidateIfExists(userId).catch(() => {});
};

export const resendChangeMobileOtp = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.pendingMobileNumber) throw new AppError('No pending mobile number change', 400);

  enforceResendLimits(user.mobileOtpLastSentAt, user.mobileOtpResendCount);

  const otp = generateOtp(getOtpLength());
  const hashedOtp = hashToken(otp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      mobileVerificationToken: hashedOtp,
      mobileVerificationExpires: new Date(Date.now() + getOtpExpiryMinutes() * 60 * 1000),
      mobileOtpResendCount: user.mobileOtpResendCount + 1,
      mobileOtpLastSentAt: new Date(),
    },
  });

  if (env.NODE_ENV !== 'production') {
    logger.info(`DEV: Resent mobile change OTP for ${user.pendingMobileNumber}: ${otp}`);
  }

  try {
    const { addSMSJob } = await import('../jobs/sms.queue');
    await addSMSJob({
      to: user.pendingMobileNumber,
      body: `Your verification OTP is: ${otp}. Valid for ${getOtpExpiryMinutes()} minutes.`,
      purpose: 'otp.mobile_change_resend',
      userId: user.id,
    });
  } catch (error) {
    logger.error('Failed to resend SMS OTP for mobile change', error);
  }

  logger.info(`Resent mobile change OTP for user ${userId}`);
};

// ===============================
// Account Deletion
// ===============================
export const requestAccountDeletion = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: new Date() },
  });

  // Revoke all tokens and sessions
  await revokeAllUserTokens(userId);
  await sessionService.revokeAllSessions(userId);

  // Notify user (email + in-app)
  void import('./notification.service')
    .then(({ notificationService }) => {
      return notificationService.notifyAccountDeletionRequested(userId);
    })
    .catch(() => {});

  logger.info(`Account deletion requested for user ${userId}`);
};
