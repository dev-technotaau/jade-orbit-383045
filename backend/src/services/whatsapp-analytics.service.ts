import { Prisma } from '@prisma/client';
import type { WaCampaignStatus, WaTemplateCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { isBridgeEnabled } from './whatsapp-bridge.service';
import { ESTIMATE_CURRENCY, envRatePaise } from './whatsapp-pricing';
import { getClickSeries } from './whatsapp-shortlink.service';
import { getDefaultChannel } from './whatsapp-channel.service';
import { reportingTz } from './whatsapp-reporting-tz';

/**
 * Aggregate metrics for the super-admin WhatsApp analytics dashboard.
 * All counts are computed live (cheap, indexed). Rates are vs. outbound total.
 */
/**
 * Resolve an optional `days` window into the two cutoffs every windowed
 * aggregate below needs: the start of THIS period, and the start of the one
 * immediately before it (for the period-over-period delta).
 *
 * `undefined` days means lifetime — the behaviour every one of these endpoints
 * had before, and still the default when the caller asks for no window.
 */
function resolveWindow(days?: number): {
  since: Date | null;
  prevSince: Date | null;
  days: number | null;
} {
  if (days === undefined || days === null) return { since: null, prevSince: null, days: null };
  const n = clampDays(days);
  const ms = n * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return { since: new Date(now - ms), prevSince: new Date(now - 2 * ms), days: n };
}

/**
 * Restrict an aggregate to one WhatsApp number, or to all of them.
 *
 * WaChannel has supported several numbers from the start and WaMessage has
 * carried `channelId` all along, but every aggregate was cross-channel with no
 * way to split it — so a deployment running a support number and a marketing
 * number reported one blended volume, one blended cost and one blended delivery
 * rate, and could not tell which number produced either half.
 *
 * Deliberately NOT applied to the consent aggregates (opt-out trend/summary):
 * WaConsentEvent records a decision about a CONTACT, who is one person however
 * many of our numbers they have written to, so slicing consent by channel would
 * invent an attribution the data does not carry.
 */
function channelSql(channelId?: string | null): Prisma.Sql {
  return channelId ? Prisma.sql`AND "channelId" = ${channelId}` : Prisma.empty;
}

/** The same filter for Prisma's query builder. */
function channelWhere(channelId?: string | null): { channelId?: string } {
  return channelId ? { channelId } : {};
}

/**
 * Recompute the daily message rollup for the trailing `days` days.
 *
 * WHY THIS EXISTS. Every headline on the dashboard was a live COUNT(*) over
 * WaMessage, and the retention cron hard-deletes from that table — so the
 * numbers shrank the night the prune crossed a day boundary, "total messages
 * sent" was not a figure anyone could put in a report, and a quiet week was
 * indistinguishable from a pruned one. These aggregates carry no message text,
 * no phone number and no contact id, so they outlive the rows they came from.
 *
 * RECOMPUTED, not incremented. Statuses arrive for hours (sometimes days) after
 * the send, so a row written once at midnight would freeze a delivery rate that
 * was still moving. Re-rolling a trailing window upserts the corrected figures
 * over the provisional ones, which is also what makes the job idempotent and
 * safe to run from both the cron and the prune.
 *
 * NEVER OVERWRITES A DAY THE PRUNE HAS REACHED INTO. The recompute window and
 * the retention window are configured independently, and the prune cutoff is a
 * mid-day instant — so on any deployment whose `retentionDays` is shorter than
 * the catch-up window (there is no lower bound on it; 14 days or 3 is perfectly
 * settable), the boundary day sat INSIDE the window that gets recomputed every
 * hour. A blanket `SET "messages" = EXCLUDED."messages"` then replaced that day's
 * correct 24-hour figure with however many rows had survived that hour's cutoff,
 * an hour smaller each pass, until the day fell below the cutoff entirely and
 * froze at roughly one hour of traffic — presented by `GREATEST(raw, rollup)` as
 * authoritative history forever. The archive that exists to outlive the prune was
 * being destroyed by it. So the upsert only CORRECTS days that are still wholly
 * above the cutoff; a day the prune has started eating keeps the figure recorded
 * while it was complete, and one with no row yet is still captured (an INSERT
 * adds history, it cannot shrink any).
 *
 * SCALE. One statement, aggregated Postgres-side over the `createdAt` index —
 * not a row-by-row loop — because the table this reads is the biggest one here.
 * Keep the window small (three days covers every late callback in practice); a
 * caller asking for a long backfill pays for a proportionally longer scan.
 */
export async function rollupMessageDays(days = 3): Promise<number> {
  const n = Math.min(Math.max(Math.trunc(days) || 1, 1), 365);
  const tz = await reportingTz();
  // Buckets are cut in the REPORTING timezone, the same boundary getTimeSeries
  // and every windowed aggregate use. Rolling up in UTC instead would have made
  // the stored history disagree with the live query by up to a day for every
  // deployment that is not on UTC — and the two are compared directly (see
  // `mergedDaySeries`), so that discrepancy would surface as phantom volume.
  const written = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "WaMessageDaily" (
      "id", "date", "channelId", "direction", "category",
      "messages", "delivered", "read", "failed", "costPaise", "computedAt"
    )
    SELECT
      gen_random_uuid(),
      date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date,
      "channelId",
      "direction",
      COALESCE("templateCategory"::text, 'SESSION'),
      COUNT(*),
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" IN ('DELIVERED', 'READ')),
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'READ'),
      COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'FAILED'),
      COALESCE(SUM("costPaise"), 0),
      now()
    FROM "WaMessage"
    WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))
            AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
    -- Positions 2..5 are the key columns; position 1 is gen_random_uuid(),
    -- which is evaluated once per output row rather than grouped on.
    GROUP BY 2, 3, 4, 5
    ON CONFLICT ("date", "channelId", "direction", "category") DO UPDATE SET
      "messages" = EXCLUDED."messages",
      "delivered" = EXCLUDED."delivered",
      "read" = EXCLUDED."read",
      "failed" = EXCLUDED."failed",
      "costPaise" = EXCLUDED."costPaise",
      "computedAt" = now()
    -- The retention guard (see the header): only days the prune cannot have taken
    -- a bite out of yet may be recomputed. The cutoff day is read in the same
    -- statement rather than fetched first, so a settings change mid-run cannot
    -- land between the read and the write. '-infinity' is the keep-forever case —
    -- retentionDays null, 0 or negative selects no row, and every day is then
    -- above the sentinel, which restores the plain "always correct" behaviour.
    WHERE "WaMessageDaily"."date" > COALESCE((
      SELECT (date_trunc('day',
                (now() - make_interval(days => s."retentionDays")) AT TIME ZONE ${tz}
              ))::date
      FROM "WaSettings" s
      WHERE s."id" = 'default' AND s."retentionDays" > 0
    ), '-infinity'::date)
  `);
  return written;
}

/** Counts of the same five message states, for the previous-period delta. */
export interface WaMessageCounts {
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}

/**
 * Local-midnight boundary `n` days back, as the SQL expression the charts use.
 * Null `n` means "no bound", which is what a lifetime window asks for.
 */
function dayBoundary(tz: string, n: number | null): Prisma.Sql | null {
  if (n === null) return null;
  return Prisma.sql`(date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))`;
}

/**
 * The five headline message counts over a window, taking the larger of the live
 * table and the daily rollup for each day.
 *
 * WHY GREATEST, AND WHY BOTH SOURCES. The rollup is derived from these very
 * rows, so while a day is still in the raw table the two agree and the live
 * figure wins any tie. Once the retention prune deletes that day, the raw side
 * drops to zero and the rollup carries the history — which is the whole point:
 * a report taken today used to become irreproducible the moment the prune ran,
 * because the counts it was built from had been deleted underneath it.
 *
 * Both bounds are LOCAL MIDNIGHT boundaries rather than "now minus N×24h". The
 * rollup is day-granular, so a partial-day bound would compare a fraction of a
 * day against a whole rolled-up one and GREATEST would silently take the bigger
 * — inventing traffic at both edges of every window. Aligning to day boundaries
 * also makes this tile agree with the chart beneath it, which has always cut on
 * exactly these lines.
 *
 * SOFT-DELETED MESSAGES ARE COUNTED, deliberately. `deletedAt` is "delete for
 * me": it hides a row from the operator's inbox and changes nothing about the
 * fact that the message was exchanged and billed. Excluding it would make this
 * dashboard disagree with Meta's invoice, which is the one number here that has
 * to reconcile.
 */
async function messageTotals(opts: {
  tz: string;
  /** Window start, in whole days back from today's local midnight. */
  fromDaysAgo: number | null;
  /** Exclusive window end, same units; null runs to now. */
  toDaysAgo?: number | null;
  channelId?: string | null;
}): Promise<WaMessageCounts> {
  const lo = dayBoundary(opts.tz, opts.fromDaysAgo);
  const hi = dayBoundary(opts.tz, opts.toDaysAgo ?? null);
  const ch = channelSql(opts.channelId);
  const rawWhere = Prisma.sql`
    ${lo ? Prisma.sql`AND "createdAt" >= ${lo} AT TIME ZONE ${opts.tz} AT TIME ZONE 'UTC'` : Prisma.empty}
    ${hi ? Prisma.sql`AND "createdAt" < ${hi} AT TIME ZONE ${opts.tz} AT TIME ZONE 'UTC'` : Prisma.empty}
    ${ch}`;
  const rollWhere = Prisma.sql`
    ${lo ? Prisma.sql`AND "date" >= (${lo})::date` : Prisma.empty}
    ${hi ? Prisma.sql`AND "date" < (${hi})::date` : Prisma.empty}
    ${ch}`;

  const [row] = await prisma.$queryRaw<
    { inbound: bigint; outbound: bigint; delivered: bigint; read: bigint; failed: bigint }[]
  >(Prisma.sql`
    WITH raw AS (
      SELECT
        date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${opts.tz})::date AS day,
        COUNT(*) FILTER (WHERE "direction" = 'INBOUND') AS inbound,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND') AS outbound,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" IN ('DELIVERED', 'READ')) AS delivered,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'READ') AS "read",
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'FAILED') AS failed
      FROM "WaMessage"
      WHERE TRUE ${rawWhere}
      GROUP BY 1
    ),
    roll AS (
      SELECT
        "date" AS day,
        COALESCE(SUM("messages") FILTER (WHERE "direction" = 'INBOUND'), 0)::bigint AS inbound,
        COALESCE(SUM("messages") FILTER (WHERE "direction" = 'OUTBOUND'), 0)::bigint AS outbound,
        COALESCE(SUM("delivered"), 0)::bigint AS delivered,
        COALESCE(SUM("read"), 0)::bigint AS "read",
        COALESCE(SUM("failed"), 0)::bigint AS failed
      FROM "WaMessageDaily"
      WHERE TRUE ${rollWhere}
      GROUP BY 1
    )
    -- ::bigint on every aggregate: SUM() over a bigint returns NUMERIC, which the
    -- driver hands back as a Decimal rather than the bigint this reads as.
    SELECT
      COALESCE(SUM(GREATEST(COALESCE(r.inbound, 0), COALESCE(l.inbound, 0))), 0)::bigint AS inbound,
      COALESCE(SUM(GREATEST(COALESCE(r.outbound, 0), COALESCE(l.outbound, 0))), 0)::bigint AS outbound,
      COALESCE(SUM(GREATEST(COALESCE(r.delivered, 0), COALESCE(l.delivered, 0))), 0)::bigint AS delivered,
      COALESCE(SUM(GREATEST(COALESCE(r."read", 0), COALESCE(l."read", 0))), 0)::bigint AS "read",
      COALESCE(SUM(GREATEST(COALESCE(r.failed, 0), COALESCE(l.failed, 0))), 0)::bigint AS failed
    FROM raw r
    FULL OUTER JOIN roll l USING (day)
  `);
  return {
    inbound: Number(row?.inbound ?? 0),
    outbound: Number(row?.outbound ?? 0),
    delivered: Number(row?.delivered ?? 0),
    read: Number(row?.read ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

/** The three headline percentages the dashboard shows above the message counts. */
export interface WaMessageRates {
  deliveryRate: number;
  readRate: number;
  failRate: number;
}

/**
 * Derive the delivery / read / fail percentages from the raw outbound counts.
 *
 * Each rate gets the denominator it actually means.
 *
 * All three used to divide by EVERY outbound row, including QUEUED messages that
 * had not been attempted yet. Launching a large campaign therefore made the
 * delivery rate collapse in real time — not because delivery got worse, but
 * because the denominator grew ahead of the numerator. The one number an operator
 * watches during a send was the one guaranteed to mislead.
 * No msgSent counter exists, and QUEUED is the only pre-attempt state, so
 * "attempted" is every outbound row that has left the queue. Computed from the
 * states we do count rather than adding another query.
 *
 * `delivered` is count(status IN [DELIVERED, READ]) — it ALREADY includes every
 * read message. Adding `read` to it counted those rows twice, so a deployment
 * where every message was read reported a 50% read rate instead of 100%, and the
 * delivery/fail rates were skewed by the same inflated denominator. Derive the
 * delivered-only figure and add read back exactly once.
 *
 * Split out of `getOverview` so these two rules — the denominator that excludes
 * QUEUED, and the union that must not be double-counted — are assertable without
 * a database; both were silent regressions with nothing to catch them.
 */
export function deriveMessageRates(counts: {
  delivered: number;
  read: number;
  failed: number;
}): WaMessageRates {
  const deliveredOnly = Math.max(0, counts.delivered - counts.read);
  const deliveredOrRead = deliveredOnly + counts.read;
  const attempted = deliveredOrRead + counts.failed;
  const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  return {
    // (delivered + read) / attempted — `delivered` is already the union.
    deliveryRate: pctOf(deliveredOrRead, attempted),
    // read / (delivered + read) — of the messages that arrived, how many were opened.
    readRate: pctOf(counts.read, deliveredOrRead),
    // failed / attempted
    failRate: pctOf(counts.failed, attempted),
  };
}

export async function getOverview(days?: number, channelId?: string | null) {
  const { days: windowDays } = resolveWindow(days);
  const tz = await reportingTz();
  // Local midnight, N days back — the boundary the charts have always used, and
  // now the one the tiles use too. The tile used to window on a bare
  // now-minus-N×24h, so it counted the tail of a day that falls off the left
  // edge of the chart below it and the two numbers disagreed. It is also what
  // makes the daily rollup comparable at all (see `messageTotals`).
  const since = windowDays === null ? null : await tzWindowStart(windowDays, tz);
  // Messages and conversations are EVENTS, so the window applies to them.
  // Contacts, templates and campaigns are INVENTORY — counts of current state —
  // and stay lifetime whatever window is asked for; the dashboard labels them
  // as such. Filtering "how many contacts have opted out" by creation date
  // would answer a question nobody asked.
  const convWindow = since ? { createdAt: { gte: since } } : {};
  const [
    totalContacts,
    optedIn,
    optedOut,
    blocked,
    totalConversations,
    openConversations,
    messages,
    templatesByStatus,
    campaignsByStatus,
    channel,
    previousMessages,
  ] = await Promise.all([
    prisma.waContact.count(),
    prisma.waContact.count({ where: { optInStatus: 'OPTED_IN' } }),
    prisma.waContact.count({ where: { optInStatus: 'OPTED_OUT' } }),
    prisma.waContact.count({ where: { isBlocked: true } }),
    prisma.waConversation.count({ where: { ...convWindow, ...channelWhere(channelId) } }),
    prisma.waConversation.count({
      where: { status: 'OPEN', ...convWindow, ...channelWhere(channelId) },
    }),
    messageTotals({ tz, fromDaysAgo: windowDays, channelId }),
    prisma.waTemplate.groupBy({ by: ['status'], _count: true }),
    prisma.waCampaign.groupBy({ by: ['status'], _count: true }),
    // The number the header describes: the one being filtered on, or the
    // default when the dashboard is showing every number at once.
    channelId
      ? prisma.waChannel.findUnique({ where: { id: channelId } })
      : prisma.waChannel.findFirst({ where: { isDefault: true } }),
    // The previous period is the equally-long stretch immediately before this
    // one, so "vs. previous 30 days" compares like with like. `windowDays + 1`
    // is where it starts because the current window spans that many day buckets
    // (N whole days plus today).
    windowDays === null
      ? Promise.resolve(null)
      : messageTotals({
          tz,
          fromDaysAgo: windowDays * 2 + 1,
          toDaysAgo: windowDays,
          channelId,
        }),
  ]);

  const rates = deriveMessageRates(messages);

  return {
    contacts: { total: totalContacts, optedIn, optedOut, blocked },
    conversations: { total: totalConversations, open: openConversations },
    messages: {
      ...messages,
      ...rates,
    },
    templates: templatesByStatus.map((t) => ({ status: t.status, count: t._count })),
    campaigns: campaignsByStatus.map((c) => ({ status: c.status, count: c._count })),
    channel: channel
      ? {
          displayPhone: channel.displayPhone,
          qualityRating: channel.qualityRating,
          messagingTier: channel.messagingTier,
          isActive: channel.isActive,
        }
      : null,
    bridge: { enabled: isBridgeEnabled() },
    // Same five counts over the immediately preceding window, so the UI can show
    // "vs. previous period" rather than a number with nothing to compare it to.
    // null when no window was requested — a lifetime total has no "previous".
    previousMessages,
    // Echoed back so the dashboard can label exactly what it is showing instead
    // of asserting a range it merely asked for.
    window: { days: windowDays, since: since ? since.toISOString() : null },
    // Every daily/hourly bucket on the dashboard is cut in this zone. Returning it
    // lets the charts say so — an operator reading "busiest hour: 09:00" needs to
    // know whose 09:00, or the number is unactionable.
    tz,
  };
}

/**
 * Clamp a requested day window to a sane, index-friendly range.
 *
 * Exported so the controller can apply the SAME bound at the edge instead of
 * keeping a second copy that can drift from this one.
 */
export function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 30;
  return Math.min(Math.max(Math.trunc(days), 1), 365);
}

/**
 * The instant the day-bucketed charts start at: midnight in the REPORTING
 * timezone, `n` days back — the same expression `getOptOutTrend` windows on,
 * evaluated in Postgres so the two cannot drift.
 *
 * The charts have always windowed on this, while the summary tile above them
 * used a bare now-minus-N-days. The two were counting different sets of events:
 * the tile included the tail of a day that falls off the left edge of the chart,
 * so "27 opt-outs" sat above bars adding up to 25 and neither number could be
 * trusted enough to act on.
 */
async function tzWindowStart(n: number, tz: string): Promise<Date> {
  const [row] = await prisma.$queryRaw<{ since: Date }[]>(
    Prisma.sql`SELECT ((date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))
                 AT TIME ZONE ${tz}) AS since`
  );
  return row.since;
}

export interface WaTimeSeriesPoint {
  date: string;
  inbound: number;
  outbound: number;
  delivered: number;
  read: number;
  failed: number;
}

/**
 * Daily message buckets for the last N days. One row per day in the window —
 * including the days with no traffic at all — with inbound / outbound / delivered /
 * read / failed counts. Postgres-side aggregation over an indexed createdAt; the
 * window is a parameterized interval (injection-safe).
 *
 * The bare GROUP BY only emits days that HAVE messages, and the chart plots those
 * rows on a categorical axis, so silence was invisible: two busy days a fortnight
 * apart were drawn side by side and joined with a straight line. One campaign burst
 * read as sustained volume, and the x-axis lied about how far apart anything was.
 * generate_series supplies every day in the window and the LEFT JOIN zero-fills the
 * quiet ones, so distance along the chart is distance in time.
 */
export async function getTimeSeries(
  days = 30,
  channelId?: string | null
): Promise<WaTimeSeriesPoint[]> {
  const n = clampDays(days);
  const tz = await reportingTz();
  const ch = channelSql(channelId);
  const rows = await prisma.$queryRaw<
    {
      date: Date;
      inbound: bigint;
      outbound: bigint;
      delivered: bigint;
      read: bigint;
      failed: bigint;
    }[]
  >(Prisma.sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}),
        date_trunc('day', now() AT TIME ZONE ${tz}),
        interval '1 day'
      ) AS day
    ),
    buckets AS (
      SELECT
        date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day,
        COUNT(*) FILTER (WHERE "direction" = 'INBOUND') AS inbound,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND') AS outbound,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" IN ('DELIVERED', 'READ')) AS delivered,
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'READ') AS "read",
        COUNT(*) FILTER (WHERE "direction" = 'OUTBOUND' AND "status" = 'FAILED') AS failed
      FROM "WaMessage"
      WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))
              AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
        ${ch}
      GROUP BY 1
    ),
    -- The archived copy of the same days. Once the retention prune has deleted a
    -- day's messages the CTE above returns nothing for it and the chart would
    -- draw a flat zero over history that did happen; the rollup is what keeps
    -- the left-hand end of a long window true. GREATEST rather than COALESCE so
    -- the live figure always wins while both exist — the rollup is only ever
    -- recomputed for a trailing window, so it can lag by a few hours.
    rollup AS (
      SELECT
        "date" AS day,
        COALESCE(SUM("messages") FILTER (WHERE "direction" = 'INBOUND'), 0)::bigint AS inbound,
        COALESCE(SUM("messages") FILTER (WHERE "direction" = 'OUTBOUND'), 0)::bigint AS outbound,
        COALESCE(SUM("delivered"), 0)::bigint AS delivered,
        COALESCE(SUM("read"), 0)::bigint AS "read",
        COALESCE(SUM("failed"), 0)::bigint AS failed
      FROM "WaMessageDaily"
      WHERE "date" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))::date
        ${ch}
      GROUP BY 1
    )
    SELECT
      d.day AS date,
      GREATEST(COALESCE(b.inbound, 0), COALESCE(a.inbound, 0)) AS inbound,
      GREATEST(COALESCE(b.outbound, 0), COALESCE(a.outbound, 0)) AS outbound,
      GREATEST(COALESCE(b.delivered, 0), COALESCE(a.delivered, 0)) AS delivered,
      GREATEST(COALESCE(b."read", 0), COALESCE(a."read", 0)) AS "read",
      GREATEST(COALESCE(b.failed, 0), COALESCE(a.failed, 0)) AS failed
    FROM days d
    LEFT JOIN buckets b ON b.day = d.day::date
    LEFT JOIN rollup a ON a.day = d.day::date
    ORDER BY d.day ASC
  `);

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    inbound: Number(r.inbound),
    outbound: Number(r.outbound),
    delivered: Number(r.delivered),
    read: Number(r.read),
    failed: Number(r.failed),
  }));
}

