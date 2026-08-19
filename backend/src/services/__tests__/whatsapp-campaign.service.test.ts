/**
 * Tests for the campaign service (src/services/whatsapp-campaign.service.ts).
 *
 * This module decides three things that cost money and consent when they are
 * wrong: who is eligible to receive a campaign, whether a launch is allowed to
 * proceed at all, and how the audience is fed to the queue. Each has a specific
 * expensive failure — a marketing blast to a contact who never opted in, a
 * whole audience burned against a template Meta will reject for every single
 * recipient, and a 500k-row `findMany` buffered into the Node heap before the
 * first job is queued.
 *
 * Prisma and the sibling services are mocked; the eligibility and paging logic
 * under test is this module's own.
 */

const prismaMock = {
  waCampaign: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  waCampaignVariant: { findMany: jest.fn() },
  waCampaignStep: { findMany: jest.fn() },
  waCampaignRecipient: {
    count: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
  },
  waContact: { count: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  waSettings: { findUnique: jest.fn() },
  waMessage: { aggregate: jest.fn() },
  waConversion: { count: jest.fn() },
  // Meta's own billed volume/cost per day. The cost preview prefers the rate
  // OBSERVED here over the WHATSAPP_PRICE_*_PAISE constant (see
  // whatsapp-pricing.ts), so the estimate self-corrects once Meta has been synced.
  waMetaCostDaily: { groupBy: jest.fn() },
  // COUNT(DISTINCT "contactId") for the messaging-tier budget — Prisma has no
  // distinct-count, so that one is raw SQL.
  $queryRaw: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

jest.mock('../../config/env', () => ({
  env: {
    WHATSAPP_PRICE_MARKETING_PAISE: '78',
    WHATSAPP_PRICE_AUTH_PAISE: '30',
    WHATSAPP_PRICE_UTILITY_PAISE: '30',
  },
}));

const getTemplateMock = jest.fn();
const analyzeTemplateSpecMock = jest.fn();
const getTemplateHealthStatusMock = jest.fn();
jest.mock('../whatsapp-template.service', () => ({
  getTemplate: getTemplateMock,
  analyzeTemplateSpec: analyzeTemplateSpecMock,
  getTemplateHealthStatus: getTemplateHealthStatusMock,
  // Pure helper, mocked with its real behaviour: the launch gate counts one
  // supplied link value per dynamic URL button, and a stub returning nothing
  // would make every campaign look like it was missing its links.
  urlButtonValues: (supplied: { buttonUrlParam?: string; buttonUrlParams?: string[] }) =>
    supplied.buttonUrlParams?.length
      ? supplied.buttonUrlParams
      : supplied.buttonUrlParam
        ? [supplied.buttonUrlParam]
        : [],
}));

const getDefaultChannelMock = jest.fn();
const getPhoneHealthStatusMock = jest.fn();
jest.mock('../whatsapp-channel.service', () => ({
  getDefaultChannel: getDefaultChannelMock,
  getPhoneHealthStatus: getPhoneHealthStatusMock,
}));
jest.mock('../whatsapp-contact.service', () => ({
  normalizeWaPhone: (p: string) => String(p).replace(/[^\d]/g, ''),
  // The segment predicate moved here so the contacts list, the segment member
  // count and a campaign launch all resolve a saved segment identically. Mocked
  // with the real behaviour, since `matchesWhere` below evaluates what it builds.
  segmentContactWhere: (filter: Record<string, unknown> | null | undefined) => {
    const f = filter ?? {};
    const tags = Array.isArray(f.tags) ? f.tags.map((t: unknown) => String(t)).filter(Boolean) : [];
    // The rule grammar, cut down to the two fields these cases target. `op:'or'`
    // compiles to a top-level OR exactly as the real compiler does, which is the
    // shape any predicate built on top of this one has to survive.
    const rules = Array.isArray(f.rules) ? (f.rules as Record<string, unknown>[]) : [];
    const compiled: Record<string, unknown>[] = [];
    for (const r of rules) {
      if (r.field === 'optInStatus' && r.value) compiled.push({ optInStatus: String(r.value) });
      else if (r.field === 'tags' && Array.isArray(r.value)) {
        compiled.push({ tags: { hasSome: (r.value as unknown[]).map(String) } });
      }
    }
    const or =
      String(f.op ?? 'and').toLowerCase() === 'or' && compiled.length > 1 ? compiled : null;
    return {
      isBlocked: false,
      ...(typeof f.optInStatus === 'string' ? { optInStatus: f.optInStatus } : {}),
      ...(tags.length ? { tags: { hasSome: tags } } : {}),
      ...(or ? { OR: or } : {}),
      ...(!or && compiled.length ? { AND: compiled } : {}),
    };
  },
}));
jest.mock('../whatsapp-segment.service', () => ({ getSegment: jest.fn() }));

const getSuppressedPhonesInMock = jest.fn();
const forEachSuppressedPhonePageMock = jest.fn();
jest.mock('../whatsapp-suppression.service', () => ({
  getSuppressedPhonesIn: getSuppressedPhonesInMock,
  forEachSuppressedPhonePage: forEachSuppressedPhonePageMock,
}));

const sequenceMock = {
  setSequenceSteps: jest.fn(),
  startSequence: jest.fn().mockResolvedValue(undefined),
  resumeSequence: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../whatsapp-sequence.service', () => sequenceMock);

const addCampaignBatchJobMock = jest.fn().mockResolvedValue({ id: 'job' });
jest.mock('../../jobs/whatsapp-campaign.queue', () => ({
  addCampaignBatchJob: addCampaignBatchJobMock,
}));

// Completion fan-out. Mocked rather than left real because the outbound-webhook
// emitter reaches the BullMQ delivery queue and the socket emitter reaches the
// Socket.IO server — neither exists in a unit test, and neither is what these
// cases are about.
const emitWaEventMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../whatsapp-events.service', () => ({ emitWaEvent: emitWaEventMock }));
const emitWaMock = jest.fn();
jest.mock('../../utils/whatsapp-realtime', () => ({ emitWa: emitWaMock }));

import { invalidateObservedRates } from '../whatsapp-pricing';
import {
  cancelCampaign,
  completeCampaign,
  enqueuePendingRecipients,
  getMessagingTierBudget,
  launchCampaign,
  previewAudienceCount,
  campaignPreflight,
  reconcileRecipientStatuses,
  retryFailedRecipients,
  resolveTemplateVars,
  tierDailyLimit,
  deleteCampaign,
  twoProportionZ,
} from '../whatsapp-campaign.service';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

/** A template spec with nothing required — the "plain body-only" template. */
const PLAIN_SPEC = {
  headerFormat: 'NONE',
  headerHasTextVar: false,
  headerNeedsMedia: false,
  bodyPositional: 0,
  bodyNamed: [] as string[],
  buttonUrlVar: false,
  buttonUrlVarIndexes: [] as number[],
  needsCatalogThumbnail: false,
  needsProductSections: false,
  needsProduct: false,
  hasFlowButton: false,
  carouselCards: [] as Array<{
    headerFormat: 'IMAGE' | 'VIDEO' | 'NONE';
    bodyPositional: number;
    buttons: Array<{ index: number; type: string; text: string; hasUrlVar: boolean }>;
    buttonUrlVar: boolean;
  }>,
};

/** One IMAGE card with a single {{1}} body variable and a dynamic link button. */
const carouselCard = (over: Partial<Record<string, unknown>> = {}) => ({
  headerFormat: 'IMAGE' as const,
  bodyPositional: 1,
  buttons: [{ index: 0, type: 'URL', text: 'Shop now', hasUrlVar: true }],
  buttonUrlVar: true,
  ...over,
});

const contact = (over: Partial<Record<string, unknown>>) => ({
  id: 'x',
  phone: '910000000000',
  name: null,
  optInStatus: 'OPTED_IN',
  isBlocked: false,
  lastMarketingAt: null,
  ...over,
});

/** The seven-contact audience the eligibility cases below all read from. */
const AUDIENCE = [
  contact({ id: 'c1', phone: '911' }),
  contact({ id: 'c2', phone: '912', isBlocked: true }),
  contact({ id: 'c3', phone: '913' }), // on the suppression list
  contact({ id: 'c4', phone: '914', optInStatus: 'OPTED_OUT' }),
  contact({ id: 'c5', phone: '915', optInStatus: 'UNKNOWN' }),
  contact({ id: 'c6', phone: '916', lastMarketingAt: new Date(NOW.getTime() - 2 * HOUR_MS) }),
  contact({ id: 'c7', phone: '917', lastMarketingAt: new Date(NOW.getTime() - 30 * HOUR_MS) }),
];

/**
 * A minimal evaluator for the Prisma WHERE clauses the service builds.
 *
 * Eligibility moved out of JS and into SQL (a preview is now one COUNT instead
 * of a walk of the contact table), and a mocked Prisma cannot run SQL. Applying
 * the generated clause to the fixture keeps the cases below asserting WHICH
 * contacts stay reachable, rather than the shape of a query object.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const matchesField = (value: any, cond: any): boolean => {
  if (cond === null) return value == null;
  if (cond instanceof Date) return value instanceof Date && +value === +cond;
  if (cond && typeof cond === 'object') {
    return Object.entries(cond).every(([op, operand]: [string, any]) => {
      if (op === 'not') return !matchesField(value, operand);
      if (op === 'in') return (operand as any[]).includes(value);
      if (op === 'lte') return value instanceof Date && +value <= +operand;
      if (op === 'hasSome') return (operand as any[]).some((t) => (value ?? []).includes(t));
      throw new Error(`matchesWhere: unsupported operator "${op}"`);
    });
  }
  return value === cond;
};

const matchesWhere = (row: any, where: any): boolean =>
  Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'AND') return (cond as any[]).every((w) => matchesWhere(row, w));
    if (key === 'OR') return (cond as any[]).some((w) => matchesWhere(row, w));
    return matchesField(row[key], cond);
  });

/**
 * Is this the blank-{{name}} count — the audience predicate ANDed with an OR
 * over `name`?
 *
 * Deliberately looks inside `AND` rather than at a top-level `OR`: an 'or'
 * segment puts its own rule group on the top-level OR, so the blank-name arm has
 * to be a sibling of the whole audience predicate, never spread over it.
 */
const isBlankNameQuery = (where: any): boolean =>
  Array.isArray(where.AND) &&
  where.AND.some((arm: any) => Array.isArray(arm.OR) && arm.OR.every((o: any) => 'name' in o));
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Put these phones on the do-not-contact list, for both audience paths. */
const suppressPhones = (phones: string[]) => {
  forEachSuppressedPhonePageMock.mockImplementation(async (fn: (p: string[]) => Promise<void>) => {
    if (phones.length > 0) await fn(phones);
  });
  getSuppressedPhonesInMock.mockImplementation(
    async (candidates: string[]) => new Set(candidates.filter((p) => phones.includes(p)))
  );
};

const segmentCampaign = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'camp-1',
  status: 'DRAFT',
  type: 'BROADCAST',
  templateId: 'tpl-1',
  audienceType: 'segment',
  audienceFilter: {},
  variableMapping: null,
  templateParams: {},
  batchSize: 100,
  isAbTest: false,
  startedAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);

  prismaMock.waSettings.findUnique.mockResolvedValue({ marketingCapPer24h: 1 });
  prismaMock.waCampaignVariant.findMany.mockResolvedValue([]);
  prismaMock.waCampaignStep.findMany.mockResolvedValue([]);
  prismaMock.waCampaignRecipient.findMany.mockResolvedValue([]);
  prismaMock.waCampaignRecipient.createMany.mockResolvedValue({ count: 0 });
  prismaMock.waCampaignRecipient.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.waCampaignRecipient.groupBy.mockResolvedValue([]);
  prismaMock.waMessage.aggregate.mockResolvedValue({ _sum: { costPaise: null } });
  // Default: Meta has never been synced, so pricing falls back to the env
  // constants every assertion below is written against.
  prismaMock.waMetaCostDaily.groupBy.mockResolvedValue([]);
  // The observed rate is memoized for 15 minutes in-process; drop it between
  // cases or the first case's answer would be reused by every later one.
  invalidateObservedRates();
  prismaMock.waConversion.count.mockResolvedValue(0);
  prismaMock.waCampaign.update.mockResolvedValue({});
  prismaMock.waCampaign.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.waContact.findMany.mockResolvedValue([]);
  prismaMock.waContact.count.mockResolvedValue(0);
  prismaMock.waContact.createMany.mockResolvedValue({ count: 0 });
  // No messaging tier on the channel by default — the tier gate is inert unless a
  // case opts into one, so the eligibility cases stay about eligibility.
  getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: null });
  prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
  suppressPhones([]);
  getTemplateMock.mockResolvedValue({ id: 'tpl-1', status: 'APPROVED', category: 'UTILITY' });
  analyzeTemplateSpecMock.mockReturnValue({ ...PLAIN_SPEC });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('resolveTemplateVars', () => {
  it('substitutes the contact tokens and passes literals through', () => {
    expect(
      resolveTemplateVars(['{{name}}', '{{phone}}', 'Diwali'], { name: 'Asha', phone: '911' })
    ).toEqual(['Asha', '911', 'Diwali']);
  });

  it('renders a nameless contact as an empty parameter rather than "null"', () => {
    // Meta rejects a missing parameter and happily delivers a literal "null";
    // both are visible to the recipient, so this one is worth pinning.
    expect(resolveTemplateVars(['{{name}}'], { name: null, phone: '911' })).toEqual(['']);
  });

  it('returns no parameters when the campaign has no mapping', () => {
    expect(resolveTemplateVars(undefined, { name: 'Asha', phone: '911' })).toEqual([]);
  });

  it('resolves an imported attribute', () => {
    // The column existed and was documented for personalization, but nothing
    // read it — so `{{city}}` reached Meta as the literal string "{{city}}".
    expect(
      resolveTemplateVars(['{{attr.city}}', '{{attributes.plan}}'], {
        name: 'Asha',
        phone: '911',
        attributes: { city: 'Mumbai', plan: 'Gold' },
      })
    ).toEqual(['Mumbai', 'Gold']);
  });

  it('falls back to the default when the value is blank', () => {
    // Meta rejects an empty parameter and fails the WHOLE message, and most
    // imported contacts have no profile name — so a bare `{{name}}` hard-failed
    // the majority of a typical audience.
    expect(resolveTemplateVars(['{{name|there}}'], { name: null, phone: '911' })).toEqual([
      'there',
    ]);
    expect(resolveTemplateVars(['{{name|there}}'], { name: '   ', phone: '911' })).toEqual([
      'there',
    ]);
    expect(resolveTemplateVars(['{{attr.city|your city}}'], { phone: '911' })).toEqual([
      'your city',
    ]);
  });

  it('prefers the real value over the default', () => {
    expect(resolveTemplateVars(['{{name|there}}'], { name: 'Asha', phone: '911' })).toEqual([
      'Asha',
    ]);
  });

  it('passes an unknown token through as the literal the operator typed', () => {
    expect(resolveTemplateVars(['{{order_id}}', 'Diwali'], { name: 'Asha', phone: '911' })).toEqual(
      ['{{order_id}}', 'Diwali']
    );
  });

  it('ignores an attributes blob that is not an object', () => {
    // The column is free-form JSON; an array or a string there must not throw on
    // the send path.
    expect(
      resolveTemplateVars(['{{attr.city|—}}'], { phone: '911', attributes: ['Mumbai'] })
    ).toEqual(['—']);
  });
});

