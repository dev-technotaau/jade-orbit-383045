'use client';

import { useEffect, useSyncExternalStore, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import { APP_CONFIG } from '@/constants/config';

let globalSocket: Socket | null = null;
export type SocketStatus = 'disconnected' | 'connecting' | 'connected';
let socketState: SocketStatus = 'disconnected';
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

/**
 * Connection status, as an observable snapshot.
 *
 * `socketState` was module-private and the transition handlers mutated it
 * without notifying, so nothing could render it — during an outage the operator
 * could not tell a quiet morning from twenty minutes of dead push while the
 * conversation list kept polling underneath.
 */
function getStatusSnapshot(): SocketStatus {
  return socketState;
}

function getServerStatusSnapshot(): SocketStatus {
  return 'disconnected';
}

function getServerSnapshot() {
  return null;
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

/** Fetch socket token from BFF (reads httpOnly cookie server-side) */
/**
 * The ticket, or WHY there isn't one.
 *
 * This used to collapse every failure to `null`, and the `connect_error` handler
 * read that as "session is gone" and tore the socket down for good. But the BFF
 * answers 401 only when the unlock cookie is actually missing; a backend restart
 * or a network blip comes back 502 — transient, and precisely when the socket
 * should be retrying rather than being destroyed.
 */
type TokenResult = { token: string; status: 200 } | { token: null; status: number };

async function fetchSocketToken(): Promise<TokenResult> {
  try {
    const res = await fetch('/api/auth/socket-token', { credentials: 'include' });
    if (!res.ok) return { token: null, status: res.status };
    const data = await res.json();
    return data.socketToken
      ? { token: data.socketToken as string, status: 200 }
      : { token: null, status: 502 };
  } catch {
    // Could not reach even our own origin: offline, not logged out.
    return { token: null, status: 0 };
  }
}

/** Only these mean the session is genuinely over. Everything else is transient. */
function isSessionDead(status: number): boolean {
  return status === 401 || status === 403;
}

export function useSocket() {
  const socket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const status = useSyncExternalStore(subscribe, getStatusSnapshot, getServerStatusSnapshot);
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
      const result = await fetchSocketToken();
      const token = result.token;
      if (cancelled || !token) {
        // Release the lock so a re-mount can try again.
        if (!globalSocket) socketState = 'disconnected';
        notifyListeners();
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
        notifyListeners();
      });

      newSocket.on('disconnect', () => {
        socketState = 'disconnected';
        notifyListeners();
      });

      newSocket.on('connect_error', async () => {
        socketState = 'disconnected';
        notifyListeners();
        // The ticket is short-lived, so a reconnect needs a fresh one.
        const result = await fetchSocketToken();
        if (result.token && newSocket) {
          tokenRef.current = result.token;
          newSocket.auth = { token: result.token };
          return;
        }
        // No ticket. WHY decides what happens next, and collapsing the two was
        // the bug: any failure used to destroy the socket, so a single backend
        // restart left the operator with a polling conversation list above a
        // thread pane that never updated again for the rest of the session —
        // unrecoverable on-page, because the effect only re-runs when
        // `isAuthenticated` flips and a 502 never flips it.
        if (newSocket && isSessionDead(result.status)) {
          newSocket.disconnect();
          globalSocket = null;
          tokenRef.current = null;
          notifyListeners();
          return;
        }
        // Transient (502 / offline / 0): leave the socket alone. Socket.IO is
        // already retrying forever on capped, jittered backoff, and the next
        // attempt refetches the ticket through this same handler.
      });

      // The host platform also listened for `notification` and
      // `application_update` here. This backend emits exactly six events —
      // wa:message, wa:status, wa:conversation, wa:campaign, wa:reaction,
      // wa:settings — so both were dead listeners for events that can never
      // fire. Keeping this list accurate is not bookkeeping: the sidebar badge
      // spent its life subscribed to `wa:read`, which is not on it and never
      // was, so the badge silently never updated on a read.
      //
      // WhatsApp events are consumed by the components that need them (see
      // Sidebar, inbox, WaNotificationsProvider).

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

  return { socket, emit, status };
}
