import axios from 'axios';
import type { ApiResponse } from '@/types/api';
import type {
  WebAuthnCredential,
  RegisterCredentialResult,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/types/webauthn';
import type { AuthResponse } from '@/types/auth';

/**
 * Dedicated axios instance for WebAuthn routes.
 * Routes through the BFF auth handler at /api/auth/webauthn which:
 * - Adds auth tokens from httpOnly cookies for registration/credential routes
 * - Intercepts login/verify responses to set auth cookies (token stripping)
 * - Sends BFF secret to bypass CSRF on the backend
 */
const webauthnApi = axios.create({
  baseURL: '/api/auth/webauthn',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export const webauthnService = {
  async getRegistrationOptions(): Promise<ApiResponse<PublicKeyCredentialCreationOptionsJSON>> {
    const res = await webauthnApi.post('/register/options');
    return res.data;
  },

  async verifyRegistration(
    credential: unknown,
    friendlyName?: string,
  ): Promise<ApiResponse<RegisterCredentialResult>> {
    const res = await webauthnApi.post('/register/verify', { credential, friendlyName });
    return res.data;
  },

  async getAuthenticationOptions(
    email?: string,
  ): Promise<ApiResponse<PublicKeyCredentialRequestOptionsJSON>> {
    const res = await webauthnApi.post('/login/options', email ? { email } : {});
    return res.data;
  },

  async verifyAuthentication(
    credential: unknown,
    mfaCode?: string,
  ): Promise<ApiResponse<AuthResponse>> {
    const res = await webauthnApi.post('/login/verify', {
      credential,
      ...(mfaCode && { mfaCode }),
    });
    return res.data;
  },

  async listCredentials(): Promise<ApiResponse<WebAuthnCredential[]>> {
    const res = await webauthnApi.get('/credentials');
    return res.data;
  },

  async deleteCredential(id: string): Promise<ApiResponse<null>> {
    const res = await webauthnApi.delete(`/credentials/${id}`);
    return res.data;
  },
};
