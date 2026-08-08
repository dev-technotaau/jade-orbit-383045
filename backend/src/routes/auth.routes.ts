import { Router } from 'express';
import crypto from 'crypto';
import * as authController from '../controllers/auth.controller';
import * as firebaseAuthController from '../controllers/firebase-auth.controller';
import { validate } from '../validators/validate';
import { protect } from '../middleware/auth';
import { authLimiter, mfaLimiter } from '../middleware/rate-limit';
import { audit } from '../middleware/audit';
import { verifyTurnstile } from '../middleware/turnstile';
import { blockAdminSelfMfa } from '../middleware/require-mfa';
import passport from 'passport';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  initiateChangePasswordSchema,
  confirmChangePasswordSchema,
  refreshTokenSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  verifyMobileSchema,
  resendMobileOtpSchema,
  verifyWhatsappSchema,
  verifyWhatsappOtpSchema,
  initiateChangeEmailSchema,
  confirmChangeEmailSchema,
  initiateChangeMobileSchema,
  confirmChangeMobileSchema,
  changeWhatsappNumberSchema,
  resendEmailVerificationSchema,
  firebaseLoginSchema,
  giveConsentSchema,
  mfaRegenerateBackupSchema,
  mfaRecoveryRequestSchema,
  mfaRecoveryVerifySchema,
  updateProfileSchema,
  updateUiPreferencesSchema,
} from '../schemas/auth.schema';

const router = Router();

// ===============================
// High-frequency protected routes (exempt from strict auth limiter)
// These are called on every page load, so the 10 req/5 min auth limiter
// is too strict. They're behind `protect` so abuse is already mitigated.
// ===============================

router.get('/me', protect, authController.getMe);
router.get('/me/ui-preferences', protect, authController.getUiPreferences);
router.put(
  '/me/ui-preferences',
  protect,
  validate(updateUiPreferencesSchema),
  authController.updateUiPreferences
);
router.patch(
  '/me/profile',
  protect,
  validate(updateProfileSchema),
  audit('PROFILE_UPDATE', 'User'),
  authController.updateProfile
);
router.get('/firebase-token', protect, authController.getFirebaseToken);

// Apply strict rate limiting to auth routes below (login, register, etc.)
router.use(authLimiter);

// ===============================
// Public Routes
// ===============================

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               role: { type: string, enum: [CANDIDATE, EMPLOYER] }
 *     responses:
 *       201: { description: Registration successful }
 *       400: { description: Validation error or email already exists }
 */
router.post('/register', verifyTurnstile, validate(registerSchema), authController.register);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               mfaCode: { type: string, description: Required if MFA is enabled }
 *     responses:
 *       200: { description: Login successful }
 *       401: { description: Invalid credentials }
 *       423: { description: Account locked }
 */
router.post(
  '/login',
  // Skip Turnstile on MFA retry — token was already consumed on the initial attempt
  (req, res, next) => (req.body.mfaCode ? next() : verifyTurnstile(req, res, next)),
  validate(loginSchema),
  authController.login
);

/**
 * @openapi
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address with token
 */
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 */
router.post(
  '/forgot-password',
  verifyTurnstile,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

/**
 * @openapi
 * /api/v1/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 */
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (revoke refresh token)
 */
router.post('/logout', authController.logout);

// ===============================
// Protected Routes
// ===============================

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password (authenticated)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/change-password/initiate',
  protect,
  validate(initiateChangePasswordSchema),
  authController.initiateChangePassword
);
router.post(
  '/change-password/confirm',
  protect,
  validate(confirmChangePasswordSchema),
  audit('PASSWORD_CHANGE', 'User'),
  authController.confirmChangePassword
);

/**
 * @openapi
 * /api/v1/auth/logout-everywhere:
 *   post:
 *     tags: [Auth]
 *     summary: Logout from all devices
 *     security: [{ bearerAuth: [] }]
 */
router.post('/logout-everywhere', protect, authController.logoutEverywhere);

// ===============================
// MFA Routes (rate-limited, admins blocked from self-service)
// ===============================

router.post('/mfa/setup', protect, mfaLimiter, blockAdminSelfMfa, authController.mfaSetup);
router.post(
  '/mfa/enable',
  protect,
  mfaLimiter,
  blockAdminSelfMfa,
  validate(mfaVerifySchema),
  authController.mfaEnable
);
router.post(
  '/mfa/disable',
  protect,
  mfaLimiter,
  blockAdminSelfMfa,
  validate(mfaDisableSchema),
  authController.mfaDisable
);
router.post(
  '/mfa/backup-codes',
  protect,
  mfaLimiter,
  blockAdminSelfMfa,
  validate(mfaRegenerateBackupSchema),
  authController.mfaRegenerateBackup
);
router.get('/mfa/backup-codes/count', protect, authController.mfaBackupCodeCount);

