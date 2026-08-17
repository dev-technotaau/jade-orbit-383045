/**
 * Tests for bulk contact import (src/services/whatsapp-contact.service.ts).
 *
 * The import used to be a `for` loop doing a findUnique and then a create or an
 * update per row — 10,000 sequential round trips for the 5000 rows the API
 * advertises, which is why it could not finish inside a request budget. It is
 * now chunked and batched, and batching is exactly the kind of rewrite that can
 * quietly change behaviour: a file naming the same number twice would collide on
 * the unique phone index instead of the second row updating the first, and a
 * customer who replied STOP must still not be re-subscribed by an operator
 * re-uploading their master list.
 *
 * Prisma is mocked; the chunking, deduplication and consent rules under test are
 * this module's own.
 */

const prismaMock = {
  waContact: {
    findMany: jest.fn(),
    createManyAndReturn: jest.fn(),
    update: jest.fn(),
  },
  waConsentEvent: { createMany: jest.fn() },
  // The import cross-checks each chunk against the do-not-contact list so a DNC
  // file loaded before the contacts it covers still lands on the new rows.
  waSuppression: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

jest.mock('../../config/env', () => ({ env: { DEFAULT_COUNTRY_CODE: '91' } }));

// The evidence blob is encrypted at rest; identity here keeps assertions about
// WHAT is recorded readable.
jest.mock('../../utils/encryption', () => ({
  encryptJson: (v: unknown) => v,
  decryptJson: (v: unknown) => v,
}));

// Pulled in by the erasure path, and ESM-only underneath.
jest.mock('../storage.service', () => ({ deleteFileFromR2: jest.fn() }));

import { importContacts } from '../whatsapp-contact.service';

/** `${prefix}${n}` numbers, distinct and already in E.164. */
function rows(count: number, prefix = '+9198765') {
  return Array.from({ length: count }, (_, i) => ({
    phone: `${prefix}${String(i).padStart(5, '0')}`,
    name: `Contact ${i}`,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waContact.findMany.mockResolvedValue([]);
  prismaMock.waContact.createManyAndReturn.mockImplementation(({ data }: { data: unknown[] }) =>
    Promise.resolve(data.map((_, i) => ({ id: `new-${i}` })))
  );
  prismaMock.waContact.update.mockImplementation((args: unknown) => args);
  prismaMock.waConsentEvent.createMany.mockImplementation((args: unknown) => args);
  prismaMock.waSuppression.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockResolvedValue([]);
});

describe('batching', () => {
  it('walks a large file in chunks instead of one round trip per row', async () => {
    const result = await importContacts(rows(500), false);

    // 500 rows / 200 per chunk = 3 lookups, not 500.
    expect(prismaMock.waContact.findMany).toHaveBeenCalledTimes(3);
    expect(prismaMock.waContact.createManyAndReturn).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ created: 500, updated: 0, skipped: 0, total: 500 });
  });

  it('reports progress after every chunk, so a long import is watchable', async () => {
    const seen: number[] = [];

    await importContacts(rows(450), false, false, (p) => {
      seen.push(p.processed);
    });

    expect(seen).toEqual([200, 400, 450]);
  });
});

describe('rows that cannot be imported as given', () => {
  it('drops rows with an unusable phone number', async () => {
    const result = await importContacts([{ phone: '123' }, { phone: '+919876500001' }], false);

    expect(result).toMatchObject({ skipped: 1, created: 1 });
  });

  it('merges a phone number repeated inside the same file rather than colliding', async () => {
    // Two rows, one contact: batched inserts would otherwise send both to
    // createMany and violate the unique index on phone.
    const result = await importContacts(
      [
        { phone: '+919876500001', name: 'Asha', tags: ['leads'] },
        { phone: '+919876500001', name: 'Asha Verma', tags: ['mumbai'] },
      ],
      false
    );

    expect(result).toMatchObject({ created: 1, updated: 0, duplicates: 1 });
    const { data } = prismaMock.waContact.createManyAndReturn.mock.calls[0][0];
    expect(data).toHaveLength(1);
    // Last non-empty name wins; tags union.
    expect(data[0]).toMatchObject({ name: 'Asha Verma', tags: ['leads', 'mumbai'] });
  });
});

describe('consent', () => {
  it('does not re-subscribe a contact who had explicitly opted out', async () => {
    prismaMock.waContact.findMany.mockResolvedValue([
      { id: 'c1', phone: '+919876500001', optInStatus: 'OPTED_OUT', tags: ['vip'] },
    ]);

    const result = await importContacts(
      [{ phone: '+919876500001', name: 'Asha', tags: ['leads'] }],
      true
    );

    expect(result).toMatchObject({ updated: 1, skippedOptedOut: 1 });
    const patch = prismaMock.waContact.update.mock.calls[0][0].data;
    // Name and tags refresh; every consent field is left exactly as it was.
    expect(patch).toEqual({ name: 'Asha', tags: { set: ['vip', 'leads'] } });
    expect(prismaMock.waConsentEvent.createMany).not.toHaveBeenCalled();
  });

  it('records one consent event per contact an opted-in import touches', async () => {
    prismaMock.waContact.findMany.mockResolvedValue([
      { id: 'existing-1', phone: '+919876500000', optInStatus: 'UNKNOWN', tags: [] },
    ]);

    await importContacts(rows(3), true);

    const { data } = prismaMock.waConsentEvent.createMany.mock.calls[0][0];
    expect(data).toHaveLength(3);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contactId: 'existing-1', type: 'OPT_IN', source: 'import' }),
      ])
    );
  });

  it('writes provenance even when the import does not assert consent', async () => {
    await importContacts([{ phone: '+919876500001' }], false);

    const { data } = prismaMock.waContact.createManyAndReturn.mock.calls[0][0];
    expect(data[0].consentEvidence).toMatchObject({ source: 'import', optIn: false });
    // Consent itself is untouched: no status, no date, no source.
    expect(data[0].optInStatus).toBeUndefined();
    expect(prismaMock.waConsentEvent.createMany).not.toHaveBeenCalled();
  });

  it('merges tags by default and replaces them only when asked', async () => {
    prismaMock.waContact.findMany.mockResolvedValue([
      { id: 'c1', phone: '+919876500001', optInStatus: 'OPTED_IN', tags: ['vip'] },
    ]);

    await importContacts([{ phone: '+919876500001', tags: ['leads'] }], false);
    expect(prismaMock.waContact.update.mock.calls[0][0].data.tags).toEqual({
      set: ['vip', 'leads'],
    });

    prismaMock.waContact.update.mockClear();
    await importContacts([{ phone: '+919876500001', tags: ['leads'] }], false, true);
    expect(prismaMock.waContact.update.mock.calls[0][0].data.tags).toEqual({ set: ['leads'] });
  });
});

