'use client';

import MaskedCodeInput from '@/components/ui/MaskedCodeInput';

/**
 * GstinInput — the single site-wide GSTIN field. Thin wrapper over the
 * MaskedCodeInput slot engine (auto-uppercase, positional masking, hard
 * 15-cap, live incompleteness error, per-slot keyboard switching).
 *
 * GSTIN shape (15 chars): 2-digit state code, the entity's 10-char PAN
 * (5 letters + 4 digits + 1 letter), entity code [1-9A-Z], literal 'Z',
 * alphanumeric checksum. Parents should cross-check the embedded PAN
 * against the entered PAN via `gstinEmbedsPan` from lib/legal-ids and
 * surface it through the `error` prop.
 */

const GSTIN_MASK = '99AAAAA9999AEZX';

interface GstinInputProps {
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

export default function GstinInput({
  value,
  onChange,
  label = 'GST Number',
  error,
  helperText = '15 characters — e.g. 22AAAAA0000A1Z5',
  required,
  disabled,
  id,
  className,
}: GstinInputProps) {
  return (
    <MaskedCodeInput
      mask={GSTIN_MASK}
      codeName="GSTIN"
      label={label}
      placeholder="e.g. 22AAAAA0000A1Z5"
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
