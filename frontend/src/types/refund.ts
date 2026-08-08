/**
 * Refund request types — mirrors `backend/src/services/refund-request.service.ts`
 * and the `RefundRequest` Prisma model.
 *
 * A RefundRequest is what a CUSTOMER raises. It never moves money: a
 * super-admin must approve it, and only then does a `Refund` row exist. That
 * separation is why these are distinct types from anything on `Order.refunds`.
 */

import type { PlanCategory } from './billing';
import type { OrderStatus } from './order';

export type RefundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED' | 'CANCELLED';

export interface RefundRequest {
  id: string;
  userId: string;
  orderId: string;
  paymentId: string | null;
  amountPaise: number;
  userReason: string;
  /** Whether the request landed inside the published refund window. */
  withinWindow: boolean;
  status: RefundRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  /** Reviewer's note — shown to the customer on approve and reject alike. */
  reviewNotes: string | null;
  refundId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What `GET /billing/refund-requests` returns — request plus order context. */
export interface RefundRequestWithContext extends RefundRequest {
  order: {
    id: string;
    receiptNumber: string;
    totalPaise: number;
    currency: string;
    status: OrderStatus;
    paidAt: string | null;
    plan: { code: string; name: string; category: PlanCategory };
  };
  refund: {
    id: string;
    status: RefundStatus;
    amountPaise: number;
    processedAt: string | null;
  } | null;
}

/** Advisory pre-flight for the request form. */
export interface RefundEligibility {
  canRequest: boolean;
  blockedReason: string | null;
  refundablePaise: number;
  withinWindow: boolean;
  windowDays: number;
  windowEndsAt: string | null;
  existingRequest: RefundRequest | null;
}

export interface CreateRefundRequestInput {
  orderId: string;
  /** Omit for the full refundable balance. */
  amountPaise?: number;
  userReason: string;
}

/* ---------------- Super-admin ---------------- */

export interface AdminRefundRequestRow extends RefundRequestWithContext {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    mobileNumber?: string | null;
  };
  reviewedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface ReviewRefundRequestInput {
  action: 'APPROVE' | 'REJECT';
  reviewNotes?: string;
  /** Approve for less than requested (partial goodwill). */
  amountPaise?: number;
  speed?: 'normal' | 'optimum';
  /** Required to approve a request raised outside the refund window. */
  bypassWindow?: boolean;
}

export const REFUND_REQUEST_STATUS_LABEL: Record<RefundRequestStatus, string> = {
  PENDING: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  CANCELLED: 'Withdrawn',
};
