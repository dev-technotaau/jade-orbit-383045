import api from '@/lib/api';

export type TeamRole = 'OWNER' | 'ADMIN' | 'RECRUITER';
export type TeamMemberStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface TeamMember {
  id: string;
  companyId: string;
  userId: string | null;
  invitedEmail: string;
  role: TeamRole;
  status: TeamMemberStatus;
  invitedAt: string | null;
  joinedAt: string | null;
  revokedAt: string | null;
  inviteToken: string | null;
  inviteExpiresAt: string | null;
  isOwner: boolean;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
  } | null;
}

export interface TeamListResponse {
  company: { id: string; companyName: string; userId: string };
  /** Viewer's role within this team — drives RBAC button visibility. */
  viewerRole: TeamRole;
  /** True when the viewer is OWNER or ADMIN. */
  canManage: boolean;
  members: TeamMember[];
}

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

export const teamService = {
  async list(): Promise<TeamListResponse> {
    const { data } = await api.get<BackendEnvelope<TeamListResponse>>('/employer/team');
    return data.data;
  },

  async invite(input: { email: string; role: TeamRole }): Promise<TeamMember> {
    const { data } = await api.post<BackendEnvelope<TeamMember>>('/employer/team/invite', input);
    return data.data;
  },

  async accept(token: string): Promise<TeamMember> {
    const { data } = await api.post<BackendEnvelope<TeamMember>>(
      `/employer/team/accept/${encodeURIComponent(token)}`,
    );
    return data.data;
  },

  async remove(memberId: string): Promise<void> {
    await api.delete(`/employer/team/${encodeURIComponent(memberId)}`);
  },

  async changeRole(memberId: string, role: TeamRole): Promise<TeamMember> {
    const { data } = await api.patch<BackendEnvelope<TeamMember>>(
      `/employer/team/${encodeURIComponent(memberId)}/role`,
      { role },
    );
    return data.data;
  },

  async getUsage(daysBack = 30): Promise<{
    windowDays: number;
    rows: Array<{
      userId: string;
      name: string;
      email: string;
      isOwner: boolean;
      role: TeamRole;
      perUnit: Record<string, number>;
      total: number;
    }>;
  }> {
    const { data } = await api.get<
      BackendEnvelope<{
        windowDays: number;
        rows: Array<{
          userId: string;
          name: string;
          email: string;
          isOwner: boolean;
          role: TeamRole;
          perUnit: Record<string, number>;
          total: number;
        }>;
      }>
    >('/employer/team/usage', { params: { days: daysBack } });
    return data.data;
  },

  async transferOwnership(
    targetUserId: string,
  ): Promise<{ companyId: string; newOwnerUserId: string }> {
    const { data } = await api.post<BackendEnvelope<{ companyId: string; newOwnerUserId: string }>>(
      '/employer/team/transfer-ownership',
      { targetUserId },
    );
    return data.data;
  },
};

export default teamService;
