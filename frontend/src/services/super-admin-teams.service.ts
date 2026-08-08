import api from '@/lib/api';
import type { TeamRole, TeamMemberStatus } from '@/services/team.service';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export interface SaTeamRow {
  companyId: string;
  companyName: string;
  logo: string | null;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  isVerifiedCompany: boolean;
  activeMembers: number;
  pendingInvites: number;
  totalSeats: number;
  ownerHasActivePlan: boolean;
  createdAt: string;
}

export interface SaTeamListResponse {
  items: SaTeamRow[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface SaTeamMember {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  avatar: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  invitedAt: string | null;
  joinedAt: string | null;
  revokedAt: string | null;
  isOwner: boolean;
  usage30d: { perUnit: Record<string, number>; total: number };
}

export interface SaAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  performedBy: string;
  details: unknown;
  createdAt: string;
}

export interface SaTeamDetail {
  company: {
    id: string;
    userId: string;
    companyName: string;
    logo: string | null;
    isVerified: boolean;
    createdAt: string;
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
    };
  };
  members: SaTeamMember[];
  audit: SaAuditEntry[];
}

export const superAdminTeamsService = {
  async list(
    args: { query?: string; page?: number; limit?: number } = {},
  ): Promise<SaTeamListResponse> {
    const { data } = await api.get<BackendEnvelope<SaTeamListResponse>>('/super-admin/teams', {
      params: args,
    });
    return data.data;
  },

  async detail(companyId: string): Promise<SaTeamDetail> {
    const { data } = await api.get<BackendEnvelope<SaTeamDetail>>(
      `/super-admin/teams/${encodeURIComponent(companyId)}`,
    );
    return data.data;
  },

  async forceRevoke(memberId: string, reason?: string): Promise<void> {
    await api.delete(`/super-admin/teams/members/${encodeURIComponent(memberId)}`, {
      data: { reason },
    });
  },
};

export default superAdminTeamsService;
