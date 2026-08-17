/**
 * Business hours: is the desk open right now, and if not, when does it open?
 *
 * Dependency-free on purpose. This lived inside whatsapp-autoreply.service, which
 * imports the send path, the FAQ service and whatsapp-campaign.service — so the
 * moment the campaign worker and the drip loop needed to ask the same question
 * (a campaign scheduled at 10:00 local reaching an international list at 03:00),
 * importing it created campaign.service -> sequence.service -> autoreply.service
 * -> campaign.service. One grid, one implementation, no cycle: the auto-responder
 * re-exports these so its own callers and its test suite are unchanged.
 *
 * Shape of the stored value (WaSettings.businessHours):
 *   { tz?, days?: [{ day, open, close }], exceptions?: [{ date, closed?, open?, close?, repeatsAnnually? }] }
 */
export interface BusinessDay {
  day: number; // 0 (Sun) - 6 (Sat)
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}
/**
 * A single calendar date that overrides the weekly grid — a public holiday, a
 * one-off shutdown, or a half-day with its own window. `repeatsAnnually` matches
 * on MM-DD so a fixed-date holiday is entered once rather than every year.
 *
 * Without these, closing for a holiday meant flipping the manual Away toggle on
 * the morning and remembering to flip it back — and forgetting left the away
 * message answering every inbound for as long as nobody noticed.
 */
export interface BusinessException {
  date: string; // "YYYY-MM-DD"
  closed?: boolean;
  open?: string; // "HH:MM"
  close?: string; // "HH:MM"
  repeatsAnnually?: boolean;
}
export interface BusinessHours {
  tz?: string;
  days?: BusinessDay[];
  exceptions?: BusinessException[];
}

/**
 * Parse "HH:MM" into minutes-since-midnight; null if malformed.
 *
 * Exported (with `nowInTz`, `withinBusinessHours` and `keywordMatches`) purely so
 * the pure-logic suite can assert them directly. They are dependency-free and the
 * most behaviour-sensitive code in the module — a DST rollover or an overnight
 * window read the wrong way answers a customer with the after-hours message in
 * the middle of the working day — and none of it was reachable from a test.
 *
 * `whatsapp-autoreply.service` re-exports all of these, so both import paths work.
 */
