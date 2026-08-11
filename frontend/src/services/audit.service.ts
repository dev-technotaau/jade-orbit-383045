import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';

/**
 * Audit trail client.
 *
 * Read-only by design — the API exposes no endpoint that writes, edits or
 * deletes an entry, and nothing here pretends otherwise. Rows leave only via
 * the retention cron.
 */

/** Whether a row still hashes to the checksum recorded with it. */
export type IntegrityState = 'valid' | 'invalid' | 'unverifiable';

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string | null;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  isArchived: boolean;
  createdAt: string;
  integrity: IntegrityState;
}

export interface AuditFilters {
  action?: string;
  entity?: string;
  entityId?: string;
  performedBy?: string;
  ipAddress?: string;
  q?: string;
  from?: string;
  to?: string;
  includeArchived?: boolean;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditStats {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  byEntity: Array<{ entity: string; count: number }>;
  byActor: Array<{ performedBy: string; count: number }>;
  perDay: Array<{ day: string; count: number }>;
  /** True when the 30-day series hit its scan cap and is therefore partial. */
  perDayTruncated: boolean;
  oldest: string | null;
}

export interface AuditFacets {
  actions: string[];
  entities: string[];
  actors: string[];
}

export interface IntegrityReport {
  checked: number;
  valid: number;
  invalid: number;
  unverifiable: number;
  invalidIds: string[];
  tampered: boolean;
}

/** Drop empty values so the query string reflects only active filters. */
function params(filters: AuditFilters, extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...extra };
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== false) out[k] = v;
  }
  return out;
}

export const auditService = {
  async list(filters: AuditFilters, page = 1, limit = 50): Promise<AuditPage> {
    const res = await api.get<ApiResponse<AuditPage>>(API.SUPER_ADMIN.WA_AUDIT, {
      params: params(filters, { page, limit }),
    });
    return res.data.data as AuditPage;
  },

  async stats(filters: AuditFilters): Promise<AuditStats> {
    const res = await api.get<ApiResponse<AuditStats>>(API.SUPER_ADMIN.WA_AUDIT_STATS, {
      params: params(filters),
    });
    return res.data.data as AuditStats;
  },

  async facets(): Promise<AuditFacets> {
    const res = await api.get<ApiResponse<AuditFacets>>(API.SUPER_ADMIN.WA_AUDIT_FACETS);
    return res.data.data as AuditFacets;
  },

  async getEntry(id: string): Promise<AuditEntry> {
    const res = await api.get<ApiResponse<AuditEntry>>(API.SUPER_ADMIN.WA_AUDIT_ENTRY(id));
    return res.data.data as AuditEntry;
  },

  /** Re-hash the filtered range and report what no longer verifies. */
  async verify(filters: AuditFilters): Promise<IntegrityReport> {
    const res = await api.get<ApiResponse<IntegrityReport>>(API.SUPER_ADMIN.WA_AUDIT_VERIFY, {
      params: params(filters),
    });
    return res.data.data as IntegrityReport;
  },

  /** Download the filtered trail as CSV. */
  async exportCsv(filters: AuditFilters): Promise<void> {
    const res = await api.get(API.SUPER_ADMIN.WA_AUDIT_EXPORT, {
      params: params(filters),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export default auditService;
