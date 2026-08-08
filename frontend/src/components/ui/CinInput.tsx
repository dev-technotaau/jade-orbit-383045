'use client';

import MaskedCodeInput from '@/components/ui/MaskedCodeInput';

/**
 * CinInput — the single site-wide CIN field. Thin wrapper over the
 * MaskedCodeInput slot engine (auto-uppercase, positional masking, hard
 * 21-cap, live incompleteness error, per-slot keyboard switching).
 *
 * CIN shape (21 chars, MCA format): listing char (only L or U) +
 * 5-digit NIC industry code + 2-letter state code + 4-digit
 * incorporation year + 3-letter ownership type (PTC, PLC, FTC, …) +
 * 6-digit registration number.
 *
 * Note: CIN applies to Companies-Act entities only — LLPs have an
 * LLPIN (different format) and proprietorships have neither, which is
 * why this field stays optional and company-only in the UI.
 */

const CIN_MASK = 'R99999AA9999AAA999999';

interface CinInputProps {
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

export default function CinInput({
  value,
  onChange,
  label = 'CIN Number',
  error,
  helperText = '21 characters — e.g. U12345MH2020PTC123456',
  required,
  disabled,
  id,
  className,
}: CinInputProps) {
  return (
    <MaskedCodeInput
      mask={CIN_MASK}
      codeName="CIN"
      label={label}
      placeholder="e.g. U12345MH2020PTC123456"
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
