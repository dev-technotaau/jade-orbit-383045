'use client';

import type { User } from '@/types/auth';

type AuthMessage = { type: 'logout' } | { type: 'login'; user: User } | { type: 'session_expired' };

const CHANNEL_NAME = 'ha_auth_channel';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported (e.g. SSR, old browser)
      return null;
    }
  }
  return channel;
}

export function broadcastLogout() {
  getChannel()?.postMessage({ type: 'logout' } satisfies AuthMessage);
}

export function broadcastLogin(user: User) {
  getChannel()?.postMessage({ type: 'login', user } satisfies AuthMessage);
}

export function onAuthMessage(handler: (msg: AuthMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (event: MessageEvent<AuthMessage>) => handler(event.data);
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}
