/**
 * Tests for the inbound auto-reply engine
 * (src/services/whatsapp-autoreply.service.ts).
 *
 * The engine runs as one BullMQ job per inbound message, and the two things that
 * buys are exactly the two things a customer notices: the away message is
 * debounced by an atomic Redis claim rather than by asking the database whether
 * we replied recently (so two messages landing together cannot both be answered,
 * and a failed send does not mute the conversation for half an hour), and every
 * failure PROPAGATES so the job is retried instead of being logged and dropped.
 *
 * Prisma, Redis and the send path are mocked; the error-code table is the real
 * one, since it is dependency-free and a copy would drift from it. The guards
 * (master switch, opt-out, closed window, paused bot, active agent) and the
 * precedence ladder are asserted through the same mocks — the ladder decides
 * WHICH single reply a customer gets, so a reordering that swaps a keyword
 * answer for a greeting is a behaviour change nothing else would catch.
 *
 * The second half of the file drops the mocks entirely and asserts the pure
 * helpers directly. They take `now` as an argument, which is the only way to pin
 * a DST rollover, an overnight window at 02:00, or a holiday that falls on a
 * different calendar date in the operator's timezone than it does in UTC —
 * through the engine those can only ever be probed at whatever moment the suite
 * happens to run.
 */

const prismaMock = {
  waSettings: { findUnique: jest.fn() },
  waConversation: { findUnique: jest.fn() },
  waMessage: { findFirst: jest.fn() },
  waFaq: { findUnique: jest.fn(), update: jest.fn() },
  waKeywordRule: { findMany: jest.fn(), update: jest.fn() },
  // The stateful automation layer: a running session is advanced before any
  // other branch, and the trigger scan runs ahead of the keyword rules.
  waBotFlow: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  waContact: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

const redisMock = {
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  decr: jest.fn(),
  del: jest.fn(),
};
jest.mock('../../config/redis', () => ({ redis: redisMock }));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/whatsapp-metrics', () => ({
  waAutomationTotal: { inc: jest.fn() },
}));

const sendSessionMessageMock = jest.fn();
const sendTemplateToConversationMock = jest.fn();
const sendInteractiveMessageMock = jest.fn();
jest.mock('../whatsapp-send.service', () => ({
  sendSessionMessage: sendSessionMessageMock,
  sendTemplateToConversation: sendTemplateToConversationMock,
  sendInteractiveMessage: sendInteractiveMessageMock,
}));

jest.mock('../whatsapp-conversation.service', () => ({
  windowOpen: (expiresAt: Date | null) => !!expiresAt && expiresAt.getTime() > Date.now(),
}));

jest.mock('../whatsapp-campaign.service', () => ({ resolveTemplateVars: () => [] }));

const listActiveFaqsForMenuMock = jest.fn();
jest.mock('../whatsapp-faq.service', () => ({
  listActiveFaqsForMenu: listActiveFaqsForMenuMock,
}));

import {
  handleInboundAutoReply,
  keywordMatches,
  nowInTz,
  parseHmToMinutes,
  withinBusinessHours,
} from '../whatsapp-autoreply.service';
import logger from '../../config/logger';

const CONV_ID = 'conv1';
const CONTACT_ID = 'contact1';

/** The 30-minute away claim, in the exact shape the debounce depends on. */
const AWAY_CLAIM = [`wa:away:${CONV_ID}`, '1', 'EX', 1800, 'NX'];

const inbound = (overrides: Record<string, unknown> = {}) => ({
  conversationId: CONV_ID,
  contactId: CONTACT_ID,
  channelId: 'chan1',
  text: 'anyone there?',
  buttonId: null,
  buttonTitle: null,
  isNewConversation: false,
  ...overrides,
});

/** The baseline console configuration: automation on, away mode on, no FAQ menu. */
const defaultSettings = {
  id: 'default',
  autoReplyEnabled: true,
  awayMode: true,
  awayMessage: 'We are closed right now — we will reply in the morning.',
  welcomeMessage: 'Hi! Thanks for messaging us.',
  faqMenuEnabled: false,
  faqTriggerKeywords: [] as string[],
  businessHours: null as unknown,
};

/** Re-point the settings row, changing only what a test is actually about. */
const withSettings = (overrides: Record<string, unknown>) =>
  prismaMock.waSettings.findUnique.mockResolvedValue({ ...defaultSettings, ...overrides });

/** An outbound row as `dispatchOutbound` returns it — sent, or FAILED but returned. */
const sentRow = { id: 'out1', status: 'SENT', errorCode: null };
const failedRow = (errorCode: string) => ({ id: 'out1', status: 'FAILED', errorCode });

