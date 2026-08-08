import api from '@/lib/api';
import type { Invoice, InvoicesListResponse, InvoiceStatus } from '@/types/invoice';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export const invoiceService = {
  async list(
    args: { page?: number; limit?: number; status?: InvoiceStatus } = {},
  ): Promise<InvoicesListResponse> {
    const { data } = await api.get<BackendEnvelope<InvoicesListResponse>>('/billing/invoices', {
      params: args,
    });
    return data.data;
  },

  async get(id: string): Promise<Invoice> {
    const { data } = await api.get<BackendEnvelope<Invoice>>(
      `/billing/invoices/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  /**
   * Build the BFF-proxied PDF download URL. The backend redirects 302 to
   * the R2 signed URL — `<a href>` works straight away.
   */
  pdfUrl(id: string): string {
    return `/api/proxy/billing/invoices/${encodeURIComponent(id)}/pdf`;
  },
};

export default invoiceService;
