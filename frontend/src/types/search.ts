export type SuggestionType = 'job_title' | 'skill' | 'company' | 'location';

export interface AutocompleteResult {
  text: string;
  type: SuggestionType;
  count?: number;
}

export interface SuggestionItem {
  text: string;
  count: number;
}

export interface SearchHistoryItem {
  query: string;
  type: 'job' | 'candidate';
  timestamp: number;
}

export interface PopularSearch {
  query: string;
  count: number;
}

export interface FieldHistoryItem {
  value: string;
  timestamp: number;
}

export interface UnifiedSuggestion {
  text: string;
  count: number;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchFacets {
  [field: string]: FacetBucket[];
}

export interface SearchResultHighlight {
  [field: string]: string[];
}

export interface JobSearchResult {
  _score: number;
  _highlight: SearchResultHighlight;
  [key: string]: unknown;
}

export interface CandidateSearchResult {
  _score: number;
  _highlight: SearchResultHighlight;
  [key: string]: unknown;
}
