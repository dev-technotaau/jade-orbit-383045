'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Branded time picker — the time-only counterpart to DatePicker.
 * Consumes and emits a 24-hour `HH:mm` string (same as `<input type="time">`),
 * while displaying a friendly 12-hour label. Opens a portaled popover with
 * hour + minute columns so it never clips inside modals/overflow containers.
 */
interface TimePickerProps {
  label?: string;
  /** 24-hour "HH:mm" (e.g. "09:30"); empty string = unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
  /** Minute increments offered in the dropdown (default 5). */
  minuteStep?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const sizeStyles = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-3',
  lg: 'h-12 text-base px-4',
};

const pad = (n: number) => String(n).padStart(2, '0');

function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function display12(h: number, m: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${pad(m)} ${ampm}`;
}

export default function TimePicker({
  label,
  value,
  onChange,
  placeholder,
  error,
  helperText,
  leftIcon,
  inputSize = 'md',
  minuteStep = 5,
  required = false,
  disabled = false,
  className,
  id,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const parsed = parseTime(value);
  const displayValue = parsed ? display12(parsed.h, parsed.m) : '';

  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) setIsOpen((o) => !o);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes: number[] = [];
  for (let m = 0; m < 60; m += Math.max(1, minuteStep)) minutes.push(m);
  if (parsed && !minutes.includes(parsed.m)) {
    minutes.push(parsed.m);
    minutes.sort((a, b) => a - b);
  }

  const emit = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);
  const selectHour = (h: number) => emit(h, parsed?.m ?? 0);
  const selectMinute = (m: number) => emit(parsed?.h ?? 0, m);

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div
        ref={inputRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        id={inputId}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative flex w-full cursor-pointer items-center rounded-lg border border-[var(--border)] bg-white text-[var(--text)] transition-colors duration-200',
          'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
          error && 'border-error focus:border-error focus:ring-error/20',
          disabled && 'cursor-not-allowed bg-[var(--bg-secondary)] opacity-60',
          sizeStyles[inputSize],
          leftIcon && 'pl-10',
          className,
        )}
      >
        {leftIcon && (
          <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]">
            {leftIcon}
          </div>
        )}
        <span className={cn('flex-1 truncate', !displayValue && 'text-[var(--text-muted)]')}>
          {displayValue || placeholder || 'Select time'}
        </span>
        <Clock className="ml-2 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      </div>

      {helperText && !error && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{helperText}</p>
      )}
      {error && <p className="text-error mt-1 text-xs">{error}</p>}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && pos && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  minWidth: Math.max(pos.width, 200),
                  zIndex: 9999,
                }}
                className="rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg"
              >
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="mb-1 px-1 text-[11px] font-medium text-[var(--text-muted)]">
                      Hour
                    </p>
                    <div className="max-h-48 overflow-y-auto pr-1" data-lenis-prevent>
                      {hours.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => selectHour(h)}
                          className={cn(
                            'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
                            parsed?.h === h
                              ? 'bg-primary text-white'
                              : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          {pad(h)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 px-1 text-[11px] font-medium text-[var(--text-muted)]">
                      Minute
                    </p>
                    <div className="max-h-48 overflow-y-auto pr-1" data-lenis-prevent>
                      {minutes.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => selectMinute(m)}
                          className={cn(
                            'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
                            parsed?.m === m
                              ? 'bg-primary text-white'
                              : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          {pad(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
