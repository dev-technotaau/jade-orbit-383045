/**
 * Tests for the suppression list (src/services/whatsapp-suppression.service.ts).
 *
 * This is the do-not-contact list: the one place in the product where being
 * wrong is a compliance failure rather than a bug. Two things are pinned here.
 * First, reading it is BOUNDED — one "select all matching → Suppress" on the
 * contacts page can push six figures of rows in, and the list used to be
 * returned whole, which made the settings page that renders it permanently
 * unusable. Second, a bulk-loaded list is normalized to the same E.164 identity
 * the send path checks against, or the numbers on it keep being messaged.
 *
 * Prisma is mocked; the paging, search and normalization under test are this
 * module's own.
 */

const prismaMock = {
  waSuppression: {
    findMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// The fail-open path counts itself; the real module pulls prom-client and the
// validated env in behind it, neither of which this suite needs.
jest.mock('../../utils/whatsapp-metrics', () => ({
  waSuppressionCheckFailuresTotal: { inc: jest.fn() },
}));

const markContactsSuppressedMock = jest.fn();
jest.mock('../whatsapp-contact.service', () => ({
  markContactsSuppressed: (...args: unknown[]) => markContactsSuppressedMock(...args),
  // Mirrors normalizeWaPhone: bare national numbers get the country code.
  normalizeWaPhone: (raw: string) => {
    const trimmed = String(raw ?? '').trim();
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return trimmed;
    if (trimmed.startsWith('+')) return `+${digits}`;
    return digits.length <= 10 ? `+91${digits.replace(/^0+/, '')}` : `+${digits}`;
  },
}));

import {
  streamSuppressionsForExport,
  importSuppressions,
  listSuppressions,
} from '../whatsapp-suppression.service';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waSuppression.findMany.mockResolvedValue([]);
  prismaMock.waSuppression.count.mockResolvedValue(0);
  prismaMock.waSuppression.createMany.mockResolvedValue({ count: 0 });
});

describe('listSuppressions', () => {
  it('reads one bounded page instead of the whole table', async () => {
    prismaMock.waSuppression.count.mockResolvedValue(120_000);

    const page = await listSuppressions({ page: 3, limit: 50 });

    expect(prismaMock.waSuppression.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 })
    );
    expect(page).toMatchObject({ total: 120_000, page: 3, limit: 50, totalPages: 2400 });
  });

  it('caps the page size a caller can ask for', async () => {
    await listSuppressions({ limit: 5000 });

    expect(prismaMock.waSuppression.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it('searches on the digits, not the literal string', async () => {
    // A compliance officer pastes "+91 98765 43210" or "098765 43210" out of a
    // DNC notice; neither is a substring of the stored "+919876543210".
    await listSuppressions({ q: '+91 98765 43210' });

    const { where } = prismaMock.waSuppression.findMany.mock.calls[0][0];
    expect(where.OR).toEqual(expect.arrayContaining([{ phone: { contains: '919876543210' } }]));
  });

  it('applies no filter at all when the search box is empty', async () => {
    await listSuppressions({ q: '   ' });

    expect(prismaMock.waSuppression.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('importSuppressions', () => {
  it('normalizes every number to the identity the send path checks', async () => {
    prismaMock.waSuppression.createMany.mockResolvedValue({ count: 2 });

    const result = await importSuppressions({
      phones: ['9876543210', '+91 98765 00001'],
      reason: 'DNC list',
      createdBy: 'operator',
    });

    expect(prismaMock.waSuppression.createMany).toHaveBeenCalledWith({
      data: [
        { phone: '+919876543210', reason: 'DNC list', createdBy: 'operator' },
        { phone: '+919876500001', reason: 'DNC list', createdBy: 'operator' },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ added: 2, duplicates: 0, skipped: 0 });
    // The contact rows are mirrored too, or the operator loads a DNC list and
    // everyone on it keeps reading as OPTED IN on the contacts page.
    expect(markContactsSuppressedMock).toHaveBeenCalledWith(
      ['+919876543210', '+919876500001'],
      true
    );
  });

  it('collapses a number repeated inside the supplied file', async () => {
    prismaMock.waSuppression.createMany.mockResolvedValue({ count: 1 });

    await importSuppressions({ phones: ['9876543210', '+919876543210'] });

    expect(prismaMock.waSuppression.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('reports numbers already on the list as duplicates, not failures', async () => {
    // `skipDuplicates` means re-uploading the same DNC file is a no-op rather
    // than a P2002 the operator has to interpret.
    prismaMock.waSuppression.createMany.mockResolvedValue({ count: 1 });

    const result = await importSuppressions({ phones: ['9876543210', '9876500001'] });

    expect(result).toEqual({ added: 1, duplicates: 1, skipped: 0 });
  });

  it('skips a value too short to be a phone number', async () => {
    const result = await importSuppressions({ phones: ['12', '  ', '9876543210'] });

    expect(prismaMock.waSuppression.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it('writes nothing when the file had no usable number', async () => {
    const result = await importSuppressions({ phones: ['12'] });

    expect(prismaMock.waSuppression.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 0, duplicates: 0, skipped: 1 });
  });
});

describe('streamSuppressionsForExport', () => {
  it('shares the list filter', async () => {
    prismaMock.waSuppression.findMany.mockResolvedValueOnce([]);

    // A generator does nothing until it is pulled; one page is all this needs.
    await streamSuppressionsForExport({ q: 'spam' }).next();

    const { where } = prismaMock.waSuppression.findMany.mock.calls[0][0];
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([{ reason: { contains: 'spam', mode: 'insensitive' } }])
    );
  });

  /**
   * The cap this replaced (`take: 50_000`) truncated a large do-not-contact list
   * with no error and no marker, so the auditor holding the file believed the
   * numbers past it were fair game. Paging has to KEEP GOING past one page, and
   * has to carry the last phone forward or it would re-read page one forever.
   */
  it('pages until a short page and keyset-advances on phone', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) => ({
      phone: `+9199999999${i}`,
      reason: null,
      createdAt: new Date(),
    }));
    prismaMock.waSuppression.findMany
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([{ phone: '+919999999999', reason: null, createdAt: new Date() }]);

    const seen: string[] = [];
    for await (const page of streamSuppressionsForExport({}, 2)) {
      seen.push(...page.map((r) => r.phone));
    }

    expect(seen).toHaveLength(3);
    expect(prismaMock.waSuppression.findMany).toHaveBeenCalledTimes(2);
    const second = prismaMock.waSuppression.findMany.mock.calls[1][0];
    expect(second.where.AND).toContainEqual({ phone: { gt: page1[1].phone } });
    expect(second.orderBy).toEqual({ phone: 'asc' });
  });
});
