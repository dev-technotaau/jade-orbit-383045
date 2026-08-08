'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { Toaster } from '@/components/ui/Toast';
import { DialogHost } from '@/components/ui/dialog-service';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/store/auth.store';
import { useMaintenanceStore } from '@/store/maintenance.store';
import { useSocket } from '@/hooks/use-socket';
import { onAuthMessage } from '@/lib/auth-channel';
import { analytics } from '@/lib/analytics/track';
import { pushService } from '@/services/push.service';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { usePresenceTracker } from '@/hooks/use-presence-tracker';
import { QUERY_KEYS } from '@/constants/config';
import { onFCMMessage, signOutFirebase } from '@/lib/firebase';
import { showToast } from '@/components/ui/Toast';
import MaintenancePage from '@/components/common/MaintenancePage';

function FeatureFlagPrefetcher({ children }: { children: ReactNode }) {
  // Pre-fetch feature flags on app init (cached for 5 min by React Query)
  useFeatureFlags();
  return <>{children}</>;
}

function AuthHydrator({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [hydrate, isHydrated]);

  return <>{children}</>;
}

const BYPASS_STORAGE_KEY = 'ha_maintenance_bypass';

function MaintenanceGate({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const { data: flags, isPending, dataUpdatedAt } = useFeatureFlags();
  const maintenanceFlag = flags?.maintenanceMode === true;
  const apiTriggered = useMaintenanceStore((s) => s.isMaintenanceMode);
  const clearMaintenance = useMaintenanceStore((s) => s.clearMaintenanceMode);
  const user = useAuthStore((s) => s.user);

  // One-shot state: once feature flags resolve, never show the spinner again
  // (setState during render — React's getDerivedStateFromProps pattern)
  const [resolved, setResolved] = useState(false);
  if (!isPending && !resolved) {
    setResolved(true);
  }

  // Track when the 503 trigger happened so we only trust flags fetched AFTER it
  const triggerTimestamp = useRef<number>(0);

  // When a 503 triggers maintenance, invalidate feature flags to force a fresh fetch
  useEffect(() => {
    if (apiTriggered) {
      triggerTimestamp.current = Date.now();
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.FEATURE_FLAGS.CLIENT });
    }
  }, [apiTriggered, queryClient]);

  // Only clear apiTriggered if flags were fetched AFTER the 503 trigger and confirm maintenance is OFF
  useEffect(() => {
    if (
      !isPending &&
      !maintenanceFlag &&
      apiTriggered &&
      dataUpdatedAt > triggerTimestamp.current
    ) {
      clearMaintenance();
    }
  }, [isPending, maintenanceFlag, apiTriggered, clearMaintenance, dataUpdatedAt]);

  // Admin bypass: ADMIN/SUPER_ADMIN users skip maintenance
  const isAdminRole = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // URL param bypass: ?bypass_maintenance=<key> persisted in sessionStorage
  const [hasBypassKey, setHasBypassKey] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const key = params.get('bypass_maintenance');
    const bypassSecret = process.env.NEXT_PUBLIC_MAINTENANCE_BYPASS_KEY;
    if (key && bypassSecret && key === bypassSecret) {
      sessionStorage.setItem(BYPASS_STORAGE_KEY, '1');
      queueMicrotask(() => setHasBypassKey(true));
    } else if (sessionStorage.getItem(BYPASS_STORAGE_KEY) === '1') {
      queueMicrotask(() => setHasBypassKey(true));
    }
  }, []);

  const isBypassed = isAdminRole || hasBypassKey;

  // If API triggered maintenance AND flags haven't resolved yet, show immediately
  // Once flags resolve, they become the source of truth (useEffect above clears stale state)
  if (apiTriggered && !resolved && !isBypassed) {
    return (
      <MaintenancePage
        message={flags?.maintenanceMessage as string}
        estimatedReturnTime={flags?.maintenanceReturnTime as string}
      />
    );
  }

  // NOTE: this gate must NEVER block the initial render.
  //
  // It used to return a full-screen spinner while `!resolved`. Because
  // `useFeatureFlags()` is a plain client-side `useQuery` with no SSR
  // prefetch, `isPending` is ALWAYS true during server rendering — so
  // `resolved` was always false on the server and this component returned a
  // spinner **instead of the entire application, on every page**.
  //
  // What that produced on the wire (measured against production):
  //   · 243 KB of HTML, of which 90% was the RSC payload inside <script>
  //   · 234 characters of visible text, zero <h1>, zero <h2>
  //   · the only rendered element was this spinner
  //
  // Googlebot and YandexBot execute JavaScript, so they waited for the flags
  // request and indexed the hydrated page — which is why this stayed hidden.
  // Bingbot renders JS far more selectively and would not spend that budget,
  // so it saw an empty spinner page and reported every URL as
  // "Discovered but not crawled".
  //
  // The trade-off, made deliberately: while maintenance mode is ON, a visitor
  // may now see the real page for the few hundred ms before flags resolve,
  // instead of a spinner. Maintenance is a rare, short-lived state and the API
  // independently returns 503; serving an empty shell to every crawler on
  // every page, permanently, is far worse. Server and client-first-render both
  // produce `children` here, so there is no hydration mismatch.

  // Feature-flag path OR api-triggered (when flags also confirm maintenance)
  if ((maintenanceFlag || apiTriggered) && !isBypassed) {
    return (
      <MaintenancePage
        message={flags?.maintenanceMessage as string}
        estimatedReturnTime={flags?.maintenanceReturnTime as string}
      />
    );
  }

  return <>{children}</>;
}