export interface WaSlaMetrics {
  avgFirstResponseMins: number | null;
  avgResolutionMins: number | null;
  openCount: number;
  resolvedCount: number;
}

/**
 * Conversation SLA metrics: average first-response and resolution times (in
 * minutes) plus open / resolved counts. Time deltas are averaged in Postgres
 * via EPOCH extraction; nulls (no responses/resolutions yet) yield null.
 *
 * With a `days` window, "resolved" means resolved INSIDE the window (clean —
 * `resolvedAt` is the event), while the response average covers conversations
 * that were ACTIVE in the window. The response counters are lifetime
 * accumulators on the row (there is no per-response table to bucket), so that
 * is the tightest honest bound available rather than an exact per-period mean.
 */
export async function getSlaMetrics(days?: number): Promise<WaSlaMetrics> {
  const { since } = resolveWindow(days);
  const activeFilter = since
    ? Prisma.sql`WHERE "lastMessageAt" >= ${since}`
    : Prisma.sql`WHERE TRUE`;
  const [agg, openCount, resolvedCount] = await Promise.all([
    prisma.$queryRaw<{ first_response_secs: number | null; resolution_secs: number | null }[]>(
      Prisma.sql`
        SELECT
          -- Mean over RESPONSES, not over conversation rows. Both figures used to
          -- subtract "createdAt", which is the contact's first-ever message: there
          -- is one conversation per contact forever, so a two-minute reply to a
          -- customer who first wrote months ago was recorded as a months-long
          -- first response.
          CASE WHEN SUM("responseCount") > 0
               THEN SUM("responseTotalSeconds")::numeric / SUM("responseCount")
               ELSE NULL END AS first_response_secs,
          -- Resolution is measured from the start of the CURRENT episode: the
          -- reopen, or the row creation for a conversation never reopened.
          AVG(EXTRACT(EPOCH FROM ("resolvedAt" - COALESCE("reopenedAt", "createdAt"))))
            FILTER (WHERE "resolvedAt" IS NOT NULL) AS resolution_secs
        FROM "WaConversation"
        ${activeFilter}
      `
    ),
    prisma.waConversation.count({
      where: { status: 'OPEN', ...(since ? { lastMessageAt: { gte: since } } : {}) },
    }),
    prisma.waConversation.count({
      where: { status: 'RESOLVED', ...(since ? { resolvedAt: { gte: since } } : {}) },
    }),
  ]);

  const row = agg[0] ?? { first_response_secs: null, resolution_secs: null };
  const toMins = (secs: number | null) =>
    secs === null || secs === undefined ? null : Math.round(Number(secs) / 60);

  return {
    avgFirstResponseMins: toMins(row.first_response_secs),
    avgResolutionMins: toMins(row.resolution_secs),
    openCount,
    resolvedCount,
  };
}

