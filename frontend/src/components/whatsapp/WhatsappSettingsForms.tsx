'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Plus, Save, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import TimePicker from '@/components/ui/TimePicker';
import DatePicker from '@/components/ui/DatePicker';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { confirmDialog } from '@/components/ui/dialog-service';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSettings } from '@/types/whatsapp';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface BusinessHourRow {
  day: number;
  open: string;
  close: string;
}

/**
 * A calendar-date override — a public holiday, a one-off shutdown, or a half
 * day with its own hours. Checked by the server BEFORE the weekly grid.
 */
interface BusinessException {
  date: string; // YYYY-MM-DD
  closed?: boolean;
  open?: string;
  close?: string;
  repeatsAnnually?: boolean;
  label?: string;
}

interface BusinessHours {
  tz?: string;
  /**
   * Undefined and `[]` mean DIFFERENT things, and that difference is what
   * `HoursMode` below exists to make sayable: no `days` key at all is "not
   * configured, so always open", while `days: []` is "configured as closed all
   * week, so always send the away message". They used to collapse into
   * always-open on the server.
   */
  days?: BusinessHourRow[];
  exceptions?: BusinessException[];
}

/** One open window on one weekday. A day may hold several (split shift). */
interface BusinessWindow {
  open: string;
  close: string;
}

/** Coerce the loosely-typed settings.businessHours blob into our editor shape. */
function parseBusinessHours(raw: unknown): BusinessHours {
  const result: BusinessHours = { tz: undefined, days: undefined, exceptions: [] };
  if (raw && typeof raw === 'object') {
    const obj = raw as { tz?: unknown; days?: unknown; exceptions?: unknown };
    if (typeof obj.tz === 'string') result.tz = obj.tz;
    if (Array.isArray(obj.days)) {
      const days: BusinessHourRow[] = [];
      for (const d of obj.days) {
        if (d && typeof d === 'object') {
          const row = d as { day?: unknown; open?: unknown; close?: unknown };
          if (
            typeof row.day === 'number' &&
            typeof row.open === 'string' &&
            typeof row.close === 'string'
          ) {
            days.push({ day: row.day, open: row.open, close: row.close });
          }
        }
      }
      // Assigned even when empty — `days: []` is a real, meaningful state.
      result.days = days;
    }
    if (Array.isArray(obj.exceptions)) {
      for (const e of obj.exceptions) {
        if (e && typeof e === 'object') {
          const ex = e as Record<string, unknown>;
          if (typeof ex.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ex.date)) {
            result.exceptions!.push({
              date: ex.date,
              closed: ex.closed === true,
              open: typeof ex.open === 'string' ? ex.open : undefined,
              close: typeof ex.close === 'string' ? ex.close : undefined,
              repeatsAnnually: ex.repeatsAnnually === true,
              label: typeof ex.label === 'string' ? ex.label : undefined,
            });
          }
        }
      }
    }
  }
  return result;
}

/**
 * Build a 7-entry Sun..Sat grid holding EVERY saved window for each day.
 *
 * This used to be `hours.days.find((d) => d.day === day)` and a single
 * {open, close} per day, so a split shift (09:00-13:00 and 14:00-18:00 with a
 * lunch closure) — which the server has always evaluated correctly — lost its
 * second window the moment anyone opened this screen and pressed Save.
 */
function toGrid(hours: BusinessHours): Record<number, BusinessWindow[]> {
  const grid: Record<number, BusinessWindow[]> = {};
  for (let day = 0; day < 7; day++) {
    grid[day] = (hours.days ?? [])
      .filter((d) => d.day === day)
      .map((d) => ({ open: d.open, close: d.close }));
  }
  return grid;
}

/** Flatten the editor grid back into the stored `days` array (day-ordered). */
function fromGrid(grid: Record<number, BusinessWindow[]>): BusinessHourRow[] {
  const days: BusinessHourRow[] = [];
  for (let day = 0; day < 7; day++) {
    for (const w of grid[day] ?? []) days.push({ day, open: w.open, close: w.close });
  }
  return days;
}

/**
 * How availability is expressed. The editor had no way to say the second or
 * third of these, so unchecking every day produced `{days: []}` — which the
 * server read as "always open", the exact opposite of what the operator had
 * just asked for, permanently and with nothing on screen saying so.
 */
