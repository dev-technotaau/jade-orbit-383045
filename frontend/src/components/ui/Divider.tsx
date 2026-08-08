'use client';

import { cn } from '@/lib/utils';

type DividerOrientation = 'horizontal' | 'vertical';

interface DividerProps {
  orientation?: DividerOrientation;
  label?: string;
  className?: string;
}

function Divider({ orientation = 'horizontal', label, className }: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        className={cn('inline-block h-full w-px bg-[var(--border)]', className)}
        role="separator"
      />
    );
  }

  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)} role="separator">
        <div className="flex-1 border-t border-[var(--border)]" />
        <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
          {label}
        </span>
        <div className="flex-1 border-t border-[var(--border)]" />
      </div>
    );
  }

  return <hr className={cn('border-t border-[var(--border)]', className)} />;
}

Divider.displayName = 'Divider';

export default Divider;
