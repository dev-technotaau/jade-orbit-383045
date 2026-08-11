import api from '@/lib/api';
import type { ApiResponse } from '@/types/api';

/**
 * MFA management client.
 *
 * These endpoints live at `/api/v1/mfa/*`, mounted BELOW the CSRF middleware on
 * the backend — unlike the unlock endpoints, which must sit above it because a
 * locked browser has no session to bind a CSRF token to. Routing through the
 * shared `api` instance is what attaches the CSRF token, so these must not be
 * called with a bare `fetch`.
 */

export interface MfaStatus {
  enabled: boolean;
  enrolledAt: string | null;
  lastVerifiedAt: string | null;
  recoveryCodesRemaining: number;
  trustedDeviceCount: number;
  epoch: number;
  /** False when FIELD_ENCRYPTION_KEY is unset on the server — enrolment is refused. */
  canEnrol: boolean;
  enrolmentPending: boolean;
}

export interface MfaEnrolment {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUri: string;
}

export interface TrustedDevice {
  id: string;
  label: string | null;
  ip: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export const mfaService = {
  async getStatus(): Promise<MfaStatus> {
    const res = await api.get<ApiResponse<MfaStatus>>('/mfa/status');
    return res.data.data as MfaStatus;
  },

  /** Begin enrolment — returns the QR and the manual-entry secret. */
  async beginSetup(): Promise<MfaEnrolment> {
    const res = await api.post<ApiResponse<MfaEnrolment>>('/mfa/setup');
    return res.data.data as MfaEnrolment;
  },

  /** Confirm with a live code. Returns the recovery codes, shown once. */
  async enable(code: string, password: string): Promise<string[]> {
    const res = await api.post<ApiResponse<{ recoveryCodes: string[] }>>('/mfa/enable', {
      code,
      password,
    });
    return res.data.data?.recoveryCodes ?? [];
  },

  /** Both factors are required to remove a factor. */
  async disable(code: string, password: string): Promise<void> {
    await api.post('/mfa/disable', { code, password });
  },

  async regenerateRecoveryCodes(code: string, password: string): Promise<string[]> {
    const res = await api.post<ApiResponse<{ recoveryCodes: string[] }>>('/mfa/recovery-codes', {
      code,
      password,
    });
    return res.data.data?.recoveryCodes ?? [];
  },

  /**
   * The kill switch for a shared seed: invalidate every enrolled authenticator
   * and trusted device at once, and require a fresh enrolment.
   */
  async rotateEpoch(password: string): Promise<number> {
    const res = await api.post<ApiResponse<{ epoch: number }>>('/mfa/rotate-epoch', { password });
    return res.data.data?.epoch ?? 0;
  },

  async listDevices(): Promise<TrustedDevice[]> {
    const res = await api.get<ApiResponse<TrustedDevice[]>>('/mfa/devices');
    return res.data.data ?? [];
  },

  async revokeDevice(id: string): Promise<void> {
    await api.delete(`/mfa/devices/${id}`);
  },

  async revokeAllDevices(): Promise<number> {
    const res = await api.post<ApiResponse<{ count: number }>>('/mfa/devices/revoke-all');
    return res.data.data?.count ?? 0;
  },
};

export default mfaService;
