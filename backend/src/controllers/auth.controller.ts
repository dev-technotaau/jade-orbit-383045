import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import * as mfaService from '../services/mfa.service';
import { AppError } from '../middleware/error';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { auth as firebaseAuth } from '../config/firebase';
import { setTokenCookies, clearTokenCookies, COOKIE_NAMES } from '../utils/cookie-helpers';

// Helper to get client info
const getClientInfo = (req: Request) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip || req.socket.remoteAddress,
});

// ===============================
// Register
// ===============================
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.register(req.body);

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please check your email for the verification code.',
      data: {
        user: result.user,
      },
      ...(result.breachWarning && { warning: result.breachWarning }),
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Login
// ===============================
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userAgent, ipAddress } = getClientInfo(req);

    const result = await authService.login(req.body, userAgent, ipAddress);

    if (result.requireMfa) {
      res.status(200).json({
        status: 'success',
        message: 'MFA required',
        data: { requireMfa: true },
      });
      return;
    }

    // Set httpOnly cookies (BFF reads these; body tokens kept for backward compat)
    if (result.accessToken && result.refreshToken) {
      setTokenCookies(
        res,
        result.accessToken,
        result.refreshToken,
        req.body.rememberMe ?? true,
        result.sessionId
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        ...(result.trustedDeviceToken && { trustedDeviceToken: result.trustedDeviceToken }),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Logout
// ===============================
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Read refresh token from body (legacy) or httpOnly cookie (BFF)
    const tokenToRevoke = req.body.refreshToken || req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

    if (tokenToRevoke) {
      await authService.logout(tokenToRevoke, req.user?.id, req.user?.sessionId);
    }

    clearTokenCookies(res);

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Logout Everywhere
// ===============================
export const logoutEverywhere = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    await authService.logoutEverywhere(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Logged out from all devices',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Refresh Token
// ===============================
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Read refresh token from body (legacy) or httpOnly cookie (BFF)
    const oldRefreshToken = req.body.refreshToken || req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];
    const { userAgent, ipAddress } = getClientInfo(req);

    if (!oldRefreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const result = await authService.refreshTokens(oldRefreshToken, userAgent, ipAddress);

    // Set rotated httpOnly cookies
    setTokenCookies(res, result.accessToken, result.refreshToken, true, result.sessionId);

    res.status(200).json({
      status: 'success',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Verify Email
// ===============================
export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new AppError('Verification token is required', 400);
    }

    const result = await authService.verifyEmail(token, req.headers['user-agent'], req.ip);

    // Set httpOnly cookies (BFF will also handle this, but belt-and-suspenders)
    setTokenCookies(res, result.accessToken, result.refreshToken, true, result.sessionId);

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Forgot Password
// ===============================
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await authService.forgotPassword(req.body);

    res.status(200).json({
      status: 'success',
      message: 'If an account exists, we have sent a password reset OTP.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Reset Password
// ===============================
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await authService.resetPassword(req.body);

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Change Password
// ===============================
// ===============================
// Change Password - Initiate
// ===============================
export const initiateChangePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.initiateChangePassword(req.user.id, req.body);

    res.status(200).json({
      status: 'success',
      message: 'OTP sent to your registered email/mobile.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Change Password - Confirm
// ===============================
export const confirmChangePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.confirmChangePassword(req.user.id, req.body);

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Get Current User
// ===============================
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const user = await authService.getCurrentUser(req.user.id);

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// UI preferences (sidebar pins / section expansion / collapsed rail)
// ===============================
export const getUiPreferences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }
    const uiPreferences = await authService.getUiPreferences(req.user.id);
    res.status(200).json({ status: 'success', data: { uiPreferences } });
  } catch (error) {
    next(error);
  }
};

export const updateUiPreferences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }
    const uiPreferences = await authService.updateUiPreferences(
      req.user.id,
      req.body as Record<string, unknown>
    );
    res.status(200).json({ status: 'success', data: { uiPreferences } });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Setup
// ===============================
export const mfaSetup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const result = await mfaService.generateMfaSecret(req.user.id, req.user.email);

    res.status(200).json({
      status: 'success',
      message: 'MFA setup initiated. Scan the QR code with your authenticator app.',
      data: {
        qrCodeUrl: result.qrCodeUrl,
        secret: result.secret,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Enable
// ===============================
export const mfaEnable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError('MFA code and password are required', 400);
    }

    const result = await mfaService.enableMfa(req.user.id, token, password);

    if (!result.success) {
      throw new AppError(result.error || 'Failed to enable MFA', 400);
    }

    res.status(200).json({
      status: 'success',
      message: 'MFA enabled successfully. Save your backup codes securely.',
      data: {
        backupCodes: result.backupCodes,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Disable
// ===============================
export const mfaDisable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError('MFA code and password are required', 400);
    }

    const result = await mfaService.disableMfa(req.user.id, password, token);

    if (!result.success) {
      throw new AppError(result.error || 'Failed to disable MFA', 400);
    }

    res.status(200).json({
      status: 'success',
      message: 'MFA disabled successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Regenerate Backup Codes
// ===============================
export const mfaRegenerateBackup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { token, password } = req.body;
    const result = await mfaService.regenerateBackupCodes(req.user.id, password, token);
    if (!result.success) {
      throw new AppError(result.error || 'Failed to regenerate backup codes', 400);
    }
    res.status(200).json({
      status: 'success',
      message: 'Backup codes regenerated. Save them securely.',
      data: { backupCodes: result.backupCodes },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Backup Code Count
// ===============================
export const mfaBackupCodeCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const count = await mfaService.getBackupCodeCount(req.user.id);
    res.status(200).json({
      status: 'success',
      data: { count },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Recovery Request (email OTP)
// ===============================
export const mfaRecoveryRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;
    await mfaService.requestMfaRecovery(email);
    res.status(200).json({
      status: 'success',
      message:
        'If MFA is enabled on this account, a recovery code has been sent to the associated email.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// MFA: Recovery Verify (disable MFA + login)
// ===============================
export const mfaRecoveryVerify = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, otp } = req.body;
    const { userAgent, ipAddress } = getClientInfo(req);
    const result = await mfaService.verifyMfaRecovery(email, otp, userAgent, ipAddress);

    // Set httpOnly cookies
    setTokenCookies(res, result.accessToken, result.refreshToken, true, result.sessionId);

    res.status(200).json({
      status: 'success',
      message: 'MFA has been disabled. You are now logged in.',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Change Email (2-step)
// ===============================
export const initiateChangeEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.initiateChangeEmail(req.user.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to your new email address.',
    });
  } catch (error) {
    next(error);
  }
};

export const confirmChangeEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.confirmChangeEmail(req.user.id, req.body.otp);
    res.status(200).json({
      status: 'success',
      message: 'Email changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const resendChangeEmailOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.resendChangeEmailOtp(req.user.id);
    res.status(200).json({
      status: 'success',
      message: 'Verification code resent to your new email address.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Change Mobile (2-step)
// ===============================
export const initiateChangeMobile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.initiateChangeMobile(req.user.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to your new mobile number.',
    });
  } catch (error) {
    next(error);
  }
};

export const confirmChangeMobile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.confirmChangeMobile(req.user.id, req.body.otp);
    res.status(200).json({
      status: 'success',
      message: 'Mobile number changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const resendChangeMobileOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.resendChangeMobileOtp(req.user.id);
    res.status(200).json({
      status: 'success',
      message: 'Verification code resent to your new mobile number.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Social Auth Callbacks
// ===============================
export const socialCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      // Should be handled by passport, but safe fallback
      res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
      return;
    }

    // Generate tokens
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';

    const { accessToken, refreshToken, sessionId } = await authService.generateTokens(
      user,
      userAgent,
      ipAddress
    );

    // Set httpOnly cookies (works when backend and frontend share a domain)
    setTokenCookies(res, accessToken, refreshToken, true, sessionId);

    // Also pass tokens in URL hash fragment for cross-origin BFF setups.
    // Hash fragments are never sent to servers or logged in Referer headers.
    // The frontend callback page reads the hash and calls /api/auth/migrate
    // to set first-party httpOnly cookies, then clears the hash immediately.
    const fragment = `access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&session_id=${encodeURIComponent(sessionId)}`;
    res.redirect(`${env.FRONTEND_URL}/auth/callback#${fragment}`);
  } catch (error) {
    next(error);
  }
};

// ===============================
// Verify Mobile (OTP)
// ===============================
export const verifyMobile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mobileNumber, otp } = req.body;
    await authService.verifyMobile(mobileNumber, otp);

    res.status(200).json({
      status: 'success',
      message: 'Mobile number verified successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Resend Mobile OTP
// ===============================
export const resendMobileOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mobileNumber } = req.body;
    await authService.resendMobileOtp(mobileNumber);

    res.status(200).json({
      status: 'success',
      message: 'OTP resent successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Resend Email Verification
// ===============================
export const resendEmailVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError('Email is required', 400);
    await authService.resendEmailVerification(email);
    // Always return success to prevent email enumeration
    res.status(200).json({
      status: 'success',
      message: 'If an account exists, a verification email has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Verify WhatsApp (Send OTP)
// ===============================
export const verifyWhatsapp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { mobileNumber, whatsappNumber } = req.body;
    await authService.verifyWhatsapp(req.user.id, mobileNumber, whatsappNumber);

    res.status(200).json({
      status: 'success',
      message: 'WhatsApp verification code sent',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Confirm WhatsApp OTP
// ===============================
export const confirmWhatsappOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { mobileNumber, otp } = req.body;
    await authService.confirmWhatsappOtp(req.user.id, mobileNumber, otp);
    res.status(200).json({ status: 'success', message: 'WhatsApp verified successfully' });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Change WhatsApp Number
// ===============================
export const changeWhatsappNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.changeWhatsappNumber(req.user.id, req.body);
    res
      .status(200)
      .json({ status: 'success', message: 'Verification code sent to new WhatsApp number' });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Remove Separate WhatsApp Number
// ===============================
export const removeWhatsappNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.removeWhatsappNumber(req.user.id);
    res.status(200).json({
      status: 'success',
      message: 'Separate WhatsApp number removed. You can re-verify using your mobile number.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Account Deletion
// ===============================
export const requestAccountDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await authService.requestAccountDeletion(req.user.id);
    res.status(200).json({
      status: 'success',
      message:
        'Account deletion requested. Your account will be deleted after 30 days. You can cancel by logging in before then.',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Consent Management
// ===============================
export const getConsents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { ConsentService } = await import('../services/consent.service');
    const consents = await ConsentService.getUserConsents(req.user.id);
    res.status(200).json({ status: 'success', data: consents });
  } catch (error) {
    next(error);
  }
};

export const giveConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { type, version } = req.body;
    const { ConsentService } = await import('../services/consent.service');
    const ip = req.ip || req.socket.remoteAddress;
    const consent = await ConsentService.giveConsent(req.user.id, type, version, ip);
    res.status(201).json({ status: 'success', data: consent });
  } catch (error) {
    next(error);
  }
};

export const revokeConsent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { type } = req.params;
    const { ConsentService } = await import('../services/consent.service');
    await ConsentService.revokeConsent(
      req.user.id,
      type as import('../services/consent.service').ConsentType
    );
    res.status(200).json({ status: 'success', message: 'Consent revoked' });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Data Export (GDPR)
// ===============================
export const exportMyData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { requestDataExport } = await import('../services/data-export.service');
    await requestDataExport(req.user.id, req.user.email);
    res.status(202).json({
      status: 'success',
      message: 'Data export request received. You will receive an email with your data shortly.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Update user profile (firstName, lastName)
 * @route PATCH /api/v1/auth/me/profile
 * @access Private
 */
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const { firstName, lastName } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        isEmailVerified: true,
        isMobileVerified: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      status: 'success',
      data: { user: updatedUser },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Firebase Custom Token (for browser RTDB auth)
// ===============================
export const getFirebaseToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    if (!firebaseAuth) {
      throw new AppError('Firebase Auth is not configured', 503, 'FIREBASE_UNAVAILABLE');
    }

    const token = await firebaseAuth.createCustomToken(req.user.id);

    res.status(200).json({
      status: 'success',
      data: { token },
    });
  } catch (error) {
    next(error);
  }
};
