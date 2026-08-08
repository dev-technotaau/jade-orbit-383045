'use client';

/**
 * QuickExportCard — one of the three fixed exports on /admin/reports, now with
 * a time range and a segment instead of being an unconditional whole-table dump.
 *
 * Why this exists: the backend has always accepted `startDate`, `endDate`,
 * `role` and `status` on these endpoints, but the UI only ever sent a `period`
 * param the server never read. So every "quick export" silently returned the
 * entire table. These controls send the params the API actually understands.
 *
 * The card keeps its own state, so three cards on the page do not fight over a
 * shared range — each is an independent one-shot export.
 *
 * Presets reuse `resolveRange` from `@/types/report`, the same helper the custom
 * builder uses, so "Last 30 days" means the identical window in both places.
 */

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { adminService } from '@/services/admin.service';
import { showToast } from '@/components/ui/Toast';
import { RANGE_PRESETS, resolveRange, type RangePresetKey } from '@/types/report';

export interface QuickExportSegment {
  label: string;
  /** `''` means "no filter" and is always offered first as "All". */
  options: { value: string; label: string }[];
}

interface Props {
  type: 'users' | 'jobs' | 'analytics';
  title: string;
  description: string;
  /** Tailwind classes for the icon tile, preserved from the original cards. */
  tint: string;
  icon: React.ReactNode;
  /** Extension for the downloaded file, used only to name it. */
  extension: 'xlsx' | 'pdf';
  buttonLabel: string;
  /** Omitted for datasets with nothing meaningful to segment by. */
  segment?: QuickExportSegment;
}

/**
 * Presets minus `custom` — these cards are deliberately one-click, so an
 * explicit datetime picker belongs to the full builder below, not here.
 */
const CARD_PRESETS = RANGE_PRESETS.filter((p) => p.key !== 'custom');

export default function QuickExportCard({
  type,
  title,
  description,
  tint,
  icon,
  extension,
  buttonLabel,
  segment,
}: Props) {
  const [preset, setPreset] = useState<RangePresetKey>('all');
  const [segmentValue, setSegmentValue] = useState('');
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const range = resolveRange(preset);
      const blob = await adminService.exportReport({
        type,
        startDate: range.from,
        endDate: range.to,
        role: type === 'users' ? segmentValue || undefined : undefined,
        status: type === 'jobs' ? segmentValue || undefined : undefined,
      });

      // Name the file after what it actually contains, so three exports taken
      // on the same day don't overwrite each other in the downloads folder.
      const parts = ['report', type];
      if (segmentValue) parts.push(segmentValue.toLowerCase());
      if (preset !== 'all') parts.push(preset);
      parts.push(new Date().toISOString().split('T')[0]);
      const filename = `${parts.join('-')}.${extension}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast.success('Report downloaded successfully');
    } catch {
      showToast.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${tint}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-[var(--text-muted)]">Time range</label>
          <Select
            options={CARD_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            value={preset}
            onChange={(v) => setPreset(v as RangePresetKey)}
            clearable={false}
            className="mt-1 w-full"
          />
        </div>

        {segment && (
          <div>
            <label className="text-xs text-[var(--text-muted)]">{segment.label}</label>
            <Select
              options={segment.options}
              value={segmentValue}
              onChange={setSegmentValue}
              placeholder="All"
              className="mt-1 w-full"
            />
          </div>
        )}
      </div>

      {/* `mt-auto` keeps the three buttons on one line even though the analytics
          card has no segment select and the other two do. */}
      <div className="mt-auto pt-6">
        <Button
          fullWidth
          variant="outline"
          tooltip={`Download ${title.toLowerCase()}`}
          isLoading={downloading}
          disabled={downloading}
          leftIcon={<FileDown className="h-4 w-4" />}
          onClick={() => void download()}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