describe('previewAudienceCount', () => {
  beforeEach(() => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    prismaMock.waContact.count.mockImplementation(
      async ({ where }: { where: unknown }) => AUDIENCE.filter((c) => matchesWhere(c, where)).length
    );
    suppressPhones(['913']);
  });

  it('requires positive consent for a MARKETING campaign', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });

    const preview = await previewAudienceCount('camp-1');

    // c2 blocked, c3 suppressed, c4 opted out, c5 unknown, c6 inside the 24h
    // cap — leaving c1 and c7.
    expect(preview.count).toBe(2);
    expect(preview.estimatedCostPaise).toBe(2 * 78);
  });

  it("prices from Meta's observed rate once the cost sync has run", async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    // Meta billed 12,300 paise for 100 marketing messages = 123p each, against a
    // WHATSAPP_PRICE_MARKETING_PAISE guess of 78. The guess loses: it was never
    // validated for this account, country or pricing tier.
    prismaMock.waMetaCostDaily.groupBy.mockResolvedValue([
      { category: 'MARKETING', currency: 'INR', _sum: { volume: 100, costMinor: 12300 } },
    ]);
    invalidateObservedRates();

    const preview = await previewAudienceCount('camp-1');

    expect(preview.count).toBe(2);
    expect(preview.estimatedCostPaise).toBe(2 * 123);
  });

  it('keeps the rupee guess when Meta bills the WABA in another currency', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    // 123 US CENTS per message. Using it would write US cents into
    // estimatedCostPaise, which the whole console then prints behind a ₹ sign —
    // a wrong number that looks authoritative, rather than an admitted guess.
    prismaMock.waMetaCostDaily.groupBy.mockResolvedValue([
      { category: 'MARKETING', currency: 'USD', _sum: { volume: 100, costMinor: 12300 } },
    ]);
    invalidateObservedRates();

    const preview = await previewAudienceCount('camp-1');

    expect(preview.count).toBe(2);
    expect(preview.estimatedCostPaise).toBe(2 * 78);
  });

  it('ignores Meta rows whose billing currency was never resolved', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    // fetchWabaCurrency returns null when the Graph lookup fails; an unlabelled
    // row cannot be assumed to be rupees.
    prismaMock.waMetaCostDaily.groupBy.mockResolvedValue([
      { category: 'MARKETING', currency: null, _sum: { volume: 100, costMinor: 12300 } },
    ]);
    invalidateObservedRates();

    const preview = await previewAudienceCount('camp-1');

    expect(preview.estimatedCostPaise).toBe(2 * 78);
  });

  it('only needs "not opted out" for a non-marketing campaign', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });

    const preview = await previewAudienceCount('camp-1');

    // UNKNOWN is reachable for utility traffic, and the marketing frequency cap
    // does not apply at all.
    expect(preview.count).toBe(4);
    expect(preview.estimatedCostPaise).toBe(4 * 30);
  });

  it('applies the 24h frequency pre-filter only when the cap is exactly one', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    prismaMock.waSettings.findUnique.mockResolvedValue({ marketingCapPer24h: 5 });

    const preview = await previewAudienceCount('camp-1');

    // `lastMarketingAt` cannot distinguish 1 from N inside the window, so above
    // a cap of 1 this filter is deliberately silent and the authoritative count
    // runs at send time instead.
    expect(preview.count).toBe(3);
  });

  it('never blocks blocked or suppressed contacts from being excluded', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    suppressPhones(['911', '913', '917']);

    const preview = await previewAudienceCount('camp-1');

    // The do-not-contact list is absolute; nothing on it is ever counted.
    expect(preview.count).toBe(0);
  });

  it('counts the segment in SQL instead of paging the whole contact table', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });

    await previewAudienceCount('camp-1');

    // The preview used to read every contact in the segment 1000 rows at a time
    // and filter them in Node, inside a request that has ~30s to answer: on a
    // large deployment it simply timed out, so the operator never saw the size
    // or the cost of the campaign they were about to pay for.
    expect(prismaMock.waContact.findMany).not.toHaveBeenCalled();
    // The audience count, plus one intersection per page of the blocklist.
    expect(prismaMock.waContact.count).toHaveBeenCalledTimes(2);
    expect(prismaMock.waContact.count.mock.calls[0][0].where).toEqual({
      isBlocked: false,
      AND: [
        { optInStatus: 'OPTED_IN' },
        {
          OR: [
            { marketingRefusedAt: null },
            { marketingRefusedAt: { lte: new Date(NOW.getTime() - 24 * HOUR_MS) } },
          ],
        },
        {
          OR: [
            { lastMarketingAt: null },
            { lastMarketingAt: { lte: new Date(NOW.getTime() - 24 * HOUR_MS) } },
          ],
        },
      ],
    });
  });

  it('counts an uploaded audience in memory, without creating its contacts', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({
        audienceType: 'upload',
        audienceFilter: { phones: ['910000000001', '910000000002', '910000000003'] },
      })
    );
    prismaMock.waContact.findMany.mockResolvedValue([
      contact({ id: 'u1', phone: '910000000001' }),
      contact({ id: 'u2', phone: '910000000002' }),
    ]);
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });
    suppressPhones(['910000000002']);

    const preview = await previewAudienceCount('camp-1');

    // An uploaded list is bounded, so it is still counted in memory — one read
    // for the phones that already exist, and the third is counted as the row a
    // launch would create, so the preview and the launch agree on the number.
    expect(preview.count).toBe(2);
    expect(prismaMock.waContact.createMany).not.toHaveBeenCalled();
  });

  it('reads the audience without writing contact rows', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'MARKETING' });

    await previewAudienceCount('camp-1');

    // A preview is a GET. Creating contacts here filled the contact book with
    // unconsented rows that then showed up in segments, counts and exports.
    expect(prismaMock.waContact.createMany).not.toHaveBeenCalled();
    expect(prismaMock.waCampaignRecipient.createMany).not.toHaveBeenCalled();
  });

  it('flags an audience that does not fit inside today’s messaging tier', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'TIER_50' });
    prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(48) }]);

    // The size and the cost were shown, but nothing said the audience was bigger
    // than the number is allowed to message today — so the operator found that out
    // from a wall of 131056 failures and a downgraded quality rating instead.
    await expect(previewAudienceCount('camp-1')).resolves.toEqual({
      count: 4,
      estimatedCostPaise: 4 * 30,
      tierLimit: 50,
      uniqueSentLast24h: 48,
      exceedsTier: true,
      // No mapping on this campaign, so nothing can resolve blank.
      blankVariables: [],
    });
  });

  it('counts how many recipients would get an empty {{name}} parameter', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({ variableMapping: ['{{name}}', 'Diwali sale'] })
    );
    // The nameless slice of the audience: the audience predicate ANDed with an
    // OR over `name`. Matched on the AND arm, not on a top-level OR, because the
    // blank-name OR must never sit at the top level — see the OR-segment case
    // below for what that broke.
    prismaMock.waContact.count.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (isBlankNameQuery(where)) return 3;
        return AUDIENCE.filter((c) => matchesWhere(c, where)).length;
      }
    );

    const preview = await previewAudienceCount('camp-1');

    // Meta refuses an empty parameter and fails the whole message, so this is a
    // block of hard FAILED recipients — stated before the launch, not after it.
    expect(preview.blankVariables).toEqual([{ index: 1, token: '{{name}}', blankCount: 3 }]);
  });

  it('counts the blank-{{name}} slice inside an OR segment, not over a superset', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({
        variableMapping: ['{{name}}'],
        // "unknown consent OR already opted out" — a rule group that lives on
        // the predicate's top-level OR.
        audienceFilter: {
          op: 'or',
          rules: [
            { field: 'optInStatus', operator: 'equals', value: 'UNKNOWN' },
            { field: 'optInStatus', operator: 'equals', value: 'OPTED_OUT' },
          ],
        },
      })
    );

    const preview = await previewAudienceCount('camp-1');

    // c5 is the only match: c4 is opted out and a UTILITY send still excludes
    // those. The blank-name count used to be spread over the predicate, which
    // REPLACED the rule group with the name test — every nameless contact in the
    // table was reported as a blank-parameter failure, so the one pre-launch
    // warning an operator gets was computed for an audience this campaign was
    // never going to send to.
    expect(preview.count).toBe(1);
    expect(preview.blankVariables).toEqual([{ index: 1, token: '{{name}}', blankCount: 1 }]);
  });

  it('says nothing about a variable that carries a fallback', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({ variableMapping: ['{{name|there}}'] })
    );

    const preview = await previewAudienceCount('camp-1');

    expect(preview.blankVariables).toEqual([]);
  });

  it('does not flag an audience the tier still has room for', async () => {
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'UTILITY' });
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'TIER_1K' });
    prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(10) }]);

    await expect(previewAudienceCount('camp-1')).resolves.toEqual({
      count: 4,
      estimatedCostPaise: 4 * 30,
      tierLimit: 1000,
      uniqueSentLast24h: 10,
      exceedsTier: false,
      blankVariables: [],
    });
  });
});