export interface WaAgentProductivity {
  userId: string;
  name: string;
  messagesSent: number;
  conversationsAssigned: number;
  /** Conversations this agent moved to RESOLVED inside the window. */
  conversationsResolved: number;
  /** Mean minutes to an agent reply, over every response on this agent's threads. */
  avgResponseMins: number | null;
  /** Median response time, in minutes. */
  p50ResponseMins: number | null;
  /** 90th-percentile response time, in minutes — the tail an SLA is written against. */
  p90ResponseMins: number | null;
  /** Mean minutes from the start of the current episode to resolution. */
  avgResolutionMins: number | null;
  /** Mean CSAT score (1-5) over this agent's rated conversations. */
  csatAvg: number | null;
  /** How many of them were rated — an average over two ratings is not a number. */
  csatCount: number;
}

/**
 * Per-staff productivity: outbound messages sent (by sentByUserId) and
 * conversations assigned (by assignedTo), joined to User for display labels.
 * Returned for the union of staff ids that appear in either dimension.
 *
 * With a `days` window, messages are counted by send date. There is no
 * "assigned at" column, so assigned conversations are those ACTIVE in the
 * window — an assignment made a year ago on a dormant thread no longer inflates
 * this month's figure.
 *
 * Counts alone answered "who types the most", which is not what a supervisor is
 * looking for and rewards exactly the wrong behaviour — so every row also
 * carries response time (mean, median and p90), conversations resolved, mean
 * resolution time and mean CSAT, all over the same window and the same set of
 * conversations, so one row reads as one coherent picture of one agent.
 *
 * The two percentiles are over the PER-CONVERSATION mean response time, not over
 * individual responses: the counters on the row are accumulators and there is no
 * per-response table to draw from. That makes p90 "the thread this agent is
 * slowest on", which is the honest reading and still the number that finds a
 * customer being left waiting.
 */
