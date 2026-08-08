'use client';

import { cn } from '@/lib/utils';

type SkeletonVariant = 'line' | 'circle' | 'rect' | 'card' | 'avatar' | 'text';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
  lines?: number;
}

function Skeleton({ variant = 'line', width, height, className, lines = 3 }: SkeletonProps) {
  const baseClass = 'animate-shimmer rounded';

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  switch (variant) {
    case 'circle':
      return (
        <div
          className={cn(baseClass, 'rounded-full', className)}
          style={{ width: style.width || '40px', height: style.height || '40px' }}
        />
      );

    case 'avatar':
      return <div className={cn(baseClass, 'h-10 w-10 rounded-full', className)} />;

    case 'rect':
      return (
        <div
          className={cn(baseClass, 'rounded-lg', className)}
          style={{ width: style.width || '100%', height: style.height || '100px' }}
        />
      );

    case 'card':
      return (
        <div className={cn('space-y-4 rounded-xl border border-[var(--border)] p-6', className)}>
          <div className="flex items-center gap-3">
            <div className={cn(baseClass, 'h-10 w-10 shrink-0 rounded-full')} />
            <div className="flex-1 space-y-2">
              <div className={cn(baseClass, 'h-4 w-1/3 rounded')} />
              <div className={cn(baseClass, 'h-3 w-1/4 rounded')} />
            </div>
          </div>
          <div className="space-y-2">
            <div className={cn(baseClass, 'h-3 w-full rounded')} />
            <div className={cn(baseClass, 'h-3 w-5/6 rounded')} />
            <div className={cn(baseClass, 'h-3 w-2/3 rounded')} />
          </div>
        </div>
      );

    case 'text':
      return (
        <div className={cn('space-y-2.5', className)}>
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(baseClass, 'h-3.5 rounded', i === lines - 1 ? 'w-3/4' : 'w-full')}
            />
          ))}
        </div>
      );

    case 'line':
    default:
      return <div className={cn(baseClass, 'h-4 w-full rounded', className)} style={style} />;
  }
}

Skeleton.displayName = 'Skeleton';

export default Skeleton;
