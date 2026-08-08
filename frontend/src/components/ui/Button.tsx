'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-dark shadow-sm',
        secondary:
          'bg-[var(--bg-tertiary)] text-[var(--text)] hover:bg-[var(--border)] active:bg-[var(--border-hover)]',
        outline:
          'border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-tertiary)]',
        ghost:
          'bg-transparent text-[var(--text)] hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-tertiary)]',
        destructive: 'bg-error text-white hover:bg-error-dark active:bg-[#B91C1C] shadow-sm',
        link: 'bg-transparent text-primary hover:text-primary-hover underline-offset-4 hover:underline p-0 h-auto',
        highlight:
          'bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-dark shadow-sm',
      },
      size: {
        sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
        md: 'h-10 px-4 text-sm gap-2 rounded-lg',
        lg: 'h-12 px-6 text-base gap-2.5 rounded-lg',
        icon: 'h-10 w-10',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  tooltip?: string;
  tooltipPosition?: TooltipPosition;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      disabled,
      children,
      tooltip,
      tooltipPosition = 'auto',
      ...props
    },
    ref,
  ) => {
    const button = (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !isLoading && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );

    if (!tooltip) return button;

    return (
      <Tooltip content={tooltip} position={tooltipPosition}>
        {button}
      </Tooltip>
    );
  },
);

Button.displayName = 'Button';

export default Button;
