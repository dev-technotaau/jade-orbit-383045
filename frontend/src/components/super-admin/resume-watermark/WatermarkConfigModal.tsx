'use client';

/* eslint-disable @next/next/no-img-element -- the watermark preview intentionally
   renders the raw /icons/logo_square.svg via <img> so we can apply the exact same
   brightness/opacity/rotation filters the backend uses; next/image would strip these. */

import { useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Repeat, Square, Slash } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import type { WatermarkConfig, WatermarkPosition } from '@/types/resume-watermark';

const LOGO_SRC = '/icons/logo_square.svg';

const DEFAULTS: WatermarkConfig = {
  enabled: true,
  position: 'background',
  opacity: 0.12,
  scale: 0.5,
  rotation: -30,
};

const OPACITY_OPTIONS = [
  { value: '0.05', label: '5%' },
  { value: '0.1', label: '10%' },
  { value: '0.15', label: '15%' },
  { value: '0.2', label: '20%' },
  { value: '0.3', label: '30%' },
  { value: '0.4', label: '40%' },
  { value: '0.5', label: '50%' },
];

const SCALE_OPTIONS = [
  { value: '0.2', label: 'Small' },
  { value: '0.35', label: 'Medium' },
  { value: '0.5', label: 'Large' },
  { value: '0.7', label: 'Extra large' },
];

const ROTATION_OPTIONS = [
  { value: '-45', label: '-45°' },
  { value: '-30', label: '-30°' },
  { value: '-15', label: '-15°' },
  { value: '0', label: '0°' },
  { value: '15', label: '15°' },
  { value: '30', label: '30°' },
  { value: '45', label: '45°' },
];

/** The 8 edge/corner anchors + center, laid out to fill a 3×3 grid.
    The two middle-row side cells are intentionally empty (`null`). */
