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
import {
  normalizeWaPhone,
  isOptOutMessage,
  segmentContactWhere,
  tagListQ,
} from '../whatsapp-contact.service';
import { windowOpen } from '../whatsapp-conversation.service';
import { buildTemplateSendComponents } from '../whatsapp-template.service';
// "This JSON path is SQL NULL" — how an `attr.<key> is set` rule is compiled.
import { Prisma } from '@prisma/client';
const PrismaDbNull = Prisma.DbNull;

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
    // The trunk 0 can also survive AFTER the country code, which is what a
    // national-format number looks like once someone prefixes it by hand or in
    // a spreadsheet. Two real uploaded rows arrived this way and were stored as
    // 13-digit `+910…` contacts — a second identity for people already in the
    // book. Meta repaired them on send, so nothing ever surfaced it.
    ['9109417264466', '+919417264466', 'trunk 0 after the country code'],
    ['+9109417264466', '+919417264466', 'same, already + prefixed'],
    ['91 0 9417264466', '+919417264466', 'same, with the 0 spaced out'],
    ['918168291701', '+918168291701', 'a valid 12-digit +91 number is left alone'],
    ['00919876543210', '+919876543210', '00 is the international access prefix'],
    ['+1 555 123 4567', '+15551234567', 'a non-default country code survives'],
    ['+919876543210', '+919876543210', 'already normalized — idempotent'],
  ])('normalizes %s to %s (%s)', (input, expected) => {
    expect(normalizeWaPhone(input)).toBe(expected);
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    for (const input of [
      '9876543210',
      '09876543210',
      '00919876543210',
      '+91 98765 43210',
      '9109417264466',
    ]) {
      const once = normalizeWaPhone(input);
      expect(normalizeWaPhone(once)).toBe(once);
    }
  });

  it('returns the raw input when there are no digits', () => {
    expect(normalizeWaPhone('abc')).toBe('abc');
    expect(normalizeWaPhone('')).toBe('');
  });
});

