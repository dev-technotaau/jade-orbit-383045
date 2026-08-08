import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface BackendEnvelope<T> {
  success?: boolean;
  status?: string;
  message?: string;
  data: T;
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  totalPaise: number;
  currency: string;
  issuedAt: string | null;
  pdfUrl: string | null;
}

export function useMyInvoices(args: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['my-invoices', args],
    queryFn: async () => {
      const { data } = await api.get<BackendEnvelope<{ items: InvoiceListItem[]; total: number }>>(
        '/billing/invoices',
        { params: args },
      );
      return data?.data ?? { items: [], total: 0 };
    },
    staleTime: 30_000,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['my-invoice', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await api.get<BackendEnvelope<InvoiceListItem>>(
        `/billing/invoices/${encodeURIComponent(id)}`,
      );
      return data?.data ?? null;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
