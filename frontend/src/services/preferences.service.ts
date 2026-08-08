import api from '@/lib/api';
import { API } from '@/constants/api';

interface BackendEnvelope<T> {
  status?: string;
  success?: boolean;
  data: T;
}

/** Persisted sidebar layout preferences (per-user, cross-device). */
export interface SidebarPreferences {
  /** Pinned nav hrefs, in display order. */
  pins?: string[];
  /** Open section labels per role: `{ SUPER_ADMIN: ['WhatsApp', ...] }`. */
  expanded?: Record<string, string[]>;
  /** Whether the desktop rail is collapsed to icons. */
  collapsed?: boolean;
}

/** The full client-managed UI-preferences blob (room to grow beyond the sidebar). */
export interface UiPreferences {
  sidebar?: SidebarPreferences;
}

export const preferencesService = {
  async get(): Promise<UiPreferences> {
    const { data } = await api.get<BackendEnvelope<{ uiPreferences: UiPreferences }>>(
      API.AUTH.UI_PREFERENCES,
    );
    return data.data?.uiPreferences ?? {};
  },

  /** Shallow-merges the patch onto the stored blob server-side; returns the merged result. */
  async update(patch: UiPreferences): Promise<UiPreferences> {
    const { data } = await api.put<BackendEnvelope<{ uiPreferences: UiPreferences }>>(
      API.AUTH.UI_PREFERENCES,
      patch,
    );
    return data.data?.uiPreferences ?? {};
  },
};

export default preferencesService;
