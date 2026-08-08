import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type { JobTemplate } from '@/types/job';

export const jobTemplateService = {
  async getTemplates(): Promise<ApiResponse<JobTemplate[]>> {
    const res = await api.get(API.JOB_TEMPLATES.LIST);
    return res.data;
  },

  async createTemplate(data: {
    name: string;
    description?: string;
    templateData: Record<string, unknown>;
  }): Promise<ApiResponse<JobTemplate>> {
    const res = await api.post(API.JOB_TEMPLATES.CREATE, data);
    return res.data;
  },

  async updateTemplate(
    id: string,
    data: { name?: string; description?: string; templateData?: Record<string, unknown> },
  ): Promise<ApiResponse<JobTemplate>> {
    const res = await api.put(API.JOB_TEMPLATES.UPDATE(id), data);
    return res.data;
  },

  async deleteTemplate(id: string): Promise<ApiResponse<void>> {
    const res = await api.delete(API.JOB_TEMPLATES.DELETE(id));
    return res.data;
  },
};
