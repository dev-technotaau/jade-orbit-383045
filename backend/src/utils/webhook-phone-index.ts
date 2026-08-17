/**
 * Extract the phone numbers named inside a stored webhook payload, so an erasure
 * can find a data subject's rows by an INDEXED key.
 *
 * Both webhook tables keep a verbatim JSON body: `WaWebhookEvent.payload` is
 * Meta's envelope, `WebhookDelivery.payload` is the body we sent a subscriber.
 * Neither carries the sender as a column, so a DPDP erasure matched them with
 * `payload::text LIKE '%digits%'` — a jsonb-to-text cast of every row of the
 * fastest-growing table, with a leading wildcard, under a 30s statement timeout.
 * On a populated table that does not merely run slowly: it times out, and the
 * erasure fails outright while the operator has already told the data subject
 * their data is gone.
 *
 * These run at INGEST, and what they produce lands in a GIN-indexed `phones`
 * column that the erasure then queries with array containment.
 */

/** Digits only, no '+' — the shape Meta uses and the shape we index on. */
function toDigits(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  // Shortest assignable national number in the E.164 plan is 7 digits after the
  // country code is stripped; anything shorter is an id, a count or a date part
  // that happened to sit under a phone-ish key.
  return digits.length >= 7 ? digits : null;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Every phone number named anywhere in a Meta webhook envelope.
 *
 * Walks ALL entries and ALL changes, not just `entry[0].changes[0]` — Meta
 * batches several senders into one POST, which is exactly the case the erasure
 * has to get right.
 *
 * Deliberately excludes `value.metadata.display_phone_number`: that is OUR
 * number, present on every event, and indexing it would make every row match a
 * business-number erasure.
 */
export function metaEnvelopePhones(parsed: unknown): string[] {
  const out = new Set<string>();
  const root = parsed as { entry?: unknown } | null | undefined;
  for (const entry of asArray(root?.entry)) {
    for (const change of asArray((entry as { changes?: unknown })?.changes)) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value || typeof value !== 'object') continue;
      for (const contact of asArray(value.contacts)) {
        const digits = toDigits((contact as { wa_id?: unknown })?.wa_id);
        if (digits) out.add(digits);
      }
      for (const message of asArray(value.messages)) {
        const digits = toDigits((message as { from?: unknown })?.from);
        if (digits) out.add(digits);
      }
      for (const status of asArray(value.statuses)) {
        const digits = toDigits((status as { recipient_id?: unknown })?.recipient_id);
        if (digits) out.add(digits);
      }
    }
  }
  return [...out];
}

/** Keys whose value is a phone number in one of our own webhook payloads. */
function isPhoneKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  return k.includes('phone') || k === 'waid' || k === 'msisdn' || k.includes('recipientid');
}

/** Depth and node budget — a subscriber payload is arbitrary JSON we did not author. */
const MAX_DEPTH = 8;
const MAX_NODES = 5000;

/**
 * Every phone number named in one of OUR outbound webhook bodies.
 *
 * Key-driven rather than shape-driven: `emitWaEvent` passes an arbitrary payload
 * per event name, so there is no fixed structure to walk. Anything under a
 * phone-ish key that reduces to at least 7 digits counts.
 */
export function payloadPhones(payload: unknown): string[] {
  const out = new Set<string>();
  let nodes = 0;

  const walk = (node: unknown, depth: number): void => {
    if (node == null || depth > MAX_DEPTH || nodes >= MAX_NODES) return;
    nodes += 1;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (isPhoneKey(key)) {
        const digits = toDigits(value);
        if (digits) out.add(digits);
      }
      if (value !== null && typeof value === 'object') walk(value, depth + 1);
    }
  };

  walk(payload, 0);
  return [...out];
}
