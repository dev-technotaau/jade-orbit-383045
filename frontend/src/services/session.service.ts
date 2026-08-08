import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type { Session } from '@/types/auth';

export const sessionService = {
  async listSessions(): Promise<ApiResponse<Session[]>> {
    const res = await api.get(API.SESSIONS.LIST);
    const data = res.data as ApiResponse<Session[]>;
    // Map backend field names to UI-friendly aliases
    const currentSessionId =
      typeof document !== 'undefined'
        ? document.cookie.match(/ha_session_id=([^;]+)/)?.[1] || null
        : null;
    if (data.data) {
      data.data = data.data.map((session) => ({
        ...session,
        deviceInfo: session.userAgent || session.deviceInfo || null,
        lastActive: session.lastSeenAt || session.lastActive || session.createdAt,
        isCurrent: session.id === currentSessionId,
      }));
    }
    return data;
  },

  async revokeSession(id: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.SESSIONS.REVOKE(id));
    return res.data;
  },

  async revokeAllSessions(): Promise<ApiResponse<null>> {
    const res = await api.delete(API.SESSIONS.REVOKE_ALL);
    return res.data;
  },
};
