'use client';

import { useCallback, useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Segmented one-time-code input.
 *
 * The boxes are a presentation choice; the thing being edited is a single
 * string, which is why paste works properly here. Operators overwhelmingly copy
 * the code from their phone's notification or password manager, and a naive
 * per-box implementation drops five of the six digits on paste — the single
 * most common way this control gets built wrong.
 *
 * `inputMode="numeric"` + `autoComplete="one-time-code"` let iOS and Android
 * offer the code straight from the SMS/authenticator, and `aria-label`s make the
 * group navigable rather than six anonymous text fields.
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  className,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = useCallback(
    (next: string) => {
      const clean = next.replace(/\D/g, '').slice(0, length);
      onChange(clean);
      if (clean.length === length) onComplete?.(clean);
      return clean;
    },
    [length, onChange, onComplete],
  );

  const handleInput = (index: number, raw: string) => {
    // A single keystroke may deliver more than one character (autofill, IME),
    // so treat every input as a splice rather than a single character.
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    const chars = value.split('');
    for (let i = 0; i < typed.length && index + i < length; i++) {
      chars[index + i] = typed[i];
    }
    const next = commit(chars.join('').replace(/\s/g, ''));
    const focusAt = Math.min(index + typed.length, length - 1);
    if (next.length < length) refs.current[focusAt]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = value.padEnd(length, ' ').split('');
      if (chars[index] && chars[index] !== ' ') {
        chars[index] = ' ';
        commit(chars.join('').replace(/\s/g, ''));
      } else if (index > 0) {
        chars[index - 1] = ' ';
        commit(chars.join('').replace(/\s/g, ''));
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const next = commit(pasted);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={`${length}-digit verification code`}
      className={`flex justify-center gap-2 sm:gap-3 ${className ?? ''}`}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          // Only the first box advertises one-time-code, so the browser offers
          // to fill the whole value once rather than six competing suggestions.
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${length}`}
          maxLength={length}
          value={digit.trim()}
          disabled={disabled}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="focus:border-primary focus:ring-primary/30 h-12 w-10 rounded-lg border border-[var(--border)] bg-white text-center text-lg font-semibold text-[var(--text)] focus:ring-2 focus:outline-none disabled:opacity-60 sm:w-12"
        />
      ))}
    </div>
  );
}