export async function getAgentProductivity(days?: number): Promise<WaAgentProductivity[]> {
  const { since } = resolveWindow(days);
  // Same row set as the assigned-conversations groupBy below, so every column on
  // an agent's row describes the same conversations.
  const convFilter = since
    ? Prisma.sql`WHERE "assignedTo" IS NOT NULL AND "lastMessageAt" >= ${since}`
    : Prisma.sql`WHERE "assignedTo" IS NOT NULL`;
  const resolvedFilter = since
    ? Prisma.sql`"resolvedAt" >= ${since}`
    : Prisma.sql`"resolvedAt" IS NOT NULL`;
  const [bySender, byAssignee, byQuality] = await Promise.all([
    prisma.waMessage.groupBy({
      by: ['sentByUserId'],
      where: {
        direction: 'OUTBOUND',
        sentByUserId: { not: null },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.waConversation.groupBy({
      by: ['assignedTo'],
      where: { assignedTo: { not: null }, ...(since ? { lastMessageAt: { gte: since } } : {}) },
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      {
        agent: string;
        avg_secs: number | null;
        p50_secs: number | null;
        p90_secs: number | null;
        resolved: bigint;
        resolution_secs: number | null;
        csat_avg: number | null;
        csat_count: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        "assignedTo" AS agent,
        -- Mean over RESPONSES, matching the global SLA tile: the counters are
        -- accumulators, so summing them and dividing weights a busy thread by
        -- how busy it was rather than treating every thread as one sample.
        CASE WHEN SUM("responseCount") > 0
             THEN (SUM("responseTotalSeconds")::double precision / SUM("responseCount"))
             ELSE NULL END AS avg_secs,
        -- percentile_cont ignores nulls, so NULLIF drops the threads this agent
        -- has never answered instead of scoring them as an instant reply.
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY "responseTotalSeconds"::double precision / NULLIF("responseCount", 0)
        ) AS p50_secs,
        percentile_cont(0.9) WITHIN GROUP (
          ORDER BY "responseTotalSeconds"::double precision / NULLIF("responseCount", 0)
        ) AS p90_secs,
        COUNT(*) FILTER (WHERE ${resolvedFilter}) AS resolved,
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - COALESCE("reopenedAt", "createdAt"))))
          FILTER (WHERE "resolvedAt" IS NOT NULL) AS resolution_secs,
        -- FILTER binds to the aggregate call, so it has to precede the cast.
        (AVG("csatScore") FILTER (WHERE "csatScore" IS NOT NULL))::double precision AS csat_avg,
        COUNT(*) FILTER (WHERE "csatScore" IS NOT NULL) AS csat_count
      FROM "WaConversation"
      ${convFilter}
      GROUP BY 1
    `),
  ]);

  const messagesByUser = new Map<string, number>();
  for (const r of bySender) {
    if (r.sentByUserId) messagesByUser.set(r.sentByUserId, r._count._all);
  }
  const convosByUser = new Map<string, number>();
  for (const r of byAssignee) {
    if (r.assignedTo) convosByUser.set(r.assignedTo, r._count._all);
  }
  const qualityByUser = new Map<string, (typeof byQuality)[number]>();
  for (const r of byQuality) {
    if (r.agent) qualityByUser.set(r.agent, r);
  }

  const userIds = Array.from(new Set([...messagesByUser.keys(), ...convosByUser.keys()]));
  if (userIds.length === 0) return [];

  const toMins = (secs: number | null | undefined) =>
    secs === null || secs === undefined ? null : Math.round(Number(secs) / 60);

  // `sentByUserId` and `assignedTo` used to be User FKs, resolved here to a
  // display name. They are free-text operator labels now, so the id IS the name
  // — no lookup, and nothing can be "Unknown".
  return (
    userIds
      .map((id) => {
        const q = qualityByUser.get(id);
        return {
          userId: id,
          name: id,
          messagesSent: messagesByUser.get(id) ?? 0,
          conversationsAssigned: convosByUser.get(id) ?? 0,
          conversationsResolved: q ? Number(q.resolved) : 0,
          avgResponseMins: toMins(q?.avg_secs),
          p50ResponseMins: toMins(q?.p50_secs),
          p90ResponseMins: toMins(q?.p90_secs),
          avgResolutionMins: toMins(q?.resolution_secs),
          csatAvg:
            q?.csat_avg === null || q?.csat_avg === undefined
              ? null
              : Math.round(Number(q.csat_avg) * 10) / 10,
          csatCount: q ? Number(q.csat_count) : 0,
        };
      })
      // Ties broken deterministically, because the cap below is applied to this
      // order: two agents on the same message count must not swap places between
      // two loads of the same dashboard, and one of them must not fall off the
      // end of the table at random.
      .sort(
        (a, b) =>
          b.messagesSent - a.messagesSent ||
          b.conversationsResolved - a.conversationsResolved ||
          a.userId.localeCompare(b.userId)
      )
      // Cap AFTER the sort. Applied to the raw Set of ids it kept an arbitrary 50
      // agents — on a team any larger than that, the busiest agent could simply be
      // missing from a table whose whole purpose is to rank them.
      .slice(0, 50)
  );
}

export interface WaMetaRateRow {
  category: string;
  volume: number;
  costMinor: number;
  /** Meta's own cost ÷ volume, minor units. null when volume is 0. */
  observedRateMinor: number | null;
  /** What the WHATSAPP_PRICE_*_PAISE constant claims for this category. */
  estimatedRatePaise: number;
  /** (observed − estimated) / estimated, as a percentage. null when unknown. */
  variancePct: number | null;
}

/**
 * Meta's authoritative billed figures for the same window, and how far the
 * hardcoded per-category estimate is from them.
 *
 * The dashboard used to show an estimate built on three env constants next to
 * an unlabelled Meta total in a different currency, with a footnote admitting
 * the two were computed differently — and no way to tell whether the ₹0.78
 * marketing guess was right for this account, country or pricing tier.
 */
export interface WaMetaCostReconciliation {
  /** false when the daily cost sync has never written a row for this window. */
  available: boolean;
  currency: string | null;
  /**
   * Whether Meta's figures are in the same currency as our ₹ estimates.
   *
   * false means every variance in this block would be foreign minor units
   * subtracted from paise, so the comparison is withheld rather than shown as a
   * red 400% overspend that is really just a rupee/dollar mix-up.
   */
  estimateComparable: boolean;
  lastSyncedAt: string | null;
  totalCostMinor: number;
  totalVolume: number;
  /** Conversation-based billing (CBP) totals, kept apart — different unit. */
  conversationCount: number;
  conversationCostMinor: number;
  byCategory: WaMetaRateRow[];
}

export interface WaCostSummary {
  /**
   * Meta's per-message amounts, rounded to whole minor units and summed. null
   * when the status webhooks never reported a price (the usual case).
   *
   * Read `totalActualCostAmount` for the figure that is actually accurate:
   * Meta quotes 4-6 decimals (0.0383) and this column rounds each row to a whole
   * minor unit, so it is several percent out per message and compounds.
   */
  totalActualCostPaise: number | null;
  /** The same total from the exact per-message decimals, as a string. */
  totalActualCostAmount: string | null;
  /**
   * The currency Meta billed those messages in, or null when nothing reported
   * one. 'MIXED' when the window spans more than one — the total is then a
   * meaningless sum of different units and must not be shown as money.
   */
  actualCurrency: string | null;
  /**
   * Whether the actual figures are in the same currency as the ₹ estimate.
   *
   * false means the two headline numbers on the dashboard are different units
   * sitting under one label — foreign cents printed with a rupee sign, next to
   * an INR estimate — so the comparison is withheld rather than shown.
   */
  actualComparable: boolean;
  totalEstimatedCostPaise: number;
  /** How many campaigns the estimate covers — the label next to it must agree. */
  campaignCount: number;
  byCategory: Array<{ category: string; costPaise: number }>;
  meta: WaMetaCostReconciliation;
}

/** Campaign states whose estimated spend was actually committed. */
const COSTED_CAMPAIGN_STATUSES: WaCampaignStatus[] = ['RUNNING', 'COMPLETED'];

/**
 * Spend summary: actual billed cost (summed WaMessage.costPaise), estimated
 * campaign spend (summed WaCampaign.estimatedCostPaise), and actual cost broken
 * down by Meta pricing category.
 *
 * With a `days` window, messages are counted by send date and campaigns by when
 * they actually STARTED — "what did this month cost", which is the question a
 * lifetime total can never answer.
 */
export async function getCostSummary(
  days?: number,
  channelId?: string | null
): Promise<WaCostSummary> {
  const { since } = resolveWindow(days);
  const msgWindow = {
    ...(since ? { createdAt: { gte: since } } : {}),
    // Billed volume is the figure a multi-number deployment most needs split:
    // "which number is this invoice for" was previously unanswerable.
    ...channelWhere(channelId),
  };
  // Only launched campaigns have committed spend. The aggregate used to be
  // unscoped, so every abandoned DRAFT and every CANCELLED campaign inflated the
  // "estimated spend" headline with money that was never going to be spent.
  const campaignWhere = {
    status: { in: COSTED_CAMPAIGN_STATUSES },
    ...(since ? { startedAt: { gte: since } } : {}),
    // A campaign is bound to the number it sends from, so the estimate splits
    // the same way the billed figure beside it does.
    ...channelWhere(channelId),
  };
  const [actualAgg, currencies, estimatedAgg, campaignCount, byCategory, meta] = await Promise.all([
    prisma.waMessage.aggregate({
      where: msgWindow,
      _sum: { costPaise: true, costAmount: true },
    }),
    // Which currency (or currencies) Meta billed this window in. A WABA bills in
    // one, but a deployment can move between them and a window spanning the
    // change would otherwise sum two units into one number.
    prisma.waMessage.groupBy({
      by: ['costCurrency'],
      where: { costCurrency: { not: null }, ...msgWindow },
      _count: { _all: true },
    }),
    prisma.waCampaign.aggregate({ where: campaignWhere, _sum: { estimatedCostPaise: true } }),
    prisma.waCampaign.count({ where: campaignWhere }),
    prisma.waMessage.groupBy({
      by: ['pricingCategory'],
      where: { pricingCategory: { not: null }, costPaise: { not: null }, ...msgWindow },
      _sum: { costPaise: true },
    }),
    getMetaCostReconciliation(since),
  ]);

  const observed = currencies.map((c) => c.costCurrency).filter((c): c is string => !!c);
  const actualCurrency =
    observed.length === 0 ? null : observed.length === 1 ? observed[0] : 'MIXED';

  return {
    // Deliberately NOT coalesced to 0. Meta only includes a price on a status
    // callback for some accounts, so on most deployments this sum is empty —
    // and reporting "Actual billed ₹0.00" next to a real estimate read as
    // "your campaigns were free" rather than "Meta never told us".
    totalActualCostPaise: actualAgg._sum.costPaise,
    totalActualCostAmount: actualAgg._sum.costAmount?.toString() ?? null,
    actualCurrency,
    // An unreported currency is treated as comparable: rows written before the
    // column existed carry none, and refusing to compare them would blank a
    // figure that has always been read as rupees on an INR deployment.
    actualComparable: actualCurrency === null || actualCurrency === ESTIMATE_CURRENCY,
    totalEstimatedCostPaise: estimatedAgg._sum.estimatedCostPaise ?? 0,
    campaignCount,
    byCategory: byCategory
      .map((c) => ({
        category: c.pricingCategory ?? 'unknown',
        costPaise: c._sum.costPaise ?? 0,
      }))
      .sort((a, b) => b.costPaise - a.costPaise),
    meta,
  };
}

/**
 * Meta's persisted daily costs for the same window, plus the variance against
 * the per-category estimate. Empty-but-available:false when the cost sync has
 * not run — deliberately NOT zeroes, for the same reason totalActualCostPaise
 * is not coalesced: "Meta says ₹0" and "we have not asked Meta" are different
 * statements and only one of them is true.
 */
async function getMetaCostReconciliation(since: Date | null): Promise<WaMetaCostReconciliation> {
  const where = since ? { date: { gte: since } } : {};
  const [pricingRows, conversationAgg, latest] = await Promise.all([
    prisma.waMetaCostDaily.groupBy({
      by: ['category'],
      where: { source: 'pricing', ...where },
      _sum: { volume: true, costMinor: true },
    }),
    prisma.waMetaCostDaily.aggregate({
      where: { source: 'conversation', ...where },
      _sum: { volume: true, costMinor: true },
    }),
    prisma.waMetaCostDaily.findFirst({
      where,
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true, currency: true },
    }),
  ]);

  // Meta's costMinor is in the WABA's billing currency; our estimate is in
  // paise. Subtracting one from the other produced a confident red variance that
  // was really a currency mix-up, so the comparison is only made when the two
  // agree.
  const estimateComparable = (latest?.currency ?? '').toUpperCase() === ESTIMATE_CURRENCY;

  const byCategory: WaMetaRateRow[] = pricingRows
    .map((r) => {
      const volume = r._sum.volume ?? 0;
      const costMinor = r._sum.costMinor ?? 0;
      const observed = volume > 0 ? Math.round(costMinor / volume) : null;
      // envRatePaise, not resolveRatePaise: this row IS the check on the
      // constant, so comparing Meta's figure against a rate already derived from
      // Meta would always report a 0% variance.
      const estimated = envRatePaise(toTemplateCategory(r.category));
      return {
        category: r.category,
        volume,
        costMinor,
        observedRateMinor: observed,
        estimatedRatePaise: estimated,
        variancePct:
          observed === null || estimated <= 0 || !estimateComparable
            ? null
            : Math.round(((observed - estimated) / estimated) * 100),
      };
    })
    .sort((a, b) => b.costMinor - a.costMinor);

  return {
    available: pricingRows.length > 0 || (conversationAgg._sum.volume ?? 0) > 0,
    currency: latest?.currency ?? null,
    estimateComparable,
    lastSyncedAt: latest?.syncedAt ? latest.syncedAt.toISOString() : null,
    totalCostMinor: byCategory.reduce((s, r) => s + r.costMinor, 0),
    totalVolume: byCategory.reduce((s, r) => s + r.volume, 0),
    conversationCount: conversationAgg._sum.volume ?? 0,
    conversationCostMinor: conversationAgg._sum.costMinor ?? 0,
    byCategory,
  };
}

/** Map a Meta pricing-category string onto our template category enum. */
function toTemplateCategory(category: string): WaTemplateCategory | null {
  const upper = category.toUpperCase();
  if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') {
    return upper as WaTemplateCategory;
  }
  return null;
}

export interface WaOptOutPoint {
  date: string;
  /** Opt-OUT events on this day. */
  count: number;
  /** Opt-IN events on the same day, so a churn spike can be read against recovery. */
  optIns: number;
}

/**
 * Daily opt-out / opt-in counts over the last N days, read from the immutable
 * WaConsentEvent log.
 *
 * It used to bucket `WaContact.optOutAt` — a MUTABLE column that re-opting a
 * contact in sets back to NULL. A customer who opted out on Monday and back in
 * on Tuesday erased Monday's opt-out from this chart retroactively, so the same
 * report run twice gave two different answers and a genuine spike could vanish
 * entirely once those people re-subscribed. Events are append-only.
 *
 * Zero-filled off generate_series like `getTimeSeries`, for the same reason and
 * then some: this series used to shed its quiet days twice over — once in the
 * GROUP BY, once again in a trailing filter — so a list that lost 40 contacts to
 * one bad send and nobody for the three weeks after drew as an unbroken plateau of
 * churn. The days on which nobody left are the point of the chart.
 */
export async function getOptOutTrend(days = 30): Promise<WaOptOutPoint[]> {
  const n = clampDays(days);
  const tz = await reportingTz();
  const rows = await prisma.$queryRaw<{ date: Date; opt_outs: bigint; opt_ins: bigint }[]>(
    Prisma.sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}),
        date_trunc('day', now() AT TIME ZONE ${tz}),
        interval '1 day'
      ) AS day
    ),
    buckets AS (
      SELECT
        date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}) AS day,
        COUNT(*) FILTER (WHERE "type" = 'OPT_OUT') AS opt_outs,
        COUNT(*) FILTER (WHERE "type" = 'OPT_IN') AS opt_ins
      FROM "WaConsentEvent"
      WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))
              AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
      GROUP BY 1
    )
    SELECT
      d.day AS date,
      COALESCE(b.opt_outs, 0) AS opt_outs,
      COALESCE(b.opt_ins, 0) AS opt_ins
    FROM days d
    LEFT JOIN buckets b ON b.day = d.day
    ORDER BY d.day ASC
  `
  );

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    count: Number(r.opt_outs),
    optIns: Number(r.opt_ins),
  }));
}