describe('tierDailyLimit', () => {
  it('reads the daily contact allowance out of a Meta tier string', () => {
    expect(tierDailyLimit('TIER_1K')).toBe(1_000);
    expect(tierDailyLimit('10K')).toBe(10_000);
    expect(tierDailyLimit('TIER_100K')).toBe(100_000);
    expect(tierDailyLimit('TIER_250')).toBe(250);
  });

  it('reports no allowance for a tier that does not express one', () => {
    // 'STANDARD' / 'HIGH' are the per-SECOND throughput levels Meta reports for
    // numbers on per-message pricing. Reading either as a daily allowance would
    // throttle every campaign on those numbers against a number that does not exist.
    expect(tierDailyLimit('STANDARD')).toBeNull();
    expect(tierDailyLimit('HIGH')).toBeNull();
    expect(tierDailyLimit('TIER_UNLIMITED')).toBeNull();
    expect(tierDailyLimit(null)).toBeNull();
    expect(tierDailyLimit('')).toBeNull();
  });
});

describe('getMessagingTierBudget', () => {
  it('subtracts the contacts already messaged inside the rolling 24h window', async () => {
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'TIER_1K' });
    prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(940) }]);

    await expect(getMessagingTierBudget()).resolves.toEqual({
      limit: 1_000,
      uniqueSentLast24h: 940,
      remaining: 60,
    });
  });

  it('floors the headroom at zero once the window is over the tier', async () => {
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'TIER_1K' });
    prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(1_200) }]);

    // A negative budget would read as "no cap" everywhere it is compared against.
    await expect(getMessagingTierBudget()).resolves.toEqual({
      limit: 1_000,
      uniqueSentLast24h: 1_200,
      remaining: 0,
    });
  });

  it('counts nothing when the tier imposes no daily cap', async () => {
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'STANDARD' });

    await expect(getMessagingTierBudget()).resolves.toEqual({
      limit: null,
      uniqueSentLast24h: 0,
      remaining: null,
    });
    // COUNT(DISTINCT …) over 24h of messages is not free, and nothing could act
    // on the answer here.
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('enqueuePendingRecipients', () => {
  it('splits a page into batchSize jobs and flushes the remainder', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r1' },
      { id: 'r2' },
      { id: 'r3' },
      { id: 'r4' },
      { id: 'r5' },
    ]);

    await expect(enqueuePendingRecipients('camp-1', 2)).resolves.toBe(5);

    expect(addCampaignBatchJobMock.mock.calls.map((c) => c[0].recipientIds)).toEqual([
      ['r1', 'r2'],
      ['r3', 'r4'],
      ['r5'],
    ]);
  });

  it('walks the backlog with a keyset cursor instead of buffering it', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `r-${i}` }));
    prismaMock.waCampaignRecipient.findMany
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: 'r-1000' }, { id: 'r-1001' }, { id: 'r-1002' }]);

    await expect(enqueuePendingRecipients('camp-1', 1000)).resolves.toBe(1003);

    // A 500k-recipient campaign used to be read into the heap in one findMany
    // before a single job was queued; keyset paging is also stable under the
    // concurrent writes the worker is making at the same time.
    expect(prismaMock.waCampaignRecipient.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waCampaignRecipient.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: 'r-999' },
      skip: 1,
      orderBy: { id: 'asc' },
    });
  });

  it('stops at the cap the recovery cron passes in', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r1' },
      { id: 'r2' },
      { id: 'r3' },
      { id: 'r4' },
      { id: 'r5' },
    ]);

    await expect(enqueuePendingRecipients('camp-1', 2, 4)).resolves.toBe(4);

    expect(addCampaignBatchJobMock).toHaveBeenCalledTimes(2);
  });

  it('queues nothing when there are no PENDING recipients', async () => {
    await expect(enqueuePendingRecipients('camp-1', 100)).resolves.toBe(0);

    expect(addCampaignBatchJobMock).not.toHaveBeenCalled();
  });
});

