/**
 * Tests for the distributed lock (src/utils/distributed-lock.ts).
 *
 * This is the primitive the worker leader election is built on, so its
 * correctness decides whether zero, one or two instances run the BullMQ
 * workers. The properties that matter are the ownership ones: a lock must not
 * be releasable or renewable by a process that does not hold it (that is how a
 * demoted instance would yank the lock out from under the live leader), it must
 * expire on its own so a crashed leader does not wedge the queue forever, and a
 * Redis failure must degrade to "no lock" rather than throw into the caller.
 *
 * Redis is a small in-memory fake with a manual clock, so TTL expiry is tested
 * without sleeping.
 */

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** Current fake time, in ms. Only `advance()` moves it. */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

/** Set when a test wants the next Redis command to blow up. */
let redisError: Error | null = null;

const store = new Map<string, { value: string; expiresAt: number }>();

/** Drop anything whose TTL has run out — the fake's stand-in for Redis expiry. */
function purge(): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= clock) store.delete(key);
  }
}

const redisMock = {
  set: jest.fn(async (key: string, value: string, _ex: string, ttl: number, _nx: string) => {
    if (redisError) throw redisError;
    purge();
    if (store.has(key)) return null;
    store.set(key, { value, expiresAt: clock + ttl * 1000 });
    return 'OK';
  }),
  /**
   * Stands in for EVAL. Both scripts are the same shape — compare the stored
   * value against ARGV[1] and then act — so the fake matches on which command
   * the script body calls rather than interpreting Lua.
   */
  call: jest.fn(
    async (_cmd: string, script: string, _numKeys: string, key: string, ...argv: string[]) => {
      if (redisError) throw redisError;
      purge();
      const entry = store.get(key);
      if (!entry || entry.value !== argv[0]) return 0;
      if (script.includes('"del"')) {
        store.delete(key);
        return 1;
      }
      if (script.includes('"expire"')) {
        entry.expiresAt = clock + Number(argv[1]) * 1000;
        return 1;
      }
      return 0;
    }
  ),
};
jest.mock('../../config/redis', () => ({ redis: redisMock }));

import { acquireLock, releaseLock, renewLock, withLock } from '../distributed-lock';

const KEY = 'wa:worker-leader';

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  clock = 0;
  redisError = null;
});

describe('acquireLock', () => {
  it('claims a free key with a NX + EX write and returns the lock value', async () => {
    const value = await acquireLock(KEY, 30);

    expect(value).toEqual(expect.any(String));
    expect(redisMock.set).toHaveBeenCalledWith(KEY, value, 'EX', 30, 'NX');
    expect(store.get(KEY)).toEqual({ value, expiresAt: 30_000 });
  });

  it('returns null while another holder has the key', async () => {
    const first = await acquireLock(KEY, 30);
    const second = await acquireLock(KEY, 30);

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
  });

  it('hands the key to the next caller once the TTL lapses', async () => {
    const first = await acquireLock(KEY, 30);
    advance(29_000);
    expect(await acquireLock(KEY, 30)).toBeNull();

    // The whole point of the TTL: a leader that crashes without releasing does
    // not wedge the queue — the next instance picks it up a TTL later.
    advance(2_000);
    const second = await acquireLock(KEY, 30);
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(first);
  });

  it('returns null instead of throwing when Redis is unreachable', async () => {
    redisError = new Error('ECONNREFUSED');

    await expect(acquireLock(KEY, 30)).resolves.toBeNull();
  });
});

describe('releaseLock', () => {
  it('deletes the key when the value matches', async () => {
    const value = (await acquireLock(KEY, 30))!;

    await expect(releaseLock(KEY, value)).resolves.toBe(true);
    expect(store.has(KEY)).toBe(false);
  });

  it('refuses to release a lock held by someone else, and leaves it in place', async () => {
    await acquireLock(KEY, 30);

    await expect(releaseLock(KEY, 'some-other-process-uuid')).resolves.toBe(false);
    // Load-bearing: without the value check, an instance whose lock had already
    // expired and been re-claimed would delete the CURRENT leader's lock on its
    // way out, and two instances would end up running the workers.
    expect(store.has(KEY)).toBe(true);
  });

  it('reports false when Redis is unreachable', async () => {
    const value = (await acquireLock(KEY, 30))!;
    redisError = new Error('ECONNREFUSED');

    await expect(releaseLock(KEY, value)).resolves.toBe(false);
  });
});

describe('renewLock', () => {
  it('pushes the expiry out so the holder keeps the key past the original TTL', async () => {
    const value = (await acquireLock(KEY, 30))!;

    advance(20_000);
    await expect(renewLock(KEY, value, 30)).resolves.toBe(true);

    // Original expiry was t=30s; renewal at t=20s moves it to t=50s.
    advance(15_000);
    expect(await acquireLock(KEY, 30)).toBeNull();
  });

  it('refuses to renew a lock held by someone else', async () => {
    await acquireLock(KEY, 30);

    await expect(renewLock(KEY, 'some-other-process-uuid', 30)).resolves.toBe(false);
  });

  it('reports false once the lock has already expired', async () => {
    const value = (await acquireLock(KEY, 30))!;
    advance(31_000);

    // This is the signal the worker leader demotes on: the key is gone, so
    // another instance may already have claimed it.
    await expect(renewLock(KEY, value, 30)).resolves.toBe(false);
  });

  it('reports false when Redis is unreachable', async () => {
    const value = (await acquireLock(KEY, 30))!;
    redisError = new Error('ECONNREFUSED');

    await expect(renewLock(KEY, value, 30)).resolves.toBe(false);
  });
});

describe('withLock', () => {
  it('runs the body while holding the lock and releases it afterwards', async () => {
    const seen: boolean[] = [];
    const result = await withLock(KEY, 30, async () => {
      seen.push(store.has(KEY));
      return 'done';
    });

    expect(result).toBe('done');
    expect(seen).toEqual([true]);
    expect(store.has(KEY)).toBe(false);
  });

  it('returns null without running the body when the lock is taken', async () => {
    await acquireLock(KEY, 30);
    const fn = jest.fn();

    await expect(withLock(KEY, 30, fn)).resolves.toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('releases the lock even when the body throws', async () => {
    await expect(
      withLock(KEY, 30, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // A body that throws used to be the classic way to leak a lock for a whole
    // TTL; the caller retries immediately and gets nothing.
    expect(store.has(KEY)).toBe(false);
  });
});