function AuthSyncListener({ children }: { children: ReactNode }) {
  const storeLogin = useAuthStore((s) => s.login);
  const storeLogout = useAuthStore((s) => s.logout);

  useEffect(() => {
    return onAuthMessage((msg) => {
      if (msg.type === 'logout' || msg.type === 'session_expired') {
        signOutFirebase().catch(() => {});
        getQueryClient().clear();
        storeLogout();
      } else if (msg.type === 'login') {
        getQueryClient().clear();
        storeLogin(msg.user);
      }
    });
  }, [storeLogin, storeLogout]);

  return <>{children}</>;
}

function SocketInitializer({ children }: { children: ReactNode }) {
  useSocket();
  return <>{children}</>;
}

function PresenceTracker({ children }: { children: ReactNode }) {
  usePresenceTracker();
  return <>{children}</>;
}

function AnalyticsTracker({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Single call fans out to every consent-enabled provider —
    // GA, GTM, Clarity, Hotjar, PostHog, Adobe, FB, LinkedIn,
    // Pinterest, Reddit, X, TikTok, Quora, Bing UET, Snap.
    // The facade swallows per-provider exceptions so a third-party
    // SDK throwing inside `pageview` can't crash the app.
    analytics.pageView(pathname, typeof document !== 'undefined' ? document.title : undefined);
  }, [pathname]);

  return <>{children}</>;
}

function PushNotificationRegistrar({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      pushService.requestPermissionAndSubscribe().catch(() => {
        // Silent failure - push notifications are optional
      });
    }
  }, [isAuthenticated]);

  // Listen for foreground FCM messages and show toast
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = onFCMMessage((payload) => {
      showToast.info(payload.title || 'New Notification', {
        description: payload.body,
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAuthenticated]);

  // Send Firebase config to service worker for background messages
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.serviceWorker) return;

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({
          type: 'FIREBASE_CONFIG',
          config: {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
          },
        });
      })
      .catch(() => {});
  }, []);

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
          <FeatureFlagPrefetcher>
            <AuthHydrator>
              <AuthSyncListener>
                <MaintenanceGate>
                  <AnalyticsTracker>
                    <SocketInitializer>
                      <PresenceTracker>
                        <PushNotificationRegistrar>{children}</PushNotificationRegistrar>
                      </PresenceTracker>
                    </SocketInitializer>
                  </AnalyticsTracker>
                </MaintenanceGate>
              </AuthSyncListener>
            </AuthHydrator>
          </FeatureFlagPrefetcher>
        </ServiceWorkerRegistrar>
        <Toaster />
        <DialogHost />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
