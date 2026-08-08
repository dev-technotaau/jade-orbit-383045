'use client';

import { useState } from 'react';
import SuggestionInput from '@/components/onboarding/SuggestionInput';
import { useSuggest } from '@/hooks/use-suggestions';

interface ServerSuggestionInputProps {
  /** ES suggestion category key (e.g. 'skill', 'location', 'industry') */
  category: string;
  /** Optional region filter (e.g. 'IN', 'US') */
  region?: string;
  /** Min chars before querying server (default 0) */
  minChars?: number;
  /** Max results to fetch (default 15) */
  limit?: number;
  // All SuggestionInput props except `suggestions`
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  leftIcon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export default function ServerSuggestionInput({
  category,
  region,
  minChars = 0,
  limit = 15,
  value,
  onChange,
  ...rest
}: ServerSuggestionInputProps) {
  const [query, setQuery] = useState(value || '');

  const { suggestions } = useSuggest({
    category,
    query,
    limit,
    region,
    minChars,
  });

  const handleChange = (v: string) => {
    setQuery(v);
    onChange(v);
  };

  return (
    <SuggestionInput {...rest} value={value} onChange={handleChange} suggestions={suggestions} />
  );
}
