export type SavedSearchType = 'CANDIDATE_SEARCH' | 'JOB_SEARCH';

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  searchType: SavedSearchType;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedSearchRequest {
  name: string;
  searchType: SavedSearchType;
  filters: Record<string, unknown>;
}

export interface UpdateSavedSearchRequest {
  name?: string;
  filters?: Record<string, unknown>;
}
