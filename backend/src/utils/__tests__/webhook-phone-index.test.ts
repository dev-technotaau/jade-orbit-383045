/**
 * Unit tests for the webhook erasure index (src/utils/webhook-phone-index.ts).
 *
 * Both functions are pure, so no config mocks are needed. They exist because a
 * DPDP erasure used to find a data subject's stored webhook payloads with
 * `payload::text LIKE '%digits%'` — a jsonb-to-text cast of every row of the
 * fastest-growing table in the schema, matched with a leading wildcard. On a
 * populated database that hits the 30s statement timeout and the erasure fails
 * outright, after the operator has already told the data subject their data is
 * gone. These extract an indexed key at ingest instead.
 */
import { metaEnvelopePhones, payloadPhones } from '../webhook-phone-index';

describe('metaEnvelopePhones', () => {
  it('collects wa_id, from and recipient_id across EVERY entry and change', () => {
    // Meta batches several senders into a single POST — the exact case the
    // erasure has to get right, and the case `entry[0].changes[0]` misses.
    const envelope = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '15550001111' },
                contacts: [{ wa_id: '919876543210' }],
                messages: [{ from: '919876543210' }, { from: '919812345678' }],
              },
            },
          ],
        },
        {
          changes: [{ value: { statuses: [{ recipient_id: '447700900123' }] } }],
        },
      ],
    };

    expect(metaEnvelopePhones(envelope).sort()).toEqual(
      ['447700900123', '919812345678', '919876543210'].sort()
    );
  });

  it('excludes our own business number from the metadata', () => {
    // display_phone_number is on every event. Indexing it would make every row
    // in the table match an erasure keyed on the business number.
    const envelope = {
      entry: [
        {
          changes: [{ value: { metadata: { display_phone_number: '15550001111' }, statuses: [] } }],
        },
      ],
    };

    expect(metaEnvelopePhones(envelope)).toEqual([]);
  });

  it('normalizes to digits and drops values too short to be a phone number', () => {
    const envelope = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '+91 98765-43210' }, { wa_id: '12345' }, { wa_id: null }],
              },
            },
          ],
        },
      ],
    };

    expect(metaEnvelopePhones(envelope)).toEqual(['919876543210']);
  });

  it('answers [] for a stub, a non-envelope or a malformed payload', () => {
    expect(metaEnvelopePhones({})).toEqual([]);
    expect(metaEnvelopePhones(null)).toEqual([]);
    expect(metaEnvelopePhones({ entry: 'not-an-array' })).toEqual([]);
    expect(metaEnvelopePhones({ entry: [{ changes: [{ value: 'nope' }] }] })).toEqual([]);
  });
});

describe('payloadPhones', () => {
  it('finds numbers under phone-ish keys at any depth, deduped', () => {
    // Our own outbound webhook bodies have no fixed shape — `emitWaEvent` passes
    // a different payload per event name — so the walk is key-driven.
    const body = {
      event: 'whatsapp.message.inbound',
      data: {
        phone: '+919876543210',
        contact: { waId: '919876543210', recipient_id: '447700900123' },
        items: [{ contactPhone: '919812345678' }],
      },
    };

    expect(payloadPhones(body).sort()).toEqual(
      ['447700900123', '919812345678', '919876543210'].sort()
    );
  });

  it('ignores values under keys that are not phone numbers', () => {
    const body = { data: { conversationId: '90000000000', count: 919876543210, name: 'Jane' } };

    expect(payloadPhones(body)).toEqual([]);
  });
});
