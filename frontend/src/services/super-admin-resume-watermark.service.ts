import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type {
  WatermarkConfig,
  OnPlatformCandidate,
  OnPlatformResumeType,
  OffPlatformCandidate,
  OffPlatformInput,
  Paginated,
} from '@/types/resume-watermark';

const A = API.SUPER_ADMIN;

export const resumeWatermarkService = {
  // ── watermark config ──
  async getConfig(): Promise<ApiResponse<WatermarkConfig>> {
    return (await api.get(A.RESUME_WM_CONFIG)).data;
  },
  async updateConfig(body: Partial<WatermarkConfig>): Promise<ApiResponse<WatermarkConfig>> {
    return (await api.put(A.RESUME_WM_CONFIG, body)).data;
  },

  // ── on-platform ──
  async listOnPlatform(params: {
    q?: string;
    resumeType?: OnPlatformResumeType;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Paginated<OnPlatformCandidate>>> {
    return (await api.get(A.RESUME_WM_ON_PLATFORM, { params })).data;
  },
  async downloadOnPlatform(userId: string, type: OnPlatformResumeType = 'any'): Promise<Blob> {
    return (
      await api.get(A.RESUME_WM_ON_PLATFORM_DOWNLOAD(userId), {
        params: { type },
        responseType: 'blob',
      })
    ).data;
  },
  async bulkDownloadOnPlatform(body: {
    userIds: string[];
    type?: OnPlatformResumeType;
  }): Promise<Blob> {
    return (await api.post(A.RESUME_WM_ON_PLATFORM_BULK_DOWNLOAD, body, { responseType: 'blob' }))
      .data;
  },

  // ── off-platform ──
  async listOffPlatform(params: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<Paginated<OffPlatformCandidate>>> {
    return (await api.get(A.RESUME_WM_OFF_PLATFORM, { params })).data;
  },
  async getOffPlatform(id: string): Promise<ApiResponse<OffPlatformCandidate>> {
    return (await api.get(A.RESUME_WM_OFF_PLATFORM_ONE(id))).data;
  },
  async createOffPlatform(
    fd: FormData,
  ): Promise<ApiResponse<OffPlatformCandidate | { count: number; ids: string[] }>> {
    return (
      await api.post(A.RESUME_WM_OFF_PLATFORM, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  async addResumes(id: string, fd: FormData): Promise<ApiResponse<OffPlatformCandidate>> {
    return (
      await api.post(A.RESUME_WM_OFF_PLATFORM_RESUMES(id), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  async updateOffPlatform(
    id: string,
    body: OffPlatformInput,
  ): Promise<ApiResponse<OffPlatformCandidate>> {
    return (await api.patch(A.RESUME_WM_OFF_PLATFORM_ONE(id), body)).data;
  },
  async deleteOffPlatform(id: string): Promise<ApiResponse<{ id: string }>> {
    return (await api.delete(A.RESUME_WM_OFF_PLATFORM_ONE(id))).data;
  },
  async deleteResume(id: string, resumeId: string): Promise<ApiResponse<{ id: string }>> {
    return (await api.delete(A.RESUME_WM_OFF_PLATFORM_RESUME(id, resumeId))).data;
  },
  async downloadOffPlatformResume(id: string, resumeId: string): Promise<Blob> {
    return (
      await api.get(A.RESUME_WM_OFF_PLATFORM_RESUME_DOWNLOAD(id, resumeId), {
        responseType: 'blob',
      })
    ).data;
  },
  async bulkDeleteOffPlatform(ids: string[]): Promise<ApiResponse<{ count: number }>> {
    return (await api.post(A.RESUME_WM_OFF_PLATFORM_BULK_DELETE, { ids })).data;
  },
  async bulkDownloadOffPlatform(ids: string[]): Promise<Blob> {
    return (
      await api.post(A.RESUME_WM_OFF_PLATFORM_BULK_DOWNLOAD, { ids }, { responseType: 'blob' })
    ).data;
  },
};
