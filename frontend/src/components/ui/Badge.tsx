'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--success-light)] text-[var(--success-dark)]',
  warning: 'bg-[var(--warning-light)] text-[var(--warning-dark)]',
  error: 'bg-[var(--error-light)] text-[var(--error-dark)]',
  info: 'bg-[var(--info-light)] text-primary',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  secondary: 'bg-[var(--secondary-light)] text-[var(--secondary-dark)]',
  accent: 'bg-[var(--accent-light)] text-[var(--accent-dark)]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

function Badge({ variant = 'neutral', size = 'md', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

Badge.displayName = 'Badge';

export default Badge;
