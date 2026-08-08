'use client';

import { useEffect } from 'react';
import { getFirebaseDatabase, signInToFirebase } from '@/lib/firebase';
import { ref, push, set, remove, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { useAuthStore } from '@/store/auth.store';
import { useFeatureFlag } from '@/hooks/use-feature-flags';

const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Tracks the current user's online presence in Firebase RTDB.
 *
 * Per-CONNECTION model (one child per live tab/device):
 *   presence/{uid}/connections/{pushId} : serverTimestamp
 *   presence/{uid}/lastSeen             : serverTimestamp
 *
 * A user is "online" while they have at least one connection child. Each
 * tab owns its own child and removes only that child on disconnect, so
 * closing one of several tabs no longer flips the whole user offline
 * (the previous single-value model did). `lastSeen` is bumped on connect,
 * on every 5-min heartbeat, and on disconnect — the reader uses it as a
 * staleness gate so a crashed tab (whose onDisconnect never fired) still
 * decays to offline.
 *
 * Gated on the `enablePresence` feature flag so the kill-switch actually
 * stops the client from writing presence (matching the backend gate).
 */
export function usePresenceTracker() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const presenceEnabled = useFeatureFlag('enablePresence', true);

  useEffect(() => {
    if (!isAuthenticated || !userId || !presenceEnabled) return;

    const db = getFirebaseDatabase();
    if (!db) return;

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    // The connection child THIS tab owns — re-created on every reconnect
    // (the prior one is removed server-side by its onDisconnect handler).
    let myConnRef: ReturnType<typeof ref> | null = null;
    const lastSeenRef = ref(db, `presence/${userId}/lastSeen`);

    // Sign into Firebase Auth first, then start presence tracking
    signInToFirebase()
      .then(() => {
        if (cancelled) return;

        const connectionsRef = ref(db, `presence/${userId}/connections`);
        const connectedRef = ref(db, '.info/connected');

        unsubscribe = onValue(connectedRef, (snapshot) => {
          if (!snapshot.val()) {
            // Lost connection — pause the heartbeat. The server runs our
            // onDisconnect handlers (remove this tab's child + bump lastSeen).
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = null;
            }
            return;
          }

          // (Re)connected — claim a fresh per-tab connection child. Arm the
          // disconnect handlers BEFORE marking present so a drop in the
          // window is still cleaned up.
          myConnRef = push(connectionsRef);
          onDisconnect(myConnRef).remove();
          onDisconnect(lastSeenRef).set(serverTimestamp());
          set(myConnRef, serverTimestamp());
          set(lastSeenRef, serverTimestamp());

          // Heartbeat keeps this tab's child + lastSeen fresh while online.
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (myConnRef) set(myConnRef, serverTimestamp());
            set(lastSeenRef, serverTimestamp());
          }, HEARTBEAT_INTERVAL);
        });
      })
      .catch(() => {
        // Firebase sign-in failed — presence tracking disabled for this session
      });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      // Remove only THIS tab's child + bump lastSeen, and cancel the armed
      // onDisconnect handlers so they can't fire against a stale ref after
      // a fast logout→login.
      if (myConnRef) {
        onDisconnect(myConnRef)
          .cancel()
          .catch(() => {});
        remove(myConnRef).catch(() => {});
      }
      onDisconnect(lastSeenRef)
        .cancel()
        .catch(() => {});
      set(lastSeenRef, serverTimestamp()).catch(() => {});
    };
  }, [isAuthenticated, userId, presenceEnabled]);
}
