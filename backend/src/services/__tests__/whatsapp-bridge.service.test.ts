/**
 * Tests for the Chatwoot outbound bridge (src/services/whatsapp-bridge.service.ts).
 *
 * The bridge is a second front door to the Cloud API: an agent works inside
 * Chatwoot, Chatwoot posts a Meta-shaped body at us, we send it. It used to
 * carry its OWN copy of the persist-then-send code, which quietly exempted it
 * from the two controls every other outbound path obeys — the do-not-contact
 * list and the per-contact marketing frequency cap. These cases pin it to the
 * shared `dispatchOutbound` chokepoint instead.
 *
 * Prisma and the sibling services are mocked; the gating and the response
 * mapping under test are the bridge's own.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const prismaMock = {
  // The SENT advance is a separate guarded `updateMany` (only from QUEUED), so a
  // status callback that beat Meta's send response cannot be dragged backwards.
  waMessage: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  waContact: { update: jest.fn() },
  waTemplate: { findFirst: jest.fn(), findMany: jest.fn() },
  waConversation: { updateMany: jest.fn() },
  // The MARKETING cap takes a per-contact advisory lock inside the same
  // transaction that inserts the row, so the raw escape hatch has to exist on
  // the client the transaction callback is handed.
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  // dispatchOutbound reconciles the row with Meta's answer and touches the
  // conversation in one interactive transaction; armed in beforeEach to run
  // against this same mock client.
  $transaction: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/env', () => ({ env: {} }));

const sendWhatsappRawMock = jest.fn();
jest.mock('../whatsapp.service', () => ({
  sendWhatsappRaw: sendWhatsappRawMock,
  toGraphPhone: (phone: string) => phone.replace(/[^\d]/g, ''),
}));

const upsertContactByPhoneMock = jest.fn();
jest.mock('../whatsapp-contact.service', () => ({
  upsertContactByPhone: upsertContactByPhoneMock,
  noteMarketingRefusal: jest.fn(),
  normalizeWaPhone: (phone: string) => String(phone).replace(/[^\d]/g, ''),
}));

const getConversationForOutboundMock = jest.fn();
const applyMessageTouchMock = jest.fn().mockResolvedValue({ id: 'conv1' });
const touchOnMessageMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../whatsapp-conversation.service', () => ({
  getConversationForOutbound: getConversationForOutboundMock,
  windowOpen: (expiresAt: Date | null) => expiresAt != null && expiresAt.getTime() > Date.now(),
  applyMessageTouch: applyMessageTouchMock,
  touchOnMessage: touchOnMessageMock,
}));

/** Two connected numbers: the env default (ch1) and a second one (ch2). */
const getChannelPhoneNumberIdMock = jest.fn(async (channelId: string) =>
  channelId === 'ch2' ? '2222' : '1111'
);
jest.mock('../whatsapp-channel.service', () => ({
  getDefaultChannel: jest.fn().mockResolvedValue({ id: 'ch1' }),
  getChannelPhoneNumberId: getChannelPhoneNumberIdMock,
}));

const isSuppressedMock = jest.fn();
jest.mock('../whatsapp-suppression.service', () => ({ isSuppressed: isSuppressedMock }));

const getWaSettingsMock = jest.fn();
jest.mock('../whatsapp-settings.service', () => ({ getWaSettings: getWaSettingsMock }));

jest.mock('../whatsapp-template.service', () => ({
  getTemplate: jest.fn(),
  buildTemplateSendComponents: jest.fn(() => []),
  renderTemplateBody: jest.fn(() => ''),
  // The template send path mints a per-send flow_token for a FLOW button. No
  // case here reaches it, but a mock that omits it would fail as "not a
  // function" the moment one does, which reads as a product bug rather than a
  // missing stub.
  templateFlowButton: jest.fn(() => null),
  mintTemplateFlowToken: jest.fn(() => 'flow-token'),
}));

jest.mock('../../utils/whatsapp-realtime', () => ({ emitWa: jest.fn() }));

jest.mock('../../utils/whatsapp-metrics', () => ({
  waMessagesTotal: { inc: jest.fn() },
  waSendFailuresTotal: { inc: jest.fn() },
  waSendDuration: { startTimer: () => jest.fn() },
}));

import { proxyOutboundToMeta } from '../whatsapp-bridge.service';

/** The stored contact: E.164, reachable, never refused by Meta. */
const CONTACT = {
  id: 'c1',
  phone: '+919876543210',
  isBlocked: false,
  optInStatus: 'OPTED_IN',
  marketingRefusedAt: null,
  marketingRefusedCode: null,
};

const textSend = () => ({ to: '+919876543210', type: 'text', text: { body: 'hi' } });

