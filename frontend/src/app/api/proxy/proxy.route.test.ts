/**
 * Tests for the BFF proxy (src/app/api/proxy/[...path]/route.ts).
 *
 * Every request the console makes passes through this one handler, so its
 * failures are never small. Four of them are the reason these tests exist:
 *
 *  - It used to forward upstream regardless of the unlock cookie, which turned
 *    the public deployment URL into a door — anyone could call /api/proxy/… and
 *    reach the backend with the BFF secret attached, and that secret is exactly
 *    what bypasses CSRF there.
 *  - It used to forward `content-length` unconditionally. undici decompresses
 *    gzip transparently but leaves the COMPRESSED length in the headers, so the
 *    browser was handed a byte count that did not describe the body it was
 *    about to read: short and the JSON truncates mid-parse, long and the request
 *    hangs until the client timeout. Both looked like a clean 200 in the backend
 *    log.
 *  - It used to drop `range` on the way in and `accept-ranges`/`content-range`
 *    on the way out, so the backend's 206 partials never reached the browser:
 *    every scrubber drag on a customer's video re-downloaded the whole file, and
 *    Safari — which probes with `Range: bytes=0-1` — treated the media as
 *    unseekable and refused to play it.
 *  - It used to send nothing that identified the browser, so the backend keyed
 *    its rate limiter and DDoS floor on this server's egress address — one
 *    bucket for the entire team, which one person with several inbox tabs open
 *    could exhaust and 429 everybody else out of the console for a minute.
 *
 * `next/server` is stubbed with a response recorder so the assertions are about
 * status and headers, not about Next's runtime.
 */

import { createHmac } from 'crypto';

const CONFIG = {
  BACKEND_URL: 'http://backend:5000/api/v1',
  BFF_SECRET: 'bff-secret',
  UNLOCK_COOKIE: 'wa_unlock',
};
jest.mock('../_lib/config', () => CONFIG);

let cookieJar: Record<string, string> = {};
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  }),
}));

/**
 * Case-insensitive stand-in for `Headers`.
 *
 * jsdom's implementation enforces the browser's forbidden-header list, so
 * `set('range', …)` is silently discarded — under it a proxy that forwards Range
 * correctly is indistinguishable from one that drops it. The route runs on the
 * server, where undici applies no such filter, so the tests use a container that
 * simply stores what it is handed.
 */
class TestHeaders {
  private readonly entriesByName = new Map<string, string>();

  constructor(init?: Record<string, string> | TestHeaders) {
    if (!init) return;
    const pairs = init instanceof TestHeaders ? [...init.entries()] : Object.entries(init);
    for (const [name, value] of pairs) this.set(name, value);
  }

  get(name: string): string | null {
    return this.entriesByName.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.entriesByName.set(name.toLowerCase(), String(value));
  }

  has(name: string): boolean {
    return this.entriesByName.has(name.toLowerCase());
  }

  entries(): IterableIterator<[string, string]> {
    return this.entriesByName.entries();
  }
}
global.Headers = TestHeaders as unknown as typeof Headers;

interface ResponseInitLike {
  status?: number;
  headers?: Headers;
}

/** Records what the route decided, in place of a real Web Response. */
class MockNextResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;

  constructor(body: unknown, init: ResponseInitLike = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = init.headers ?? new Headers();
  }

  static json(data: unknown, init: ResponseInitLike = {}) {
    const res = new MockNextResponse(data, init);
    res.headers.set('content-type', 'application/json');
    return res;
  }
}
jest.mock('next/server', () => ({ NextResponse: MockNextResponse }));

type ProxyHandler = (
  request: unknown,
  context: { params: Promise<{ path: string[] }> },
) => Promise<MockNextResponse>;

let route: {
  GET: ProxyHandler;
  POST: ProxyHandler;
  DELETE: ProxyHandler;
  maxDuration: number;
};

/** Loaded lazily so the mock factories above are initialised before they run. */
beforeAll(async () => {
  route = (await import('./[...path]/route')) as unknown as typeof route;
});

interface RequestOptions {
  method?: string;
  search?: string;
  headers?: Record<string, string>;
}

function makeRequest({ method = 'GET', search = '', headers = {} }: RequestOptions = {}) {
  return {
    method,
    headers: new Headers(headers),
    nextUrl: { searchParams: new URLSearchParams(search) },
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  };
}

interface UpstreamOptions {
  status?: number;
  headers?: Record<string, string>;
}