type HoursMode = 'schedule' | 'always-open' | 'always-closed';

function modeOf(hours: BusinessHours): HoursMode {
  if (!hours.days) return 'always-open'; // not configured
  if (hours.days.length === 0) return 'always-closed';
  return 'schedule';
}

/** "HH:MM" → minutes since midnight, or null. Mirrors the server's parser. */
function hmToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Today's calendar date in `tz` — the sensible default for a new exception. */
function todayYmd(tz: string): string {
  return nowInTz(new Date(), tz).ymd;
}

/** [open, close) on one day; close < open spans midnight, close === open is 24h. */
function inWindow(minutes: number, open: number, close: number): boolean {
  if (close > open) return minutes >= open && minutes < close;
  if (close < open) return minutes >= open || minutes < close;
  return true;
}

/** Weekday / minutes / date in `tz`, falling back to the browser's own zone. */
function nowInTz(now: Date, tz: string): { day: number; minutes: number; ymd: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdays: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = weekdays[get('weekday')];
    let hour = Number(get('hour'));
    if (hour === 24) hour = 0;
    const minute = Number(get('minute'));
    if (day !== undefined && Number.isFinite(hour) && Number.isFinite(minute)) {
      return {
        day,
        minutes: hour * 60 + minute,
        ymd: `${get('year')}-${get('month')}-${get('day')}`,
      };
    }
  } catch {
    /* fall through to local time */
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: now.getDay(),
    minutes: now.getHours() * 60 + now.getMinutes(),
    ymd: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

/**
 * Is the channel open right now under the CURRENTLY EDITED (possibly unsaved)
 * configuration? Deliberately mirrors whatsapp-autoreply.service's
 * `withinBusinessHours`, so the pill above the grid answers the same question
 * the away auto-reply will — including the two states that look identical in
 * the grid but behave in opposite ways.
 */
function isOpenNow(
  mode: HoursMode,
  grid: Record<number, BusinessWindow[]>,
  exceptions: BusinessException[],
  tz: string,
  now: Date,
): boolean {
  if (mode === 'always-open') return true;
  const { day, minutes, ymd } = nowInTz(now, tz);
  const mmdd = ymd.slice(5);
  const exact = exceptions.find((e) => e.date === ymd);
  const annual = exceptions.find((e) => e.repeatsAnnually && e.date.slice(5) === mmdd);
  const ex = exact ?? annual;
  if (ex) {
    if (ex.closed) return false;
    const o = hmToMinutes(ex.open);
    const c = hmToMinutes(ex.close);
    if (o !== null && c !== null) return inWindow(minutes, o, c);
  }
  if (mode === 'always-closed') return false;
  const yesterday = (day + 6) % 7;
  for (let d = 0; d < 7; d++) {
    const isToday = d === day;
    const isYesterday = d === yesterday;
    if (!isToday && !isYesterday) continue;
    for (const w of grid[d] ?? []) {
      const o = hmToMinutes(w.open);
      const c = hmToMinutes(w.close);
      if (o === null || c === null) continue;
      if (c > o) {
        if (isToday && minutes >= o && minutes < c) return true;
      } else if (c < o) {
        // Overnight window: the evening half is today's row, the small-hours
        // half belongs to yesterday's row still running.
        if (isToday && minutes >= o) return true;
        if (isYesterday && minutes < c) return true;
      } else if (isToday) {
        return true; // open === close: 24h
      }
    }
  }
  return false;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Editable WhatsApp settings — auto-reply messages, business hours grid,
 * opt-out keywords and frequency/retention caps. Each section saves its own
 * slice via updateSettings() and invalidates the `wa-settings` query.
 */
export default function WhatsappSettingsForms() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-settings'],
    queryFn: () => svc.getSettings(),
  });
  const settings = data?.data ?? null;

  const saveMut = useMutation({
    mutationFn: (patch: Partial<WaSettings>) => svc.updateSettings(patch),
    onSuccess: () => {
      showToast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to save settings')),
  });

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </p>
    );
  }
  if (isError || !settings) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-4 text-center text-sm text-red-600">
        Failed to load settings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AutoReplySection settings={settings} saving={saveMut.isPending} onSave={saveMut.mutate} />
      <BusinessHoursSection
        settings={settings}
        saving={saveMut.isPending}
        onSave={saveMut.mutate}
      />
      <KeywordsSection
        title="Opt-out keywords"
        description="Inbound messages matching any keyword auto opt-out the contact."
        placeholder="STOP"
        current={settings.optOutKeywords}
        settings={settings}
        saving={saveMut.isPending}
        onSave={(kw) => saveMut.mutate({ optOutKeywords: kw })}
      />
      {/* A STOP used to be answered with silence — the auto-reply engine is
          skipped for someone who just opted out — so the customer had no way to
          know it had registered, and the standard next move is to send STOP
          again and then report the business. */}
      <OptOutConfirmationSection
        settings={settings}
        saving={saveMut.isPending}
        onSave={saveMut.mutate}
      />
      {/* Opt-out used to be a one-way door: a customer who replied START stayed
          suppressed until an operator noticed and flipped them back by hand. */}
      <KeywordsSection
        title="Opt-in keywords"
        description="Inbound messages matching any keyword re-subscribe the contact and clear any suppression entry."
        placeholder="START"
        current={settings.optInKeywords ?? []}
        settings={settings}
        saving={saveMut.isPending}
        onSave={(kw) => saveMut.mutate({ optInKeywords: kw })}
      />
      <CapsSection settings={settings} saving={saveMut.isPending} onSave={saveMut.mutate} />
    </div>
  );
}

