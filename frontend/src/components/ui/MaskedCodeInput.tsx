'use client';

import { useState, type ReactNode } from 'react';
import { Shield } from 'lucide-react';
import Input from '@/components/ui/Input';

/**
 * MaskedCodeInput — generic hardened input for fixed-shape uppercase
 * identity codes (PAN, GSTIN, CIN, …). One slot-mask engine drives all
 * of them so every code field behaves identically site-wide:
 *
 *   - auto-uppercase
 *   - hard cap at the mask length
 *   - positional masking: a character that is illegal for the slot it
 *     would land in is silently dropped — applies to paste as well
 *   - live error while the value is incomplete (typed but short)
 *   - mobile keyboard switching: `inputMode` flips between text and
 *     numeric based on which slot the NEXT character lands in
 *     (best-effort: modern Android/iOS apply the change live; some
 *     older iOS versions pick it up on refocus)
 *
 * Because of the masking, a value at full mask length is ALWAYS
 * shape-valid by construction — parents only need emptiness checks at
 * save time (keeping a regex gate as defense-in-depth for legacy
 * values is still recommended, since pre-mask data may contain junk).
 *
 * Slot codes:
 *   A  letter            [A-Z]
 *   9  digit             [0-9]
 *   X  letter or digit   [A-Z0-9]
 *   E  GSTIN entity code [1-9A-Z]
 *   R  CIN listing char  [LU]
 *
 * Literal slots (auto-inserted — the user doesn't have to type them,
 * but typing them is also accepted):
 *   Z  literal Z         (GSTIN 14th char — fixed by spec)
 *   -  literal hyphen    (LLPIN separator)
 */
const SLOT_RULES: Record<string, { re: RegExp; mode: 'text' | 'numeric' }> = {
  A: { re: /[A-Z]/, mode: 'text' },
  '9': { re: /[0-9]/, mode: 'numeric' },
  X: { re: /[A-Z0-9]/, mode: 'text' },
  E: { re: /[1-9A-Z]/, mode: 'text' },
  R: { re: /[LU]/, mode: 'text' },
};

/** Literal slots: the mask char IS the content; auto-inserted on typing. */
const LITERAL_SLOTS = new Set(['Z', '-']);

/**
 * Position-aware sanitiser: uppercase, then keep only characters legal
 * for the slot they would occupy, stopping at the mask length. Illegal
 * characters are dropped rather than shifted, so typing "A1" into a
 * letter slot yields just "A".
 *
 * Literal slots auto-insert as soon as the user types the character
 * that belongs AFTER them (so "AAB1" becomes "AAB-1" for LLPIN without
 * the user typing the hyphen), but never trail dangling: deleting back
 * to a literal removes it normally because we only insert a literal
 * while there is a follow-up character to place.
 */
export function sanitizeMaskedCode(raw: string, mask: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (out.length >= mask.length) break;

    // Fill any literal slots standing between the current position and
    // the slot this character could occupy. If the user actually typed
    // the literal, consume it instead of double-inserting.
    let consumed = false;
    while (out.length < mask.length && LITERAL_SLOTS.has(mask[out.length])) {
      const lit = mask[out.length];
      out += lit;
      if (ch === lit) {
        consumed = true;
        break;
      }
    }
    if (consumed || out.length >= mask.length) continue;

    const rule = SLOT_RULES[mask[out.length]];
    if (rule?.re.test(ch)) out += ch;
  }
  return out;
}

interface MaskedCodeInputProps {
  /** Slot mask, e.g. 'AAAAA9999A' (PAN) or 'R99999AA9999AAA999999' (CIN). */
  mask: string;
  /** Short code name used in the live error, e.g. 'PAN', 'GSTIN', 'CIN'. */
  codeName: string;
  value: string;
  /** Receives the sanitised value (uppercase, masked, ≤ mask length). */
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** External error (e.g. from a save gate) — overrides the live one. */
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export default function MaskedCodeInput({
  mask,
  codeName,
  value,
  onChange,
  label,
  placeholder,
  error,
  helperText,
  leftIcon = <Shield className="h-4 w-4" />,
  required,
  disabled,
  id,
  className,
}: MaskedCodeInputProps) {
  const [touched, setTouched] = useState(false);

  // The slot the next typed character lands in decides the mobile
  // keyboard. Literal slots auto-insert, so skip past them — when the
  // cursor sits before the LLPIN hyphen, the next character the user
  // actually types is the digit after it, so show the numeric keyboard.
  // At full length nothing more can be typed; keep 'text'.
  let nextSlot = Math.min(value.length, mask.length - 1);
  while (nextSlot < mask.length - 1 && LITERAL_SLOTS.has(mask[nextSlot])) nextSlot++;
  const inputMode = SLOT_RULES[mask[nextSlot]]?.mode ?? 'text';

  // Live incompleteness error — only once the user has actually typed
  // something. Masking makes over-length and wrong-shape values
  // unrepresentable, so "not full length yet" is the only live failure.
  const liveError =
    touched && value.length > 0 && value.length < mask.length
      ? `${codeName} must be ${mask.length} characters — ${value.length} of ${mask.length} entered`
      : undefined;

  return (
    <Input
      id={id}
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        setTouched(true);
        onChange(sanitizeMaskedCode(e.target.value, mask));
      }}
      onBlur={() => setTouched(true)}
      leftIcon={leftIcon}
      error={error || liveError}
      helperText={helperText}
      required={required}
      disabled={disabled}
      className={className}
      maxLength={mask.length}
      inputMode={inputMode}
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
    />
  );
}