beforeEach(() => {
  jest.clearAllMocks();

  prismaMock.waSettings.findUnique.mockResolvedValue({ ...defaultSettings });
  prismaMock.waConversation.findUnique.mockResolvedValue({
    windowExpiresAt: new Date(Date.now() + 3600_000),
    botPausedUntil: null,
    // No bot-flow session running: the flow layer short-circuits the whole
    // ladder when one is, so every test below assumes there is not.
    flowState: null,
    flowStateUpdatedAt: null,
    labels: [],
    contact: { optInStatus: 'OPTED_IN' },
  });
  prismaMock.waMessage.findFirst.mockResolvedValue(null); // no recent agent reply
  prismaMock.waBotFlow.findMany.mockResolvedValue([]); // no flows configured
  prismaMock.waKeywordRule.findMany.mockResolvedValue([]);
  prismaMock.waKeywordRule.update.mockResolvedValue({});
  prismaMock.waContact.updateMany.mockResolvedValue({ count: 1 });
  listActiveFaqsForMenuMock.mockResolvedValue([]);

  // Redis: every claim is granted, every counter well under its cap.
  redisMock.incr.mockResolvedValue(1);
  redisMock.expire.mockResolvedValue(1);
  redisMock.set.mockResolvedValue('OK');
  redisMock.decr.mockResolvedValue(0);
  redisMock.del.mockResolvedValue(1);

  sendSessionMessageMock.mockResolvedValue(sentRow);
  sendTemplateToConversationMock.mockResolvedValue(sentRow);
  sendInteractiveMessageMock.mockResolvedValue(sentRow);
});

describe('away message', () => {
  it('claims the 30-minute window in Redis BEFORE sending', async () => {
    await handleInboundAutoReply(inbound());

    expect(redisMock.set).toHaveBeenCalledWith(...AWAY_CLAIM);
    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'We are closed right now — we will reply in the morning.',
    });

    // The debounce must NOT be a lookback over persisted outbound rows: the only
    // findFirst left is the human-handoff check.
    expect(prismaMock.waMessage.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.waMessage.findFirst.mock.calls[0][0].where).toMatchObject({
      sentByUserId: { not: null },
    });
  });

  it('sends nothing when another run already holds the claim', async () => {
    // SET NX answers null for the loser. Two messages from the same customer
    // landing together used to both pass a read of persisted state — neither
    // away reply had been written yet — and the customer got it twice.
    redisMock.set.mockImplementation((key: string) =>
      Promise.resolve(key === `wa:away:${CONV_ID}` ? null : 'OK')
    );

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
  });

  it('gives the claim back and rethrows when Meta fails transiently', async () => {
    // A Graph 500 comes back as a persisted FAILED row rather than a throw, so it
    // used to look exactly like a delivered reply. Nothing was said, so the
    // conversation must not stay muted for the next half hour — and the throw is
    // what makes BullMQ try again.
    sendSessionMessageMock.mockResolvedValue(failedRow('500'));

    await expect(handleInboundAutoReply(inbound())).rejects.toThrow('failed transiently');

    expect(redisMock.del).toHaveBeenCalledWith(`wa:away:${CONV_ID}`);
    expect(redisMock.del).toHaveBeenCalledWith(`wa:auto:rule:away:${CONV_ID}`);
  });

  it('does not retry a permanent failure', async () => {
    // 131047 (re-engagement required) cannot succeed on a second attempt, so it
    // resolves — burning three attempts on it would only delay the failed set.
    sendSessionMessageMock.mockResolvedValue(failedRow('131047'));

    await expect(handleInboundAutoReply(inbound())).resolves.toBeUndefined();
  });
});

describe('failure propagation', () => {
  it('rethrows an infrastructure failure instead of swallowing it', async () => {
    // This is the whole reason the engine is a job now: a pool timeout used to
    // end in a single logger.warn and the customer's reply was gone for good.
    prismaMock.waSettings.findUnique.mockRejectedValue(new Error('pool timeout'));

    await expect(handleInboundAutoReply(inbound())).rejects.toThrow('pool timeout');
  });

  it('un-claims welcomedAt when the greeting could not be sent', async () => {
    // `welcomedAt` is stamped before the send so two inbounds cannot both greet.
    // Left stamped after a failure the retry skips the welcome entirely and falls
    // through to the away message — the customer is never actually greeted.
    sendSessionMessageMock.mockResolvedValue(failedRow('request_timeout'));

    await expect(handleInboundAutoReply(inbound({ isNewConversation: true }))).rejects.toThrow(
      'failed transiently'
    );

    expect(prismaMock.waContact.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waContact.updateMany.mock.calls[1][0]).toEqual({
      where: { id: CONTACT_ID },
      data: { welcomedAt: null },
    });
  });
});

describe('keyword rules', () => {
  it('refunds the rule cooldown when the reply fails, so the retry can send', async () => {
    prismaMock.waKeywordRule.findMany.mockResolvedValue([
      {
        id: 'rule1',
        isActive: true,
        matchType: 'contains',
        match: 'hours',
        replyText: 'We open at 9.',
      },
    ]);
    sendSessionMessageMock.mockResolvedValue(failedRow('circuit_open'));

    await expect(handleInboundAutoReply(inbound({ text: 'what are your hours?' }))).rejects.toThrow(
      'failed transiently'
    );

    // Without the refund the retry lands inside the 60s cooldown this attempt
    // took and reports "throttled" — a green job that sent nothing.
    expect(redisMock.del).toHaveBeenCalledWith(`wa:auto:rule:rule1:${CONV_ID}`);
  });

  it('ignores a rule whose matchType is not one the engine implements', async () => {
    // The switch used to end `case 'contains': default:`, so a row carrying a
    // typo'd or legacy matchType silently substring-matched: the rule fired on
    // inputs nobody had asked for while the console displayed something else.
    prismaMock.waKeywordRule.findMany.mockResolvedValue([
      {
        id: 'rule1',
        isActive: true,
        matchType: 'fuzzy',
        match: 'hours',
        replyText: 'We open at 9.',
      },
    ]);

    await handleInboundAutoReply(inbound({ text: 'what are your hours?' }));

    expect(sendSessionMessageMock).not.toHaveBeenCalledWith(
      CONV_ID,
      null,
      expect.objectContaining({ text: 'We open at 9.' })
    );
  });
});

