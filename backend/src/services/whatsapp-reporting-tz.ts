import { prisma } from '../config/prisma';

/**
 * Timezone every time-bucketed figure is reported in.
 *
 * Lives in its own module because two services need it — the analytics service
 * owns the message/consent series, the short-link service owns the click series
 * — and the analytics service already imports from the short-link service, so
 * exporting it from there would close an import cycle.
 *
 * All bucketing used to run in the DATABASE session timezone — UTC in a container.
 * For an operator in Asia/Kolkata that shifts every daily boundary by 5h30m, so
 * "yesterday" included this morning, and the busiest-hour heatmap pointed at the
 * wrong part of the working day. The deployment already stores an operator
 * timezone for business hours; reporting now uses the same one.
 *
 * Falls back to UTC rather than to server-local: a wrong-but-stated timezone is
 * recoverable, a silently machine-dependent one is not.
 */
export async function reportingTz(): Promise<string> {
  try {
    const settings = await prisma.waSettings.findUnique({
      where: { id: 'default' },
      select: { businessHours: true },
    });
    const tz = (settings?.businessHours as { tz?: string } | null)?.tz;
    if (!tz) return DEFAULT_REPORTING_TZ;
    // Validate before interpolating: an unknown name makes Postgres throw, which
    // would take the whole analytics page down rather than mis-bucket it.
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_REPORTING_TZ;
  }
}

export const DEFAULT_REPORTING_TZ = 'UTC';

/**
 * Today's calendar date in `tz`, as `YYYY-MM-DD`.
 *
 * Day markers compared against a rolled-up daily table have to be the same
 * calendar days Postgres produced when it bucketed the raw rows in `tz`;
 * deriving them from UTC instead puts the boundary a day out for any operator
 * far enough east or west of Greenwich.
 */
export function todayInTz(tz: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key format used everywhere
  // else in the reporting layer.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** The `YYYY-MM-DD` key `days` before `dayKey`, as a UTC-midnight day marker. */
export function dayMarkerBefore(dayKey: string, days: number): Date {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
