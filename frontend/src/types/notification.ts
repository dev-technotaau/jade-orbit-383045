export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  category: string | null;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  isRead?: boolean;
  /** Free-string category — drives the per-feature filters (e.g.
   *  "followed_company_new_job", "company_follower"). */
  category?: string;
  page?: number;
  limit?: number;
}

export interface UnreadCount {
  count: number;
}
