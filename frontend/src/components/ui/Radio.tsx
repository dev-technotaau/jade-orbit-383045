'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'value'
> {
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

const RadioGroup = forwardRef<HTMLInputElement, RadioGroupProps>(
  (
    {
      name,
      options,
      value,
      onChange,
      error,
      disabled,
      className,
      orientation = 'vertical',
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn('w-full', className)}>
        <div
          className={cn(
            'flex gap-3',
            orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
          )}
          role="radiogroup"
        >
          {options.map((option, index) => (
            <label
              key={option.value}
              className={cn(
                'inline-flex cursor-pointer items-start gap-3',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <div className="relative flex shrink-0 items-center justify-center pt-0.5">
                <input
                  ref={index === 0 ? ref : undefined}
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  disabled={disabled}
                  className="peer sr-only"
                  {...props}
                />
                <div
                  className={cn(
                    'flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] bg-white transition-all duration-200',
                    'peer-focus-visible:ring-primary/20 peer-focus-visible:border-primary peer-focus-visible:ring-2',
                    value === option.value && 'border-primary',
                    error && 'border-error',
                    value !== option.value && !error && 'hover:border-[var(--border-hover)]',
                  )}
                >
                  {value === option.value && (
                    <div className="bg-primary h-2.5 w-2.5 rounded-full" />
                  )}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[var(--text)]">{option.label}</span>
                {option.description && (
                  <span className="text-sm text-[var(--text-muted)]">{option.description}</span>
                )}
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-error mt-1 text-sm">{error}</p>}
      </div>
    );
  },
);

RadioGroup.displayName = 'RadioGroup';

export default RadioGroup;