export interface WaHeatmapCell {
  dow: number; // 0 = Sunday … 6 = Saturday (Postgres EXTRACT(DOW))
  hour: number; // 0 … 23
  count: number;
}

/** Which half of the traffic the heatmap counts. `ALL` restores the old total. */
export type WaHeatmapDirection = 'INBOUND' | 'OUTBOUND' | 'ALL';

/**
 * Message-volume heatmap: counts of messages bucketed by weekday (0-6) × hour
 * (0-23) over the last N days. Aggregated Postgres-side over the
 * `(direction, createdAt)` index; window is a parameterized interval
 * (injection-safe). Returns a flat array of populated cells (empty buckets are
 * omitted; the UI fills the grid).
 *
 * Inbound by default, because the chart exists to answer "when is my audience
 * awake" and gets used to pick a send window. Counting every row let a single
 * 50,000-recipient campaign blast permanently own the darkest cell — the heatmap
 * then showed when WE sent, and reading it as audience activity would schedule
 * the next campaign at the same hour purely because the last one went out then.
 */
export async function getHourlyHeatmap(
  days = 30,
  direction: WaHeatmapDirection = 'INBOUND',
  channelId?: string | null
): Promise<WaHeatmapCell[]> {
  const n = clampDays(days);
  const tz = await reportingTz();
  // Literal fragments rather than a bound parameter: the column is the
  // WaDirection enum, which will not compare against a text placeholder. The
  // union type means there is nothing here a caller can widen.
  const directionFilter =
    direction === 'INBOUND'
      ? Prisma.sql`AND "direction" = 'INBOUND'`
      : direction === 'OUTBOUND'
        ? Prisma.sql`AND "direction" = 'OUTBOUND'`
        : Prisma.empty;
  const rows = await prisma.$queryRaw<{ dow: number; hour: number; count: bigint }[]>(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::int AS dow,
      EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::int AS hour,
      COUNT(*) AS count
    FROM "WaMessage"
    WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${n}))
            AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
      ${directionFilter}
      ${channelSql(channelId)}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);

  return rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    count: Number(r.count),
  }));
}

export interface WaKeywordCount {
  word: string;
  count: number;
}

/**
 * Common stopwords dropped from the inbound-keyword breakdown. Kept small and
 * lowercased; includes generic English filler plus a few WhatsApp greetings.
 */
const KEYWORD_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'so',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'i',
  'me',
  'my',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'this',
  'that',
  'these',
  'those',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'shall',
  'may',
  'might',
  'must',
  'not',
  'no',
  'yes',
  'ok',
  'okay',
  'pls',
  'please',
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank',
  'thankyou',
  'from',
  'as',
  'about',
  'how',
  'what',
  'when',
  'where',
  'who',
  'why',
  'which',
  'there',
  'here',
]);

/** Bind-parameter form of the stopword set, for the Postgres-side NOT IN. */
const KEYWORD_STOPWORD_LIST = [...KEYWORD_STOPWORDS];

/**
 * How long a keyword breakdown stays cached. The analytics page refetches this
 * panel on an interval per open tab, and a word cloud over a 30-day window does
 * not move minute to minute, so every tab past the first was re-running the
 * aggregate for an identical answer.
 */
const KEYWORD_CACHE_TTL = 300; // 5 min

/**
 * Top words from INBOUND message text over the last N days.
 *
 * Aggregated Postgres-side over the `(direction, createdAt)` index rather than
 * pulled into JS: the previous implementation read the 5,000 most recent inbound
 * rows and tokenized them here, so on any deployment past ~170 inbound messages a
 * day the chart silently covered a much shorter window than its "last N days"
 * header claimed — and the gap widened as volume grew, which quietly changed what
 * the panel meant instead of showing an obviously wrong number. The tokenizer
 * mirrors the one it replaces: lowercase, split on non-alphanumerics, then drop
 * 1-2 character noise, pure numbers and stopwords.
 */
