import api from '@/lib/api';
import type { GeneratedReportMeta, ReportDataset, ReportPreview, ReportSpec } from '@/types/report';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

/**
 * Custom report builder client — `/reports/datasets|preview|generate`.
 *
 * SUPER_ADMIN only server-side. The three legacy fixed exports still live on
 * `adminService.exportReport()` and are untouched.
 */
export const reportService = {
  /** Dataset catalogue. Cached by the caller via React Query. */
  async listDatasets(): Promise<ReportDataset[]> {
    const { data } = await api.get<BackendEnvelope<ReportDataset[]>>('/reports/datasets');
    return data.data ?? [];
  },

  /** Row estimate + which PII columns are being withheld for this spec. */
  async preview(spec: ReportSpec): Promise<ReportPreview> {
    const { data } = await api.post<BackendEnvelope<ReportPreview>>('/reports/preview', spec);
    return data.data;
  },

  /**
   * Generate and download. Returns the row-count metadata the backend puts on
   * the response headers so the caller can report the outcome without parsing
   * a binary body.
   */
  async generate(spec: ReportSpec): Promise<GeneratedReportMeta> {
    const res = await api.post('/reports/generate', spec, { responseType: 'blob' });

    const disposition = String(res.headers?.['content-disposition'] ?? '');
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `${spec.dataset}-report.${spec.format ?? 'csv'}`;

    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const rawCount = res.headers?.['x-report-row-count'];
    return {
      rowCount: rawCount == null ? null : Number(rawCount),
      truncated: String(res.headers?.['x-report-truncated'] ?? '') === 'true',
    };
  },
};

export default reportService;
