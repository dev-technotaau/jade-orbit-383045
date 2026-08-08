import api from '@/lib/api';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export type QuoteRequestStatus =
  | 'NEW'
  | 'IN_REVIEW'
  | 'CONTACTED'
  | 'NEGOTIATING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CONVERTED'
  | 'WITHDRAWN';

export type CustomPlanOfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';

export interface SubmitQuoteRequest {
  companyName: string;
  contactPerson: string;
  designation?: string;
  email: string;
  phone: string;
  employeeRange?: string;
  hiringNeed?: string;
  requiredCvCount?: number;
  validityDays?: number;
  expectedSeats?: number;
  currentToolStack?: string;
  budgetRange?: string;
  additionalNotes?: string;
}

export interface CustomPlanOffer {
  id: string;
  status: CustomPlanOfferStatus;
  basePricePaise: number;
  validityDays: number;
  cvUnlocks: number;
  seats: number;
  features: unknown;
  resources: unknown;
  expiresAt: string | null;
  acceptedAt: string | null;
  acceptedOrderId: string | null;
  createdAt: string;
  planId: string | null;
}

export interface MyQuoteRequest {
  id: string;
  status: QuoteRequestStatus;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  requiredCvCount: number | null;
  validityDays: number | null;
  expectedSeats: number | null;
  hiringNeed: string | null;
  currentToolStack: string | null;
  budgetRange: string | null;
  additionalNotes: string | null;
  slaDueAt: string | null;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  offers: CustomPlanOffer[];
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `qte_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `qte_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export const quoteService = {
  async submit(
    input: SubmitQuoteRequest,
    turnstileToken?: string,
  ): Promise<{ id: string; status: QuoteRequestStatus }> {
    const idemKey = generateIdempotencyKey();
    const { data } = await api.post<BackendEnvelope<{ id: string; status: QuoteRequestStatus }>>(
      '/billing/quotes',
      input,
      {
        headers: {
          'Idempotency-Key': idemKey,
          // Same header convention as /auth/login + /auth/register.
          // Backend `verifyTurnstile` reads from either header or body.
          ...(turnstileToken && { 'cf-turnstile-response': turnstileToken }),
        },
      },
    );
    return data.data;
  },

  async list(): Promise<MyQuoteRequest[]> {
    const { data } = await api.get<BackendEnvelope<MyQuoteRequest[]>>('/billing/quotes/me');
    return data.data;
  },

  async get(id: string): Promise<MyQuoteRequest> {
    const { data } = await api.get<BackendEnvelope<MyQuoteRequest>>(
      `/billing/quotes/me/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  async acceptOffer(offerId: string): Promise<{ planCode: string }> {
    const { data } = await api.post<BackendEnvelope<{ planCode: string }>>(
      `/billing/quotes/offers/${encodeURIComponent(offerId)}/accept`,
    );
    return data.data;
  },
};

export default quoteService;
