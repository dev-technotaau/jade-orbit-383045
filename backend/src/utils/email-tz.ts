/**
 * Timezone-aware scheduling: interpret an admin's naive wall-clock time
 * (e.g. "2026-08-01T09:30" from a datetime-local input) as local time in a
 * chosen IANA zone and return the corresponding UTC instant, so a campaign
 * fires at the intended local hour regardless of server timezone.
 */

/** Offset (ms) of `tz` at the given instant: (wall-clock in tz) − UTC. */
function zoneOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

/**
 * Convert a naive local datetime string (no offset) in `tz` to a UTC Date.
 * Falls back to plain Date parsing if the zone is invalid.
 */
export function wallClockToUtc(naive: string, tz: string): Date {
  try {
    // Already carries an explicit offset/Z → it's an instant, not a wall-clock;
    // parse it directly (the zone conversion only applies to naive strings).
    if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(naive)) return new Date(naive);
    const withSeconds = naive.length === 16 ? `${naive}:00` : naive;
    const asIfUtc = new Date(`${withSeconds}Z`);
    if (Number.isNaN(asIfUtc.getTime())) return new Date(naive);
    const offset = zoneOffsetMs(asIfUtc, tz);
    return new Date(asIfUtc.getTime() - offset);
  } catch {
    return new Date(naive);
  }
}
