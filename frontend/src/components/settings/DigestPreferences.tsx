'use client';

import { CalendarClock, Moon, Globe } from 'lucide-react';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';

/**
 * Cadence + quiet-hours controls for the recurring digests.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The channel toggles above this ("Email", "WhatsApp"…) answer *how* we may
 * reach someone. These answer *how often*, and *per topic* — which is the
 * control people actually want. Without it the only way to stop one unwanted
 * digest was to turn off email entirely and lose application updates with it.
 *
 * Shared by the candidate and employer settings pages: the category list is
 * the only thing that differs, so the shape of the control, the wording of
 * the cadences and the quiet-hours behaviour cannot drift between roles.
 *
 * Presentational only — the parent owns the value and saves it alongside the
 * channel preferences in one request.
 */

export type DigestCadence = 'DAILY' | 'WEEKLY' | 'OFF';

export interface DigestPrefsValue {
  digests?: Record<string, DigestCadence>;
  quietHours?: { enabled?: boolean; start?: number; end?: number };
  timezone?: string;
}

interface CategoryDef {
  key: string;
  label: string;
  description: string;
  /** Shown as the "Default" option label so the default is never a mystery. */
  defaultCadence: DigestCadence;
  /** Cadences that make sense for this topic. */
  allowed?: DigestCadence[];
}

const CANDIDATE_CATEGORIES: CategoryDef[] = [
  {
    key: 'job_recommendations',
    label: 'Jobs for you',
    description: 'Roles matched to your skills, experience and preferences.',
    defaultCadence: 'WEEKLY',
  },
  {
    key: 'saved_jobs_closing',
    label: 'Saved jobs closing soon',
    description: 'Jobs you saved that stop accepting applications within 3 days.',
    defaultCadence: 'DAILY',
  },
  {
    key: 'followed_company_jobs',
    label: 'Companies you follow',
    description: 'New openings at companies you have followed.',
    defaultCadence: 'WEEKLY',
  },
  {
    key: 'profile_views',
    label: 'Profile views',
    description: 'A summary of recruiters who viewed your profile.',
    defaultCadence: 'WEEKLY',
  },
];

const EMPLOYER_CATEGORIES: CategoryDef[] = [
  {
    key: 'candidate_recommendations',
    label: 'Candidate matches',
    description: 'New candidates matching your open roles.',
    defaultCadence: 'WEEKLY',
  },
  {
    key: 'applications_awaiting',
    label: 'Applications awaiting review',
    description: 'A reminder when applications are sitting unopened.',
    defaultCadence: 'DAILY',
  },
  {
    key: 'cv_search_alerts',
    label: 'Saved search alerts',
    description: 'New candidates matching the searches you saved.',
    defaultCadence: 'WEEKLY',
  },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

/** A small, sane list — not the full IANA database in a dropdown. */
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

export default function DigestPreferences({
  role,
  value,
  onChange,
}: {
  role: 'candidate' | 'employer';
  value: DigestPrefsValue;
  onChange: (next: DigestPrefsValue) => void;
}) {
  const categories = role === 'candidate' ? CANDIDATE_CATEGORIES : EMPLOYER_CATEGORIES;

  const quietEnabled = value.quietHours?.enabled ?? true;
  const quietStart = value.quietHours?.start ?? 21;
  const quietEnd = value.quietHours?.end ?? 8;

  // Detected once from the browser so the field is never blank on first open —
  // a quiet window is meaningless without knowing which clock it refers to.
  const detectedTz =
    value.timezone ||
    (typeof Intl !== 'undefined'
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Kolkata')
      : 'Asia/Kolkata');

  const setCadence = (key: string, cadence: string) => {
    const next = { ...(value.digests ?? {}) };
    if (cadence === 'DEFAULT') delete next[key];
    else next[key] = cadence as DigestCadence;
    onChange({ ...value, digests: next });
  };

  const setQuiet = (patch: Partial<NonNullable<DigestPrefsValue['quietHours']>>) =>
    onChange({
      ...value,
      quietHours: { enabled: quietEnabled, start: quietStart, end: quietEnd, ...patch },
    });

  return (
    <div className="space-y-8">
      {/* ── Per-topic cadence ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <CalendarClock className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">Summary emails</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              How often we send each type. Turning one off never affects your account or application
              updates.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {categories.map((cat) => {
            const current = value.digests?.[cat.key];
            return (
              <div
                key={cat.key}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)]">{cat.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{cat.description}</p>
                </div>
                <div className="w-full sm:w-44">
                  <Select
                    aria-label={`${cat.label} frequency`}
                    value={current ?? 'DEFAULT'}
                    onChange={(v) => setCadence(cat.key, v || 'DEFAULT')}
                    options={[
                      {
                        value: 'DEFAULT',
                        label: `Default (${cat.defaultCadence === 'DAILY' ? 'Daily' : 'Weekly'})`,
                      },
                      ...(cat.allowed ?? ['DAILY', 'WEEKLY', 'OFF']).map((c) => ({
                        value: c,
                        label: c === 'DAILY' ? 'Daily' : c === 'WEEKLY' ? 'Weekly' : 'Off',
                      })),
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quiet hours ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Moon className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">Quiet hours</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Summary emails pause during these hours. Security and account alerts always come
              through.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text)]">Enable quiet hours</span>
            <Switch
              checked={quietEnabled}
              onChange={(e) => setQuiet({ enabled: e.target.checked })}
              aria-label="Enable quiet hours"
            />
          </div>

          {quietEnabled && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Select
                  label="From"
                  value={String(quietStart)}
                  onChange={(v) => setQuiet({ start: Number(v) })}
                  options={HOURS}
                />
                <Select
                  label="Until"
                  value={String(quietEnd)}
                  onChange={(v) => setQuiet({ end: Number(v) })}
                  options={HOURS}
                />
              </div>

              <div className="mt-3">
                <Select
                  label="Timezone"
                  value={detectedTz}
                  onChange={(v) => onChange({ ...value, timezone: v || detectedTz })}
                  options={[
                    ...(TIMEZONES.includes(detectedTz)
                      ? []
                      : [{ value: detectedTz, label: `${detectedTz} (detected)` }]),
                    ...TIMEZONES.map((tz) => ({ value: tz, label: tz })),
                  ]}
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Globe className="h-3 w-3 shrink-0" />
                  {quietStart > quietEnd
                    ? `Paused from ${String(quietStart).padStart(2, '0')}:00 overnight until ${String(quietEnd).padStart(2, '0')}:00.`
                    : `Paused between ${String(quietStart).padStart(2, '0')}:00 and ${String(quietEnd).padStart(2, '0')}:00.`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
