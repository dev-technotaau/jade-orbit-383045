/**
 * Integration-style tests for the WhatsApp inbound-worker lifecycle
 * (src/jobs/whatsapp-inbound.worker.ts).
 *
 * Drives the worker's per-event unit of work directly via the additive
 * `processInboundEvent(eventRowId)` export (the same function the BullMQ job
 * runs) so we exercise the real control flow — load WaWebhookEvent → process
 * value.messages / value.statuses → persist + dedup + forward-only status
 * state-machine → stamp `processedAt` — without standing up BullMQ or Redis.
 *
 * All heavy deps (config/*, the WhatsApp service tree, queues, metrics, trace
 * propagation, real-time emit) are mocked so importing the worker doesn't
 * trigger env validation / Prisma / a live Redis connection, and so each
 * collaborator is a `jest.fn()` we can assert on.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── config/* stubs ──────────────────────────────────────────────────────────
jest.mock('../../config/env', () => ({
  env: {
    BULLMQ_WHATSAPP_CONCURRENCY: '1',
    WHATSAPP_OPT_OUT_KEYWORDS: 'STOP,UNSUBSCRIBE,CANCEL',
  },
}));

// Prisma stub — every method the worker touches is a jest.fn() we can assert on.
const prismaMock = {
  waWebhookEvent: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  waMessage: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(1),
  },
  waContact: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn(),
  },
  waConversation: {
    upsert: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  waCampaignRecipient: {
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  waCampaign: {
    update: jest.fn().mockResolvedValue({}),
  },
  // Interactive transaction. The inbound path writes the message row and the
  // conversation touch it drives as one unit, so the callback is armed in
  // beforeEach to run against this same mock client.
  $transaction: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

// Redis stub. `get` is the short-circuit dedup read (null = not seen yet) and
// `set` is the post-persist mark; the durable dedup is WaMessage.wamid @unique.
const redisMock = { get: jest.fn(), set: jest.fn() };
jest.mock('../../config/redis', () => ({ redis: redisMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── util stubs ──────────────────────────────────────────────────────────────
jest.mock('../../utils/whatsapp-realtime', () => ({ emitWa: jest.fn() }));

jest.mock('../../utils/whatsapp-metrics', () => {
  const counter = () => ({ inc: jest.fn() });
  return {
    waMessagesTotal: counter(),
    captureWaException: jest.fn(),
  };
});

// ── queue stubs ─────────────────────────────────────────────────────────────
// Mock the inbound queue module so importing the worker doesn't build a real
// BullMQ Queue (the worker imports WHATSAPP_INBOUND_QUEUE_NAME from it).
jest.mock('../whatsapp-inbound.queue', () => ({
  WHATSAPP_INBOUND_QUEUE_NAME: 'whatsapp-inbound-queue',
  addWhatsappInboundJob: jest.fn(),
}));

const addWhatsappMediaJobMock = jest.fn();
jest.mock('../whatsapp-media.queue', () => ({
  WHATSAPP_MEDIA_QUEUE_NAME: 'whatsapp-media-queue',
  addWhatsappMediaJob: addWhatsappMediaJobMock,
}));

const addWhatsappAutoReplyJobMock = jest.fn();
jest.mock('../whatsapp-autoreply.queue', () => ({
  WHATSAPP_AUTOREPLY_QUEUE_NAME: 'whatsapp-autoreply-queue',
  addWhatsappAutoReplyJob: addWhatsappAutoReplyJobMock,
}));

// ── service stubs ───────────────────────────────────────────────────────────
const getOrCreateChannelMock = jest.fn();
const getDefaultChannelMock = jest.fn();
jest.mock('../../services/whatsapp-channel.service', () => ({
  getOrCreateChannel: getOrCreateChannelMock,
  getDefaultChannel: getDefaultChannelMock,
}));

jest.mock('../../services/whatsapp-template.service', () => ({
  getTemplateByName: jest.fn().mockResolvedValue(null),
  // The worker now shares the sync's status map instead of keeping its own, so
  // the mock has to carry it too.
  mapTemplateStatus: jest.fn((raw?: string | null) => {
    const up = String(raw ?? '').toUpperCase();
    if (up === 'FLAGGED') return 'PAUSED';
    if (up === 'PENDING_DELETION') return 'DISABLED';
    return ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'].includes(
      up
    )
      ? up
      : null;
  }),
  // Pure decoder, mocked with its real behaviour: an nfm_reply's flow_token is
  // what ties a Flow submission back to the Flow it was launched from, so a stub
  // returning undefined would silently assert the wrong thing.
  metaFlowIdFromToken: jest.fn((token?: string | null) => {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 3 || parts[0] !== 'watpl1') return null;
    return parts[1] || null;
  }),
}));

const upsertContactByPhoneMock = jest.fn();
const normalizeWaPhoneMock = jest.fn();
const isOptOutMessageMock = jest.fn();
// The worker uses the async variant so operator-configured WaSettings keywords
// are honoured; keep both mocked from the same fn so tests set one value.
const isOptOutMessageAsyncMock = jest.fn();
const isOptInMessageAsyncMock = jest.fn().mockResolvedValue(false);
const optOutContactMock = jest.fn();
jest.mock('../../services/whatsapp-contact.service', () => ({
  upsertContactByPhone: upsertContactByPhoneMock,
  normalizeWaPhone: normalizeWaPhoneMock,
  isOptOutMessage: isOptOutMessageMock,
  isOptOutMessageAsync: isOptOutMessageAsyncMock,
  isOptInMessageAsync: isOptInMessageAsyncMock,
  optOutContact: optOutContactMock,
}));

const getOrCreateConversationMock = jest.fn();
const applyMessageTouchMock = jest.fn();
const touchOnMessageMock = jest.fn();
jest.mock('../../services/whatsapp-conversation.service', () => ({
  getOrCreateConversation: getOrCreateConversationMock,
  applyMessageTouch: applyMessageTouchMock,
  touchOnMessage: touchOnMessageMock,
}));

const reconcileRecipientStatusesMock = jest.fn();
jest.mock('../../services/whatsapp-campaign.service', () => ({
  reconcileRecipientStatuses: reconcileRecipientStatusesMock,
}));

const emitWaEventMock = jest.fn();
jest.mock('../../services/whatsapp-events.service', () => ({
  emitWaEvent: emitWaEventMock,
}));

// The opt-out acknowledgement: a STOP is answered with one short line before the
// auto-reply engine is short-circuited, so the customer knows it registered.
const sendOptOutConfirmationMock = jest.fn();
jest.mock('../../services/whatsapp-send.service', () => ({
  sendOptOutConfirmation: sendOptOutConfirmationMock,
}));
const getWaSettingsMock = jest.fn(async () => ({ optOutConfirmationMessage: null }));
jest.mock('../../services/whatsapp-settings.service', () => ({
  getWaSettings: getWaSettingsMock,
}));
// Whether there is a bucket to archive inbound media into decides the archive
// state stamped on the row (PENDING vs SKIPPED).
jest.mock('../../services/storage.service', () => ({ isR2Configured: () => true }));

// @prisma/client is imported by the worker for `Prisma.PrismaClientKnownRequestError`
// and the WaMessageType/Status enums (the latter are erased type-only imports).
// Provide a minimal shape so the duplicate-P2002 instanceof check is meaningful.
jest.mock('@prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

import { processInboundEvent } from '../whatsapp-inbound.worker';

// ── fixtures ────────────────────────────────────────────────────────────────
const CHANNEL = { id: 'chan1', qualityRating: 'GREEN', messagingTier: 'TIER_1K' };
const CONTACT = {
  id: 'contact1',
  phone: '+15551230000',
  attributes: null,
};
const CONVERSATION = { id: 'conv1' };

const PHONE_ID = 'phone-123';
const FROM = '15551230000';

/** Build a WaWebhookEvent row whose payload carries one change `value`. */
function eventWithValue(value: any, overrides: Record<string, any> = {}) {
  return {
    id: 'evt1',
    eventType: 'message',
    processedAt: null,
    payload: { entry: [{ changes: [{ field: 'messages', value }] }] },
    ...overrides,
  };
}

