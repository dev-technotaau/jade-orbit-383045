/**
 * Best-effort new-message notifications for the WhatsApp inbox: a short beep
 * (tiny embedded WAV) plus a clickable browser Notification that opens the
 * conversation it is about. Everything here is guarded and swallows failures —
 * sound/notifications are nice-to-have, never required.
 */

import { OPEN_CONV_PARAM, setOpenConv } from '@/lib/wa-open-conv';

// A very short, quiet sine-ish blip encoded as a base64 WAV data URI. Kept
// tiny on purpose so it ships inline without a network/asset dependency.
const BEEP_DATA_URI =
  'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ' +
  'AAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/f3' +
  '9/f39/f39/f39/f39/f39/f39/f39/f39/f3+AgICAgICAgICAgICAgICAgICAgICAgIA=';

let cachedAudio: HTMLAudioElement | null = null;

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

/* ── Browser notifications ──────────────────────────────────────────────── */

/** Notification permission, plus an explicit state for browsers without the API. */
export type NotificationPermissionState = NotificationPermission | 'unsupported';

const permissionListeners = new Set<() => void>();

/** Current Notification permission ('unsupported' when the API is absent). */
export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/** Subscribe to permission changes (fires once a request resolves). */
export function subscribeNotificationPermission(cb: () => void): () => void {
  permissionListeners.add(cb);
  return () => {
    permissionListeners.delete(cb);
  };
}

/**
 * Ask for Notification permission. MUST be triggered by a user gesture — the
 * settings toggle. This used to run automatically on inbox mount, and Chrome
 * auto-denies a gesture-less prompt: notifications were silently dead for the
 * operator from then on, with no in-app way to re-ask.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    permissionListeners.forEach((cb) => cb());
    return result;
  } catch {
    return getNotificationPermission();
  }
}

/** The inbox route — a notification click lands on the thread's permalink there. */
const INBOX_PATH = '/whatsapp';

/**
 * Open `conversationId` in response to a notification click.
 *
 * On the inbox itself the permalink store switches the thread in place; from any
 * other /whatsapp/* page (campaigns, contacts, settings…) there is no inbox
 * mounted to switch, so navigate to it carrying the `?c=` permalink.
 */
function openConversationFromNotification(conversationId: string): void {
  if (window.location.pathname.replace(/\/+$/, '') === INBOX_PATH) {
    setOpenConv(conversationId);
    return;
  }
  window.location.assign(`${INBOX_PATH}?${OPEN_CONV_PARAM}=${encodeURIComponent(conversationId)}`);
}

/**
 * Show a browser notification if permission is already granted.
 *
 * `conversationId` is what makes the notification useful: it used to carry a
 * constant `tag: 'wa-inbox'` and no click handler, so ten messages from ten
 * different customers collapsed into a single alert that named no thread and did
 * nothing when clicked — the operator had to find the tab and hunt the inbox by
 * hand.
 */
export function showBrowserNotification(
  title: string,
  body: string,
  options?: { conversationId?: string; tag?: string; href?: string },
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission !== 'granted') return;

    const conversationId = options?.conversationId;
    const notification = new Notification(title, {
      body,
      // Per-conversation tag: a follow-up in the SAME thread still replaces its
      // predecessor (one chatty customer can't stack five alerts), while a
      // different thread gets a notification of its own. Non-inbox alerts pass
      // their own tag for the same reason (one per campaign).
      tag: conversationId ? `wa-conv-${conversationId}` : (options?.tag ?? 'wa-inbox'),
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      data: conversationId ? { conversationId } : undefined,
    });
    notification.onclick = () => {
      try {
        window.focus();
        if (conversationId) openConversationFromNotification(conversationId);
        else if (options?.href) window.location.assign(options.href);
      } finally {
        notification.close();
      }
    };
  } catch {
    /* ignore */
  }
}

/** Fire the full beep + notification combo for a new inbound message. */
export function notifyInbound(
  title: string,
  body: string,
  options?: { conversationId?: string },
): void {
  playBeep();
  showBrowserNotification(title, body, options);
}

/**
 * Alert that a campaign has finished; a click opens that campaign's report.
 *
 * A send takes minutes to hours, so the operator who launched it is by then on
 * another tab or another machine — completion (and, more to the point, a run
 * that completed with every message failing) was reported nowhere at all, and
 * was only discoverable by going back to the campaign and reading its counters.
 * Tagged per campaign so two runs finishing together do not overwrite each other.
 */
export function notifyCampaignComplete(title: string, body: string, campaignId: string): void {
  playBeep();
  showBrowserNotification(title, body, {
    tag: `wa-campaign-${campaignId}`,
    href: `/whatsapp/campaigns/${campaignId}`,
  });
}
