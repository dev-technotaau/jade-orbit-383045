import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';

export const contactService = {
  async submitMessage(data: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<ApiResponse<{ id: string }>> {
    const res = await api.post(API.CONTACT.SUBMIT, data);
    return res.data;
  },
};
