'use client';

import { usePresence } from '@/hooks/use-presence';
import Tooltip from '@/components/ui/Tooltip';

function formatLastSeen(date: Date | null): string {
  if (!date) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

interface PresenceIndicatorProps {
  userId: string | null | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function PresenceIndicator({
  userId,
  showLabel = false,
  size = 'sm',
}: PresenceIndicatorProps) {
  const { online, lastSeen } = usePresence(userId);

  // Don't render anything if we have no presence data at all
  if (!online && !lastSeen) return null;

  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';

  return (
    <Tooltip content={online ? 'Online' : `Last seen ${formatLastSeen(lastSeen)}`} inline>
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`${dotSize} rounded-full ${
            online
              ? 'bg-[var(--success)] shadow-[0_0_4px_var(--success)]'
              : 'bg-[var(--text-muted)]'
          }`}
        />
        {showLabel && (
          <span className="text-xs text-[var(--text-muted)]">
            {online ? 'Online' : formatLastSeen(lastSeen)}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
