'use client';

import MaskedCodeInput from '@/components/ui/MaskedCodeInput';

/**
 * LlpinInput — the single site-wide LLPIN field. Thin wrapper over the
 * MaskedCodeInput slot engine (auto-uppercase, positional masking, live
 * incompleteness error, per-slot keyboard switching).
 *
 * LLPIN shape (8 chars, MCA format): 3 letters + hyphen + 4 digits,
 * e.g. AAB-1234. The hyphen auto-inserts — typing "AAB1" yields
 * "AAB-1". LLPs carry an LLPIN instead of a CIN, which is why both
 * fields coexist on the employer legal surfaces.
 */

const LLPIN_MASK = 'AAA-9999';

interface LlpinInputProps {
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

export default function LlpinInput({
  value,
  onChange,
  label = 'LLPIN',
  error,
  helperText = 'For LLPs — e.g. AAB-1234',
  required,
  disabled,
  id,
  className,
}: LlpinInputProps) {
  return (
    <MaskedCodeInput
      mask={LLPIN_MASK}
      codeName="LLPIN"
      label={label}
      placeholder="e.g. AAB-1234"
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
