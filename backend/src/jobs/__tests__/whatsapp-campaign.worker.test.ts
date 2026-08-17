/**
 * Tests for the campaign batch send path (src/jobs/whatsapp-campaign.worker.ts).
 *
 * Drives `processCampaignBatch` — the exact function the BullMQ job runs —
 * directly, so the outcome mapping is exercised without BullMQ or Redis. That
 * mapping is where a mistake is expensive in both directions: classify a
 * transient failure as FAILED and a deliverable message is dropped forever;
 * classify a hard failure as retryable and the recovery cron re-sends it in a
 * loop, burning Meta conversation credits on a message that can never land.
 *
 * The four outcomes under test: SENT, SKIPPED (cap / opt-out), FAILED (hard),
 * and rolled-back-to-PENDING (transient).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('../../config/env', () => ({
  // CSRF_SECRET keys the per-recipient short-link token (see
  // whatsapp-shortlink.service), which the send path now stamps onto every
  // outbound parameter carrying a campaign link.
  env: {
    WHATSAPP_CAMPAIGN_CONCURRENCY: '1',
    // Pins the in-batch send pool, which several cases below count against.
    WHATSAPP_CAMPAIGN_SEND_CONCURRENCY: '4',
    // CSRF_SECRET keys the per-recipient short-link token.
    CSRF_SECRET: 'x'.repeat(32),
  },
}));

const prismaMock = {
  waCampaign: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  waCampaignRecipient: {
    findMany: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  waCampaignVariant: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  waTemplate: {
    findUnique: jest.fn().mockResolvedValue({ category: 'UTILITY' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  // Campaign short links, read once per batch so each recipient's parameters can
  // carry a signed ?r= token.
  waShortLink: { findMany: jest.fn().mockResolvedValue([]) },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

// `acquireSendSlot` spins on incr/expire; make every slot immediately available.
const redisMock = {
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
};
jest.mock('../../config/redis', () => ({ redis: redisMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../whatsapp-campaign.queue', () => ({
  WHATSAPP_CAMPAIGN_QUEUE_NAME: 'whatsapp-campaign-queue',
}));

const getOrCreateConversationMock = jest.fn();
jest.mock('../../services/whatsapp-conversation.service', () => ({
  getOrCreateConversation: getOrCreateConversationMock,
}));

const sendTemplateToConversationMock = jest.fn();
jest.mock('../../services/whatsapp-send.service', () => ({
  sendTemplateToConversation: sendTemplateToConversationMock,
}));

const recomputeCampaignCountersMock = jest.fn().mockResolvedValue(undefined);
const scheduleCampaignCounterRecomputeMock = jest.fn().mockResolvedValue(undefined);
const completeCampaignMock = jest.fn().mockResolvedValue(undefined);
const getMessagingTierBudgetMock = jest.fn();
jest.mock('../../services/whatsapp-campaign.service', () => ({
  recomputeCampaignCounters: (...a: any[]) => recomputeCampaignCountersMock(...a),
  scheduleCampaignCounterRecompute: (...a: any[]) => scheduleCampaignCounterRecomputeMock(...a),
  completeCampaign: (...a: any[]) => completeCampaignMock(...a),
  getMessagingTierBudget: (...a: any[]) => getMessagingTierBudgetMock(...a),
}));
// NOT mocked: ../../services/whatsapp-error-codes. The skip/retryable tables are
// exactly what these tests are asserting on, and the module is dependency-free,
// so the real ones load — a mock here would just be a copy that drifts.

jest.mock('../../services/whatsapp-events.service', () => ({
  emitWaEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/whatsapp-realtime', () => ({ emitWa: jest.fn() }));
jest.mock('../../utils/whatsapp-metrics', () => ({ captureWaException: jest.fn() }));

import { processCampaignBatch } from '../whatsapp-campaign.worker';

const CAMPAIGN = {
  id: 'camp1',
  status: 'RUNNING',
  channelId: 'chan1',
  templateId: 'tpl1',
  createdBy: 'user1',
  throttlePerSec: 100,
  recurrenceDays: null,
};

const recipient = (over: Record<string, any> = {}) => ({
  id: 'rec1',
  contactId: 'contact1',
  status: 'PENDING',
  variables: [],
  variantId: null,
  contact: { isBlocked: false, optInStatus: 'OPTED_IN' },
  ...over,
});

/** The final per-recipient write (the claim is an updateMany, not an update). */
const outcome = () => prismaMock.waCampaignRecipient.update.mock.calls[0]?.[0]?.data;

