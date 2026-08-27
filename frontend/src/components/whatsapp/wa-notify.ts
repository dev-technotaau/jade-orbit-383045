/**
 * Best-effort new-message notifications for the WhatsApp inbox: a short beep
 * plus a clickable browser Notification that opens the
 * conversation it is about. Everything here is guarded and swallows failures —
 * sound/notifications are nice-to-have, never required.
 */

import { OPEN_CONV_PARAM, setOpenConv } from '@/lib/wa-open-conv';

/*
 * The beep is SYNTHESISED, not decoded from an embedded asset.
 *
 * What was here before could not have made a sound. Its RIFF header declared a
 * chunk size of 1,599,041,375 bytes for a 143-byte file and a `data` length of
 * 0 for the 99 bytes that followed it, so a strict decoder rejects it outright;
 * and the samples themselves alternated between 128 and 127 — a single LSB of
 * 8-bit PCM, about -48 dBFS — so a lenient decoder played silence. Every
 * failure path in this file is a silent catch, so the inbox has been notifying
 * operators with nothing at all, and the settings screen's "Test sound" button
 * confirmed it by also doing nothing.
 *
 * Two short sine tones cost nothing, are correct by construction, and cannot
 * rot the way a hand-pasted blob did. Where Web Audio is missing, `playAudio`
 * no-ops exactly as the old code did.
 */
const BEEP_TONES = [
  { freq: 880, start: 0, duration: 0.09 },
  { freq: 1174.7, start: 0.085, duration: 0.13 },
];
const BEEP_GAIN = 0.14;

let cachedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!cachedCtx) {
    try {
      // One context for the tab's lifetime. Browsers cap how many a page may
      // create, and the inbox can beep hundreds of times in a shift.
      cachedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return cachedCtx;
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
  const ctx = getContext();
  if (!ctx) return;
  try {
    // Autoplay policy leaves a context created before any user gesture
    // suspended. An operator working the inbox has clicked something long
    // before the first inbound arrives, so this resolves; it is fire-and-forget
    // either way, exactly as the old `audio.play().catch()` was.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (const tone of BEEP_TONES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      const t0 = now + tone.start;
      const t1 = t0 + tone.duration;
      // An envelope, not a hard start/stop: a square-edged gate on a sine wave
      // is an audible click, which is worse than the tone it wraps.
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(BEEP_GAIN, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
      // Nodes are single-use; without this the graph grows for every beep.
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          /* already torn down */
        }
      };
    }
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
