/**
 * Tests for the short-link recipient token (src/services/whatsapp-shortlink.service.ts).
 *
 * The token is what turns a click from an anonymous counter increment into an
 * attributed one, and it travels in a query string the visitor can edit. Two
 * things therefore have to hold: a genuine token round-trips to the right
 * contact, and ANY tampered or borrowed token degrades to an anonymous click
 * rather than crediting somebody else's contact record.
 */

const prismaMock = {
  waShortLink: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  waLinkClick: { create: jest.fn() },
  waLinkClickDaily: { groupBy: jest.fn() },
  waCampaignRecipient: { updateMany: jest.fn() },
  // Read by the reporting-timezone helper the click series buckets on; a null
  // settings row means UTC, which keeps the day keys below deterministic.
  waSettings: { findUnique: jest.fn().mockResolvedValue(null) },
  $queryRaw: jest.fn(),
  $transaction: jest.fn().mockResolvedValue([]),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: { CSRF_SECRET: 'x'.repeat(32), PUBLIC_SHORT_LINK_BASE: 'https://api.test' },
}));

import {
  appendRecipientToken,
  getClickSeries,
  recipientToken,
  recordClick,
  resolveRecipientToken,
  shortLinkUrl,
} from '../whatsapp-shortlink.service';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([]);
  prismaMock.waSettings.findUnique.mockResolvedValue(null);
  prismaMock.waLinkClickDaily.groupBy.mockResolvedValue([]);
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe('recipientToken / resolveRecipientToken', () => {
  it('round-trips the contact id', () => {
    const token = recipientToken('link1', 'contact-1');
    expect(resolveRecipientToken('link1', token)).toBe('contact-1');
  });

  it('rejects a token whose signature was edited', () => {
    const token = recipientToken('link1', 'contact-1');
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(resolveRecipientToken('link1', tampered)).toBeNull();
  });

  it('rejects a token whose contact id was swapped for another', () => {
    // The whole point: an unsigned id would let a visitor attribute their click
    // to any contact in the database simply by editing ?r=.
    const token = recipientToken('link1', 'contact-1');
    const forged =
      Buffer.from('contact-2', 'utf8').toString('base64url') + token.slice(token.indexOf('.'));
    expect(resolveRecipientToken('link1', forged)).toBeNull();
  });

  it('rejects a token minted for a different link', () => {
    const token = recipientToken('link1', 'contact-1');
    expect(resolveRecipientToken('link2', token)).toBeNull();
  });

  it('treats a missing or malformed token as an anonymous click', () => {
    expect(resolveRecipientToken('link1', undefined)).toBeNull();
    expect(resolveRecipientToken('link1', '')).toBeNull();
    expect(resolveRecipientToken('link1', 'no-dot')).toBeNull();
    expect(resolveRecipientToken('link1', '.abc')).toBeNull();
  });
});

describe('appendRecipientToken', () => {
  const codes = new Map([['abc12345', 'link1']]);

  it('stamps the token onto a campaign short link', () => {
    const out = appendRecipientToken('Order here: https://api.test/l/abc12345', 'contact-1', codes);
    expect(out).toBe(
      `Order here: https://api.test/l/abc12345?r=${recipientToken('link1', 'contact-1')}`
    );
  });

  it('leaves a link that belongs to another campaign untouched', () => {
    const out = appendRecipientToken('https://api.test/l/zzzzzzzz', 'contact-1', codes);
    expect(out).toBe('https://api.test/l/zzzzzzzz');
  });

  it('is a no-op when the campaign has no short links', () => {
    expect(appendRecipientToken('https://api.test/l/abc12345', 'c1', new Map())).toBe(
      'https://api.test/l/abc12345'
    );
  });
});

describe('shortLinkUrl', () => {
  it('appends the recipient token when one is supplied', () => {
    expect(shortLinkUrl('abc12345', null, 'tok')).toBe('https://api.test/l/abc12345?r=tok');
  });

  it('omits the query string entirely when there is no token', () => {
    expect(shortLinkUrl('abc12345')).toBe('https://api.test/l/abc12345');
  });
});

