/**
 * Frontend client for the search-history BFF routes at
 * `/api/search-history/*` (Next.js route handlers, NOT the direct
 * backend URL).
 *
 * The BFF layer owns the `ha_search_session` cookie on the primary
 * `hireadda.in` domain — same pattern as the auth cookies. The
 * backend stays stateless w.r.t. session cookies and just reads the
 * sessionId from the `x-guest-session` request header that the BFF
 * forwards. On successful login-time `migrate()`, the BFF clears the
 * cookie so the user's next signed-out visit doesn't re-bind to a
 * stale empty session.
 *
 * Uses raw axios with relative URLs (no `api` baseURL prefix) so the
 * request hits the Next.js route handlers on the same origin as the
 * page. `withCredentials: true` ensures the cookie flows on every
 * call — mandatory for guest history persistence to work.
 */
import axios from 'axios';

export type SearchHistoryType = 'JOB' | 'CANDIDATE' | 'COMPANY';

export interface SearchHistoryEntry {
  id: string;
  userId: string | null;
  sessionId: string | null;
  searchType: SearchHistoryType;
  filters: Record<string, unknown>;
  filtersHash: string;
  query: string | null;
  location: string | null;
  resultsCount: number;
  hits: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  /** Computed delta: how many new matching jobs/companies since last seen. */
  newCount: number;
}

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

const BFF_BASE = '/api/search-history';

export const searchHistoryService = {
  async list(type: SearchHistoryType, limit = 12): Promise<SearchHistoryEntry[]> {
    const { data } = await axios.get<BackendEnvelope<{ items: SearchHistoryEntry[] }>>(BFF_BASE, {
      params: { type, limit },
      withCredentials: true,
    });
    return data?.data?.items ?? [];
  },

  async record(input: {
    searchType: SearchHistoryType;
    filters: Record<string, unknown>;
    query?: string;
    location?: string;
    resultsCount?: number;
  }): Promise<SearchHistoryEntry | null> {
    const { data } = await axios.post<BackendEnvelope<SearchHistoryEntry | null>>(BFF_BASE, input, {
      withCredentials: true,
    });
    return data?.data ?? null;
  },

  async remove(id: string): Promise<void> {
    await axios.delete(`${BFF_BASE}/${encodeURIComponent(id)}`, { withCredentials: true });
  },

  /** Called by the auth flow on successful login. */
  async migrate(sessionId?: string): Promise<{ migrated: number; dedup: number }> {
    const { data } = await axios.post<BackendEnvelope<{ migrated: number; dedup: number }>>(
      `${BFF_BASE}/migrate`,
      sessionId ? { sessionId } : {},
      { withCredentials: true },
    );
    return data?.data ?? { migrated: 0, dedup: 0 };
  },
};
