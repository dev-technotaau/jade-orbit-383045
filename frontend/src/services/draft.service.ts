import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { FormDraft, FormDraftType } from '@/types/draft';

export const draftService = {
  async saveDraft(data: {
    formType: FormDraftType;
    data: Record<string, unknown>;
    name?: string;
  }): Promise<ApiResponse<FormDraft>> {
    const res = await api.post(API.DRAFTS.SAVE, data);
    return res.data;
  },

  async getDrafts(formType?: FormDraftType): Promise<PaginatedResponse<FormDraft>> {
    const qs = buildQueryString({ formType });
    const res = await api.get(`${API.DRAFTS.LIST}${qs}`);
    return res.data;
  },

  async getDraft(id: string): Promise<ApiResponse<FormDraft>> {
    const res = await api.get(API.DRAFTS.DETAIL(id));
    return res.data;
  },

  async deleteDraft(id: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.DRAFTS.DELETE(id));
    return res.data;
  },
};
