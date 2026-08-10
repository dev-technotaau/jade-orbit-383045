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
    // Production defaults this to '91' (config/env.ts). Omitting it here left
    // `cc` empty, which made the entire country-code branch of normalizeWaPhone
    // dead under test — the function's whole reason for existing.
    DEFAULT_COUNTRY_CODE: '91',
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
  // This is the identity key of every contact row: two spellings of one number
  // that normalize differently become two contacts, two conversations, and a
  // duplicate send. DEFAULT_COUNTRY_CODE is '91' in the env mock above, as in
  // production.
  it.each([
    // [input, expected, why]
    ['+91 98765 43210', '+919876543210', 'explicit + with spaces'],
    ['(919) 876-543210', '+919876543210', 'punctuation stripped'],
    ['919876543210', '+919876543210', 'bare international digits'],
    ['9876543210', '+919876543210', '10-digit national number gets the country code'],
    ['09876543210', '+919876543210', 'leading 0 is a trunk prefix, not part of the number'],
    ['00919876543210', '+919876543210', '00 is the international access prefix'],
    ['+1 555 123 4567', '+15551234567', 'a non-default country code survives'],
    ['+919876543210', '+919876543210', 'already normalized — idempotent'],
  ])('normalizes %s to %s (%s)', (input, expected) => {
    expect(normalizeWaPhone(input)).toBe(expected);
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    for (const input of ['9876543210', '09876543210', '00919876543210', '+91 98765 43210']) {
      const once = normalizeWaPhone(input);
      expect(normalizeWaPhone(once)).toBe(once);
    }
  });

  it('returns the raw input when there are no digits', () => {
    expect(normalizeWaPhone('abc')).toBe('abc');
    expect(normalizeWaPhone('')).toBe('');
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