function textMessageValue(wamid: string, body = 'hello there') {
  return {
    metadata: { phone_number_id: PHONE_ID },
    contacts: [{ wa_id: FROM, profile: { name: 'Jane' } }],
    messages: [
      {
        id: wamid,
        from: FROM,
        type: 'text',
        timestamp: '1700000000',
        text: { body },
      },
    ],
  };
}

function imageMessageValue(wamid: string) {
  return {
    metadata: { phone_number_id: PHONE_ID },
    contacts: [{ wa_id: FROM, profile: { name: 'Jane' } }],
    messages: [
      {
        id: wamid,
        from: FROM,
        type: 'image',
        timestamp: '1700000000',
        image: { id: 'media-abc', mime_type: 'image/jpeg', caption: 'look' },
      },
    ],
  };
}

/** A cart submitted from the catalog — Meta's `order` message type. */
function orderMessageValue(wamid: string) {
  return {
    metadata: { phone_number_id: PHONE_ID },
    contacts: [{ wa_id: FROM, profile: { name: 'Jane' } }],
    messages: [
      {
        id: wamid,
        from: FROM,
        type: 'order',
        timestamp: '1700000000',
        order: {
          catalog_id: 'cat_1',
          text: 'deliver after 6pm',
          product_items: [
            { product_retailer_id: 'SKU-1', quantity: 2, item_price: 150.5, currency: 'INR' },
            { product_retailer_id: 'SKU-2', quantity: 1, item_price: 99, currency: 'INR' },
          ],
        },
      },
    ],
  };
}

