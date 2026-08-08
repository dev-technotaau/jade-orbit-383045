import { useQuery } from '@tanstack/react-query';
import { orderService } from '@/services/order.service';
import type { OrderStatus } from '@/types/order';

export function useMyOrders(args: { page?: number; limit?: number; status?: OrderStatus } = {}) {
  return useQuery({
    queryKey: ['my-orders', args],
    queryFn: () => orderService.list(args),
    staleTime: 30_000,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['my-order', id],
    queryFn: () => (id ? orderService.get(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
