/**
 * Tests for the analytics service (src/services/whatsapp-analytics.service.ts).
 *
 * Nothing in this module is enforced by anything else: the rates are hand-rolled
 * arithmetic, the series are hand-written SQL whose rows are mapped by hand, and
 * the shapes are consumed by a dashboard in another repository that only finds
 * out about a rename at runtime — which is exactly how a CSAT panel shipped
 * reading `average` off a response that has always said `averageScore`, and
 * rendered blank for every deployment with nobody the wiser.
 *
 * So these tests cover the three things that break silently: the denominators
 * (a rate that is wrong still looks like a rate), the raw-row mapping (bigint
 * and Date leak straight through JSON as garbage if it is skipped), and the key
 * names the frontend types name back — see `frontend/src/types/whatsapp.ts`.
 *
 * Prisma and the sibling services are mocked; the arithmetic and the mapping
 * under test are this module's own.
 */

const prismaMock = {
  waContact: { count: jest.fn() },
  waConversation: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
  waMessage: { count: jest.fn() },
  waTemplate: { groupBy: jest.fn() },
  waCampaign: { groupBy: jest.fn() },
  waChannel: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

jest.mock('../../config/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../whatsapp-bridge.service', () => ({ isBridgeEnabled: () => false }));
jest.mock('../whatsapp-pricing', () => ({ ESTIMATE_CURRENCY: 'INR', envRatePaise: () => 78 }));
jest.mock('../whatsapp-shortlink.service', () => ({ getClickSeries: jest.fn() }));
jest.mock('../whatsapp-channel.service', () => ({ getDefaultChannel: jest.fn() }));

const REPORTING_TZ = 'Asia/Kolkata';
jest.mock('../whatsapp-reporting-tz', () => ({
  reportingTz: jest.fn().mockResolvedValue('Asia/Kolkata'),
  DEFAULT_REPORTING_TZ: 'UTC',
}));

import {
  clampDays,
  clampMonths,
  deriveMessageRates,
  getCohortReport,
  getCsatSummary,
  getHourlyHeatmap,
  getOptOutTrend,
  getOverview,
  getTimeSeries,
  rollupMessageDays,
} from '../whatsapp-analytics.service';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deriveMessageRates', () => {
  it('counts a read message as delivered exactly once', () => {
    // `delivered` is count(status IN [DELIVERED, READ]), so it already contains
    // every read row. Adding them again halved the read rate: a deployment where
    // every message was opened reported 50%.
    expect(deriveMessageRates({ delivered: 100, read: 100, failed: 0 })).toEqual({
      deliveryRate: 100,
      readRate: 100,
      failRate: 0,
    });
  });

  it('divides by what was attempted, never by every outbound row', () => {
    // 40 arrived (10 of them read), 10 failed, and however many are still QUEUED
    // is not an input here at all — a launch in progress must not drag the
    // delivery rate down while the queue drains.
    expect(deriveMessageRates({ delivered: 40, read: 10, failed: 10 })).toEqual({
      deliveryRate: 80,
      readRate: 25,
      failRate: 20,
    });
  });

  it('returns zero rather than NaN before anything has been attempted', () => {
    expect(deriveMessageRates({ delivered: 0, read: 0, failed: 0 })).toEqual({
      deliveryRate: 0,
      readRate: 0,
      failRate: 0,
    });
  });

  it('survives a read callback arriving before its delivered callback', () => {
    // Meta can deliver the two status webhooks out of order, which briefly makes
    // read > delivered. The clamp keeps that from producing a negative
    // denominator and a nonsense rate on the dashboard.
    expect(deriveMessageRates({ delivered: 0, read: 5, failed: 5 })).toEqual({
      deliveryRate: 50,
      readRate: 100,
      failRate: 50,
    });
  });
});

describe('clampDays', () => {
  it('falls back to 30 days for a value that is not a number', () => {
    expect(clampDays(NaN)).toBe(30);
    expect(clampDays(Infinity)).toBe(30);
  });

  it('never returns a window shorter than a day', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
  });

  it('caps the window at a year so a stray `days=100000` cannot scan the table', () => {
    expect(clampDays(400)).toBe(365);
    expect(clampDays(1_000_000)).toBe(365);
  });

  it('truncates a fractional window to whole days', () => {
    expect(clampDays(7.9)).toBe(7);
  });
});

