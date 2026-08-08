'use client';

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: () => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const digits = value.split('').concat(Array(length - value.length).fill(''));

  const handleChange = (index: number, digit: string) => {
    if (!/^[0-9]?$/.test(digit)) return;

    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join('').slice(0, length);
    onChange(newValue);

    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when last digit is entered
    if (digit && newValue.length === length && onComplete) {
      // Defer so parent state updates from onChange settle first
      setTimeout(onComplete, 0);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.length === length && onComplete) {
      e.preventDefault();
      onComplete();
      return;
    }
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    const lastIndex = Math.min(pasted.length, length) - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }

    // Auto-submit on paste if complete
    if (pasted.length === length && onComplete) {
      setTimeout(onComplete, 0);
    }
  };

  return (
    <div>
      <div className="flex justify-center gap-2 sm:gap-3">
        {digits.slice(0, length).map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(-1)}
            className={cn(
              'h-12 w-10 rounded-lg border text-center text-lg font-semibold transition-colors sm:h-14 sm:w-12',
              'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
              'disabled:cursor-not-allowed disabled:bg-[var(--bg-secondary)] disabled:opacity-60',
              error ? 'border-error' : 'border-[var(--border)]',
              focusedIndex === index && 'border-primary ring-primary/20 ring-2',
            )}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>
      {error && <p className="text-error mt-2 text-center text-sm">{error}</p>}
    </div>
  );
}
