import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL, OTP_CONFIG_DEFAULTS, QUERY_KEYS } from '@/constants/config';
import type { OtpConfig } from '@/constants/config';

async function fetchOtpConfig(): Promise<OtpConfig> {
  // Endpoint is /api/config/otp (not under /api/v1/), same pattern as CSRF
  const { data } = await axios.get<{
    length: number;
    resendCooldown: number;
    expiry: number;
    maxResendAttempts: number;
  }>(`${API_BASE_URL}/config/otp`);
  return {
    LENGTH: data.length,
    RESEND_COOLDOWN: data.resendCooldown,
    EXPIRY: data.expiry,
    MAX_RESEND_ATTEMPTS: data.maxResendAttempts,
  };
}

/** Fetches OTP config from backend. Falls back to hardcoded defaults on error or while loading. */
export function useOtpConfig(): OtpConfig {
  const { data } = useQuery<OtpConfig>({
    queryKey: QUERY_KEYS.CONFIG.OTP,
    queryFn: fetchOtpConfig,
    staleTime: 30 * 60 * 1000, // 30 minutes — config rarely changes
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
  return data ?? OTP_CONFIG_DEFAULTS;
}