// MFA Recovery (no auth required — user is locked out of MFA)
router.post(
  '/mfa/recovery/request',
  authLimiter,
  validate(mfaRecoveryRequestSchema),
  authController.mfaRecoveryRequest
);
router.post(
  '/mfa/recovery/verify',
  authLimiter,
  validate(mfaRecoveryVerifySchema),
  authController.mfaRecoveryVerify
);

router.post('/verify-mobile', validate(verifyMobileSchema), authController.verifyMobile);

router.post('/resend-mobile-otp', validate(resendMobileOtpSchema), authController.resendMobileOtp);

router.post(
  '/verify-whatsapp',
  protect,
  validate(verifyWhatsappSchema),
  authController.verifyWhatsapp
);

router.post(
  '/verify-whatsapp-otp',
  protect,
  validate(verifyWhatsappOtpSchema),
  authController.confirmWhatsappOtp
);

// Public — accepts { email } in body (no auth required for pre-login resend)
router.post(
  '/resend-email-verification',
  validate(resendEmailVerificationSchema),
  authController.resendEmailVerification
);

// ===============================
// Change Email (2-step)
// ===============================
router.post(
  '/change-email/initiate',
  protect,
  validate(initiateChangeEmailSchema),
  authController.initiateChangeEmail
);
router.post(
  '/change-email/confirm',
  protect,
  validate(confirmChangeEmailSchema),
  authController.confirmChangeEmail
);
router.post('/change-email/resend-otp', protect, authController.resendChangeEmailOtp);

// ===============================
// Change Mobile (2-step)
// ===============================
router.post(
  '/change-mobile/initiate',
  protect,
  validate(initiateChangeMobileSchema),
  authController.initiateChangeMobile
);
router.post(
  '/change-mobile/confirm',
  protect,
  validate(confirmChangeMobileSchema),
  authController.confirmChangeMobile
);
router.post('/change-mobile/resend-otp', protect, authController.resendChangeMobileOtp);

// ===============================
// Change/Remove WhatsApp Number
// ===============================
router.post(
  '/change-whatsapp-number',
  protect,
  validate(changeWhatsappNumberSchema),
  authController.changeWhatsappNumber
);
router.delete('/whatsapp-number', protect, authController.removeWhatsappNumber);

// ===============================
// Firebase Auth Login
// ===============================
router.post('/firebase-login', validate(firebaseLoginSchema), firebaseAuthController.firebaseLogin);

// ===============================
// Social Auth Routes
// ===============================

// OAuth role allow-list — used both at init time and on the callback
// to map the `state` query back to a Role enum value. New roles get
// added here once.
const OAUTH_ROLE_VALUES = ['CANDIDATE', 'EMPLOYER'] as const;
type OAuthRole = (typeof OAUTH_ROLE_VALUES)[number];

function pickOAuthRole(input: unknown): OAuthRole {
  if (typeof input === 'string') {
    const upper = input.toUpperCase();
    if ((OAUTH_ROLE_VALUES as readonly string[]).includes(upper)) return upper as OAuthRole;
  }
  return 'CANDIDATE';
}

// Google (pass ?role=EMPLOYER to register accordingly).
// `state` doubles as the OAuth-spec CSRF guard plus the role hint —
// passport echoes it back to the callback unchanged.
router.get('/google', (req, res, next) => {
  const role = pickOAuthRole(req.query.role);
  passport.authenticate('google', { scope: ['profile', 'email'], state: role })(req, res, next);
});
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  authController.socialCallback
);

// LinkedIn — encode role into a `<ROLE>:<nonce>` state so first-time
// signups via LinkedIn respect ?role=… the same way Google does. The
// random nonce preserves CSRF protection.
router.get('/linkedin', (req, res, next) => {
  const role = pickOAuthRole(req.query.role);
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${role}:${nonce}`;
  passport.authenticate('linkedin', { state })(req, res, next);
});
router.get(
  '/linkedin/callback',
  passport.authenticate('linkedin', { failureRedirect: '/login', session: false }),
  authController.socialCallback
);

// ===============================
// Account Deletion (GDPR)
// ===============================
router.delete(
  '/me',
  protect,
  audit('REQUEST_ACCOUNT_DELETION', 'User'),
  authController.requestAccountDeletion
);

// ===============================
// Consent Management (GDPR)
// ===============================
router.get('/me/consents', protect, authController.getConsents);
router.post('/me/consents', protect, validate(giveConsentSchema), authController.giveConsent);
router.delete('/me/consents/:type', protect, authController.revokeConsent);

// ===============================
// Data Export (GDPR)
// ===============================
router.get('/me/data-export', protect, authController.exportMyData);

export default router;
