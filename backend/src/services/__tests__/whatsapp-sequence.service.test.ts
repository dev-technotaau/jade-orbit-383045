/**
 * Tests for the drip (SEQUENCE) engine (src/services/whatsapp-sequence.service.ts).
 *
 * The expensive failure here is a step that can never succeed. The cron used to
 * re-arm a recipient 15 minutes out no matter what went wrong, so a template Meta
 * had paused — routine for marketing templates — meant every recipient sitting on
 * that step hit the Graph API four times an hour indefinitely, with nothing but a
 * warn log: no FAILED recipient, no movement in the campaign counters, nothing an
 * operator could see. These cases pin the terminal/transient split and the attempt
 * bound that ends the loop.
 *
 * Prisma and the sibling services are mocked; the error classification tables are
 * the real ones (whatsapp-error-codes is dependency-free by design).
 */

const prismaMock = {
  waCampaign: { findMany: jest.fn() },
  waCampaignStep: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  },
  waCampaignRecipient: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const getOrCreateConversationMock = jest.fn();
jest.mock('../whatsapp-conversation.service', () => ({
  getOrCreateConversation: getOrCreateConversationMock,
}));

const sendTemplateToConversationMock = jest.fn();
jest.mock('../whatsapp-send.service', () => ({
  sendTemplateToConversation: sendTemplateToConversationMock,
}));

const assertTemplatesApprovedMock = jest.fn();
const completeCampaignMock = jest.fn();
jest.mock('../whatsapp-campaign.service', () => ({
  // The real mapping resolver: a step's parameters are the thing a bad mapping
  // silently blanks, so the cases below send what production would send.
  resolveTemplateVars: (mapping: string[] | undefined) => mapping ?? [],
  completeCampaign: completeCampaignMock,
  assertTemplatesApproved: assertTemplatesApprovedMock,
}));

jest.mock('../../utils/distributed-lock', () => ({
  withLock: (_key: string, _ttl: number, fn: () => Promise<void>) => fn(),
}));

jest.mock('../../jobs/whatsapp-campaign.worker', () => ({
  acquireChannelSendSlot: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../whatsapp-shortlink.service', () => ({
  appendRecipientToken: (value: string) => value,
  getCampaignLinkCodes: jest.fn().mockResolvedValue([]),
}));

import { advanceDueSequenceRecipients, setSequenceSteps } from '../whatsapp-sequence.service';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const RETRY_DELAY_MS = 15 * 60 * 1000;
/** Matches MAX_STEP_ATTEMPTS in the service. */
const MAX_STEP_ATTEMPTS = 6;

/** One due recipient, mid-sequence, as the cron selects it. */
const dueRecipient = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'rcp-1',
  contactId: 'ct-1',
  currentStep: 0,
  repliedAt: null,
  stepAttempts: 0,
  contact: { name: 'Asha', phone: '919000000000', attributes: null },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);

  prismaMock.waCampaign.findMany.mockResolvedValue([
    { id: 'camp-1', channelId: 'ch1', createdBy: 'user-1', throttlePerSec: 15 },
  ]);
  prismaMock.waCampaignStep.findMany.mockResolvedValue([
    { stepOrder: 1, templateId: 'tpl-1', delayHours: 24, condition: 'any', variableMapping: null },
    { stepOrder: 2, templateId: 'tpl-2', delayHours: 48, condition: 'any', variableMapping: null },
  ]);
  prismaMock.waCampaignRecipient.findMany.mockResolvedValue([dueRecipient()]);
  // The claim succeeds (this tick owns the recipient).
  prismaMock.waCampaignRecipient.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waCampaignRecipient.update.mockResolvedValue({});
  // Someone is still armed, so the campaign is not retired mid-case.
  prismaMock.waCampaignRecipient.count.mockResolvedValue(1);
  getOrCreateConversationMock.mockResolvedValue({ id: 'conv-1' });
  sendTemplateToConversationMock.mockResolvedValue({ status: 'SENT', wamid: 'wamid.1' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('advanceDueSequenceRecipients — a step that throws', () => {
  it('stops the recipient when the refusal can never succeed', async () => {
    // Meta pausing a step's template is the case this was written for: the send
    // service throws WA_TEMPLATE_NOT_APPROVED before anything reaches the Graph
    // API, and re-arming it just repeats the same refusal every 15 minutes.
    sendTemplateToConversationMock.mockRejectedValue(
      Object.assign(new Error('Template is not approved'), { code: 'WA_TEMPLATE_NOT_APPROVED' })
    );

    await advanceDueSequenceRecipients();

    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: {
        status: 'FAILED',
        errorCode: 'WA_TEMPLATE_NOT_APPROVED',
        nextStepAt: null,
        stepAttempts: 1,
      },
    });
  });

  it('re-arms a transient failure behind the backoff, counting the attempt', async () => {
    sendTemplateToConversationMock.mockRejectedValue(new Error('socket hang up'));

    await advanceDueSequenceRecipients();

    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: { nextStepAt: new Date(NOW.getTime() + RETRY_DELAY_MS), stepAttempts: 1 },
    });
  });

  it('gives up once the attempt budget for this step is spent', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      dueRecipient({ stepAttempts: MAX_STEP_ATTEMPTS - 1 }),
    ]);
    sendTemplateToConversationMock.mockRejectedValue(new Error('socket hang up'));

    await advanceDueSequenceRecipients();

    // A transient error that never clears is still an unbounded loop — one Graph
    // call per recipient every 15 minutes, forever, with nothing to show for it.
    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: {
        status: 'FAILED',
        errorCode: 'WA_STEP_FAILED',
        nextStepAt: null,
        stepAttempts: MAX_STEP_ATTEMPTS,
      },
    });
  });
});