describe('business hours', () => {
  /** The away branch fires on `awayMode || !withinBusinessHours(...)`. */
  const outsideHoursSettings = (businessHours: unknown) => {
    prismaMock.waSettings.findUnique.mockResolvedValue({
      id: 'default',
      autoReplyEnabled: true,
      awayMode: false, // so ONLY the business-hours verdict can trigger the away reply
      awayMessage: 'We are closed right now — we will reply in the morning.',
      welcomeMessage: 'Hi! Thanks for messaging us.',
      faqMenuEnabled: false,
      faqTriggerKeywords: [],
      businessHours,
    });
  };

  it('treats a missing configuration as always open', async () => {
    outsideHoursSettings(null);

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
  });

  it('treats an EMPTY days array as closed all week, not as always open', async () => {
    // The inverted case: an operator who unchecks every day (holiday shutdown,
    // unstaffed number) used to get permanently OPEN — the exact opposite — and
    // the away auto-reply never fired again, with nothing saying so.
    outsideHoursSettings({ tz: 'UTC', days: [] });

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'We are closed right now — we will reply in the morning.',
    });
  });

  it('honours a second window on the same weekday (split shift)', async () => {
    // The lunch-closure shape is two rows for one weekday, and the second must
    // still count. Between them these two cover the whole day (the afternoon one
    // closes at midnight), so whatever hour the suite runs at it reads as open.
    const days = [];
    for (let day = 0; day < 7; day++) {
      days.push({ day, open: '00:00', close: '12:00' });
      days.push({ day, open: '12:00', close: '00:00' });
    }
    outsideHoursSettings({ tz: 'UTC', days });

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
  });

  it('closes on a date exception even when the weekly grid says open', async () => {
    const days = [];
    // open === close means 24h, so the grid is unambiguously open all week and
    // only the exception can account for an away message.
    for (let day = 0; day < 7; day++) days.push({ day, open: '00:00', close: '00:00' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
    outsideHoursSettings({
      tz: 'UTC',
      days,
      exceptions: [{ date: today, closed: true, label: 'Public holiday' }],
    });

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
  });

  it('matches an annually-repeating exception on its month and day', async () => {
    const days = [];
    // open === close means 24h, so the grid is unambiguously open all week and
    // only the exception can account for an away message.
    for (let day = 0; day < 7; day++) days.push({ day, open: '00:00', close: '00:00' });
    // Same MM-DD, a year that is definitely not this one.
    const mmdd = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date()).slice(5);
    outsideHoursSettings({
      tz: 'UTC',
      days,
      exceptions: [{ date: `1999-${mmdd}`, closed: true, repeatsAnnually: true }],
    });

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe('the guards above the ladder', () => {
  /** A rule that answers "what are your hours?", used to prove it did NOT fire. */
  const hoursRule = {
    id: 'rule1',
    isActive: true,
    matchType: 'contains',
    match: 'hours',
    replyText: 'We open at 9.',
  };

  it('says nothing at all when the master switch is off', async () => {
    // The checkbox reads "Enable automatic replies", but keyword rules used to
    // run unconditionally and the FAQ menu gated only on its own flag, so an
    // operator who turned automation off still had a bot talking to customers.
    withSettings({ autoReplyEnabled: false });
    prismaMock.waKeywordRule.findMany.mockResolvedValue([hoursRule]);

    await handleInboundAutoReply(
      inbound({ text: 'what are your hours?', isNewConversation: true })
    );

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.waKeywordRule.findMany).not.toHaveBeenCalled();
    expect(prismaMock.waContact.updateMany).not.toHaveBeenCalled();
  });

  it('says nothing to a contact who has opted out', async () => {
    // Opt-out awareness lived in the caller, and only for the single message
    // that carried the keyword — so a customer who replied STOP kept getting
    // welcome, away and keyword replies on everything they sent afterwards.
    prismaMock.waConversation.findUnique.mockResolvedValue({
      windowExpiresAt: new Date(Date.now() + 3600_000),
      botPausedUntil: null,
      contact: { optInStatus: 'OPTED_OUT' },
    });
    prismaMock.waKeywordRule.findMany.mockResolvedValue([hoursRule]);

    await handleInboundAutoReply(
      inbound({ text: 'what are your hours?', isNewConversation: true })
    );

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.waContact.updateMany).not.toHaveBeenCalled();
  });

  it('says nothing once the 24-hour window has closed', async () => {
    // Free-form text outside the window is rejected by Meta, so an auto-reply
    // here can only ever produce a failed send and a job that retries into the
    // same wall.
    prismaMock.waConversation.findUnique.mockResolvedValue({
      windowExpiresAt: new Date(Date.now() - 1000),
      botPausedUntil: null,
      contact: { optInStatus: 'OPTED_IN' },
    });

    await handleInboundAutoReply(inbound());

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
  });

  it('stays quiet while the bot is explicitly paused on the thread', async () => {
    prismaMock.waConversation.findUnique.mockResolvedValue({
      windowExpiresAt: new Date(Date.now() + 3600_000),
      botPausedUntil: new Date(Date.now() + 600_000),
      contact: { optInStatus: 'OPTED_IN' },
    });
    prismaMock.waKeywordRule.findMany.mockResolvedValue([hoursRule]);

    await handleInboundAutoReply(inbound({ text: 'what are your hours?' }));

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
    // The pause short-circuits above the handoff lookback, so it costs no query.
    expect(prismaMock.waMessage.findFirst).not.toHaveBeenCalled();
  });

  it('stays quiet while a human is mid-conversation', async () => {
    // An agent could be de-escalating an angry customer and a keyword rule would
    // still cut in with a canned line underneath their reply.
    prismaMock.waMessage.findFirst.mockResolvedValue({ id: 'agentmsg1' });
    prismaMock.waKeywordRule.findMany.mockResolvedValue([hoursRule]);

    await handleInboundAutoReply(inbound({ text: 'what are your hours?' }));

    expect(sendSessionMessageMock).not.toHaveBeenCalled();
  });

  it('still answers an FAQ the customer tapped while an agent is active', async () => {
    // The agent guard deliberately does NOT cover this branch: the customer
    // tapped a row on a menu the bot itself sent, so an unanswered tap reads as
    // a broken button rather than as a human taking over.
    prismaMock.waMessage.findFirst.mockResolvedValue({ id: 'agentmsg1' });
    prismaMock.waFaq.findUnique.mockResolvedValue({
      id: 'faq1',
      isActive: true,
      answer: 'We ship within three working days.',
    });
    prismaMock.waFaq.update.mockResolvedValue({});

    await handleInboundAutoReply(inbound({ buttonId: 'faq_faq1', buttonTitle: 'Shipping' }));

    expect(prismaMock.waFaq.findUnique).toHaveBeenCalledWith({ where: { id: 'faq1' } });
    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'We ship within three working days.',
    });
  });

  it('apologises and re-offers the live topics when the tapped FAQ was retired', async () => {
    // List menus stay tappable in the chat history forever, so a customer
    // scrolling back to last week's menu can tap a topic that has since been
    // deleted. Silence is the worst possible answer to somebody who has just
    // visibly interacted.
    prismaMock.waFaq.findUnique.mockResolvedValue(null);
    listActiveFaqsForMenuMock.mockResolvedValue([{ id: 'faq2', question: 'Where is my order?' }]);

    await handleInboundAutoReply(inbound({ buttonId: 'faq_gone', buttonTitle: 'Shipping' }));

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2].text).toMatch(/no longer available/);
    // …and the menu of what IS still answerable, from the rows already read.
    expect(sendInteractiveMessageMock).toHaveBeenCalledTimes(1);
    expect(listActiveFaqsForMenuMock).toHaveBeenCalledTimes(1);
  });

  it('hands a retired FAQ tap to the ladder when there is nothing left to offer', async () => {
    // Every FAQ retired and no fallback sentence configured: the built-in
    // apology ends by promising the topics that ARE available, so sending it
    // here would leave the customer reading a promise with nothing after it.
    // The away message is a better answer than that, and it is what the rest of
    // the ladder now gets to give.
    prismaMock.waFaq.findUnique.mockResolvedValue(null);
    listActiveFaqsForMenuMock.mockResolvedValue([]);

    await handleInboundAutoReply(inbound({ buttonId: 'faq_gone', buttonTitle: 'Shipping' }));

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: defaultSettings.awayMessage,
    });
    expect(sendInteractiveMessageMock).not.toHaveBeenCalled();
  });
});

