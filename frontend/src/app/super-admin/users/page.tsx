'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  UserPlus,
  Key,
  Power,
  Download,
  Bell,
  X,
  Filter,
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
import CreateUserModal from '@/components/super-admin/CreateUserModal';
import Dropdown from '@/components/ui/Dropdown';
import OtpInput from '@/components/auth/OtpInput';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { useOtpConfig } from '@/hooks/use-otp-config';
import { usePasswordRules } from '@/hooks/use-security-config';
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
  { value: 'inactive', label: 'Inactive' },
];

const roleChangeOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Roles this screen may create.
 *
 * `ADMIN` is offered ONLY to a super-admin. This screen is reachable by any
 * admin holding `users.create` — a perfectly ordinary help-desk grant whose
 * registry description reads "Provision a new candidate or employer
 * account" — and offering Admin here let such an admin mint a peer,
 * bypassing the super-admin-only lock on Manage Admins. The server refuses
 * it too (`denyAdminRoleBody` + the service guard); this just stops the UI
 * advertising an action that will 403.
 */
function buildCreateRoleOptions(isSuperAdmin: boolean) {
  return [
    { value: 'CANDIDATE', label: 'Candidate' },
    { value: 'EMPLOYER', label: 'Employer' },
    ...(isSuperAdmin ? [{ value: 'ADMIN', label: 'Admin' }] : []),
  ];
}