export async function getKeywordBreakdown(
  days = 30,
  limit = 20,
  channelId?: string | null
): Promise<WaKeywordCount[]> {
  const n = clampDays(days);
  const top = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);

  // The channel is PART OF THE CACHE KEY. Without it the first number's word
  // cloud would be served for every other number for the next five minutes.
  const cacheKey = `wa:keywords:v1:${n}:${top}:${channelId ?? 'all'}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as WaKeywordCount[];
    } catch {
      /* stale/corrupt cache — recompute */
    }
  }

  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ word: string; count: bigint }[]>(Prisma.sql`
    SELECT t.word AS word, COUNT(*) AS count
    FROM "WaMessage" m,
         LATERAL regexp_split_to_table(lower(m."text"), '[^[:alnum:]]+') AS t(word)
    WHERE m."direction" = 'INBOUND'
      AND m."text" IS NOT NULL
      ${channelId ? Prisma.sql`AND m."channelId" = ${channelId}` : Prisma.empty}
      AND m."createdAt" >= ${since}
      AND length(t.word) >= 3
      AND t.word !~ '^[0-9]+$'
      AND t.word NOT IN (${Prisma.join(KEYWORD_STOPWORD_LIST)})
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${top}
  `);

  // Ordered Postgres-side, so ties break on the word itself rather than on
  // whatever order the rows happened to arrive in.
  const result = rows.map((r) => ({ word: r.word, count: Number(r.count) }));
  await redis.set(cacheKey, JSON.stringify(result), 'EX', KEYWORD_CACHE_TTL).catch(() => {});
  return result;
}

export interface WaChannelHealthPoint {
  date: string;
  quality: string;
  tier: string | null;
}

/**
 * Channel-health snapshots (WaChannelHealthSnapshot) over the last N days, in
 * ascending time order — drives the quality-rating / messaging-tier history
 * chart. Window is a parameterized createdAt cutoff (injection-safe).
 */
export async function getChannelHealthHistory(
  days = 30,
  channelId?: string
): Promise<WaChannelHealthPoint[]> {
  const n = clampDays(days);
  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  // Scoped to ONE number. Snapshots are written per channel, so an install with
  // a second connected number produced a single series that stepped between two
  // numbers' quality ratings in timestamp order — a chart that describes neither.
  // Defaults to the number every unscoped send goes out from.
  const scope = channelId ?? (await getDefaultChannel())?.id;
  if (!scope) return [];

  const rows = await prisma.waChannelHealthSnapshot.findMany({
    where: { channelId: scope, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, quality: true, tier: true },
  });

  return rows.map((r) => ({
    date: r.createdAt.toISOString(),
    quality: r.quality,
    tier: r.tier,
  }));
}

export interface WaCsatSummary {
  averageScore: number | null;
  ratedCount: number;
  distribution: Array<{ score: number; count: number }>;
}

/**
 * CSAT summary across conversations that carry a rating: average score, the
 * number of rated conversations, and a 1-5 distribution (every bucket present,
 * zero-filled). Reads only WaConversation rows where csatScore is set.
 *
 * A `days` window is applied to `csatAt` — when the rating came in — so a
 * quarter of poor scores cannot be permanently averaged away by years of good
 * history.
 */
export async function getCsatSummary(days?: number): Promise<WaCsatSummary> {
  const { since } = resolveWindow(days);
  const where = {
    csatScore: { not: null },
    ...(since ? { csatAt: { gte: since } } : {}),
  };
  const [agg, byScore] = await Promise.all([
    prisma.waConversation.aggregate({
      where,
      _avg: { csatScore: true },
      _count: { csatScore: true },
    }),
    prisma.waConversation.groupBy({
      by: ['csatScore'],
      where,
      _count: { _all: true },
    }),
  ]);

  const countByScore = new Map<number, number>();
  for (const r of byScore) {
    if (r.csatScore != null) countByScore.set(r.csatScore, r._count._all);
  }

  const distribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: countByScore.get(score) ?? 0,
  }));

  const avg = agg._avg.csatScore;

  return {
    averageScore: avg == null ? null : Math.round(avg * 100) / 100,
    ratedCount: agg._count.csatScore,
    distribution,
  };
}

export interface WaOptOutCampaignRow {
  campaignId: string;
  name: string;
  optOuts: number;
  delivered: number;
  /** Opt-outs per 1,000 delivered messages. */
  ratePer1000: number;
}

export interface WaOptOutSummary {
  optOuts: number;
  optIns: number;
  /** Outbound messages that reached a handset in the window (the denominator). */
  delivered: number;
  ratePer1000: number;
  /** Attributed opt-outs by campaign, worst rate first. */
  byCampaign: WaOptOutCampaignRow[];
  /** Opt-outs with no campaign attribution (organic STOPs, manual, import). */
  unattributed: number;
}

/**
 * Opt-out RATE and per-campaign attribution.
 *
 * A raw opt-out count says nothing on its own: 40 opt-outs is excellent after a
 * 200k send and alarming after a 2k one. And without the per-campaign split an
 * operator can see the spike but not which send caused it — the one question
 * they need answered before the next launch.
 */
export async function getOptOutSummary(days = 30): Promise<WaOptOutSummary> {
  const n = clampDays(days);
  // Aligned to the reporting timezone's day boundaries, not to "now minus N×24h",
  // so this tile counts exactly the events the trend chart under it plots.
  const since = await tzWindowStart(n, await reportingTz());

  const [optOuts, optIns, delivered, byCampaignRaw] = await Promise.all([
    prisma.waConsentEvent.count({ where: { type: 'OPT_OUT', createdAt: { gte: since } } }),
    prisma.waConsentEvent.count({ where: { type: 'OPT_IN', createdAt: { gte: since } } }),
    prisma.waMessage.count({
      where: {
        direction: 'OUTBOUND',
        status: { in: ['DELIVERED', 'READ'] },
        createdAt: { gte: since },
      },
    }),
    prisma.waConsentEvent.groupBy({
      by: ['campaignId'],
      where: { type: 'OPT_OUT', createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const per1000 = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 1000 * 10) / 10 : 0;

  const campaignIds = byCampaignRaw
    .map((r) => r.campaignId)
    .filter((id): id is string => id !== null);
  const campaigns = campaignIds.length
    ? await prisma.waCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true, deliveredCount: true },
      })
    : [];
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const byCampaign: WaOptOutCampaignRow[] = byCampaignRaw
    .filter((r) => r.campaignId !== null)
    .map((r) => {
      const campaign = campaignById.get(r.campaignId as string);
      return {
        campaignId: r.campaignId as string,
        name: campaign?.name ?? r.campaignId ?? 'unknown',
        optOuts: r._count._all,
        delivered: campaign?.deliveredCount ?? 0,
        ratePer1000: per1000(r._count._all, campaign?.deliveredCount ?? 0),
      };
    })
    .sort((a, b) => b.ratePer1000 - a.ratePer1000 || b.optOuts - a.optOuts);

  return {
    optOuts,
    optIns,
    delivered,
    ratePer1000: per1000(optOuts, delivered),
    byCampaign,
    unattributed: byCampaignRaw.find((r) => r.campaignId === null)?._count._all ?? 0,
  };
}

export interface WaCtwaRow {
  sourceId: string | null;
  sourceType: string | null;
  headline: string | null;
  contacts: number;
  conversations: number;
  conversions: number;
  conversionValuePaise: number;
}

export interface WaCtwaReport {
  /** Contacts acquired through a CTWA ad in the window. */
  totalContacts: number;
  rows: WaCtwaRow[];
}

/**
 * Click-to-WhatsApp acquisition: contacts, conversations and conversions grouped
 * by the ad that produced them.
 *
 * Meta's referral payload has always been captured on every inbound message and
 * stashed as consent evidence, and nothing ever read it back — so an operator
 * paying for CTWA ads had the ad id and the ctwa_clid sitting in the database
 * with no report, no cost-per-conversation by source, and no way to close the
 * loop to Ads Manager.
 */
export async function getCtwaReport(days = 30): Promise<WaCtwaReport> {
  const n = clampDays(days);
  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const where = {
    createdAt: { gte: since },
    OR: [{ ctwaSourceId: { not: null } }, { ctwaSourceType: { not: null } }],
  };

  const grouped = await prisma.waContact.groupBy({
    by: ['ctwaSourceId', 'ctwaSourceType', 'ctwaHeadline'],
    where,
    _count: { _all: true },
  });
  if (grouped.length === 0) return { totalContacts: 0, rows: [] };

  // The contacts behind those groups, so conversations and conversions can be
  // counted per ad. Bounded — a CTWA cohort is the people who clicked an ad in
  // the window, not the whole contact table.
  const contacts = await prisma.waContact.findMany({
    where,
    select: { id: true, ctwaSourceId: true, ctwaSourceType: true, ctwaHeadline: true },
    take: 20000,
  });
  const contactIds = contacts.map((c) => c.id);
  const key = (
    sourceId: string | null,
    sourceType: string | null,
    headline: string | null
  ): string => `${sourceId ?? ''}|${sourceType ?? ''}|${headline ?? ''}`;
  const groupByContact = new Map(
    contacts.map((c) => [c.id, key(c.ctwaSourceId, c.ctwaSourceType, c.ctwaHeadline)])
  );

  const [conversationRows, conversionRows] = await Promise.all([
    contactIds.length
      ? prisma.waConversation.groupBy({
          by: ['contactId'],
          where: { contactId: { in: contactIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.waConversion.groupBy({
          by: ['contactId'],
          where: { contactId: { in: contactIds } },
          _count: { _all: true },
          _sum: { valuePaise: true },
        })
      : Promise.resolve([]),
  ]);

  const conversationsByGroup = new Map<string, number>();
  for (const r of conversationRows) {
    const g = groupByContact.get(r.contactId);
    if (!g) continue;
    conversationsByGroup.set(g, (conversationsByGroup.get(g) ?? 0) + r._count._all);
  }
  const conversionsByGroup = new Map<string, { count: number; valuePaise: number }>();
  for (const r of conversionRows) {
    if (!r.contactId) continue;
    const g = groupByContact.get(r.contactId);
    if (!g) continue;
    const row = conversionsByGroup.get(g) ?? { count: 0, valuePaise: 0 };
    row.count += r._count._all;
    row.valuePaise += r._sum.valuePaise ?? 0;
    conversionsByGroup.set(g, row);
  }

  const rows: WaCtwaRow[] = grouped
    .map((g) => {
      const k = key(g.ctwaSourceId, g.ctwaSourceType, g.ctwaHeadline);
      const conv = conversionsByGroup.get(k);
      return {
        sourceId: g.ctwaSourceId,
        sourceType: g.ctwaSourceType,
        headline: g.ctwaHeadline,
        contacts: g._count._all,
        conversations: conversationsByGroup.get(k) ?? 0,
        conversions: conv?.count ?? 0,
        conversionValuePaise: conv?.valuePaise ?? 0,
      };
    })
    .sort((a, b) => b.contacts - a.contacts);

  return { totalContacts: rows.reduce((s, r) => s + r.contacts, 0), rows };
}

/**
 * Every CTWA-acquired contact with its ctwa_clid, for offline conversion upload.
 *
 * Meta's Ads Manager joins on ctwa_clid; it is already in the database and there
 * was no way to get it out, so the loop back to the ad account could never be
 * closed. Capped rather than streamed — this is an export of an ad cohort, not
 * of the contact table.
 */
export async function getCtwaContacts(days = 30, limit = 5000) {
  const n = clampDays(days);
  const since = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return prisma.waContact.findMany({
    where: {
      ctwaClid: { not: null },
      // Windowed on the CLICK, not on when the contact row was created.
      //
      // Attribution is last-touch now, so a customer acquired last year who
      // clicked a paid ad this week carries this week's clid — and a
      // `createdAt` window excluded exactly that cohort, which is the one an
      // offline-conversion upload is for. `createdAt` remains the fallback for
      // rows written before the click dates existed.
      OR: [
        { ctwaLastClickAt: { gte: since } },
        { ctwaLastClickAt: null, createdAt: { gte: since } },
      ],
    },
    select: {
      id: true,
      phone: true,
      name: true,
      ctwaSourceId: true,
      ctwaSourceType: true,
      ctwaHeadline: true,
      ctwaClid: true,
      ctwaFirstClickAt: true,
      ctwaLastClickAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Math.trunc(limit) || 5000, 1), 20000),
  });
}

/** One saved segment's performance over the window. */
export interface WaSegmentPerformanceRow {
  segmentId: string;
  name: string;
  /**
   * Contacts the segment's filter matches RIGHT NOW — the audience a campaign
   * launched against it would reach.
   */
  contacts: number;
  inbound: number;
  outbound: number;
  /** Outbound that reached a handset (DELIVERED ∪ READ), as everywhere else here. */
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  failRate: number;
  /** Billed cost of those messages, when Meta reported prices. */
  costPaise: number;
  conversions: number;
  conversionValuePaise: number;
  /** Campaigns LAUNCHED against this saved segment inside the window. */
  campaigns: number;
  /** Their combined deliveredCount — the denominator the opt-out rate needs. */
  campaignDelivered: number;
  /** Opt-outs attributed to those campaigns (WaConsentEvent.campaignId). */
  optOuts: number;
  optOutsPer1000: number;
}

/** Campaign outcomes grouped by how the audience was chosen. */
export interface WaAudienceTypeRow {
  /** `segment` | `upload` | `manual` (WaAudienceType). */
  audienceType: string;
  campaigns: number;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  failRate: number;
}

export interface WaSegmentPerformance {
  window: { days: number | null };
  /** The segments this report covers, biggest audience first. */
  rows: WaSegmentPerformanceRow[];
  /** How many saved segments exist in total. */
  totalSegments: number;
  /** true when the cap left some of them out, so the UI can say so. */
  truncated: boolean;
  byAudienceType: WaAudienceTypeRow[];
}

/**
 * How many saved segments one report compares.
 *
 * Each row costs three aggregates that cannot be batched — membership is a
 * per-segment predicate, not a GROUP BY key — so this bounds the work as much as
 * the table height, and a comparison nobody can read across is not more useful
 * for being longer. `truncated` + `totalSegments` come back with it so the panel
 * states what it left out instead of looking complete.
 */
const SEGMENT_REPORT_MAX = 12;

/**
 * Cache TTL for the segment and cohort reports.
 *
 * Both are heavier than every other panel here — one resolves a filter per saved
 * segment, the other joins the message table to a cohort of contacts — and
 * neither moves minute to minute. Without this every open dashboard tab re-ran
 * them on its own poll for a byte-identical answer, which is the same reason
 * `getKeywordBreakdown` is cached.
 */
const AUDIENCE_REPORT_CACHE_TTL = 600; // 10 min

/**
 * Per-segment performance: how the audiences an operator has actually saved are
 * behaving, side by side.
 *
 * WaSegment has existed as a saved audience from the start and nothing ever
 * reported on one, so "does segment A convert better than segment B" — the
 * question that decides where the next send goes — could only be answered by
 * launching two campaigns and comparing them by hand. Every aggregate on this
 * dashboard was global, or since the channel filter per number, never per
 * audience.
 *
 * MEMBERSHIP IS RESOLVED AS OF NOW, through `segmentContactWhere` — the very
 * predicate the campaign audience resolver uses, so a segment's row describes the
 * people a campaign launched right now would reach. It is deliberately NOT a
 * frozen cohort: a contact who has since opted out or been blocked no longer
 * matches (the predicate pins `isBlocked: false`, and most saved filters pin
 * `optInStatus`), so their traffic leaves this table with them. That is the right
 * reading for "who should I send to next" and the wrong one for retention, which
 * is what `getCohortReport` beside it answers.
 *
 * Churn is therefore attributed through the CAMPAIGN rather than through current
 * membership: opting out is the very event that removes someone from a segment,
 * so counting opt-outs among today's members would report zero for every
 * consent-pinned filter. `WaConsentEvent.campaignId` → `WaCampaign.segmentId`
 * survives the person leaving.
 *
 * `channelId` narrows the message and campaign columns only. A conversion and a
 * consent decision are facts about a PERSON, who is one person however many of
 * our numbers they have written to (the same reason `channelSql` is kept off the
 * consent aggregates), so slicing them by number would invent an attribution the
 * data does not carry.
 */
export async function getSegmentPerformance(
  days?: number,
  channelId?: string | null
): Promise<WaSegmentPerformance> {
  const { since, days: windowDays } = resolveWindow(days);
  const cacheKey = `wa:segment-perf:v1:${windowDays ?? 'all'}:${channelId ?? 'all'}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as WaSegmentPerformance;
    } catch {
      /* stale/corrupt cache — recompute */
    }
  }

  // Launched campaigns only, windowed on when they actually STARTED — the same
  // predicate `getCostSummary` uses, so a segment's campaign columns agree with
  // the spend panel. A DRAFT has no outcome to report.
  const campaignWhere = {
    status: { in: COSTED_CAMPAIGN_STATUSES },
    ...(since ? { startedAt: { gte: since } } : {}),
    ...channelWhere(channelId),
  };

  const [totalSegments, segments, segmentCampaigns, audienceGroups] = await Promise.all([
    prisma.waSegment.count(),
    // Newest first, the order the segments page lists them in, so the cap keeps
    // the segments an operator is currently working with.
    prisma.waSegment.findMany({
      orderBy: { createdAt: 'desc' },
      take: SEGMENT_REPORT_MAX,
      select: { id: true, name: true, filter: true },
    }),
    prisma.waCampaign.findMany({
      where: { segmentId: { not: null }, ...campaignWhere },
      select: { id: true, segmentId: true, deliveredCount: true },
    }),
    prisma.waCampaign.groupBy({
      by: ['audienceType'],
      where: campaignWhere,
      _count: { _all: true },
      _sum: {
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
      },
    }),
  ]);

  // Opt-outs for those campaigns in ONE groupBy rather than one query per
  // segment. Windowed on the event, not on the campaign: an opt-out arriving this
  // month against last month's send is churn this month.
  const campaignIds = segmentCampaigns.map((c) => c.id);
  const optOutRows = campaignIds.length
    ? await prisma.waConsentEvent.groupBy({
        by: ['campaignId'],
        where: {
          type: 'OPT_OUT',
          campaignId: { in: campaignIds },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _count: { _all: true },
      })
    : [];
  const optOutsByCampaign = new Map(
    optOutRows
      .filter((r) => r.campaignId !== null)
      .map((r) => [r.campaignId as string, r._count._all])
  );

  const campaignStats = new Map<
    string,
    { campaigns: number; delivered: number; optOuts: number }
  >();
  for (const c of segmentCampaigns) {
    if (!c.segmentId) continue;
    const row = campaignStats.get(c.segmentId) ?? { campaigns: 0, delivered: 0, optOuts: 0 };
    row.campaigns += 1;
    row.delivered += c.deliveredCount;
    row.optOuts += optOutsByCampaign.get(c.id) ?? 0;
    campaignStats.set(c.segmentId, row);
  }

  // Lazy import: the contact service drags in the env schema, R2 and the Meta
  // client, and this module is loaded by the cron worker and unit-tested with
  // nothing but prisma mocked. `segmentContactWhere` is reused rather than
  // reimplemented so a report can never disagree with the send about who is in a
  // segment — both have to compile the same filter grammar.
  const { segmentContactWhere } = await import('./whatsapp-contact.service');

  const msgWindow = {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...channelWhere(channelId),
  };
  const rows: WaSegmentPerformanceRow[] = [];
  // One segment at a time. Each is three aggregates over the two biggest tables
  // in the module, and firing all of them at once would take the connection pool
  // out from under every other request on the page.
  for (const segment of segments) {
    const memberWhere = segmentContactWhere((segment.filter ?? {}) as Record<string, unknown>);
    const [contacts, messageGroups, conversionAgg] = await Promise.all([
      prisma.waContact.count({ where: memberWhere }),
      prisma.waMessage.groupBy({
        by: ['direction', 'status'],
        where: { contact: memberWhere, ...msgWindow },
        _count: { _all: true },
        _sum: { costPaise: true },
      }),
      prisma.waConversion.aggregate({
        where: {
          contact: memberWhere,
          // `occurredAt` when the caller supplied one, `createdAt` otherwise —
          // the same fallback getConversionSummary uses, so a nightly CRM export
          // of yesterday's orders lands in yesterday's window.
          ...(since
            ? {
                OR: [
                  { occurredAt: { gte: since } },
                  { occurredAt: null, createdAt: { gte: since } },
                ],
              }
            : {}),
        },
        _count: { _all: true },
        _sum: { valuePaise: true },
      }),
    ]);

    let inbound = 0;
    let outbound = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let costPaise = 0;
    for (const g of messageGroups) {
      const n = g._count._all;
      costPaise += g._sum.costPaise ?? 0;
      if (g.direction === 'INBOUND') {
        inbound += n;
        continue;
      }
      outbound += n;
      // `delivered` is the DELIVERED ∪ READ union every rate here is built on;
      // deriveMessageRates adds `read` back exactly once.
      if (g.status === 'DELIVERED' || g.status === 'READ') delivered += n;
      if (g.status === 'READ') read += n;
      if (g.status === 'FAILED') failed += n;
    }

    const stats = campaignStats.get(segment.id) ?? { campaigns: 0, delivered: 0, optOuts: 0 };
    rows.push({
      segmentId: segment.id,
      name: segment.name,
      contacts,
      inbound,
      outbound,
      delivered,
      read,
      failed,
      ...deriveMessageRates({ delivered, read, failed }),
      costPaise,
      conversions: conversionAgg._count._all,
      conversionValuePaise: conversionAgg._sum.valuePaise ?? 0,
      campaigns: stats.campaigns,
      campaignDelivered: stats.delivered,
      optOuts: stats.optOuts,
      optOutsPer1000:
        stats.delivered > 0 ? Math.round((stats.optOuts / stats.delivered) * 1000 * 10) / 10 : 0,
    });
  }

  const byAudienceType: WaAudienceTypeRow[] = audienceGroups
    .map((g) => {
      const delivered = g._sum.deliveredCount ?? 0;
      const read = g._sum.readCount ?? 0;
      const failed = g._sum.failedCount ?? 0;
      return {
        audienceType: String(g.audienceType),
        campaigns: g._count._all,
        recipients: g._sum.totalRecipients ?? 0,
        sent: g._sum.sentCount ?? 0,
        delivered,
        read,
        failed,
        // The campaign counters carry the same DELIVERED ∪ READ union the message
        // rows do, so the shared derivation applies unchanged.
        ...deriveMessageRates({ delivered, read, failed }),
      };
    })
    .sort((a, b) => b.recipients - a.recipients || a.audienceType.localeCompare(b.audienceType));

  const result: WaSegmentPerformance = {
    window: { days: windowDays },
    // Biggest audience first, ties broken on the name so the row order is stable
    // between two loads of the same dashboard.
    rows: rows.sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name)),
    totalSegments,
    truncated: totalSegments > segments.length,
    byAudienceType,
  };
  await redis
    .set(cacheKey, JSON.stringify(result), 'EX', AUDIENCE_REPORT_CACHE_TTL)
    .catch(() => {});
  return result;
}

