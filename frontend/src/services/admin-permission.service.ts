import api from '@/lib/api';
import type {
  ActiveLockRow,
  AdminActivityRow,
  AdminActivityStats,
  AdminPermissionGrantRow,
  AdminRole,
  EffectivePermissions,
  LockState,
  MatrixRow,
  PermissionEffect,
  PermissionExplanation,
  PermissionRegistry,
  ResourceLockMode,
} from '@/types/permissions';

interface BackendEnvelope<T> {
  status?: string;
  data: T;
}

const CONTROL = '/super-admin/admin-control';

export interface GrantInput {
  permissionKey: string;
  effect?: PermissionEffect;
  expiresAt?: string;
  reason?: string;
}

export interface AdminPermissionDetail {
  admin: {
    id: string;
    role: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
  effective: EffectivePermissions;
  direct: AdminPermissionGrantRow[];
  assignments: {
    id: string;
    roleId: string;
    adminId: string;
    expiresAt: string | null;
    assignedBy: string;
    createdAt: string;
    role: AdminRole;
  }[];
}

export interface ActivityQuery {
  adminId?: string;
  domain?: string;
  entityId?: string;
  method?: string;
  errorsOnly?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ActivityPage {
  items: AdminActivityRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Admin control-centre API client.
 *
 * Everything under `CONTROL` is super-admin-only server-side; the two
 * self-service calls (`getMyPermissions`, and the whole lock family) sit
 * under `/admin` and are open to any admin.
 */
export const adminPermissionService = {
  // ── Self ──
  /** The CALLER's own effective permissions. Any admin may read this. */
  async getMyPermissions(): Promise<EffectivePermissions> {
    const { data } = await api.get<BackendEnvelope<EffectivePermissions>>('/admin/me/permissions');
    return data.data;
  },

  // ── Registry ──
  async getRegistry(): Promise<PermissionRegistry> {
    const { data } = await api.get<BackendEnvelope<PermissionRegistry>>(`${CONTROL}/registry`);
    return data.data;
  },

  // ── Per-admin grants ──
  async getAdminPermissions(adminId: string): Promise<AdminPermissionDetail> {
    const { data } = await api.get<BackendEnvelope<AdminPermissionDetail>>(
      `${CONTROL}/admins/${adminId}`,
    );
    return data.data;
  },

  /**
   * Whole-set replace of an admin's direct grants. The editor always sends
   * the complete set rather than a diff — a partial patch stream can
   * interleave with a concurrent edit and leave a half-applied permission
   * set, which is the one outcome access control must never produce.
   */
  async setAdminPermissions(adminId: string, grants: GrantInput[]): Promise<void> {
    await api.put(`${CONTROL}/admins/${adminId}/permissions`, { grants });
  },

  async grantPermission(adminId: string, input: GrantInput): Promise<void> {
    await api.post(`${CONTROL}/admins/${adminId}/permissions`, input);
  },

  async revokePermission(adminId: string, permissionKey: string): Promise<void> {
    await api.delete(
      `${CONTROL}/admins/${adminId}/permissions/${encodeURIComponent(permissionKey)}`,
    );
  },

  async revokeAll(adminId: string): Promise<void> {
    await api.delete(`${CONTROL}/admins/${adminId}/permissions`);
  },

  async setAdminRoles(adminId: string, roleIds: string[]): Promise<void> {
    await api.put(`${CONTROL}/admins/${adminId}/roles`, { roleIds });
  },

  async clonePermissions(
    targetAdminId: string,
    sourceAdminId: string,
    includeRoles = true,
  ): Promise<void> {
    await api.post(`${CONTROL}/admins/${targetAdminId}/clone`, { sourceAdminId, includeRoles });
  },

  /** "Why can/can't this admin do X" — backs the decision popover. */
  async explain(adminId: string, key: string): Promise<PermissionExplanation> {
    const { data } = await api.get<BackendEnvelope<PermissionExplanation>>(
      `${CONTROL}/admins/${adminId}/explain`,
      { params: { key } },
    );
    return data.data;
  },

  // ── Roles ──
  async listRoles(): Promise<AdminRole[]> {
    const { data } = await api.get<BackendEnvelope<AdminRole[]>>(`${CONTROL}/roles`);
    return data.data;
  },

  async createRole(input: {
    name: string;
    description?: string | null;
    color?: string | null;
    permissions: { permissionKey: string; effect?: PermissionEffect }[];
  }): Promise<AdminRole> {
    const { data } = await api.post<BackendEnvelope<AdminRole>>(`${CONTROL}/roles`, input);
    return data.data;
  },

  async updateRole(
    roleId: string,
    input: {
      name?: string;
      description?: string | null;
      color?: string | null;
      permissions?: { permissionKey: string; effect?: PermissionEffect }[];
    },
  ): Promise<AdminRole> {
    const { data } = await api.put<BackendEnvelope<AdminRole>>(`${CONTROL}/roles/${roleId}`, input);
    return data.data;
  },

  async deleteRole(roleId: string): Promise<void> {
    await api.delete(`${CONTROL}/roles/${roleId}`);
  },

  async assignRole(roleId: string, adminId: string, expiresAt?: string): Promise<void> {
    await api.post(`${CONTROL}/roles/${roleId}/assign`, { adminId, expiresAt });
  },

  async unassignRole(roleId: string, adminId: string): Promise<void> {
    await api.delete(`${CONTROL}/roles/${roleId}/assign/${adminId}`);
  },

  // ── Matrix + oversight ──
  async getMatrix(): Promise<MatrixRow[]> {
    const { data } = await api.get<BackendEnvelope<MatrixRow[]>>(`${CONTROL}/matrix`);
    return data.data;
  },

  async getHolders(key: string) {
    const { data } = await api.get<
      BackendEnvelope<{ admin: MatrixRow['admin']; roles: MatrixRow['roles'] }[]>
    >(`${CONTROL}/holders`, { params: { key } });
    return data.data;
  },

  async listActivity(query: ActivityQuery = {}): Promise<ActivityPage> {
    const { data } = await api.get<BackendEnvelope<ActivityPage>>(`${CONTROL}/activity`, {
      params: query,
    });
    return data.data;
  },

  async getActivityStats(hours = 24): Promise<AdminActivityStats> {
    const { data } = await api.get<BackendEnvelope<AdminActivityStats>>(
      `${CONTROL}/activity/stats`,
      { params: { hours } },
    );
    return data.data;
  },

  async listLocks(): Promise<ActiveLockRow[]> {
    const { data } = await api.get<BackendEnvelope<ActiveLockRow[]>>(`${CONTROL}/locks`);
    return data.data;
  },

  async forceReleaseLock(lockId: string): Promise<void> {
    await api.delete(`${CONTROL}/locks/${lockId}`);
  },
};

/**
 * Soft-lock / presence client. Mounted under `/admin` (not the control
 * centre) because every admin participates in presence — it is only useful
 * if all the people who might collide can take part.
 */
export const resourceLockService = {
  async getState(resourceType: string, resourceId: string): Promise<LockState> {
    const { data } = await api.get<BackendEnvelope<LockState>>('/admin/locks', {
      params: { resourceType, resourceId },
    });
    return data.data;
  },

  async acquire(
    resourceType: string,
    resourceId: string,
    mode: ResourceLockMode = 'VIEWING',
    takeover = false,
  ): Promise<LockState> {
    const { data } = await api.post<BackendEnvelope<LockState>>('/admin/locks', {
      resourceType,
      resourceId,
      mode,
      takeover,
    });
    return data.data;
  },

  async heartbeat(resourceType: string, resourceId: string): Promise<LockState> {
    const { data } = await api.post<BackendEnvelope<LockState>>('/admin/locks/heartbeat', {
      resourceType,
      resourceId,
    });
    return data.data;
  },

  async release(resourceType: string, resourceId: string): Promise<LockState> {
    const { data } = await api.post<BackendEnvelope<LockState>>('/admin/locks/release', {
      resourceType,
      resourceId,
    });
    return data.data;
  },

  /** Batch presence for a list view — one request instead of N. */
  async getStates(
    resourceType: string,
    resourceIds: string[],
  ): Promise<Record<string, { editor: LockState['editor']; viewerCount: number }>> {
    const { data } = await api.post<
      BackendEnvelope<Record<string, { editor: LockState['editor']; viewerCount: number }>>
    >('/admin/locks/batch', { resourceType, resourceIds });
    return data.data;
  },
};
