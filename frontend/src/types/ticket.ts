export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_REPLY' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketCategory =
  | 'GENERAL'
  | 'ACCOUNT'
  | 'BILLING'
  | 'TECHNICAL'
  | 'BUG_REPORT'
  | 'FEATURE_REQUEST'
  | 'JOB_POSTING'
  | 'APPLICATION'
  | 'VERIFICATION'
  | 'OTHER';
export type TicketSatisfaction = 'SATISFIED' | 'NEUTRAL' | 'NOT_SATISFIED';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  } | null;
  satisfaction: TicketSatisfaction | null;
  satisfactionComment: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
  _count?: { messages: number };
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string | null;
  senderType: 'USER' | 'ADMIN' | 'SYSTEM' | 'GUEST';
  senderName: string;
  subject?: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface CreateTicketRequest {
  subject: string;
  description: string;
  category?: TicketCategory;
  priority?: TicketPriority;
}

export interface CreateGuestTicketRequest extends CreateTicketRequest {
  name: string;
  email: string;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  awaitingReply: number;
  resolved: number;
  closed: number;
  avgResponseTimeHours: number;
  satisfactionRate: number;
  todayNew: number;
  todayResolved: number;
}

export interface TicketAnalytics {
  byCategory: { category: TicketCategory; count: number }[];
  byStatus: { status: TicketStatus; count: number }[];
  bySatisfaction: { satisfaction: TicketSatisfaction | null; count: number }[];
  dailyVolume: { date: string; created: number; resolved: number }[];
  escalatedTickets: SupportTicket[];
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  AWAITING_REPLY: 'Awaiting Reply',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  GENERAL: 'General',
  ACCOUNT: 'Account',
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  BUG_REPORT: 'Bug Report',
  FEATURE_REQUEST: 'Feature Request',
  JOB_POSTING: 'Job Posting',
  APPLICATION: 'Application',
  VERIFICATION: 'Verification',
  OTHER: 'Other',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'text-[var(--info)] bg-[var(--info-light)]',
  IN_PROGRESS: 'text-[var(--warning)] bg-[var(--warning-light)]',
  AWAITING_REPLY: 'text-primary bg-primary-light',
  RESOLVED: 'text-[var(--success)] bg-[var(--success-light)]',
  CLOSED: 'text-[var(--text-muted)] bg-[var(--bg-secondary)]',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: 'text-[var(--text-muted)] bg-[var(--bg-secondary)]',
  MEDIUM: 'text-[var(--info)] bg-[var(--info-light)]',
  HIGH: 'text-[var(--warning)] bg-[var(--warning-light)]',
  URGENT: 'text-[var(--error)] bg-[var(--error-light)]',
};

/**
 * An admin a ticket can be assigned to.
 *
 * Deliberately minimal — the assignee picker needs a name and an id, and the
 * endpoint behind it exists specifically so the admin roster is NOT
 * enumerable through the general user-listing API.
 */
export interface TicketAgent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}
