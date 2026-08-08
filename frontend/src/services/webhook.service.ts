import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  WebhookEndpoint,
  WebhookDelivery,
  CreateWebhookRequest,
  UpdateWebhookRequest,
} from '@/types/webhook';

export const webhookService = {
  async create(data: CreateWebhookRequest): Promise<ApiResponse<WebhookEndpoint>> {
    const res = await api.post(API.WEBHOOKS.BASE, data);
    return res.data;
  },

  async list(): Promise<ApiResponse<PaginatedData<WebhookEndpoint>>> {
    const res = await api.get(API.WEBHOOKS.BASE);
    return res.data;
  },

  async getById(id: string): Promise<ApiResponse<WebhookEndpoint>> {
    const res = await api.get(API.WEBHOOKS.DETAIL(id));
    return res.data;
  },

  async update(id: string, data: UpdateWebhookRequest): Promise<ApiResponse<WebhookEndpoint>> {
    const res = await api.patch(API.WEBHOOKS.DETAIL(id), data);
    return res.data;
  },

  async delete(id: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.WEBHOOKS.DETAIL(id));
    return res.data;
  },

  async getDeliveries(
    id: string,
    page: number = 1,
  ): Promise<ApiResponse<PaginatedData<WebhookDelivery>>> {
    const res = await api.get(API.WEBHOOKS.DELIVERIES(id), { params: { page, limit: 20 } });
    return res.data;
  },

  async test(id: string): Promise<ApiResponse<null>> {
    const res = await api.post(API.WEBHOOKS.TEST(id));
    return res.data;
  },
};
