import { z } from 'zod';
import { e164Phone, e164PhoneOptional } from './phone.schema';
import { Role } from '@prisma/client';

// ===============================
// Registration
// ===============================
export const registerSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address'),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters'),
      firstName: z.string().min(1, 'First name is required').max(50),
      lastName: z.string().min(1, 'Last name is required').max(50),
      role: z.enum([Role.CANDIDATE, Role.EMPLOYER]).default(Role.CANDIDATE),
      mobileNumber: e164PhoneOptional,
      companyName: z.string().min(1).max(200).optional(),
      agreedToTerms: z
        .boolean()
        .refine((val) => val === true, 'You must agree to terms')
        .optional(),
    })
    .refine((data) => data.email || data.mobileNumber, {
      message: 'Either email or mobile number is required',
      path: ['email'],
    }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];

// ===============================
// Login
// ===============================
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    mfaCode: z.string().min(6).max(9).optional(),
    rememberMe: z.boolean().optional(),
    trustDevice: z.boolean().optional(),
    trustDeviceToken: z.string().optional(),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>['body'];

// ===============================
// Email Verification
// ===============================
export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>['body'];

// ===============================
// Forgot Password
// ===============================
export const forgotPasswordSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address').optional(),
      mobileNumber: e164PhoneOptional,
    })
    .refine((data) => data.email || data.mobileNumber, {
      message: 'Either email or mobile number is required',
      path: ['email'],
    }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];

// ===============================
// Reset Password
// ===============================
export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string().min(1, 'Reset token or OTP is required'),
      otp: z.string().length(6, 'OTP must be 6 digits').optional(),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters'),
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    }),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];

// ===============================
// Change Password
// ===============================
export const initiateChangePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
  }),
});

export type InitiateChangePasswordInput = z.infer<typeof initiateChangePasswordSchema>['body'];

export const confirmChangePasswordSchema = z.object({
  body: z
    .object({
      otp: z.string().length(6, 'OTP must be 6 digits'),
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters'),
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    }),
});

export type ConfirmChangePasswordInput = z.infer<typeof confirmChangePasswordSchema>['body'];

// ===============================
// Refresh Token
// ===============================
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];

// ===============================
// MFA Setup
// ===============================
export const mfaVerifySchema = z.object({
  body: z.object({
    token: z.string().length(6, 'MFA code must be 6 digits'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>['body'];

// ===============================
// MFA Disable
// ===============================
export const mfaDisableSchema = z.object({
  body: z.object({
    token: z.string().length(6, 'MFA code must be 6 digits'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type MfaDisableInput = z.infer<typeof mfaDisableSchema>['body'];

// ===============================
// MFA Backup Code Regeneration
// ===============================
export const mfaRegenerateBackupSchema = z.object({
  body: z.object({
    token: z.string().min(6).max(6, 'MFA code must be 6 digits'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type MfaRegenerateBackupInput = z.infer<typeof mfaRegenerateBackupSchema>['body'];

// ===============================
// MFA Recovery Request
// ===============================
export const mfaRecoveryRequestSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export type MfaRecoveryRequestInput = z.infer<typeof mfaRecoveryRequestSchema>['body'];

// ===============================
// MFA Recovery Verify
// ===============================
export const mfaRecoveryVerifySchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'Recovery code must be 6 digits'),
  }),
});

export type MfaRecoveryVerifyInput = z.infer<typeof mfaRecoveryVerifySchema>['body'];

// ===============================
// Mobile Verification
// ===============================
export const verifyMobileSchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
});

export type VerifyMobileInput = z.infer<typeof verifyMobileSchema>['body'];

export const resendMobileOtpSchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
  }),
});

export type ResendMobileOtpInput = z.infer<typeof resendMobileOtpSchema>['body'];

// ===============================
// WhatsApp Verification
// ===============================
export const verifyWhatsappSchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
    whatsappNumber: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid WhatsApp number')
      .optional(),
  }),
});

export type VerifyWhatsappInput = z.infer<typeof verifyWhatsappSchema>['body'];

// ===============================
// Change WhatsApp Number
// ===============================
export const changeWhatsappNumberSchema = z.object({
  body: z.object({
    newWhatsappNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid WhatsApp number'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type ChangeWhatsappNumberInput = z.infer<typeof changeWhatsappNumberSchema>['body'];

// ===============================
// WhatsApp OTP Confirmation
// ===============================
export const verifyWhatsappOtpSchema = z.object({
  body: z.object({
    mobileNumber: e164Phone,
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
});

export type VerifyWhatsappOtpInput = z.infer<typeof verifyWhatsappOtpSchema>['body'];

// ===============================
// Change Email (2-step: initiate → confirm)
// ===============================
export const initiateChangeEmailSchema = z.object({
  body: z.object({
    newEmail: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type InitiateChangeEmailInput = z.infer<typeof initiateChangeEmailSchema>['body'];

export const confirmChangeEmailSchema = z.object({
  body: z.object({
    otp: z.string().min(4).max(8),
  }),
});

export type ConfirmChangeEmailInput = z.infer<typeof confirmChangeEmailSchema>['body'];

// ===============================
// Change Mobile (2-step: initiate → confirm)
// ===============================
export const initiateChangeMobileSchema = z.object({
  body: z.object({
    newMobileNumber: e164Phone,
    password: z.string().min(1, 'Password is required'),
  }),
});

export type InitiateChangeMobileInput = z.infer<typeof initiateChangeMobileSchema>['body'];

export const confirmChangeMobileSchema = z.object({
  body: z.object({
    otp: z.string().min(4).max(8),
  }),
});

export type ConfirmChangeMobileInput = z.infer<typeof confirmChangeMobileSchema>['body'];

// ===============================
// Resend Email Verification
// ===============================
export const resendEmailVerificationSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

// ===============================
// Firebase Login
// ===============================
export const firebaseLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Firebase ID token is required'),
    role: z.enum([Role.CANDIDATE, Role.EMPLOYER]).optional(),
  }),
});

// ===============================
// Consent Management
// ===============================
export const giveConsentSchema = z.object({
  body: z.object({
    type: z.string().min(1, 'Consent type is required'),
    granted: z.boolean(),
  }),
});

// ===============================
// Update Profile
// ===============================
export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50, 'First name must be at most 50 characters')
      .regex(
        /^[a-zA-Z\s'-]+$/,
        'First name can only contain letters, spaces, hyphens, and apostrophes'
      ),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50, 'Last name must be at most 50 characters')
      .regex(
        /^[a-zA-Z\s'-]+$/,
        'Last name can only contain letters, spaces, hyphens, and apostrophes'
      ),
  }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];

// Sidebar / UI preferences — a small, bounded client-managed blob. Kept loose
// (all optional) since the exact shape is owned by the frontend; the caps just
// stop a malicious client from persisting unbounded data.
export const updateUiPreferencesSchema = z.object({
  body: z.object({
    sidebar: z
      .object({
        pins: z.array(z.string().max(256)).max(50).optional(),
        expanded: z.record(z.string().max(32), z.array(z.string().max(80)).max(30)).optional(),
        collapsed: z.boolean().optional(),
      })
      .optional(),
  }),
});

export type UpdateUiPreferencesInput = z.infer<typeof updateUiPreferencesSchema>['body'];
