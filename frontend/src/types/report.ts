/**
 * Report builder types — mirrors `backend/src/services/report-datasets.ts`
 * and the `ReportSpec` in `report.service.ts`.
 *
 * The dataset catalogue is fetched at runtime rather than hardcoded here, so
 * adding a dataset on the backend surfaces in the UI with no frontend change.
 */

export type ReportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';

export interface ReportColumn {
  key: string;
  label: string;
  /** Contact / financial / personal-text column — needs the PII opt-in. */
  pii?: boolean;
  /** Pre-selected when the dataset is chosen. */
  default?: boolean;
}

export interface ReportFilter {
  key: string;
  label: string;
  kind: 'enum' | 'boolean';
  options?: string[];
}

export interface ReportDateField {
  key: string;
  label: string;
}

export interface ReportDataset {
  key: string;
  label: string;
  group: string;
  description: string;
  dateFields: ReportDateField[];
  filters: ReportFilter[];
  columns: ReportColumn[];
}

export interface ReportSpec {
  dataset: string;
  columns?: string[];
  dateField?: string;
  /** Absolute instants — presets are resolved client-side before sending. */
  from?: string;
  to?: string;
  filters?: Record<string, string | boolean>;
  format?: ReportFormat;
  limit?: number;
  includePii?: boolean;
}

export interface ReportPreview {
  count: number;
  /** PII columns dropped from the current selection because the opt-in is off. */
  withheldPii: string[];
}

export interface GeneratedReportMeta {
  rowCount: number | null;
  truncated: boolean;
}

/* ------------------------------------------------------------------ */
/* Time range presets                                                  */
/* ------------------------------------------------------------------ */

export type RangePresetKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'quarterToDate'
  | 'yearToDate'
  | 'all'
  | 'custom';

export const RANGE_PRESETS: { key: RangePresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'quarterToDate', label: 'Quarter to date' },
  { key: 'yearToDate', label: 'Year to date' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

export const REPORT_FORMATS: { key: ReportFormat; label: string; hint: string }[] = [
  { key: 'csv', label: 'CSV', hint: 'Universal, opens anywhere' },
  { key: 'xlsx', label: 'Excel', hint: 'Styled header, frozen top row' },
  { key: 'json', label: 'JSON', hint: 'For scripts and pipelines' },
  { key: 'pdf', label: 'PDF', hint: 'Printable landscape table' },
];

/**
 * Resolve a preset to absolute instants.
 *
 * Day boundaries are computed from the LOCAL clock of whoever is running the
 * report, which is what "today" has to mean for the person reading it. The
 * result is sent as absolute ISO instants so the server does no timezone maths
 * and the same spec always yields the same rows.
 *
 * `all` returns no bounds, so the dataset is unfiltered by date.
 */
export function resolveRange(
  preset: RangePresetKey,
  now: Date = new Date(),
): { from?: string; to?: string } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'yesterday': {
      const y = daysAgo(1);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
    }
    case 'last7':
      return { from: startOfDay(daysAgo(6)).toISOString(), to: endOfDay(now).toISOString() };
    case 'last30':
      return { from: startOfDay(daysAgo(29)).toISOString(), to: endOfDay(now).toISOString() };
    case 'last90':
      return { from: startOfDay(daysAgo(89)).toISOString(), to: endOfDay(now).toISOString() };
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        // Day 0 of this month is the last day of the previous month.
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString(),
      };
    case 'quarterToDate':
      return {
        from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'yearToDate':
      return {
        from: new Date(now.getFullYear(), 0, 1).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'all':
    case 'custom':
    default:
      return {};
  }
}
