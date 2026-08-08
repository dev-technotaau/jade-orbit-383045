'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  description?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, description, checked, disabled, id, ...props }, ref) => {
    const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn(className)}>
        <label
          htmlFor={checkboxId}
          className={cn(
            'inline-flex cursor-pointer items-start gap-3',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <div className="relative flex shrink-0 items-center justify-center pt-0.5">
            <input
              ref={ref}
              id={checkboxId}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              className="peer sr-only"
              {...props}
            />
            <div
              className={cn(
                'flex h-[18px] w-[18px] items-center justify-center rounded border border-[var(--border)] bg-white transition-all duration-200',
                'peer-focus-visible:ring-primary/20 peer-focus-visible:border-primary peer-focus-visible:ring-2',
                'peer-checked:border-primary peer-checked:bg-primary',
                error && 'border-error',
                !error && 'hover:border-[var(--border-hover)]',
              )}
            >
              <Check className="h-3.5 w-3.5 text-white transition-opacity" strokeWidth={3} />
            </div>
          </div>
          {(label || description) && (
            <div className="flex flex-col">
              {label && <span className="text-sm font-medium text-[var(--text)]">{label}</span>}
              {description && (
                <span className="text-sm text-[var(--text-muted)]">{description}</span>
              )}
            </div>
          )}
        </label>
        {error && <p className="text-error mt-1 text-sm">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