describe('clampMonths', () => {
  it('falls back to six months for a value that is not a number', () => {
    expect(clampMonths(NaN)).toBe(6);
    expect(clampMonths(Infinity)).toBe(6);
  });

  it('never returns a window shorter than a month, or longer than two years', () => {
    expect(clampMonths(0)).toBe(1);
    expect(clampMonths(-3)).toBe(1);
    expect(clampMonths(400)).toBe(24);
  });
});

describe('rollupMessageDays', () => {
  it('refuses to overwrite a day the retention prune has already reached into', async () => {
    prismaMock.$executeRaw.mockResolvedValue(0);

    await rollupMessageDays(14);

    const sql = (prismaMock.$executeRaw.mock.calls[0][0]?.strings ?? []).join(' ');
    // The catch-up window is wider than most retention windows are required to be
    // (retentionDays has no lower bound), so an UNCONDITIONAL upsert recomputed the
    // prune's boundary day from the rows that happened to survive that hour and
    // overwrote the day's real 24-hour figure with a shrinking remainder — the
    // archive destroying the very history it exists to preserve. The guard is the
    // one clause standing between the rollup and that, and nothing else can catch
    // its removal: it is invisible to tsc and to a suite running on empty tables.
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE SET');
    expect(sql).toContain('WHERE "WaMessageDaily"."date" >');
    // Keep-forever deployments (retentionDays null/0) must still be corrected on
    // every pass, which is what the sentinel bound is for.
    expect(sql).toContain("'-infinity'::date");
  });
});

describe('getCohortReport', () => {
  it('maps Postgres bigints and month markers into JSON-safe values, with derived rates', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        month: new Date('2026-03-01T00:00:00.000Z'),
        contacts: BigInt(200),
        opted_in: BigInt(150),
        opted_out: BigInt(50),
        replied: BigInt(80),
        active30: BigInt(40),
        inbound: BigInt(320),
        outbound: BigInt(900),
        conversions: BigInt(12),
        value_paise: BigInt(345600),
      },
      {
        month: new Date('2026-04-01T00:00:00.000Z'),
        contacts: BigInt(0),
        opted_in: BigInt(0),
        opted_out: BigInt(0),
        replied: BigInt(0),
        active30: BigInt(0),
        inbound: BigInt(0),
        outbound: BigInt(0),
        conversions: BigInt(0),
        value_paise: BigInt(0),
      },
    ]);

    const report = await getCohortReport(2);

    expect(report.months).toBe(2);
    expect(report.tz).toBe(REPORTING_TZ);
    // bigint is not serializable — `JSON.stringify` throws on it outright — and the
    // month marker would reach the table as a full ISO timestamp.
    expect(report.rows[0]).toEqual({
      month: '2026-03-01',
      contacts: 200,
      optedIn: 150,
      optedOut: 50,
      replied: 80,
      activeLast30: 40,
      inbound: 320,
      outbound: 900,
      conversions: 12,
      conversionValuePaise: 345600,
      replyRate: 40,
      retentionRate: 20,
      churnRate: 25,
    });
    expect(() => JSON.stringify(report)).not.toThrow();
    // A month nobody was acquired in has no denominator: it must read zero rather
    // than divide by it.
    expect(report.rows[1].replyRate).toBe(0);
    expect(report.rows[1].retentionRate).toBe(0);
  });
});

/** What the equally-long window before this one carried, in every stub below. */
const PREVIOUS_PERIOD = { inbound: 1, outbound: 1, delivered: 1, read: 1, failed: 1 };

/** The five message counts, as Postgres hands them back from the merge query. */
function bigintRow(counts: {
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}) {
  return {
    inbound: BigInt(counts.inbound),
    outbound: BigInt(counts.outbound),
    delivered: BigInt(counts.delivered),
    read: BigInt(counts.read),
    failed: BigInt(counts.failed),
  };
}

