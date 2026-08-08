'use client';

import { useState, useCallback, forwardRef } from 'react';
import AutoSuggest, { type SuggestOption, type AutoSuggestRef } from '@/components/ui/AutoSuggest';
import { useSuggest } from '@/hooks/use-suggestions';

interface ServerAutoSuggestProps {
  /** ES suggestion category key (e.g. 'skill', 'location', 'industry') */
  category: string;
  /** Optional region filter (e.g. 'IN', 'US') */
  region?: string;
  /** Max results to fetch (default 30) */
  limit?: number;
  // All AutoSuggest props except `suggestions`, `isLoading`, `onInputChange`
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  allowCreate?: boolean;
  createLabel?: (query: string) => string;
  maxSelections?: number;
  minChars?: number;
  inputSize?: 'sm' | 'md' | 'lg';
  className?: string;
  debounceMs?: number;
}

const ServerAutoSuggest = forwardRef<AutoSuggestRef, ServerAutoSuggestProps>(
  ({ category, region, limit = 30, ...rest }, ref) => {
    const [query, setQuery] = useState('');

    const { suggestions, isLoading } = useSuggest({
      category,
      query,
      limit,
      region,
    });

    const options: SuggestOption[] = suggestions.map((s) => ({ label: s, value: s }));

    const handleInputChange = useCallback((q: string) => {
      setQuery(q);
    }, []);

    return (
      <AutoSuggest
        ref={ref}
        {...rest}
        suggestions={options}
        isLoading={isLoading}
        onInputChange={handleInputChange}
      />
    );
  },
);

ServerAutoSuggest.displayName = 'ServerAutoSuggest';

export default ServerAutoSuggest;