describe('attributes', () => {
  it('stores the unmapped file columns on a new contact', async () => {
    await importContacts(
      [{ phone: '+919876500001', attributes: { city: 'Mumbai', plan: 'Gold' } }],
      false
    );

    const { data } = prismaMock.waContact.createManyAndReturn.mock.calls[0][0];
    expect(data[0].attributes).toEqual({ city: 'Mumbai', plan: 'Gold' });
  });

  it('merges attributes into an existing contact rather than replacing them', async () => {
    prismaMock.waContact.findMany.mockResolvedValue([
      {
        id: 'c1',
        phone: '+919876500001',
        optInStatus: 'OPTED_IN',
        tags: [],
        attributes: { city: 'Delhi', order_id: 'A-1' },
      },
    ]);

    await importContacts([{ phone: '+919876500001', attributes: { city: 'Mumbai' } }], false);

    // A "mumbai-leads" file carrying only a city column must not erase the order
    // number a previous import wrote — only the keys in THIS file move.
    expect(prismaMock.waContact.update.mock.calls[0][0].data.attributes).toEqual({
      city: 'Mumbai',
      order_id: 'A-1',
    });
  });

  it('unions attributes across duplicate rows for the same number', async () => {
    await importContacts(
      [
        { phone: '+919876500001', attributes: { city: 'Mumbai' } },
        { phone: '+919876500001', attributes: { order_id: 'A-1' } },
      ],
      false
    );

    const { data } = prismaMock.waContact.createManyAndReturn.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0].attributes).toEqual({ city: 'Mumbai', order_id: 'A-1' });
  });

  it('writes nothing when a row carries no attributes', async () => {
    await importContacts([{ phone: '+919876500001' }], false);

    const { data } = prismaMock.waContact.createManyAndReturn.mock.calls[0][0];
    expect(data[0].attributes).toBeUndefined();
  });
});