/** One acquisition month, followed through the funnel. */
export interface WaCohortRow {
  /** First day of the acquisition month, `YYYY-MM-DD` in the reporting timezone. */
  month: string;
  contacts: number;
  optedIn: number;
  optedOut: number;
  /** How many have ever written to us (durable — read off lastInboundAt). */
  replied: number;
  /** How many wrote to us in the last 30 days: the cohort still alive. */
  activeLast30: number;
  inbound: number;
  outbound: number;
  conversions: number;
  conversionValuePaise: number;
  /** replied / contacts, as a percentage. */
  replyRate: number;
  /** activeLast30 / contacts, as a percentage — the retention curve. */
  retentionRate: number;
  /** optedOut / contacts, as a percentage. */
  churnRate: number;
}

export interface WaCohortReport {
  months: number;
  tz: string;
  /** Oldest month first, with every month in the window present even when empty. */
  rows: WaCohortRow[];
}

/**
 * Clamp a requested cohort window to whole months in a sane range.
 *
 * Exported for the same reason `clampDays` is: one bound, applied at the edge and
 * at the query, that cannot drift into two copies.
 */
export function clampMonths(months: number): number {
  if (!Number.isFinite(months)) return 6;
  return Math.min(Math.max(Math.trunc(months), 1), 24);
}

/**
 * Acquisition cohorts: contacts grouped by the month they were added, followed
 * through reply, retention, churn and revenue.
 *
 * Nothing in the product could track a cohort. Every figure was a window over
 * events — "how many opt-outs last month" — which cannot answer the question that
 * decides whether an acquisition channel is worth paying for: of the people added
 * in March, how many ever replied, how many are still talking to us, how many
 * left, and what did they spend. Read down a column here and that is the
 * retention curve.
 *
 * DURABLE COLUMNS WHERE THERE IS A CHOICE. `replied` and `activeLast30` come from
 * `WaContact.lastInboundAt`, not from counting inbound rows, because the retention
 * prune deletes messages: derived from the message table an old cohort would
 * gradually appear never to have replied at all. The inbound/outbound volumes
 * cannot be sourced that way and are therefore "as retained" — they shrink for
 * cohorts older than the retention window, and the panel says so.
 *
 * SCALE. One statement. The volume half joins the message table to the cohort on
 * its `contactId` index, which is the cost driver here — hence the cache (see
 * AUDIENCE_REPORT_CACHE_TTL) and the 24-month cap. Contact-side buckets are cut
 * in the reporting timezone, like every other bucketed figure in this module.
 */
export async function getCohortReport(
  months = 6,
  channelId?: string | null
): Promise<WaCohortReport> {
  const n = clampMonths(months);
  const tz = await reportingTz();
  const cacheKey = `wa:cohorts:v1:${n}:${channelId ?? 'all'}:${tz}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as WaCohortReport;
    } catch {
      /* stale/corrupt cache — recompute */
    }
  }

  // The first month in the window, written once as the expression both the month
  // spine and the contact bound are cut from, so the two cannot disagree.
  const windowStart = Prisma.sql`(date_trunc('month', now() AT TIME ZONE ${tz})
                                   - make_interval(months => ${n - 1}))`;
  const rows = await prisma.$queryRaw<
    {
      month: Date;
      contacts: bigint;
      opted_in: bigint;
      opted_out: bigint;
      replied: bigint;
      active30: bigint;
      inbound: bigint;
      outbound: bigint;
      conversions: bigint;
      value_paise: bigint;
    }[]
  >(Prisma.sql`
    WITH months AS (
      SELECT generate_series(
        ${windowStart},
        date_trunc('month', now() AT TIME ZONE ${tz}),
        interval '1 month'
      )::date AS month
    ),
    cohort AS (
      SELECT
        c."id",
        date_trunc('month', c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS month,
        c."optInStatus",
        c."lastInboundAt"
      FROM "WaContact" c
      WHERE c."createdAt" >= ${windowStart} AT TIME ZONE ${tz} AT TIME ZONE 'UTC'
        -- Erasure and merge tombstones are not people. Both rewrite the phone to
        -- a sentinel, and a merge loser's history has already been moved onto the
        -- survivor, so counting the tombstone would double its cohort.
        AND c."mergedIntoId" IS NULL
        AND c."phone" NOT LIKE 'erased:%'
        AND c."phone" NOT LIKE 'merged:%'
    ),
    sizes AS (
      SELECT
        month,
        COUNT(*) AS contacts,
        COUNT(*) FILTER (WHERE "optInStatus" = 'OPTED_IN') AS opted_in,
        COUNT(*) FILTER (WHERE "optInStatus" = 'OPTED_OUT') AS opted_out,
        COUNT(*) FILTER (WHERE "lastInboundAt" IS NOT NULL) AS replied,
        COUNT(*) FILTER (WHERE "lastInboundAt" >= now() - interval '30 days') AS active30
      FROM cohort
      GROUP BY 1
    ),
    volume AS (
      SELECT
        k.month,
        COUNT(*) FILTER (WHERE m."direction" = 'INBOUND') AS inbound,
        COUNT(*) FILTER (WHERE m."direction" = 'OUTBOUND') AS outbound
      FROM "WaMessage" m
      JOIN cohort k ON k."id" = m."contactId"
      -- Aliased explicitly rather than through channelSql: a bare "channelId"
      -- here would be resolved against whichever side of the join declares one.
      WHERE TRUE ${channelId ? Prisma.sql`AND m."channelId" = ${channelId}` : Prisma.empty}
      GROUP BY 1
    ),
    revenue AS (
      SELECT
        k.month,
        COUNT(*) AS conversions,
        COALESCE(SUM(v."valuePaise"), 0)::bigint AS value_paise
      FROM "WaConversion" v
      JOIN cohort k ON k."id" = v."contactId"
      GROUP BY 1
    )
    SELECT
      mo.month AS month,
      COALESCE(s.contacts, 0)::bigint AS contacts,
      COALESCE(s.opted_in, 0)::bigint AS opted_in,
      COALESCE(s.opted_out, 0)::bigint AS opted_out,
      COALESCE(s.replied, 0)::bigint AS replied,
      COALESCE(s.active30, 0)::bigint AS active30,
      COALESCE(g.inbound, 0)::bigint AS inbound,
      COALESCE(g.outbound, 0)::bigint AS outbound,
      COALESCE(r.conversions, 0)::bigint AS conversions,
      COALESCE(r.value_paise, 0)::bigint AS value_paise
    FROM months mo
    LEFT JOIN sizes s ON s.month = mo.month
    LEFT JOIN volume g ON g.month = mo.month
    LEFT JOIN revenue r ON r.month = mo.month
    ORDER BY mo.month ASC
  `);

  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const result: WaCohortReport = {
    months: n,
    tz,
    rows: rows.map((r) => {
      const contacts = Number(r.contacts);
      const replied = Number(r.replied);
      const activeLast30 = Number(r.active30);
      const optedOut = Number(r.opted_out);
      return {
        // Mapped like every other day marker in this module: a Date would reach
        // the table as a full ISO timestamp.
        month: r.month.toISOString().slice(0, 10),
        contacts,
        optedIn: Number(r.opted_in),
        optedOut,
        replied,
        activeLast30,
        inbound: Number(r.inbound),
        outbound: Number(r.outbound),
        conversions: Number(r.conversions),
        conversionValuePaise: Number(r.value_paise),
        replyRate: pct(replied, contacts),
        retentionRate: pct(activeLast30, contacts),
        churnRate: pct(optedOut, contacts),
      };
    }),
  };
  await redis
    .set(cacheKey, JSON.stringify(result), 'EX', AUDIENCE_REPORT_CACHE_TTL)
    .catch(() => {});
  return result;
}

/**
 * Everything the analytics dashboard shows, in one object — the payload behind
 * the CSV/JSON export and the weekly digest.
 *
 * There was no export of any kind: an operator running campaigns for a client
 * could not hand a stakeholder a weekly report, could not pull the figures into
 * a spreadsheet, and had to screenshot the dashboard. For an agency-style
 * deployment that report IS the deliverable.
 */
export async function buildAnalyticsReport(days = 30) {
  const [
    overview,
    timeseries,
    sla,
    cost,
    optOutTrend,
    optOut,
    csat,
    agents,
    clicks,
    ctwa,
    segments,
    cohorts,
  ] = await Promise.all([
    getOverview(days),
    getTimeSeries(days),
    getSlaMetrics(days),
    getCostSummary(days),
    getOptOutTrend(days),
    getOptOutSummary(days),
    getCsatSummary(days),
    getAgentProductivity(days),
    getClickSeries(days),
    getCtwaReport(days),
    getSegmentPerformance(days),
    // Cohorts are counted in MONTHS, not in the report's day window: a cohort
    // curve over seven days is one point and answers nothing. Both reports are
    // Redis-cached, so the export shares whatever the dashboard just computed.
    getCohortReport(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    window: { days: clampDays(days), tz: overview.tz },
    overview,
    timeseries,
    sla,
    cost,
    optOutTrend,
    optOut,
    csat,
    agents,
    clicks,
    ctwa,
    segments,
    cohorts,
  };
}

export type WaAnalyticsReport = Awaited<ReturnType<typeof buildAnalyticsReport>>;

/** RFC-4180 cell, with the same formula-injection guard the other exports use. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // A leading =, +, - or @ makes Excel/Sheets evaluate the cell as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvSection(title: string, headers: string[], rows: unknown[][]): string {
  return [
    `# ${title}`,
    headers.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
    '',
  ].join('\n');
}

