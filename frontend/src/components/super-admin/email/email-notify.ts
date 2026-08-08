/**
 * Best-effort new-reply notifications for the email inbox: a short beep (tiny
 * embedded WAV) plus a browser Notification. Guarded + swallows failures —
 * sound/notifications are nice-to-have, never required. Mirrors wa-notify.ts.
 */

const BEEP_DATA_URI =
  'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ' +
  'AAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/f3' +
  '9/f39/f39/f39/f39/f39/f39/f39/f39/f3+AgICAgICAgICAgICAgICAgICAgICAgIA=';

const SOUND_PREF_KEY = 'email-inbox-sound-enabled';
let cachedAudio: HTMLAudioElement | null = null;
let permissionRequested = false;
const soundListeners = new Set<() => void>();

function getAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!cachedAudio) {
    try {
      cachedAudio = new Audio(BEEP_DATA_URI);
      cachedAudio.volume = 0.4;
    } catch {
      return null;
    }
  }
  return cachedAudio;
}

/** Whether the inbox new-reply beep is enabled (per-device; defaults ON). */
export function isInboxSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function subscribeInboxSound(cb: () => void): () => void {
  soundListeners.add(cb);
  return () => {
    soundListeners.delete(cb);
  };
}

export function setInboxSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
  soundListeners.forEach((cb) => cb());
}

function playAudio(): void {
  const audio = getAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function playBeep(): void {
  if (!isInboxSoundEnabled()) return;
  playAudio();
}

export function playTestBeep(): void {
  playAudio();
}

/** Request Notification permission once per session (no-op if unsupported). */
export function ensureNotificationPermission(): void {
  if (permissionRequested) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  permissionRequested = true;
  try {
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function showBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: 'email-inbox' });
  } catch {
    /* ignore */
  }
}

/** Fire the beep + browser notification for a new inbound reply. */
export function notifyInbound(title: string, body: string): void {
  playBeep();
  showBrowserNotification(title, body);
}
