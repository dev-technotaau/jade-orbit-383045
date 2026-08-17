/**
 * Tests for the exception funnel (src/utils/whatsapp-metrics.ts).
 *
 * The funnel talks Sentry's ingest protocol by hand, so the envelope it builds
 * is the contract under test: get the endpoint, the auth header or the frame
 * order wrong and reporting fails silently — which is indistinguishable from
 * the "no error tracking at all" state this code exists to end.
 *
 * The other half is that reporting must never make an incident worse. Every
 * caller fires `captureWaException` with `void`, and the process-level
 * unhandledRejection handler reports through it, so a rejection here would
 * feed itself.
 */

/* The module under test calls global fetch and disables this same rule inline;
   stubbing it here trips the rule again. Node 20 has fetch. */
/* eslint-disable n/no-unsupported-features/node-builtins */

const ENV: Record<string, string | undefined> = { NODE_ENV: 'test' };
jest.mock('../../config/env', () => ({
  get env() {
    return ENV;
  },
}));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

import { captureWaException, initErrorReporting } from '../whatsapp-metrics';

const DSN = 'https://pubkey123@o42.ingest.sentry.io/4507';

/** Stub global fetch with an ingest response. */
function mockIngest(opts: { ok?: boolean; status?: number; reject?: Error } = {}) {
  global.fetch = jest.fn().mockImplementation(() => {
    if (opts.reject) return Promise.reject(opts.reject);
    return Promise.resolve({ ok: opts.ok ?? true, status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
}

/** The envelope's three lines, parsed: header, item header, event. */
function sentEnvelope() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  const lines = (init.body as string).trim().split('\n');
  return {
    header: JSON.parse(lines[0]),
    itemHeader: JSON.parse(lines[1]),
    event: JSON.parse(lines[2]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(ENV)) delete ENV[key];
  ENV.NODE_ENV = 'test';
  delete process.env.RENDER_GIT_COMMIT;
  mockIngest();
});

describe('initErrorReporting', () => {
  it('stays disabled with no DSN, and the funnel still logs', async () => {
    initErrorReporting();
    await captureWaException(new Error('boom'), { campaignId: 'c1' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith('[whatsapp] boom', { campaignId: 'c1' });
  });

  it('stays disabled and says so loudly when the DSN is malformed', async () => {
    ENV.SENTRY_DSN = 'https://o42.ingest.sentry.io/4507'; // no public key
    initErrorReporting();

    expect(loggerMock.error.mock.calls[0][0]).toMatch(/not a valid DSN/);

    await captureWaException(new Error('boom'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('disables reporting again when re-run without a DSN', async () => {
    ENV.SENTRY_DSN = DSN;
    initErrorReporting();

    delete ENV.SENTRY_DSN;
    initErrorReporting();

    await captureWaException(new Error('boom'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('derives the ingest endpoint and auth header from the DSN', async () => {
    ENV.SENTRY_DSN = DSN;
    initErrorReporting();
    await captureWaException(new Error('boom'));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://o42.ingest.sentry.io/api/4507/envelope/');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-sentry-envelope');
    expect(init.headers['X-Sentry-Auth']).toBe(
      'Sentry sentry_version=7, sentry_client=whatsapp-cloud-module/1.0.0, sentry_key=pubkey123'
    );
  });

  it('keeps a self-hosted path prefix in front of /api/{project}/envelope/', async () => {
    ENV.SENTRY_DSN = 'https://key@sentry.internal/on-prem/9';
    initErrorReporting();
    await captureWaException(new Error('boom'));

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://sentry.internal/on-prem/api/9/envelope/');
  });
});

describe('captureWaException', () => {
  beforeEach(() => {
    ENV.SENTRY_DSN = DSN;
    initErrorReporting();
  });

  it('logs and reports the same exception', async () => {
    await captureWaException(new TypeError('bad shape'), { jobId: 'j1' });

    expect(loggerMock.error).toHaveBeenCalledWith('[whatsapp] bad shape', { jobId: 'j1' });

    const { header, itemHeader, event } = sentEnvelope();
    expect(itemHeader).toEqual({ type: 'event' });
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(event.event_id).toBe(header.event_id);
    expect(event.platform).toBe('node');
    expect(event.level).toBe('error');
    expect(event.environment).toBe('test');
    expect(event.extra).toEqual({ jobId: 'j1' });
    expect(event.exception.values[0].type).toBe('TypeError');
    expect(event.exception.values[0].value).toBe('bad shape');
  });

  it('orders frames oldest-first and marks only our own code in_app', async () => {
    const err = new Error('boom');
    err.stack = [
      'Error: boom',
      '    at sendOne (/srv/src/jobs/whatsapp-campaign.worker.ts:310:7)',
      '    at Worker.run (/srv/node_modules/bullmq/dist/classes/worker.js:88:9)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');

    await captureWaException(err);

    const { event } = sentEnvelope();
    expect(event.exception.values[0].stacktrace.frames).toEqual([
      {
        filename: 'node:internal/process/task_queues',
        function: 'process.processTicksAndRejections',
        lineno: 95,
        colno: 5,
        in_app: false,
      },
      {
        filename: '/srv/node_modules/bullmq/dist/classes/worker.js',
        function: 'Worker.run',
        lineno: 88,
        colno: 9,
        in_app: false,
      },
      {
        filename: '/srv/src/jobs/whatsapp-campaign.worker.ts',
        function: 'sendOne',
        lineno: 310,
        colno: 7,
        in_app: true,
      },
    ]);
  });

  it('reports a thrown non-Error without an empty stacktrace, which ingest rejects', async () => {
    await captureWaException('just a string');

    const { event } = sentEnvelope();
    expect(event.exception.values[0]).toEqual({ type: 'Error', value: 'just a string' });
  });

  it('tags the release from SENTRY_RELEASE, falling back to RENDER_GIT_COMMIT', async () => {
    process.env.RENDER_GIT_COMMIT = 'abc1234';
    await captureWaException(new Error('boom'));
    expect(sentEnvelope().event.release).toBe('abc1234');

    jest.clearAllMocks();
    mockIngest();
    ENV.SENTRY_RELEASE = 'v2.1.0';
    await captureWaException(new Error('boom'));
    expect(sentEnvelope().event.release).toBe('v2.1.0');
  });

  it('prefers SENTRY_ENVIRONMENT over NODE_ENV', async () => {
    ENV.SENTRY_ENVIRONMENT = 'staging';
    await captureWaException(new Error('boom'));

    expect(sentEnvelope().event.environment).toBe('staging');
  });

  it('resolves rather than rejects when ingest refuses the event', async () => {
    mockIngest({ ok: false, status: 429 });

    await expect(captureWaException(new Error('boom'))).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[whatsapp] could not report exception: ingest responded 429'
    );
  });

  it('resolves rather than rejects when the ingest host is unreachable', async () => {
    mockIngest({ reject: new Error('ETIMEDOUT') });

    await expect(captureWaException(new Error('boom'))).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[whatsapp] could not report exception: ETIMEDOUT'
    );
  });
});
