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
  env: { WHATSAPP_CAMPAIGN_CONCURRENCY: '1' },
}));

const prismaMock = {
  waCampaign: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  waCampaignRecipient: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
  },
  waCampaignVariant: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  waTemplate: {
    findUnique: jest.fn().mockResolvedValue({ category: 'UTILITY' }),
  },
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
jest.mock('../../services/whatsapp-campaign.service', () => ({
  recomputeCampaignCounters: (...a: any[]) => recomputeCampaignCountersMock(...a),
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

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.waCampaign.findUnique.mockResolvedValue(CAMPAIGN);
  prismaMock.waCampaign.update.mockResolvedValue({});
  prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(recipient());
  prismaMock.waCampaignRecipient.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waCampaignRecipient.update.mockResolvedValue({});
  prismaMock.waCampaignRecipient.count.mockResolvedValue(1); // still pending → no completion
  prismaMock.waTemplate.findUnique.mockResolvedValue({ category: 'UTILITY' });
  prismaMock.waCampaignVariant.findUnique.mockResolvedValue(null);
  getOrCreateConversationMock.mockResolvedValue({ id: 'conv1' });
  redisMock.incr.mockResolvedValue(1);
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
    prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(
      recipient({ contact: { isBlocked: true, optInStatus: 'OPTED_IN' } })
    );

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SKIPPED' } })
    );
  });

  it('skips a contact who opted out after the audience was materialized', async () => {
    prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(
      recipient({ contact: { isBlocked: false, optInStatus: 'OPTED_OUT' } })
    );

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('skips a MARKETING send to a contact who never opted in', async () => {
    prismaMock.waTemplate.findUnique.mockResolvedValue({ category: 'MARKETING' });
    prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(
      recipient({ contact: { isBlocked: false, optInStatus: 'PENDING' } })
    );

    await run();

    expect(sendTemplateToConversationMock).not.toHaveBeenCalled();
  });

  it('allows a UTILITY send to a contact who never opted in', async () => {
    prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(
      recipient({ contact: { isBlocked: false, optInStatus: 'PENDING' } })
    );
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
    prismaMock.waCampaignRecipient.findUnique.mockResolvedValue(recipient({ variantId: 'var1' }));
    prismaMock.waCampaignVariant.findUnique.mockResolvedValue({ templateId: 'tpl-variant' });
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
});

describe('processCampaignBatch — completion', () => {
  it('completes the campaign once no recipients are left PENDING', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });
    prismaMock.waCampaignRecipient.count.mockResolvedValue(0);
    prismaMock.waCampaign.findUnique
      .mockResolvedValueOnce(CAMPAIGN) // batch load
      .mockResolvedValueOnce({ status: 'RUNNING' }) // liveness
      .mockResolvedValueOnce({ status: 'RUNNING', recurrenceDays: null }) // completion read
      .mockResolvedValueOnce({ id: 'camp1', status: 'COMPLETED' }); // progress read

    await run();

    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', nextRunAt: null }),
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
    prismaMock.waCampaign.findUnique
      .mockResolvedValueOnce({ ...CAMPAIGN, recurrenceDays: 7 })
      .mockResolvedValueOnce({ status: 'RUNNING' })
      .mockResolvedValueOnce({ status: 'RUNNING', recurrenceDays: 7 })
      .mockResolvedValueOnce({ id: 'camp1', status: 'COMPLETED' });

    await run();

    const data = prismaMock.waCampaign.update.mock.calls[0][0].data;
    expect(data.status).toBe('COMPLETED');
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(data.nextRunAt.getTime() - data.completedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('always recomputes counters from the recipient table', async () => {
    sendTemplateToConversationMock.mockResolvedValue({
      status: 'SENT',
      wamid: 'wamid.1',
      errorCode: null,
    });

    await run();

    expect(recomputeCampaignCountersMock).toHaveBeenCalledWith('camp1');
  });
});