describe('advanceDueSequenceRecipients — a step Meta rejects', () => {
  it('retries a rate limit, but only while attempts remain', async () => {
    sendTemplateToConversationMock.mockResolvedValue({ status: 'FAILED', errorCode: '130429' });

    await advanceDueSequenceRecipients();

    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: { nextStepAt: new Date(NOW.getTime() + RETRY_DELAY_MS), stepAttempts: 1 },
    });
  });

  it('stops the sequence on a rejection that will repeat', async () => {
    // A Meta rejection does not throw: dispatchOutbound persists a FAILED row and
    // returns it, and advancing regardless used to march the recipient through the
    // whole sequence as though every step had been delivered.
    sendTemplateToConversationMock.mockResolvedValue({ status: 'FAILED', errorCode: '131047' });

    await advanceDueSequenceRecipients();

    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: { status: 'FAILED', errorCode: '131047', nextStepAt: null, stepAttempts: 1 },
    });
  });
});

describe('advanceDueSequenceRecipients — a step that sends', () => {
  it('advances, stamps the send and clears the attempt counter', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([dueRecipient({ stepAttempts: 3 })]);

    await advanceDueSequenceRecipients();

    expect(prismaMock.waCampaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'rcp-1' },
      data: {
        currentStep: 1,
        // Step 2's delay, measured from this tick.
        nextStepAt: new Date(NOW.getTime() + 48 * 60 * 60 * 1000),
        sentAt: NOW,
        // Per-STEP budget: a step that finally sends leaves the next one its own
        // full allowance of retries.
        stepAttempts: 0,
        status: 'SENT',
        wamid: 'wamid.1',
      },
    });
  });
});

describe('setSequenceSteps', () => {
  it('refuses a step whose template Meta will not send', async () => {
    assertTemplatesApprovedMock.mockRejectedValue(
      Object.assign(new Error('not approved'), { code: 'WA_TEMPLATE_NOT_APPROVED' })
    );

    // Rejected where the operator can still fix it. Nothing checked a step
    // template until the send itself, which on this path was caught and retried.
    await expect(
      setSequenceSteps('camp-1', [{ stepOrder: 1, templateId: 'tpl-bad', delayHours: 24 }])
    ).rejects.toMatchObject({ code: 'WA_TEMPLATE_NOT_APPROVED' });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('skips validation for a Duplicate, which is how a paused template gets fixed', async () => {
    prismaMock.$transaction.mockResolvedValue([]);

    await setSequenceSteps('camp-1', [{ stepOrder: 1, templateId: 'tpl-bad', delayHours: 24 }], {
      validateTemplates: false,
    });

    expect(assertTemplatesApprovedMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