describe('precedence — at most one auto-reply per inbound', () => {
  const pricingRule = {
    id: 'rule1',
    isActive: true,
    matchType: 'contains',
    match: 'pricing',
    replyText: 'Plans start at 999.',
  };

  it('lets the FAQ menu answer a trigger word before any keyword rule sees it', async () => {
    withSettings({ faqMenuEnabled: true, faqTriggerKeywords: ['help'] });
    listActiveFaqsForMenuMock.mockResolvedValue([
      { id: 'faq1', question: 'How do I track my order?' },
    ]);
    prismaMock.waKeywordRule.findMany.mockResolvedValue([
      { ...pricingRule, match: 'help', replyText: 'Tell us what you need.' },
    ]);

    await handleInboundAutoReply(inbound({ text: 'help' }));

    expect(sendInteractiveMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock).not.toHaveBeenCalled();
    // The menu ends the pass, so the rule table is never even read.
    expect(prismaMock.waKeywordRule.findMany).not.toHaveBeenCalled();
  });

  it('matches a rule against the button the customer tapped, not just its id', async () => {
    // Rules were matched against the button id alone whenever one was present,
    // so a quick reply labelled "Pricing" carrying the composer-generated id
    // `btn_1` could not be matched by any rule an operator would think to write.
    prismaMock.waKeywordRule.findMany.mockResolvedValue([pricingRule]);

    await handleInboundAutoReply(
      inbound({ buttonId: 'btn_1', buttonTitle: 'Pricing', text: null })
    );

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'Plans start at 999.',
    });
  });

  it('answers a first-message keyword with the rule, not the welcome or the away line', async () => {
    // All three branches are armed here: new conversation, away mode on, and a
    // matching rule. The customer asked a question — greeting them or telling
    // them we are closed is the wrong one of the three, and only one is sent.
    prismaMock.waKeywordRule.findMany.mockResolvedValue([pricingRule]);

    await handleInboundAutoReply(
      inbound({ text: 'what is your pricing?', isNewConversation: true })
    );

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'Plans start at 999.',
    });
    // The welcome was never claimed, so this customer still gets greeted on the
    // next message rather than silently losing the greeting to a keyword hit.
    expect(prismaMock.waContact.updateMany).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalledWith(...AWAY_CLAIM);
  });

  it('greets a new conversation instead of telling it we are away', async () => {
    await handleInboundAutoReply(inbound({ isNewConversation: true }));

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'Hi! Thanks for messaging us.',
    });
    expect(redisMock.set).not.toHaveBeenCalledWith(...AWAY_CLAIM);
  });

  it('falls through to the away message when the contact was already welcomed', async () => {
    // The guarded updateMany IS the claim: count 0 means another worker (or an
    // earlier conversation) already greeted this contact. Reading that as
    // "greeting sent" would leave an out-of-hours customer with no reply at all.
    prismaMock.waContact.updateMany.mockResolvedValue({ count: 0 });

    await handleInboundAutoReply(inbound({ isNewConversation: true }));

    expect(sendSessionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSessionMessageMock.mock.calls[0][2]).toEqual({
      type: 'text',
      text: 'We are closed right now — we will reply in the morning.',
    });
  });
});