type SaveFn = (patch: Partial<WaSettings>) => void;

/** The viewer's own zone — the only sensible default for "when are we open". */
const BROWSER_TZ =
  typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC') : 'UTC';

/**
 * Every IANA zone the browser knows, for the timezone datalist. `supportedValuesOf`
 * is not in older Safari, so fall back to a short list of common zones rather than
 * rendering an empty picker.
 */
const TZ_OPTIONS: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') return fn('timeZone');
  } catch {
    /* fall through */
  }
  return ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'];
})();

/* ── 1. Auto-reply + welcome/away messages ── */
function AutoReplySection({
  settings,
  saving,
  onSave,
}: {
  settings: WaSettings;
  saving: boolean;
  onSave: SaveFn;
}) {
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(settings.autoReplyEnabled);
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage ?? '');
  const [awayMessage, setAwayMessage] = useState(settings.awayMessage ?? '');
  const [faqMenuEnabled, setFaqMenuEnabled] = useState(settings.faqMenuEnabled);
  const [faqTriggers, setFaqTriggers] = useState((settings.faqTriggerKeywords ?? []).join(', '));
  const [awayDebounce, setAwayDebounce] = useState(String(settings.awayDebounceMinutes ?? 30));
  const [faqFallback, setFaqFallback] = useState(settings.faqFallbackMessage ?? '');

  // Re-sync from the server object when it changes (render-time, not an effect).
  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setAutoReplyEnabled(settings.autoReplyEnabled);
    setWelcomeMessage(settings.welcomeMessage ?? '');
    setAwayMessage(settings.awayMessage ?? '');
    setFaqMenuEnabled(settings.faqMenuEnabled);
    setFaqTriggers((settings.faqTriggerKeywords ?? []).join(', '));
    setAwayDebounce(String(settings.awayDebounceMinutes ?? 30));
    setFaqFallback(settings.faqFallbackMessage ?? '');
  }

  // Clamped to the same 1…1440 the API enforces, so a typo cannot be saved and
  // then read back as an interval the engine silently floors.
  const debounceNum = Math.min(1440, Math.max(1, parseInt(awayDebounce, 10) || 30));
  const dirty =
    autoReplyEnabled !== settings.autoReplyEnabled ||
    welcomeMessage !== (settings.welcomeMessage ?? '') ||
    awayMessage !== (settings.awayMessage ?? '') ||
    faqMenuEnabled !== settings.faqMenuEnabled ||
    faqTriggers !== (settings.faqTriggerKeywords ?? []).join(', ') ||
    debounceNum !== (settings.awayDebounceMinutes ?? 30) ||
    faqFallback !== (settings.faqFallbackMessage ?? '');

  return (
    <SectionCard
      title="Auto-reply"
      description="Greet first-time contacts and reply outside business hours."
    >
      {/* The sidebar's Away toggle and these two fields are the same feature, split
          across two screens. Turning automatic replies off here (or clearing the
          away message) silently disarms an Away status set elsewhere, with nothing
          on either screen saying so. */}
      {settings.awayMode && (!autoReplyEnabled || !awayMessage.trim()) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            Status is currently <strong>Away</strong>, but no away auto-reply will be sent until
            automatic replies are on and an away message is set.
          </p>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={autoReplyEnabled}
          onChange={(e) => setAutoReplyEnabled(e.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm font-medium text-[var(--text)]">Enable automatic replies</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormattedTextarea
          label="Welcome message"
          value={welcomeMessage}
          onChange={setWelcomeMessage}
          rows={4}
          maxLength={1024}
          placeholder="Hi! Thanks for contacting us…"
        />
        <FormattedTextarea
          label="Away message"
          value={awayMessage}
          onChange={setAwayMessage}
          rows={4}
          maxLength={1024}
          placeholder="We're away right now and will reply during business hours."
        />
      </div>

      {/* The away debounce was a constant in the engine — 30 minutes, invisible
          and untunable. A desk taking hundreds of messages an hour wants it far
          shorter; a number staffed once a week wants it far longer. */}
      <Input
        label="Re-send the away message after"
        type="number"
        min={1}
        max={1440}
        value={awayDebounce}
        onChange={(e) => setAwayDebounce(e.target.value)}
        helperText="Minutes before the same conversation can receive the away message again. 1–1440."
      />

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={faqMenuEnabled}
          onChange={(e) => setFaqMenuEnabled(e.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm font-medium text-[var(--text)]">
          Show the FAQ menu (on first contact &amp; trigger keywords)
        </span>
      </label>
      {faqMenuEnabled && (
        <>
          <Input
            label="FAQ trigger keywords"
            value={faqTriggers}
            onChange={(e) => setFaqTriggers(e.target.value)}
            placeholder="menu, faq, help"
            helperText="Comma-separated. An inbound message containing any of these re-opens the FAQ list. Manage the FAQs in the FAQ menu section below."
          />
          {/* Sent menus stay tappable in the customer's chat history forever, so
              a topic retired last week is still one tap away — and used to answer
              with nothing at all. */}
          <Input
            label="Retired-topic reply"
            value={faqFallback}
            onChange={(e) => setFaqFallback(e.target.value)}
            placeholder="Sorry — that topic is no longer available."
            helperText="Sent when someone taps an FAQ row you have since deleted or switched off; the current menu follows it. Leave blank for the default wording."
          />
        </>
      )}

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              autoReplyEnabled,
              welcomeMessage: welcomeMessage.trim() || null,
              awayMessage: awayMessage.trim() || null,
              awayDebounceMinutes: debounceNum,
              faqMenuEnabled,
              faqTriggerKeywords: faqTriggers
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
              faqFallbackMessage: faqFallback.trim() || null,
            })
          }
        >
          Save auto-reply
        </Button>
      </div>
    </SectionCard>
  );
}

/* ── 2. Business-hours editor ── */
const MODE_OPTIONS: { value: HoursMode; label: string }[] = [
  { value: 'schedule', label: 'Follow a weekly schedule' },
  { value: 'always-open', label: 'Always open (never send the away message)' },
  { value: 'always-closed', label: 'Closed all week (always send the away message)' },
];

function BusinessHoursSection({
  settings,
  saving,
  onSave,
}: {
  settings: WaSettings;
  saving: boolean;
  onSave: SaveFn;
}) {
  const parsed = parseBusinessHours(settings.businessHours);
  const [tz, setTz] = useState(parsed.tz ?? BROWSER_TZ);
  const [mode, setMode] = useState<HoursMode>(() => modeOf(parsed));
  const [grid, setGrid] = useState(() => toGrid(parsed));
  const [exceptions, setExceptions] = useState<BusinessException[]>(() => parsed.exceptions ?? []);

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    const next = parseBusinessHours(settings.businessHours);
    setTz(next.tz ?? '');
    setMode(modeOf(next));
    setGrid(toGrid(next));
    setExceptions(next.exceptions ?? []);
  }

  // Ticks once a minute purely so the open/closed pill below stays truthful
  // while the screen is left open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const original = parseBusinessHours(settings.businessHours);
  const currentDays = mode === 'schedule' ? fromGrid(grid) : [];
  // fromGrid emits day-ascending, so the stored rows are sorted the same way
  // before comparing — otherwise a blob written out of order (by hand, or by an
  // API caller) would show the Save button armed the moment the page loaded.
  const originalDays = [...(original.days ?? [])].sort((a, b) => a.day - b.day);
  const dirty =
    tz.trim() !== (original.tz ?? '') ||
    mode !== modeOf(original) ||
    JSON.stringify(currentDays) !== JSON.stringify(originalDays) ||
    JSON.stringify(exceptions) !== JSON.stringify(original.exceptions ?? []);

  const setWindows = (day: number, windows: BusinessWindow[]) =>
    setGrid((prev) => ({ ...prev, [day]: windows }));
  const updateWindow = (day: number, index: number, field: 'open' | 'close', value: string) =>
    setGrid((prev) => ({
      ...prev,
      [day]: prev[day].map((w, i) => (i === index ? { ...w, [field]: value } : w)),
    }));

  const updateException = (index: number, patch: Partial<BusinessException>) =>
    setExceptions((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  // Mirror of the server's zod refine, so a typo shows inline instead of coming
  // back as a raw 400 with no field attached.
  const tzError = (() => {
    const value = tz.trim();
    if (!value) return undefined;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: value });
      return undefined;
    } catch {
      return 'Not a valid IANA timezone name (e.g. Asia/Kolkata)';
    }
  })();

  const invalidExceptions = exceptions.some(
    (e) => !e.closed && (hmToMinutes(e.open) === null || hmToMinutes(e.close) === null),
  );
  const openNow = isOpenNow(mode, grid, exceptions, tz.trim() || BROWSER_TZ, now);

  const handleSave = async () => {
    if (tzError || invalidExceptions) return;
    const zone = tz.trim() || BROWSER_TZ;
    // 'always-open' sends NO `days` key: that — not an empty array — is what the
    // server reads as "not configured". `tz` still goes with it because the
    // analytics reporting timezone is read from this same blob.
    if (mode === 'always-open') {
      onSave({ businessHours: { tz: zone } });
      return;
    }
    if (mode === 'always-closed') {
      onSave({ businessHours: { tz: zone, days: [], exceptions } });
      return;
    }
    const days = fromGrid(grid);
    if (days.length === 0) {
      // An empty schedule is now honoured literally (closed all week), which is
      // the opposite of what it used to do. Confirm it rather than silently
      // arming the away message against every inbound message.
      const ok = await confirmDialog({
        title: 'Closed all week?',
        message:
          'No day has an open window, so the channel is treated as closed at all times and ' +
          'the away auto-reply will answer every inbound message. Pick "Always open" instead ' +
          'if you meant to switch business hours off.',
        confirmLabel: 'Save as closed all week',
        variant: 'warning',
      });
      if (!ok) return;
    }
    // `tz` is always sent. Omitting it left the server falling back to the
    // container's zone, which is the bug this field exists to prevent.
    const businessHours: BusinessHours = { days, tz: zone, exceptions };
    onSave({ businessHours });
  };

  return (
    <SectionCard
      title="Business hours"
      description="Days/times the inbox is staffed. Outside these hours the away message is used."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Select
            label="Availability"
            clearable={false}
            value={mode}
            onChange={(v) => setMode(v as HoursMode)}
            options={MODE_OPTIONS}
          />
        </div>
        {/* The evaluated state, not just the inputs. "Every day unchecked" and
            "no schedule at all" look identical in a grid and behave in opposite
            ways, so show which one is in force before it is saved. */}
        <span
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium',
            openNow ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
          )}
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', openNow ? 'bg-emerald-600' : 'bg-amber-600')}
            aria-hidden="true"
          />
          {openNow ? 'Open now' : 'Closed now — away message active'}
        </span>
      </div>

      <div className="max-w-xs">
        {/* A free-text field defaulting to blank meant business hours were
            evaluated in the CONTAINER's zone (UTC), so an operator in Asia/Kolkata
            had the away message switch on at 05:30 local. The server now rejects a
            bad name outright, so offer the browser's own list and pre-fill it. */}
        <Input
          label="Timezone"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          placeholder="Asia/Kolkata"
          list="wa-tz-list"
          error={tzError}
          helperText={
            tzError ? undefined : 'IANA timezone name — business hours are read in this zone.'
          }
        />
        <datalist id="wa-tz-list">
          {TZ_OPTIONS.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </div>

      {mode === 'schedule' && (
        <div className="space-y-2">
          {DAY_LABELS.map((label, day) => {
            const windows = grid[day] ?? [];
            return (
              <div
                key={day}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <label className="flex w-28 cursor-pointer items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={windows.length > 0}
                    onChange={(e) =>
                      setWindows(day, e.target.checked ? [{ open: '09:00', close: '18:00' }] : [])
                    }
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm font-medium text-[var(--text)]">{label}</span>
                </label>
                {windows.length > 0 ? (
                  <div className="space-y-1.5">
                    {/* Several windows per day. The server has always evaluated
                        every row it is given; only this editor collapsed a day to
                        one window, so a lunch closure could not be expressed. */}
                    {windows.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-32">
                          <TimePicker
                            value={w.open}
                            onChange={(v) => updateWindow(day, i, 'open', v)}
                            inputSize="sm"
                          />
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">to</span>
                        <div className="w-32">
                          <TimePicker
                            value={w.close}
                            onChange={(v) => updateWindow(day, i, 'close', v)}
                            inputSize="sm"
                          />
                        </div>
                        {windows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setWindows(
                                day,
                                windows.filter((_, j) => j !== i),
                              )
                            }
                            aria-label={`Remove window ${i + 1} on ${label}`}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--error)]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setWindows(day, [...windows, { open: '14:00', close: '18:00' }])
                      }
                      className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <Plus className="h-3 w-3" /> Add window
                    </button>
                  </div>
                ) : (
                  <span className="pt-1 text-xs text-[var(--text-muted)]">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode !== 'always-open' && (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Holidays &amp; exceptions</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Dates that override the weekly grid. Closing for a public holiday used to mean
              flipping the Away toggle by hand on the morning and remembering to flip it back.
            </p>
          </div>
          {exceptions.map((ex, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div className="w-40">
                <DatePicker
                  value={ex.date}
                  onChange={(v) => updateException(i, { date: v })}
                  inputSize="sm"
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="w-40">
                <Input
                  value={ex.label ?? ''}
                  onChange={(e) => updateException(i, { label: e.target.value })}
                  placeholder="Diwali"
                  inputSize="sm"
                />
              </div>
              <div className="w-36">
                <Select
                  size="sm"
                  clearable={false}
                  value={ex.closed ? 'closed' : 'custom'}
                  onChange={(v) =>
                    updateException(
                      i,
                      v === 'closed'
                        ? { closed: true }
                        : { closed: false, open: ex.open ?? '10:00', close: ex.close ?? '14:00' },
                    )
                  }
                  options={[
                    { value: 'closed', label: 'Closed' },
                    { value: 'custom', label: 'Custom hours' },
                  ]}
                />
              </div>
              {!ex.closed && (
                <div className="flex items-center gap-2">
                  <div className="w-28">
                    <TimePicker
                      value={ex.open ?? ''}
                      onChange={(v) => updateException(i, { open: v })}
                      inputSize="sm"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">to</span>
                  <div className="w-28">
                    <TimePicker
                      value={ex.close ?? ''}
                      onChange={(v) => updateException(i, { close: v })}
                      inputSize="sm"
                    />
                  </div>
                </div>
              )}
              <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={!!ex.repeatsAnnually}
                  onChange={(e) => updateException(i, { repeatsAnnually: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                Every year
              </label>
              <button
                type="button"
                onClick={() => setExceptions((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove exception ${ex.date}`}
                className="ml-auto rounded p-1 text-[var(--text-muted)] hover:text-[var(--error)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {invalidExceptions && (
            <p className="text-xs text-red-600">
              Every custom-hours exception needs both an open and a close time.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setExceptions((prev) => [
                ...prev,
                { date: todayYmd(tz.trim() || BROWSER_TZ), closed: true, repeatsAnnually: false },
              ])
            }
          >
            Add date
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving || !!tzError || invalidExceptions}
          onClick={() => void handleSave()}
        >
          Save business hours
        </Button>
      </div>
    </SectionCard>
  );
}

/* ── 3. Opt-out keywords (chip add/remove) ── */
/* ── Opt-out acknowledgement ── */
function OptOutConfirmationSection({
  settings,
  saving,
  onSave,
}: {
  settings: WaSettings;
  saving: boolean;
  onSave: SaveFn;
}) {
  const [text, setText] = useState(settings.optOutConfirmationMessage ?? '');

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setText(settings.optOutConfirmationMessage ?? '');
  }

  const dirty = text !== (settings.optOutConfirmationMessage ?? '');

  return (
    <SectionCard
      title="Opt-out confirmation"
      description="One line sent back to a customer whose message opted them out. Leave blank to send nothing."
    >
      <FormattedTextarea
        label="Confirmation message"
        value={text}
        onChange={setText}
        rows={3}
        maxLength={1024}
        placeholder="You've been unsubscribed and won't receive further messages from us."
      />
      <p className="text-xs text-[var(--text-muted)]">
        Sent inside the 24-hour window their own message opened, and past the do-not-contact list we
        add them to. It is the only message that is allowed past it.
      </p>
      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={() => onSave({ optOutConfirmationMessage: text.trim() || null })}
        >
          Save confirmation
        </Button>
      </div>
    </SectionCard>
  );
}

function KeywordsSection({
  title,
  description,
  placeholder,
  current,
  settings,
  saving,
  onSave,
}: {
  title: string;
  description: string;
  placeholder: string;
  current: string[];
  settings: WaSettings;
  saving: boolean;
  onSave: (keywords: string[]) => void;
}) {
  const [keywords, setKeywords] = useState<string[]>(current);
  const [draft, setDraft] = useState('');

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setKeywords(current);
  }

  const dirty = JSON.stringify(keywords) !== JSON.stringify(current);

  const addKeyword = () => {
    const kw = draft.trim().toUpperCase();
    if (!kw) return;
    if (keywords.includes(kw)) {
      setDraft('');
      return;
    }
    setKeywords((prev) => [...prev, kw]);
    setDraft('');
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  return (
    <SectionCard title={title} description={description}>
      <div className="flex flex-wrap gap-2">
        {keywords.length === 0 && (
          <span className="text-xs text-[var(--text-muted)]">No keywords configured.</span>
        )}
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(kw)}
              aria-label={`Remove ${kw}`}
              className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="max-w-xs flex-1">
          <Input
            label="Add keyword"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder={placeholder}
          />
        </div>
        <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addKeyword}>
          Add
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={() => onSave(keywords)}
        >
          Save keywords
        </Button>
      </div>
    </SectionCard>
  );
}

/* ── 4. Frequency cap + retention ── */
function CapsSection({
  settings,
  saving,
  onSave,
}: {
  settings: WaSettings;
  saving: boolean;
  onSave: SaveFn;
}) {
  const [cap, setCap] = useState<string>(String(settings.marketingCapPer24h));
  const [keepForever, setKeepForever] = useState(settings.retentionDays === null);
  const [retentionDays, setRetentionDays] = useState<string>(
    settings.retentionDays === null ? '' : String(settings.retentionDays),
  );

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setCap(String(settings.marketingCapPer24h));
    setKeepForever(settings.retentionDays === null);
    setRetentionDays(settings.retentionDays === null ? '' : String(settings.retentionDays));
  }

  const dirty =
    cap !== String(settings.marketingCapPer24h) ||
    keepForever !== (settings.retentionDays === null) ||
    retentionDays !== (settings.retentionDays === null ? '' : String(settings.retentionDays));

  const handleSave = () => {
    const capNum = Math.max(0, Number(cap) || 0);
    const retention = keepForever ? null : Math.max(0, Number(retentionDays) || 0);
    onSave({ marketingCapPer24h: capNum, retentionDays: retention });
  };

  return (
    <SectionCard
      title="Frequency & retention"
      description="Cap marketing messages and control how long conversation data is kept."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Marketing cap per 24h"
          type="number"
          min={0}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          helperText="Max marketing messages a contact can receive in 24 hours."
        />
        <div>
          <Input
            label="Retention (days)"
            type="number"
            min={0}
            value={retentionDays}
            disabled={keepForever}
            onChange={(e) => setRetentionDays(e.target.value)}
            helperText="How long conversations/messages are retained."
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={keepForever}
              onChange={(e) => setKeepForever(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-sm text-[var(--text)]">Keep forever (no auto-deletion)</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          Save limits
        </Button>
      </div>
    </SectionCard>
  );
}
