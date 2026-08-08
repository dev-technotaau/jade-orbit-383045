'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  parse,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  isAfter,
  addMonths,
  subMonths,
  setMonth,
  setYear,
  getYear,
  getMonth,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from './Tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * 'year' renders the picker locked to the years grid and emits a bare
   * 'yyyy' string — used for calendar-year fields (Founded Year, award
   * year) that previously rendered as raw number inputs with native
   * spinners.
   */
  mode?: 'date' | 'month' | 'datetime' | 'year';
  placeholder?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  id?: string;
}

type ViewMode = 'days' | 'months' | 'years';

const sizeStyles = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-3',
  lg: 'h-12 text-base px-4',
};

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseValue(value: string, mode: 'date' | 'month' | 'datetime' | 'year'): Date | null {
  if (!value) return null;
  try {
    // Handle ISO datetime strings from API (e.g. "2024-01-15T00:00:00.000Z")
    if (value.includes('T')) {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (mode === 'year') return parse(value, 'yyyy', new Date());
    if (mode === 'month') return parse(value, 'yyyy-MM', new Date());
    return parse(value, 'yyyy-MM-dd', new Date());
  } catch {
    return null;
  }
}

function formatDisplay(value: string, mode: 'date' | 'month' | 'datetime' | 'year'): string {
  const d = parseValue(value, mode);
  if (!d || isNaN(d.getTime())) return '';
  if (mode === 'year') return format(d, 'yyyy');
  if (mode === 'month') return format(d, 'MMM yyyy');
  if (mode === 'datetime') return format(d, 'dd MMM yyyy, HH:mm');
  return format(d, 'dd MMM yyyy');
}

function isDateDisabled(date: Date, minDate?: Date, maxDate?: Date): boolean {
  if (minDate && isBefore(date, startOfMonth(minDate)) && !isSameDay(date, minDate)) {
    if (isBefore(date, minDate)) return true;
  }
  if (minDate && isBefore(date, minDate)) return true;
  if (maxDate && isAfter(date, maxDate)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DatePicker({
  label,
  value,
  onChange,
  mode = 'date',
  placeholder,
  error,
  helperText,
  leftIcon,
  inputSize = 'md',
  required,
  disabled,
  minDate,
  maxDate,
  className,
  id,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseValue(value, mode) || new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(
    mode === 'year' ? 'years' : mode === 'month' ? 'months' : 'days',
  );
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Time state for datetime mode
  const [timeHour, setTimeHour] = useState(() => {
    const parsed = parseValue(value, mode);
    return parsed ? parsed.getHours() : 12;
  });
  const [timeMinute, setTimeMinute] = useState(() => {
    const parsed = parseValue(value, mode);
    return parsed ? parsed.getMinutes() : 0;
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => parseValue(value, mode));

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  // Sync viewDate and time when value changes externally
  useEffect(() => {
    const parsed = parseValue(value, mode);
    if (parsed && !isNaN(parsed.getTime())) {
      queueMicrotask(() => {
        setViewDate(parsed);
        if (mode === 'datetime') {
          setTimeHour(parsed.getHours());
          setTimeMinute(parsed.getMinutes());
          setSelectedDate(parsed);
        }
      });
    }
  }, [value, mode]);

  // Reset viewMode when opening; also sync selectedDate for datetime mode
  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setViewMode(mode === 'year' ? 'years' : mode === 'month' ? 'months' : 'days');
        if (mode === 'datetime') {
          const parsed = parseValue(value, mode);
          if (parsed) {
            setSelectedDate(parsed);
            setTimeHour(parsed.getHours());
            setTimeMinute(parsed.getMinutes());
          } else {
            setSelectedDate(null);
          }
        }
      });
    }
  }, [isOpen, mode, value]);

  // Position the popover
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popoverHeight = mode === 'datetime' ? 420 : 340;
    const top = spaceBelow >= popoverHeight ? rect.bottom + 4 : rect.top - popoverHeight - 4;
    setPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${rect.left}px`,
      width: `${Math.max(rect.width, 300)}px`,
      zIndex: 9999,
    });
  }, [mode]);

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

  // Close on click outside (must check both container and portal popover)
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

  // Keyboard handler
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

  // Select handlers
  const selectDate = (date: Date) => {
    if (isDateDisabled(date, minDate, maxDate)) return;
    if (mode === 'datetime') {
      // In datetime mode, select date but stay open for time
      setSelectedDate(date);
      return;
    }
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  // Confirm datetime selection (date + time)
  const confirmDateTime = () => {
    const base = selectedDate || new Date();
    const dt = new Date(base);
    dt.setHours(timeHour, timeMinute, 0, 0);
    onChange(format(dt, "yyyy-MM-dd'T'HH:mm"));
    setIsOpen(false);
  };

  const selectMonth = (monthIdx: number) => {
    const newDate = setMonth(viewDate, monthIdx);
    if (mode === 'month') {
      // Check min/max for month mode
      const monthStart = startOfMonth(newDate);
      if (minDate && isBefore(endOfMonth(newDate), minDate)) return;
      if (maxDate && isAfter(monthStart, maxDate)) return;
      onChange(format(newDate, 'yyyy-MM'));
      setIsOpen(false);
    } else {
      setViewDate(newDate);
      setViewMode('days');
    }
  };

  const selectYear = (year: number) => {
    if (mode === 'year') {
      // Year mode emits the bare year and closes — there's no month/day
      // drill-down to continue into.
      onChange(String(year));
      setIsOpen(false);
      return;
    }
    setViewDate(setYear(viewDate, year));
    setViewMode('months');
  };

  const selectToday = () => {
    const today = new Date();
    if (mode === 'year') {
      onChange(format(today, 'yyyy'));
      setIsOpen(false);
    } else if (mode === 'month') {
      onChange(format(today, 'yyyy-MM'));
      setIsOpen(false);
    } else if (mode === 'datetime') {
      setSelectedDate(today);
      setTimeHour(today.getHours());
      setTimeMinute(today.getMinutes());
      // Stay open so user can adjust time or confirm
    } else {
      onChange(format(today, 'yyyy-MM-dd'));
      setIsOpen(false);
    }
  };

  // Calendar grid
  const renderDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const selected = mode === 'datetime' ? selectedDate : parseValue(value, mode);

    return (
      <>
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <Tooltip content="Previous month">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={() => setViewMode('months')}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {format(viewDate, 'MMMM yyyy')}
          </button>
          <Tooltip content="Next month">
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* Day labels */}
        <div className="mb-1 grid grid-cols-7 gap-0">
          {DAY_LABELS.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-[var(--text-muted)]">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0">
          {days.map((day) => {
            const inMonth = isSameMonth(day, viewDate);
            const isSelected = selected && isSameDay(day, selected);
            const today = isToday(day);
            const isDisabled = isDateDisabled(day, minDate, maxDate);

            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={isDisabled}
                onClick={() => selectDate(day)}
                className={cn(
                  'relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors',
                  !inMonth && 'text-[var(--text-muted)] opacity-40',
                  inMonth &&
                    !isSelected &&
                    !isDisabled &&
                    'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                  isSelected && 'bg-primary font-semibold text-white',
                  today && !isSelected && 'ring-primary/30 font-bold ring-2',
                  isDisabled && 'cursor-not-allowed opacity-30',
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Month grid
  const renderMonths = () => {
    const selected = parseValue(value, mode);
    const selectedMonth = selected ? getMonth(selected) : -1;
    const selectedYear = selected ? getYear(selected) : -1;
    const currentYear = getYear(viewDate);

    return (
      <>
        <div className="mb-3 flex items-center justify-between">
          <Tooltip content="Previous year">
            <button
              type="button"
              onClick={() => setViewDate(setYear(viewDate, currentYear - 1))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={() => setViewMode('years')}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {currentYear}
          </button>
          <Tooltip content="Next year">
            <button
              type="button"
              onClick={() => setViewDate(setYear(viewDate, currentYear + 1))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTH_LABELS.map((m, i) => {
            const isSelected = currentYear === selectedYear && i === selectedMonth;
            const monthDate = setMonth(setYear(new Date(), currentYear), i);
            const isDisabled =
              (minDate && isAfter(minDate, endOfMonth(monthDate))) ||
              (maxDate && isBefore(maxDate, startOfMonth(monthDate)));

            return (
              <button
                key={m}
                type="button"
                disabled={!!isDisabled}
                onClick={() => selectMonth(i)}
                className={cn(
                  'rounded-lg py-2 text-sm transition-colors',
                  isSelected && 'bg-primary font-semibold text-white',
                  !isSelected && !isDisabled && 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                  isDisabled && 'cursor-not-allowed opacity-30',
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Year grid
  const renderYears = () => {
    const currentYear = getYear(viewDate);
    const startYear = currentYear - 6;
    const years = Array.from({ length: 12 }, (_, i) => startYear + i);
    const selected = parseValue(value, mode);
    const selectedYear = selected ? getYear(selected) : -1;

    return (
      <>
        <div className="mb-3 flex items-center justify-between">
          <Tooltip content="Previous years">
            <button
              type="button"
              onClick={() => setViewDate(setYear(viewDate, currentYear - 12))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>
          <span className="text-sm font-semibold text-[var(--text)]">
            {startYear} &ndash; {startYear + 11}
          </span>
          <Tooltip content="Next years">
            <button
              type="button"
              onClick={() => setViewDate(setYear(viewDate, currentYear + 12))}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {years.map((y) => {
            const isSelected = y === selectedYear;
            const isCurrent = y === new Date().getFullYear();
            const isDisabled =
              (minDate && y < getYear(minDate)) || (maxDate && y > getYear(maxDate));

            return (
              <button
                key={y}
                type="button"
                disabled={!!isDisabled}
                onClick={() => selectYear(y)}
                className={cn(
                  'rounded-lg py-2 text-sm transition-colors',
                  isSelected && 'bg-primary font-semibold text-white',
                  !isSelected && isCurrent && 'ring-primary/30 font-bold ring-2',
                  !isSelected && !isDisabled && 'text-[var(--text)] hover:bg-[var(--bg-secondary)]',
                  isDisabled && 'cursor-not-allowed opacity-30',
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Time picker for datetime mode
  const renderTimePicker = () => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      <div className="mt-2 border-t border-[var(--border)] pt-2">
        <div className="flex items-center justify-center gap-1">
          <Clock className="mr-1.5 h-4 w-4 text-[var(--text-muted)]" />
          {/* Hour */}
          <div className="flex flex-col items-center">
            <Tooltip content="Increase hour">
              <button
                type="button"
                onClick={() => setTimeHour((h) => (h + 1) % 24)}
                className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <span className="w-8 text-center text-lg font-semibold text-[var(--text)] tabular-nums">
              {pad(timeHour)}
            </span>
            <Tooltip content="Decrease hour">
              <button
                type="button"
                onClick={() => setTimeHour((h) => (h - 1 + 24) % 24)}
                className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
          <span className="text-lg font-semibold text-[var(--text)]">:</span>
          {/* Minute */}
          <div className="flex flex-col items-center">
            <Tooltip content="Increase minute">
              <button
                type="button"
                onClick={() => setTimeMinute((m) => (m + 1) % 60)}
                className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <span className="w-8 text-center text-lg font-semibold text-[var(--text)] tabular-nums">
              {pad(timeMinute)}
            </span>
            <Tooltip content="Decrease minute">
              <button
                type="button"
                onClick={() => setTimeMinute((m) => (m - 1 + 60) % 60)}
                className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>
        {selectedDate && (
          <p className="mt-1 text-center text-[10px] text-[var(--text-muted)]">
            {format(selectedDate, 'dd MMM yyyy')} at {pad(timeHour)}:{pad(timeMinute)}
          </p>
        )}
      </div>
    );
  };

  // Popover content
  const popover =
    isOpen &&
    typeof window !== 'undefined' &&
    createPortal(
      <AnimatePresence>
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          style={popoverStyle}
          className="rounded-xl border border-[var(--border)] bg-white p-3 shadow-lg"
        >
          {viewMode === 'days' && renderDays()}
          {viewMode === 'months' && renderMonths()}
          {viewMode === 'years' && renderYears()}

          {/* Time picker for datetime mode */}
          {mode === 'datetime' && viewMode === 'days' && renderTimePicker()}

          {/* Footer */}
          <div className="mt-2 border-t border-[var(--border)] pt-2">
            {mode === 'datetime' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectToday}
                  className="flex-1 rounded-lg py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={confirmDateTime}
                  disabled={!selectedDate}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors',
                    selectedDate
                      ? 'bg-primary hover:bg-primary/90 text-white'
                      : 'cursor-not-allowed bg-[var(--bg-secondary)] text-[var(--text-muted)]',
                  )}
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={selectToday}
                className="text-primary hover:bg-primary-light w-full rounded-lg py-1.5 text-xs font-medium transition-colors"
              >
                {mode === 'year' ? 'This Year' : mode === 'month' ? 'This Month' : 'Today'}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>,
      document.body,
    );

  const displayValue = formatDisplay(value, mode);
  const defaultPlaceholder =
    mode === 'year'
      ? 'Select year'
      : mode === 'month'
        ? 'Select month'
        : mode === 'datetime'
          ? 'Select date & time'
          : 'Select date';

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
          'disabled:cursor-not-allowed disabled:bg-[var(--bg-secondary)] disabled:opacity-60',
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
          {displayValue || placeholder || defaultPlaceholder}
        </span>
        <Calendar className="ml-2 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      </div>

      {error && <p className="text-error mt-1 text-sm">{error}</p>}
      {helperText && !error && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{helperText}</p>
      )}

      {popover}
    </div>
  );
}