/**
 * Wire up the concurrent reads `getOverview` issues, keyed on their filters.
 *
 * The five message counts no longer come from `waMessage.count`: they are one
 * raw statement that takes the larger of the live table and the daily rollup per
 * day, so a window whose rows the retention prune has since deleted still
 * reports the traffic it actually carried. They are stubbed by inspecting the
 * statement instead of a `where` clause.
 */
function stubOverviewCounts(counts: {
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}): void {
  prismaMock.waContact.count.mockImplementation(
    async (args?: { where?: { optInStatus?: string; isBlocked?: boolean } }) => {
      if (!args?.where) return 10;
      if (args.where.optInStatus === 'OPTED_IN') return 7;
      if (args.where.optInStatus === 'OPTED_OUT') return 2;
      return 1;
    }
  );
  prismaMock.waConversation.count.mockImplementation(
    async (args?: { where?: { status?: string } }) => (args?.where?.status === 'OPEN' ? 3 : 5)
  );
  prismaMock.$queryRaw.mockImplementation(async (q: { strings?: string[] }) => {
    const text = (q?.strings ?? []).join(' ');
    // The window boundary is resolved in Postgres so it cannot drift from the
    // one the charts cut on.
    if (text.includes('AS since')) return [{ since: new Date('2026-08-05T00:00:00.000Z') }];
    // The previous period is the only totals query with an UPPER bound on
    // createdAt; it must not answer with this period's numbers.
    return [bigintRow(text.includes('"createdAt" <') ? PREVIOUS_PERIOD : counts)];
  });
  prismaMock.waTemplate.groupBy.mockResolvedValue([{ status: 'APPROVED', _count: 4 }]);
  prismaMock.waCampaign.groupBy.mockResolvedValue([{ status: 'COMPLETED', _count: 2 }]);
  prismaMock.waChannel.findFirst.mockResolvedValue(null);
}

describe('getOverview', () => {
  it('reports a fully-read deployment as 100% read', async () => {
    stubOverviewCounts({ inbound: 20, outbound: 60, delivered: 10, read: 10, failed: 0 });

    const overview = await getOverview();

    // 50 of the 60 outbound rows are still QUEUED and must not appear in any
    // denominator — the counts are reported as-is beside the rates.
    expect(overview.messages).toEqual({
      inbound: 20,
      outbound: 60,
      delivered: 10,
      read: 10,
      failed: 0,
      deliveryRate: 100,
      readRate: 100,
      failRate: 0,
    });
  });

  it('has no previous period to compare a lifetime window against', async () => {
    stubOverviewCounts({ inbound: 1, outbound: 1, delivered: 1, read: 0, failed: 0 });

    const overview = await getOverview();

    expect(overview.previousMessages).toBeNull();
    expect(overview.window).toEqual({ days: null, since: null });
    expect(overview.tz).toBe(REPORTING_TZ);
  });

  it('compares a window against the equally long window before it', async () => {
    stubOverviewCounts({ inbound: 4, outbound: 4, delivered: 4, read: 2, failed: 0 });

    const overview = await getOverview(7);

    expect(overview.window.days).toBe(7);
    expect(typeof overview.window.since).toBe('string');
    // Every previous-period count comes from the bounded query stubbed above, so
    // a window that quietly reused this period's numbers would show 4 here.
    expect(overview.previousMessages).toEqual({
      inbound: 1,
      outbound: 1,
      delivered: 1,
      read: 1,
      failed: 1,
    });
  });
});

describe('getTimeSeries', () => {
  it('maps Postgres bigints and day markers into JSON-safe values', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        date: new Date('2026-03-01T00:00:00.000Z'),
        inbound: BigInt(3),
        outbound: BigInt(9),
        delivered: BigInt(7),
        read: BigInt(4),
        failed: BigInt(1),
      },
      {
        date: new Date('2026-03-02T00:00:00.000Z'),
        inbound: BigInt(0),
        outbound: BigInt(0),
        delivered: BigInt(0),
        read: BigInt(0),
        failed: BigInt(0),
      },
    ]);

    const series = await getTimeSeries(30);

    // bigint is not serializable — `JSON.stringify` throws on it outright — and a
    // Date would reach the chart as a full ISO timestamp it plots as a distinct
    // category from every other point on the same day.
    expect(series).toEqual([
      { date: '2026-03-01', inbound: 3, outbound: 9, delivered: 7, read: 4, failed: 1 },
      { date: '2026-03-02', inbound: 0, outbound: 0, delivered: 0, read: 0, failed: 0 },
    ]);
    expect(() => JSON.stringify(series)).not.toThrow();
  });

  it('returns an empty series rather than throwing when the window has no rows', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    expect(await getTimeSeries(7)).toEqual([]);
  });
});

