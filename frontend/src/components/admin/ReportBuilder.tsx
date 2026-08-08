'use client';

/**
 * ReportBuilder — the custom report surface on /admin/reports.
 *
 * The page's three original cards are fixed, whole-table exports. This is the
 * other half: pick one of the backend's datasets, choose the columns, scope it
 * by time and by segment, pick a format, and download.
 *
 * SUPER_ADMIN only. The parent renders it behind a role check and the backend
 * enforces the same on `/reports/datasets|preview|generate`, because a builder
 * that can select arbitrary columns across every dataset is a much bigger
 * capability than the three fixed exports.
 *
 * PII columns are marked and locked until the operator explicitly opts in; the
 * opt-in and the exact columns are written to the audit log on every run.
 *
 * The dataset catalogue is fetched, never hardcoded — adding a dataset on the
 * backend surfaces here with no change to this file.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Columns3,
  Database,
  Download,
  Filter as FilterIcon,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { reportService } from '@/services/report.service';
import {
  RANGE_PRESETS,
  REPORT_FORMATS,
  resolveRange,
  type RangePresetKey,
  type ReportDataset,
  type ReportFormat,
  type ReportSpec,
} from '@/types/report';
import type { ApiError } from '@/types/api';

/** Row-cap choices. The backend clamps to 100k regardless. */
const LIMIT_OPTIONS = [
  { value: '1000', label: '1,000 rows' },
  { value: '5000', label: '5,000 rows' },
  { value: '25000', label: '25,000 rows' },
  { value: '100000', label: '100,000 rows (max)' },
];

/** Enum filter values are SCREAMING_SNAKE; render them readably. */
const humanise = (v: string) => v.toLowerCase().replace(/_/g, ' ');

