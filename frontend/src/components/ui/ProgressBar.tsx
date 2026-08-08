'use client';

import { cn } from '@/lib/utils';

type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressColor = 'primary' | 'success' | 'warning' | 'error' | 'secondary' | 'accent';

interface ProgressBarProps {
  value: number;
  size?: ProgressSize;
  color?: ProgressColor;
  showLabel?: boolean;
  className?: string;
}

const sizeStyles: Record<ProgressSize, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const colorStyles: Record<ProgressColor, string> = {
  primary: 'bg-primary',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  error: 'bg-[var(--error)]',
  secondary: 'bg-secondary',
  accent: 'bg-accent',
};

function ProgressBar({
  value,
  size = 'md',
  color = 'primary',
  showLabel = false,
  className,
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text)]">Progress</span>
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]',
          sizeStyles[size],
        )}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            colorStyles[color],
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}

ProgressBar.displayName = 'ProgressBar';

export default ProgressBar;