export default function SuperAdminUsersPage() {
  const queryClient = useQueryClient();
  const otpConfig = useOtpConfig();
  const passwordRules = usePasswordRules();
  const { can, isSuperAdmin } = usePermissions();
  const createRoleOptions = useMemo(() => buildCreateRoleOptions(isSuperAdmin), [isSuperAdmin]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.USERS_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Bulk selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Enhanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [profileCompletenessMin, setProfileCompletenessMin] = useState<number | undefined>();
  const [profileCompletenessMax, setProfileCompletenessMax] = useState<number | undefined>();
  const [lastActiveFilter, setLastActiveFilter] = useState<
    'week' | 'month' | 'quarter' | 'inactive' | ''
  >('');
  const [verifiedFilters, setVerifiedFilters] = useState<('email' | 'mobile' | 'whatsapp')[]>([]);

  // Bulk operation modals
  const [showBulkNotifyModal, setShowBulkNotifyModal] = useState(false);
  const [bulkNotificationTitle, setBulkNotificationTitle] = useState('');
  const [bulkNotificationMessage, setBulkNotificationMessage] = useState('');
  const [bulkNotificationType, setBulkNotificationType] = useState<
    'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
  >('INFO');
  const [showBulkSuspendModal, setShowBulkSuspendModal] = useState(false);
  const [bulkSuspendReason, setBulkSuspendReason] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 400),
    [],
  );

  // Create User modal — the form itself lives in <CreateUserModal>.
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Suspend modal
  const [suspendTarget, setSuspendTarget] = useState<UserListItem | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);

  // Role change modal
  const [roleChangeTarget, setRoleChangeTarget] = useState<UserListItem | null>(null);
  const [newRole, setNewRole] = useState('');

  // Reset password modal (2-step OTP)
  const [resetPwTarget, setResetPwTarget] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'send' | 'verify'>('send');
  const [resetOtp, setResetOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendResetOtp = async () => {
    if (!resetPwTarget) return;
    setIsSendingOtp(true);
    try {
      await adminService.sendPasswordResetOtp(resetPwTarget.id);
      showToast.success(`Verification code sent to ${resetPwTarget.email}`);
      setResetStep('verify');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendResetOtp = async () => {
    if (!resetPwTarget) return;
    setIsResending(true);
    try {
      await adminService.sendPasswordResetOtp(resetPwTarget.id);
      showToast.success('New verification code sent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setResetOtp('');
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const closeResetPwModal = () => {
    setResetPwTarget(null);
    setNewPassword('');
    setResetStep('send');
    setResetOtp('');
    setResendTimer(0);
  };

  const filters: Record<string, string | number | string[] | undefined> = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(roleFilter && { role: roleFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(profileCompletenessMin !== undefined && { profileCompletenessMin }),
    ...(profileCompletenessMax !== undefined && { profileCompletenessMax }),
    ...(lastActiveFilter && { lastActive: lastActiveFilter }),
    ...(verifiedFilters.length > 0 && { verified: verifiedFilters }),
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.USERS(filters),
    queryFn: () => adminService.getUsers(filters),
  });

  const users = data?.data?.items || [];
  const pagination = data?.data;

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason, duration }: { id: string; reason: string; duration?: number }) =>
      adminService.suspendUser(id, { reason, duration }),
    onSuccess: () => {
      showToast.success('User suspended successfully');
      invalidateUsers();
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
      invalidateUsers();
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
      invalidateUsers();
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
      invalidateUsers();
      setRoleChangeTarget(null);
      setNewRole('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update role');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword, otp }: { id: string; newPassword: string; otp: string }) =>
      adminService.resetUserPassword(id, { newPassword, otp }),
    onSuccess: () => {
      showToast.success('Password reset successfully');
      closeResetPwModal();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reset password');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminService.deactivateUser(id),
    onSuccess: () => {
      showToast.success('User deactivated successfully');
      invalidateUsers();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to deactivate user');
    },
  });

  // Bulk operations mutations
  const bulkExportMutation = useMutation({
    mutationFn: ({ format }: { format: 'csv' | 'xlsx' }) =>
      adminService.bulkExportUsers(Array.from(selectedUserIds), format),
    onSuccess: () => {
      showToast.success('Export queued. You will receive an email.');
      setSelectedUserIds(new Set());
      setShowBulkActions(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to export users');
    },
  });

  const bulkNotifyMutation = useMutation({
    mutationFn: () =>
      adminService.bulkNotifyUsers(Array.from(selectedUserIds), {
        title: bulkNotificationTitle,
        message: bulkNotificationMessage,
        type: bulkNotificationType,
      }),
    onSuccess: (data) => {
      showToast.success(`Notifications sent to ${data.data.count} users`);
      setSelectedUserIds(new Set());
      setShowBulkActions(false);
      setShowBulkNotifyModal(false);
      setBulkNotificationTitle('');
      setBulkNotificationMessage('');
      setBulkNotificationType('INFO');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send notifications');
    },
  });

  const bulkSuspendMutation = useMutation({
    mutationFn: () => adminService.bulkSuspendUsers(Array.from(selectedUserIds), bulkSuspendReason),
    onSuccess: (data) => {
      showToast.success(`${data.data.count} users suspended`);
      invalidateUsers();
      setSelectedUserIds(new Set());
      setShowBulkActions(false);
      setShowBulkSuspendModal(false);
      setBulkSuspendReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to suspend users');
    },
  });

  const bulkActivateMutation = useMutation({
    mutationFn: () => adminService.bulkActivateUsers(Array.from(selectedUserIds)),
    onSuccess: (data) => {
      showToast.success(`${data.data.count} users activated`);
      invalidateUsers();
      setSelectedUserIds(new Set());
      setShowBulkActions(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to activate users');
    },
  });

  const getUserActions = (user: UserListItem) => [
    {
      label: 'View Details',
      icon: Eye,
      onClick: () => {
        window.location.href = ROUTES.SUPER_ADMIN.USER_DETAIL(user.id);
      },
    },
    ...(user.isSuspended
      ? [{ label: 'Unsuspend', icon: CheckCircle, onClick: () => activateMutation.mutate(user.id) }]
      : user.isActive
        ? [{ label: 'Suspend', icon: Ban, onClick: () => setSuspendTarget(user) }]
        : []),
    ...(!user.isActive
      ? [{ label: 'Reactivate', icon: Power, onClick: () => activateMutation.mutate(user.id) }]
      : !user.isSuspended
        ? [{ label: 'Deactivate', icon: Power, onClick: () => deactivateMutation.mutate(user.id) }]
        : []),
    {
      label: 'Change Role',
      icon: UserCog,
      onClick: () => {
        setRoleChangeTarget(user);
        setNewRole(user.role);
      },
    },
    {
      label: 'Reset Password',
      icon: Key,
      onClick: () => setResetPwTarget(user),
    },
    { label: '', onClick: () => {}, separator: true },
    {
      label: 'Delete',
      icon: Trash2,
      onClick: () => setDeleteTarget(user),
      destructive: true,
    },
  ];

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">User Management</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Full control over all platform users — create, edit, suspend, deactivate.
            </p>
          </div>
          {can(PERM.USERS_CREATE) && (
            <Button
              leftIcon={<UserPlus className="h-4 w-4" />}
              onClick={() => setShowCreateModal(true)}
              tooltip="Create a new user account"
            >
              Create User
            </Button>
          )}
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
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                leftIcon={<Filter className="h-4 w-4" />}
                tooltip="Toggle advanced filters"
              >
                Filters
                {(profileCompletenessMin !== undefined ||
                  profileCompletenessMax !== undefined ||
                  lastActiveFilter ||
                  verifiedFilters.length > 0) && (
                  <Badge variant="info" size="sm" className="ml-2">
                    {
                      [
                        profileCompletenessMin !== undefined ||
                          profileCompletenessMax !== undefined,
                        lastActiveFilter,
                        verifiedFilters.length > 0,
                      ].filter(Boolean).length
                    }
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-[var(--text)]">Advanced Filters</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProfileCompletenessMin(undefined);
                  setProfileCompletenessMax(undefined);
                  setLastActiveFilter('');
                  setVerifiedFilters([]);
                  setPage(1);
                }}
                tooltip="Reset all advanced filters"
              >
                Clear All
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Profile Completeness */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Profile Completeness (%)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={profileCompletenessMin ?? ''}
                    onChange={(e) => {
                      setProfileCompletenessMin(
                        e.target.value ? Number(e.target.value) : undefined,
                      );
                      setPage(1);
                    }}
                    min={0}
                    max={100}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={profileCompletenessMax ?? ''}
                    onChange={(e) => {
                      setProfileCompletenessMax(
                        e.target.value ? Number(e.target.value) : undefined,
                      );
                      setPage(1);
                    }}
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              {/* Last Active */}
              <Select
                label="Last Active"
                value={lastActiveFilter}
                onChange={(val) => {
                  setLastActiveFilter(val as typeof lastActiveFilter);
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'Any' },
                  { value: 'week', label: 'Last 7 days' },
                  { value: 'month', label: 'Last 30 days' },
                  { value: 'quarter', label: 'Last 90 days' },
                  { value: 'inactive', label: 'Inactive (>90 days)' },
                ]}
              />

              {/* Verification Status */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Verified
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={verifiedFilters.includes('email')}
                      onChange={(e) => {
                        const newFilters = e.target.checked
                          ? [...verifiedFilters, 'email' as const]
                          : verifiedFilters.filter((v) => v !== 'email');
                        setVerifiedFilters(newFilters);
                        setPage(1);
                      }}
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={verifiedFilters.includes('mobile')}
                      onChange={(e) => {
                        const newFilters = e.target.checked
                          ? [...verifiedFilters, 'mobile' as const]
                          : verifiedFilters.filter((v) => v !== 'mobile');
                        setVerifiedFilters(newFilters);
                        setPage(1);
                      }}
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    Mobile
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={verifiedFilters.includes('whatsapp')}
                      onChange={(e) => {
                        const newFilters = e.target.checked
                          ? [...verifiedFilters, 'whatsapp' as const]
                          : verifiedFilters.filter((v) => v !== 'whatsapp');
                        setVerifiedFilters(newFilters);
                        setPage(1);
                      }}
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Bulk Actions Bar */}
        {selectedUserIds.size > 0 && (
          <Card className="border-primary bg-primary/5 sticky top-18 z-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-medium text-[var(--text)]">
                  {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedUserIds(new Set())}
                  leftIcon={<X className="h-4 w-4" />}
                  tooltip="Deselect all users"
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkExportMutation.mutate({ format: 'csv' })}
                  disabled={bulkExportMutation.isPending}
                  leftIcon={<Download className="h-4 w-4" />}
                  tooltip="Export selected users as CSV"
                >
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkExportMutation.mutate({ format: 'xlsx' })}
                  disabled={bulkExportMutation.isPending}
                  leftIcon={<Download className="h-4 w-4" />}
                  tooltip="Export selected users as XLSX"
                >
                  Export XLSX
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowBulkNotifyModal(true)}
                  leftIcon={<Bell className="h-4 w-4" />}
                  tooltip="Send notification to selected users"
                >
                  Notify
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowBulkSuspendModal(true)}
                  leftIcon={<Ban className="h-4 w-4" />}
                  tooltip="Suspend selected users"
                >
                  Suspend
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => bulkActivateMutation.mutate()}
                  disabled={bulkActivateMutation.isPending}
                  leftIcon={<CheckCircle className="h-4 w-4" />}
                  tooltip="Activate selected users"
                >
                  Activate
                </Button>
              </div>
            </div>
          </Card>
        )}

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
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={users.length > 0 && selectedUserIds.size === users.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds(new Set(users.map((u) => u.id)));
                          } else {
                            setSelectedUserIds(new Set());
                          }
                        }}
                        className="h-4 w-4 rounded border-[var(--border)]"
                      />
                    </th>
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
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(user.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedUserIds);
                            if (e.target.checked) {
                              newSelected.add(user.id);
                            } else {
                              newSelected.delete(user.id);
                            }
                            setSelectedUserIds(newSelected);
                          }}
                          className="h-4 w-4 rounded border-[var(--border)]"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <Tooltip content="View user details">
                          <Link
                            href={ROUTES.SUPER_ADMIN.USER_DETAIL(user.id)}
                            className="hover:text-primary cursor-pointer transition-colors"
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
        {pagination && pagination.totalPages > 0 && (
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

        {/* Account creation lives in a shared component so this page and
            /super-admin/admins offer identical validation, the sitewide
            PhoneInput and the same password UX as self-registration. */}
        <CreateUserModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={invalidateUsers}
          mode="user"
          roleOptions={createRoleOptions}
        />

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
                onClick={() => {
                  setSuspendTarget(null);
                  setSuspendReason('');
                  setSuspendDuration('');
                }}
                tooltip="Cancel suspension"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!suspendTarget || !suspendReason.trim()) return;
                  suspendMutation.mutate({
                    id: suspendTarget.id,
                    reason: suspendReason,
                    duration: suspendDuration ? parseInt(suspendDuration, 10) : undefined,
                  });
                }}
                isLoading={suspendMutation.isPending}
                disabled={!suspendReason.trim()}
                tooltip="Confirm user suspension"
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
                onClick={() => setDeleteTarget(null)}
                tooltip="Cancel deletion"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                }}
                isLoading={deleteMutation.isPending}
                tooltip="Permanently delete this user"
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
                onClick={() => {
                  setRoleChangeTarget(null);
                  setNewRole('');
                }}
                tooltip="Cancel role change"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!roleChangeTarget || !newRole) return;
                  roleChangeMutation.mutate({ id: roleChangeTarget.id, role: newRole as Role });
                }}
                isLoading={roleChangeMutation.isPending}
                disabled={!newRole || newRole === roleChangeTarget?.role}
                tooltip="Confirm role update"
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

        {/* Reset Password Modal (2-step OTP) */}
        <Modal
          isOpen={!!resetPwTarget}
          onClose={closeResetPwModal}
          title="Reset Password"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeResetPwModal} tooltip="Cancel password reset">
                Cancel
              </Button>
              {resetStep === 'send' ? (
                <Button
                  onClick={handleSendResetOtp}
                  isLoading={isSendingOtp}
                  tooltip="Send verification code to user email"
                >
                  Send Verification Code
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!resetPwTarget || !newPassword || resetOtp.length !== otpConfig.LENGTH)
                      return;
                    resetPasswordMutation.mutate({
                      id: resetPwTarget.id,
                      newPassword,
                      otp: resetOtp,
                    });
                  }}
                  isLoading={resetPasswordMutation.isPending}
                  disabled={
                    newPassword.length < passwordRules.MIN_LENGTH ||
                    resetOtp.length !== otpConfig.LENGTH
                  }
                  tooltip="Confirm password reset"
                >
                  Reset Password
                </Button>
              )}
            </div>
          }
        >
          {resetStep === 'send' ? (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                A 6-digit verification code will be sent to <strong>{resetPwTarget?.email}</strong>{' '}
                to confirm the password reset. This will revoke all their active sessions.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium text-[var(--text)]">{resetPwTarget?.email}</span> and
                  the new password.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Verification Code
                </label>
                <OtpInput value={resetOtp} onChange={setResetOtp} length={otpConfig.LENGTH} />
              </div>

              <div className="text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  Didn&apos;t receive the code?{' '}
                  {resendTimer > 0 ? (
                    <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
                  ) : (
                    <Tooltip content="Resend verification code">
                      <button
                        type="button"
                        onClick={handleResendResetOtp}
                        disabled={isResending}
                        className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                      >
                        {isResending ? 'Sending...' : 'Resend Code'}
                      </button>
                    </Tooltip>
                  )}
                </p>
              </div>

              <Input
                label="New Password"
                type="password"
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
          )}
        </Modal>

        {/* Bulk Notify Modal */}
        <Modal
          isOpen={showBulkNotifyModal}
          onClose={() => {
            setShowBulkNotifyModal(false);
            setBulkNotificationTitle('');
            setBulkNotificationMessage('');
            setBulkNotificationType('INFO');
          }}
          title={`Send Notification to ${selectedUserIds.size} User${selectedUserIds.size !== 1 ? 's' : ''}`}
        >
          <div className="space-y-4">
            <Input
              label="Title"
              value={bulkNotificationTitle}
              onChange={(e) => setBulkNotificationTitle(e.target.value)}
              placeholder="Notification title"
              required
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                Message <span className="text-error">*</span>
              </label>
              <textarea
                value={bulkNotificationMessage}
                onChange={(e) => setBulkNotificationMessage(e.target.value)}
                className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:ring-2 focus:outline-none"
                rows={4}
                placeholder="Enter your message..."
                required
              />
            </div>
            <Select
              label="Type"
              value={bulkNotificationType}
              onChange={(val) => setBulkNotificationType(val as typeof bulkNotificationType)}
              options={[
                { value: 'INFO', label: 'Info' },
                { value: 'SUCCESS', label: 'Success' },
                { value: 'WARNING', label: 'Warning' },
                { value: 'ERROR', label: 'Error' },
              ]}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkNotifyModal(false);
                  setBulkNotificationTitle('');
                  setBulkNotificationMessage('');
                  setBulkNotificationType('INFO');
                }}
                tooltip="Cancel sending notification"
              >
                Cancel
              </Button>
              <Button
                onClick={() => bulkNotifyMutation.mutate()}
                disabled={
                  !bulkNotificationTitle || !bulkNotificationMessage || bulkNotifyMutation.isPending
                }
                tooltip="Send notification to selected users"
              >
                {bulkNotifyMutation.isPending ? 'Sending...' : 'Send Notification'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Bulk Suspend Modal */}
        <Modal
          isOpen={showBulkSuspendModal}
          onClose={() => {
            setShowBulkSuspendModal(false);
            setBulkSuspendReason('');
          }}
          title={`Suspend ${selectedUserIds.size} User${selectedUserIds.size !== 1 ? 's' : ''}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-warning mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium text-[var(--text)]">Warning</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    This will suspend all selected users. They will not be able to log in until
                    reactivated.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                Reason (optional)
              </label>
              <textarea
                value={bulkSuspendReason}
                onChange={(e) => setBulkSuspendReason(e.target.value)}
                className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:ring-2 focus:outline-none"
                rows={3}
                placeholder="Optional suspension reason..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkSuspendModal(false);
                  setBulkSuspendReason('');
                }}
                tooltip="Cancel bulk suspension"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => bulkSuspendMutation.mutate()}
                disabled={bulkSuspendMutation.isPending}
                tooltip="Confirm suspending selected users"
              >
                {bulkSuspendMutation.isPending ? 'Suspending...' : 'Suspend Users'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
