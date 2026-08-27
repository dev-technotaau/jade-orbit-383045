'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { WA_FORMATS, applyWaFormat } from '@/lib/wa-format';

interface FormattedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  id?: string;
  className?: string;
}

/**
 * A textarea with a WhatsApp-style formatting toolbar (bold/italic/strikethrough/
 * monospace). The markers are plain text — WhatsApp renders them on the
 * recipient's device — so this works for any send/auto-reply field. Shared by
 * the welcome/away, keyword-reply, saved-reply and FAQ-answer editors.
 */
export default function FormattedTextarea({
  value,
  onChange,
  label,
  placeholder,
  rows = 4,
  maxLength,
  id,
  className,
}: FormattedTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Shared with the inbox composer (`lib/wa-format.ts`) rather than kept as a
  // private copy — which is also how this field gained the toggle: pressing Bold
  // twice now removes the markers instead of producing `**text**`, which
  // WhatsApp renders as a literal asterisk either side of bold text.
  const applyFormat = (marker: string) => {
    const el = ref.current;
    if (!el) return;
    const r = applyWaFormat(value, el.selectionStart, el.selectionEnd, marker);
    if (maxLength != null && r.value.length > maxLength) return;
    onChange(r.value);
    // Restore focus + selection after React re-renders the controlled value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.selectionStart, r.selectionEnd);
    });
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-[var(--text)]">
          {label}
        </label>
      )}
      <div className="overflow-hidden rounded-lg border border-[var(--border)] focus-within:border-[var(--primary)]">
        <div className="flex items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-1">
          {WA_FORMATS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-label={f.label}
              onClick={() => applyFormat(f.marker)}
              className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)]"
            >
              <f.icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <span className="ml-auto pr-1 text-[10px] text-[var(--text-muted)]">
            WhatsApp formatting
          </span>
        </div>
        <textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className={cn(
            'block w-full resize-none bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none',
          )}
        />
      </div>
      {maxLength != null && (
        <p className="mt-0.5 text-right text-[10px] text-[var(--text-muted)]">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}