describe('completeCampaign', () => {
  it('arms the next run for a recurring campaign', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ recurrenceDays: 7 });

    await completeCampaign('camp-1');

    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: {
        status: 'COMPLETED',
        completedAt: NOW,
        nextRunAt: new Date(NOW.getTime() + 7 * 24 * HOUR_MS),
      },
    });
  });

  it('leaves nextRunAt untouched for a one-off campaign', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ recurrenceDays: null });

    await completeCampaign('camp-1');

    expect(prismaMock.waCampaign.update.mock.calls[0][0].data).not.toHaveProperty('nextRunAt');
  });

  it('does nothing for a campaign that no longer exists', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(null);

    await completeCampaign('gone');

    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
    expect(emitWaMock).not.toHaveBeenCalled();
    expect(emitWaEventMock).not.toHaveBeenCalled();
  });

  it('announces the finish on the socket and the outbound webhook', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({
      name: 'Diwali blast',
      recurrenceDays: null,
      totalRecipients: 200,
      sentCount: 150,
      deliveredCount: 140,
      readCount: 90,
      failedCount: 50,
      skippedCount: 0,
    });

    await completeCampaign('camp-1');

    // The announcement lives in this helper, not in the batch worker, so the
    // recovery cron and drip retirement — the two paths that used to finish a
    // campaign in silence — fire it too.
    expect(emitWaMock).toHaveBeenCalledWith(
      'wa:campaign',
      expect.objectContaining({ id: 'camp-1', completed: true, status: 'COMPLETED' })
    );
    // 50 of 200 failed: consumers threshold on the rate, not the raw count.
    expect(emitWaMock.mock.calls[0][1]).toMatchObject({ failedRate: 0.25 });
    expect(emitWaEventMock).toHaveBeenCalledWith(
      'whatsapp.campaign.completed',
      expect.objectContaining({ campaignId: 'camp-1', failedCount: 50, failedRate: 0.25 })
    );
  });

  it('reports a zero failure rate for a campaign with no recipients', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({
      name: 'Empty',
      recurrenceDays: null,
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    });

    await completeCampaign('camp-1');

    // Not NaN: an empty audience divided by itself would have rendered as
    // "NaN% failed" in the console toast and shipped NaN to every subscriber.
    expect(emitWaMock.mock.calls[0][1]).toMatchObject({ failedRate: 0 });
  });
});

