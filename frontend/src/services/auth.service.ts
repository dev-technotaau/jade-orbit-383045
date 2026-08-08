import api from '@/lib/api';
import axios, { AxiosError } from 'axios';
import { API } from '@/constants/api';
import type { ApiResponse, ApiError } from '@/types/api';
import type {
  AuthResponse,
  RegisterResponse,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  VerifyMobileRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
} from '@/types/auth';

/**
 * Generate a device fingerprint from browser properties.
 * Used for new-device detection on the backend.
 */
function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(16);
}

/**
 * Extract a meaningful error from raw axios errors (used by BFF auth calls
 * that bypass the api interceptor).
 */
function toBffError(err: unknown): never {
  const axiosErr = err as AxiosError;
  const data = axiosErr.response?.data as Record<string, unknown> | undefined;
  const nested = data?.error as Record<string, unknown> | undefined;
  const message =
    (nested?.message as string) || (data?.message as string) || 'An unexpected error occurred';
  throw {
    status: 'error',
    message,
    statusCode: axiosErr.response?.status || 0,
    code: nested?.code as string | undefined,
    requestId: nested?.requestId as string | undefined,
  } as ApiError;
}

/** Auth response with tokens stripped (BFF sets them as httpOnly cookies) */
type BffAuthResponse = Omit<AuthResponse, 'accessToken' | 'refreshToken'>;

