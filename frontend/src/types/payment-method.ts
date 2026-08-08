export type PaymentMethodTokenType = 'CARD' | 'VPA' | 'NETBANKING' | 'EMI';
export type PaymentMethodTokenStatus = 'ACTIVE' | 'REMOVED' | 'EXPIRED';

export interface PaymentMethodToken {
  id: string;
  userId: string;
  type: PaymentMethodTokenType;
  razorpayTokenId: string;
  last4: string | null;
  network: string | null;
  vpaHandle: string | null;
  bankCode: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  status: PaymentMethodTokenStatus;
  createdAt: string;
  updatedAt: string;
}