/**
 * Every id in the batch resolves to one row shaped by `over`.
 *
 * The batch reads its recipients with a single findMany rather than a findUnique
 * per recipient — one extra round trip per send, on a five-connection pool, for
 * a row the atomic PENDING claim re-checks anyway.
 */
const mockRecipients = (over: Record<string, any> = {}) =>
  prismaMock.waCampaignRecipient.findMany.mockImplementation(async (args: any) =>
    (args?.where?.id?.in ?? []).map((id: string) => recipient({ ...over, id }))
  );

beforeEach(() => {
  jest.clearAllMocks();
  scheduleCampaignCounterRecomputeMock.mockClear();
  completeCampaignMock.mockClear();
  prismaMock.waCampaign.findUnique.mockResolvedValue(CAMPAIGN);
  prismaMock.waCampaign.update.mockResolvedValue({});
  mockRecipients();
  prismaMock.waCampaignRecipient.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waCampaignRecipient.update.mockResolvedValue({});
  prismaMock.waCampaignRecipient.count.mockResolvedValue(1); // still pending → no completion
  // Same intent for the existence probe that replaced the COUNT.
  prismaMock.waCampaignRecipient.findFirst.mockResolvedValue({ id: 'r-pending' });
  prismaMock.waTemplate.findUnique.mockResolvedValue({ category: 'UTILITY' });
  // Batch-loaded category map: the campaign template is UTILITY by default.
  prismaMock.waTemplate.findMany.mockResolvedValue([{ id: 'tpl1', category: 'UTILITY' }]);
  prismaMock.waCampaignVariant.findUnique.mockResolvedValue(null);
  prismaMock.waCampaignVariant.findMany.mockResolvedValue([]);
  getOrCreateConversationMock.mockResolvedValue({ id: 'conv1' });
  redisMock.incr.mockResolvedValue(1);
  // Default: the channel's tier expresses no daily cap, so the tier gate is inert
  // and the outcome-mapping cases below stay about the outcome mapping.
  getMessagingTierBudgetMock.mockResolvedValue({
    limit: null,
    uniqueSentLast24h: 0,
    remaining: null,
  });
});

const run = () => processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1'] });