export function parseHmToMinutes(value: string | undefined | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Day-of-week, minutes-since-midnight and the calendar date ("YYYY-MM-DD") for
 * `now`, evaluated in the configured tz if provided (best-effort via Intl),
 * otherwise the server's local time.
 *
 * The date is what the holiday/exception lookup keys off, and it has to come
 * from the SAME tz conversion as the clock: taking the weekday from Asia/Kolkata
 * while reading the date off the UTC container puts a holiday on the wrong day
 * for the five and a half hours either side of midnight.
 */
export function nowInTz(
  now: Date,
  tz: string | undefined
): { day: number; minutes: number; ymd: string } {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const lookup = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const day = weekdayMap[lookup('weekday')];
      let hour = Number(lookup('hour'));
      const minute = Number(lookup('minute'));
      if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
      const ymd = `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
      if (day !== undefined && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { day, minutes: hour * 60 + minute, ymd };
      }
    } catch {
      // fall through to local time
    }
  }
  return {
    day: now.getDay(),
    minutes: now.getHours() * 60 + now.getMinutes(),
    ymd: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
  };
}

/**
 * Is `minutes` inside a single [open, close) window on one calendar day?
 * `close < open` spans midnight; `close === open` means 24 hours.
 */
function withinWindow(minutes: number, open: number, close: number): boolean {
  if (close > open) return minutes >= open && minutes < close;
  if (close < open) return minutes >= open || minutes < close;
  return true;
}

/**
 * The exception covering `ymd`, if any. An entry for the exact date beats an
 * annually-repeating one for the same MM-DD, so "closed every 26 Jan, but open
 * 26 Jan 2027" can be expressed by adding the specific year.
 */
function findException(
  exceptions: BusinessException[] | undefined,
  ymd: string
): BusinessException | null {
  if (!Array.isArray(exceptions)) return null;
  const mmdd = ymd.slice(5);
  let annual: BusinessException | null = null;
  for (const ex of exceptions) {
    if (!ex || typeof ex.date !== 'string') continue;
    if (ex.date === ymd) return ex;
    if (ex.repeatsAnnually && ex.date.slice(5) === mmdd && !annual) annual = ex;
  }
  return annual;
}

/**
 * Whether `now` falls within configured business hours.
 *
 * Two states that look alike are deliberately kept apart:
 *   - no businessHours at all, or no `days` key => NOT CONFIGURED => always open.
 *   - `days: []` => configured as closed all week => always closed.
 * They used to collapse into "always open", so an operator who unchecked all
 * seven days (holiday shutdown, unstaffed number) got the exact opposite of what
 * they asked for: the away auto-reply never fired again, permanently, with
 * nothing in the UI or the API saying so.
 *
 * Date exceptions are checked first — a holiday overrides whatever the weekly
 * grid says for that weekday, including an overnight window still running from
 * the night before. Then the weekly grid, which handles overnight windows
 * (close <= open) that span midnight.
 */
export function withinBusinessHours(businessHours: unknown, now: Date): boolean {
  const bh = businessHours as BusinessHours | null;
  if (!bh || !Array.isArray(bh.days)) return true; // not configured => always open
  const { day, minutes, ymd } = nowInTz(now, bh.tz);

  const exception = findException(bh.exceptions, ymd);
  if (exception) {
    if (exception.closed) return false;
    const exOpen = parseHmToMinutes(exception.open);
    const exClose = parseHmToMinutes(exception.close);
    // A half-day override. An entry with neither `closed` nor a usable window is
    // meaningless, so fall through to the grid rather than guessing.
    if (exOpen !== null && exClose !== null) return withinWindow(minutes, exOpen, exClose);
  }

  const yesterday = (day + 6) % 7;
  for (const slot of bh.days) {
    // An overnight slot belongs to the day it OPENS on, so at 02:00 on Saturday a
    // "Friday 22:00-06:00" window has slot.day === 5 while day === 6. Filtering to
    // today alone skipped it entirely and the window read as closed for the whole
    // small-hours half — away messages fired all night on a channel that was open.
    if (!slot) continue;
    const isToday = slot.day === day;
    const isYesterdayOvernight = slot.day === yesterday;
    if (!isToday && !isYesterdayOvernight) continue;
    const open = parseHmToMinutes(slot.open);
    const close = parseHmToMinutes(slot.close);
    if (open === null || close === null) continue;
    if (close > open) {
      // A same-day window only ever applies to today's slot.
      if (isToday && minutes >= open && minutes < close) return true;
    } else if (close < open) {
      // Overnight window (e.g. 22:00-06:00). Two halves, and they belong to
      // different calendar days: the evening half is today's slot, the small-hours
      // half is YESTERDAY's slot still running.
      if (isToday && minutes >= open) return true;
      if (isYesterdayOvernight && minutes < close) return true;
    } else if (isToday) {
      // open === close: treat as 24h for that day
      return true;
    }
  }
  return false;
}

/** Coarse probe when searching forward for the next open window. */
const NEXT_OPEN_STEP_MS = 15 * 60 * 1000;
/** How far ahead to look before giving up — a week plus a day of slack. */
const NEXT_OPEN_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * The next instant at or after `from` that falls inside business hours, or null
 * when there is none within a week.
 *
 * Searched rather than computed. `withinBusinessHours` already resolves split
 * shifts, overnight windows that belong to the previous day, annually-repeating
 * holidays and per-date half-day overrides — re-deriving "when does the next one
 * open?" from the grid would be a second implementation of all of that, and the
 * first time the two disagreed a campaign would be released in the middle of the
 * night. A coarse 15-minute walk finds the open quarter-hour, then a 1-minute
 * walk backwards lands on the boundary itself.
 *
 * Returns `from` unchanged when it is already open, and null when the week is
 * configured closed (`days: []`) — the caller decides what to do with a channel
 * that never opens.
 */
export function nextOpenAt(businessHours: unknown, from: Date): Date | null {
  if (withinBusinessHours(businessHours, from)) return from;
  for (let t = from.getTime() + NEXT_OPEN_STEP_MS; ; t += NEXT_OPEN_STEP_MS) {
    if (t - from.getTime() > NEXT_OPEN_HORIZON_MS) return null;
    const probe = new Date(t);
    if (!withinBusinessHours(businessHours, probe)) continue;
    // Back off to the minute the window actually opened on, so a hold released
    // at 09:00 is released at 09:00 rather than up to a quarter of an hour late.
    let exact = t;
    for (let i = 0; i < 15; i++) {
      const earlier = exact - 60_000;
      if (earlier <= from.getTime()) break;
      if (!withinBusinessHours(businessHours, new Date(earlier))) break;
      exact = earlier;
    }
    return new Date(exact);
  }
}