const GRID_POSITIONS: (WatermarkPosition | null)[] = [
  'top-left',
  'top-center',
  'top-right',
  null,
  'center',
  null,
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/** Tailwind classes that place the little indicator dot on each glyph. */
const DOT_CLASS: Record<string, string> = {
  'top-left': 'top-1.5 left-1.5',
  'top-center': 'top-1.5 left-1/2 -translate-x-1/2',
  'top-right': 'top-1.5 right-1.5',
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-1.5 left-1.5',
  'bottom-center': 'bottom-1.5 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-1.5 right-1.5',
};

/** Tailwind classes that pin an anchored watermark inside the preview page. */
const ANCHOR_CLASS: Record<string, string> = {
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'top-left': 'top-[6%] left-[6%]',
  'top-right': 'top-[6%] right-[6%]',
  'bottom-left': 'bottom-[6%] left-[6%]',
  'bottom-right': 'bottom-[6%] right-[6%]',
  'top-center': 'top-[6%] left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-[6%] left-1/2 -translate-x-1/2',
};

const POSITION_LABEL: Record<WatermarkPosition, string> = {
  background: 'Background',
  tiled: 'Tiled',
  diagonal: 'Diagonal',
  center: 'Centered',
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  'top-center': 'Top center',
  'bottom-center': 'Bottom center',
};

const SPECIAL_MODES: {
  value: WatermarkPosition;
  label: string;
  hint: string;
  Icon: typeof Square;
}[] = [
  { value: 'background', label: 'Background', hint: 'Big & faint', Icon: Square },
  { value: 'tiled', label: 'Tiled', hint: 'Repeated', Icon: Repeat },
  { value: 'diagonal', label: 'Diagonal', hint: 'Angled', Icon: Slash },
];

/** Pick the option value numerically closest to `value` (Selects need a value
    that exists in the option list; stored numbers like 0.12 may not). */
function nearestValue(value: number, options: { value: string }[]): string {
  let best = options[0].value;
  let bestDiff = Infinity;
  for (const o of options) {
    const diff = Math.abs(Number(o.value) - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o.value;
    }
  }
  return best;
}

export default function WatermarkConfigModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  // ── server config ──
  const { data: res, isLoading } = useQuery({
    queryKey: ['rw-config'],
    queryFn: () => svc.getConfig(),
    enabled: isOpen,
  });
  const config = res?.data;

  // ── local editable copy ──
  const [enabled, setEnabled] = useState(DEFAULTS.enabled);
  const [position, setPosition] = useState<WatermarkPosition>(DEFAULTS.position);
  const [opacity, setOpacity] = useState(DEFAULTS.opacity);
  const [scale, setScale] = useState(DEFAULTS.scale);
  const [rotation, setRotation] = useState(DEFAULTS.rotation);

  // Copy the server config into local state when the modal opens or a fresh
  // config arrives. This is a render-phase sync (React's "adjust state when a
  // prop changes" pattern) rather than an effect, so there's no cascading
  // render. `source` is undefined while closed/unloaded; each fetch yields a
  // new object reference, and reopening re-applies the saved config (dropping
  // any unsaved edits).
  const source = isOpen ? config : undefined;
  const [syncedSource, setSyncedSource] = useState<WatermarkConfig | undefined>(undefined);
  if (source !== syncedSource) {
    setSyncedSource(source);
    if (source) {
      setEnabled(source.enabled);
      setPosition(source.position);
      setOpacity(source.opacity);
      setScale(source.scale);
      setRotation(source.rotation);
    }
  }

  const resetToDefaults = () => {
    setEnabled(DEFAULTS.enabled);
    setPosition(DEFAULTS.position);
    setOpacity(DEFAULTS.opacity);
    setScale(DEFAULTS.scale);
    setRotation(DEFAULTS.rotation);
  };

  // ── save ──
  const saveMutation = useMutation({
    mutationFn: () => svc.updateConfig({ enabled, position, opacity, scale, rotation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rw-config'] });
      showToast.success('Watermark settings saved');
      onClose();
    },
    onError: () => showToast.error('Could not save watermark settings'),
  });

  const footer = (
    <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button
        variant="ghost"
        size="sm"
        onClick={resetToDefaults}
        leftIcon={<RotateCcw className="h-4 w-4" />}
      >
        Reset to defaults
      </Button>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => saveMutation.mutate()}
          isLoading={saveMutation.isPending}
        >
          Save settings
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Watermark settings"
      size="xl"
      footer={isLoading ? undefined : footer}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* ─────────────────  CONTROLS  ───────────────── */}
          <div className="space-y-6">
            {/* Enable */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <Switch
                label="Enable watermark on downloads"
                description="Applied to every resume super-admins export."
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {!enabled && (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Watermarking is off — downloads return the original file unwatermarked.
                </p>
              )}
            </div>

            {/* Position */}
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text)]">Position</p>
              <div className="mx-auto grid w-40 grid-cols-3 gap-2">
                {GRID_POSITIONS.map((p, i) =>
                  p === null ? (
                    <div key={`empty-${i}`} aria-hidden />
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosition(p)}
                      aria-label={POSITION_LABEL[p]}
                      aria-pressed={position === p}
                      title={POSITION_LABEL[p]}
                      className={cn(
                        'relative aspect-square rounded-lg border transition-colors',
                        position === p
                          ? 'border-primary bg-primary'
                          : 'border-[var(--border)] bg-white hover:bg-[var(--bg-secondary)]',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute h-1.5 w-1.5 rounded-full',
                          DOT_CLASS[p],
                          position === p ? 'bg-white' : 'bg-[var(--text-muted)]',
                        )}
                      />
                    </button>
                  ),
                )}
              </div>

              {/* Special modes */}
              <p className="mt-4 mb-2 text-sm font-medium text-[var(--text)]">Special modes</p>
              <div className="grid grid-cols-3 gap-2">
                {SPECIAL_MODES.map(({ value, label, hint, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPosition(value)}
                    aria-pressed={position === value}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors',
                      position === value
                        ? 'border-primary bg-primary text-white'
                        : 'border-[var(--border)] bg-white text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{label}</span>
                    <span
                      className={cn(
                        'text-[10px]',
                        position === value ? 'text-white/80' : 'text-[var(--text-muted)]',
                      )}
                    >
                      {hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity / Size / Rotation */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label="Opacity"
                size="md"
                clearable={false}
                value={nearestValue(opacity, OPACITY_OPTIONS)}
                onChange={(v) => setOpacity(Number(v))}
                options={OPACITY_OPTIONS}
              />
              <Select
                label="Size"
                size="md"
                clearable={false}
                value={nearestValue(scale, SCALE_OPTIONS)}
                onChange={(v) => setScale(Number(v))}
                options={SCALE_OPTIONS}
              />
              <Select
                label="Rotation"
                size="md"
                clearable={false}
                value={nearestValue(rotation, ROTATION_OPTIONS)}
                onChange={(v) => setRotation(Number(v))}
                options={ROTATION_OPTIONS}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Rotation only affects the Background, Tiled and Diagonal modes.
            </p>
          </div>

          {/* ─────────────────  PREVIEW  ───────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--text)]">Preview</p>
              <Badge variant={enabled ? 'success' : 'neutral'} size="sm">
                {enabled ? 'On' : 'Off'}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <div className="relative mx-auto aspect-[1/1.414] w-full max-w-[280px] overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
                {/* faux resume content */}
                <div className="space-y-3 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg-secondary)]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-2/3 rounded bg-[var(--bg-secondary)]" />
                      <div className="h-2 w-1/2 rounded bg-[var(--bg-secondary)]" />
                    </div>
                  </div>
                  <div className="h-2 w-1/3 rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-full rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-full rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-5/6 rounded bg-[var(--bg-secondary)]" />
                  <div className="mt-4 h-2 w-1/3 rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-full rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-full rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-11/12 rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-2/3 rounded bg-[var(--bg-secondary)]" />
                  <div className="mt-4 h-2 w-1/3 rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-full rounded bg-[var(--bg-secondary)]" />
                  <div className="h-1.5 w-4/5 rounded bg-[var(--bg-secondary)]" />
                </div>

                {/* watermark overlay */}
                <div className="pointer-events-none absolute inset-0">
                  {renderWatermark(position, opacity, scale, rotation)}
                </div>

                {/* off veil */}
                {!enabled && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50 px-3 py-1.5 text-center text-[11px] font-medium text-white">
                    Disabled — downloads are not watermarked
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-[var(--text-muted)]">
              {POSITION_LABEL[position]} · {Math.round(opacity * 100)}% ·{' '}
              {SCALE_OPTIONS.find((o) => Number(o.value) === scale)?.label ??
                `${Math.round(scale * 100)}%`}
              {(position === 'background' || position === 'tiled' || position === 'diagonal') &&
                ` · ${rotation}°`}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * One watermark "unit" = the logo lockup + the website URL beneath it, matching
 * the baked backend asset. `container-type: inline-size` lets the URL font size
 * track the unit width (cqw), so it scales with the logo at any size/position.
 * brightness(0) renders the white SVG as a solid silhouette; opacity controls
 * faintness. The URL is drawn black at the same opacity for a consistent look.
 */
function WatermarkUnit({
  opacity,
  className,
  style,
}: {
  opacity: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={{ ...style, containerType: 'inline-size' }}>
      <img
        src={LOGO_SRC}
        alt=""
        style={{ filter: 'brightness(0)', opacity, width: '100%', display: 'block' }}
      />
      <div
        style={{
          color: '#000',
          opacity,
          fontWeight: 700,
          fontSize: '7.5cqw',
          lineHeight: 1,
          textAlign: 'center',
          marginTop: '3cqw',
          whiteSpace: 'nowrap',
        }}
      >
        https://www.hireadda.in
      </div>
    </div>
  );
}

/** Build the watermark overlay JSX for the live preview. */
function renderWatermark(
  position: WatermarkPosition,
  opacity: number,
  scale: number,
  rotation: number,
) {
  const widthPct = `${Math.round(scale * 100)}%`;

  // Tiled — a repeating grid of small logo+URL units.
  if (position === 'tiled') {
    return (
      <div className="grid h-full w-full grid-cols-3 grid-rows-4 place-items-center">
        {Array.from({ length: 12 }).map((_, i) => (
          <WatermarkUnit
            key={i}
            opacity={opacity}
            style={{ width: '60%', transform: `rotate(${rotation}deg)` }}
          />
        ))}
      </div>
    );
  }

  // Background / Diagonal — one large centered unit (diagonal forces -45°).
  if (position === 'background' || position === 'diagonal') {
    const deg = position === 'diagonal' ? -45 : rotation;
    return (
      <WatermarkUnit
        opacity={opacity}
        className="absolute top-1/2 left-1/2"
        style={{ width: widthPct, transform: `translate(-50%, -50%) rotate(${deg}deg)` }}
      />
    );
  }

  // Anchored — corners, edges and center (no rotation).
  return (
    <WatermarkUnit
      opacity={opacity}
      className={cn('absolute', ANCHOR_CLASS[position])}
      style={{ width: widthPct }}
    />
  );
}
