/**
 * Tests for the conversion service (src/services/whatsapp-conversion.service.ts).
 *
 * This module is where campaign spend turns into a revenue figure somebody
 * reports upwards, and every one of its rules fails silently when it breaks: a
 * postback retried after a timeout double-counts a sale, a conversion credited
 * to a campaign the contact was merely LISTED in makes the wrong broadcast look
 * profitable, and a deleted conversion that never gives back its `convertedCount`
 * leaves a campaign permanently claiming a sale that was cancelled.
 *
 * Prisma and the contact service are mocked; the attribution and counter rules
 * under test are this module's own.
 */

const prismaMock = {
  waConversion: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  waCampaign: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  waCampaignRecipient: { findFirst: jest.fn() },
  waContact: { findUnique: jest.fn() },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/env', () => ({ env: { DEFAULT_COUNTRY_CODE: '91' } }));

// Only the normalizer is needed, and the real contact service drags in half the
// module graph to provide it.
jest.mock('../whatsapp-contact.service', () => ({
  normalizeWaPhone: (raw: string) => `+${String(raw).replace(/[^\d]/g, '')}`,
}));

import {
  deleteConversion,
  getConversionSummary,
  ingestConversion,
  recordConversion,
} from '../whatsapp-conversion.service';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waConversion.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 'conv-1', ...data })
  );
  // Both counter writes are `.catch(() => {})`-chained fire-and-forget calls, so
  // they have to hand back a real promise.
  prismaMock.waCampaign.update.mockResolvedValue({});
  prismaMock.waCampaign.updateMany.mockResolvedValue({ count: 1 });
});

describe('recordConversion', () => {
  it('credits the campaign it was attributed to', async () => {
    await recordConversion({ campaignId: 'camp-1', valuePaise: 250000 });

    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { convertedCount: { increment: 1 } },
    });
  });

  it('leaves every campaign alone when the sale is attributed to none', async () => {
    await recordConversion({ valuePaise: 250000 });

    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });
});

describe('ingestConversion', () => {
  it('returns the original row for a retried postback instead of counting twice', async () => {
    const existing = { id: 'conv-1', externalId: 'order-99', campaignId: 'camp-1' };
    prismaMock.waConversion.findUnique.mockResolvedValue(existing);

    const result = await ingestConversion({ externalId: 'order-99', valuePaise: 100 });

    // Idempotent rather than a 409: a CRM that retries after a timeout must be
    // able to, and answering with an error only makes it retry harder.
    expect(result).toEqual({ conversion: existing, duplicate: true });
    expect(prismaMock.waConversion.create).not.toHaveBeenCalled();
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });

  it('resolves the contact from a phone number in any format', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue(null);
    prismaMock.waContact.findUnique.mockResolvedValue({ id: 'contact-1' });
    prismaMock.waCampaignRecipient.findFirst.mockResolvedValue(null);

    await ingestConversion({ externalId: 'order-1', phone: '+91 98765 43210' });

    // The caller's website sends whatever the customer typed; the contact table
    // is keyed on the normalized form.
    expect(prismaMock.waContact.findUnique).toHaveBeenCalledWith({
      where: { phone: '+919876543210' },
      select: { id: true },
    });
  });

  it('attributes to the last campaign that actually reached the contact', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue(null);
    prismaMock.waCampaignRecipient.findFirst.mockResolvedValue({ campaignId: 'camp-7' });

    const { conversion, duplicate } = await ingestConversion({
      externalId: 'order-2',
      contactId: 'contact-1',
      valuePaise: 990000,
    });

    expect(duplicate).toBe(false);
    expect(conversion).toEqual(expect.objectContaining({ campaignId: 'camp-7', source: 'api' }));
    const [args] = prismaMock.waCampaignRecipient.findFirst.mock.calls[0];
    // PENDING and SKIPPED recipients carry a null sentAt and Postgres sorts NULLs
    // first on DESC, so without these filters the newest campaign the contact was
    // merely listed in would outrank the one they were actually sent.
    expect(args.where.status).toEqual({ in: ['SENT', 'DELIVERED', 'READ'] });
    expect(args.where.sentAt.not).toBeNull();
    expect(args.where.sentAt.gte).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ sentAt: 'desc' });
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-7' },
      data: { convertedCount: { increment: 1 } },
    });
  });

  it('records an unattributed sale when no send reached the contact in the window', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue(null);
    prismaMock.waCampaignRecipient.findFirst.mockResolvedValue(null);

    const { conversion } = await ingestConversion({
      externalId: 'order-3',
      contactId: 'contact-1',
    });

    // Better an unattributed conversion than one credited to a campaign from
    // three months ago that had nothing to do with it.
    expect(conversion).toEqual(expect.objectContaining({ campaignId: null }));
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });

  it('takes the caller at their word when they name the campaign themselves', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue(null);

    await ingestConversion({ externalId: 'order-4', contactId: 'c1', campaignId: 'camp-2' });

    expect(prismaMock.waCampaignRecipient.findFirst).not.toHaveBeenCalled();
  });
});

