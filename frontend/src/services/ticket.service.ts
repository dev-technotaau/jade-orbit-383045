import api from '@/lib/api';
import { API } from '@/constants/api';
import { buildQueryString } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  SupportTicket,
  TicketAgent,
  TicketMessage,
  CreateTicketRequest,
  CreateGuestTicketRequest,
  TicketStats,
  TicketAnalytics,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketSatisfaction,
} from '@/types/ticket';

export const ticketService = {
  // ── User endpoints ──

  async createTicket(data: CreateTicketRequest): Promise<ApiResponse<SupportTicket>> {
    const res = await api.post(API.TICKETS.CREATE, data);
    return res.data;
  },

  async createGuestTicket(
    data: CreateGuestTicketRequest,
  ): Promise<ApiResponse<{ id: string; ticketNumber: string }>> {
    const res = await api.post(API.TICKETS.GUEST_CREATE, data);
    return res.data;
  },

  async getTicket(id: string): Promise<ApiResponse<SupportTicket>> {
    const res = await api.get(API.TICKETS.DETAIL(id));
    return res.data;
  },

  async getTicketByNumber(ticketNumber: string): Promise<ApiResponse<SupportTicket>> {
    const res = await api.get(API.TICKETS.BY_NUMBER(ticketNumber));
    return res.data;
  },

  async getMyTickets(
    page?: number,
    limit?: number,
    status?: TicketStatus,
  ): Promise<PaginatedResponse<SupportTicket>> {
    const qs = buildQueryString({ page, limit, status } as Record<string, string | undefined>);
    const res = await api.get(`${API.TICKETS.MY_TICKETS}${qs}`);
    return res.data;
  },

  async addMessage(
    ticketId: string,
    body: string,
    isInternal = false,
    subject?: string,
  ): Promise<ApiResponse<TicketMessage>> {
    const res = await api.post(API.TICKETS.MESSAGES(ticketId), { body, isInternal, subject });
    return res.data;
  },

  async closeTicket(ticketId: string): Promise<ApiResponse<SupportTicket>> {
    const res = await api.post(API.TICKETS.CLOSE(ticketId));
    return res.data;
  },

  async reopenTicket(ticketId: string): Promise<ApiResponse<SupportTicket>> {
    const res = await api.post(API.TICKETS.REOPEN(ticketId));
    return res.data;
  },

  async submitSatisfaction(
    ticketId: string,
    satisfaction: TicketSatisfaction,
    comment?: string,
  ): Promise<ApiResponse<SupportTicket>> {
    const res = await api.post(API.TICKETS.SATISFACTION(ticketId), { satisfaction, comment });
    return res.data;
  },

  // ── Admin endpoints ──

  async getAllTickets(filters?: {
    page?: number;
    limit?: number;
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assignedToId?: string;
    search?: string;
  }): Promise<PaginatedResponse<SupportTicket>> {
    const qs = buildQueryString(filters as Record<string, string | undefined>);
    const res = await api.get(`${API.TICKETS.ALL}${qs}`);
    return res.data;
  },

  /**
   * Admins a ticket can be assigned to.
   *
   * Purpose-built endpoint rather than /admin/users?role=ADMIN — that route
   * deliberately refuses to enumerate admin accounts, which left the assignee
   * picker permanently empty.
   */
  async listAgents(): Promise<ApiResponse<TicketAgent[]>> {
    const res = await api.get(API.TICKETS.AGENTS);
    return res.data;
  },
  async assignTicket(ticketId: string, assignedToId: string): Promise<ApiResponse<SupportTicket>> {
    const res = await api.patch(API.TICKETS.ASSIGN(ticketId), { assignedToId });
    return res.data;
  },

  async updateStatus(ticketId: string, status: TicketStatus): Promise<ApiResponse<SupportTicket>> {
    const res = await api.patch(API.TICKETS.STATUS(ticketId), { status });
    return res.data;
  },

  async getStats(): Promise<ApiResponse<TicketStats>> {
    const res = await api.get(API.TICKETS.STATS);
    return res.data;
  },

  async getAnalytics(startDate?: string, endDate?: string): Promise<ApiResponse<TicketAnalytics>> {
    const qs = buildQueryString({ startDate, endDate } as Record<string, string | undefined>);
    const res = await api.get(`${API.TICKETS.ANALYTICS}${qs}`);
    return res.data;
  },
};