/** What the backend answers with, as undici would present it. */
function upstream({ status = 200, headers = {} }: UpstreamOptions = {}) {
  return { status, headers: new Headers(headers), body: 'upstream-body' };
}

const fetchMock = jest.fn();

/** The RequestInit the route handed to fetch. */
const fetchInit = () => fetchMock.mock.calls[0][1] as RequestInit & { headers: Headers };

const call = (
  handler: ProxyHandler,
  path: string[],
  options?: RequestOptions,
): Promise<MockNextResponse> =>
  handler(makeRequest(options), { params: Promise.resolve({ path }) });

beforeEach(() => {
  jest.clearAllMocks();
  cookieJar = { wa_unlock: 'unlock-token' };
  CONFIG.BFF_SECRET = 'bff-secret';
  fetchMock.mockResolvedValue(upstream());
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('the lock', () => {
  it('refuses a request with no unlock cookie, without touching the backend', async () => {
    cookieJar = {};

    const res = await call(route.GET, ['contacts']);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Locked' });
    // The load-bearing assertion: nothing reaches the API. src/proxy.ts cannot
    // cover this — it returns early for every /api/ path.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses writes as well as reads', async () => {
    cookieJar = {};

    const res = await call(route.POST, ['campaigns'], { method: 'POST' });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a backend 401 straight through rather than retrying', async () => {
    fetchMock.mockResolvedValue(upstream({ status: 401 }));

    const res = await call(route.GET, ['contacts']);

    // There are no tokens to refresh — the app password either works or it does
    // not, and the UI sends the operator to /unlock.
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('path traversal', () => {
  it.each([[['..', 'admin']], [['.']], [['reports', 'a..b']]])(
    'rejects %j before building a URL',
    async (path: string[]) => {
      const res = await call(route.GET, path);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid path' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects traversal even when the caller is unlocked', async () => {
    const res = await call(route.GET, ['..', '..', 'health']);

    // Segments are joined verbatim and the /health prefix picks a different
    // backend base, so a `..` segment could walk out of the intended root.
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('forwarding', () => {
  it('builds the backend URL from the path and query string', async () => {
    await call(route.GET, ['campaigns', 'c1', 'recipients'], { search: 'page=2&limit=30' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://backend:5000/api/v1/campaigns/c1/recipients?page=2&limit=30',
    );
    expect(fetchInit().cache).toBe('no-store');
  });

  it('routes health probes to the backend root, not under /api/v1', async () => {
    await call(route.GET, ['health', 'ready']);

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend:5000/health/ready');
  });

  it('attaches the unlock cookie and the BFF secret the backend expects', async () => {
    await call(route.GET, ['contacts']);

    const headers = fetchInit().headers;
    expect(headers.get('cookie')).toBe('wa_unlock=unlock-token');
    expect(headers.get('x-bff-secret')).toBe('bff-secret');
  });

  it('identifies the browser so the backend does not meter the team as one', async () => {
    await call(route.GET, ['contacts']);

    // An HMAC of the session token, never the token: this value lands in the
    // backend's Redis keys and log lines.
    const expected = createHmac('sha256', 'bff-secret')
      .update('unlock-token')
      .digest('hex')
      .slice(0, 32);
    expect(fetchInit().headers.get('x-operator-key')).toBe(expected);
    expect(fetchInit().headers.get('x-operator-key')).not.toContain('unlock-token');
  });

  it('gives two sessions two different keys, and one session a stable one', async () => {
    await call(route.GET, ['contacts']);
    const first = fetchInit().headers.get('x-operator-key');

    fetchMock.mockClear();
    await call(route.GET, ['campaigns']);
    // Stable across requests, or every call would be its own bucket and the
    // limiter would count nothing at all.
    expect(fetchInit().headers.get('x-operator-key')).toBe(first);

    fetchMock.mockClear();
    cookieJar = { wa_unlock: 'another-operators-token' };
    await call(route.GET, ['contacts']);
    expect(fetchInit().headers.get('x-operator-key')).not.toBe(first);
  });

  it('omits the BFF secret when none is configured', async () => {
    CONFIG.BFF_SECRET = undefined as unknown as string;

    await call(route.GET, ['contacts']);

    expect(fetchInit().headers.has('x-bff-secret')).toBe(false);
    // The backend refuses to trust an operator key it cannot attribute to us,
    // so sending one unsigned would only be misleading.
    expect(fetchInit().headers.has('x-operator-key')).toBe(false);
  });

  it('carries the headers the backend middleware reads', async () => {
    await call(route.POST, ['campaigns'], {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem-1',
        'x-csrf-token': 'csrf-1',
        'x-forwarded-for': '203.0.113.9',
        'user-agent': 'console/1.0',
      },
    });

    const headers = fetchInit().headers;
    // Dropping any of these silently makes the backend reject with an error
    // that reads like a client bug — requireIdempotencyKey() 400s outright.
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toBe('idem-1');
    expect(headers.get('x-csrf-token')).toBe('csrf-1');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(headers.get('user-agent')).toBe('console/1.0');
  });

  it('forwards Range so <video>/<audio> can seek', async () => {
    await call(route.GET, ['whatsapp', 'media', 'abc'], {
      headers: { range: 'bytes=2048-4095' },
    });

    // Dropped, the backend never sees the range and always replies 200 with the
    // whole file — which is what made every scrubber drag a fresh download.
    expect(fetchInit().headers.get('range')).toBe('bytes=2048-4095');
  });

  it('sets no Range when the browser asked for none', async () => {
    await call(route.GET, ['whatsapp', 'media', 'abc']);

    expect(fetchInit().headers.has('range')).toBe(false);
  });

  it('sends a body for writes and none for reads', async () => {
    await call(route.POST, ['campaigns'], { method: 'POST' });
    expect(fetchInit().body).toBeInstanceOf(ArrayBuffer);

    fetchMock.mockClear();
    await call(route.GET, ['campaigns']);
    expect(fetchInit().body).toBeUndefined();
  });

  it('answers 502 when the backend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await call(route.GET, ['contacts']);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, error: { message: 'Cannot reach the API' } });
  });
});

describe('response headers', () => {
  it('suppresses content-length on a response undici decoded', async () => {
    fetchMock.mockResolvedValue(
      upstream({
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': '139',
        },
      }),
    );

    const res = await call(route.GET, ['mfa', 'status']);

    // 139 was the COMPRESSED size; the browser was about to receive 182 bytes.
    // Omitting the header lets the response be chunked and read to end-of-stream.
    expect(res.headers.has('content-length')).toBe(false);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('keeps content-length when nothing was decoded', async () => {
    fetchMock.mockResolvedValue(
      upstream({ headers: { 'content-type': 'image/jpeg', 'content-length': '20481' } }),
    );

    const res = await call(route.GET, ['media', 'abc']);

    // Media is already compressed so the compressor skips it, and a real length
    // is what makes download progress work in the inbox.
    expect(res.headers.get('content-length')).toBe('20481');
  });

  it('forwards only the headers the browser needs', async () => {
    fetchMock.mockResolvedValue(
      upstream({
        headers: {
          'content-type': 'text/csv',
          'content-disposition': 'attachment; filename="contacts.csv"',
          'cache-control': 'no-store',
          'x-powered-by': 'Express',
        },
      }),
    );

    const res = await call(route.GET, ['contacts', 'export']);

    expect(res.headers.get('content-disposition')).toBe('attachment; filename="contacts.csv"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.has('x-powered-by')).toBe(false);
  });

  it('keeps a 206 partial recognisable as a slice of a larger file', async () => {
    fetchMock.mockResolvedValue(
      upstream({
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-range': 'bytes 2048-4095/1048576',
          'content-length': '2048',
        },
      }),
    );

    const res = await call(route.GET, ['whatsapp', 'media', 'abc'], {
      headers: { range: 'bytes=2048-4095' },
    });

    expect(res.status).toBe(206);
    // Strip content-range and the browser has no idea the 2 KB it just read is
    // part of a 1 MB video; Safari then declares the media unseekable.
    expect(res.headers.get('content-range')).toBe('bytes 2048-4095/1048576');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe('2048');
  });

  it('passes the upstream status and body through untouched', async () => {
    fetchMock.mockResolvedValue(upstream({ status: 207 }));

    const res = await call(route.DELETE, ['contacts', 'bulk'], { method: 'DELETE' });

    expect(res.status).toBe(207);
    expect(res.body).toBe('upstream-body');
  });
});

describe('function limits', () => {
  it('allows a media stream to outlive the platform default', async () => {
    // Vercel's ~10s ceiling killed a 100 MB attachment mid-body: playback simply
    // stopped partway, while both logs recorded a clean 200/206.
    expect(route.maxDuration).toBe(60);
  });
});
