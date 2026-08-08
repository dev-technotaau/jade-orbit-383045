'use client';

import Link from 'next/link';
import { Bell, CheckCheck, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications';
import { ROUTES } from '@/constants/routes';
import { formatRelativeDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import type { Notification, NotificationType } from '@/types/notification';

const typeIcons: Record<NotificationType, typeof Info> = {
  INFO: Info,
  SUCCESS: CheckCircle,
  WARNING: AlertTriangle,
  ERROR: XCircle,
};

const typeColors: Record<NotificationType, string> = {
  INFO: 'text-[var(--info)]',
  SUCCESS: 'text-[var(--success)]',
  WARNING: 'text-[var(--warning)]',
  ERROR: 'text-[var(--error)]',
};

interface NotificationDropdownProps {
  onClose: () => void;
  placement?: 'top' | 'bottom';
}

export default function NotificationDropdown({
  onClose,
  placement = 'bottom',
}: NotificationDropdownProps) {
  const { data, isLoading } = useNotifications({ limit: 8 });
  const markRead = useMarkAsRead();
  const markAll = useMarkAllAsRead();

  const notifications = data?.data?.items || [];

  const handleClick = (notification: Notification) => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    onClose();
  };

  return (
    <div
      className={cn(
        'animate-scale-in absolute right-0 z-50 w-80 rounded-xl border border-[var(--border)] bg-white shadow-lg sm:w-96',
        placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="font-semibold text-[var(--text)]">Notifications</h3>
        {notifications.some((n) => !n.isRead) && (
          <Tooltip content="Mark all notifications as read">
            <button
              onClick={() => markAll.mutate()}
              className="text-primary flex items-center gap-1 text-xs hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </Tooltip>
        )}
      </div>

      <div data-lenis-prevent className="max-h-96 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
            ))}
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((notification) => {
            const Icon = typeIcons[notification.type] || Info;
            const content = (
              <div
                className={cn(
                  'flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]',
                  !notification.isRead && 'bg-primary-light/30',
                )}
                onClick={() => handleClick(notification)}
              >
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', typeColors[notification.type])} />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm',
                      !notification.isRead
                        ? 'font-medium text-[var(--text)]'
                        : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {notification.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {formatRelativeDate(notification.createdAt)}
                  </p>
                </div>
                {!notification.isRead && (
                  <div className="bg-primary mt-2 h-2 w-2 shrink-0 rounded-full" />
                )}
              </div>
            );

            return notification.link ? (
              <Link
                key={notification.id}
                href={notification.link}
                onClick={() => handleClick(notification)}
              >
                {content}
              </Link>
            ) : (
              <div key={notification.id}>{content}</div>
            );
          })
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Bell className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No notifications</p>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-2">
        <Tooltip content="Go to notifications page">
          <Link
            href={ROUTES.NOTIFICATIONS}
            onClick={onClose}
            className="text-primary hover:bg-primary-light block rounded-lg py-2 text-center text-sm font-medium transition-colors"
          >
            View All Notifications
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}