describe('cancelCampaign', () => {
  it('disarms the recurrence as well as stopping the run', async () => {
    await cancelCampaign('camp-1');

    // Writing only the status left a recurring campaign cloning itself forever
    // with no way to stop it from the UI: updateCampaign refuses to edit a
    // campaign that has already run, so recurrenceDays could never be cleared.
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'CANCELLED', completedAt: NOW, nextRunAt: null },
    });
  });

  it('closes out the recipients that will now never be attempted', async () => {
    await cancelCampaign('camp-1');

    // Leaving them PENDING froze the progress bar part-way and made a cancelled
    // campaign indistinguishable from a stalled one; the errorCode is what
    // separates a cancel-skip from a consent-skip in the recipients table.
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'camp-1', status: 'PENDING' },
      data: { status: 'SKIPPED', errorCode: 'WA_CAMPAIGN_CANCELLED' },
    });
    // …and the counters are recomputed from the recipient table afterwards.
    expect(prismaMock.waCampaignRecipient.groupBy).toHaveBeenCalled();
  });
});

describe('retryFailedRecipients', () => {
  it('refuses to resurrect a CANCELLED campaign', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({
      id: 'camp-1',
      status: 'CANCELLED',
      batchSize: 100,
    });

    await expect(retryFailedRecipients('camp-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_CAMPAIGN_BAD_STATE',
    });

    // The endpoint is directly callable, so hiding the Retry button for a
    // cancelled campaign was never a control: the unconditional
    // `status: 'RUNNING'` would have restarted a blast the operator stopped on
    // purpose. Nothing may be reset or re-queued.
    expect(prismaMock.waCampaignRecipient.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
    expect(addCampaignBatchJobMock).not.toHaveBeenCalled();
  });

  it('refuses an archived campaign even though its status is COMPLETED', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({
      id: 'camp-1',
      status: 'COMPLETED',
      archivedAt: NOW,
      batchSize: 100,
    });

    await expect(retryFailedRecipients('camp-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_CAMPAIGN_BAD_STATE',
    });

    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });

  it('reopens a COMPLETED campaign and re-queues its retryable failures', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({
      id: 'camp-1',
      status: 'COMPLETED',
      archivedAt: null,
      batchSize: 100,
    });
    // One transient failure (rate-limited) and one permanent rejection.
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r1', errorCode: '130429' },
      { id: 'r2', errorCode: '131026' },
    ]);
    prismaMock.waCampaignRecipient.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([{ id: 'r1' }]);

    await retryFailedRecipients('camp-1');

    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { status: 'PENDING', wamid: null, errorCode: null, sentAt: null },
    });
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'RUNNING', completedAt: null },
    });
    expect(addCampaignBatchJobMock).toHaveBeenCalledTimes(1);
  });
});