describe('segmentContactWhere', () => {
  // One predicate, three callers: the contacts list, GET /segments/:id/count and
  // a campaign launch. They used to disagree — the contacts page applied only
  // the segment's FIRST tag while a campaign ORed all of them, so the count an
  // operator sanity-checked before launching was for a different, smaller set.
  it('matches ANY of the segment tags', () => {
    expect(segmentContactWhere({ tags: ['vip', 'mumbai'] })).toEqual({
      isBlocked: false,
      tags: { hasSome: ['vip', 'mumbai'] },
    });
  });

  it('narrows by opt-in status when the segment names one', () => {
    expect(segmentContactWhere({ optInStatus: 'OPTED_IN' })).toEqual({
      isBlocked: false,
      optInStatus: 'OPTED_IN',
    });
  });

  it('never reaches a blocked contact, even with an empty filter', () => {
    expect(segmentContactWhere({})).toEqual({ isBlocked: false });
    expect(segmentContactWhere(null)).toEqual({ isBlocked: false });
  });

  it('matches imported attributes exactly, one JSON path per key', () => {
    expect(segmentContactWhere({ attributes: { city: 'Mumbai', plan: 'Gold' } })).toEqual({
      isBlocked: false,
      AND: [
        { attributes: { path: ['city'], equals: 'Mumbai' } },
        { attributes: { path: ['plan'], equals: 'Gold' } },
      ],
    });
  });

  it('ignores an attribute with no value rather than matching on empty', () => {
    expect(segmentContactWhere({ attributes: { city: '' } })).toEqual({ isBlocked: false });
  });

  // The rule grammar. Targeting was tag-OR plus an opt-in status and nothing
  // else on WaContact was reachable, so every audience beyond that had to be
  // assembled outside the product and pasted back in as a phone list.
  it('ANDs tags, which tag-OR could never express', () => {
    expect(
      segmentContactWhere({
        rules: [{ field: 'tags', operator: 'all', value: ['mumbai', 'premium'] }],
      })
    ).toEqual({ isBlocked: false, AND: [{ tags: { hasEvery: ['mumbai', 'premium'] } }] });
  });

  it('excludes tags with `none`', () => {
    expect(
      segmentContactWhere({ rules: [{ field: 'tags', operator: 'none', value: ['churned'] }] })
    ).toEqual({ isBlocked: false, AND: [{ NOT: { tags: { hasSome: ['churned'] } } }] });
  });

  it('counts a contact who has never messaged us as "not in the last 30 days"', () => {
    const now = Date.UTC(2026, 7, 12);
    // A bare `lt` on a null column matches nothing in SQL, so without the null
    // arm the most obvious member of "has not messaged us recently" — someone who
    // has never messaged us at all — would be silently excluded.
    expect(
      segmentContactWhere(
        { rules: [{ field: 'lastInboundAt', operator: 'notWithin', value: 30 }] },
        now
      )
    ).toEqual({
      isBlocked: false,
      AND: [
        {
          OR: [
            { lastInboundAt: null },
            { lastInboundAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
          ],
        },
      ],
    });
  });

  it('targets an imported column by key', () => {
    expect(
      segmentContactWhere({ rules: [{ field: 'attr.city', operator: 'equals', value: 'Mumbai' }] })
    ).toEqual({ isBlocked: false, AND: [{ attributes: { path: ['city'], equals: 'Mumbai' } }] });
  });

  it('excludes everyone who did not reply to a past campaign', () => {
    expect(
      segmentContactWhere({
        rules: [{ field: 'campaign', operator: 'notReplied', value: 'camp-1' }],
      })
    ).toEqual({
      isBlocked: false,
      AND: [{ campaignRecipients: { none: { campaignId: 'camp-1', repliedAt: { not: null } } } }],
    });
  });

  it('combines rules with OR when the segment asks for it', () => {
    expect(
      segmentContactWhere({
        op: 'or',
        rules: [
          { field: 'tags', operator: 'any', value: ['vip'] },
          { field: 'optInSource', operator: 'equals', value: 'form' },
        ],
      })
    ).toEqual({
      isBlocked: false,
      OR: [{ tags: { hasSome: ['vip'] } }, { optInSource: 'form' }],
    });
  });

  it('drops a half-filled rule instead of letting it match everyone', () => {
    expect(segmentContactWhere({ rules: [{ field: 'tags', operator: 'all', value: [] }] })).toEqual(
      {
        isBlocked: false,
      }
    );
    expect(
      segmentContactWhere({ rules: [{ field: 'nonsense', operator: 'equals', value: 'x' }] })
    ).toEqual({ isBlocked: false });
  });

  it('keeps the legacy keys narrowing alongside a rule', () => {
    // Every segment saved before the grammar existed still carries the flat keys.
    // They are ANDed on top, never folded into an OR group — adding a rule to an
    // existing segment must not silently widen the audience it already had.
    expect(
      segmentContactWhere({
        tags: ['vip'],
        optInStatus: 'OPTED_IN',
        rules: [{ field: 'attr.plan', operator: 'exists' }],
      })
    ).toEqual({
      isBlocked: false,
      optInStatus: 'OPTED_IN',
      tags: { hasSome: ['vip'] },
      AND: [{ NOT: { attributes: { path: ['plan'], equals: PrismaDbNull } } }],
    });
  });
});

describe('tagListQ', () => {
  it('accepts the comma form and the repeated-key form', () => {
    expect(tagListQ('vip, mumbai')).toEqual(['vip', 'mumbai']);
    expect(tagListQ(['vip', 'mumbai'])).toEqual(['vip', 'mumbai']);
  });

  it('is undefined when nothing usable was passed', () => {
    expect(tagListQ('')).toBeUndefined();
    expect(tagListQ(' , ')).toBeUndefined();
    expect(tagListQ(undefined)).toBeUndefined();
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
  it('takes the copy-code button index from the template it is sending', () => {
    // The template builder appends COPY_CODE after the operator's own buttons, so
    // the coupon button of a real marketing template is rarely index 0. Sending
    // '0' for a button that sits at index 1 is rejected by Meta with (#131008).
    const out = buildTemplateSendComponents({
      couponCode: 'SAVE20',
      templateComponents: [
        { type: 'BODY', text: 'Your code is inside' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Not now' },
            { type: 'COPY_CODE', example: 'SAVE20' },
          ],
        },
      ],
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'copy_code',
      index: '1',
      parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
    });
  });
  it('indexes a dynamic URL button by its authored position, ignoring static ones', () => {
    const out = buildTemplateSendComponents({
      buttonUrlParam: 'abc123',
      couponCode: 'SAVE20',
      templateComponents: [
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Not now' },
            { type: 'URL', text: 'Help', url: 'https://example.com/help' },
            { type: 'URL', text: 'Track', url: 'https://example.com/t/{{1}}' },
            { type: 'COPY_CODE', example: 'SAVE20' },
          ],
        },
      ],
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '2',
      parameters: [{ type: 'text', text: 'abc123' }],
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'copy_code',
      index: '3',
      parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
    });
  });
  it('falls back to positional indexes when no template components are supplied', () => {
    const out = buildTemplateSendComponents({ buttonUrlParam: 'abc123', couponCode: 'SAVE20' });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'copy_code',
      index: '1',
      parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
    });
  });
});
