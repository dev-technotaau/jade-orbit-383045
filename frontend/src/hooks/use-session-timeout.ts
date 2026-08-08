'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useAccountSecurity } from '@/hooks/use-security-config';
import { showToast } from '@/components/ui/Toast';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds
const WARNING_BEFORE_MS = 5 * 60 * 1000; // Warn 5 minutes before timeout

/**
 * Tracks user activity and shows a toast warning when the session
 * is approaching the configured timeout. Keeps it simple: stores
 * the last activity timestamp and checks it on an interval.
 */
export function useSessionTimeout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const { SESSION_TIMEOUT_HOURS } = useAccountSecurity();

  const lastActivityRef = useRef(0);
  const warningShownRef = useRef(false);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Reset on mount
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;

    // Track user activity
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, updateActivity, { passive: true });
    }

    const timeoutMs = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        // Session expired due to inactivity
        showToast.error('Session expired due to inactivity. Please log in again.');
        logout();
        return;
      }

      if (remaining <= WARNING_BEFORE_MS && !warningShownRef.current) {
        warningShownRef.current = true;
        const minutesLeft = Math.max(1, Math.round(remaining / 60_000));
        showToast.warning(
          `Your session will expire in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} due to inactivity.`,
          { duration: 10_000 },
        );
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, updateActivity);
      }
    };
  }, [isAuthenticated, SESSION_TIMEOUT_HOURS, updateActivity, logout]);
}