export const authService = {
  // ─── Auth endpoints go through BFF routes (not the generic proxy) ───

  async register(
    data: RegisterRequest,
    turnstileToken?: string,
  ): Promise<ApiResponse<RegisterResponse>> {
    try {
      const res = await axios.post(
        '/api/auth/register',
        {
          ...data,
          ...(turnstileToken && { 'cf-turnstile-response': turnstileToken }),
        },
        { withCredentials: true },
      );
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async login(data: LoginRequest, turnstileToken?: string): Promise<ApiResponse<BffAuthResponse>> {
    try {
      const res = await axios.post(
        '/api/auth/login',
        {
          ...data,
          ...(turnstileToken && { 'cf-turnstile-response': turnstileToken }),
        },
        {
          withCredentials: true,
          headers: { 'X-Device-Fingerprint': getDeviceFingerprint() },
        },
      );
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async logout(): Promise<ApiResponse<null>> {
    try {
      const res = await axios.post('/api/auth/logout', {}, { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async getMe(): Promise<ApiResponse<User>> {
    try {
      const res = await axios.get('/api/auth/me', { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async refresh(): Promise<ApiResponse<null>> {
    try {
      const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async firebaseLogin(
    idToken: string,
    role?: string,
  ): Promise<ApiResponse<BffAuthResponse & { isNewUser: boolean }>> {
    try {
      const res = await axios.post(
        '/api/auth/firebase-login',
        { idToken, role },
        { withCredentials: true },
      );
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  // ─── Non-token endpoints go through the generic proxy ───

  async verifyEmail(data: VerifyEmailRequest): Promise<ApiResponse<BffAuthResponse>> {
    try {
      const res = await axios.post('/api/auth/verify-email', data, { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async resendEmailVerification(email: string): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.RESEND_EMAIL_VERIFICATION, { email });
    return res.data;
  },

  async forgotPassword(
    data: ForgotPasswordRequest,
    turnstileToken?: string,
  ): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.FORGOT_PASSWORD, {
      ...data,
      ...(turnstileToken && { 'cf-turnstile-response': turnstileToken }),
    });
    return res.data;
  },

  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.RESET_PASSWORD, data);
    return res.data;
  },

  async initiateChangePassword(data: { currentPassword: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_PASSWORD_INITIATE, data);
    return res.data;
  },

  async confirmChangePassword(data: {
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_PASSWORD_CONFIRM, data);
    return res.data;
  },

  async logoutEverywhere(): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.LOGOUT_EVERYWHERE);
    return res.data;
  },

  async mfaSetup(): Promise<ApiResponse<MfaSetupResponse>> {
    const res = await api.post(API.AUTH.MFA_SETUP);
    return res.data;
  },

  async mfaEnable(data: MfaVerifyRequest): Promise<ApiResponse<{ backupCodes: string[] }>> {
    const res = await api.post(API.AUTH.MFA_ENABLE, data);
    return res.data;
  },

  async mfaDisable(data: { password: string; token: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.MFA_DISABLE, data);
    return res.data;
  },

  async mfaRegenerateBackup(data: {
    password: string;
    token: string;
  }): Promise<ApiResponse<{ backupCodes: string[] }>> {
    const res = await api.post(API.AUTH.MFA_REGENERATE_BACKUP, data);
    return res.data;
  },

  async mfaBackupCodeCount(): Promise<ApiResponse<{ count: number }>> {
    const res = await api.get(API.AUTH.MFA_BACKUP_CODE_COUNT);
    return res.data;
  },

  async mfaRecoveryRequest(email: string): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.MFA_RECOVERY_REQUEST, { email });
    return res.data;
  },

  async mfaRecoveryVerify(data: {
    email: string;
    otp: string;
  }): Promise<ApiResponse<BffAuthResponse>> {
    try {
      const res = await axios.post('/api/auth/mfa-recovery', data, { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  async initiateChangeEmail(data: {
    newEmail: string;
    password: string;
  }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_EMAIL_INITIATE, data);
    return res.data;
  },

  async confirmChangeEmail(data: { otp: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_EMAIL_CONFIRM, data);
    return res.data;
  },

  async resendChangeEmailOtp(): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_EMAIL_RESEND_OTP);
    return res.data;
  },

  async initiateChangeMobile(data: {
    newMobileNumber: string;
    password: string;
  }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_MOBILE_INITIATE, data);
    return res.data;
  },

  async confirmChangeMobile(data: { otp: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_MOBILE_CONFIRM, data);
    return res.data;
  },

  async resendChangeMobileOtp(): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_MOBILE_RESEND_OTP);
    return res.data;
  },

  async verifyMobile(data: VerifyMobileRequest): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.VERIFY_MOBILE, data);
    return res.data;
  },

  async resendMobileOtp(data: { mobileNumber: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.RESEND_MOBILE_OTP, data);
    return res.data;
  },

  async verifyWhatsApp(data: {
    mobileNumber: string;
    whatsappNumber?: string;
  }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.VERIFY_WHATSAPP, data);
    return res.data;
  },

  async verifyWhatsAppOtp(data: { mobileNumber: string; otp: string }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.VERIFY_WHATSAPP_OTP, data);
    return res.data;
  },

  async changeWhatsappNumber(data: {
    newWhatsappNumber: string;
    password: string;
  }): Promise<ApiResponse<null>> {
    const res = await api.post(API.AUTH.CHANGE_WHATSAPP_NUMBER, data);
    return res.data;
  },

  async removeWhatsappNumber(): Promise<ApiResponse<null>> {
    const res = await api.delete(API.AUTH.REMOVE_WHATSAPP_NUMBER);
    return res.data;
  },

  async exportMyData(): Promise<ApiResponse<null>> {
    const res = await api.get(API.AUTH.DATA_EXPORT);
    return res.data;
  },

  async updateProfile(data: {
    firstName: string;
    lastName: string;
  }): Promise<ApiResponse<{ user: User }>> {
    try {
      const res = await axios.patch('/api/auth/me/profile', data, { withCredentials: true });
      return res.data;
    } catch (err) {
      toBffError(err);
    }
  },

  // ─── Social auth URLs (still point to backend for OAuth redirects) ───

  getGoogleAuthUrl(role?: string): string {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
    const params = role ? `?role=${role}` : '';
    return `${apiUrl}${API.AUTH.GOOGLE}${params}`;
  },

  getLinkedInAuthUrl(): string {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
    return `${apiUrl}${API.AUTH.LINKEDIN}`;
  },
};
