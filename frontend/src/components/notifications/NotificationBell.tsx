'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/hooks/use-notifications';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';
import NotificationDropdown from './NotificationDropdown';
import Tooltip from '@/components/ui/Tooltip';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useUnreadCount();
  const count = data?.data?.count || 0;
  // NotificationDropdown is tall — header + up to 8 items + footer ≈ 500px.
  const placement = usePopoverPlacement(ref, open, 500);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <Tooltip content="View notifications">
        <button
          onClick={() => setOpen(!open)}
          className="relative rounded-lg p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              role="status"
              aria-label={`${count} unread notification${count === 1 ? '' : 's'}`}
              className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--error)] px-1 text-xs font-medium text-white"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </Tooltip>

      {open && <NotificationDropdown onClose={() => setOpen(false)} placement={placement} />}
    </div>
  );
}
