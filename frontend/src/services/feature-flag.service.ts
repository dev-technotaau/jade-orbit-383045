import api from '@/lib/api';
import { API } from '@/constants/api';
import type { FeatureFlags } from '@/types/feature-flag';

export const featureFlagService = {
  /** Get public client flags (no auth required) */
  async getClientFlags(): Promise<FeatureFlags> {
    const { data } = await api.get(API.FEATURE_FLAGS.CLIENT);
    return data.data;
  },

  /** Get all flags (admin only) */
  async getAllFlags(): Promise<FeatureFlags> {
    const { data } = await api.get(API.FEATURE_FLAGS.ALL);
    return data.data;
  },
};
