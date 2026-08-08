import api from '@/lib/api';
import type {
  CreatedOrderResponse,
  CreateOrderRequest,
  OrderDetail,
  OrderListItem,
  OrdersListResponse,
  OrderStatus,
  VerifyOrderRequest,
} from '@/types/order';

interface BackendEnvelope<T> {
  success?: boolean;
  status?: string;
  message?: string;
  data: T;
}

/**
 * Build a fresh idempotency key for each checkout attempt. The user can
 * retry by reloading the page — a fresh key produces a new order.
 */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `chk_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export const orderService = {
  /** Create order — backend creates Razorpay order + persists local row. */
  async create(input: CreateOrderRequest): Promise<CreatedOrderResponse> {
    const idemKey = generateIdempotencyKey();
    const { data } = await api.post<BackendEnvelope<CreatedOrderResponse>>(
      '/billing/orders',
      input,
      {
        headers: { 'Idempotency-Key': idemKey },
      },
    );
    return data.data;
  },

  /** Verify Razorpay signature post-checkout. */
  async verify(
    orderId: string,
    body: VerifyOrderRequest,
  ): Promise<{ orderId: string; status: OrderStatus }> {
    const { data } = await api.post<BackendEnvelope<{ orderId: string; status: OrderStatus }>>(
      `/billing/orders/${encodeURIComponent(orderId)}/verify`,
      body,
    );
    return data.data;
  },

  /** Fetch the authed user's orders. */
  async list(
    args: { page?: number; limit?: number; status?: OrderStatus } = {},
  ): Promise<OrdersListResponse> {
    const { data } = await api.get<BackendEnvelope<OrdersListResponse>>('/billing/orders', {
      params: args,
    });
    return data.data;
  },

  /** Fetch one order with payments + refunds + invoices. */
  async get(id: string): Promise<OrderDetail> {
    const { data } = await api.get<BackendEnvelope<OrderDetail>>(
      `/billing/orders/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  /** Cancel a pending order (CREATED / ATTEMPTED only). */
  async cancel(id: string): Promise<{ id: string; status: OrderStatus }> {
    const { data } = await api.post<BackendEnvelope<{ id: string; status: OrderStatus }>>(
      `/billing/orders/${encodeURIComponent(id)}/cancel`,
    );
    return data.data;
  },

  /**
   * Retry a previously-failed order — backend reuses the existing Razorpay
   * order if still valid, otherwise creates a fresh one. Returns the same
   * shape as `create()`.
   */
  async retry(id: string): Promise<{
    order: Pick<
      OrderDetail,
      'id' | 'status' | 'quantity' | 'totalPaise' | 'currency' | 'receiptNumber' | 'expiresAt'
    >;
    razorpay: { keyId: string; orderId: string; amount: number; currency: string; receipt: string };
    reused: boolean;
  }> {
    const { data } = await api.post<
      BackendEnvelope<{
        order: Pick<
          OrderDetail,
          'id' | 'status' | 'quantity' | 'totalPaise' | 'currency' | 'receiptNumber' | 'expiresAt'
        >;
        razorpay: {
          keyId: string;
          orderId: string;
          amount: number;
          currency: string;
          receipt: string;
        };
        reused: boolean;
      }>
    >(`/billing/orders/${encodeURIComponent(id)}/retry`);
    return data.data;
  },
};

export type { OrderListItem, OrderDetail };
export default orderService;
