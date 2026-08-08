/**
 * Integration-style tests for the WhatsApp webhook controller
 * (src/controllers/whatsapp-webhook.controller.ts) driven through supertest
 * against a minimal express app that mounts the two real handlers:
 *   - GET  verifyWhatsappWebhook  (Meta verification handshake)
 *   - POST handleWhatsappWebhook  (inbound messages + delivery status)
 *
 * The raw-body capture is replicated from
 * src/middleware/whatsapp-webhook-rawbody.ts so the HMAC is computed over the
 * exact raw bytes Meta signs, just like production.
 *
 * Heavy deps are mocked so importing the controller doesn't trigger env
 * validation / Prisma / Redis / Sentry / the full service tree.
 */
import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const APP_SECRET = 'test_secret';
const VERIFY_TOKEN = 'verify_tok';

jest.mock('../../config/env', () => ({
  env: {
    META_WHATSAPP_APP_SECRET: APP_SECRET,
    META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
    META_WHATSAPP_API_VERSION: 'v21.0',
    META_WHATSAPP_TOKEN: 'test_token',
    META_WHATSAPP_PHONE_ID: 'test_phone',
    WHATSAPP_CHATWOOT_BRIDGE_ENABLED: 'false',
    CHATWOOT_BASE_URL: '',
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    waWebhookEvent: { create: jest.fn().mockResolvedValue({ id: 'evt1' }) },
  },
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/redis', () => ({ redis: {} }));

// Inbound queue — assert called / not-called per signature outcome.
jest.mock('../../jobs/whatsapp-inbound.queue', () => ({
  addWhatsappInboundJob: jest.fn().mockResolvedValue(undefined),
}));

// Optional Chatwoot bridge — stubbed so importing the controller doesn't pull
// in the whole whatsapp.service dependency tree (Graph API, channel, etc.).
jest.mock('../../services/whatsapp-bridge.service', () => ({
  fanOutInboundToChatwoot: jest.fn().mockResolvedValue(undefined),
}));

// Prometheus metrics — mirror whatsapp-metrics.ts exports as no-op stubs so the
// import resolves without touching prom-client's global registry.
jest.mock('../../utils/whatsapp-metrics', () => {
  const counter = () => ({ inc: jest.fn() });
  const histogram = () => ({ observe: jest.fn() });
  const gauge = () => ({ inc: jest.fn(), set: jest.fn(), setToCurrentTime: jest.fn() });
  return {
    waMessagesTotal: counter(),
    waSendFailuresTotal: counter(),
    waWebhookEventsTotal: counter(),
    waSendDuration: histogram(),
    waWebhookLastEventTimestamp: gauge(),
    waChannelQuality: gauge(),
    waMessagingTierLimit: gauge(),
    captureWaException: jest.fn(),
  };
});

import { verifyWhatsappWebhook, handleWhatsappWebhook } from '../whatsapp-webhook.controller';
import { addWhatsappInboundJob } from '../../jobs/whatsapp-inbound.queue';

// Typed as a loose jest.Mock (not MockedFunction<typeof ...>) so
// `mockResolvedValue(undefined)` doesn't fight the real `Promise<Job>` return.
const addInboundMock = addWhatsappInboundJob as unknown as jest.Mock;

/** Replicates whatsapp-webhook-rawbody.ts: capture raw Buffer + parse JSON. */
const rawBodyCapture: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (Buffer.isBuffer(req.body)) {
    const buf = req.body as Buffer;
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
    try {
      req.body = buf.length > 0 ? JSON.parse(buf.toString('utf8')) : {};
    } catch {
      req.body = {};
    }
  }
  next();
};

function buildApp(): express.Express {
  const app = express();
  app.get('/api/v1/webhooks/whatsapp', verifyWhatsappWebhook);
  app.post(
    '/api/v1/webhooks/whatsapp',
    express.raw({ type: '*/*' }),
    rawBodyCapture,
    handleWhatsappWebhook
  );
  return app;
}

/** sha256= HMAC of the exact raw bytes, keyed by the App Secret. */
function sign(rawBody: string | Buffer, secret = APP_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

const MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messages: [{ id: 'wamid.TEST1' }] } }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  addInboundMock.mockResolvedValue(undefined);
});

describe('GET /api/v1/webhooks/whatsapp — verification handshake', () => {
  it('echoes hub.challenge with 200 when the verify token matches', async () => {
    const res = await request(buildApp())
      .get('/api/v1/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '123' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('123');
  });

  it('returns 403 when the verify token is wrong', async () => {
    const res = await request(buildApp())
      .get('/api/v1/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'WRONG', 'hub.challenge': '123' });

    expect(res.status).toBe(403);
  });

  it('returns 403 when the verify token is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.challenge': '123' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/webhooks/whatsapp — inbound delivery', () => {
  it('accepts a correctly-signed payload (200) and enqueues the inbound job', async () => {
    // A string (not a Buffer): superagent JSON-serializes a Buffer body, which
    // would change the bytes; a string is sent verbatim and matches the HMAC.
    const rawBody = JSON.stringify(MESSAGE_PAYLOAD);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(rawBody))
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, enqueued: true });
    expect(addInboundMock).toHaveBeenCalledTimes(1);
    expect(addInboundMock).toHaveBeenCalledWith({ eventRowId: 'evt1' });
  });

  it('drops an invalidly-signed payload with 200 (NOT 401) and does NOT enqueue', async () => {
    // A string (not a Buffer): superagent JSON-serializes a Buffer body, which
    // would change the bytes; a string is sent verbatim and matches the HMAC.
    const rawBody = JSON.stringify(MESSAGE_PAYLOAD);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(rawBody);

    // 200-and-drop: a non-2xx would make Meta retry (retry storm).
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, dropped: 'invalid signature' });
    expect(addInboundMock).not.toHaveBeenCalled();
  });

  it('drops a payload with a missing signature header with 200 and does NOT enqueue', async () => {
    // A string (not a Buffer): superagent JSON-serializes a Buffer body, which
    // would change the bytes; a string is sent verbatim and matches the HMAC.
    const rawBody = JSON.stringify(MESSAGE_PAYLOAD);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, dropped: 'invalid signature' });
    expect(addInboundMock).not.toHaveBeenCalled();
  });

  it('rejects a request whose signature was computed with the wrong secret', async () => {
    // A string (not a Buffer): superagent JSON-serializes a Buffer body, which
    // would change the bytes; a string is sent verbatim and matches the HMAC.
    const rawBody = JSON.stringify(MESSAGE_PAYLOAD);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(rawBody, 'wrong_secret'))
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, dropped: 'invalid signature' });
    expect(addInboundMock).not.toHaveBeenCalled();
  });
});
