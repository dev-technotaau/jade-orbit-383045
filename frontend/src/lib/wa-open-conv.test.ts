/**
 * Tests for the open-conversation store (src/lib/wa-open-conv.ts).
 *
 * This module is the inbox's address bar: it decides which thread a shared
 * `/whatsapp?c=<id>` link opens, whether Back moves the selection, and whether
 * a bare `/whatsapp` restores the last thread. A regression here is not a
 * cosmetic one — it silently opens the wrong customer's conversation, which is
 * also what fires a read receipt at them.
 *
 * jsdom implements pushState/replaceState/popstate, so these run against the
 * real history API with no mocks.
 */

import {
  OPEN_CONV_PARAM,
  getOpenConv,
  restoreOpenConv,
  setOpenConv,
  subscribeOpenConv,
} from './wa-open-conv';

/** Reset the URL and the stored default before each case. */
function at(url: string): void {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  at('/whatsapp');
  window.localStorage.clear();
});

describe('getOpenConv — the URL is the source of truth', () => {
  it('reads the conversation id out of the query string', () => {
    at(`/whatsapp?${OPEN_CONV_PARAM}=conv-1`);
    expect(getOpenConv()).toBe('conv-1');
  });

  it('is null on a bare inbox URL, and for an empty parameter', () => {
    expect(getOpenConv()).toBeNull();
    at(`/whatsapp?${OPEN_CONV_PARAM}=`);
    expect(getOpenConv()).toBeNull();
  });

  it('ignores the stored default — otherwise Back out of a thread would reopen it', () => {
    window.localStorage.setItem('wa-open-conversation', 'conv-stored');
    expect(getOpenConv()).toBeNull();
  });
});

describe('setOpenConv', () => {
  it('puts the id in the URL, remembers it, and notifies subscribers', () => {
    const cb = jest.fn();
    const unsubscribe = subscribeOpenConv(cb);

    setOpenConv('conv-1');

    expect(window.location.search).toBe(`?${OPEN_CONV_PARAM}=conv-1`);
    expect(window.localStorage.getItem('wa-open-conversation')).toBe('conv-1');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getOpenConv()).toBe('conv-1');

    unsubscribe();
  });

  it('pushes a history entry per thread, so Back walks back through them', () => {
    const before = window.history.length;
    setOpenConv('conv-1');
    setOpenConv('conv-2');
    expect(window.history.length).toBe(before + 2);
  });

  it('does not stack a duplicate entry when the open thread is re-selected', () => {
    setOpenConv('conv-1');
    const after = window.history.length;
    setOpenConv('conv-1');
    expect(window.history.length).toBe(after);
    expect(window.location.search).toBe(`?${OPEN_CONV_PARAM}=conv-1`);
  });

  it('clears the parameter and the stored default when the thread is closed', () => {
    setOpenConv('conv-1');
    setOpenConv(null);
    expect(window.location.search).toBe('');
    expect(window.localStorage.getItem('wa-open-conversation')).toBeNull();
    expect(getOpenConv()).toBeNull();
  });

  it('replaces instead of pushing when asked (the mount-time restore)', () => {
    const before = window.history.length;
    setOpenConv('conv-1', { replace: true });
    expect(window.history.length).toBe(before);
    expect(getOpenConv()).toBe('conv-1');
  });

  it('preserves other query parameters', () => {
    at('/whatsapp?unread=1');
    setOpenConv('conv-1');
    expect(window.location.search).toBe(`?unread=1&${OPEN_CONV_PARAM}=conv-1`);
  });
});

describe('restoreOpenConv — mount-time seeding', () => {
  it('keeps the shared link: an explicit ?c= wins over the stored default', () => {
    window.localStorage.setItem('wa-open-conversation', 'conv-stored');
    at(`/whatsapp?${OPEN_CONV_PARAM}=conv-shared`);

    restoreOpenConv();

    expect(getOpenConv()).toBe('conv-shared');
    // The link the operator followed also becomes this device's new default.
    expect(window.localStorage.getItem('wa-open-conversation')).toBe('conv-shared');
  });

  it('restores the last thread onto a bare /whatsapp and writes it into the URL', () => {
    window.localStorage.setItem('wa-open-conversation', 'conv-stored');
    const before = window.history.length;

    restoreOpenConv();

    expect(getOpenConv()).toBe('conv-stored');
    expect(window.location.search).toBe(`?${OPEN_CONV_PARAM}=conv-stored`);
    // A restore is not a navigation, so it must not be a history entry the
    // operator has to press Back through to leave the inbox.
    expect(window.history.length).toBe(before);
  });

  it('leaves a first-ever visit with nothing open', () => {
    restoreOpenConv();
    expect(getOpenConv()).toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('subscribeOpenConv', () => {
  it('re-reads the URL on Back/Forward, which never goes through setOpenConv', () => {
    const cb = jest.fn();
    const unsubscribe = subscribeOpenConv(cb);

    at(`/whatsapp?${OPEN_CONV_PARAM}=conv-9`);
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(getOpenConv()).toBe('conv-9');

    unsubscribe();
  });

  it('stops notifying — and stops listening to popstate — once unsubscribed', () => {
    const cb = jest.fn();
    subscribeOpenConv(cb)();

    setOpenConv('conv-1');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(cb).not.toHaveBeenCalled();
  });
});