describe('getOptOutTrend', () => {
  it('maps each consent-event day to its opt-out and opt-in counts', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { date: new Date('2026-03-01T00:00:00.000Z'), opt_outs: BigInt(12), opt_ins: BigInt(1) },
      { date: new Date('2026-03-02T00:00:00.000Z'), opt_outs: BigInt(0), opt_ins: BigInt(0) },
    ]);

    // The zero day is the point of the chart: a list that lost 12 contacts to one
    // send and nobody afterwards must not draw as a plateau of churn.
    expect(await getOptOutTrend(30)).toEqual([
      { date: '2026-03-01', count: 12, optIns: 1 },
      { date: '2026-03-02', count: 0, optIns: 0 },
    ]);
  });
});

describe('getHourlyHeatmap', () => {
  it('maps the weekday/hour buckets to plain numbers', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { dow: 1, hour: 9, count: BigInt(42) },
      { dow: 6, hour: 22, count: BigInt(3) },
    ]);

    expect(await getHourlyHeatmap(30, 'INBOUND')).toEqual([
      { dow: 1, hour: 9, count: 42 },
      { dow: 6, hour: 22, count: 3 },
    ]);
  });
});

describe('getCsatSummary', () => {
  it('returns the key names the dashboard reads, zero-filling every rating', async () => {
    prismaMock.waConversation.aggregate.mockResolvedValue({
      _avg: { csatScore: 4.3333333 },
      _count: { csatScore: 3 },
    });
    prismaMock.waConversation.groupBy.mockResolvedValue([
      { csatScore: 5, _count: { _all: 2 } },
      { csatScore: 3, _count: { _all: 1 } },
    ]);

    const csat = await getCsatSummary();

    // `averageScore`/`ratedCount`, NOT `average`/`count`: the panel is typed
    // against these names in frontend/src/types/whatsapp.ts (WaCsatSummary) and
    // renders an empty state the moment either side renames one.
    expect(Object.keys(csat).sort()).toEqual(['averageScore', 'distribution', 'ratedCount']);
    expect(csat.averageScore).toBe(4.33);
    expect(csat.ratedCount).toBe(3);
    // Every bucket present, so the 1-5 bar chart has five bars whatever was rated.
    expect(csat.distribution).toEqual([
      { score: 1, count: 0 },
      { score: 2, count: 0 },
      { score: 3, count: 1 },
      { score: 4, count: 0 },
      { score: 5, count: 2 },
    ]);
  });

  it('reports no average at all when nobody has rated anything', async () => {
    prismaMock.waConversation.aggregate.mockResolvedValue({
      _avg: { csatScore: null },
      _count: { csatScore: 0 },
    });
    prismaMock.waConversation.groupBy.mockResolvedValue([]);

    const csat = await getCsatSummary();

    // null, not 0 — a dashboard showing "0.00 CSAT" for an unrated period is
    // reporting terrible satisfaction rather than no data.
    expect(csat.averageScore).toBeNull();
    expect(csat.ratedCount).toBe(0);
  });

  it('windows on when the rating came in, not when the thread started', async () => {
    prismaMock.waConversation.aggregate.mockResolvedValue({
      _avg: { csatScore: 5 },
      _count: { csatScore: 1 },
    });
    prismaMock.waConversation.groupBy.mockResolvedValue([]);

    await getCsatSummary(30);

    // A quarter of poor scores must not be averaged away by years of good
    // history, so the filter is on csatAt.
    expect(prismaMock.waConversation.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { csatScore: { not: null }, csatAt: { gte: expect.any(Date) } },
      })
    );
  });
});
