export interface ApiResponse<T = unknown> {
  status: 'success' | 'fail' | 'error';
  message: string;
  data: T;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchFacets {
  [key: string]: FacetBucket[];
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  facets?: SearchFacets;
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ApiError {
  status: 'fail' | 'error';
  message: string;
  statusCode: number;
  errors?: Record<string, string[]> | unknown;
  code?: string;
  requestId?: string;
  /**
   * Structured payload the server attached for the client to act on, as
   * opposed to `errors` which carries field-level validation messages.
   *
   * Used by the admin concurrency layer:
   *   • `STALE_WRITE`     → `{ entity, expected, actual }` so the UI can
   *     offer reload-vs-overwrite instead of a bare "conflict" toast.
   *   • `RESOURCE_LOCKED` → `{ holder }` so the lock banner can name who is
   *     editing rather than saying "someone".
   */
  details?: unknown;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
