'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import Tooltip from './Tooltip';

type TagVariant = 'default' | 'primary' | 'outline' | 'success' | 'secondary' | 'accent';
type TagSize = 'sm' | 'md';

interface TagProps {
  label: string;
  onRemove?: () => void;
  variant?: TagVariant;
  size?: TagSize;
  className?: string;
}

const variantStyles: Record<TagVariant, string> = {
  default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  primary: 'bg-[var(--primary-light)] text-primary',
  outline: 'border border-[var(--border)] bg-transparent text-[var(--text-secondary)]',
  success: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  secondary: 'bg-[var(--secondary-light)] text-[var(--secondary-dark)]',
  accent: 'bg-[var(--accent-light)] text-[var(--accent-dark)]',
};

const sizeStyles: Record<TagSize, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
};

function Tag({ label, onRemove, variant = 'default', size = 'md', className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-medium whitespace-nowrap transition-colors duration-200',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {label}
      {onRemove && (
        <Tooltip content={`Remove ${label}`}>
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors',
              'hover:bg-black/10',
              size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
            )}
            aria-label={`Remove ${label}`}
          >
            <X className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

Tag.displayName = 'Tag';

export default Tag;
