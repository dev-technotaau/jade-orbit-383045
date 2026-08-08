'use client';

import { useState } from 'react';
import { cn, getInitials } from '@/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  firstName?: string | null;
  lastName?: string | null;
  size?: AvatarSize;
  className?: string;
}

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]' },
  sm: { container: 'h-8 w-8', text: 'text-xs' },
  md: { container: 'h-10 w-10', text: 'text-sm' },
  lg: { container: 'h-12 w-12', text: 'text-base' },
  xl: { container: 'h-16 w-16', text: 'text-lg' },
};

function Avatar({ src, alt, firstName, lastName, size = 'md', className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(firstName, lastName);
  const showImage = src && !imgError;
  const sizeStyle = sizeMap[size];

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-light)]',
        sizeStyle.container,
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || `${firstName || ''} ${lastName || ''}`.trim() || 'Avatar'}
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={cn('text-primary font-semibold select-none', sizeStyle.text)}>
          {initials}
        </span>
      )}
    </div>
  );
}

Avatar.displayName = 'Avatar';

export default Avatar;