function statusValue(wamid: string, status: string, timestamp = '1700000100', opaqueId?: string) {
  return {
    metadata: { phone_number_id: PHONE_ID },
    statuses: [
      {
        id: wamid,
        status,
        timestamp,
        recipient_id: FROM,
        ...(opaqueId ? { biz_opaque_callback_data: opaqueId } : {}),
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Sensible default resolved values (cleared above, so re-arm each test).
  prismaMock.waWebhookEvent.update.mockResolvedValue({});
  prismaMock.waMessage.update.mockResolvedValue({});
  prismaMock.waMessage.count.mockResolvedValue(1);
  prismaMock.waContact.update.mockResolvedValue({});
  prismaMock.waContact.findUnique.mockResolvedValue(null); // brand-new contact
  prismaMock.waConversation.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.waCampaignRecipient.findFirst.mockResolvedValue(null);
  // Run the interactive-transaction callback against the same mock client, so a
  // write inside it lands on the very mocks these tests assert on.
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));

  getOrCreateChannelMock.mockResolvedValue(CHANNEL);
  getDefaultChannelMock.mockResolvedValue(CHANNEL);
  upsertContactByPhoneMock.mockResolvedValue(CONTACT);
  getOrCreateConversationMock.mockResolvedValue(CONVERSATION);
  normalizeWaPhoneMock.mockImplementation((p: string) => `+${String(p).replace(/\D/g, '')}`);
  isOptOutMessageMock.mockReturnValue(false);
  isOptOutMessageAsyncMock.mockResolvedValue(false);
  optOutContactMock.mockResolvedValue(undefined);
  applyMessageTouchMock.mockResolvedValue({ ...CONVERSATION, unreadCount: 1 });
  touchOnMessageMock.mockResolvedValue(undefined);
  reconcileRecipientStatusesMock.mockResolvedValue([]); // no missing recipient rows
  emitWaEventMock.mockResolvedValue(undefined);
  addWhatsappMediaJobMock.mockResolvedValue(undefined);
  addWhatsappAutoReplyJobMock.mockResolvedValue(undefined);

  // Redis dedup: nothing seen by default.
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
  // No existing message by default (so create() runs).
  prismaMock.waMessage.findUnique.mockResolvedValue(null);
  // No status batch by default; the status tests arm this with their rows.
  prismaMock.waMessage.findMany.mockResolvedValue([]);
  prismaMock.waMessage.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.waMessage.create.mockImplementation((args: any) =>
    Promise.resolve({ id: 'msg1', conversationId: CONVERSATION.id, ...args.data })
  );
});

describe('processInboundEvent — event lifecycle', () => {
  it('returns {processed:false} when the event row is missing', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(null);

    const res = await processInboundEvent('missing');

    expect(res).toEqual({ processed: false });
    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('short-circuits an already-processed event (idempotent)', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.DUP_EVENT'), { processedAt: new Date() })
    );

    const res = await processInboundEvent('evt1');

    expect(res).toEqual({ processed: true, duplicate: true });
    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });
});

