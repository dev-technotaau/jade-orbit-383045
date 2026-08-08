import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type {
  SavedSearch,
  CreateSavedSearchRequest,
  UpdateSavedSearchRequest,
} from '@/types/saved-search';

export const savedSearchService = {
  async create(data: CreateSavedSearchRequest): Promise<ApiResponse<SavedSearch>> {
    const res = await api.post(API.SAVED_SEARCHES.CREATE, data);
    const body = res.data;
    return { ...body, data: body.data?.savedSearch ?? body.data };
  },

  async list(searchType?: string): Promise<ApiResponse<SavedSearch[]>> {
    const qs = searchType ? `?searchType=${searchType}` : '';
    const res = await api.get(`${API.SAVED_SEARCHES.LIST}${qs}`);
    const body = res.data;
    return { ...body, data: body.data?.savedSearches ?? body.data };
  },

  async update(id: string, data: UpdateSavedSearchRequest): Promise<ApiResponse<SavedSearch>> {
    const res = await api.put(API.SAVED_SEARCHES.UPDATE(id), data);
    const body = res.data;
    return { ...body, data: body.data?.savedSearch ?? body.data };
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const res = await api.delete(API.SAVED_SEARCHES.DELETE(id));
    return res.data;
  },
};