describe('processCampaignBatch — send outcome mapping', () => {
  it('marks SENT on a successful send', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    expect(outcome()).toMatchObject({ status: 'SENT', wamid: 'wamid.1' });
  });

  it('rolls BACK to PENDING on a retryable send failure (rate limit)', async () => {
    // 131056 = pair rate limit. Losing this message would be a real lost send,
    // so the recipient must return to the pool for the recovery cron.
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'FAILED',
      wamid: null,
      errorCode: '131056',
    });

    await run();

    expect(outcome()).toMatchObject({ status: 'PENDING', sentAt: null, wamid: null });
  });

  it('stops the whole batch after an expired-token (190) rejection', async () => {
    // 190 is retryable so the audience is not burned to FAILED, but every
    // remaining recipient would be rejected identically. Grinding through them
    // held the worker's only batch slot for the whole audience (and slept on a
    // throttle backoff that does not apply to a 401), so the batch stops and
    // leaves the rest PENDING for the recovery cron.
    //
    // The bound is one pool's width rather than exactly one: sends already in
    // flight when the first 190 comes back cannot be recalled. What matters is
    // that a 12-recipient batch does not become 12 rejections.
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'FAILED',
      wamid: null,
      errorCode: '190',
    });

    const res = await processCampaignBatch({
      campaignId: 'camp1',
      recipientIds: Array.from({ length: 12 }, (_, i) => `rec${i + 1}`),
    });

    expect(sendTemplateToConversationMock.mock.calls.length).toBeGreaterThan(0);
    expect(sendTemplateToConversationMock.mock.calls.length).toBeLessThanOrEqual(4);
    expect(outcome()).toMatchObject({ status: 'PENDING', sentAt: null, errorCode: '190' });
    expect(res).toMatchObject({ tokenRejected: true });
  });

  it('marks FAILED on a non-retryable send failure', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'FAILED',
      wamid: null,
      errorCode: '132000', // template param count mismatch — retrying cannot help
    });

    await run();

    expect(outcome()).toMatchObject({ status: 'FAILED' });
  });

  it('marks SKIPPED when the send returns a cap / opt-out code', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'FAILED',
      wamid: null,
      errorCode: '131049', // per-user marketing cap
    });

    await run();

    expect(outcome()).toMatchObject({ status: 'SKIPPED' });
  });

  it('rolls back to PENDING when the send THROWS a retryable error', async () => {
    // The thrown-error branch must classify identically to the returned-status
    // branch; a transient throw is the common shape (socket hangup, 429).
    const err: any = new Error('rate limited');
    err.code = '131056';
    sendTemplateToConversationMock.mockRejectedValue(err);

    await run();

    expect(outcome()).toMatchObject({ status: 'PENDING', sentAt: null, wamid: null });
  });

  it('rolls back to PENDING when the send throws with no code at all', async () => {
    // An uncoded throw becomes 'SEND_ERROR', which the table treats as transient
    // (a bare network throw usually is). Documented here because it is the
    // difference between a dropped message and a retried one.
    sendTemplateToConversationMock.mockRejectedValue(new Error('boom'));

    await run();

    expect(outcome()).toMatchObject({ status: 'PENDING', errorCode: 'SEND_ERROR' });
  });

  it('marks FAILED when the send throws a hard, non-retryable code', async () => {
    const err: any = new Error('template mismatch');
    err.code = '132000';
    sendTemplateToConversationMock.mockRejectedValue(err);

    await run();

    expect(outcome()).toMatchObject({ status: 'FAILED', errorCode: '132000' });
  });
});

