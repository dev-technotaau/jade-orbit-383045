import api from '@/lib/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse } from '@/types/api';

export interface CandidateList {
  id: string;
  employerId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
  };
}

export interface CandidateListMember {
  id: string;
  listId: string;
  candidateId: string;
  addedAt: string;
  notes?: string | null;
  addedByUserId: string;
  candidate?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string | null;
    candidateProfile?: {
      headline?: string | null;
      currentRole?: string | null;
      currentCompany?: string | null;
      currentLocation?: string | null;
      experienceYears?: number | null;
      skills?: string[];
      expectedSalaryMin?: number | null;
      expectedSalaryMax?: number | null;
      salaryCurrency?: string | null;
      noticePeriod?: string | null;
    } | null;
  };
  addedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateListInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  isDefault?: boolean;
}

export interface AddCandidatesInput {
  candidateIds: string[];
  notes?: string;
}

export const candidateListService = {
  async getLists(): Promise<ApiResponse<CandidateList[]>> {
    const res = await api.get('/candidate-lists');
    return res.data;
  },

  async getList(
    listId: string,
    page = 1,
    limit = 20,
  ): Promise<
    ApiResponse<
      CandidateList & {
        members: CandidateListMember[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasMore: boolean;
        };
      }
    >
  > {
    const qs = buildQueryString({ page, limit });
    const res = await api.get(`/candidate-lists/${listId}${qs}`);
    return res.data;
  },

  async createList(data: CreateListInput): Promise<ApiResponse<CandidateList>> {
    const res = await api.post('/candidate-lists', data);
    return res.data;
  },

  async updateList(listId: string, data: UpdateListInput): Promise<ApiResponse<CandidateList>> {
    const res = await api.put(`/candidate-lists/${listId}`, data);
    return res.data;
  },

  async deleteList(listId: string): Promise<ApiResponse<{ message: string }>> {
    const res = await api.delete(`/candidate-lists/${listId}`);
    return res.data;
  },

  async addCandidates(
    listId: string,
    data: AddCandidatesInput,
  ): Promise<ApiResponse<{ message: string; totalMembers: number }>> {
    const res = await api.post(`/candidate-lists/${listId}/candidates`, data);
    return res.data;
  },

  async removeCandidateFromList(
    listId: string,
    candidateId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const res = await api.delete(`/candidate-lists/${listId}/candidates/${candidateId}`);
    return res.data;
  },

  async updateMemberNotes(
    listId: string,
    candidateId: string,
    notes: string,
  ): Promise<ApiResponse<CandidateListMember>> {
    const res = await api.patch(`/candidate-lists/${listId}/candidates/${candidateId}/notes`, {
      notes,
    });
    return res.data;
  },
};
