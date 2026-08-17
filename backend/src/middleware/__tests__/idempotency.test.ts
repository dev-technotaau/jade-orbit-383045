/**
 * Tests for idempotent replay (src/middleware/idempotency.ts).
 *
 * This exists for one concrete failure: a media send is a chain of proxy buffer
 * → multer → virus scan → a full multipart upload of the file to Meta, and on a
 * slow uplink that can outlast the client timeout. The operator sees "Failed to
 * send media" and presses send again while the first attempt is still running
 * and about to deliver — so the customer gets the attachment twice and the
 * account is billed twice.
 *
 * The cases below are therefore the ones that decide whether that can still
 * happen: the second request must never reach the handler while the first is in
 * flight, must get the first response back once it has finished, and must
 * genuinely re-run after a failure. The degraded paths matter just as much —
 * refusing to send because the dedup store is down would be a worse product than
 * the duplicate it prevents.
 */

import type { Request, RequestHandler, Response } from 'express';
import express from 'express';
import request from 'supertest';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const redisMock = {
  status: 'ready' as string,
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};
jest.mock('../../config/redis', () => ({ redis: redisMock }));

import { idempotent } from '../idempotency';
import { errorHandler } from '../error';

const KEY = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';
const REDIS_KEY = `idem:test-scope:${KEY}`;

/** Handler stands in for a send: it records that it ran and answers 201. */
function app(mw: RequestHandler, handler?: RequestHandler) {
  const a = express();
  a.use(express.json());
  a.post(
    '/send',
    mw,
    handler ??
      ((_req: Request, res: Response) => {
        res.status(201).json({ success: true, data: { id: 'msg-1' } });
      })
  );
  // Mounted so the middleware's AppErrors come back with their real status
  // rather than Express's default 500 HTML page.
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.status = 'ready';
  redisMock.set.mockResolvedValue('OK');
  redisMock.get.mockResolvedValue(null);
  redisMock.del.mockResolvedValue(1);
});

describe('key handling', () => {
  it('rejects a request with no key when the route requires one', async () => {
    const res = await request(app(idempotent({ scope: 'test-scope', required: true }))).post(
      '/send'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('lets a keyless request through when the route does not require one', async () => {
    const res = await request(app(idempotent({ scope: 'test-scope' }))).post('/send');

    expect(res.status).toBe(201);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('rejects a key that could not have come from us', async () => {
    const res = await request(app(idempotent({ scope: 'test-scope', required: true })))
      .post('/send')
      .set('Idempotency-Key', 'short');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});

describe('first attempt', () => {
  it('claims the key, runs the handler and stores the response for replay', async () => {
    const res = await request(app(idempotent({ scope: 'test-scope', required: true })))
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(201);
    expect(redisMock.set).toHaveBeenCalledWith(REDIS_KEY, expect.any(String), 'EX', 86400, 'NX');
    const stored = redisMock.set.mock.calls.find((c) => c[2] === 'EX' && c.length === 4);
    expect(stored).toBeDefined();
    expect(JSON.parse(stored![1] as string)).toEqual({
      status: 201,
      body: { success: true, data: { id: 'msg-1' } },
    });
  });

  it('releases the key when the attempt failed, so a retry really retries', async () => {
    const failing: RequestHandler = (_req, res) => {
      res.status(502).json({ success: false, error: { message: 'Meta refused it' } });
    };

    const res = await request(app(idempotent({ scope: 'test-scope', required: true }), failing))
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(502);
    expect(redisMock.del).toHaveBeenCalledWith(REDIS_KEY);
  });
});

describe('retry of the same key', () => {
  it('replays the original response instead of sending again', async () => {
    redisMock.set.mockResolvedValue(null); // key already held
    redisMock.get.mockResolvedValue(
      JSON.stringify({ status: 201, body: { success: true, data: { id: 'msg-1' } } })
    );
    const handler = jest.fn((_req: Request, res: Response) => {
      res.status(201).json({ success: true, data: { id: 'msg-2' } });
    });

    const res = await request(
      app(idempotent({ scope: 'test-scope', required: true }), handler as RequestHandler)
    )
      .post('/send')
      .set('Idempotency-Key', KEY);

    // The SECOND send never happened: same message id back, handler untouched.
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 'msg-1' } });
    expect(res.headers['idempotent-replay']).toBe('true');
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses while the first attempt is still running', async () => {
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue('\u0000in-flight');
    const handler = jest.fn((_req: Request, res: Response) => res.status(201).json({}));

    const res = await request(
      app(idempotent({ scope: 'test-scope', required: true }), handler as RequestHandler)
    )
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENT_REQUEST_IN_FLIGHT');
    expect(handler).not.toHaveBeenCalled();
  });

  it('treats a key that expired between the claim and the read as a fresh request', async () => {
    redisMock.set.mockResolvedValue(null);
    redisMock.get.mockResolvedValue(null);

    const res = await request(app(idempotent({ scope: 'test-scope', required: true })))
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(201);
  });
});

describe('degraded stores', () => {
  it('does not dedup when Redis is switched off, rather than 409ing every send', async () => {
    // The mock client resolves null to every command, which would otherwise read
    // as "another request holds this key" and refuse every single send.
    redisMock.status = 'disabled';

    const res = await request(app(idempotent({ scope: 'test-scope', required: true })))
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(201);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('sends anyway when the store errors — a duplicate beats a dead send button', async () => {
    redisMock.set.mockRejectedValue(new Error('connection reset'));

    const res = await request(app(idempotent({ scope: 'test-scope', required: true })))
      .post('/send')
      .set('Idempotency-Key', KEY);

    expect(res.status).toBe(201);
    expect(loggerMock.error).toHaveBeenCalled();
  });
});
