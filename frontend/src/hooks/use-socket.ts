'use client';

import { useEffect, useSyncExternalStore, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import { APP_CONFIG } from '@/constants/config';

let globalSocket: Socket | null = null;
let socketState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return globalSocket;
}

function getServerSnapshot() {
  return null;
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

/** Fetch socket token from BFF (reads httpOnly cookie server-side) */
async function fetchSocketToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/socket-token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.socketToken || null;
  } catch {
    return null;
  }
}

export function useSocket() {
  const socket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
        socketState = 'disconnected';
        tokenRef.current = null;
        notifyListeners();
      }
      return;
    }

    // Synchronous claim: socketState is set to 'connecting' BEFORE the
    // async token fetch so a second useSocket() mount that fires while
    // the first is still awaiting the token sees the in-progress state
    // and bails. Without this lock, multiple components calling
    // useSocket simultaneously each saw `globalSocket === null` and
    // `socketState === 'disconnected'`, raced past the guard, awaited
    // their own token fetch, then each created a Socket.IO client and
    // attached its own `'notification'` listener. The result was
    // multiple sockets in the same `user:${userId}` room, each firing
    // a toast for the same backend emit → duplicate notification
    // toasts on every server-side push.
    if (globalSocket || socketState !== 'disconnected') {
      return;
    }
    socketState = 'connecting';

    let cancelled = false;

    (async () => {
      const token = await fetchSocketToken();
      if (cancelled || !token) {
        // Release the lock so a re-mount can try again.
        if (!globalSocket) socketState = 'disconnected';
        return;
      }
      // Defence-in-depth: another effect could have completed during
      // our await (shouldn't, given the synchronous lock above, but
      // cheap to verify) — bail rather than duplicating.
      if (globalSocket) return;

      tokenRef.current = token;

      const newSocket = io(APP_CONFIG.socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        // Retry forever (was 5 → the socket died permanently after a brief
        // outage, leaving the inbox silently stale until a page reload). Backoff
        // is capped + jittered so reconnect storms don't hammer the edge.
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
      });

      newSocket.on('connect', () => {
        socketState = 'connected';
      });

      newSocket.on('disconnect', () => {
        socketState = 'disconnected';
      });

      newSocket.on('connect_error', async () => {
        socketState = 'disconnected';
        // Token may have expired — refetch on reconnect attempt
        const freshToken = await fetchSocketToken();
        if (freshToken && newSocket) {
          tokenRef.current = freshToken;
          newSocket.auth = { token: freshToken };
        } else if (!freshToken && newSocket) {
          // Token fetch failed (logged out or session expired) — kill zombie socket
          newSocket.disconnect();
          globalSocket = null;
          tokenRef.current = null;
          notifyListeners();
        }
      });

      // The host platform also listened for `notification` and
      // `application_update` here. This backend emits exactly four events —
      // wa:message, wa:status, wa:conversation, wa:campaign — so both were dead
      // listeners for events that can never fire. WhatsApp events are consumed
      // by the components that need them (see Sidebar, inbox).

      globalSocket = newSocket;
      notifyListeners();
    })();

    return () => {
      cancelled = true;
      // If we claimed the lock but never created the socket (token
      // fetch failed or component unmounted before completion), release
      // it so the next mount can try again.
      if (!globalSocket && socketState === 'connecting') {
        socketState = 'disconnected';
      }
      // Don't disconnect existing sockets on unmount — keep alive for app lifecycle
    };
  }, [isAuthenticated]);

  const emit = useCallback((event: string, data?: unknown) => {
    globalSocket?.emit(event, data);
  }, []);

  return { socket, emit };
}