describe('launchCampaign — refusals before anything is sent', () => {
  it('rejects a campaign whose status is not launchable', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ status: 'COMPLETED' }));

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_CAMPAIGN_BAD_STATE',
    });
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an AUTHENTICATION template outright', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    getTemplateMock.mockResolvedValue({ status: 'APPROVED', category: 'AUTHENTICATION' });

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_AUTH_TEMPLATE_NOT_BROADCASTABLE',
    });
    // One shared parameter set means one shared one-time code for the entire
    // audience — useless as a second factor, and a real security problem.
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a launch when an A/B VARIANT template is not approved', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ isAbTest: true }));
    prismaMock.waCampaignVariant.findMany.mockResolvedValue([{ templateId: 'tpl-b', label: 'B' }]);
    getTemplateMock.mockImplementation(async (id: string) =>
      id === 'tpl-b'
        ? { status: 'PENDING', category: 'UTILITY' }
        : { status: 'APPROVED', category: 'UTILITY' }
    );

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_TEMPLATE_NOT_APPROVED',
    });
    // Checked at launch, not at send: on the drip path the send-time throw was
    // caught and re-armed, so the recipient retried a rejected template every
    // 15 minutes indefinitely.
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a launch when the template needs header media the campaign has not supplied', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    analyzeTemplateSpecMock.mockReturnValue({
      ...PLAIN_SPEC,
      headerFormat: 'IMAGE',
      headerNeedsMedia: true,
    });

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_TEMPLATE_PARAMS_MISSING',
    });
    // Meta answers (#131008) for every recipient, so the alternative to failing
    // here is a campaign that spends its whole audience on rejections.
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a carousel launch whose cards have no media or text', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    analyzeTemplateSpecMock.mockReturnValue({
      ...PLAIN_SPEC,
      carouselCards: [carouselCard(), carouselCard()],
    });

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_TEMPLATE_PARAMS_MISSING',
    });
    // A carousel's media and text live on the CARDS, so an unfilled card is a
    // (#131008) for every recipient — the whole audience for one missing image.
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('lets a carousel launch through once every card is filled in', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({
        templateParams: {
          carouselCards: [
            {
              headerMediaUrl: 'https://cdn.example.com/card1.jpg',
              bodyParams: ['20%'],
              buttonUrlParam: 'summer',
            },
          ],
        },
      })
    );
    analyzeTemplateSpecMock.mockReturnValue({ ...PLAIN_SPEC, carouselCards: [carouselCard()] });
    // Losing the claim race stops the launch right after the gate, which is all
    // this case is about: the pre-flight let it past.
    prismaMock.waCampaign.updateMany.mockResolvedValue({ count: 0 });

    await launchCampaign('camp-1');

    expect(prismaMock.waCampaign.updateMany).toHaveBeenCalled();
  });

  it('refuses a carousel used as an A/B variant, which carries no cards of its own', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ isAbTest: true }));
    prismaMock.waCampaignVariant.findMany.mockResolvedValue([{ templateId: 'tpl-b', label: 'B' }]);
    // The variant's template is the carousel; the campaign's own is not.
    analyzeTemplateSpecMock.mockImplementation((components: unknown) =>
      components === 'carousel-components'
        ? { ...PLAIN_SPEC, carouselCards: [carouselCard()] }
        : { ...PLAIN_SPEC }
    );
    getTemplateMock.mockImplementation(async (id: string) =>
      id === 'tpl-b'
        ? { status: 'APPROVED', category: 'UTILITY', components: 'carousel-components' }
        : { status: 'APPROVED', category: 'UTILITY' }
    );

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_CAROUSEL_TEMPLATE_NOT_SUPPORTED',
    });
    expect(prismaMock.waCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a template with named body variables campaigns cannot supply', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    analyzeTemplateSpecMock.mockReturnValue({ ...PLAIN_SPEC, bodyNamed: ['first_name'] });

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      code: 'WA_TEMPLATE_PARAMS_MISSING',
    });
  });
});