describe('recordClick', () => {
  it('persists the contact resolved from the recipient token', async () => {
    prismaMock.waShortLink.findUnique.mockResolvedValue({
      id: 'link1',
      campaignId: 'camp-1',
      targetUrl: 'https://shop.test/sale',
    });

    const url = await recordClick('abc12345', {
      recipientToken: recipientToken('link1', 'contact-1'),
      ip: '1.2.3.4',
      userAgent: 'ua',
    });

    expect(url).toBe('https://shop.test/sale');
    expect(prismaMock.waLinkClick.create).toHaveBeenCalledWith({
      data: { shortLinkId: 'link1', contactId: 'contact-1', ip: '1.2.3.4', userAgent: 'ua' },
    });
  });

  it('stamps the campaign recipient so the clickers are listable', async () => {
    prismaMock.waShortLink.findUnique.mockResolvedValue({
      id: 'link1',
      campaignId: 'camp-1',
      targetUrl: 'https://shop.test/sale',
    });

    await recordClick('abc12345', { recipientToken: recipientToken('link1', 'contact-1') });

    // `clickedAt: null` in the WHERE keeps it FIRST-click: five opens is one
    // clicker with one timestamp, not a moving one.
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'camp-1', contactId: 'contact-1', clickedAt: null },
      data: { clickedAt: expect.any(Date) },
    });
  });

  it('records an anonymous click when the token was tampered with', async () => {
    prismaMock.waShortLink.findUnique.mockResolvedValue({
      id: 'link1',
      campaignId: 'camp-1',
      targetUrl: 'https://shop.test/sale',
    });

    await recordClick('abc12345', { recipientToken: 'garbage.0000000000', ip: null });

    expect(prismaMock.waLinkClick.create).toHaveBeenCalledWith({
      data: { shortLinkId: 'link1', contactId: null, ip: null, userAgent: null },
    });
    // Nobody to attribute it to, so no recipient is marked as having clicked.
    expect(prismaMock.waCampaignRecipient.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch recipients for a link that belongs to no campaign', async () => {
    prismaMock.waShortLink.findUnique.mockResolvedValue({
      id: 'link1',
      campaignId: null,
      targetUrl: 'https://shop.test/sale',
    });

    await recordClick('abc12345', { recipientToken: recipientToken('link1', 'contact-1') });

    expect(prismaMock.waCampaignRecipient.updateMany).not.toHaveBeenCalled();
  });

  it('returns null for an unknown code without writing a click', async () => {
    prismaMock.waShortLink.findUnique.mockResolvedValue(null);

    expect(await recordClick('nope', {})).toBeNull();
    expect(prismaMock.waLinkClick.create).not.toHaveBeenCalled();
  });
});

/**
 * The click series is what the analytics dashboard and the campaign detail page
 * both plot, and it is stitched from two sources with different shapes: raw
 * click rows for the last 178 days (LINK_CLICK_TTL_DAYS - 2) and the daily
 * rollup for everything older. Which half wins on an overlapping day, and
 * whether the counts survive the bigint crossing, are both invisible failures -
 * the chart still draws, it just draws the wrong number.
 */
describe('getClickSeries', () => {
  it('prefers the raw clicks over the rollup for a day both of them cover', async () => {
    prismaMock.waLinkClickDaily.groupBy.mockResolvedValue([
      { date: new Date('2025-12-01T00:00:00.000Z'), _sum: { clicks: 4, uniqueClickers: 2 } },
      { date: new Date('2026-02-19T00:00:00.000Z'), _sum: { clicks: 99, uniqueClickers: 99 } },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      { date: new Date('2026-03-01T00:00:00.000Z'), clicks: BigInt(7), uniques: BigInt(4) },
      { date: new Date('2026-02-19T00:00:00.000Z'), clicks: BigInt(5), uniques: BigInt(3) },
    ]);

    const series = await getClickSeries(365);

    // The rollup deliberately re-rolls the CURRENT day, so the moment one click
    // lands before the nightly run there is a rolled row for a day the raw rows
    // still own in full. Preferring the rolled figure there lost every click for
    // the rest of that day. Sorted by date whatever order the two halves arrive in.
    expect(series).toEqual([
      { date: '2025-12-01', clicks: 4, uniqueClickers: 2 },
      { date: '2026-02-19', clicks: 5, uniqueClickers: 3 },
      { date: '2026-03-01', clicks: 7, uniqueClickers: 4 },
    ]);
    // bigint would reach the chart as a value JSON.stringify refuses to serialize.
    expect(() => JSON.stringify(series)).not.toThrow();
  });

  it('leaves the rollup table alone for a window the raw clicks still cover', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { date: new Date('2026-03-01T00:00:00.000Z'), clicks: BigInt(2), uniques: BigInt(2) },
    ]);

    const series = await getClickSeries(30);

    // Raw rows are authoritative for the whole window, so reading the rollup as
    // well would only risk double-labelling a day it already re-rolled.
    expect(prismaMock.waLinkClickDaily.groupBy).not.toHaveBeenCalled();
    expect(series).toEqual([{ date: '2026-03-01', clicks: 2, uniqueClickers: 2 }]);
  });

  it('scopes the deep history to one campaign when asked', async () => {
    await getClickSeries(365, 'camp-1');

    const [args] = prismaMock.waLinkClickDaily.groupBy.mock.calls[0];
    expect(args.where.campaignId).toBe('camp-1');
    expect(args.where.date).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
  });

  it('reads a rollup row that recorded nothing as a zero day, not a gap', async () => {
    prismaMock.waLinkClickDaily.groupBy.mockResolvedValue([
      { date: new Date('2025-12-01T00:00:00.000Z'), _sum: { clicks: null, uniqueClickers: null } },
    ]);

    expect(await getClickSeries(365)).toEqual([
      { date: '2025-12-01', clicks: 0, uniqueClickers: 0 },
    ]);
  });
});