/* ------------------------------------------------------------------------- *
 * The pure helpers, asserted directly at fixed instants.
 * ------------------------------------------------------------------------- */

/** Monday 5 January 2026, 10:00 UTC — the reference "middle of a working day". */
const MON_10_00 = new Date('2026-01-05T10:00:00Z');

/** A grid that is unambiguously open all week (open === close means 24 hours). */
const alwaysOpenDays = () =>
  Array.from({ length: 7 }, (_, day) => ({ day, open: '00:00', close: '00:00' }));

describe('parseHmToMinutes', () => {
  it.each([
    ['00:00', 0],
    ['09:30', 570],
    ['9:30', 570],
    ['17:00', 1020],
    ['  17:00  ', 1020],
    ['23:59', 1439],
  ])('reads %s as %i minutes past midnight', (input, expected) => {
    expect(parseHmToMinutes(input)).toBe(expected);
  });

  it.each([
    ['24:00'], // not a clock time the picker can produce
    ['12:60'],
    ['9:5'], // minutes must be two digits, or "9:5" reads as 09:05 by accident
    ['0930'],
    ['12:'],
    [':30'],
    ['9am'],
    [''],
    ['   '],
  ])('rejects %p rather than guessing', (input) => {
    expect(parseHmToMinutes(input)).toBeNull();
  });

  it('rejects a missing or non-string value', () => {
    // businessHours is a JSON column, so a row written by an older client can
    // carry anything at all here.
    expect(parseHmToMinutes(null)).toBeNull();
    expect(parseHmToMinutes(undefined)).toBeNull();
    expect(parseHmToMinutes(930 as unknown as string)).toBeNull();
  });
});

