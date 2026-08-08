'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TimePicker from '@/components/ui/TimePicker';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSettings } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface BusinessHourRow {
  day: number;
  open: string;
  close: string;
}

interface BusinessHours {
  tz?: string;
  days: BusinessHourRow[];
}

/** Coerce the loosely-typed settings.businessHours blob into our editor shape. */
function parseBusinessHours(raw: unknown): BusinessHours {
  const result: BusinessHours = { tz: undefined, days: [] };
  if (raw && typeof raw === 'object') {
    const obj = raw as { tz?: unknown; days?: unknown };
    if (typeof obj.tz === 'string') result.tz = obj.tz;
    if (Array.isArray(obj.days)) {
      for (const d of obj.days) {
        if (d && typeof d === 'object') {
          const row = d as { day?: unknown; open?: unknown; close?: unknown };
          if (
            typeof row.day === 'number' &&
            typeof row.open === 'string' &&
            typeof row.close === 'string'
          ) {
            result.days.push({ day: row.day, open: row.open, close: row.close });
          }
        }
      }
    }
  }
  return result;
}

/** Build a 7-row Mon→Sun..Sat grid, merging any saved rows by day index. */
function toGrid(
  hours: BusinessHours,
): Record<number, { enabled: boolean; open: string; close: string }> {
  const grid: Record<number, { enabled: boolean; open: string; close: string }> = {};
  for (let day = 0; day < 7; day++) {
    const saved = hours.days.find((d) => d.day === day);
    grid[day] = saved
      ? { enabled: true, open: saved.open, close: saved.close }
      : { enabled: false, open: '09:00', close: '18:00' };
  }
  return grid;
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
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to save settings'),
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
      <OptOutKeywordsSection
        settings={settings}
        saving={saveMut.isPending}
        onSave={saveMut.mutate}
      />
      <CapsSection settings={settings} saving={saveMut.isPending} onSave={saveMut.mutate} />
    </div>
  );
}

type SaveFn = (patch: Partial<WaSettings>) => void;

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

  // Re-sync from the server object when it changes (render-time, not an effect).
  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setAutoReplyEnabled(settings.autoReplyEnabled);
    setWelcomeMessage(settings.welcomeMessage ?? '');
    setAwayMessage(settings.awayMessage ?? '');
    setFaqMenuEnabled(settings.faqMenuEnabled);
    setFaqTriggers((settings.faqTriggerKeywords ?? []).join(', '));
  }

  const dirty =
    autoReplyEnabled !== settings.autoReplyEnabled ||
    welcomeMessage !== (settings.welcomeMessage ?? '') ||
    awayMessage !== (settings.awayMessage ?? '') ||
    faqMenuEnabled !== settings.faqMenuEnabled ||
    faqTriggers !== (settings.faqTriggerKeywords ?? []).join(', ');

  return (
    <SectionCard
      title="Auto-reply"
      description="Greet first-time contacts and reply outside business hours."
    >
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
        <Input
          label="FAQ trigger keywords"
          value={faqTriggers}
          onChange={(e) => setFaqTriggers(e.target.value)}
          placeholder="menu, faq, help"
          helperText="Comma-separated. An inbound message containing any of these re-opens the FAQ list. Manage the FAQs in the FAQ menu section below."
        />
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
              faqMenuEnabled,
              faqTriggerKeywords: faqTriggers
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
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
  const [tz, setTz] = useState(parsed.tz ?? '');
  const [grid, setGrid] = useState(() => toGrid(parsed));

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    const next = parseBusinessHours(settings.businessHours);
    setTz(next.tz ?? '');
    setGrid(toGrid(next));
  }

  const original = parseBusinessHours(settings.businessHours);
  const currentDays: BusinessHourRow[] = [];
  for (let day = 0; day < 7; day++) {
    const row = grid[day];
    if (row.enabled) currentDays.push({ day, open: row.open, close: row.close });
  }
  const dirty =
    tz.trim() !== (original.tz ?? '') ||
    JSON.stringify(currentDays) !==
      JSON.stringify([...original.days].sort((a, b) => a.day - b.day));

  const updateRow = (day: number, field: 'enabled' | 'open' | 'close', value: string | boolean) => {
    setGrid((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = () => {
    const days: BusinessHourRow[] = [];
    for (let day = 0; day < 7; day++) {
      const row = grid[day];
      if (row.enabled) days.push({ day, open: row.open, close: row.close });
    }
    const businessHours: BusinessHours = { days };
    if (tz.trim()) businessHours.tz = tz.trim();
    onSave({ businessHours });
  };

  return (
    <SectionCard
      title="Business hours"
      description="Days/times the inbox is staffed. Outside these hours the away message is used."
    >
      <div className="max-w-xs">
        <Input
          label="Timezone (optional)"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          placeholder="Asia/Kolkata"
          helperText="IANA timezone name."
        />
      </div>

      <div className="space-y-2">
        {DAY_LABELS.map((label, day) => {
          const row = grid[day];
          return (
            <div
              key={day}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <label className="flex w-28 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(day, 'enabled', e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium text-[var(--text)]">{label}</span>
              </label>
              {row.enabled ? (
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <TimePicker
                      value={row.open}
                      onChange={(v) => updateRow(day, 'open', v)}
                      inputSize="sm"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">to</span>
                  <div className="w-32">
                    <TimePicker
                      value={row.close}
                      onChange={(v) => updateRow(day, 'close', v)}
                      inputSize="sm"
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          Save business hours
        </Button>
      </div>
    </SectionCard>
  );
}

/* ── 3. Opt-out keywords (chip add/remove) ── */
function OptOutKeywordsSection({
  settings,
  saving,
  onSave,
}: {
  settings: WaSettings;
  saving: boolean;
  onSave: SaveFn;
}) {
  const [keywords, setKeywords] = useState<string[]>(settings.optOutKeywords);
  const [draft, setDraft] = useState('');

  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings !== syncedFrom) {
    setSyncedFrom(settings);
    setKeywords(settings.optOutKeywords);
  }

  const dirty = JSON.stringify(keywords) !== JSON.stringify(settings.optOutKeywords);

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
    <SectionCard
      title="Opt-out keywords"
      description="Inbound messages matching any keyword auto opt-out the contact."
    >
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
            placeholder="STOP"
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
          onClick={() => onSave({ optOutKeywords: keywords })}
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
