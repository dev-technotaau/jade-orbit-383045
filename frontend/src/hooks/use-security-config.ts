import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  API_BASE_URL,
  PASSWORD_RULES_DEFAULTS,
  ACCOUNT_SECURITY_DEFAULTS,
  QUERY_KEYS,
} from '@/constants/config';
import type { PasswordRules, AccountSecurity, SecurityConfig } from '@/constants/config';

async function fetchSecurityConfig(): Promise<SecurityConfig> {
  const { data } = await axios.get<{
    password: {
      minLength: number;
      maxLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumber: boolean;
      requireSpecial: boolean;
    };
    account: {
      maxLoginAttempts: number;
      lockDurationMinutes: number;
      sessionTimeoutHours: number;
      maxSessionsPerUser: number;
      passwordResetExpiryHours: number;
      passwordResetMaxAttempts: number;
    };
  }>(`${API_BASE_URL}/config/security`);
  return {
    password: {
      MIN_LENGTH: data.password.minLength,
      MAX_LENGTH: data.password.maxLength,
      REQUIRE_UPPERCASE: data.password.requireUppercase,
      REQUIRE_LOWERCASE: data.password.requireLowercase,
      REQUIRE_NUMBER: data.password.requireNumber,
      REQUIRE_SPECIAL: data.password.requireSpecial,
    },
    account: {
      MAX_LOGIN_ATTEMPTS: data.account.maxLoginAttempts,
      LOCK_DURATION_MINUTES: data.account.lockDurationMinutes,
      SESSION_TIMEOUT_HOURS: data.account.sessionTimeoutHours,
      MAX_SESSIONS_PER_USER: data.account.maxSessionsPerUser,
      PASSWORD_RESET_EXPIRY_HOURS: data.account.passwordResetExpiryHours,
      PASSWORD_RESET_MAX_ATTEMPTS: data.account.passwordResetMaxAttempts,
    },
  };
}

const DEFAULTS: SecurityConfig = {
  password: PASSWORD_RULES_DEFAULTS,
  account: ACCOUNT_SECURITY_DEFAULTS,
};

/** Fetches security config from backend. Falls back to hardcoded defaults on error or while loading. */
export function useSecurityConfig(): SecurityConfig {
  const { data } = useQuery<SecurityConfig>({
    queryKey: QUERY_KEYS.CONFIG.SECURITY,
    queryFn: fetchSecurityConfig,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
  return data ?? DEFAULTS;
}

/** Convenience hook for just password rules */
export function usePasswordRules(): PasswordRules {
  const config = useSecurityConfig();
  return config.password;
}

/** Convenience hook for just account security settings */
export function useAccountSecurity(): AccountSecurity {
  const config = useSecurityConfig();
  return config.account;
}