beforeEach(() => {
  jest.clearAllMocks();
  upsertContactByPhoneMock.mockResolvedValue({ ...CONTACT });
  getConversationForOutboundMock.mockResolvedValue({
    id: 'conv1',
    channelId: 'ch1',
    windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  getChannelPhoneNumberIdMock.mockImplementation(async (channelId: string) =>
    channelId === 'ch2' ? '2222' : '1111'
  );
  isSuppressedMock.mockResolvedValue(false);
  getWaSettingsMock.mockResolvedValue({ marketingCapPer24h: 0 });
  prismaMock.waMessage.create.mockImplementation(async ({ data }: any) => ({
    id: 'm1',
    wamid: null,
    ...data,
  }));
  prismaMock.waMessage.update.mockImplementation(async ({ where, data }: any) => ({
    id: where.id,
    ...data,
  }));
  prismaMock.waMessage.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waMessage.count.mockResolvedValue(0);
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.$queryRaw.mockResolvedValue([{}]);
  applyMessageTouchMock.mockResolvedValue({ id: 'conv1' });
  prismaMock.waContact.update.mockResolvedValue({});
  prismaMock.waTemplate.findFirst.mockResolvedValue(null);
  prismaMock.waTemplate.findMany.mockResolvedValue([]);
  sendWhatsappRawMock.mockResolvedValue({ ok: true, wamid: 'wamid.1' });
});

describe('proxyOutboundToMeta', () => {
  it('refuses a recipient on the do-not-contact list, and records why', async () => {
    isSuppressedMock.mockResolvedValue(true);

    const out = await proxyOutboundToMeta(textSend());

    expect(isSuppressedMock).toHaveBeenCalledWith('+919876543210');
    expect(sendWhatsappRawMock).not.toHaveBeenCalled();
    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('131050');
    // Persisted as FAILED rather than dropped, so the agent's message is not
    // just missing from the thread with no explanation.
    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.create.mock.calls[0][0].data).toMatchObject({
      contactId: 'c1',
      direction: 'OUTBOUND',
      status: 'FAILED',
      errorCode: '131050',
    });
  });

  it('applies the per-contact marketing cap to a template send from Chatwoot', async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ category: 'MARKETING' });
    prismaMock.waTemplate.findMany.mockResolvedValue([{ name: 'promo_aug' }]);
    getWaSettingsMock.mockResolvedValue({ marketingCapPer24h: 2 });
    prismaMock.waMessage.count.mockResolvedValue(2);

    const out = await proxyOutboundToMeta({
      to: '+919876543210',
      type: 'template',
      template: { name: 'promo_aug', language: { code: 'en_US' } },
    });

    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('WA_MARKETING_CAP');
    expect(sendWhatsappRawMock).not.toHaveBeenCalled();
    expect(prismaMock.waMessage.create).not.toHaveBeenCalled();
    // Chatwoot names the template but not its category, so the category is
    // resolved from the name + language the Meta payload carries.
    expect(prismaMock.waTemplate.findFirst).toHaveBeenCalledWith({
      where: { name: 'promo_aug', language: 'en_US' },
      select: { category: true },
    });
  });

  // M148: the cap used to be a read-then-write with nothing between the halves,
  // so two overlapping sends both read `cap - 1` and both went out. The count is
  // now re-run inside the same transaction that inserts the row, under a
  // per-contact advisory lock, and the row carries the category it was sent
  // under rather than being matched against today's marketing template NAMES.
  it('stamps the resolved category on the row and reserves the cap slot under a lock', async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ category: 'MARKETING' });
    getWaSettingsMock.mockResolvedValue({ marketingCapPer24h: 2 });
    prismaMock.waMessage.count.mockResolvedValue(0);

    const out = await proxyOutboundToMeta({
      to: '+919876543210',
      type: 'template',
      template: { name: 'promo_aug', language: { code: 'en_US' } },
    });

    expect(out.status).toBe(200);
    expect(prismaMock.waMessage.create.mock.calls[0][0].data).toMatchObject({
      templateName: 'promo_aug',
      templateCategory: 'MARKETING',
    });
    // The reservation: lock, re-count, insert — all in one transaction.
    //
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock() returns void, and
    // asking the driver adapter to deserialize that fails with P2010 at runtime
    // — which took down every marketing send in production while the suite
    // stayed green, because prisma is mocked here and no real SQL runs.
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    // The count is keyed on the category the message went out under, NOT on a
    // list of template names resolved at check time.
    expect(prismaMock.waTemplate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.waMessage.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        contactId: 'c1',
        direction: 'OUTBOUND',
        type: 'TEMPLATE',
        templateCategory: 'MARKETING',
        status: { not: 'FAILED' },
      }),
    });
  });

  it('refuses the send when the reservation finds the cap already spent', async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ category: 'MARKETING' });
    getWaSettingsMock.mockResolvedValue({ marketingCapPer24h: 2 });
    // The early gate sees room (a concurrent send had not committed yet); the
    // re-count inside the locked transaction sees the winner's row.
    prismaMock.waMessage.count.mockResolvedValueOnce(1).mockResolvedValue(2);

    const out = await proxyOutboundToMeta({
      to: '+919876543210',
      type: 'template',
      template: { name: 'promo_aug', language: { code: 'en_US' } },
    });

    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('WA_MARKETING_CAP');
    expect(sendWhatsappRawMock).not.toHaveBeenCalled();
  });

  it('stamps lastMarketingAt only after Meta accepted the send', async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ category: 'MARKETING' });
    getWaSettingsMock.mockResolvedValue({ marketingCapPer24h: 0 });
    // A send Meta refused must not consume the contact's daily budget: the
    // campaign audience pre-filter reads lastMarketingAt, so stamping it before
    // dispatch excluded the recipients of a failed batch from the retry.
    sendWhatsappRawMock.mockResolvedValue({
      ok: false,
      wamid: null,
      error: { code: '131000', title: 'nope' },
    });

    await proxyOutboundToMeta({
      to: '+919876543210',
      type: 'template',
      template: { name: 'promo_aug', language: { code: 'en_US' } },
    });

    expect(prismaMock.waContact.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastMarketingAt: expect.anything() }),
      })
    );
  });
  it('leaves a non-marketing template alone: no cap query, no lastMarketingAt stamp', async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ category: 'UTILITY' });

    const out = await proxyOutboundToMeta({
      to: '+919876543210',
      type: 'template',
      template: { name: 'order_shipped', language: { code: 'en_US' } },
    });

    expect(out.status).toBe(200);
    expect(getWaSettingsMock).not.toHaveBeenCalled();
    expect(prismaMock.waMessage.count).not.toHaveBeenCalled();
    expect(prismaMock.waContact.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastMarketingAt: expect.anything() }),
      })
    );
  });

  it('persists exactly once and addresses Meta from the stored E.164 number', async () => {
    // Chatwoot hands us the number in national format; the contact row holds the
    // normalized one, and that is what has to reach Meta.
    const out = await proxyOutboundToMeta({
      to: '09876543210',
      type: 'text',
      text: { body: 'hello' },
    });

    expect(out).toEqual({
      status: 200,
      body: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] },
    });
    expect(prismaMock.waMessage.create).toHaveBeenCalledTimes(1);
    expect(sendWhatsappRawMock).toHaveBeenCalledTimes(1);
    expect(sendWhatsappRawMock.mock.calls[0][0]).toEqual({
      to: '919876543210',
      type: 'text',
      text: { body: 'hello' },
    });
    // ...and from the conversation's own connected number.
    expect(sendWhatsappRawMock.mock.calls[0][1]).toBe('1111');
  });

  it('answers from the number the customer messaged, not the env default', async () => {
    // This contact's thread lives on our SECOND connected number. Chatwoot's
    // payload names no sender of ours, and replying from the env number reaches
    // the customer as a brand-new thread from a number they never wrote to.
    getConversationForOutboundMock.mockResolvedValue({
      id: 'conv2',
      channelId: 'ch2',
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const out = await proxyOutboundToMeta(textSend());

    expect(out.status).toBe(200);
    // The default channel is only the fallback for a contact with no thread.
    expect(getConversationForOutboundMock).toHaveBeenCalledWith('c1', 'ch1');
    expect(sendWhatsappRawMock.mock.calls[0][1]).toBe('2222');
    // The stored row is stamped with the sending channel, not the default.
    expect(prismaMock.waMessage.create.mock.calls[0][0].data).toMatchObject({
      channelId: 'ch2',
      conversationId: 'conv2',
    });
  });

  it("passes Meta's own HTTP status back to Chatwoot", async () => {
    sendWhatsappRawMock.mockResolvedValue({
      ok: false,
      wamid: null,
      error: { code: '130429', title: 'Rate limit hit', status: 429 },
    });

    const out = await proxyOutboundToMeta(textSend());

    expect(out.status).toBe(429);
    expect(out.body.error).toEqual({ message: 'Rate limit hit', code: '130429' });
  });

  it('reports a transport failure as 502 — Meta status 0 is not a sendable status', async () => {
    sendWhatsappRawMock.mockResolvedValue({
      ok: false,
      wamid: null,
      retryable: true,
      error: { title: 'network_error', status: 0 },
    });

    const out = await proxyOutboundToMeta(textSend());

    expect(out.status).toBe(502);
    expect(out.body.error).toEqual({ message: 'network_error', code: 'network_error' });
  });
});
