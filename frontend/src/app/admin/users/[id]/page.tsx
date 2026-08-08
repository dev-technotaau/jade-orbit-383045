'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Mail,
  Phone,
  Calendar,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCog,
  Ban,
  CheckCircle,
  Trash2,
  AlertCircle,
  Key,
  Smartphone,
  User,
  FileText,
  Briefcase,
  Activity,
  MapPin,
  DollarSign,
  Code,
  Award,
  BookOpen,
  Globe,
  ExternalLink,
  Download,
  Users,
  Target,
  TrendingUp,
  Sparkles,
  GraduationCap,
  Languages,
  Star,
  Heart,
  Lightbulb,
  Building2,
  Power,
  Lock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PERM } from '@/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import LockBanner from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import BrandIcon from '@/components/common/BrandIcon';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { ROLE_LABELS } from '@/constants/enums';
import { formatDate, formatSalaryRange } from '@/lib/utils';
import type { Role } from '@/types/auth';
import type { ApiError } from '@/types/api';
import type { CandidateProfile } from '@/types/candidate';
import type { CompanyProfile } from '@/types/employer';
import type { AuditLog, JobApplication, JobPost } from '@/types/admin';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const roleChangeOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { can, isSuperAdmin } = usePermissions();
  const userId = params.id as string;

  // Ambient presence — see the LockBanner comment in the render for why
  // this stays VIEWING-only and never acquires an edit lock.
  const presence = useResourceLock('User', userId);

  // Tab state
  type TabKey = 'account' | 'profile' | 'applications' | 'jobs' | 'activity';
  const validTabs: TabKey[] = ['account', 'profile', 'applications', 'jobs', 'activity'];
  const [activeTab, setActiveTab] = useState<TabKey>('account');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && validTabs.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey);
    }
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    window.history.replaceState({}, '', url.toString());
  };

  // Modals
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState('');

  // Pagination
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsPageSize, setApplicationsPageSize] = useState(20);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageSize, setJobsPageSize] = useState(20);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId),
    queryFn: () => adminService.getUserDetails(userId),
    enabled: !!userId,
  });

  const user = data?.data;

  /**
   * Subject-scoped capabilities for the record on screen.
   *
   * This page serves BOTH candidates and employers, so every action key is
   * chosen from the target's own role — the same rule
   * `requireSubjectPermission` applies on the server. Without this the page
   * rendered Suspend / Change Role / Delete to every admin who could merely
   * VIEW a user, and each one 403'd on click.
   */
  const subject = user?.role === 'EMPLOYER' ? 'employers' : 'candidates';
  const canSuspend = can(`users.${subject}.account.suspend`);
  const canActivate = can(`users.${subject}.account.activate`);
  const canDelete = can(`users.${subject}.account.delete`);
  const canSeeAudit = can(`users.${subject}.activity.audit`) || can(PERM.PLATFORM_AUDIT_LOGS_VIEW);

  // Applications query
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery({
    queryKey: ['admin', 'user-applications', userId, applicationsPage, applicationsPageSize],
    queryFn: () => adminService.getUserApplications(userId, applicationsPage, applicationsPageSize),
    enabled: !!userId && activeTab === 'applications' && can(PERM.USERS_CANDIDATES_ACTIVITY_APPS),
  });

  // Jobs query
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin', 'user-jobs', userId, jobsPage, jobsPageSize],
    queryFn: () => adminService.getUserJobs(userId, jobsPage, jobsPageSize),
    enabled: !!userId && activeTab === 'jobs' && can(PERM.USERS_EMPLOYERS_ACTIVITY_JOBS),
  });

  // Activity query
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: [
      'admin',
      'audit-logs',
      { performedBy: userId, page: activityPage, limit: activityPageSize },
    ],
    queryFn: () =>
      adminService.getAuditLogs({
        performedBy: userId,
        page: activityPage,
        limit: activityPageSize,
      }),
    enabled: !!userId && activeTab === 'activity' && canSeeAudit,
  });

  const suspendMutation = useMutation({
    mutationFn: ({ reason, duration }: { reason: string; duration?: number }) =>
      adminService.suspendUser(userId, { reason, duration }),
    onSuccess: () => {
      showToast.success('User suspended successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId) });
      setShowSuspendModal(false);
      setSuspendReason('');
      setSuspendDuration('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to suspend user');
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => adminService.activateUser(userId),
    onSuccess: () => {
      showToast.success('User activated successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to activate user');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminService.deleteUser(userId),
    onSuccess: () => {
      showToast.success('User deleted successfully');
      router.push(ROUTES.ADMIN.USERS);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete user');
    },
  });

  const roleChangeMutation = useMutation({
    mutationFn: (role: Role) => adminService.updateUserRole(userId, { role }),
    onSuccess: () => {
      showToast.success('User role updated successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId) });
      setShowRoleModal(false);
      setNewRole('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update role');
    },
  });

  const handleSuspend = () => {
    if (!suspendReason.trim()) return;
    suspendMutation.mutate({
      reason: suspendReason,
      duration: suspendDuration ? parseInt(suspendDuration, 10) : undefined,
    });
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

  const getStatusColor = (status: string): string => {
    const m: Record<string, string> = {
      PENDING: 'bg-[var(--warning-light)] text-[var(--warning)]',
      REVIEWING: 'bg-[var(--info-light)] text-[var(--info)]',
      SHORTLISTED: 'bg-purple-100 text-purple-700',
      INTERVIEW: 'bg-cyan-100 text-cyan-700',
      OFFERED: 'bg-[var(--success-light)] text-[var(--success)]',
      HIRED: 'bg-emerald-100 text-emerald-700',
      REJECTED: 'bg-[var(--error-light)] text-[var(--error)]',
      WITHDRAWN: 'bg-gray-100 text-gray-600',
      ACTIVE: 'bg-[var(--success-light)] text-[var(--success)]',
      CLOSED: 'bg-gray-100 text-gray-600',
      DRAFT: 'bg-[var(--warning-light)] text-[var(--warning)]',
    };
    return m[status] || 'bg-[var(--bg-secondary)] text-[var(--text-muted)]';
  };

  const formatRelativeDate = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return formatDate(date);
  };

  // Calculate profile completeness
  const getProfileCompleteness = (profile: CandidateProfile | null | undefined): number => {
    if (!profile) return 0;
    const fields = [
      profile.headline,
      profile.bio,
      profile.resume,
      (profile.skills?.length ?? 0) > 0,
      (profile.education?.length ?? 0) > 0,
      (profile.experience?.length ?? 0) > 0,
      profile.currentLocation,
      profile.expectedSalaryMin,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  const tabs = [
    { key: 'account', label: 'Account' },
    { key: 'profile', label: 'Profile' },
    ...(user?.role === 'CANDIDATE'
      ? [{ key: 'applications' as const, label: 'Applications' }]
      : []),
    ...(user?.role === 'EMPLOYER' ? [{ key: 'jobs' as const, label: 'Jobs' }] : []),
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[PERM.USERS_CANDIDATES_VIEW, PERM.USERS_EMPLOYERS_VIEW]}
    >
      <div className="space-y-6">
        {/* Presence only — this page has destructive actions (suspend,
            delete, credential changes) that two admins can fire at once, so
            knowing a colleague is already on this account is the point. No
            edit lock: the actions are discrete API calls, not a long-lived
            form, so there is nothing to hold. */}
        <LockBanner lock={presence} entityLabel="account" />

        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: ROUTES.ADMIN.DASHBOARD },
            { label: 'Users', href: ROUTES.ADMIN.USERS },
            { label: user?.firstName ? `${user.firstName} ${user.lastName}` : 'User Detail' },
          ]}
        />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton variant="rect" height={200} />
            <Skeleton variant="rect" height={200} />
          </div>
        ) : user ? (
          <>
            {/* User Header Card */}
            <Card>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xl font-bold text-[var(--text-muted)]">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.firstName ? `${user.firstName}'s avatar` : 'User avatar'}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      (user.firstName?.[0] || user.email[0]).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[var(--text)]">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.firstName || 'N/A'}
                    </h1>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{user.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {ROLE_LABELS[user.role] || user.role}
                      </Badge>
                      {user.isSuspended ? (
                        <Badge variant="error">Suspended</Badge>
                      ) : user.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="neutral">Inactive</Badge>
                      )}
                      {user.isEmailVerified && (
                        <Badge variant="info" size="sm">
                          Email Verified
                        </Badge>
                      )}
                      {user.isMobileVerified && (
                        <Badge variant="info" size="sm">
                          Mobile Verified
                        </Badge>
                      )}
                      {user.isWhatsappVerified && (
                        <Badge variant="info" size="sm">
                          WhatsApp Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {user.isSuspended && canActivate && (
                    <Button
                      variant="outline"
                      size="sm"
                      tooltip="Remove suspension from this user"
                      leftIcon={<CheckCircle className="h-4 w-4" />}
                      onClick={() => activateMutation.mutate()}
                      isLoading={activateMutation.isPending}
                    >
                      Unsuspend
                    </Button>
                  )}
                  {!user.isActive && canActivate && (
                    <Button
                      variant="outline"
                      size="sm"
                      tooltip="Reactivate this user account"
                      leftIcon={<Power className="h-4 w-4" />}
                      onClick={() => activateMutation.mutate()}
                      isLoading={activateMutation.isPending}
                    >
                      Reactivate
                    </Button>
                  )}
                  {user.isActive && !user.isSuspended && canSuspend && (
                    <Button
                      variant="outline"
                      size="sm"
                      tooltip="Suspend this user"
                      leftIcon={<Ban className="h-4 w-4" />}
                      onClick={() => setShowSuspendModal(true)}
                    >
                      Suspend
                    </Button>
                  )}
                  {/* Role changes are `superAdminOnly` on the server
                      (admin.routes.ts) — no grant can ever unlock them, so
                      this is a role check, not a `can()`. */}
                  {isSuperAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      tooltip="Change user role"
                      leftIcon={<UserCog className="h-4 w-4" />}
                      onClick={() => {
                        setShowRoleModal(true);
                        setNewRole(user.role);
                      }}
                    >
                      Change Role
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      tooltip="Permanently delete this user"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setShowDeleteModal(true)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Tabs */}
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={handleTabChange}
              variant="underline"
            />

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Account Tab */}
              {activeTab === 'account' && (
                <Card
                  header={
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Account Information
                    </h2>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoItem icon={Mail} label="Email" value={user.email} />
                    <InfoItem
                      icon={Phone}
                      label="Mobile"
                      value={user.mobileNumber || 'Not provided'}
                    />
                    <InfoItem
                      icon={Phone}
                      label="WhatsApp"
                      value={user.whatsappNumber || 'Not provided'}
                    />
                    <InfoItem
                      icon={Calendar}
                      label="Account Created"
                      value={formatDate(user.createdAt)}
                    />
                    <InfoItem
                      icon={Clock}
                      label="Last Login"
                      value={user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                    />
                    <InfoItem
                      icon={Activity}
                      label="Last Active"
                      value={user.lastActiveAt ? formatRelativeDate(user.lastActiveAt) : 'Never'}
                    />
                    <InfoItem
                      icon={ShieldAlert}
                      label="Login Attempts"
                      value={String(user.loginAttempts)}
                    />
                    <InfoItem
                      icon={Key}
                      label="MFA Enabled"
                      value={user.mfaEnabled ? 'Yes' : 'No'}
                    />
                    <InfoItem
                      icon={ShieldCheck}
                      label="Email Verified"
                      value={user.isEmailVerified ? 'Yes' : 'No'}
                    />
                    <InfoItem
                      icon={Smartphone}
                      label="Mobile Verified"
                      value={user.isMobileVerified ? 'Yes' : 'No'}
                    />
                    <InfoItem
                      icon={Smartphone}
                      label="WhatsApp Verified"
                      value={user.isWhatsappVerified ? 'Yes' : 'No'}
                    />
                    <InfoItem
                      icon={Shield}
                      label="Role"
                      value={ROLE_LABELS[user.role] || user.role}
                    />
                  </div>
                </Card>
              )}

              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <>
                  {user.role === 'CANDIDATE' && user.candidateProfile && (
                    <CandidateProfileViewer profile={user.candidateProfile} />
                  )}
                  {user.role === 'EMPLOYER' && user.companyProfile && (
                    <EmployerProfileViewer profile={user.companyProfile} />
                  )}
                  {/* A profile the caller may not read is NOT the same as
                      no profile — say which, or the page quietly implies the
                      account is empty. */}
                  {(user.candidateProfileRedacted || user.companyProfileRedacted) && (
                    <Card>
                      <EmptyState
                        icon={Lock}
                        title="Profile restricted"
                        description={`This account has a profile, but reading it needs the ${
                          user.candidateProfileRedacted ? 'candidate profile' : 'company profile'
                        } permission. Ask a super-admin to grant it.`}
                      />
                    </Card>
                  )}
                  {user.role !== 'CANDIDATE' && user.role !== 'EMPLOYER' && (
                    <Card>
                      <EmptyState
                        icon={FileText}
                        title="No Profile Data"
                        description="This user role does not have an extended profile."
                      />
                    </Card>
                  )}
                </>
              )}

              {/* Applications Tab */}
              {activeTab === 'applications' && (
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Applications ({applicationsData?.data?.total || 0})
                    </h3>
                  </div>
                  {applicationsLoading ? (
                    <Skeleton variant="rect" height={200} />
                  ) : !applicationsData?.data?.items?.length ? (
                    <EmptyState
                      icon={Briefcase}
                      title="No Applications"
                      description="This candidate hasn't applied to any jobs yet."
                    />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Applied
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Job Title
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Company
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Match
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {applicationsData.data.items.map((app: JobApplication) => (
                              <tr key={app.id} className="hover:bg-[var(--bg-secondary)]">
                                <td className="px-4 py-3 text-[var(--text-muted)]">
                                  {formatDate(app.appliedAt)}
                                </td>
                                <td className="px-4 py-3 font-medium text-[var(--text)]">
                                  {app.job.title}
                                </td>
                                <td className="px-4 py-3 text-[var(--text-secondary)]">
                                  {app.job.company.companyName}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(app.status)}`}
                                  >
                                    {app.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-[var(--text-muted)]">
                                  {app.matchScore ? `${app.matchScore}%` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4">
                        <Pagination
                          currentPage={applicationsPage}
                          totalPages={applicationsData.data.totalPages}
                          onPageChange={setApplicationsPage}
                          totalItems={applicationsData.data.total}
                          pageSize={applicationsPageSize}
                          onPageSizeChange={(s) => {
                            setApplicationsPageSize(s);
                            setApplicationsPage(1);
                          }}
                        />
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Jobs Tab */}
              {activeTab === 'jobs' && (
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Job Posts ({jobsData?.data?.total || 0})
                    </h3>
                  </div>
                  {jobsLoading ? (
                    <Skeleton variant="rect" height={200} />
                  ) : !jobsData?.data?.items?.length ? (
                    <EmptyState
                      icon={Building2}
                      title="No Jobs Posted"
                      description="This employer hasn't posted any jobs yet."
                    />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Posted
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Job Title
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Applications
                              </th>
                              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                                Saved
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {jobsData.data.items.map((job: JobPost) => (
                              <tr key={job.id} className="hover:bg-[var(--bg-secondary)]">
                                <td className="px-4 py-3 text-[var(--text-muted)]">
                                  {formatDate(job.createdAt)}
                                </td>
                                <td className="px-4 py-3 font-medium text-[var(--text)]">
                                  {job.title}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(job.status)}`}
                                  >
                                    {job.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-[var(--text-muted)]">
                                  {job._applicationCount}
                                </td>
                                <td className="px-4 py-3 text-[var(--text-muted)]">
                                  {job._savedCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4">
                        <Pagination
                          currentPage={jobsPage}
                          totalPages={jobsData.data.totalPages}
                          onPageChange={setJobsPage}
                          totalItems={jobsData.data.total}
                          pageSize={jobsPageSize}
                          onPageSizeChange={(s) => {
                            setJobsPageSize(s);
                            setJobsPage(1);
                          }}
                        />
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Activity Log ({activityData?.data?.total || 0} actions)
                    </h3>
                  </div>
                  {activityLoading ? (
                    <Skeleton variant="rect" height={200} />
                  ) : !activityData?.data?.items?.length ? (
                    <EmptyState
                      icon={Activity}
                      title="No Activity"
                      description="No audit logs found for this user."
                    />
                  ) : (
                    <>
                      <div className="space-y-3">
                        {activityData.data.items.map((log: AuditLog) => (
                          <div key={log.id} className="border-primary border-l-2 py-2 pl-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-[var(--text)]">{log.action}</span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {formatRelativeDate(log.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-[var(--text-muted)]">
                              {log.entity} {log.entityId && `(${log.entityId.substring(0, 8)}...)`}
                            </p>
                            {log.details && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
                                  View Details
                                </summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg-secondary)] p-2 text-xs">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <Pagination
                          currentPage={activityPage}
                          totalPages={activityData.data.totalPages}
                          onPageChange={setActivityPage}
                          totalItems={activityData.data.total}
                          pageSize={activityPageSize}
                          onPageSizeChange={(s) => {
                            setActivityPageSize(s);
                            setActivityPage(1);
                          }}
                        />
                      </div>
                    </>
                  )}
                </Card>
              )}
            </div>
          </>
        ) : (
          <Card>
            <div className="py-12 text-center">
              <p className="text-[var(--text-muted)]">User not found.</p>
              <Tooltip content="Return to users list">
                <Link href={ROUTES.ADMIN.USERS}>
                  <Button variant="outline" size="sm" className="mt-4">
                    Back to Users
                  </Button>
                </Link>
              </Tooltip>
            </div>
          </Card>
        )}

        {/* Suspend Modal */}
        <Modal
          isOpen={showSuspendModal}
          onClose={() => {
            setShowSuspendModal(false);
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
                  setShowSuspendModal(false);
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
                This will prevent the user from accessing the platform.
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
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete User"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                tooltip="Cancel deletion"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                tooltip="Permanently delete this user"
                onClick={() => deleteMutation.mutate()}
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
              Are you sure you want to permanently delete this user? This action cannot be undone
              and all associated data will be removed.
            </p>
          </div>
        </Modal>

        {/* Change Role Modal */}
        <Modal
          isOpen={showRoleModal}
          onClose={() => {
            setShowRoleModal(false);
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
                  setShowRoleModal(false);
                  setNewRole('');
                }}
              >
                Cancel
              </Button>
              <Button
                tooltip="Confirm role update"
                onClick={() => roleChangeMutation.mutate(newRole as Role)}
                isLoading={roleChangeMutation.isPending}
                disabled={!newRole || newRole === user?.role}
              >
                Update Role
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Current role:{' '}
              <span className="font-medium text-[var(--text)]">
                {user ? ROLE_LABELS[user.role] || user.role : ''}
              </span>
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

// Helper component for displaying info items
function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-sm font-medium text-[var(--text)]">{value}</p>
      </div>
    </div>
  );
}

// Candidate Profile Viewer Component (Read-Only)
function CandidateProfileViewer({ profile }: { profile: CandidateProfile }) {
  const completeness = profile.profileCompleteness || 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Sidebar */}
      <div className="space-y-6">
        {/* Profile Completeness */}
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Profile Completeness</h3>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-2xl font-bold text-[var(--text)]">{completeness}%</span>
            <span
              className={`text-xs font-medium ${
                completeness < 50
                  ? 'text-error'
                  : completeness < 80
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--success)]'
              }`}
            >
              {completeness < 50 ? 'Low' : completeness < 80 ? 'Good' : 'Excellent'}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div
              className={`h-2 rounded-full ${
                completeness < 50
                  ? 'bg-error'
                  : completeness < 80
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--success)]'
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </Card>

        {/* Quick Info */}
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Quick Info</h3>
          <div className="space-y-2 text-sm">
            {profile.headline && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Headline</p>
                <p className="text-[var(--text)]">{profile.headline}</p>
              </div>
            )}
            {profile.currentCompany && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Current Company</p>
                <p className="text-[var(--text)]">{profile.currentCompany}</p>
              </div>
            )}
            {profile.currentRole && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Current Role</p>
                <p className="text-[var(--text)]">{profile.currentRole}</p>
              </div>
            )}
            {profile.experienceYears !== null && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Experience</p>
                <p className="text-[var(--text)]">{profile.experienceYears} years</p>
              </div>
            )}
            {(profile.expectedSalaryMin || profile.expectedSalaryMax) && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Expected Salary</p>
                <p className="text-[var(--text)]">
                  {formatSalaryRange(
                    profile.expectedSalaryMin ? Number(profile.expectedSalaryMin) : undefined,
                    profile.expectedSalaryMax ? Number(profile.expectedSalaryMax) : undefined,
                    profile.salaryCurrency || 'INR',
                  )}
                </p>
              </div>
            )}
            {profile.currentLocation && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Location</p>
                <p className="text-[var(--text)]">{profile.currentLocation}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Skills */}
        {profile.skills?.length > 0 && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.slice(0, 10).map((skill: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {skill}
                </Badge>
              ))}
              {profile.skills.length > 10 && (
                <Badge variant="neutral" size="sm">
                  +{profile.skills.length - 10} more
                </Badge>
              )}
            </div>
          </Card>
        )}

        {/* Languages */}
        {profile.languages?.length > 0 && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Languages</h3>
            <div className="flex flex-wrap gap-2">
              {profile.languages.slice(0, 10).map((lang: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {lang}
                </Badge>
              ))}
              {profile.languages.length > 10 && (
                <Badge variant="neutral" size="sm">
                  +{profile.languages.length - 10} more
                </Badge>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Main Content */}
      <div className="space-y-6 lg:col-span-2">
        {/* Personal Info */}
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <User className="h-5 w-5" />
            Personal Information
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.pronouns && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Pronouns</p>
                <p className="text-sm text-[var(--text)]">{profile.pronouns}</p>
              </div>
            )}
            {profile.gender && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Gender</p>
                <p className="text-sm text-[var(--text)]">{profile.gender}</p>
              </div>
            )}
            {profile.dob && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Date of Birth</p>
                <p className="text-sm text-[var(--text)]">{profile.dob}</p>
              </div>
            )}
            {profile.nationality && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Nationality</p>
                <p className="text-sm text-[var(--text)]">{profile.nationality}</p>
              </div>
            )}
          </div>
          {profile.bio && (
            <div className="mt-4">
              <p className="text-xs text-[var(--text-muted)]">Bio</p>
              <p className="text-sm whitespace-pre-line text-[var(--text)]">{profile.bio}</p>
            </div>
          )}
        </Card>

        {/* Education */}
        {(profile.education?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <GraduationCap className="h-5 w-5" />
              Education
            </h3>
            <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
              {profile.education!.map((edu, i) => (
                <div key={i} className="relative">
                  <div className="border-primary absolute top-1.5 -left-[1.3rem] h-2.5 w-2.5 rounded-full border-2 bg-white" />
                  <p className="font-semibold text-[var(--text)]">{edu.institution}</p>
                  <p className="text-sm text-[var(--text)]">
                    {edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`}
                  </p>
                  {(edu.startDate || edu.endDate) && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {edu.startDate} - {edu.endDate || 'Present'}
                    </p>
                  )}
                  {edu.grade && (
                    <p className="text-xs text-[var(--text-muted)]">Grade: {edu.grade}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Experience */}
        {(profile.experience?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Briefcase className="h-5 w-5" />
              Work Experience
            </h3>
            <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
              {profile.experience!.map((exp, i) => (
                <div key={i} className="relative">
                  <div className="border-primary absolute top-1.5 -left-[1.3rem] h-2.5 w-2.5 rounded-full border-2 bg-white" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{exp.company}</p>
                      <p className="text-sm text-[var(--text)]">{exp.role}</p>
                    </div>
                    {exp.isCurrent && (
                      <Badge variant="success" size="sm">
                        Current
                      </Badge>
                    )}
                  </div>
                  {(exp.startDate || exp.endDate) && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {exp.startDate} - {exp.endDate || 'Present'}
                    </p>
                  )}
                  {exp.description && (
                    <p className="mt-2 text-sm whitespace-pre-line text-[var(--text-muted)]">
                      {exp.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Certifications */}
        {(profile.certifications?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Award className="h-5 w-5" />
              Certifications
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.certifications!.map((cert, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="font-medium text-[var(--text)]">{cert.name}</p>
                  {cert.issuer && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{cert.issuer}</p>
                  )}
                  {cert.issueDate && (
                    <p className="text-xs text-[var(--text-muted)]">Issued: {cert.issueDate}</p>
                  )}
                  {cert.url && (
                    <Tooltip content="Open certificate in new tab">
                      <a
                        href={cert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        View Certificate <ExternalLink className="h-3 w-3" />
                      </a>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Projects */}
        {(profile.projects?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Code className="h-5 w-5" />
              Projects
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.projects!.map((project, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="font-medium text-[var(--text)]">{project.name}</p>
                  {project.description && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{project.description}</p>
                  )}
                  {(project.technologies?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {project.technologies!.map((tech: string, j: number) => (
                        <Badge key={j} variant="neutral" size="sm">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {project.url && (
                    <Tooltip content="Open project in new tab">
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        View Project <ExternalLink className="h-3 w-3" />
                      </a>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Social Profiles */}
        {(profile.githubProfile || profile.linkedinProfile || profile.portfolioUrl) && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Globe className="h-5 w-5" />
              Social Profiles
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.githubProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  tooltip="Open GitHub profile"
                  leftIcon={<BrandIcon name="github" className="h-4 w-4" />}
                  onClick={() => window.open(profile.githubProfile!, '_blank')}
                >
                  GitHub
                </Button>
              )}
              {profile.linkedinProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  tooltip="Open LinkedIn profile"
                  leftIcon={<BrandIcon name="linkedin" className="h-4 w-4" />}
                  onClick={() => window.open(profile.linkedinProfile!, '_blank')}
                >
                  LinkedIn
                </Button>
              )}
              {profile.portfolioUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  tooltip="Open portfolio website"
                  leftIcon={<Globe className="h-4 w-4" />}
                  onClick={() => window.open(profile.portfolioUrl!, '_blank')}
                >
                  Portfolio
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// Employer Profile Viewer Component (Read-Only)
function EmployerProfileViewer({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="space-y-6">
      {/* Company Overview */}
      <Card>
        {/* Cover Image Banner */}
        {profile.coverImage && (
          <div className="-mx-6 -mt-6 mb-6 h-48 w-[calc(100%+3rem)] overflow-hidden rounded-t-lg">
            <img
              src={profile.coverImage}
              alt={`${profile.companyName} cover`}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex gap-6">
          {profile.logo && (
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
              <img
                src={profile.logo}
                alt={profile.companyName}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[var(--text)]">{profile.companyName}</h2>
            {profile.tagline && <p className="mt-1 text-[var(--text-muted)]">{profile.tagline}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.companyType && (
                <Badge variant="info" size="sm">
                  {profile.companyType}
                </Badge>
              )}
              {profile.industry && (
                <Badge variant="neutral" size="sm">
                  {profile.industry}
                </Badge>
              )}
              {profile.companySize && (
                <Badge variant="neutral" size="sm">
                  {profile.companySize}
                </Badge>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {profile.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[var(--text-muted)]" />
                  <Tooltip content="Open company website">
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      Website
                    </a>
                  </Tooltip>
                </div>
              )}
              {profile.foundedYear && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text)]">Founded {profile.foundedYear}</span>
                </div>
              )}
              {profile.employeeCount && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text)]">
                    {profile.employeeCount} employees
                  </span>
                </div>
              )}
              {profile.headquarters && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text)]">{profile.headquarters}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Description */}
      {profile.description && (
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">About</h3>
          <p className="whitespace-pre-line text-[var(--text-muted)]">{profile.description}</p>
        </Card>
      )}

      {/* Mission & Vision */}
      {(profile.mission || profile.vision) && (
        <div className="grid gap-6 md:grid-cols-2">
          {profile.mission && (
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Target className="h-5 w-5" />
                Mission
              </h3>
              <p className="text-sm text-[var(--text-muted)]">{profile.mission}</p>
            </Card>
          )}
          {profile.vision && (
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Lightbulb className="h-5 w-5" />
                Vision
              </h3>
              <p className="text-sm text-[var(--text-muted)]">{profile.vision}</p>
            </Card>
          )}
        </div>
      )}

      {/* Culture & Values */}
      {(profile.companyCulture || profile.coreValues?.length > 0) && (
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Culture & Values</h3>
          {profile.companyCulture && (
            <p className="text-sm whitespace-pre-line text-[var(--text-muted)]">
              {profile.companyCulture}
            </p>
          )}
          {profile.coreValues?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.coreValues.map((value: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {value}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Benefits */}
      {profile.benefits?.length > 0 && (
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Benefits & Perks</h3>
          <div className="flex flex-wrap gap-2">
            {profile.benefits.map((benefit: string, i: number) => (
              <Badge key={i} variant="neutral" size="sm">
                {benefit}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Tech Stack */}
      {(profile.techStack?.length ?? 0) > 0 && (
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <Code className="h-5 w-5" />
            Tech Stack
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.techStack.map((tech, i) => (
              <Badge key={i} variant="info" size="sm">
                {tech}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Funding */}
      {(profile.fundingStage || profile.totalFundingRaised) && (
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <DollarSign className="h-5 w-5" />
            Funding
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.fundingStage && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Funding Stage</p>
                <Badge variant="info">{profile.fundingStage}</Badge>
              </div>
            )}
            {profile.totalFundingRaised && (
              <div>
                <p className="text-xs text-[var(--text-muted)]">Total Raised</p>
                <p className="text-sm font-medium text-[var(--text)]">
                  ${profile.totalFundingRaised.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Social Links */}
      {(profile.socialLinks?.linkedin ||
        profile.socialLinks?.twitter ||
        profile.socialLinks?.facebook) && (
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <Globe className="h-5 w-5" />
            Social Media
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.socialLinks?.linkedin && (
              <Button
                variant="outline"
                size="sm"
                tooltip="Open LinkedIn page"
                leftIcon={<BrandIcon name="linkedin" className="h-4 w-4" />}
                onClick={() => window.open(profile.socialLinks!.linkedin!, '_blank')}
              >
                LinkedIn
              </Button>
            )}
            {profile.socialLinks?.twitter && (
              <Button
                variant="outline"
                size="sm"
                tooltip="Open X page"
                leftIcon={<BrandIcon name="x" className="h-4 w-4" />}
                onClick={() => window.open(profile.socialLinks!.twitter!, '_blank')}
              >
                X
              </Button>
            )}
            {profile.socialLinks?.facebook && (
              <Button
                variant="outline"
                size="sm"
                tooltip="Open Facebook page"
                leftIcon={<BrandIcon name="facebook" className="h-4 w-4" />}
                onClick={() => window.open(profile.socialLinks!.facebook!, '_blank')}
              >
                Facebook
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
