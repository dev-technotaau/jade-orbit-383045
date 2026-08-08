'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  Search,
  MoreVertical,
  Eye,
  Ban,
  CheckCircle,
  UserCog,
  Trash2,
  AlertCircle,
  Power,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PERM } from '@/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Dropdown from '@/components/ui/Dropdown';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { ROLE_LABELS } from '@/constants/enums';
import { formatDate, debounce } from '@/lib/utils';
import type { UserListItem } from '@/types/admin';
import type { Role } from '@/types/auth';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Subject filter. Only CANDIDATE/EMPLOYER — admin accounts are never listed
 * on this screen (they live in Manage Admins), and since the subject split
 * landed the API returns 403 for any other value rather than an empty list.
 */
const roleOptions = [
  { value: '', label: 'All Roles' },
  ...Object.entries(ROLE_LABELS)
    .filter(([value]) => value === 'CANDIDATE' || value === 'EMPLOYER')
    .map(([value, label]) => ({ value, label })),
];

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const roleChangeOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.USERS_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 400),
    [],
  );

  // Modals
  const [suspendTarget, setSuspendTarget] = useState<UserListItem | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<UserListItem | null>(null);
  const [newRole, setNewRole] = useState('');

  const filters: Record<string, string | number | undefined> = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(roleFilter && { role: roleFilter }),
    ...(statusFilter && { status: statusFilter }),
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.USERS(filters),
    queryFn: () => adminService.getUsers(filters),
  });

  const users = data?.data?.items || [];
  const pagination = data?.data;

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason, duration }: { id: string; reason: string; duration?: number }) =>
      adminService.suspendUser(id, { reason, duration }),
    onSuccess: () => {
      showToast.success('User suspended successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSuspendTarget(null);
      setSuspendReason('');
      setSuspendDuration('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to suspend user');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => adminService.activateUser(id),
    onSuccess: () => {
      showToast.success('User activated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to activate user');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => {
      showToast.success('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete user');
    },
  });

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      adminService.updateUserRole(id, { role }),
    onSuccess: () => {
      showToast.success('User role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setRoleChangeTarget(null);
      setNewRole('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update role');
    },
  });

  const handleSuspend = () => {
    if (!suspendTarget || !suspendReason.trim()) return;
    suspendMutation.mutate({
      id: suspendTarget.id,
      reason: suspendReason,
      duration: suspendDuration ? parseInt(suspendDuration, 10) : undefined,
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  const handleRoleChange = () => {
    if (!roleChangeTarget || !newRole) return;
    roleChangeMutation.mutate({ id: roleChangeTarget.id, role: newRole as Role });
  };

  /**
   * Row actions, filtered by what the caller can actually do TO THIS USER.
   *
   * The subject matters: a candidates-only admin may suspend a candidate but
   * not an employer, so the key is resolved from the row's own role — the
   * same rule `requireSubjectPermission` applies server-side.
   *
   * Without this a Read Only Auditor saw a full Suspend / Delete / Change
   * Role toolbar on the busiest admin screen, every click ending in a red
   * toast. The API refused correctly, so this is honesty rather than
   * security — but a console that offers actions it will refuse trains
   * people to ignore its affordances.
   */
  const getUserActions = (user: UserListItem) => {
    const subject = user.role === 'EMPLOYER' ? 'users.employers' : 'users.candidates';
    const canSuspend = can(`${subject}.account.suspend`);
    const canActivate = can(`${subject}.account.activate`);
    const canDelete = can(`${subject}.account.delete`);

    return [
      {
        label: 'View Details',
        icon: Eye,
        onClick: () => {
          window.location.href = ROUTES.ADMIN.USER_DETAIL(user.id);
        },
      },
      ...(user.isSuspended
        ? canActivate
          ? [
              {
                label: 'Unsuspend',
                icon: CheckCircle,
                onClick: () => activateMutation.mutate(user.id),
              },
            ]
          : []
        : user.isActive && canSuspend
          ? [{ label: 'Suspend', icon: Ban, onClick: () => setSuspendTarget(user) }]
          : []),
      ...(!user.isActive && canActivate
        ? [{ label: 'Reactivate', icon: Power, onClick: () => activateMutation.mutate(user.id) }]
        : []),
      // Role changes are superAdminOnly on the route, so this is dead for
      // 100% of ADMINs — showing it only ever produced a 403.
      ...(isSuperAdmin
        ? [
            {
              label: 'Change Role',
              icon: UserCog,
              onClick: () => {
                setRoleChangeTarget(user);
                setNewRole(user.role);
              },
            },
          ]
        : []),
      ...(canDelete
        ? [
            { label: '', onClick: () => {}, separator: true },
            {
              label: 'Delete',
              icon: Trash2,
              onClick: () => setDeleteTarget(user),
              destructive: true,
            },
          ]
        : []),
    ];
  };

  const getRoleBadgeVariant = (role: string): BadgeVariant => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'error';
      case 'ADMIN':
        return 'warning';
      case 'EMPLOYER':
        return 'info';
      case 'CANDIDATE':
        return 'success';
      default:
        return 'neutral';
    }
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[PERM.USERS_CANDIDATES_VIEW, PERM.USERS_EMPLOYERS_VIEW]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">User Management</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage all platform users, roles, and access.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                placeholder="Search by name or email..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  debouncedSetSearch(e.target.value);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                label="Role"
                options={roleOptions}
                value={roleFilter}
                onChange={(val) => {
                  setRoleFilter(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                label="Status"
                options={statusOptions}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </Card>

        {/* Users Table */}
        <Card padding="sm">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={48} />
              ))}
            </div>
          ) : users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Verified
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Last Login
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {users.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <Tooltip content="View user details">
                          <Link
                            href={ROUTES.ADMIN.USER_DETAIL(user.id)}
                            className="hover:text-primary transition-colors"
                          >
                            {user.firstName && user.lastName
                              ? `${user.firstName} ${user.lastName}`
                              : user.firstName || 'N/A'}
                          </Link>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getRoleBadgeVariant(user.role)} size="sm">
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.isSuspended ? (
                          <Badge variant="error" size="sm">
                            Suspended
                          </Badge>
                        ) : user.isActive ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.isEmailVerified ? (
                          <Badge variant="success" size="sm">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            No
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Dropdown
                          align="right"
                          trigger={
                            <Tooltip content="User actions">
                              <button
                                type="button"
                                className="cursor-pointer rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          }
                          items={getUserActions(user)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No users found"
              description="Try adjusting your search or filters."
            />
          )}
        </Card>

        {/* Pagination */}
        {pagination && (
          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            totalItems={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}

        {/* Suspend Modal */}
        <Modal
          isOpen={!!suspendTarget}
          onClose={() => {
            setSuspendTarget(null);
            setSuspendReason('');
            setSuspendDuration('');
          }}
          title="Suspend User"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel suspension"
                onClick={() => {
                  setSuspendTarget(null);
                  setSuspendReason('');
                  setSuspendDuration('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Confirm user suspension"
                onClick={handleSuspend}
                isLoading={suspendMutation.isPending}
                disabled={!suspendReason.trim()}
              >
                Suspend
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                You are about to suspend{' '}
                <span className="font-medium text-[var(--text)]">{suspendTarget?.email}</span>. They
                will not be able to access the platform.
              </p>
            </div>
            <Input
              label="Reason"
              placeholder="Enter reason for suspension..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              required
            />
            <Input
              label="Duration (days, optional)"
              placeholder="Leave blank for indefinite"
              type="number"
              value={suspendDuration}
              onChange={(e) => setSuspendDuration(e.target.value)}
            />
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete User"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel deletion"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Permanently delete this user"
                onClick={handleDelete}
                isLoading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="text-error h-5 w-5 shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to permanently delete{' '}
              <span className="font-medium text-[var(--text)]">{deleteTarget?.email}</span>? This
              action cannot be undone.
            </p>
          </div>
        </Modal>

        {/* Change Role Modal */}
        <Modal
          isOpen={!!roleChangeTarget}
          onClose={() => {
            setRoleChangeTarget(null);
            setNewRole('');
          }}
          title="Change User Role"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel role change"
                onClick={() => {
                  setRoleChangeTarget(null);
                  setNewRole('');
                }}
              >
                Cancel
              </Button>
              <Button
                tooltip="Confirm role update"
                onClick={handleRoleChange}
                isLoading={roleChangeMutation.isPending}
                disabled={!newRole || newRole === roleChangeTarget?.role}
              >
                Update Role
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Change the role for{' '}
              <span className="font-medium text-[var(--text)]">{roleChangeTarget?.email}</span>.
            </p>
            <Select
              label="New Role"
              options={roleChangeOptions}
              value={newRole}
              onChange={setNewRole}
            />
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
