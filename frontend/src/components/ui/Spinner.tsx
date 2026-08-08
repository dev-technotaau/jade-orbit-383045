'use client';

import { cn } from '@/lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'border-primary/30 border-t-primary animate-spin rounded-full',
        sizeStyles[size],
        className,
      )}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

Spinner.displayName = 'Spinner';

export default Spinner;
