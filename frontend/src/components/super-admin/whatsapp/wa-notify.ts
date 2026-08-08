/**
 * Best-effort new-message notifications for the WhatsApp inbox: a short beep
 * (tiny embedded WAV) plus a browser Notification. Everything here is guarded
 * and swallows failures — sound/notifications are nice-to-have, never required.
 */

// A very short, quiet sine-ish blip encoded as a base64 WAV data URI. Kept
// tiny on purpose so it ships inline without a network/asset dependency.
const BEEP_DATA_URI =
  'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ' +
  'AAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/f3' +
  '9/f39/f39/f39/f39/f39/f39/f39/f39/f3+AgICAgICAgICAgICAgICAgICAgICAgIA=';

let cachedAudio: HTMLAudioElement | null = null;
let permissionRequested = false;

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

const SOUND_PREF_KEY = 'wa-inbox-sound-enabled';

/** Whether the inbox new-message beep is enabled. Per-device preference
 *  (localStorage); defaults to ON when unset or unreadable. */
export function isInboxSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

// Subscribers (the settings toggle via useSyncExternalStore) are notified when
// the preference changes, so the UI reflects it without setState-in-effect.
const soundListeners = new Set<() => void>();

/** Subscribe to inbox-sound preference changes. Returns an unsubscribe fn. */
export function subscribeInboxSound(cb: () => void): () => void {
  soundListeners.add(cb);
  return () => {
    soundListeners.delete(cb);
  };
}

/** Enable/disable the inbox new-message beep (persists on this device). */
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

/** Play the inbound-message beep, honoring the per-device sound preference. */
export function playBeep(): void {
  if (!isInboxSoundEnabled()) return;
  playAudio();
}

/** Play the beep unconditionally — used by the settings "Test sound" button. */
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

/** Show a browser notification if permission is already granted. */
export function showBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission !== 'granted') return;

    new Notification(title, { body, tag: 'wa-inbox' });
  } catch {
    /* ignore */
  }
}

/** Fire the full beep + notification combo for a new inbound message. */
export function notifyInbound(title: string, body: string): void {
  playBeep();
  showBrowserNotification(title, body);
}
