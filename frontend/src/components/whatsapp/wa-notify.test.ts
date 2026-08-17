/**
 * Tests for the inbox alerting helpers (src/components/whatsapp/wa-notify.ts).
 *
 * The two things worth pinning down are the ones that were broken: every
 * notification shared one constant `tag`, so ten messages from ten customers
 * collapsed into a single alert, and nothing handled a click, so the alert was a
 * dead end. Both are asserted here against a stubbed Notification API (jsdom
 * does not implement one).
 */

import {
  getNotificationPermission,
  notifyCampaignComplete,
  notifyInbound,
  requestNotificationPermission,
  setInboxSoundEnabled,
  showBrowserNotification,
  subscribeNotificationPermission,
} from './wa-notify';
import { OPEN_CONV_PARAM } from '@/lib/wa-open-conv';

type Instance = {
  title: string;
  options?: NotificationOptions;
  onclick: (() => void) | null;
  close: jest.Mock;
};

const instances: Instance[] = [];

/** Minimal stand-in for the constructor path (`new Notification(...)`). */
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = jest.fn(
    async (): Promise<NotificationPermission> => FakeNotification.permission,
  );
  onclick: (() => void) | null = null;
  close = jest.fn();

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    instances.push(this as unknown as Instance);
  }
}

function installNotificationApi(): void {
  Object.defineProperty(window, 'Notification', {
    writable: true,
    configurable: true,
    value: FakeNotification,
  });
}

/** Put the browser on `url` (the click handler branches on the pathname). */
function at(url: string): void {
  window.history.replaceState(null, '', url);
}

const last = (): Instance => instances[instances.length - 1];

beforeEach(() => {
  instances.length = 0;
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission.mockClear();
  installNotificationApi();
  at('/whatsapp');
  window.localStorage.clear();
});

describe('showBrowserNotification', () => {
  it('shows nothing unless permission has been granted', () => {
    FakeNotification.permission = 'default';
    showBrowserNotification('New WhatsApp message', 'hi', { conversationId: 'conv-1' });
    FakeNotification.permission = 'denied';
    showBrowserNotification('New WhatsApp message', 'hi', { conversationId: 'conv-1' });

    expect(instances).toHaveLength(0);
  });

  it('tags per conversation, so two customers do not collapse into one alert', () => {
    showBrowserNotification('New WhatsApp message', 'from Asha', { conversationId: 'conv-1' });
    showBrowserNotification('New WhatsApp message', 'from Bilal', { conversationId: 'conv-2' });

    expect(instances).toHaveLength(2);
    expect(instances[0].options?.tag).toBe('wa-conv-conv-1');
    expect(instances[1].options?.tag).toBe('wa-conv-conv-2');
    expect(instances[0].options?.body).toBe('from Asha');
    expect(instances[0].options?.data).toEqual({ conversationId: 'conv-1' });
  });

  it('falls back to the generic tag when there is no conversation (test alert)', () => {
    showBrowserNotification('WhatsApp inbox', 'test');

    expect(last().options?.tag).toBe('wa-inbox');
    expect(last().options?.data).toBeUndefined();
  });

  it('opens the thread permalink in place when the inbox is the current page', () => {
    const focus = jest.spyOn(window, 'focus').mockImplementation(() => {});
    showBrowserNotification('New WhatsApp message', 'from Asha', { conversationId: 'conv-1' });

    last().onclick?.();

    expect(focus).toHaveBeenCalled();
    expect(window.location.search).toBe(`?${OPEN_CONV_PARAM}=conv-1`);
    expect(last().close).toHaveBeenCalled();
    focus.mockRestore();
  });
});

describe('notifyInbound', () => {
  it('forwards the conversation through to the notification', () => {
    setInboxSoundEnabled(false); // keep the beep (an unimplemented jsdom API) out of it
    notifyInbound('New WhatsApp message', 'from Asha', { conversationId: 'conv-9' });

    expect(last().title).toBe('New WhatsApp message');
    expect(last().options?.tag).toBe('wa-conv-conv-9');
  });
});

describe('notifyCampaignComplete', () => {
  it('tags per campaign, so two runs finishing together do not collapse into one', () => {
    setInboxSoundEnabled(false); // keep the beep (an unimplemented jsdom API) out of it
    notifyCampaignComplete('Diwali blast finished', '150 of 200 sent', 'camp-1');
    notifyCampaignComplete('Onam blast finished', '80 of 80 sent', 'camp-2');

    expect(instances).toHaveLength(2);
    expect(instances[0].options?.tag).toBe('wa-campaign-camp-1');
    expect(instances[1].options?.tag).toBe('wa-campaign-camp-2');
    // No conversation to open — the click goes to the campaign's report instead.
    expect(instances[0].options?.data).toBeUndefined();
  });
});

describe('permission', () => {
  it('reports the browser permission, and "unsupported" without the API', () => {
    FakeNotification.permission = 'denied';
    expect(getNotificationPermission()).toBe('denied');

    // @ts-expect-error — removing a DOM global to model an unsupporting browser
    delete window.Notification;
    expect(getNotificationPermission()).toBe('unsupported');
  });

  it('requests permission and notifies subscribers so the settings row re-renders', async () => {
    FakeNotification.permission = 'granted';
    const cb = jest.fn();
    const unsubscribe = subscribeNotificationPermission(cb);

    await expect(requestNotificationPermission()).resolves.toBe('granted');

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    await requestNotificationPermission();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('never asks — and never throws — in a browser without the API', async () => {
    // @ts-expect-error — removing a DOM global to model an unsupporting browser
    delete window.Notification;

    await expect(requestNotificationPermission()).resolves.toBe('unsupported');
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});
