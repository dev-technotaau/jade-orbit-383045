export type Role = 'CANDIDATE' | 'EMPLOYER' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  mobileNumber: string | null;
  isMobileVerified: boolean;
  isWhatsappVerified: boolean;
  whatsappNumber?: string | null;
  isActive: boolean;
  isSuspended: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Included in login + getMe responses for immediate header display */
  companyProfile?: { logo: string | null; coverImage: string | null; companyName: string } | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
  rememberMe?: boolean;
  trustDevice?: boolean;
  trustDeviceToken?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'CANDIDATE' | 'EMPLOYER';
  mobileNumber?: string;
  companyName?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  requireMfa?: boolean;
  trustedDeviceToken?: string;
}

export interface RegisterResponse {
  user: { id: string; email: string; role: Role };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyMobileRequest {
  mobileNumber: string;
  otp: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
}

export interface MfaVerifyRequest {
  token: string;
  password: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  isActive: boolean;
  createdAt: string;
  // Computed client-side
  isCurrent?: boolean;
  deviceInfo?: string | null;
  lastActive?: string;
}
