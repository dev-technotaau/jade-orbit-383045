'use client';

import MaskedCodeInput from '@/components/ui/MaskedCodeInput';

/**
 * PanInput — the single site-wide PAN field. Thin wrapper over the
 * MaskedCodeInput slot engine (see that file for the full behaviour:
 * auto-uppercase, positional masking, hard 10-cap, live incompleteness
 * error, per-slot mobile keyboard switching).
 *
 * PAN shape AAAAA9999A: 5 letters, 4 digits, 1 letter.
 */

const PAN_MASK = 'AAAAA9999A';

interface PanInputProps {
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

export default function PanInput({
  value,
  onChange,
  label = 'PAN Number',
  error,
  helperText = '10 characters — e.g. AAAAA1234A',
  required,
  disabled,
  id,
  className,
}: PanInputProps) {
  return (
    <MaskedCodeInput
      mask={PAN_MASK}
      codeName="PAN"
      label={label}
      placeholder="e.g. AAAAA1234A"
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