/** `'' | 'true' | 'false'` tri-state, so a boolean filter can mean "any". */
const BOOL_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export default function ReportBuilder() {
  const { data: datasets, isLoading: datasetsLoading } = useQuery({
    queryKey: ['reports', 'datasets'],
    queryFn: () => reportService.listDatasets(),
    staleTime: 10 * 60_000,
  });

  const [datasetKey, setDatasetKey] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [dateField, setDateField] = useState<string>('');
  const [preset, setPreset] = useState<RangePresetKey>('last30');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [limit, setLimit] = useState<string>('5000');
  const [includePii, setIncludePii] = useState(false);
  const [generating, setGenerating] = useState(false);

  const dataset: ReportDataset | undefined = useMemo(
    () => datasets?.find((d) => d.key === datasetKey),
    [datasets, datasetKey],
  );

  /* Grouped picker options, preserving the backend's declared order. */
  const datasetOptions = useMemo(() => {
    if (!datasets) return [];
    return datasets.map((d) => ({ value: d.key, label: `${d.group} · ${d.label}` }));
  }, [datasets]);

  /* Selecting a dataset resets everything downstream of it — a column or filter
     from the previous dataset would be rejected by the backend. */
  const selectDataset = (key: string) => {
    setDatasetKey(key);
    const next = datasets?.find((d) => d.key === key);
    setColumns(next ? next.columns.filter((c) => c.default).map((c) => c.key) : []);
    setDateField(next?.dateFields[0]?.key ?? '');
    setFilters({});
  };

  /* Default to the first dataset once the catalogue lands, so the panel is
     never an empty shell. */
  useEffect(() => {
    if (!datasetKey && datasets && datasets.length > 0) {
      const first = datasets[0];
      setDatasetKey(first.key);
      setColumns(first.columns.filter((c) => c.default).map((c) => c.key));
      setDateField(first.dateFields[0]?.key ?? '');
    }
  }, [datasets, datasetKey]);

  /* Turning the PII opt-in back off must also drop any PII columns already
     selected, otherwise the spec silently disagrees with what is on screen. */
  useEffect(() => {
    if (includePii || !dataset) return;
    const piiKeys = new Set(dataset.columns.filter((c) => c.pii).map((c) => c.key));
    setColumns((prev) => {
      const next = prev.filter((k) => !piiKeys.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [includePii, dataset]);

  const range = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(customTo).toISOString() : undefined,
      };
    }
    return resolveRange(preset);
  }, [preset, customFrom, customTo]);

  const spec: ReportSpec | null = useMemo(() => {
    if (!dataset || columns.length === 0) return null;
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '' && v != null),
    );
    return {
      dataset: dataset.key,
      columns,
      dateField: dateField || undefined,
      from: range.from,
      to: range.to,
      filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
      format,
      limit: Number(limit),
      includePii,
    };
  }, [dataset, columns, dateField, range, filters, format, limit, includePii]);

  /* Live row estimate. Keyed on the whole spec minus `format`, since format
     cannot change the row count. */
  const previewKey = spec
    ? JSON.stringify({ ...spec, format: undefined, limit: undefined })
    : 'none';
  const { data: preview, isFetching: previewing } = useQuery({
    queryKey: ['reports', 'preview', previewKey],
    queryFn: () => reportService.preview(spec!),
    enabled: Boolean(spec),
    staleTime: 30_000,
    retry: false,
  });

  const piiColumns = dataset?.columns.filter((c) => c.pii) ?? [];
  const selectedPiiCount = columns.filter((k) => piiColumns.some((c) => c.key === k)).length;

  const toggleColumn = (key: string) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const resetToDefaults = () => {
    if (!dataset) return;
    setColumns(dataset.columns.filter((c) => c.default).map((c) => c.key));
    setDateField(dataset.dateFields[0]?.key ?? '');
    setFilters({});
    setPreset('last30');
    setCustomFrom('');
    setCustomTo('');
    setFormat('csv');
    setLimit('5000');
    setIncludePii(false);
  };

  const generate = async () => {
    if (!spec) return;
    setGenerating(true);
    try {
      const meta = await reportService.generate(spec);
      showToast.success(
        meta.rowCount != null
          ? `Report downloaded — ${meta.rowCount.toLocaleString()} rows${
              meta.truncated ? ' (row cap reached)' : ''
            }`
          : 'Report downloaded',
      );
    } catch (err) {
      showToast.error((err as unknown as ApiError)?.message ?? 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (datasetsLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-white py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
            <SlidersHorizontal className="text-primary h-5 w-5" aria-hidden="true" />
            Custom report builder
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {datasets?.length ?? 0} datasets across the platform. Choose columns, scope by time and
            segment, then export.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetToDefaults}
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          Reset
        </Button>
      </div>

      {/* Stacked flow rather than a tall left rail: with up to six segment
          filters the rail outran the right-hand column badly, leaving a large
          void under the run bar. Reading order is now what → when/who/how →
          columns → run, and the column checkboxes get the full width. */}
      <div className="space-y-4">
        {/* Dataset — full width, it is the choice everything else depends on */}
        <div>
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Database className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" /> Dataset
            </h3>
            <Select
              options={datasetOptions}
              value={datasetKey}
              onChange={selectDataset}
              clearable={false}
              searchable
              placeholder="Choose a dataset"
              className="w-full"
            />
            {dataset && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">{dataset.description}</p>
            )}
          </section>
        </div>

        {/* Scope row: when · who · how. `items-start` so each card sizes to its
            own content — segment counts vary from 0 to 6 per dataset, and
            stretching left Time range and Output with dead space below. */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {/* Time */}
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Table2 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" /> Time range
            </h3>
            <div className="space-y-3">
              {dataset && dataset.dateFields.length > 1 && (
                <div>
                  <label className="text-xs text-[var(--text-muted)]">Apply range to</label>
                  <Select
                    options={dataset.dateFields.map((f) => ({ value: f.key, label: f.label }))}
                    value={dateField}
                    onChange={setDateField}
                    clearable={false}
                    className="mt-1 w-full"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--text-muted)]">Period</label>
                <Select
                  options={RANGE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
                  value={preset}
                  onChange={(v) => setPreset(v as RangePresetKey)}
                  clearable={false}
                  className="mt-1 w-full"
                />
              </div>
              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">From</label>
                    <input
                      type="datetime-local"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">To</label>
                    <input
                      type="datetime-local"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-[var(--text-muted)]">
                {preset === 'all'
                  ? 'No date filter — every matching row.'
                  : range.from
                    ? `${new Date(range.from).toLocaleString()} → ${
                        range.to ? new Date(range.to).toLocaleString() : 'now'
                      }`
                    : 'Pick a start and end.'}
              </p>
            </div>
          </section>

          {/* Segments. Always rendered so the scope row keeps three columns;
              datasets with no filters say so rather than collapsing the grid. */}
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <FilterIcon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              Segments
            </h3>
            {!dataset || dataset.filters.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                {dataset
                  ? 'This dataset has no segment filters — scope it by time instead.'
                  : 'Choose a dataset first.'}
              </p>
            ) : (
              <div className="space-y-3">
                {dataset.filters.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-[var(--text-muted)]">{f.label}</label>
                    <Select
                      options={
                        f.kind === 'boolean'
                          ? BOOL_OPTIONS
                          : (f.options ?? []).map((o) => ({ value: o, label: humanise(o) }))
                      }
                      value={filters[f.key] ?? ''}
                      onChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v }))}
                      placeholder="Any"
                      className="mt-1 w-full"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Output */}
          <section className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Output</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Format</label>
                <Select
                  options={REPORT_FORMATS.map((f) => ({
                    value: f.key,
                    label: `${f.label} — ${f.hint}`,
                  }))}
                  value={format}
                  onChange={(v) => setFormat(v as ReportFormat)}
                  clearable={false}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Row cap</label>
                <Select
                  options={LIMIT_OPTIONS}
                  value={limit}
                  onChange={setLimit}
                  clearable={false}
                  className="mt-1 w-full"
                />
              </div>
            </div>
          </section>
        </div>

        {/* PII gate */}
        {piiColumns.length > 0 && (
          <section
            className={`rounded-xl border p-4 ${
              includePii
                ? 'border-yellow-300 bg-yellow-50'
                : 'border-[var(--border)] bg-[var(--bg-secondary)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert
                className={`mt-0.5 h-5 w-5 flex-none ${
                  includePii ? 'text-yellow-700' : 'text-[var(--text-muted)]'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <Checkbox
                  checked={includePii}
                  onChange={(e) => setIncludePii(e.target.checked)}
                  label="Include personal data in this report"
                  description={`${piiColumns.length} column${
                    piiColumns.length === 1 ? '' : 's'
                  } on this dataset carry contact details, financial identifiers or personal text. They are excluded unless you tick this. Every run is recorded in the audit log with this choice.`}
                />
                {includePii && selectedPiiCount > 0 && (
                  <p className="mt-2 text-xs font-medium text-yellow-900">
                    {selectedPiiCount} personal-data column
                    {selectedPiiCount === 1 ? '' : 's'} selected. Handle the export accordingly.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Columns */}
        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Columns3 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              Columns
              <span className="font-normal text-[var(--text-muted)]">
                ({columns.length} of {dataset?.columns.length ?? 0})
              </span>
            </h3>
            {dataset && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setColumns(
                      dataset.columns.filter((c) => includePii || !c.pii).map((c) => c.key),
                    )
                  }
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setColumns(dataset.columns.filter((c) => c.default).map((c) => c.key))
                  }
                >
                  Defaults
                </Button>
              </div>
            )}
          </div>

          {!dataset ? (
            <p className="text-sm text-[var(--text-muted)]">Choose a dataset first.</p>
          ) : (
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dataset.columns.map((c) => {
                const locked = Boolean(c.pii) && !includePii;
                return (
                  <div key={c.key} className="flex items-start gap-2">
                    <Checkbox
                      checked={columns.includes(c.key)}
                      disabled={locked}
                      onChange={() => toggleColumn(c.key)}
                      label={c.label}
                    />
                    {c.pii && (
                      <span
                        className="mt-0.5 flex-none"
                        title="Personal data — needs the opt-in above"
                      >
                        <Badge variant={locked ? 'neutral' : 'warning'} size="sm">
                          PII
                        </Badge>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Run */}
        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              {!spec ? (
                <span className="text-[var(--text-muted)]">
                  Select a dataset and at least one column.
                </span>
              ) : previewing ? (
                <span className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Counting matching rows…
                </span>
              ) : preview ? (
                <span className="text-[var(--text)]">
                  <strong>{preview.count.toLocaleString()}</strong> matching row
                  {preview.count === 1 ? '' : 's'}
                  {preview.count > Number(limit) && (
                    <span className="text-[var(--warning-dark)]">
                      {' '}
                      · capped at {Number(limit).toLocaleString()}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">Row estimate unavailable.</span>
              )}
            </div>
            <Button
              onClick={() => void generate()}
              isLoading={generating}
              disabled={!spec || generating}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Generate report
            </Button>
          </div>

          {preview && preview.withheldPii.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-xs text-[var(--text-muted)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
              {preview.withheldPii.length} personal-data column
              {preview.withheldPii.length === 1 ? '' : 's'} withheld from this run.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
