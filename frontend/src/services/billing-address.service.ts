import api from '@/lib/api';

export interface BillingAddress {
  id: string;
  userId: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  stateName: string;
  stateCode: string;
  pincode: string;
  country: string;
  countryCode: string;
  gstNumber: string | null;
  legalName: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingAddressInput {
  label?: string;
  line1: string;
  line2?: string | null;
  city: string;
  stateName: string;
  stateCode: string;
  pincode: string;
  country?: string;
  countryCode?: string;
  gstNumber?: string | null;
  legalName?: string | null;
  isDefault?: boolean;
}

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

/**
 * Billing address CRUD — used at checkout for GST place-of-supply +
 * legal-name capture, and from the user's `/billing/payment-methods` UI
 * (where addresses live alongside saved cards/UPI).
 *
 * All mutations go through the BFF proxy; auth is httpOnly cookie based.
 */
export const billingAddressService = {
  async list(): Promise<BillingAddress[]> {
    const { data } = await api.get<BackendEnvelope<BillingAddress[]>>('/billing/addresses');
    return data.data;
  },

  async get(id: string): Promise<BillingAddress> {
    const { data } = await api.get<BackendEnvelope<BillingAddress>>(
      `/billing/addresses/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  async create(input: BillingAddressInput): Promise<BillingAddress> {
    const { data } = await api.post<BackendEnvelope<BillingAddress>>('/billing/addresses', input);
    return data.data;
  },

  async update(id: string, input: Partial<BillingAddressInput>): Promise<BillingAddress> {
    const { data } = await api.patch<BackendEnvelope<BillingAddress>>(
      `/billing/addresses/${encodeURIComponent(id)}`,
      input,
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/billing/addresses/${encodeURIComponent(id)}`);
  },

  async setDefault(id: string): Promise<BillingAddress> {
    const { data } = await api.post<BackendEnvelope<BillingAddress>>(
      `/billing/addresses/${encodeURIComponent(id)}/default`,
    );
    return data.data;
  },
};

export default billingAddressService;
