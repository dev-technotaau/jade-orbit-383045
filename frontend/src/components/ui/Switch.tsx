'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  error?: string;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, error, checked, disabled, id, ...props }, ref) => {
    const switchId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn('w-full', className)}>
        <label
          htmlFor={switchId}
          className={cn(
            'inline-flex cursor-pointer items-center justify-between gap-3',
            label && 'w-full',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {(label || description) && (
            <div className="flex flex-col">
              {label && <span className="text-sm font-medium text-[var(--text)]">{label}</span>}
              {description && (
                <span className="text-sm text-[var(--text-muted)]">{description}</span>
              )}
            </div>
          )}
          <div className="relative shrink-0">
            <input
              ref={ref}
              id={switchId}
              type="checkbox"
              role="switch"
              checked={checked}
              disabled={disabled}
              className="peer sr-only"
              {...props}
            />
            <div
              className={cn(
                'h-6 w-11 rounded-full border-2 border-transparent transition-colors duration-200',
                'peer-focus-visible:ring-primary/20 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
                checked ? 'bg-primary' : 'bg-[var(--border-hover)]',
              )}
            />
            <div
              className={cn(
                'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                checked && 'translate-x-5',
              )}
            />
          </div>
        </label>
        {error && <p className="text-error mt-1 text-sm">{error}</p>}
      </div>
    );
  },
);

Switch.displayName = 'Switch';

export default Switch;
