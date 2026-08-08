export type VerificationType = 'GST' | 'EMPLOYMENT' | 'IDENTITY';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REQUESTED_CHANGES';
export type VerificationPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export interface VerificationRequest {
  id: string;
  userId: string;
  type: VerificationType;
  status: VerificationStatus;
  documentUrl: string | null;
  /**
   * Set by the server when a document EXISTS but this reviewer lacks
   * `verifications.documents.view`. Distinguishes "no attachment" from
   * "attachment withheld" — without it a redacted row was indistinguishable
   * from a submission with nothing attached.
   */
  documentRedacted?: boolean;
  data: Record<string, unknown> | null;
  reviewedBy: string | null;
  adminComments: string | null;
  reviewedAt: string | null;
  escalatedAt: string | null;
  escalatedBy: string | null;
  escalationReason: string | null;
  priority: VerificationPriority;
  slaDeadline: string | null;
  approvalChain: Array<{
    level: number;
    approverId: string;
    approvedAt?: string;
    comments?: string;
  }> | null;
  currentApprovalLevel: number | null;
  autoEscalated: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar?: string | null;
    role?: string;
    companyProfile?: { companyName: string; gstNumber?: string | null } | null;
  };
  reviewer?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface CreateVerificationRequest {
  type: VerificationType;
  data?: Record<string, unknown>;
}

export interface ReviewVerificationRequest {
  status: VerificationStatus;
  comments?: string;
}

export interface EscalateVerificationRequest {
  reason: string;
}

export interface VerificationStats {
  pending: number;
  approved: number;
  rejected: number;
  requestedChanges: number;
  total: number;
}

export interface VerificationFilters {
  type?: VerificationType;
  status?: VerificationStatus;
  priority?: VerificationPriority;
  page?: number;
  limit?: number;
}
