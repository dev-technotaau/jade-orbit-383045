import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';

export const advancedAnalyticsService = {
  async getUserGrowth(
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<Record<string, unknown>[]>> {
    const res = await api.get(API.ADVANCED_ANALYTICS.USER_GROWTH, {
      params: { startDate, endDate },
    });
    return res.data;
  },

  async getApplicationFunnel(
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<Record<string, unknown>[]>> {
    const res = await api.get(API.ADVANCED_ANALYTICS.APPLICATION_FUNNEL, {
      params: { startDate, endDate },
    });
    return res.data;
  },

  async getPopularSkills(limit?: number): Promise<ApiResponse<Record<string, unknown>[]>> {
    const res = await api.get(API.ADVANCED_ANALYTICS.POPULAR_SKILLS, {
      params: { limit },
    });
    return res.data;
  },

  async getSalaryTrends(
    industry?: string,
    location?: string,
  ): Promise<ApiResponse<Record<string, unknown>[]>> {
    const res = await api.get(API.ADVANCED_ANALYTICS.SALARY_TRENDS, {
      params: { industry, location },
    });
    return res.data;
  },

  async getJobTrends(
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<Record<string, unknown>[]>> {
    const res = await api.get(API.ADVANCED_ANALYTICS.JOB_TRENDS, {
      params: { startDate, endDate },
    });
    return res.data;
  },
};