describe('processCampaignBatch — guards', () => {
  it('sends nothing when the campaign is not RUNNING', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ ...CAMPAIGN, status: 'PAUSED' });

    const res = await run();

    expect(res).toMatchObject({ skipped: true, status: 'PAUSED' });
    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('stops mid-batch when the campaign is paused between recipients', async () => {
    // First read is the batch-level load; the second is the per-recipient
    // liveness check, which now reports PAUSED.
    prismaMock.waCampaign.findUnique
      .mockResolvedValueOnce(CAMPAIGN)
      .mockResolvedValueOnce({ status: 'PAUSED' });

    await processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1', 'rec2'] });

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('skips a blocked contact without sending', async () => {
    mockRecipients({ contact: { isBlocked: true, optInStatus: 'OPTED_IN' } });

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SKIPPED' } })
    );
  });

  it('skips a contact who opted out after the audience was materialized', async () => {
    mockRecipients({ contact: { isBlocked: false, optInStatus: 'OPTED_OUT' } });

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('skips a MARKETING send to a contact who never opted in', async () => {
    prismaMock.waTemplate.findUnique.mockResolvedValue({ category: 'MARKETING' });
    prismaMock.waTemplate.findMany.mockResolvedValue([{ id: 'tpl1', category: 'MARKETING' }]);
    mockRecipients({ contact: { isBlocked: false, optInStatus: 'PENDING' } });

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('allows a UTILITY send to a contact who never opted in', async () => {
    mockRecipients({ contact: { isBlocked: false, optInStatus: 'PENDING' } });
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    expect(sendTemplateToConversationMock).toHaveBeenCalledTimes(1);
  });

  it('does not send when the atomic PENDING claim is lost to another worker', async () => {
    // count===0 means someone else already claimed this recipient. This is the
    // guard that makes a job retry safe.
    prismaMock.waCampaignRecipient.updateMany.mockResolvedValue({ count: 0 });

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('sends the A/B variant template when the recipient was assigned one', async () => {
    mockRecipients({ variantId: 'var1' });
    prismaMock.waCampaignVariant.findUnique.mockResolvedValue({ templateId: 'tpl-variant' });
    prismaMock.waCampaignVariant.findMany.mockResolvedValue([
      { id: 'var1', templateId: 'tpl-variant' },
    ]);
    prismaMock.waTemplate.findMany.mockResolvedValue([
      { id: 'tpl1', category: 'UTILITY' },
      { id: 'tpl-variant', category: 'UTILITY' },
    ]);
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    expect(sendTemplateToConversationMock).toHaveBeenCalledWith(
      'conv1',
      'user1',
      expect.objectContaining({ templateId: 'tpl-variant' })
    );
  });

  it('stamps a per-recipient tracking token onto every campaign short link', async () => {
    // One code is embedded for the whole audience, so without this the click that
    // comes back is an anonymous counter increment — no click→conversion funnel,
    // no clicker retargeting, no per-variant CTR.
    prismaMock.waShortLink.findMany.mockResolvedValue([{ id: 'link1', code: 'abc12345' }]);
    mockRecipients({ variables: ['https://short.test/l/abc12345'] });
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    const sent = sendTemplateToConversationMock.mock.calls[0][2];
    expect(sent.bodyParams[0]).toMatch(
      /^https:\/\/short\.test\/l\/abc12345\?r=[\w-]+\.[0-9a-f]{10}$/
    );
  });

  it("leaves a link that is not one of this campaign's short links alone", async () => {
    prismaMock.waShortLink.findMany.mockResolvedValue([{ id: 'link1', code: 'abc12345' }]);
    mockRecipients({ variables: ['https://short.test/l/notmine'] });
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    const sent = sendTemplateToConversationMock.mock.calls[0][2];
    expect(sent.bodyParams).toEqual(['https://short.test/l/notmine']);
  });
});

describe('processCampaignBatch — send concurrency', () => {
  it('sends several recipients at once instead of strictly one at a time', async () => {
    // Serially, throughput was one Graph round trip after another — 2-5
    // messages/second — so a `throttlePerSec` of 15, 40 or 80 was decorative and
    // a six-figure audience took most of a day.
    let inFlight = 0;
    let peak = 0;
    sendTemplateToConversationMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { status: 'SENT', wamid: 'wamid.1', errorCode: null };
    });

    await processCampaignBatch({
      campaignId: 'camp1',
      recipientIds: ['rec1', 'rec2', 'rec3', 'rec4', 'rec5', 'rec6'],
    });

    expect(sendTemplateToConversationMock).toHaveBeenCalledTimes(6);
    expect(peak).toBeGreaterThan(1);
    // …but never wider than the configured pool: every in-flight send holds a
    // database connection for its writes.
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('never runs more senders than the campaign throttle allows per second', async () => {
    // A 2/s campaign gains nothing from eight senders — they would only queue in
    // the Redis token bucket, holding connections while they spin.
    prismaMock.waCampaign.findUnique.mockResolvedValue({ ...CAMPAIGN, throttlePerSec: 2 });
    let inFlight = 0;
    let peak = 0;
    sendTemplateToConversationMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { status: 'SENT', wamid: 'wamid.1', errorCode: null };
    });

    await processCampaignBatch({
      campaignId: 'camp1',
      recipientIds: ['rec1', 'rec2', 'rec3', 'rec4', 'rec5', 'rec6'],
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('reads every recipient in the batch with one query', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1', 'rec2', 'rec3'] });

    expect(prismaMock.waCampaignRecipient.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waCampaignRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['rec1', 'rec2', 'rec3'] } } })
    );
  });

  it('polls the live campaign status once for the whole pool, not once per sender', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1', 'rec2', 'rec3'] });

    // The batch load, one shared liveness poll, and the progress read at the
    // tail. A poll per sender would put the pause check on the critical path of
    // every single send.
    expect(prismaMock.waCampaign.findUnique).toHaveBeenCalledTimes(3);
  });
});

describe('processCampaignBatch — Meta messaging tier', () => {
  it('sends nothing when the daily allowance is already spent', async () => {
    getMessagingTierBudgetMock.mockResolvedValue({
      limit: 1_000,
      uniqueSentLast24h: 1_000,
      remaining: 0,
    });

    const res = await processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1', 'rec2'] });

    expect(res).toEqual({ skipped: true, tierExhausted: true });
    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
    // Nothing is written off either: the recipients stay PENDING so the recovery
    // cron re-batches them once the 24h window rolls off. Marking them FAILED
    // would lose deliverable messages that are merely early.
    expect(prismaMock.waCampaignRecipient.updateMany).not.toHaveBeenCalled();
  });

  it('stops mid-batch once the allowance runs out', async () => {
    getMessagingTierBudgetMock.mockResolvedValue({
      limit: 1_000,
      uniqueSentLast24h: 999,
      remaining: 1,
    });
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    const res = await processCampaignBatch({
      campaignId: 'camp1',
      recipientIds: ['rec1', 'rec2', 'rec3'],
    });

    // Exactly one send fits. The other two would have come back 131056/130497,
    // and it is those refusals — not the sends — that degrade the number's
    // quality rating and eventually get it restricted.
    expect(sendTemplateToConversationMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      processed: 3,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      tierExhausted: true,
    });
    // The counter rebuild still runs — the batch stops its senders, it does not
    // bail out, so the campaigns view does not freeze on stale numbers.
    expect(scheduleCampaignCounterRecomputeMock).toHaveBeenCalledWith('camp1');
  });

  it('does not gate a channel whose tier expresses no daily cap', async () => {
    // 'STANDARD' / 'HIGH' are per-second throughput levels, not daily allowances,
    // and getMessagingTierBudget reports no limit for them. Gating on a cap that
    // does not exist would stop every campaign on such a number after one batch.
    getMessagingTierBudgetMock.mockResolvedValue({
      limit: null,
      uniqueSentLast24h: 0,
      remaining: null,
    });
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await processCampaignBatch({ campaignId: 'camp1', recipientIds: ['rec1', 'rec2', 'rec3'] });

    expect(sendTemplateToConversationMock).toHaveBeenCalledTimes(3);
  });
});

describe('processCampaignBatch — completion', () => {
  it('completes the campaign once no recipients are left PENDING', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });
    prismaMock.waCampaignRecipient.count.mockResolvedValue(0);
    prismaMock.waCampaignRecipient.findFirst.mockResolvedValue(null);
    prismaMock.waCampaign.findUnique
      .mockResolvedValueOnce(CAMPAIGN) // batch load
      .mockResolvedValueOnce({ status: 'RUNNING' }) // liveness
      .mockResolvedValueOnce({ status: 'RUNNING', recurrenceDays: null }) // completion read
      .mockResolvedValueOnce({ id: 'camp1', status: 'COMPLETED' }); // progress read

    await run();

    expect(completeCampaignMock).toHaveBeenCalledWith('camp1');
    // The worker must NOT write a bare COMPLETED itself — doing that in three
    // separate places is what silently stopped recurring campaigns recurring.
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });

  it('arms nextRunAt for a recurring campaign on completion', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });
    prismaMock.waCampaignRecipient.count.mockResolvedValue(0);
    prismaMock.waCampaignRecipient.findFirst.mockResolvedValue(null);
    prismaMock.waCampaign.findUnique
      .mockResolvedValueOnce({ ...CAMPAIGN, recurrenceDays: 7 })
      .mockResolvedValueOnce({ status: 'RUNNING' })
      .mockResolvedValueOnce({ status: 'RUNNING', recurrenceDays: 7 })
      .mockResolvedValueOnce({ id: 'camp1', status: 'COMPLETED' });

    await run();

    // Recurrence arming lives in completeCampaign now; asserting the arithmetic
    // here would only re-test the service through a mock. It is covered by
    // whatsapp-campaign.service.test.ts -> describe('completeCampaign').
    expect(completeCampaignMock).toHaveBeenCalledWith('camp1');
  });

  it('always recomputes counters from the recipient table', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    // Debounced on EVERY batch; the unconditional rebuild only runs on the final
    // one, so this is the call that matches the test's name.
    expect(scheduleCampaignCounterRecomputeMock).toHaveBeenCalledWith('camp1');
  });
});
