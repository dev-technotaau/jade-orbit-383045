/**
 * Unit tests for the pure WhatsApp logic (plan §14): signature verification,
 * webhook classification, phone normalization, opt-out detection, the 24h
 * window gate, and template-send component building.
 *
 * Heavy config modules are mocked so importing the services doesn't trigger
 * env validation / Prisma / Firebase at load time.
 */
import crypto from 'crypto';

jest.mock('../../config/env', () => ({
  env: {
    WHATSAPP_OPT_OUT_KEYWORDS: 'STOP,UNSUBSCRIBE,CANCEL',
    META_WHATSAPP_APP_SECRET: 'test_app_secret',
    META_WHATSAPP_API_VERSION: 'v21.0',
    META_WHATSAPP_TOKEN: 'test_token',
    META_WHATSAPP_PHONE_ID: 'test_phone',
  },
}));
jest.mock('../../config/prisma', () => ({ prisma: {} }));
jest.mock('../../config/redis', () => ({ redis: {} }));
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../utils/whatsapp-realtime', () => ({ emitWa: jest.fn() }));
// whatsapp-contact.service imports storage.service (DPDP erase) which pulls in
// ESM-only `uuid`; mock it so this pure suite doesn't load the R2/uuid chain.
jest.mock('../storage.service', () => ({
  deleteFileFromR2: jest.fn(),
  downloadFileFromR2: jest.fn(),
  putBufferToR2: jest.fn(),
  getFileUrl: jest.fn(),
  uploadFileToR2: jest.fn(),
}));

import { verifyWhatsappSignature, classifyWhatsappEvent } from '../whatsapp-webhook.service';
import { normalizeWaPhone, isOptOutMessage } from '../whatsapp-contact.service';
import { windowOpen } from '../whatsapp-conversation.service';
import { buildTemplateSendComponents } from '../whatsapp-template.service';

describe('verifyWhatsappSignature', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const sign = (b: Buffer, secret = 'test_app_secret') =>
    'sha256=' + crypto.createHmac('sha256', secret).update(b).digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyWhatsappSignature(body, sign(body))).toBe(true);
  });
  it('rejects a tampered signature', () => {
    expect(verifyWhatsappSignature(body, sign(body).slice(0, -2) + 'ff')).toBe(false);
  });
  it('rejects a signature computed with the wrong secret', () => {
    expect(verifyWhatsappSignature(body, sign(body, 'wrong_secret'))).toBe(false);
  });
  it('rejects when the signature header is missing', () => {
    expect(verifyWhatsappSignature(body, undefined)).toBe(false);
  });
  it('rejects a signature for a different body', () => {
    expect(verifyWhatsappSignature(Buffer.from('other'), sign(body))).toBe(false);
  });
});

describe('classifyWhatsappEvent', () => {
  it('classifies an inbound message + extracts the WAMID', () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.MSG1' }] } }] }],
    };
    expect(classifyWhatsappEvent(payload)).toEqual({ eventType: 'message', wamid: 'wamid.MSG1' });
  });
  it('classifies a status callback + extracts the WAMID', () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.MSG2', status: 'delivered' }] } }] }],
    };
    expect(classifyWhatsappEvent(payload)).toEqual({ eventType: 'status', wamid: 'wamid.MSG2' });
  });
  it('falls back to unknown for an unrecognized payload', () => {
    expect(classifyWhatsappEvent({ foo: 'bar' })).toEqual({ eventType: 'unknown', wamid: null });
  });
});

describe('normalizeWaPhone', () => {
  it('strips formatting to E.164', () => {
    expect(normalizeWaPhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeWaPhone('(919) 876-543210')).toBe('+919876543210');
  });
  it('prefixes a + onto a bare digit string', () => {
    expect(normalizeWaPhone('919876543210')).toBe('+919876543210');
  });
  it('returns the raw input when there are no digits', () => {
    expect(normalizeWaPhone('abc')).toBe('abc');
  });
});

describe('isOptOutMessage', () => {
  it('detects opt-out keywords case-insensitively + trimmed', () => {
    expect(isOptOutMessage('STOP')).toBe(true);
    expect(isOptOutMessage('stop')).toBe(true);
    expect(isOptOutMessage('  Unsubscribe  ')).toBe(true);
    expect(isOptOutMessage('CANCEL')).toBe(true);
  });
  it('ignores ordinary messages + nullish input', () => {
    expect(isOptOutMessage('hello there')).toBe(false);
    expect(isOptOutMessage('')).toBe(false);
    expect(isOptOutMessage(null)).toBe(false);
    expect(isOptOutMessage(undefined)).toBe(false);
  });
});

describe('windowOpen (24h customer-service window)', () => {
  it('is closed when there is no expiry', () => {
    expect(windowOpen(null)).toBe(false);
  });
  it('is open when the expiry is in the future', () => {
    expect(windowOpen(new Date(Date.now() + 60_000))).toBe(true);
  });
  it('is closed when the expiry is in the past', () => {
    expect(windowOpen(new Date(Date.now() - 60_000))).toBe(false);
  });
});

describe('buildTemplateSendComponents', () => {
  it('returns an empty array with no inputs', () => {
    expect(buildTemplateSendComponents({})).toEqual([]);
  });
  it('builds positional body parameters', () => {
    expect(buildTemplateSendComponents({ bodyParams: ['Alice', 'Engineer'] })).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Alice' },
          { type: 'text', text: 'Engineer' },
        ],
      },
    ]);
  });
  it('builds a text header', () => {
    const out = buildTemplateSendComponents({ headerText: 'Welcome' });
    expect(out[0]).toEqual({ type: 'header', parameters: [{ type: 'text', text: 'Welcome' }] });
  });
  it('prefers an image header over a text header', () => {
    const out = buildTemplateSendComponents({ headerImageId: 'media-1', headerText: 'ignored' });
    expect(out[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { id: 'media-1' } }],
    });
  });
  it('builds a dynamic URL-button parameter', () => {
    const out = buildTemplateSendComponents({ buttonUrlParam: 'abc123' });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: 'abc123' }],
    });
  });
});
