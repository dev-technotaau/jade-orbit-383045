import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Notification, NotificationFilters, UnreadCount } from '@/types/notification';

export const notificationService = {
  async getNotifications(filters?: NotificationFilters): Promise<PaginatedResponse<Notification>> {
    const qs = buildQueryString(
      (filters || {}) as Record<string, string | number | boolean | undefined>,
    );
    const res = await api.get(`${API.NOTIFICATIONS.LIST}${qs}`);
    return res.data;
  },

  async markAsRead(id: string): Promise<ApiResponse<Notification>> {
    const res = await api.patch(API.NOTIFICATIONS.MARK_READ(id));
    return res.data;
  },

  async markAllAsRead(): Promise<ApiResponse<null>> {
    const res = await api.patch(API.NOTIFICATIONS.MARK_ALL_READ);
    return res.data;
  },

  async getUnreadCount(category?: string): Promise<ApiResponse<UnreadCount>> {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await api.get(`${API.NOTIFICATIONS.UNREAD_COUNT}${qs}`);
    return res.data;
  },
};