/**
 * The report as a multi-section CSV: one `# Title` block per table, blank line
 * separated. Excel and Sheets both import this as a single sheet the operator
 * can split, which beats seven separate downloads.
 */
export function analyticsReportToCsv(report: WaAnalyticsReport): string {
  const paise = (n: number) => (n / 100).toFixed(2);
  const sections: string[] = [];

  sections.push(
    csvSection(
      'Summary',
      ['metric', 'value'],
      [
        ['generatedAt', report.generatedAt],
        ['windowDays', report.window.days],
        ['timezone', report.window.tz],
        ['contactsTotal', report.overview.contacts.total],
        ['contactsOptedIn', report.overview.contacts.optedIn],
        ['contactsOptedOut', report.overview.contacts.optedOut],
        ['conversationsTotal', report.overview.conversations.total],
        ['conversationsOpen', report.overview.conversations.open],
        ['messagesInbound', report.overview.messages.inbound],
        ['messagesOutbound', report.overview.messages.outbound],
        ['messagesDelivered', report.overview.messages.delivered],
        ['messagesRead', report.overview.messages.read],
        ['messagesFailed', report.overview.messages.failed],
        ['deliveryRatePct', report.overview.messages.deliveryRate],
        ['readRatePct', report.overview.messages.readRate],
        ['failRatePct', report.overview.messages.failRate],
        ['avgFirstResponseMins', report.sla.avgFirstResponseMins ?? ''],
        ['avgResolutionMins', report.sla.avgResolutionMins ?? ''],
        ['csatAverage', report.csat.averageScore ?? ''],
        ['csatRatedCount', report.csat.ratedCount],
        ['estimatedSpend', paise(report.cost.totalEstimatedCostPaise)],
        [
          'actualBilledSpend',
          report.cost.totalActualCostPaise == null ? '' : paise(report.cost.totalActualCostPaise),
        ],
        // The exact per-message decimals and the unit they are in. Without the
        // currency the row above is a bare number that an INR reader assumes is
        // rupees — it is whatever the WABA bills in.
        ['actualBilledSpendExact', report.cost.totalActualCostAmount ?? ''],
        ['actualBilledCurrency', report.cost.actualCurrency ?? ''],
        [
          'metaBilledSpend',
          report.cost.meta.available ? paise(report.cost.meta.totalCostMinor) : '',
        ],
        // Conversation-based billing is where ALL the money is on a CBP account,
        // and the per-category section below is empty for one — so a CBP export
        // used to report the WABA's entire Meta spend as blank.
        [
          'metaConversationSpend',
          report.cost.meta.available ? paise(report.cost.meta.conversationCostMinor) : '',
        ],
        ['metaConversations', report.cost.meta.available ? report.cost.meta.conversationCount : ''],
        ['metaCurrency', report.cost.meta.currency ?? ''],
        ['optOuts', report.optOut.optOuts],
        ['optIns', report.optOut.optIns],
        ['optOutsPer1000Delivered', report.optOut.ratePer1000],
        ['linkClicks', report.clicks.reduce((s, c) => s + c.clicks, 0)],
      ]
    )
  );

  sections.push(
    csvSection(
      'Daily messages',
      ['date', 'inbound', 'outbound', 'delivered', 'read', 'failed'],
      report.timeseries.map((p) => [p.date, p.inbound, p.outbound, p.delivered, p.read, p.failed])
    )
  );

  sections.push(
    csvSection(
      'Daily link clicks',
      ['date', 'clicks', 'uniqueClickers'],
      report.clicks.map((p) => [p.date, p.clicks, p.uniqueClickers])
    )
  );

  sections.push(
    csvSection(
      'Daily consent',
      ['date', 'optOuts', 'optIns'],
      report.optOutTrend.map((p) => [p.date, p.count, p.optIns])
    )
  );

  sections.push(
    csvSection(
      'Opt-outs by campaign',
      ['campaign', 'optOuts', 'delivered', 'optOutsPer1000'],
      report.optOut.byCampaign.map((c) => [c.name, c.optOuts, c.delivered, c.ratePer1000])
    )
  );

  sections.push(
    csvSection(
      'Spend by category (our billing webhooks)',
      ['category', 'cost'],
      report.cost.byCategory.map((c) => [c.category, paise(c.costPaise)])
    )
  );

  sections.push(
    csvSection(
      'Meta billed vs estimate',
      ['category', 'volume', 'metaCost', 'metaRatePerMessage', 'estimatedRate', 'variancePct'],
      report.cost.meta.byCategory.map((c) => [
        c.category,
        c.volume,
        paise(c.costMinor),
        c.observedRateMinor == null ? '' : paise(c.observedRateMinor),
        paise(c.estimatedRatePaise),
        c.variancePct ?? '',
      ])
    )
  );

  sections.push(
    csvSection(
      'CTWA acquisition',
      ['sourceId', 'sourceType', 'headline', 'contacts', 'conversations', 'conversions', 'value'],
      report.ctwa.rows.map((r) => [
        r.sourceId,
        r.sourceType,
        r.headline,
        r.contacts,
        r.conversations,
        r.conversions,
        paise(r.conversionValuePaise),
      ])
    )
  );

  sections.push(
    csvSection(
      'Segment performance',
      [
        'segment',
        'contacts',
        'inbound',
        'outbound',
        'delivered',
        'read',
        'failed',
        'deliveryRatePct',
        'readRatePct',
        'campaigns',
        'optOuts',
        'optOutsPer1000',
        'conversions',
        'conversionValue',
        'cost',
      ],
      report.segments.rows.map((s) => [
        s.name,
        s.contacts,
        s.inbound,
        s.outbound,
        s.delivered,
        s.read,
        s.failed,
        s.deliveryRate,
        s.readRate,
        s.campaigns,
        s.optOuts,
        s.optOutsPer1000,
        s.conversions,
        paise(s.conversionValuePaise),
        paise(s.costPaise),
      ])
    )
  );

  sections.push(
    csvSection(
      'Campaigns by audience type',
      [
        'audienceType',
        'campaigns',
        'recipients',
        'sent',
        'delivered',
        'read',
        'failed',
        'deliveryRatePct',
        'readRatePct',
      ],
      report.segments.byAudienceType.map((a) => [
        a.audienceType,
        a.campaigns,
        a.recipients,
        a.sent,
        a.delivered,
        a.read,
        a.failed,
        a.deliveryRate,
        a.readRate,
      ])
    )
  );

  sections.push(
    csvSection(
      // Months, not the report's day window — stated in the title, because this is
      // the one section whose period differs from every other one in the file.
      `Acquisition cohorts (last ${report.cohorts.months} months)`,
      [
        'month',
        'contacts',
        'optedIn',
        'optedOut',
        'replied',
        'activeLast30',
        'replyRatePct',
        'retentionRatePct',
        'churnRatePct',
        'inbound',
        'outbound',
        'conversions',
        'conversionValue',
      ],
      report.cohorts.rows.map((c) => [
        c.month,
        c.contacts,
        c.optedIn,
        c.optedOut,
        c.replied,
        c.activeLast30,
        c.replyRate,
        c.retentionRate,
        c.churnRate,
        c.inbound,
        c.outbound,
        c.conversions,
        paise(c.conversionValuePaise),
      ])
    )
  );

  sections.push(
    csvSection(
      'Agent productivity',
      ['agent', 'messagesSent', 'conversationsAssigned'],
      report.agents.map((a) => [a.name, a.messagesSent, a.conversationsAssigned])
    )
  );

  sections.push(
    csvSection(
      'CSAT distribution',
      ['score', 'count'],
      report.csat.distribution.map((d) => [d.score, d.count])
    )
  );

  return sections.join('\n');
}