describe('launchCampaign — claiming and enqueueing', () => {
  it('claims the campaign atomically and does no work if it loses the race', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ status: 'SCHEDULED' }));
    prismaMock.waCampaign.updateMany.mockResolvedValue({ count: 0 });

    await launchCampaign('camp-1');

    expect(prismaMock.waCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', status: { in: ['DRAFT', 'SCHEDULED', 'PAUSED'] } },
      data: { status: 'RUNNING', startedAt: NOW },
    });
    // The cron and a manual launch used to be able to both proceed here, which
    // materialized and billed the same audience twice.
    expect(prismaMock.waCampaignRecipient.count).not.toHaveBeenCalled();
    expect(addCampaignBatchJobMock).not.toHaveBeenCalled();
  });

  it('releases the claim when the audience turns out to be empty', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    prismaMock.waCampaignRecipient.count.mockResolvedValue(0);
    prismaMock.waContact.findMany.mockResolvedValue([]);

    await expect(launchCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_NO_RECIPIENTS',
    });

    // Otherwise the campaign is stuck RUNNING with zero recipients and can
    // never be launched again.
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'DRAFT', startedAt: null },
    });
  });

  it('enqueues batches and records the cost estimate for a broadcast', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ batchSize: 2 }));
    prismaMock.waCampaignRecipient.count.mockResolvedValue(3);
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r1' },
      { id: 'r2' },
      { id: 'r3' },
    ]);

    await launchCampaign('camp-1');

    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { totalRecipients: 3, estimatedCostPaise: 3 * 30 },
    });
    expect(addCampaignBatchJobMock).toHaveBeenCalledTimes(2);
  });

  it('materializes only the A/B sample, holding the rest back for the winner', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({ isAbTest: true, abTestSamplePct: 50, abTestMetric: 'replied' })
    );
    prismaMock.waCampaignVariant.findMany.mockResolvedValue([
      { id: 'v1', label: 'A', templateId: 'tpl-1', weight: 1, variableMapping: null },
      { id: 'v2', label: 'B', templateId: 'tpl-2', weight: 1, variableMapping: null },
    ]);
    // Four eligible contacts; 50% of them is a sample of two.
    prismaMock.waContact.count.mockResolvedValue(4);
    prismaMock.waContact.findMany.mockResolvedValue([
      contact({ id: 'c1', phone: '911' }),
      contact({ id: 'c2', phone: '912' }),
      contact({ id: 'c3', phone: '913' }),
      contact({ id: 'c4', phone: '914' }),
    ]);
    prismaMock.waCampaignRecipient.count.mockResolvedValueOnce(0).mockResolvedValue(2);
    prismaMock.waCampaignRecipient.createMany.mockResolvedValue({ count: 2 });
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);

    await launchCampaign('camp-1');

    // An A/B test that spends the whole audience on the launch has nobody left to
    // send the winner to, which is the only reason to run one.
    expect(prismaMock.waCampaignRecipient.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ contactId: 'c1', variantId: 'v1' }),
        expect.objectContaining({ contactId: 'c2', variantId: 'v2' }),
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { totalRecipients: 2, estimatedCostPaise: 2 * 30 },
    });
  });

  it('resumes a PAUSED drip instead of restarting it from step 0', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({ type: 'SEQUENCE', status: 'PAUSED' })
    );
    prismaMock.waCampaignRecipient.count.mockResolvedValue(10);

    await launchCampaign('camp-1');

    // Resuming is not relaunching: startSequence would re-arm every recipient at
    // step 0 and send them the first message a second time.
    expect(sequenceMock.resumeSequence).toHaveBeenCalledWith('camp-1');
    expect(sequenceMock.startSequence).not.toHaveBeenCalled();
    // A drip is stepped by the cron, never batch-blasted.
    expect(addCampaignBatchJobMock).not.toHaveBeenCalled();
  });

  it('launches an over-tier audience, and states how long the send will take', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign({ batchSize: 100 }));
    prismaMock.waCampaignRecipient.count.mockResolvedValue(2_500);
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([{ id: 'r1' }]);
    getDefaultChannelMock.mockResolvedValue({ id: 'ch1', messagingTier: 'TIER_1K' });
    prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    await launchCampaign('camp-1');

    // Deliberately not a refusal: the worker stops each 24h window at the tier and
    // leaves the rest PENDING, so the campaign spreads over days instead of
    // failing into Meta. A cron-launched SCHEDULED campaign never saw the
    // pre-launch preview, so this log is the only place that spread is stated.
    expect(addCampaignBatchJobMock).toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('over 3 day(s)'));
  });

  it('turns an uploaded phone list into contacts in one statement, deduplicated', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({
        audienceType: 'upload',
        // The same number twice: pasted lists repeat, and a repeat used to be
        // counted twice by the preview while the launch collapsed it to one
        // recipient row.
        audienceFilter: { phones: ['910000000001', '910000000002', '910000000001'] },
      })
    );
    prismaMock.waCampaignRecipient.count.mockResolvedValueOnce(0).mockResolvedValue(2);
    prismaMock.waContact.findMany.mockResolvedValue([
      contact({ id: 'u1', phone: '910000000001' }),
      contact({ id: 'u2', phone: '910000000002' }),
    ]);
    prismaMock.waCampaignRecipient.findMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);

    await launchCampaign('camp-1');

    // One write for the whole chunk, not one round-trip per number: the list is
    // capped at 20,000 and this runs inside a request with a 30s budget, which
    // 20,000 sequential upserts cannot finish inside.
    expect(prismaMock.waContact.createMany).toHaveBeenCalledTimes(1);
    // `name` is written from the uploaded row — null here, since this list is
    // bare numbers — so a contact the upload creates carries the only name it
    // has instead of showing as an unnamed number in the inbox forever.
    expect(prismaMock.waContact.createMany).toHaveBeenCalledWith({
      data: [
        { phone: '910000000001', name: null },
        { phone: '910000000002', name: null },
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.waCampaignRecipient.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ contactId: 'u1' }),
          expect.objectContaining({ contactId: 'u2' }),
        ],
        skipDuplicates: true,
      })
    );
  });

  it('arms a fresh drip from step 0', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(
      segmentCampaign({ type: 'SEQUENCE', status: 'SCHEDULED' })
    );
    prismaMock.waCampaignRecipient.count.mockResolvedValue(10);

    await launchCampaign('camp-1');

    expect(sequenceMock.startSequence).toHaveBeenCalledWith('camp-1');
    expect(sequenceMock.resumeSequence).not.toHaveBeenCalled();
  });
});

describe('reconcileRecipientStatuses', () => {
  /** A recipient row as the reconciler selects it. */
  const recipient = (over: Partial<Record<string, unknown>>) => ({
    id: 'r1',
    wamid: 'wamid.1',
    status: 'SENT',
    campaignId: 'camp-1',
    ...over,
  });

  it('resolves a whole status batch with one read and one write per outcome', async () => {
    // Meta sends sent/delivered/read for every message, so a 50k campaign means
    // ~150k callbacks. A findFirst + update each starved the very pool the
    // campaign was still sending on, which is what put delivery ticks hours
    // behind the send.
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      recipient({ id: 'r1', wamid: 'wamid.1' }),
      recipient({ id: 'r2', wamid: 'wamid.2' }),
      recipient({ id: 'r3', wamid: 'wamid.3' }),
    ]);

    await reconcileRecipientStatuses([
      { wamid: 'wamid.1', status: 'DELIVERED' },
      { wamid: 'wamid.2', status: 'DELIVERED' },
      { wamid: 'wamid.3', status: 'DELIVERED' },
    ]);

    expect(prismaMock.waCampaignRecipient.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waCampaignRecipient.findMany.mock.calls[0][0].where).toEqual({
      wamid: { in: ['wamid.1', 'wamid.2', 'wamid.3'] },
    });
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r2', 'r3'] } },
      data: { status: 'DELIVERED' },
    });
  });

  it('never regresses a recipient that is already further along', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      recipient({ id: 'r1', wamid: 'wamid.1', status: 'READ' }),
      recipient({ id: 'r2', wamid: 'wamid.2', status: 'SENT' }),
    ]);

    await reconcileRecipientStatuses([
      { wamid: 'wamid.1', status: 'DELIVERED' },
      { wamid: 'wamid.2', status: 'DELIVERED' },
    ]);

    // Only the SENT recipient advances; the READ one is left alone.
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r2'] } },
      data: { status: 'DELIVERED' },
    });
  });

  it('keeps the furthest-along status when one batch carries delivered and read', async () => {
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      recipient({ id: 'r1', wamid: 'wamid.1' }),
    ]);

    await reconcileRecipientStatuses([
      { wamid: 'wamid.1', status: 'DELIVERED' },
      { wamid: 'wamid.1', status: 'READ' },
    ]);

    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { status: 'READ' },
    });
  });

  it('splits failures by error code and books a capped one as SKIPPED', async () => {
    // Same classification the synchronous send path uses: a frequency-capped or
    // opted-out recipient is a skip, so "retry failed" never re-sends to them.
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      recipient({ id: 'r1', wamid: 'wamid.1' }),
      recipient({ id: 'r2', wamid: 'wamid.2' }),
    ]);

    await reconcileRecipientStatuses([
      { wamid: 'wamid.1', status: 'FAILED', errorCode: '131049' },
      { wamid: 'wamid.2', status: 'FAILED', errorCode: '470' },
    ]);

    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { status: 'SKIPPED', errorCode: '131049' },
    });
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r2'] } },
      data: { status: 'FAILED', errorCode: '470' },
    });
  });

  it('reports the wamids with no recipient row so the caller can replay them', async () => {
    // The campaign worker writes the recipient's wamid only after the send call
    // returns, while dispatchOutbound has already stamped it on the WaMessage.
    // A `delivered` callback that arrives in between matches nothing here, and
    // saying so is what lets the inbound worker leave the event for the recovery
    // pass instead of leaving that recipient on SENT for good.
    prismaMock.waCampaignRecipient.findMany.mockResolvedValue([
      recipient({ id: 'r1', wamid: 'wamid.1' }),
    ]);

    await expect(
      reconcileRecipientStatuses([
        { wamid: 'wamid.1', status: 'DELIVERED' },
        { wamid: 'wamid.2', status: 'DELIVERED' },
      ])
    ).resolves.toEqual(['wamid.2']);

    // The one it DID find is still settled — a missing sibling holds nothing up.
    expect(prismaMock.waCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { status: 'DELIVERED' },
    });
  });

  it('does not touch the database for an empty batch', async () => {
    await expect(reconcileRecipientStatuses([])).resolves.toEqual([]);

    expect(prismaMock.waCampaignRecipient.findMany).not.toHaveBeenCalled();
    expect(prismaMock.waCampaignRecipient.updateMany).not.toHaveBeenCalled();
  });
});

