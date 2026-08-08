'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ManagedEmailSection,
  ManagedMobileSection,
  ManagedWhatsappSection,
} from '@/components/super-admin/ManagedContactSections';
import {
  Shield,
  Mail,
  Phone,
  Calendar,
  Clock,
  Activity,
  Monitor,
  BarChart3,
  Key,
  ArrowLeft,
  Ban,
  Trash2,
  CheckCircle,
  XCircle,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  AlertCircle,
  User,
  MapPin,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import AdminPermissionsPanel from '@/components/admin/AdminPermissionsPanel';
import type { ApiError } from '@/types/api';
import type { UserDetail, AuditLog, UserSession } from '@/types/admin';

type TabKey = 'account' | 'activity' | 'sessions' | 'statistics' | 'permissions';

export default function AdminDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  /** Refetch after a managed email / mobile / WhatsApp change. */
  const invalidateAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-detail', id] });
  };

  // `?tab=permissions` deep-links from the "Permissions" action in the
  // admins list. Read once as the initial value rather than syncing on every
  // render, so clicking another tab afterwards isn't undone by the URL.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const requested = searchParams.get('tab');
    return requested === 'permissions' ||
      requested === 'activity' ||
      requested === 'sessions' ||
      requested === 'statistics'
      ? requested
      : 'account';
  });
  const [activityPage, setActivityPage] = useState(1);
  const [activityLimit, setActivityLimit] = useState(20);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetMfaModal, setShowResetMfaModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Fetch admin details
  const { data, isLoading, error } = useQuery({
    queryKey: ['super-admin', 'admin-detail', id],
    queryFn: () => adminService.getUserDetails(id),
    enabled: !!id,
  });

  const admin = data?.data as UserDetail | undefined;

  // Fetch activity logs
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['super-admin', 'admin-activity', id, activityPage, activityLimit],
    queryFn: () =>
      adminService.getAuditLogs({ performedBy: id, page: activityPage, limit: activityLimit }),
    enabled: !!id && activeTab === 'activity',
  });

  // Fetch sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['super-admin', 'admin-sessions', id],
    queryFn: () => adminService.getUserSessions(id),
    enabled: !!id && activeTab === 'sessions',
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: () => adminService.suspendUser(id, { reason: suspendReason }),
    onSuccess: () => {
      showToast.success('Admin suspended successfully');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-detail', id] });
      setShowSuspendModal(false);
      setSuspendReason('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to suspend admin');
    },
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: () => adminService.activateUser(id),
    onSuccess: () => {
      showToast.success('Admin activated successfully');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-detail', id] });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to activate admin');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => adminService.deleteUser(id),
    onSuccess: () => {
      showToast.success('Admin deleted successfully');
      router.push(ROUTES.SUPER_ADMIN.ADMINS);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete admin');
    },
  });

  // Reset MFA mutation
  const resetMfaMutation = useMutation({
    mutationFn: () => adminService.disableAdminMfa(id),
    onSuccess: () => {
      showToast.success('MFA reset successfully');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-detail', id] });
      /* And the surfaces that read the same flag from a different query, so the
         Admin MFA tab in settings does not keep showing this admin as enabled. */
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-mfa-status', id] });
      setShowResetMfaModal(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reset MFA');
    },
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => adminService.revokeUserSession(id, sessionId),
    onSuccess: () => {
      showToast.success('Session revoked successfully');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admin-sessions', id] });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to revoke session');
    },
  });

  const tabs = [
    { key: 'account' as const, label: 'Account', icon: User },
    { key: 'activity' as const, label: 'Activity', icon: Activity },
    { key: 'sessions' as const, label: 'Sessions', icon: Monitor },
    { key: 'statistics' as const, label: 'Statistics', icon: BarChart3 },
    { key: 'permissions' as const, label: 'Permissions', icon: Key },
  ];

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['SUPER_ADMIN']}>
        <div className="space-y-6">
          <Skeleton />
          <Card>
            <Skeleton />
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !admin) {
    return (
      <DashboardLayout requiredRole={['SUPER_ADMIN']}>
        <Card>
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-[var(--error)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">Admin Not Found</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              The admin you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Button
              className="mt-6"
              onClick={() => router.push(ROUTES.SUPER_ADMIN.ADMINS)}
              tooltip="Return to admin list"
            >
              Back to Admins
            </Button>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Admins', href: ROUTES.SUPER_ADMIN.ADMINS },
            { label: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email },
          ]}
        />

        {/* Header Card */}
        <Card>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Admin Info */}
            <div className="flex gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary-light)]">
                <Shield className="h-8 w-8 text-[var(--primary)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-[var(--text)]">
                    {admin.firstName && admin.lastName
                      ? `${admin.firstName} ${admin.lastName}`
                      : 'Admin User'}
                  </h1>
                  <Badge variant={admin.role === 'ADMIN' ? 'info' : 'success'}>{admin.role}</Badge>
                  {admin.isActive ? (
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="error" size="sm">
                      Suspended
                    </Badge>
                  )}
                  {admin.mfaEnabled && (
                    <Badge variant="info" size="sm">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      MFA
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {admin.email}
                  </span>
                  {admin.mobileNumber && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {admin.mobileNumber}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {formatDate(admin.createdAt)}
                  </span>
                  {admin.lastActiveAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Active {formatRelativeDate(admin.lastActiveAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => router.push(ROUTES.SUPER_ADMIN.ADMINS)}
                tooltip="Return to admin list"
              >
                Back
              </Button>
              {admin.isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Ban className="h-4 w-4" />}
                  onClick={() => setShowSuspendModal(true)}
                  className="text-[var(--warning)]"
                  tooltip="Suspend this admin"
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<CheckCircle className="h-4 w-4" />}
                  onClick={() => activateMutation.mutate()}
                  isLoading={activateMutation.isPending}
                  tooltip="Reactivate this admin"
                >
                  Activate
                </Button>
              )}
              {admin.mfaEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ShieldOff className="h-4 w-4" />}
                  onClick={() => setShowResetMfaModal(true)}
                  tooltip="Reset MFA settings"
                >
                  Reset MFA
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setShowDeleteModal(true)}
                tooltip="Delete this admin"
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Account Tab */}
          {activeTab === 'account' && (
            <>
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">
                  Account Information
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <InfoItem icon={Mail} label="Email" value={admin.email} />
                  <InfoItem
                    icon={Phone}
                    label="Mobile"
                    value={admin.mobileNumber || 'Not provided'}
                    muted={!admin.mobileNumber}
                  />
                  <InfoItem
                    icon={User}
                    label="First Name"
                    value={admin.firstName || 'Not provided'}
                    muted={!admin.firstName}
                  />
                  <InfoItem
                    icon={User}
                    label="Last Name"
                    value={admin.lastName || 'Not provided'}
                    muted={!admin.lastName}
                  />
                  <InfoItem
                    icon={Shield}
                    label="Role"
                    value={<Badge variant="info">{admin.role}</Badge>}
                  />
                  <InfoItem
                    icon={CheckCircle}
                    label="Status"
                    value={
                      <Badge variant={admin.isActive ? 'success' : 'error'}>
                        {admin.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    }
                  />
                  <InfoItem icon={Calendar} label="Joined" value={formatDate(admin.createdAt)} />
                  <InfoItem
                    icon={Clock}
                    label="Last Active"
                    value={admin.lastActiveAt ? formatRelativeDate(admin.lastActiveAt) : 'Never'}
                  />
                </div>
              </Card>

              <Card>
                <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">
                  Security & Verification
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <InfoItem
                    icon={ShieldCheck}
                    label="MFA Status"
                    value={
                      <Badge variant={admin.mfaEnabled ? 'success' : 'warning'}>
                        {admin.mfaEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    }
                  />
                  <InfoItem
                    icon={Mail}
                    label="Email Verified"
                    value={
                      <Badge variant={admin.isEmailVerified ? 'success' : 'warning'}>
                        {admin.isEmailVerified ? 'Verified' : 'Not Verified'}
                      </Badge>
                    }
                  />
                  <InfoItem
                    icon={Phone}
                    label="Mobile Verified"
                    value={
                      <Badge variant={admin.isMobileVerified ? 'success' : 'warning'}>
                        {admin.isMobileVerified ? 'Verified' : 'Not Verified'}
                      </Badge>
                    }
                  />
                </div>
              </Card>

              {/* Managed contact details (OTP-verified).
                  Previously this page showed the mobile number read-only, so a
                  super-admin managing an admin had to know to go to the Users
                  page instead. Same components, same endpoints. */}
              <ManagedEmailSection userId={id} user={admin} invalidateUser={invalidateAdmin} />
              <ManagedMobileSection userId={id} user={admin} invalidateUser={invalidateAdmin} />
              <ManagedWhatsappSection userId={id} user={admin} invalidateUser={invalidateAdmin} />

              {admin.isSuspended && (
                <Card>
                  <div className="flex items-start gap-3">
                    <Ban className="h-5 w-5 shrink-0 text-[var(--error)]" />
                    <div>
                      <h4 className="font-semibold text-[var(--text)]">Account Suspended</h4>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        This account has been suspended.
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Activity Logs</h3>
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : activityData?.data?.items.length ? (
                <div className="space-y-4">
                  {activityData.data.items.map((log: AuditLog) => (
                    <div
                      key={log.id}
                      className="border-l-2 border-[var(--primary)] pb-4 pl-4 last:pb-0"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-[var(--text)]">{log.action}</p>
                          <p className="text-sm text-[var(--text-muted)]">
                            {log.entity}
                            {log.entityId && ` • ${log.entityId.substring(0, 8)}...`}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatRelativeDate(log.createdAt)}
                        </span>
                      </div>
                      {log.details && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-[var(--primary)]">
                            View Details
                          </summary>
                          <pre className="mt-2 overflow-auto rounded bg-[var(--bg-secondary)] p-2 text-xs">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-[var(--text-muted)]">
                  No activity logs found
                </p>
              )}
              {(activityData?.data?.total ?? 0) > 0 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={activityPage}
                    totalPages={
                      activityData?.data?.totalPages ??
                      Math.ceil((activityData?.data?.total ?? 0) / activityLimit)
                    }
                    onPageChange={setActivityPage}
                    totalItems={activityData?.data?.total ?? 0}
                    pageSize={activityLimit}
                    onPageSizeChange={(size) => {
                      setActivityLimit(size);
                      setActivityPage(1);
                    }}
                  />
                </div>
              )}
            </Card>
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && (
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Active Sessions</h3>
              {sessionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              ) : sessionsData?.data?.length ? (
                <div className="space-y-4">
                  {sessionsData.data.map((session: UserSession) => (
                    <div
                      key={session.id}
                      className="flex items-start justify-between rounded-lg border border-[var(--border)] p-4"
                    >
                      <div className="flex gap-3">
                        <Monitor className="h-5 w-5 text-[var(--text-muted)]" />
                        <div>
                          <p className="font-medium text-[var(--text)]">
                            {session.deviceName || 'Unknown Device'}
                          </p>
                          <div className="mt-1 space-y-1 text-sm text-[var(--text-muted)]">
                            <p className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {session.browser || 'Unknown Browser'} • {session.os || 'Unknown OS'}
                            </p>
                            <p className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {session.ipAddress} • {session.location || 'Unknown Location'}
                            </p>
                            <p className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last active:{' '}
                              {session.lastActivityAt
                                ? formatRelativeDate(session.lastActivityAt)
                                : 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeSessionMutation.mutate(session.id)}
                        isLoading={revokeSessionMutation.isPending}
                        tooltip="Revoke this session"
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-[var(--text-muted)]">No active sessions</p>
              )}
            </Card>
          )}

          {/* Statistics Tab */}
          {activeTab === 'statistics' && (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={Activity}
                  label="Total Actions"
                  value={activityData?.data?.total || 0}
                  variant="primary"
                />
                <StatCard icon={User} label="Users Managed" value="—" variant="info" />
                <StatCard icon={Shield} label="Moderations" value="—" variant="warning" />
                <StatCard icon={CheckCircle} label="Approvals" value="—" variant="success" />
              </div>

              <Card>
                <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Action Breakdown</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Detailed statistics coming soon...
                </p>
              </Card>
            </>
          )}

          {/* Permissions Tab — the live PBAC editor.
              This used to be a hardcoded list with `granted={true}` on every
              row, which claimed every admin held every capability. It now
              reflects and edits the real grant set. */}
          {activeTab === 'permissions' && (
            <AdminPermissionsPanel adminId={id} adminRole={admin.role} />
          )}
        </div>

        {/* Modals */}
        {/* Suspend Modal */}
        <Modal
          isOpen={showSuspendModal}
          onClose={() => {
            setShowSuspendModal(false);
            setSuspendReason('');
          }}
          title="Suspend Admin"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendReason('');
                }}
                tooltip="Cancel suspension"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => suspendMutation.mutate()}
                isLoading={suspendMutation.isPending}
                disabled={!suspendReason.trim()}
                tooltip="Confirm suspension"
              >
                Suspend
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Ban className="h-5 w-5 shrink-0 text-[var(--warning)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Suspending this admin will immediately revoke their access to the admin panel.
              </p>
            </div>
            <Input
              label="Reason for Suspension"
              placeholder="Enter reason..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              required
            />
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete Admin"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                tooltip="Cancel deletion"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                isLoading={deleteMutation.isPending}
                tooltip="Permanently delete admin"
              >
                Delete
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-[var(--error)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to permanently delete this admin account? This action cannot be
              undone.
            </p>
          </div>
        </Modal>

        {/* Reset MFA Modal */}
        <Modal
          isOpen={showResetMfaModal}
          onClose={() => setShowResetMfaModal(false)}
          title="Reset MFA"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowResetMfaModal(false)}
                tooltip="Cancel MFA reset"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => resetMfaMutation.mutate()}
                isLoading={resetMfaMutation.isPending}
                tooltip="Confirm MFA reset"
              >
                Reset MFA
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <ShieldOff className="h-5 w-5 shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              This will disable MFA for this admin. They will need to set it up again on their next
              login.
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

// Helper Components
function InfoItem({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-muted)]">{label}</p>
        <p className={`mt-1 ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  variant = 'primary',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}) {
  const colors = {
    primary: 'text-[var(--primary)] bg-[var(--primary-light)]',
    success: 'text-[var(--success)] bg-[var(--success-light)]',
    warning: 'text-[var(--warning)] bg-[var(--warning-light)]',
    error: 'text-[var(--error)] bg-[var(--error-light)]',
    info: 'text-[var(--info)] bg-[var(--info-light)]',
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${colors[variant]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
}

// `PermissionItem` was removed with the hardcoded capability list — the
// Permissions tab now renders <AdminPermissionsPanel>, which reads and
// writes real grants.
