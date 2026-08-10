'use client';

import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { Toaster } from '@/components/ui/Toast';
import { DialogHost } from '@/components/ui/dialog-service';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/store/auth.store';
import { useSocket } from '@/hooks/use-socket';
import { onAuthMessage } from '@/lib/auth-channel';

/**
 * App providers.
 *
 * Four wrappers were removed from the host platform's tree:
 *   - FeatureFlagPrefetcher / MaintenanceGate — the flag HTTP surface never
 *     existed on this backend, and a maintenance splash is a public-product
 *     affordance. This is an internal operator tool.
 *   - PresenceTracker — wrote the operator into Firebase RTDB; nothing read it.
 *   - PushNotificationRegistrar — registered FCM tokens against /devices/fcm,
 *     a route this backend does not have.
 */

function AuthHydrator({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  // The host store exposed an `isHydrated` flag because it restored a session
  // asynchronously (refresh-token exchange). This store only persists a boolean
  // to localStorage, which zustand rehydrates synchronously, so there is no
  // async state to wait on — `hydrate()` just clears the initial loading flag.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}

/** Keeps unlock state in sync across tabs via BroadcastChannel. */
function AuthSyncListener({ children }: { children: ReactNode }) {
  const storeLogin = useAuthStore((s) => s.login);
  const storeLogout = useAuthStore((s) => s.logout);

  useEffect(() => {
    return onAuthMessage((msg) => {
      if (msg.type === 'logout' || msg.type === 'session_expired') {
        getQueryClient().clear();
        storeLogout();
      } else if (msg.type === 'login') {
        getQueryClient().clear();
        // `login()` ignores its argument and installs the fixed OPERATOR —
        // there are no accounts, so the broadcast payload's `user` (still the
        // host platform's multi-role User shape) has nothing to contribute.
        storeLogin();
      }
    });
  }, [storeLogin, storeLogout]);

  return <>{children}</>;
}

function SocketInitializer({ children }: { children: ReactNode }) {
  useSocket();
  return <>{children}</>;
}

function ServiceWorkerRegistrar({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return <>{children}</>;
}

export default function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ServiceWorkerRegistrar>
          <AuthHydrator>
            <AuthSyncListener>
              <SocketInitializer>{children}</SocketInitializer>
            </AuthSyncListener>
          </AuthHydrator>
        </ServiceWorkerRegistrar>
        <Toaster />
        <DialogHost />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
