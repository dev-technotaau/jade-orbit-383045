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
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
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

// ── service stubs ───────────────────────────────────────────────────────────
const getOrCreateChannelMock = jest.fn();
jest.mock('../../services/whatsapp-channel.service', () => ({
  getOrCreateChannel: getOrCreateChannelMock,
}));

jest.mock('../../services/whatsapp-template.service', () => ({
  getTemplateByName: jest.fn().mockResolvedValue(null),
}));

const upsertContactByPhoneMock = jest.fn();
const normalizeWaPhoneMock = jest.fn();
const isOptOutMessageMock = jest.fn();
// The worker uses the async variant so operator-configured WaSettings keywords
// are honoured; keep both mocked from the same fn so tests set one value.
const isOptOutMessageAsyncMock = jest.fn();
const optOutContactMock = jest.fn();
jest.mock('../../services/whatsapp-contact.service', () => ({
  upsertContactByPhone: upsertContactByPhoneMock,
  normalizeWaPhone: normalizeWaPhoneMock,
  isOptOutMessage: isOptOutMessageMock,
  isOptOutMessageAsync: isOptOutMessageAsyncMock,
  optOutContact: optOutContactMock,
}));

const getOrCreateConversationMock = jest.fn();
const touchOnMessageMock = jest.fn();
jest.mock('../../services/whatsapp-conversation.service', () => ({
  getOrCreateConversation: getOrCreateConversationMock,
  touchOnMessage: touchOnMessageMock,
}));

const reconcileRecipientStatusMock = jest.fn();
jest.mock('../../services/whatsapp-campaign.service', () => ({
  reconcileRecipientStatus: reconcileRecipientStatusMock,
}));

const handleInboundAutoReplyMock = jest.fn();
jest.mock('../../services/whatsapp-autoreply.service', () => ({
  handleInboundAutoReply: handleInboundAutoReplyMock,
}));

const emitWaEventMock = jest.fn();
jest.mock('../../services/whatsapp-events.service', () => ({
  emitWaEvent: emitWaEventMock,
}));

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

function statusValue(wamid: string, status: string, timestamp = '1700000100') {
  return {
    metadata: { phone_number_id: PHONE_ID },
    statuses: [{ id: wamid, status, timestamp, recipient_id: FROM }],
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

  getOrCreateChannelMock.mockResolvedValue(CHANNEL);
  upsertContactByPhoneMock.mockResolvedValue(CONTACT);
  getOrCreateConversationMock.mockResolvedValue(CONVERSATION);
  normalizeWaPhoneMock.mockImplementation((p: string) => `+${String(p).replace(/\D/g, '')}`);
  isOptOutMessageMock.mockReturnValue(false);
  isOptOutMessageAsyncMock.mockResolvedValue(false);
  optOutContactMock.mockResolvedValue(undefined);
  touchOnMessageMock.mockResolvedValue(undefined);
  reconcileRecipientStatusMock.mockResolvedValue(undefined);
  handleInboundAutoReplyMock.mockResolvedValue(undefined);
  emitWaEventMock.mockResolvedValue(undefined);
  addWhatsappMediaJobMock.mockResolvedValue(undefined);

  // Redis dedup: nothing seen by default.
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
  // No existing message by default (so create() runs).
  prismaMock.waMessage.findUnique.mockResolvedValue(null);
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

  it('still processes the message when Redis is down (DB dedup is authoritative)', async () => {
    redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(textMessageValue('wamid.MSG1'))
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
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
});

describe('processInboundEvent — forward-only status state machine', () => {
  it('advances a message to DELIVERED for a forward status', async () => {
    // Existing message currently at SENT (rank 1); DELIVERED is rank 2 → advance.
    prismaMock.waMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      wamid: 'wamid.OUT1',
      status: 'SENT',
      conversationId: 'conv1',
    });
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.update).toHaveBeenCalledTimes(1);
    const upd = prismaMock.waMessage.update.mock.calls[0][0];
    expect(upd.where).toEqual({ wamid: 'wamid.OUT1' });
    expect(upd.data).toMatchObject({ status: 'DELIVERED', deliveredAt: expect.any(Date) });
    // The Meta error code now rides along so campaign recipients can tell a
    // permanent rejection from a transient one; null on a non-failure status.
    expect(reconcileRecipientStatusMock).toHaveBeenCalledWith('wamid.OUT1', 'DELIVERED', {
      errorCode: null,
    });
  });

  it('ignores a stale/backward status (READ → DELIVERED is not regressed)', async () => {
    // Message already READ (rank 3); an incoming DELIVERED (rank 2) must be dropped.
    prismaMock.waMessage.findUnique.mockResolvedValue({
      id: 'msg1',
      wamid: 'wamid.OUT1',
      status: 'READ',
      conversationId: 'conv1',
    });
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.OUT1', 'delivered'), { eventType: 'status' })
    );

    await processInboundEvent('evt1');

    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
    expect(reconcileRecipientStatusMock).not.toHaveBeenCalled();
    // The event itself is still marked processed.
    expect(prismaMock.waWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it('DEFERS a status whose wamid has no matching message row yet', async () => {
    // Not a drop — a race. The send path writes the WAMID after the Graph POST
    // returns, and Meta's `sent` callback regularly beats it. Leaving the event
    // unprocessed is what lets the recovery pass replay it two minutes later;
    // marking it processed (the old behaviour) lost the status permanently and
    // the message showed as "sent" forever despite being delivered and read.
    prismaMock.waMessage.findUnique.mockResolvedValue(null);
    prismaMock.waWebhookEvent.findUnique.mockResolvedValue(
      eventWithValue(statusValue('wamid.UNKNOWN', 'delivered'), { eventType: 'status' })
    );

    const res = await processInboundEvent('evt1');

    expect(prismaMock.waMessage.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ deferred: true });
    // Crucially NOT stamped processed, so handleWaEventRecovery re-enqueues it.
    expect(prismaMock.waWebhookEvent.update).not.toHaveBeenCalled();
  });
});