describe('deleteCampaign', () => {
  it('hard-deletes a DRAFT (the schema cascades its recipients, steps and variants)', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ id: 'camp-1', status: 'DRAFT' });

    await expect(deleteCampaign('camp-1')).resolves.toEqual({ deleted: true, archived: false });

    expect(prismaMock.waCampaign.delete).toHaveBeenCalledWith({ where: { id: 'camp-1' } });
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });

  it('archives a COMPLETED campaign and disarms its recurrence', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ id: 'camp-1', status: 'COMPLETED' });

    await expect(deleteCampaign('camp-1')).resolves.toEqual({ deleted: false, archived: true });

    // Its numbers are still referenced by analytics and conversions, so it leaves
    // the list rather than the database — and `nextRunAt` has to go with it, or
    // the recurrence cron keeps minting clones of something the operator believes
    // they removed.
    expect(prismaMock.waCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { archivedAt: NOW, nextRunAt: null },
    });
    expect(prismaMock.waCampaign.delete).not.toHaveBeenCalled();
  });

  it('refuses a campaign that is still mid-flight', async () => {
    prismaMock.waCampaign.findUnique.mockResolvedValue({ id: 'camp-1', status: 'RUNNING' });

    await expect(deleteCampaign('camp-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_CAMPAIGN_BAD_STATE',
    });

    expect(prismaMock.waCampaign.delete).not.toHaveBeenCalled();
    expect(prismaMock.waCampaign.update).not.toHaveBeenCalled();
  });
});

describe('twoProportionZ', () => {
  // The A/B panel showed four raw counters, so a gap that is pure noise read as
  // a win. This is the check that turns "9 of 40 vs 7 of 38" into a verdict.
  it('calls a small difference on small samples insignificant', () => {
    const z = twoProportionZ(9, 40, 7, 38);
    expect(z).not.toBeNull();
    expect(Math.abs(z!)).toBeLessThan(1.96);
  });

  it('clears 95% once the same gap is measured on a real audience', () => {
    const z = twoProportionZ(900, 4000, 700, 3800);
    expect(z).not.toBeNull();
    expect(Math.abs(z!)).toBeGreaterThan(1.96);
  });

  it('is null when an arm has no sends, so the UI says "not enough data"', () => {
    expect(twoProportionZ(0, 0, 5, 20)).toBeNull();
    expect(twoProportionZ(5, 20, 0, 0)).toBeNull();
  });

  it('is null when nobody in either arm converted (no variance to test)', () => {
    expect(twoProportionZ(0, 30, 0, 30)).toBeNull();
  });
});

/**
 * The pre-flight is the only thing standing between an ineligible number and a
 * materialized audience: Meta reports a perfectly normal quality rating right up
 * to the moment it refuses the send, so this verdict is the ONLY advance warning
 * that exists. Two things have to hold — the worse of the two verdicts wins, and
 * a check that could not be made is never mistaken for a refusal.
 */
describe('campaignPreflight', () => {
  const unchecked = {
    available: false,
    canSend: null,
    entities: [],
    checkedAt: null,
  };

  beforeEach(() => {
    prismaMock.waCampaign.findUnique.mockResolvedValue(segmentCampaign());
    getPhoneHealthStatusMock.mockResolvedValue({
      ...unchecked,
      available: true,
      canSend: 'AVAILABLE',
    });
    getTemplateHealthStatusMock.mockResolvedValue({
      ...unchecked,
      available: true,
      canSend: 'AVAILABLE',
    });
  });

  it('is clear when Meta says both the number and the template can send', async () => {
    const result = await campaignPreflight('camp-1');

    expect(result).toEqual({ canSend: 'AVAILABLE', checked: true, blockers: [], errors: [] });
  });

  it('takes the worse of the two verdicts, so a paused template still stops the launch', async () => {
    getTemplateHealthStatusMock.mockResolvedValue({
      available: true,
      canSend: 'BLOCKED',
      entities: [{ type: 'MESSAGE_TEMPLATE', id: 'tpl-meta', canSend: 'BLOCKED', errors: [] }],
      checkedAt: 'now',
    });

    const result = await campaignPreflight('camp-1');

    expect(result.canSend).toBe('BLOCKED');
    expect(result.blockers).toEqual([
      { type: 'MESSAGE_TEMPLATE', id: 'tpl-meta', canSend: 'BLOCKED', errors: [] },
    ]);
  });

  it('lists a shared blocker once, not once per check that reported it', async () => {
    const waba = { type: 'WABA', id: 'waba1', canSend: 'LIMITED', errors: [] };
    getPhoneHealthStatusMock.mockResolvedValue({
      available: true,
      canSend: 'LIMITED',
      entities: [{ type: 'PHONE_NUMBER', id: '111', canSend: 'AVAILABLE', errors: [] }, waba],
      checkedAt: 'now',
    });
    getTemplateHealthStatusMock.mockResolvedValue({
      available: true,
      canSend: 'LIMITED',
      entities: [waba],
      checkedAt: 'now',
    });

    const result = await campaignPreflight('camp-1');

    expect(result.blockers).toEqual([waba]);
  });

  it('reports an unanswerable check as unchecked, never as a refusal', async () => {
    // A token without the management permission cannot read health_status. Calling
    // that BLOCKED would refuse every launch on an account that is sending fine.
    getPhoneHealthStatusMock.mockResolvedValue({ ...unchecked, error: 'no permission' });
    getTemplateHealthStatusMock.mockResolvedValue({ ...unchecked, error: 'never submitted' });

    const result = await campaignPreflight('camp-1');

    expect(result).toEqual({
      canSend: null,
      checked: false,
      blockers: [],
      errors: ['no permission', 'never submitted'],
    });
  });

  it('survives a check that throws outright', async () => {
    getPhoneHealthStatusMock.mockRejectedValue(new Error('WhatsApp is not configured'));

    const result = await campaignPreflight('camp-1');

    expect(result.canSend).toBe('AVAILABLE');
    expect(result.errors).toEqual(['WhatsApp is not configured']);
  });
});
