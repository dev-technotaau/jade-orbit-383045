'use client';

import MaskedCodeInput from '@/components/ui/MaskedCodeInput';

/**
 * TanInput — the single site-wide TAN field. Thin wrapper over the
 * MaskedCodeInput slot engine (auto-uppercase, positional masking, hard
 * 10-cap, live incompleteness error, per-slot keyboard switching).
 *
 * TAN shape (10 chars): 4 letters + 5 digits + 1 letter, e.g.
 * DELM12345B. Issued to any TDS/TCS deductor — relevant to BOTH
 * company and individual/proprietor employers, unlike CIN/LLPIN.
 */

const TAN_MASK = 'AAAA99999A';

interface TanInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export default function TanInput({
  value,
  onChange,
  label = 'TAN Number',
  error,
  helperText = '10 characters — e.g. DELM12345B',
  required,
  disabled,
  id,
  className,
}: TanInputProps) {
  return (
    <MaskedCodeInput
      mask={TAN_MASK}
      codeName="TAN"
      label={label}
      placeholder="e.g. DELM12345B"
      value={value}
      onChange={onChange}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      id={id}
      className={className}
    />
  );
}