describe('processInboundEvent — inbound messages', () => {
  it('persists a WaMessage and marks the event processed', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    const res = await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
    const created = prismaMock.waMessage.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      wamid: 'wamid.MSG1',
      channelId: 'chan1',
      conversationId: 'conv1',
      contactId: 'contact1',
      direction: 'INBOUND',
      type: 'TEXT',
      status: 'DELIVERED',
      text: 'hello there',
    });

    // Event flagged processed.
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.waWebhookEvent.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'evt1' },
      data: { processedAt: expect.any(Date) },
    });
    expect(res).toMatchObject({ processed: true });
  });

  it('routes a messages batch with no metadata.phone_number_id to the DEFAULT channel', async () => {
    // Regression guard. The batch used to be dropped outright on a missing
    // `metadata.phone_number_id` — no row, no log — while the event was still
    // stamped processed, so the recovery pass never revisited it and the
    // customer's message was gone for good. This install is single-number, so
    // the default channel is the correct destination.
    const value = textMessageValue('wamid.MSG1');
    delete (value as any).metadata;
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(eventWithValue(value));

    const res = await processInboundEvent('evt1');

    expect(getOrCreateChannelMock).not.toHaveBeenCalled();
    expect(getDefaultChannelMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.create.mock.calls[0][0].data).toMatchObject({
      wamid: 'wamid.MSG1',
      channelId: 'chan1',
      direction: 'INBOUND',
    });
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ processed: true });
    expect(res).not.toMatchObject({ deferred: true });
  });

  it('DEFERS a messages batch when no channel can be resolved at all', async () => {
    // Nothing configured yet (fresh install, webhook already pointed at us).
    // Dropping here is unrecoverable; leaving the event unprocessed lets
    // handleWaEventRecovery replay it once a channel exists, and its
    // `deferAttempts` ceiling keeps the replay bounded.
    getDefaultChannelMock.mockResolvedValue(null);
    const value = textMessageValue('wamid.MSG1');
    delete (value as any).metadata;
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(eventWithValue(value));

    const res = await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ deferred: true });
    // Crucially NOT stamped processed.
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('does NOT create a second WaMessage when Redis reports the wamid already seen', async () => {
    // Redis short-circuit: the key exists (set by whoever persisted the row).
    redisMock.get.mockResolvedValue('1');
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    // Event still gets marked processed (the job completed).
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a second WaMessage when the DB dedup finds an existing row', async () => {
    // Redis has no key (e.g. TTL expired, or Redis was flushed), but the durable
    // WaMessage.wamid @unique backstop hits. The DB is checked FIRST, so this
    // holds even if Redis is entirely unavailable.
    redisMock.get.mockResolvedValue(null);
    prismaMock.waMessage.findUnique.mockResolvedValue({ id: 'existing-msg' });
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('marks the wamid seen in Redis only AFTER the message row is persisted', async () => {
    // Regression guard. The mark used to be written up front, before the row
    // existed, so any failure in between (contact upsert, conversation upsert, a
    // pool timeout) left the wamid marked seen with no row — and the queue retry
    // then skipped it forever. Order matters: create() must resolve first.
    const order: string[] = [];
    prismaMock.waMessage.create.mockImplementation((args: any) => {
      order.push('create');
      return Promise.resolve({ id: 'msg1', conversationId: CONVERSATION.id, ...args.data });
    });
    redisMock.set.mockImplementation(() => {
      order.push('mark');
      return Promise.resolve('OK');
    });
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(order).toEqual(['create', 'mark']);
    expect(redisMock.set).toHaveBeenCalledWith('wa:seen:wamid.MSG1', '1', 'EX', 259200, 'NX');
  });

  it('does NOT mark the wamid seen when persisting the message throws', async () => {
    // The whole point of the reordering: a transient DB failure must leave the
    // wamid unmarked so the BullMQ retry can actually reprocess it.
    prismaMock.waMessage.create.mockRejectedValue(new Error('pool timeout'));
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await expect(processInboundEvent('evt1')).rejects.toThrow('pool timeout');

    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('writes the message row and the conversation touch in ONE transaction', async () => {
    // Regression guard. They used to be two independent statements, so a crash or
    // a pool timeout between them stored the customer's message against a thread
    // that still advertised the previous one as its latest — wrong position and
    // preview in the inbox — and a missed windowExpiresAt understated the 24h
    // window, which rejects the agent's next free-form reply as WA_WINDOW_CLOSED.
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Enlisted on the TRANSACTION client, not the global one: the unread recount
    // inside the touch has to see the row created alongside it, which from the
    // global client is still uncommitted.
    expect(applyMessageTouchMock).toHaveBeenCalledWith(prismaMock, CONVERSATION.id, {
      preview: 'hello there',
      at: new Date(1700000000 * 1000),
      inbound: true,
    });
  });

  it('does NOT mark the wamid seen when the conversation touch fails', async () => {
    // The touch shares the message row's transaction, so its failure rolls the row
    // back as well — which means the wamid must stay unmarked for the BullMQ retry.
    applyMessageTouchMock.mockRejectedValue(new Error('pool timeout'));
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await expect(processInboundEvent('evt1')).rejects.toThrow('pool timeout');

    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('still processes the message when Redis is down (DB dedup is authoritative)', async () => {
    redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
  });

  it('enqueues the auto-reply keyed on the inbound wamid', async () => {
    // The engine used to run inline as `handleInboundAutoReply(...).catch(() => {})`,
    // so a Meta 500 or a pool timeout lost the customer's reply with nothing to
    // retry it. It is a job now, and the wamid rides along as its id.
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(addWhatsappAutoReplyJobMock).toHaveBeenCalledTimes(1);
    expect(addWhatsappAutoReplyJobMock).toHaveBeenCalledWith({
      wamid: 'wamid.MSG1',
      conversationId: CONVERSATION.id,
      contactId: CONTACT.id,
      channelId: CHANNEL.id,
      text: 'hello there',
      buttonId: null,
      buttonTitle: null,
      isNewConversation: true,
    });
  });

  it('does NOT enqueue an auto-reply for a message that opts the contact out', async () => {
    // Auto-messaging someone the moment they ask you to stop is the one thing
    // this branch exists to prevent.
    isOptOutMessageAsyncMock.mockResolvedValue(true);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1', 'STOP'))
    );

    await processInboundEvent('evt1');

    expect(addWhatsappAutoReplyJobMock).not.toHaveBeenCalled();
  });

  it('a text message does NOT enqueue a media job', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(addWhatsappMediaJobMock).not.toHaveBeenCalled();
  });

  it('an image message DOES enqueue a media job with the media id + mime', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(imageMessageValue('wamid.IMG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.create.mock.calls[0][0].data).toMatchObject({
      type: 'IMAGE',
      mediaId: 'media-abc',
      mediaMime: 'image/jpeg',
    });
    expect(addWhatsappMediaJobMock).toHaveBeenCalledTimes(1);
    expect(addWhatsappMediaJobMock).toHaveBeenCalledWith({
      messageId: 'msg1',
      mediaId: 'media-abc',
      mime: 'image/jpeg',
    });
  });

  // Commerce. An `order` had no WaMessageType of its own, so every cart a
  // customer submitted was persisted as UNSUPPORTED with its line items dropped
  // into the generic payload branch — an empty bubble where somebody was trying
  // to buy something.
  it('persists a catalog order as ORDER with normalised line items and a readable summary', async () => {
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(orderMessageValue('wamid.ORDER1'))
    );

    await processInboundEvent('evt1');

    const data = prismaMock.waMessage.create.mock.calls[0][0].data;
    expect(data.type).toBe('ORDER');
    expect(data.payload).toEqual({
      catalogId: 'cat_1',
      products: [
        { productRetailerId: 'SKU-1', quantity: 2, itemPrice: 150.5, currency: 'INR' },
        { productRetailerId: 'SKU-2', quantity: 1, itemPrice: 99, currency: 'INR' },
      ],
      totalQuantity: 3,
      totalPrice: 400,
      currency: 'INR',
      note: 'deliver after 6pm',
    });
    // The conversation preview and the message search both read `text`, so it
    // has to say something rather than being null.
    expect(data.text).toBe('[order] 3 items · INR 400.00 — deliver after 6pm');
  });
});