describe('deleteConversion', () => {
  it('refuses an id that does not exist', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue(null);

    await expect(deleteConversion('nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'WA_CONVERSION_NOT_FOUND',
    });
    expect(prismaMock.waConversion.delete).not.toHaveBeenCalled();
  });

  it('gives the campaign its count back without letting it go negative', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue({ id: 'conv-1', campaignId: 'camp-1' });

    await deleteConversion('conv-1');

    expect(prismaMock.waConversion.delete).toHaveBeenCalledWith({ where: { id: 'conv-1' } });
    // The `gt: 0` guard is the whole point: a repeated correction must not drive
    // the campaign's converted count below zero.
    expect(prismaMock.waCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', convertedCount: { gt: 0 } },
      data: { convertedCount: { decrement: 1 } },
    });
  });

  it('touches no campaign for an unattributed conversion', async () => {
    prismaMock.waConversion.findUnique.mockResolvedValue({ id: 'conv-2', campaignId: null });

    await deleteConversion('conv-2');

    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });
});

describe('getConversionSummary', () => {
  function stubSummary(): void {
    prismaMock.waConversion.aggregate.mockResolvedValue({
      _count: { _all: 3 },
      _sum: { valuePaise: 500000 },
    });
    prismaMock.waConversion.groupBy.mockResolvedValue([
      { campaignId: 'camp-1', _count: { _all: 2 }, _sum: { valuePaise: 500000 } },
      { campaignId: 'camp-gone', _count: { _all: 1 }, _sum: { valuePaise: null } },
    ]);
    prismaMock.waCampaign.findMany.mockResolvedValue([
      { id: 'camp-1', name: 'Diwali blast', sentCount: 3 },
    ]);
  }

  it('scopes the window to when the sale happened, falling back to when we heard', async () => {
    stubSummary();

    await getConversionSummary(7);

    // `occurredAt` is what the caller reported; `createdAt` is when the postback
    // landed. Ignoring the range control here left a lifetime revenue total
    // sitting beside seven days of sends — a pairing that reads as a conversion
    // rate and is not one.
    const [args] = prismaMock.waConversion.aggregate.mock.calls[0];
    expect(args.where.OR).toEqual([
      { occurredAt: { gte: expect.any(Date) } },
      { occurredAt: null, createdAt: { gte: expect.any(Date) } },
    ]);
  });

  it('applies no date filter to a lifetime summary', async () => {
    stubSummary();

    await getConversionSummary();

    const [args] = prismaMock.waConversion.aggregate.mock.calls[0];
    expect(args.where).toEqual({});
  });

  it('names each campaign and states value per recipient reached', async () => {
    stubSummary();

    const summary = await getConversionSummary();

    expect(summary.count).toBe(3);
    expect(summary.totalValuePaise).toBe(500000);
    expect(summary.byCampaign).toEqual([
      {
        campaignId: 'camp-1',
        // A column of UUIDs answers "which campaign should I run again" for
        // nobody, which is why the leaderboard carries names.
        name: 'Diwali blast',
        count: 2,
        valuePaise: 500000,
        sent: 3,
        // 500000 / 3 rounded — what makes two campaigns of different sizes
        // comparable at all.
        valuePerRecipientPaise: 166667,
      },
      {
        campaignId: 'camp-gone',
        // The FK is SetNull, so this only happens when a delete lands between
        // the groupBy and the name lookup; the revenue row survives with a
        // placeholder rather than a blank cell.
        name: 'Deleted campaign',
        count: 1,
        valuePaise: 0,
        sent: 0,
        // No recipients means no per-recipient figure, not a division by zero.
        valuePerRecipientPaise: 0,
      },
    ]);
  });

  it('reports zero rather than null when nothing has converted', async () => {
    prismaMock.waConversion.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { valuePaise: null },
    });
    prismaMock.waConversion.groupBy.mockResolvedValue([]);

    const summary = await getConversionSummary();

    expect(summary).toEqual({ count: 0, totalValuePaise: 0, byCampaign: [] });
    // Nothing to look up, so the name query is skipped entirely.
    expect(prismaMock.waCampaign.findMany).not.toHaveBeenCalled();
  });
});