describe('nowInTz', () => {
  it('reads the weekday, the clock and the calendar date from the SAME timezone', () => {
    // 18:45 UTC on Thursday 1 January is already 00:15 on Friday 2 January in
    // Kolkata. Taking the weekday from the tz while reading the date off the
    // container's UTC clock is what put fixed-date holidays on the wrong day for
    // the five and a half hours either side of local midnight.
    expect(nowInTz(new Date('2026-01-01T18:45:00Z'), 'Asia/Kolkata')).toEqual({
      day: 5,
      minutes: 15,
      ymd: '2026-01-02',
    });
  });

  it('reports midnight as 0 minutes, not 1440', () => {
    // Some ICU builds emit hour "24" for midnight under hour12:false; read
    // literally that is 1440, which sits outside every window there is.
    expect(nowInTz(new Date('2026-01-05T00:00:00Z'), 'UTC')).toEqual({
      day: 1,
      minutes: 0,
      ymd: '2026-01-05',
    });
  });

  it('tracks the offset change across a spring-forward', () => {
    // New York, 8 March 2026: 01:30 EST, then one hour of UTC later it is 03:30
    // EDT. 02:xx local does not happen at all that day.
    expect(nowInTz(new Date('2026-03-08T06:30:00Z'), 'America/New_York')).toMatchObject({
      day: 0,
      minutes: 90,
    });
    expect(nowInTz(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toMatchObject({
      day: 0,
      minutes: 210,
    });
  });

  it('falls back to the server clock for a timezone Intl does not know', () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    expect(nowInTz(MON_10_00, 'Mars/Olympus_Mons')).toEqual({
      day: MON_10_00.getDay(),
      minutes: MON_10_00.getHours() * 60 + MON_10_00.getMinutes(),
      ymd: `${MON_10_00.getFullYear()}-${pad2(MON_10_00.getMonth() + 1)}-${pad2(
        MON_10_00.getDate()
      )}`,
    });
  });

  it('falls back to the server clock when no timezone is configured', () => {
    expect(nowInTz(MON_10_00, undefined)).toEqual(nowInTz(MON_10_00, 'Mars/Olympus_Mons'));
  });
});

describe('withinBusinessHours', () => {
  describe('not configured vs configured closed', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an object with no days key', { tz: 'UTC' }],
      ['a days value that is not an array', { tz: 'UTC', days: 'weekdays' }],
    ])('treats %s as not configured, so always open', (_label, businessHours) => {
      expect(withinBusinessHours(businessHours, MON_10_00)).toBe(true);
    });

    it('treats an EMPTY days array as closed all week', () => {
      // The inverted case: unchecking all seven days (holiday shutdown, an
      // unstaffed number) used to collapse into "not configured" and read as
      // permanently OPEN, so the away auto-reply never fired again and nothing
      // in the UI said so.
      expect(withinBusinessHours({ tz: 'UTC', days: [] }, MON_10_00)).toBe(false);
    });
  });

  describe('a single same-day window', () => {
    const bh = { tz: 'UTC', days: [{ day: 1, open: '09:00', close: '17:00' }] };

    it.each([
      ['08:59, a minute before it opens', '2026-01-05T08:59:00Z', false],
      ['09:00, the minute it opens', '2026-01-05T09:00:00Z', true],
      ['13:00', '2026-01-05T13:00:00Z', true],
      ['16:59', '2026-01-05T16:59:00Z', true],
      ['17:00, the minute it closes', '2026-01-05T17:00:00Z', false],
      ['23:30', '2026-01-05T23:30:00Z', false],
    ])('at %s is %p', (_label, iso, expected) => {
      expect(withinBusinessHours(bh, new Date(iso))).toBe(expected);
    });

    it('is closed on a weekday with no slot at all', () => {
      expect(withinBusinessHours(bh, new Date('2026-01-06T13:00:00Z'))).toBe(false);
    });

    it('honours a second window on the same weekday (a lunch closure)', () => {
      const split = {
        tz: 'UTC',
        days: [
          { day: 1, open: '09:00', close: '13:00' },
          { day: 1, open: '14:00', close: '18:00' },
        ],
      };
      expect(withinBusinessHours(split, new Date('2026-01-05T13:30:00Z'))).toBe(false);
      expect(withinBusinessHours(split, new Date('2026-01-05T15:00:00Z'))).toBe(true);
    });

    it('reads open === close as open for the whole of that day', () => {
      const allDayMonday = { tz: 'UTC', days: [{ day: 1, open: '12:00', close: '12:00' }] };
      expect(withinBusinessHours(allDayMonday, new Date('2026-01-05T00:05:00Z'))).toBe(true);
      expect(withinBusinessHours(allDayMonday, MON_10_00)).toBe(true);
      expect(withinBusinessHours(allDayMonday, new Date('2026-01-05T23:55:00Z'))).toBe(true);
      // …and only that day: it must not bleed into Tuesday as an overnight slot.
      expect(withinBusinessHours(allDayMonday, new Date('2026-01-06T10:00:00Z'))).toBe(false);
    });
  });

  describe('an overnight window', () => {
    // One Friday-night shift, 22:00 to 06:00 — what a desk covering the small
    // hours actually configures.
    const bh = { tz: 'UTC', days: [{ day: 5, open: '22:00', close: '06:00' }] };

    it.each([
      ['Friday 21:00, before it opens', '2026-01-02T21:00:00Z', false],
      ['Friday 22:00, the minute it opens', '2026-01-02T22:00:00Z', true],
      ['Friday 23:30, the evening half', '2026-01-02T23:30:00Z', true],
      ['Saturday 00:10, just past midnight', '2026-01-03T00:10:00Z', true],
      ['Saturday 02:30, the small-hours half still running', '2026-01-03T02:30:00Z', true],
      ['Saturday 06:00, the minute it closes', '2026-01-03T06:00:00Z', false],
      ['Saturday 07:00, after it closes', '2026-01-03T07:00:00Z', false],
      ['Thursday 02:30, a night this shift never covered', '2026-01-01T02:30:00Z', false],
    ])('at %s is %p', (_label, iso, expected) => {
      // The post-midnight half belongs to the day the slot OPENS on: at 02:00 on
      // Saturday the Friday slot still has day === 5 while the clock says 6.
      // Matching only today's slots read the window as closed for its whole
      // small-hours half, and away messages fired all night on a staffed desk.
      expect(withinBusinessHours(bh, new Date(iso))).toBe(expected);
    });
  });

  describe('malformed rows', () => {
    it('skips a slot whose time will not parse rather than reading it as midnight', () => {
      expect(
        withinBusinessHours(
          { tz: 'UTC', days: [{ day: 1, open: '9am', close: '17:00' }] },
          MON_10_00
        )
      ).toBe(false);
    });

    it('still honours the sound rows alongside a broken one', () => {
      const bh = {
        tz: 'UTC',
        days: [
          { day: 1, open: '9am', close: '17:00' },
          { day: 1, open: '09:00', close: '17:00' },
        ],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
    });

    it('survives a null entry in the days array', () => {
      const bh = { tz: 'UTC', days: [null, { day: 1, open: '09:00', close: '17:00' }] };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
    });
  });

  describe('date exceptions', () => {
    const days = alwaysOpenDays();

    it('closes for the day even though the weekly grid says open', () => {
      const bh = { tz: 'UTC', days, exceptions: [{ date: '2026-01-05', closed: true }] };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(false);
    });

    it('applies a half-day window in place of the grid', () => {
      const bh = {
        tz: 'UTC',
        days,
        exceptions: [{ date: '2026-01-05', open: '09:00', close: '12:00' }],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
      expect(withinBusinessHours(bh, new Date('2026-01-05T13:00:00Z'))).toBe(false);
    });

    it('matches an annually-repeating entry on its month and day in any year', () => {
      const bh = {
        tz: 'UTC',
        days,
        exceptions: [{ date: '1999-01-05', closed: true, repeatsAnnually: true }],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(false);
    });

    it('does not match an annual entry on a different date', () => {
      const bh = {
        tz: 'UTC',
        days,
        exceptions: [{ date: '1999-01-06', closed: true, repeatsAnnually: true }],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
    });

    it('lets an exact-date entry beat an annual one for the same month and day', () => {
      // "Closed every 5 January, but open on 5 January 2026" — and the specific
      // year has to win wherever it sits in the array, not only when it happens
      // to be listed first.
      const bh = {
        tz: 'UTC',
        days,
        exceptions: [
          { date: '1999-01-05', closed: true, repeatsAnnually: true },
          { date: '2026-01-05', open: '09:00', close: '17:00' },
        ],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
    });

    it('falls through to the weekly grid when the entry says nothing usable', () => {
      // Neither `closed` nor a parseable window: guessing either way would be a
      // silent all-day override the operator never asked for.
      const bh = {
        tz: 'UTC',
        days: [{ day: 1, open: '09:00', close: '17:00' }],
        exceptions: [{ date: '2026-01-05' }],
      };
      expect(withinBusinessHours(bh, MON_10_00)).toBe(true);
      expect(withinBusinessHours(bh, new Date('2026-01-05T18:00:00Z'))).toBe(false);
    });

    it('overrides an overnight window still running from the night before', () => {
      const bh = {
        tz: 'UTC',
        days: [{ day: 5, open: '22:00', close: '06:00' }],
        exceptions: [{ date: '2026-01-03', closed: true }],
      };
      expect(withinBusinessHours(bh, new Date('2026-01-03T02:30:00Z'))).toBe(false);
    });

    it('reads the exception date in the configured timezone, not in UTC', () => {
      // 18:45 UTC on 1 January is 00:15 on 2 January in Kolkata: the holiday that
      // has already started locally must apply, and yesterday's must not.
      const at = new Date('2026-01-01T18:45:00Z');
      expect(
        withinBusinessHours(
          { tz: 'Asia/Kolkata', days, exceptions: [{ date: '2026-01-02', closed: true }] },
          at
        )
      ).toBe(false);
      expect(
        withinBusinessHours(
          { tz: 'Asia/Kolkata', days, exceptions: [{ date: '2026-01-01', closed: true }] },
          at
        )
      ).toBe(true);
    });
  });

  describe('daylight saving', () => {
    it('follows the operator wall clock across a spring-forward', () => {
      // 13:30 UTC is 08:30 in New York on EST and 09:30 on EDT. A desk opening at
      // 09:00 is shut at that instant in early March and open at the same instant
      // a fortnight later — a fixed UTC offset gets one of the two wrong, and the
      // customer is told nobody is here in the middle of the working day.
      const bh = {
        tz: 'America/New_York',
        days: Array.from({ length: 7 }, (_, day) => ({ day, open: '09:00', close: '17:00' })),
      };
      expect(withinBusinessHours(bh, new Date('2026-03-01T13:30:00Z'))).toBe(false);
      expect(withinBusinessHours(bh, new Date('2026-03-15T13:30:00Z'))).toBe(true);
    });

    it('is closed through the London hour that does not exist', () => {
      // 01:00-02:00 local never happens on 29 March 2026: 00:30 UTC is 00:30 GMT
      // and 01:30 UTC is already 02:30 BST.
      const bh = { tz: 'Europe/London', days: [{ day: 0, open: '01:00', close: '02:00' }] };
      expect(withinBusinessHours(bh, new Date('2026-03-29T00:30:00Z'))).toBe(false);
      expect(withinBusinessHours(bh, new Date('2026-03-29T01:30:00Z'))).toBe(false);
    });

    it('is open for both passes through the repeated London hour', () => {
      // On 25 October 2026 01:30 local happens twice, once on BST and once on
      // GMT. The desk is staffed for both, so both are inside the window.
      const bh = { tz: 'Europe/London', days: [{ day: 0, open: '01:00', close: '02:00' }] };
      expect(withinBusinessHours(bh, new Date('2026-10-25T00:30:00Z'))).toBe(true);
      expect(withinBusinessHours(bh, new Date('2026-10-25T01:30:00Z'))).toBe(true);
    });
  });

  it('falls back to the server weekday when the timezone is not a real one', () => {
    const { day } = nowInTz(MON_10_00, undefined);
    expect(
      withinBusinessHours(
        { tz: 'Mars/Olympus_Mons', days: [{ day, open: '00:00', close: '00:00' }] },
        MON_10_00
      )
    ).toBe(true);
    expect(
      withinBusinessHours(
        { tz: 'Mars/Olympus_Mons', days: [{ day: (day + 1) % 7, open: '00:00', close: '00:00' }] },
        MON_10_00
      )
    ).toBe(false);
  });
});

describe('keywordMatches', () => {
  describe('exact', () => {
    it.each([
      ['STOP', true], // casing
      [' stop ', true], // surrounding whitespace
      ['ＳＴＯＰ', true], // full-width, folded by NFKC
      ['stop.', true], // framing punctuation
      ['«stop»', true],
      ['stop now', false],
      ['stopped', false],
      ['', false],
    ])('keyword "stop" against %p is %p', (haystack, expected) => {
      // A customer whose keyboard produced the full-width form, or who typed
      // "stop." out of habit, never matched a rule the operator had tested by
      // hand — and for STOP that is an opt-out silently ignored.
      expect(keywordMatches('exact', 'stop', haystack)).toBe(expected);
    });
  });

  describe('starts', () => {
    it.each([
      ['order status please', true],
      ['ORDER #42', true],
      ['my order', false],
    ])('keyword "order" against %p is %p', (haystack, expected) => {
      expect(keywordMatches('starts', 'order', haystack)).toBe(expected);
    });
  });

  describe('contains', () => {
    it.each([
      ['no thanks', true],
      ['yes, no!', true],
      ['NO', true],
      ['notes', false],
      ['another', false],
      ['now', false],
    ])('keyword "no" against %p is %p', (haystack, expected) => {
      // A bare includes() fired "no" on "notes", "now" and "another"; because the
      // engine stops at the first hit, that one over-broad rule shadowed every
      // rule beneath it, with nothing on screen to explain why.
      expect(keywordMatches('contains', 'no', haystack)).toBe(expected);
    });

    it('matches a multi-word keyword on a word boundary', () => {
      expect(keywordMatches('contains', 'gst no', 'my gst no is 27ABC')).toBe(true);
      expect(keywordMatches('contains', 'gst no', 'my gst nothing')).toBe(false);
    });
  });

  describe('substring', () => {
    it('is the deliberately permissive mode the old `contains` used to be', () => {
      expect(keywordMatches('substring', 'no', 'notes')).toBe(true);
    });

    it('matches against the raw text, so a punctuated keyword still works', () => {
      expect(keywordMatches('substring', 'price?', 'what is the price? thanks')).toBe(true);
    });

    it('does not look past the 4000-character bound', () => {
      // The bound is what keeps a rule pattern off an unbounded message, so
      // assert it is really applied rather than just documented.
      expect(keywordMatches('substring', 'stop', `${'a'.repeat(4000)} stop`)).toBe(false);
      expect(keywordMatches('substring', 'stop', `${'a'.repeat(3990)} stop`)).toBe(true);
    });
  });

  describe('regex', () => {
    it.each([
      ['^hi\\b', 'hi there', true],
      ['^hi\\b', 'high street', false],
      ['(order|tracking) id', 'my TRACKING ID is 9', true],
    ])('pattern %p against %p is %p', (pattern, haystack, expected) => {
      expect(keywordMatches('regex', pattern, haystack)).toBe(expected);
    });

    it('refuses an invalid pattern instead of taking the worker down', () => {
      expect(keywordMatches('regex', '(', 'anything at all')).toBe(false);
    });

    it('refuses a pattern longer than 200 characters', () => {
      expect(keywordMatches('regex', 'a'.repeat(201), 'a'.repeat(201))).toBe(false);
    });
  });

  it.each([['exact'], ['contains'], ['starts'], ['substring'], ['regex']])(
    'never matches on an empty keyword or an empty message (%s)',
    (matchType) => {
      expect(keywordMatches(matchType, '', 'hello')).toBe(false);
      expect(keywordMatches(matchType, '   ', 'hello')).toBe(false);
      expect(keywordMatches(matchType, 'hello', '')).toBe(false);
      expect(keywordMatches(matchType, 'hello', '   ')).toBe(false);
    }
  );

  it('refuses an unrecognised matchType and warns once per distinct value', () => {
    // Falling through to `contains` made the rule fire on inputs nobody had
    // asked for while the console still showed the matchType it was saved with.
    // The warn is once per value because this runs per inbound message.
    const warn = logger.warn as unknown as jest.Mock;

    expect(keywordMatches('levenshtein', 'hours', 'what are your hours?')).toBe(false);
    expect(keywordMatches('levenshtein', 'hours', 'hours')).toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('levenshtein');
  });
});