describe('processInboundEvent — forward-only status state machine', () => {
  it('advances a message to DELIVERED for a forward status', async () => {
    // Existing message currently at SENT (rank 1); DELIVERED is rank 2 → advance.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
      },
    ]);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    await processInboundEvent('evt1');

    // The whole batch is resolved with one read, and only the columns the state
    // machine needs (never the `payload` jsonb).
    expect(prismaMock.waMessage.findMany).toHaveBeenCalledTimes(1);
    const read = prismaMock.waMessage.findMany.mock.calls[0][0];
    expect(read.where).toEqual({ wamid: { in: ['wamid.OUT1'] } });
    expect(read.select).toEqual({
      id: true,
      wamid: true,
      status: true,
      conversationId: true,
      contactId: true,
      campaignId: true,
      createdAt: true,
    });

    expect(prismaMock.waMessage.updateMany).toHaveBeenCalledTimes(1);
    const upd = prismaMock.waMessage.updateMany.mock.calls[0][0];
    // Addressed by primary key, not by WAMID: a status can now be matched
    // through `biz_opaque_callback_data` before the send has written the WAMID,
    // and such a row has no WAMID to be addressed by at all.
    expect(upd.where).toEqual({ id: { in: ['msg1'] } });
    expect(upd.data).toMatchObject({ status: 'DELIVERED', deliveredAt: expect.any(Date) });
    // The Meta error code now rides along so campaign recipients can tell a
    // permanent rejection from a transient one; null on a non-failure status.
    expect(reconcileRecipientStatusesMock).toHaveBeenCalledWith([
      { wamid: 'wamid.OUT1', status: 'DELIVERED', errorCode: null },
    ]);
  });

  it('ignores a stale/backward status (READ → DELIVERED is not regressed)', async () => {
    // Message already READ (rank 3); an incoming DELIVERED (rank 2) must be dropped.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'READ',
        conversationId: 'conv1',
        contactId: 'contact1',
      },
    ]);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.updateMany).not.toHaveBeenCalled();
    // The RECIPIENT is still told about it. Its own forward-only check drops the
    // stale value, and reporting it is what makes a replayed event able to
    // settle a recipient whose wamid landed after the first pass — gating this
    // on the message advancing made every replay a no-op for recipients.
    expect(reconcileRecipientStatusesMock).toHaveBeenCalledWith([
      { wamid: 'wamid.OUT1', status: 'DELIVERED', errorCode: null },
    ]);
    // The event itself is still marked processed.
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('DEFERS a campaign status whose recipient row has no wamid yet', async () => {
    // The second half of the same race. dispatchOutbound stamps the wamid on the
    // WaMessage; the campaign worker copies it onto the recipient only after the
    // send call returns. A `delivered` callback that lands in between used to be
    // dropped silently, so the recipient stayed SENT and the campaign's delivered
    // count was permanently short by everyone who fell in that window.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
        campaignId: 'camp1',
        createdAt: new Date(),
      },
    ]);
    reconcileRecipientStatusesMock.mockResolvedValue(['wamid.OUT1']);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    const res = await processInboundEvent('evt1');

    // The MESSAGE is settled either way — only the recipient needs the replay.
    expect(prismaMock.waMessage.updateMany).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ deferred: true });
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('DEFERS a campaign status matched by its opaque token whose recipient row has no wamid yet', async () => {
    // The widest form of the same race, and the one the deferral above used to
    // miss. A status that arrives before dispatchOutbound has written the WAMID
    // is placed by `biz_opaque_callback_data`, so the message is NOT in the
    // wamid-keyed batch map — and that is precisely when the recipient row is
    // still wamid-less too, since it is written later than the message's. Reading
    // the map again for the deferral check found nothing and dropped the status,
    // leaving the recipient SENT and the campaign's delivered count short.
    prismaMock.waMessage.findMany
      // By wamid: nothing yet, the send has not stamped it.
      .mockResolvedValueOnce([])
      // By opaque token: the row, still wamid-less.
      .mockResolvedValueOnce([
        {
          id: 'msg1',
          wamid: null,
          status: 'SENT',
          conversationId: 'conv1',
          contactId: 'contact1',
          campaignId: 'camp1',
          createdAt: new Date(),
        },
      ]);
    reconcileRecipientStatusesMock.mockResolvedValue(['wamid.OUT1']);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered', '1700000100', 'msg1'), {
        eventType: 'status',
      })
    );

    const res = await processInboundEvent('evt1');

    // The message itself is settled (and its wamid stamped) either way.
    expect(reconcileRecipientStatusesMock).toHaveBeenCalledWith([
      { wamid: 'wamid.OUT1', status: 'DELIVERED', errorCode: null },
    ]);
    expect(res).toMatchObject({ deferred: true });
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('does NOT defer when the message with no recipient row is not a campaign send', async () => {
    // An ordinary reply has no recipient row by design. Deferring on it would
    // hold every inbox status event open until the recovery pass gave up.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
        campaignId: null,
        createdAt: new Date(),
      },
    ]);
    reconcileRecipientStatusesMock.mockResolvedValue(['wamid.OUT1']);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    const res = await processInboundEvent('evt1');

    expect(res).not.toMatchObject({ deferred: true });
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('stops deferring once the send is too old for the wamid to still be landing', async () => {
    // A recipient rolled back to PENDING has its wamid cleared for good, so this
    // status will never match one. Replaying it forever would spend the event's
    // whole recovery budget and squat at the front of the recovery queue.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
        campaignId: 'camp1',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ]);
    reconcileRecipientStatusesMock.mockResolvedValue(['wamid.OUT1']);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    const res = await processInboundEvent('evt1');

    expect(res).not.toMatchObject({ deferred: true });
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('DEFERS a status whose wamid has no matching message row yet', async () => {
    // Not a drop — a race. The send path writes the WAMID after the Graph POST
    // returns, and Meta's `sent` callback regularly beats it. Leaving the event
    // unprocessed is what lets the recovery pass replay it two minutes later;
    // marking it processed (the old behaviour) lost the status permanently and
    // the message showed as "sent" forever despite being delivered and read.
    prismaMock.waMessage.findMany.mockResolvedValue([]);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.UNKNOWN', 'delivered'), { eventType: 'status' })
    );

    const res = await processInboundEvent('evt1');

    expect(prismaMock.waMessage.updateMany).not.toHaveBeenCalled();
    expect(res).toMatchObject({ deferred: true });
    // Crucially NOT stamped processed, so handleWaEventRecovery re-enqueues it.
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('settles a whole status batch with one read and one write per distinct patch', async () => {
    // Meta packs every callback it holds into a single POST. Three identical
    // `delivered` rows must cost one findMany + one updateMany, not 3 × (read +
    // write + recipient reconcile) — that N+1 is what put delivery ticks hours
    // behind a large send.
    prismaMock.waMessage.findMany.mockResolvedValue(
      ['wamid.A', 'wamid.B', 'wamid.C'].map((wamid, i) => ({
        id: `msg${i}`,
        wamid,
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
      }))
    );
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(
        {
          metadata: { phone_number_id: PHONE_ID },
          statuses: ['wamid.A', 'wamid.B', 'wamid.C'].map((id) => ({
            id,
            status: 'delivered',
            timestamp: '1700000100',
            recipient_id: FROM,
          })),
        },
        { eventType: 'status' }
      )
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.findMany.mock.calls[0][0].where).toEqual({
      wamid: { in: ['wamid.A', 'wamid.B', 'wamid.C'] },
    });
    expect(prismaMock.waMessage.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ['msg0', 'msg1', 'msg2'] },
    });
    expect(reconcileRecipientStatusesMock).toHaveBeenCalledTimes(1);
    expect(reconcileRecipientStatusesMock.mock.calls[0][0]).toHaveLength(3);
  });

  it('merges delivered+read for the same message arriving in one batch', async () => {
    // Both timestamps still have to land: the row-at-a-time loop got this for
    // free by re-reading between writes, so the batched path ranks against what
    // it has already accepted rather than only against the persisted status.
    prismaMock.waMessage.findMany.mockResolvedValue([
      {
        id: 'msg1',
        wamid: 'wamid.OUT1',
        status: 'SENT',
        conversationId: 'conv1',
        contactId: 'contact1',
      },
    ]);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(
        {
          metadata: { phone_number_id: PHONE_ID },
          statuses: [
            { id: 'wamid.OUT1', status: 'delivered', timestamp: '1700000100' },
            { id: 'wamid.OUT1', status: 'read', timestamp: '1700000160' },
          ],
        },
        { eventType: 'status' }
      )
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.updateMany).toHaveBeenCalledTimes(1);
    const upd = prismaMock.waMessage.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: { in: ['msg1'] } });
    expect(upd.data).toEqual({
      status: 'READ',
      deliveredAt: new Date(1700000100 * 1000),
      readAt: new Date(1700000160 * 1000),
    });
    // Both transitions are still reported to the campaign reconciler, which
    // collapses them to the furthest-along status itself.
    expect(reconcileRecipientStatusesMock).toHaveBeenCalledWith([
      { wamid: 'wamid.OUT1', status: 'DELIVERED', errorCode: null },
      { wamid: 'wamid.OUT1', status: 'READ', errorCode: null },
    ]);
  });
});
