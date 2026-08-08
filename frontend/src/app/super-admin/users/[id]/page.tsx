'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  Camera,
  X,
  Power,
  Monitor,
  Globe,
  LogOut,
  MessageCircle,
  User,
  FileText,
  Briefcase,
  Building2,
  Activity,
  MapPin,
  DollarSign,
  Code,
  Award,
  BookOpen,
  Linkedin,
  Github,
  ExternalLink,
  Download,
  Image as ImageIcon,
  Users,
  Target,
  TrendingUp,
  Sparkles,
  GraduationCap,
  Languages,
  Star,
  FolderOpen,
  FileCode,
  Heart,
  Lightbulb,
  Edit,
  Save,
  Lock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import LockBanner from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import { PERM } from '@/constants/permissions';
import BrandIcon from '@/components/common/BrandIcon';
import { SiWhatsapp } from 'react-icons/si';
import Card from '@/components/ui/Card';
import { promptDialog } from '@/components/ui/dialog-service';
import Badge from '@/components/ui/Badge';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import Pagination from '@/components/ui/Pagination';
import OtpInput from '@/components/auth/OtpInput';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import {
  ManagedEmailSection,
  ManagedMobileSection,
  ManagedWhatsappSection,
} from '@/components/super-admin/ManagedContactSections';
import { QUERY_KEYS } from '@/constants/config';
import { useOtpConfig } from '@/hooks/use-otp-config';
import { usePasswordRules } from '@/hooks/use-security-config';
import { ROUTES } from '@/constants/routes';
import { ROLE_LABELS } from '@/constants/enums';
import { formatDate } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/types/auth';
import type { ApiError } from '@/types/api';
import type { CandidateProfile } from '@/types/candidate';
import type { CompanyProfile } from '@/types/employer';
import type { AuditLog, JobApplication, JobPost, VerificationRequest } from '@/types/admin';
import {
  UserFollowingPanel,
  CompanyFollowersPanel,
} from '@/components/super-admin/FollowDrillPanels';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const roleChangeOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

// Editable field component
interface EditableFieldProps {
  value: string | number | boolean | null | undefined;
  onSave: (newValue: string | number | boolean) => Promise<void>;
  type?: 'text' | 'number' | 'textarea' | 'boolean';
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

function EditableField({
  value,
  onSave,
  type = 'text',
  maxLength,
  placeholder,
  className = '',
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string | number>(value != null ? String(value) : '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(
        type === 'number'
          ? Number(editValue)
          : type === 'boolean'
            ? editValue === 'true'
            : editValue,
      );
      setIsEditing(false);
      showToast.success('Field updated successfully');
    } catch (error) {
      showToast.error('Failed to update field');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value != null ? String(value) : '');
    setIsEditing(false);
  };

  if (type === 'boolean') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span>{value ? 'Yes' : 'No'}</span>
        {!isEditing ? (
          <Tooltip content="Edit this field">
            <button
              onClick={() => setIsEditing(true)}
              className="text-primary hover:text-primary/80 cursor-pointer p-1"
              aria-label="Edit"
            >
              <Edit className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]}
              value={String(editValue)}
              onChange={(v) => setEditValue(v)}
            />
            <Tooltip content="Save changes">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="text-success hover:text-success/80 cursor-pointer p-1"
                aria-label="Save"
              >
                <Save className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip content="Discard changes">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="text-error hover:text-error/80 cursor-pointer p-1"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div className={`group flex items-center gap-2 ${className}`}>
        <span>{value || placeholder || '—'}</span>
        <Tooltip content="Edit this field">
          <button
            onClick={() => {
              setEditValue(value != null ? String(value) : '');
              setIsEditing(true);
            }}
            className="text-primary hover:text-primary/80 cursor-pointer p-1 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Edit"
          >
            <Edit className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {type === 'textarea' ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          rows={3}
          autoFocus
        />
      ) : (
        <Input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="flex-1"
          autoFocus
        />
      )}
      <Tooltip content="Save changes">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="text-success hover:text-success/80 cursor-pointer p-1"
          aria-label="Save"
        >
          <Save className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content="Discard changes">
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="text-error hover:text-error/80 cursor-pointer p-1"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}

export default function SuperAdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const otpConfig = useOtpConfig();
  const passwordRules = usePasswordRules();
  const userId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Presence + edit lock. Same `resourceType` as `/admin/users/[id]`, so the
   * two screens see each other — an admin on one and a super-admin on the
   * other are editing the same record and now know it.
   *
   * This page became editable by any admin holding
   * `users.candidates.profile.edit` when the super-admin router was widened,
   * while its lower-privilege twin already had presence. That inversion is
   * what this closes.
   */
  const lock = useResourceLock('User', userId);

  // Tab state
  type TabKey = 'account' | 'profile' | 'applications' | 'jobs' | 'activity' | 'verification';
  const validTabs: TabKey[] = [
    'account',
    'profile',
    'applications',
    'jobs',
    'activity',
    'verification',
  ];
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
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'send' | 'verify'>('send');
  const [resetOtp, setResetOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resetSuperAdminPassword, setResetSuperAdminPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const closeResetPwModal = () => {
    setShowResetPwModal(false);
    setNewPassword('');
    setResetStep('send');
    setResetOtp('');
    setResendTimer(0);
    setResetSuperAdminPassword('');
    setResetConfirmPassword('');
    setResetErrors({});
  };

  // Edit profile
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobileNumber, setEditMobileNumber] = useState('');
  const [editWhatsappNumber, setEditWhatsappNumber] = useState('');
  const [editIsMobileVerified, setEditIsMobileVerified] = useState(false);
  const [editIsWhatsappVerified, setEditIsWhatsappVerified] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId),
    queryFn: () => adminService.getUserDetails(userId),
    enabled: !!userId,
  });

  const user = data?.data;
  const isAdminPasswordFlow = user?.role === 'ADMIN';

  const validateAdminPasswordForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!resetSuperAdminPassword) errs.password = 'Your password is required';
    if (!newPassword) errs.newPassword = 'New password is required';
    else if (newPassword.length < passwordRules.MIN_LENGTH)
      errs.newPassword = `Password must be at least ${passwordRules.MIN_LENGTH} characters`;
    if (!resetConfirmPassword) errs.confirmPassword = 'Please confirm the new password';
    else if (newPassword !== resetConfirmPassword) errs.confirmPassword = 'Passwords do not match';
    setResetErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSendResetOtp = async () => {
    if (isAdminPasswordFlow) {
      if (!validateAdminPasswordForm()) return;
    }
    setIsSendingOtp(true);
    try {
      if (isAdminPasswordFlow) {
        await adminService.initiateAdminPasswordChange(userId, {
          password: resetSuperAdminPassword,
          newPassword,
        });
      } else {
        await adminService.sendPasswordResetOtp(userId);
      }
      showToast.success('Verification code sent to user email');
      setResetStep('verify');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setResetErrors({});
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendResetOtp = async () => {
    setIsResending(true);
    try {
      if (isAdminPasswordFlow) {
        await adminService.resendAdminPasswordOtp(userId);
      } else {
        await adminService.sendPasswordResetOtp(userId);
      }
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

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: QUERY_KEYS.SUPER_ADMIN.USER_SESSIONS(userId),
    queryFn: () => adminService.getUserSessions(userId),
    enabled: !!userId,
  });

  const sessions = sessionsData?.data || [];

  // Pagination state for new tabs
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [jobsPage, setJobsPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [verificationsPage, setVerificationsPage] = useState(1);

  // Applications query
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery({
    queryKey: ['admin', 'user-applications', userId, applicationsPage],
    queryFn: () => adminService.getUserApplications(userId, applicationsPage, 20),
    enabled: !!userId && activeTab === 'applications',
  });

  // Jobs query
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin', 'user-jobs', userId, jobsPage],
    queryFn: () => adminService.getUserJobs(userId, jobsPage, 20),
    enabled: !!userId && activeTab === 'jobs',
  });

  // Activity query
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', { performedBy: userId, page: activityPage }],
    queryFn: () =>
      adminService.getAuditLogs({ performedBy: userId, page: activityPage, limit: 20 }),
    enabled: !!userId && activeTab === 'activity',
  });

  // Verifications query
  const { data: verificationsData, isLoading: verificationsLoading } = useQuery({
    queryKey: ['admin', 'user-verifications', userId, verificationsPage],
    queryFn: () => adminService.getUserVerifications(userId, verificationsPage, 20),
    enabled: !!userId && activeTab === 'verification',
  });

  const invalidateUser = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN.USER_DETAIL(userId) });

  const suspendMutation = useMutation({
    mutationFn: ({ reason, duration }: { reason: string; duration?: number }) =>
      adminService.suspendUser(userId, { reason, duration }),
    onSuccess: () => {
      showToast.success('User suspended successfully');
      invalidateUser();
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
      invalidateUser();
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
      router.push(ROUTES.SUPER_ADMIN.USERS);
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
      invalidateUser();
      setShowRoleModal(false);
      setNewRole('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update role');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ pw, otp }: { pw: string; otp: string }) => {
      if (isAdminPasswordFlow) {
        return adminService.confirmAdminPasswordChange(userId, { otp });
      }
      return adminService.resetUserPassword(userId, { newPassword: pw, otp });
    },
    onSuccess: () => {
      showToast.success('Password reset successfully — all sessions revoked');
      closeResetPwModal();
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SUPER_ADMIN.USER_SESSIONS(userId) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reset password');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => adminService.deactivateUser(userId),
    onSuccess: () => {
      showToast.success('User deactivated');
      invalidateUser();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to deactivate user');
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Parameters<typeof adminService.updateUserProfile>[1]) =>
      adminService.updateUserProfile(userId, data),
    onSuccess: () => {
      showToast.success('Profile updated');
      invalidateUser();
      setIsEditing(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update profile');
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => adminService.uploadUserAvatar(userId, file),
    onSuccess: () => {
      showToast.success('Avatar uploaded');
      invalidateUser();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to upload avatar');
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => adminService.removeUserAvatar(userId),
    onSuccess: () => {
      showToast.success('Avatar removed');
      invalidateUser();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to remove avatar');
    },
  });

  const updateCandidateProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminService.updateCandidateProfile(userId, data),
    onSuccess: () => {
      invalidateUser();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update candidate profile');
    },
  });

  const updateCompanyProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => adminService.updateCompanyProfile(userId, data),
    onSuccess: () => {
      invalidateUser();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update company profile');
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: () => adminService.revokeUserSessions(userId),
    onSuccess: () => {
      showToast.success('All sessions revoked');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SUPER_ADMIN.USER_SESSIONS(userId) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to revoke sessions');
    },
  });

  const updateVerificationMutation = useMutation({
    mutationFn: ({
      verificationId,
      status,
      reason,
    }: {
      verificationId: string;
      status: 'APPROVED' | 'REJECTED';
      reason?: string;
    }) => adminService.updateVerificationStatus(verificationId, status, reason),
    onSuccess: () => {
      showToast.success('Verification status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-verifications', userId] });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update verification');
    },
  });

  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await adminService.revokeUserSession(userId, sessionId);
      showToast.success('Session revoked');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SUPER_ADMIN.USER_SESSIONS(userId) });
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to revoke session');
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast.error('Image must be under 5 MB');
      return;
    }
    uploadAvatarMutation.mutate(file);
  };

  const isAdminTarget = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Check if there are any unsaved changes in edit mode
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing || !user) return false;

    // Check name changes
    if (editFirstName !== (user.firstName || '')) return true;
    if (editLastName !== (user.lastName || '')) return true;

    // Check other fields only for non-admin targets
    if (!isAdminTarget) {
      if (editEmail !== user.email) return true;
      const effectiveMobile = editMobileNumber.trim() || null;
      if (effectiveMobile !== (user.mobileNumber || null)) return true;
      if (editIsMobileVerified !== user.isMobileVerified) return true;
      const effectiveWhatsapp = editWhatsappNumber.trim() || null;
      if (effectiveWhatsapp !== (user.whatsappNumber || null)) return true;
      if (editIsWhatsappVerified !== user.isWhatsappVerified) return true;
    }

    return false;
  }, [
    isEditing,
    user,
    editFirstName,
    editLastName,
    editEmail,
    editMobileNumber,
    editWhatsappNumber,
    editIsMobileVerified,
    editIsWhatsappVerified,
    isAdminTarget,
  ]);

  const startEditing = () => {
    if (!user) return;
    setEditFirstName(user.firstName || '');
    setEditLastName(user.lastName || '');
    if (!isAdminTarget) {
      setEditEmail(user.email);
      setEditMobileNumber(user.mobileNumber || '');
      setEditWhatsappNumber(user.whatsappNumber || '');
      setEditIsMobileVerified(user.isMobileVerified);
      setEditIsWhatsappVerified(user.isWhatsappVerified);
    }
    setIsEditing(true);
  };

  const handleSaveProfile = () => {
    if (!user) return;
    const updates: Record<string, unknown> = {};
    if (editFirstName && editFirstName !== user.firstName) updates.firstName = editFirstName;
    if (editLastName && editLastName !== user.lastName) updates.lastName = editLastName;

    // Only include email/mobile/whatsapp for non-admin targets (admin uses OTP routes)
    if (!isAdminTarget) {
      if (editEmail && editEmail !== user.email) updates.email = editEmail;

      const effectiveMobile = editMobileNumber.trim() || null;
      if (effectiveMobile !== (user.mobileNumber || null)) updates.mobileNumber = effectiveMobile;
      if (editIsMobileVerified !== user.isMobileVerified)
        updates.isMobileVerified = editIsMobileVerified;

      const effectiveWhatsapp = editWhatsappNumber.trim() || null;
      if (effectiveWhatsapp !== (user.whatsappNumber || null))
        updates.whatsappNumber = effectiveWhatsapp;
      if (editIsWhatsappVerified !== user.isWhatsappVerified)
        updates.isWhatsappVerified = editIsWhatsappVerified;
    }

    if (Object.keys(updates).length === 0) {
      setIsEditing(false);
      return;
    }
    updateProfileMutation.mutate(updates as Parameters<typeof adminService.updateUserProfile>[1]);
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

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return 'Unknown Device';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.slice(0, 40);
  };

  // Helper component for info items. `icon` is widened from
  // `LucideIcon` to any component accepting a `className` — covers
  // both lucide icons and `react-icons/si` brand SVGs (e.g. SiWhatsapp)
  // which share the same call shape.
  const InfoItem = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
  }) => (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value}</p>
    </div>
  );

  // Tab items definition
  const tabItems = [
    { key: 'account' as const, label: 'Account' },
    { key: 'profile' as const, label: 'Profile' },
    ...(user?.role === 'CANDIDATE'
      ? [{ key: 'applications' as const, label: 'Applications' }]
      : []),
    ...(user?.role === 'EMPLOYER' ? [{ key: 'jobs' as const, label: 'Jobs' }] : []),
    { key: 'activity' as const, label: 'Activity' },
    { key: 'verification' as const, label: 'Verification' },
  ];

  // Candidate Profile Viewer Component
  const CandidateProfileViewer = ({ profile }: { profile: CandidateProfile }) => {
    const completeness = profile.profileCompleteness || 0;
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Profile Completeness */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Profile Completeness</h3>
            <div className="relative pt-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl font-semibold text-[var(--text)]">{completeness}%</span>
                <span
                  className={`text-xs ${
                    completeness < 50
                      ? 'text-[var(--error)]'
                      : completeness < 80
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--success)]'
                  }`}
                >
                  {completeness < 50 ? 'Low' : completeness < 80 ? 'Good' : 'Excellent'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-[var(--bg-secondary)]">
                <div
                  style={{ width: `${completeness}%` }}
                  className={`h-full ${
                    completeness < 50
                      ? 'bg-[var(--error)]'
                      : completeness < 80
                        ? 'bg-[var(--warning)]'
                        : 'bg-[var(--success)]'
                  }`}
                />
              </div>
            </div>
          </Card>

          {/* Quick Info */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Quick Info</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Headline</p>
                <EditableField
                  value={profile.headline}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ headline: val });
                  }}
                  type="text"
                  maxLength={200}
                  placeholder="No headline set"
                  className="font-medium"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Company</p>
                <EditableField
                  value={profile.currentCompany}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ currentCompany: val });
                  }}
                  type="text"
                  maxLength={200}
                  placeholder="No company set"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Role</p>
                <EditableField
                  value={profile.currentRole}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ currentRole: val });
                  }}
                  type="text"
                  maxLength={200}
                  placeholder="No role set"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Experience</p>
                <EditableField
                  value={profile.experienceYears}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ experienceYears: val });
                  }}
                  type="number"
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Expected Salary</p>
                <EditableField
                  value={profile.expectedSalary}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ expectedSalary: val });
                  }}
                  type="number"
                  placeholder="Not specified"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Notice Period (days)</p>
                <EditableField
                  value={profile.noticePeriod}
                  onSave={async (val) => {
                    await updateCandidateProfileMutation.mutateAsync({ noticePeriod: val });
                  }}
                  type="number"
                  placeholder="Not specified"
                />
              </div>
            </div>
          </Card>

          {/* Contact */}
          {(profile.phone ||
            profile.alternatePhone ||
            profile.alternateEmail ||
            profile.currentLocation) && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Contact</h3>
              <div className="space-y-2 text-sm">
                {profile.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text)]">{profile.phone}</span>
                  </div>
                )}
                {profile.alternatePhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text)]">{profile.alternatePhone}</span>
                  </div>
                )}
                {profile.alternateEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text)]">{profile.alternateEmail}</span>
                  </div>
                )}
                {profile.currentLocation && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[var(--text)]">{profile.currentLocation}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Work Preferences */}
          {((profile.preferredJobType?.length ?? 0) > 0 ||
            (profile.preferredWorkMode?.length ?? 0) > 0) && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Work Preferences</h3>
              <div className="space-y-2">
                {(profile.preferredJobType?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-[var(--text-muted)]">Job Types</p>
                    <div className="flex flex-wrap gap-1">
                      {profile.preferredJobType.map((type, i) => (
                        <Badge key={i} variant="neutral" size="sm">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(profile.preferredWorkMode?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-[var(--text-muted)]">Work Modes</p>
                    <div className="flex flex-wrap gap-1">
                      {profile.preferredWorkMode.map((mode, i) => (
                        <Badge key={i} variant="neutral" size="sm">
                          {mode}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Additional Info */}
          {(profile.visaStatus ||
            profile.workPermitStatus ||
            profile.passportNumber ||
            profile.drivingLicenseType ||
            profile.ownVehicle !== undefined ||
            profile.isPwD ||
            profile.disabilityType ||
            profile.veteranStatus ||
            profile.blockedCompanies?.length > 0) && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Additional Info</h3>
              <div className="space-y-2 text-sm">
                {profile.visaStatus && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Visa Status</p>
                    <Badge variant="neutral" size="sm">
                      {profile.visaStatus}
                    </Badge>
                  </div>
                )}
                {profile.workPermitStatus && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Work Permit</p>
                    <Badge variant="neutral" size="sm">
                      {profile.workPermitStatus}
                    </Badge>
                  </div>
                )}
                {profile.passportNumber && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Passport</p>
                    <p className="text-[var(--text)]">
                      XXX-XXXX-{profile.passportNumber.slice(-4)}
                    </p>
                  </div>
                )}
                {profile.drivingLicenseType && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Driving License</p>
                    <p className="text-[var(--text)]">{profile.drivingLicenseType}</p>
                  </div>
                )}
                {profile.ownVehicle !== undefined && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Own Vehicle</p>
                    <Badge variant={profile.ownVehicle ? 'success' : 'neutral'} size="sm">
                      {profile.ownVehicle ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                )}
                {profile.isPwD && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">PwD Status</p>
                    <Badge variant="info" size="sm">
                      Person with Disability
                    </Badge>
                    {profile.disabilityType && (
                      <p className="mt-1 text-xs text-[var(--text)]">{profile.disabilityType}</p>
                    )}
                    {profile.disabilityPercentage && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {profile.disabilityPercentage}%
                      </p>
                    )}
                  </div>
                )}
                {profile.veteranStatus && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Veteran Status</p>
                    <Badge variant="success" size="sm">
                      {profile.veteranStatus}
                    </Badge>
                  </div>
                )}
                {profile.blockedCompanies?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-[var(--text-muted)]">Blocked Companies</p>
                    <div className="flex flex-wrap gap-1">
                      {profile.blockedCompanies.map((company: string, i: number) => (
                        <Badge key={i} variant="error" size="sm">
                          {company}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Resume */}
          {profile.resume && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <FileText className="h-5 w-5" />
                Resume
              </h3>
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-center gap-3">
                  <FileText className="text-primary h-8 w-8" />
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {profile.resume.split('/').pop()}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Uploaded resume</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={() => window.open(profile.resume!, '_blank')}
                  tooltip="Download user resume"
                >
                  Download
                </Button>
              </div>
            </Card>
          )}

          {/* Skills */}
          {profile.skills?.length > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Code className="h-5 w-5" />
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill: string, i: number) => (
                  <Badge key={i} variant="info" size="sm">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Languages */}
          {profile.languages?.length > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Languages className="h-5 w-5" />
                Languages
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang: string, i: number) => (
                  <Badge key={i} variant="info" size="sm">
                    {lang}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

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
                      <p className="text-sm text-[var(--text-muted)]">Grade: {edu.grade}</p>
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
                Experience
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
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{exp.description}</p>
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
                      <p className="text-sm text-[var(--text-muted)]">{cert.issuer}</p>
                    )}
                    {cert.issueDate && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Issued: {cert.issueDate}
                        {cert.expiryDate && ` | Expires: ${cert.expiryDate}`}
                      </p>
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
                <FolderOpen className="h-5 w-5" />
                Projects
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.projects!.map((project, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{project.name}</p>
                    {project.description && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{project.description}</p>
                    )}
                    {project.url && (
                      <Tooltip content="Open project link">
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

          {/* IT Skills */}
          {(profile.itSkills?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <FileCode className="h-5 w-5" />
                IT Skills
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Technology
                      </th>
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Version
                      </th>
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Proficiency
                      </th>
                      <th className="pb-2 text-right font-medium text-[var(--text-muted)]">
                        Years
                      </th>
                      <th className="pb-2 text-right font-medium text-[var(--text-muted)]">
                        Last Used
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.itSkills!.map((skill, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 text-[var(--text)]">{skill.technology}</td>
                        <td className="py-2 text-[var(--text-muted)]">{skill.version || '—'}</td>
                        <td className="py-2">
                          <Badge variant="info" size="sm">
                            {skill.proficiency}
                          </Badge>
                        </td>
                        <td className="py-2 text-right text-[var(--text)]">
                          {skill.experienceYears || '—'}
                        </td>
                        <td className="py-2 text-right text-[var(--text-muted)]">
                          {skill.lastUsed || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Skills with Proficiency */}
          {(profile.skillsWithProficiency?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Star className="h-5 w-5" />
                Skills with Proficiency
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">Skill</th>
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Proficiency
                      </th>
                      <th className="pb-2 text-right font-medium text-[var(--text-muted)]">
                        Years
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.skillsWithProficiency!.map((skill, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 text-[var(--text)]">{skill.skill}</td>
                        <td className="py-2">
                          <Badge
                            variant={
                              skill.proficiency === 'EXPERT'
                                ? 'success'
                                : skill.proficiency === 'ADVANCED'
                                  ? 'info'
                                  : 'neutral'
                            }
                            size="sm"
                          >
                            {skill.proficiency}
                          </Badge>
                        </td>
                        <td className="py-2 text-right text-[var(--text)]">{skill.years || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Languages */}
          {profile.languages?.length > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Languages className="h-5 w-5" />
                Languages
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang: string, i: number) => (
                  <Badge key={i} variant="neutral" size="sm">
                    {lang}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Language Proficiency */}
          {(profile.languageProficiency?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Languages className="h-5 w-5" />
                Language Proficiency
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Language
                      </th>
                      <th className="pb-2 text-left font-medium text-[var(--text-muted)]">
                        Proficiency
                      </th>
                      <th className="pb-2 text-center font-medium text-[var(--text-muted)]">
                        Read
                      </th>
                      <th className="pb-2 text-center font-medium text-[var(--text-muted)]">
                        Write
                      </th>
                      <th className="pb-2 text-center font-medium text-[var(--text-muted)]">
                        Speak
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.languageProficiency!.map((lang, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 text-[var(--text)]">{lang.language}</td>
                        <td className="py-2">
                          <Badge variant="info" size="sm">
                            {lang.proficiency}
                          </Badge>
                        </td>
                        <td className="py-2 text-center">{lang.read ? '✓' : '—'}</td>
                        <td className="py-2 text-center">{lang.write ? '✓' : '—'}</td>
                        <td className="py-2 text-center">{lang.speak ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Publications */}
          {(profile.publications?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <BookOpen className="h-5 w-5" />
                Publications
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.publications!.map((pub, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{pub.title}</p>
                    {pub.publisher && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{pub.publisher}</p>
                    )}
                    {pub.publicationDate && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Published: {pub.publicationDate}
                      </p>
                    )}
                    {pub.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{pub.description}</p>
                    )}
                    {pub.authors && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Authors: {pub.authors}
                      </p>
                    )}
                    {pub.url && (
                      <Tooltip content="Open publication link">
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          View Publication <ExternalLink className="h-3 w-3" />
                        </a>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Patents */}
          {(profile.patents?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Award className="h-5 w-5" />
                Patents
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.patents!.map((patent, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-[var(--text)]">{patent.title}</p>
                      {patent.status && (
                        <Badge
                          variant={patent.status === 'GRANTED' ? 'success' : 'warning'}
                          size="sm"
                        >
                          {patent.status}
                        </Badge>
                      )}
                    </div>
                    {patent.patentOffice && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{patent.patentOffice}</p>
                    )}
                    {patent.patentNumber && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Patent #: {patent.patentNumber}
                      </p>
                    )}
                    {(patent.filingDate || patent.issueDate) && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {patent.filingDate && `Filed: ${patent.filingDate}`}
                        {patent.issueDate && ` | Issued: ${patent.issueDate}`}
                      </p>
                    )}
                    {patent.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{patent.description}</p>
                    )}
                    {patent.inventors && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Inventors: {patent.inventors}
                      </p>
                    )}
                    {patent.url && (
                      <Tooltip content="Open patent link">
                        <a
                          href={patent.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          View Patent <ExternalLink className="h-3 w-3" />
                        </a>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Awards */}
          {(profile.awards?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Award className="h-5 w-5" />
                Awards & Honors
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.awards!.map((award, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{award.title}</p>
                    {award.issuer && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{award.issuer}</p>
                    )}
                    {award.date && (
                      <p className="text-xs text-[var(--text-muted)]">Awarded: {award.date}</p>
                    )}
                    {award.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{award.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Courses */}
          {(profile.courses?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <BookOpen className="h-5 w-5" />
                Courses & Training
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.courses!.map((course, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{course.name}</p>
                    {course.provider && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{course.provider}</p>
                    )}
                    {course.completionDate && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Completed: {course.completionDate}
                      </p>
                    )}
                    {course.associatedWith && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Associated: {course.associatedWith}
                      </p>
                    )}
                    {course.url && (
                      <Tooltip content="Open certificate link">
                        <a
                          href={course.url}
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

          {/* Test Scores */}
          {(profile.testScores?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Star className="h-5 w-5" />
                Test Scores
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.testScores!.map((test, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-[var(--text)]">{test.testName}</p>
                      {test.score && (
                        <Badge variant="success" size="sm">
                          {test.score}
                        </Badge>
                      )}
                    </div>
                    {test.dateOfExam && (
                      <p className="text-xs text-[var(--text-muted)]">Taken: {test.dateOfExam}</p>
                    )}
                    {test.associatedWith && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Associated: {test.associatedWith}
                      </p>
                    )}
                    {test.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{test.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Volunteer Experience */}
          {(profile.volunteerExperience?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Heart className="h-5 w-5" />
                Volunteer Experience
              </h3>
              <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
                {profile.volunteerExperience!.map((vol, i) => (
                  <div key={i} className="relative">
                    <div className="border-primary absolute top-1.5 -left-[1.3rem] h-2.5 w-2.5 rounded-full border-2 bg-white" />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-[var(--text)]">{vol.organization}</p>
                        <p className="text-sm text-[var(--text)]">{vol.role}</p>
                      </div>
                      {vol.isCurrent && (
                        <Badge variant="success" size="sm">
                          Current
                        </Badge>
                      )}
                    </div>
                    {vol.cause && (
                      <p className="text-sm text-[var(--text-muted)]">Cause: {vol.cause}</p>
                    )}
                    {(vol.startDate || vol.endDate) && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {vol.startDate} - {vol.endDate || 'Present'}
                      </p>
                    )}
                    {vol.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{vol.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Professional Memberships */}
          {(profile.professionalMemberships?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Users className="h-5 w-5" />
                Professional Memberships
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.professionalMemberships!.map((membership, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{membership.organization}</p>
                    {membership.role && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{membership.role}</p>
                    )}
                    {(membership.startDate || membership.endDate) && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {membership.startDate} - {membership.endDate || 'Present'}
                      </p>
                    )}
                    {membership.membershipId && (
                      <p className="text-xs text-[var(--text-muted)]">
                        ID: {membership.membershipId}
                      </p>
                    )}
                    {membership.description && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        {membership.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* References */}
          {(profile.references?.length ?? 0) > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Users className="h-5 w-5" />
                References
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.references!.map((refEntry, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{refEntry.name}</p>
                    {refEntry.designation && (
                      <p className="text-sm text-[var(--text-muted)]">{refEntry.designation}</p>
                    )}
                    {refEntry.organization && (
                      <p className="text-sm text-[var(--text-muted)]">{refEntry.organization}</p>
                    )}
                    {refEntry.email && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Email: {refEntry.email.substring(0, 3)}***
                        {refEntry.email.substring(refEntry.email.indexOf('@'))}
                      </p>
                    )}
                    {refEntry.phone && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Phone: {refEntry.phone.substring(0, 4)}****
                        {refEntry.phone.substring(refEntry.phone.length - 3)}
                      </p>
                    )}
                    {refEntry.relationship && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Relationship: {refEntry.relationship}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Interests */}
          {profile.interests?.length > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Heart className="h-5 w-5" />
                Interests
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest: string, i: number) => (
                  <Badge key={i} variant="neutral" size="sm">
                    {interest}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Hobbies */}
          {profile.hobbies?.length > 0 && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Sparkles className="h-5 w-5" />
                Hobbies
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.hobbies.map((hobby: string, i: number) => (
                  <Badge key={i} variant="neutral" size="sm">
                    {hobby}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Career Break */}
          {profile.hasCareerBreak && (
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
                <Clock className="h-5 w-5" />
                Career Break
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="warning">Has Career Break</Badge>
                  {profile.careerBreakType && (
                    <Badge variant="neutral">{profile.careerBreakType}</Badge>
                  )}
                </div>
                {profile.careerBreakReason && (
                  <p className="text-sm text-[var(--text-muted)]">{profile.careerBreakReason}</p>
                )}
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
                    leftIcon={<Github className="h-4 w-4" />}
                    onClick={() => window.open(profile.githubProfile!, '_blank')}
                    tooltip="Open GitHub profile"
                  >
                    GitHub
                  </Button>
                )}
                {profile.linkedinProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Linkedin className="h-4 w-4" />}
                    onClick={() => window.open(profile.linkedinProfile!, '_blank')}
                    tooltip="Open LinkedIn profile"
                  >
                    LinkedIn
                  </Button>
                )}
                {profile.portfolioUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Globe className="h-4 w-4" />}
                    onClick={() => window.open(profile.portfolioUrl!, '_blank')}
                    tooltip="Open portfolio website"
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
  };

  // Employer Profile Viewer Component
  const EmployerProfileViewer = ({ profile }: { profile: CompanyProfile }) => {
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
              <div className="flex items-start justify-between">
                <div className="w-full">
                  <EditableField
                    value={profile.companyName}
                    onSave={async (val) => {
                      await updateCompanyProfileMutation.mutateAsync({ companyName: val });
                    }}
                    type="text"
                    maxLength={200}
                    placeholder="Company name"
                    className="text-2xl font-bold"
                  />
                  <div className="mt-1">
                    <EditableField
                      value={profile.tagline}
                      onSave={async (val) => {
                        await updateCompanyProfileMutation.mutateAsync({ tagline: val });
                      }}
                      type="text"
                      maxLength={200}
                      placeholder="No tagline"
                      className="text-[var(--text-muted)]"
                    />
                  </div>
                </div>
              </div>
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
                    <span className="text-sm text-[var(--text)]">
                      Founded {profile.foundedYear}
                    </span>
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
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">About</h3>
          <EditableField
            value={profile.description}
            onSave={async (val) => {
              await updateCompanyProfileMutation.mutateAsync({ description: val });
            }}
            type="textarea"
            maxLength={5000}
            placeholder="No description"
            className="text-[var(--text-muted)]"
          />
        </Card>

        {/* Mission & Vision */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Target className="h-5 w-5" />
              Mission
            </h3>
            <EditableField
              value={profile.mission}
              onSave={async (val) => {
                await updateCompanyProfileMutation.mutateAsync({ mission: val });
              }}
              type="textarea"
              maxLength={1000}
              placeholder="No mission statement"
              className="text-[var(--text-muted)]"
            />
          </Card>
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Lightbulb className="h-5 w-5" />
              Vision
            </h3>
            <EditableField
              value={profile.vision}
              onSave={async (val) => {
                await updateCompanyProfileMutation.mutateAsync({ vision: val });
              }}
              type="textarea"
              maxLength={1000}
              placeholder="No vision statement"
              className="text-[var(--text-muted)]"
            />
          </Card>
        </div>

        {/* Culture & Values */}
        {(profile.companyCulture || profile.coreValues?.length > 0) && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Sparkles className="h-5 w-5" />
              Culture & Values
            </h3>
            {profile.companyCulture && (
              <p className="mb-4 whitespace-pre-line text-[var(--text-muted)]">
                {profile.companyCulture}
              </p>
            )}
            {profile.coreValues?.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--text)]">Core Values</p>
                <div className="flex flex-wrap gap-2">
                  {profile.coreValues.map((value: string, i: number) => (
                    <Badge key={i} variant="success" size="sm">
                      {value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Benefits & Perks */}
        {profile.benefits?.length > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Star className="h-5 w-5" />
              Benefits & Perks
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.benefits.map((benefit: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {benefit}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Tech Stack */}
        {profile.techStack?.length > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <FileCode className="h-5 w-5" />
              Tech Stack
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.techStack.map((tech: string, i: number) => (
                <Badge key={i} variant="neutral" size="sm">
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
              <TrendingUp className="h-5 w-5" />
              Funding & Growth
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
                  <p className="text-xs text-[var(--text-muted)]">Total Funding</p>
                  <p className="font-medium text-[var(--text)]">{profile.totalFundingRaised}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Products & Services */}
        {profile.productsServices?.length > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Target className="h-5 w-5" />
              Products & Services
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.productsServices.map((product: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {product}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Interview Process */}
        {profile.interviewProcess && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Users className="h-5 w-5" />
              Interview Process
            </h3>
            <p className="whitespace-pre-line text-[var(--text-muted)]">
              {profile.interviewProcess}
            </p>
          </Card>
        )}

        {/* Leadership Team */}
        {(profile.leadershipTeam?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Users className="h-5 w-5" />
              Leadership Team
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {profile.leadershipTeam!.map((leader, i) => (
                <div key={i} className="text-center">
                  {leader.photo && (
                    <div className="mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full">
                      <img
                        src={leader.photo}
                        alt={leader.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <p className="font-medium text-[var(--text)]">{leader.name}</p>
                  {leader.designation && (
                    <p className="text-sm text-[var(--text-muted)]">{leader.designation}</p>
                  )}
                  {leader.linkedinUrl && (
                    <Tooltip content="Open LinkedIn profile">
                      <a
                        href={leader.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        LinkedIn <ExternalLink className="h-3 w-3" />
                      </a>
                    </Tooltip>
                  )}
                  {leader.bio && (
                    <details className="mt-2 text-left">
                      <summary className="cursor-pointer text-xs text-[var(--text-muted)]">
                        View Bio
                      </summary>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{leader.bio}</p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Employee Testimonials */}
        {(profile.employeeTestimonials?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <MessageCircle className="h-5 w-5" />
              Employee Testimonials
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.employeeTestimonials!.map((testimonial, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                  {testimonial.photo && (
                    <div className="mb-3 h-15 w-15 overflow-hidden rounded-full">
                      <img
                        src={testimonial.photo}
                        alt={testimonial.authorName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <p className="text-[var(--text-muted)] italic">&quot;{testimonial.quote}&quot;</p>
                  <div className="mt-2">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {testimonial.authorName}
                    </p>
                    {testimonial.authorDesignation && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {testimonial.authorDesignation}
                      </p>
                    )}
                    {testimonial.authorDepartment && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {testimonial.authorDepartment}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Awards & Recognitions */}
        {(profile.awards?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Award className="h-5 w-5" />
              Awards & Recognitions
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.awards!.map((award, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="font-medium text-[var(--text)]">{award.title}</p>
                  {award.year && (
                    <p className="text-sm text-[var(--text-muted)]">Year: {award.year}</p>
                  )}
                  {award.issuingOrg && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Issuing Org: {award.issuingOrg}
                    </p>
                  )}
                  {award.description && (
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{award.description}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Workplace Policies */}
        {profile.workplacePolicies && Object.keys(profile.workplacePolicies).length > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Shield className="h-5 w-5" />
              Workplace Policies
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(profile.workplacePolicies).map(([key, value], i) => (
                <div key={i}>
                  <p className="font-medium text-[var(--text)]">{key}</p>
                  <p className="text-sm text-[var(--text-muted)]">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Office Photos */}
        {(profile.officePhotos?.length ?? 0) > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <ImageIcon className="h-5 w-5" />
              Office Photos
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {profile.officePhotos!.map((photo, i) => (
                <div key={i} className="aspect-video overflow-hidden rounded-lg">
                  <img
                    src={photo.url}
                    alt={photo.caption || `Office ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Locations */}
        {(profile.headquarters || (profile.additionalLocations?.length ?? 0) > 0) && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <MapPin className="h-5 w-5" />
              Locations
            </h3>
            {profile.headquarters && (
              <div className="mb-4 rounded-lg border border-[var(--border)] p-3">
                <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Headquarters</p>
                <p className="text-sm text-[var(--text)]">{profile.headquarters}</p>
                {profile.latitude && profile.longitude && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Coordinates: {profile.latitude}, {profile.longitude}
                  </p>
                )}
              </div>
            )}
            {(profile.additionalLocations?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--text)]">Additional Locations</p>
                <div className="flex flex-wrap gap-2">
                  {profile.additionalLocations!.map((location, i) => (
                    <Badge key={i} variant="neutral" size="sm">
                      {location}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Contact Information */}
        {profile.contactRedacted && (
          <Card>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Lock className="h-5 w-5" />
              Contact Information
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              The employer&apos;s private contact email and phone are hidden. Revealing them needs
              the company contact-fields permission.
            </p>
          </Card>
        )}
        {(profile.contactEmail || profile.contactPhone || profile.contactPersonName) && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Phone className="h-5 w-5" />
              Contact Information
            </h3>
            <div className="space-y-2 text-sm">
              {profile.contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[var(--text)]">{profile.contactEmail}</span>
                </div>
              )}
              {profile.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-[var(--text)]">{profile.contactPhone}</span>
                </div>
              )}
              {profile.contactPersonName && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Contact Person</p>
                  <p className="text-[var(--text)]">{profile.contactPersonName}</p>
                  {profile.contactPersonDesignation && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {profile.contactPersonDesignation}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Verification Documents */}
        {(profile.gstNumber ||
          profile.cinNumber ||
          profile.panNumber ||
          profile.llpinNumber ||
          profile.tanNumber) && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <ShieldCheck className="h-5 w-5" />
              Verification Documents
            </h3>
            <div className="space-y-2 text-sm">
              {profile.gstNumber && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">GST Number</p>
                  <p className="text-[var(--text)]">GST-XXXX-XXXX-{profile.gstNumber.slice(-4)}</p>
                </div>
              )}
              {profile.cinNumber && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">CIN Number</p>
                  <p className="text-[var(--text)]">CIN-XXXX-XXXX-{profile.cinNumber.slice(-4)}</p>
                </div>
              )}
              {profile.panNumber && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">PAN Number</p>
                  <p className="text-[var(--text)]">PAN-XXXX-{profile.panNumber.slice(-4)}</p>
                </div>
              )}
              {profile.llpinNumber && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">LLPIN</p>
                  <p className="text-[var(--text)]">LLPIN-XXX-{profile.llpinNumber.slice(-4)}</p>
                </div>
              )}
              {profile.tanNumber && (
                <div>
                  <p className="text-xs text-[var(--text-muted)]">TAN Number</p>
                  <p className="text-[var(--text)]">TAN-XXXX-{profile.tanNumber.slice(-4)}</p>
                </div>
              )}
              {profile.verificationStatus && (
                <div className="mt-3">
                  <Badge
                    variant={
                      profile.verificationStatus === 'VERIFIED'
                        ? 'success'
                        : profile.verificationStatus === 'PENDING'
                          ? 'warning'
                          : 'error'
                    }
                  >
                    {profile.verificationStatus}
                  </Badge>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Specialties */}
        {profile.specialties?.length > 0 && (
          <Card>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
              <Sparkles className="h-5 w-5" />
              Specialties
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.specialties.map((specialty: string, i: number) => (
                <Badge key={i} variant="info" size="sm">
                  {specialty}
                </Badge>
              ))}
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
              Social Links
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.socialLinks?.linkedin && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Linkedin className="h-4 w-4" />}
                  onClick={() => window.open(profile.socialLinks!.linkedin!, '_blank')}
                  tooltip="Open company LinkedIn page"
                >
                  LinkedIn
                </Button>
              )}
              {profile.socialLinks?.twitter && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Globe className="h-4 w-4" />}
                  onClick={() => window.open(profile.socialLinks!.twitter!, '_blank')}
                  tooltip="Open company Twitter page"
                >
                  Twitter
                </Button>
              )}
              {profile.socialLinks?.facebook && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Globe className="h-4 w-4" />}
                  onClick={() => window.open(profile.socialLinks!.facebook!, '_blank')}
                  tooltip="Open company Facebook page"
                >
                  Facebook
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[PERM.USERS_CANDIDATES_VIEW, PERM.USERS_EMPLOYERS_VIEW]}
    >
      <div className="space-y-6">
        {/* Presence for a record two admins can now reach at once. Field
            edits here are discrete per-field saves rather than one big form,
            so collisions are same-field only — a banner is the proportionate
            signal, and the destructive actions below it are the real reason
            to know a colleague is present. */}
        <LockBanner lock={lock} entityLabel="user" />

        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: ROUTES.SUPER_ADMIN.DASHBOARD },
            { label: 'Users', href: ROUTES.SUPER_ADMIN.USERS },
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
            {/* Profile Header */}
            <Card>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  {/* Avatar with upload */}
                  <div className="group relative">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-2xl font-bold text-[var(--text-muted)]">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.firstName ? `${user.firstName}'s avatar` : 'User avatar'}
                          className="h-20 w-20 rounded-full object-cover"
                        />
                      ) : (
                        (user.firstName?.[0] || user.email[0]).toUpperCase()
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Tooltip content="Upload new avatar">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="cursor-pointer rounded-full p-1.5 text-white hover:bg-white/20"
                          aria-label="Upload avatar"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      </Tooltip>
                      {user.avatar && (
                        <Tooltip content="Remove avatar">
                          <button
                            type="button"
                            onClick={() => removeAvatarMutation.mutate()}
                            className="cursor-pointer rounded-full p-1.5 text-white hover:bg-white/20"
                            aria-label="Remove avatar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
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
                  {user.isSuspended && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<CheckCircle className="h-4 w-4" />}
                      onClick={() => activateMutation.mutate()}
                      isLoading={activateMutation.isPending}
                      tooltip="Remove suspension from this user"
                    >
                      Unsuspend
                    </Button>
                  )}
                  {!user.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Power className="h-4 w-4" />}
                      onClick={() => activateMutation.mutate()}
                      isLoading={activateMutation.isPending}
                      tooltip="Reactivate this user account"
                    >
                      Reactivate
                    </Button>
                  )}
                  {user.isActive && !user.isSuspended && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Ban className="h-4 w-4" />}
                        onClick={() => setShowSuspendModal(true)}
                        tooltip="Suspend this user"
                      >
                        Suspend
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Power className="h-4 w-4" />}
                        onClick={() => deactivateMutation.mutate()}
                        isLoading={deactivateMutation.isPending}
                        tooltip="Deactivate this user account"
                      >
                        Deactivate
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<UserCog className="h-4 w-4" />}
                    onClick={() => {
                      setShowRoleModal(true);
                      setNewRole(user.role);
                    }}
                    tooltip="Change user role"
                  >
                    Change Role
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Key className="h-4 w-4" />}
                    onClick={() => setShowResetPwModal(true)}
                    tooltip="Reset user password"
                  >
                    Reset Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<LogOut className="h-4 w-4" />}
                    onClick={() => revokeSessionsMutation.mutate()}
                    isLoading={revokeSessionsMutation.isPending}
                    tooltip="Revoke all active sessions"
                  >
                    Revoke Sessions
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setShowDeleteModal(true)}
                    tooltip="Permanently delete this user"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>

            {/* Tabs */}
            <Tabs
              tabs={tabItems}
              activeTab={activeTab}
              onChange={handleTabChange}
              variant="underline"
            />

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Account Tab */}
              {activeTab === 'account' && (
                <>
                  {/* Edit Profile */}
                  <Card
                    header={
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-[var(--text)]">Edit Profile</h2>
                        {!isEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={startEditing}
                            tooltip="Edit user profile"
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    }
                  >
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Input
                            label="First Name"
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                          />
                          <Input
                            label="Last Name"
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                          />
                        </div>
                        {/* Email/Mobile/WhatsApp fields only for non-admin targets */}
                        {!isAdminTarget && (
                          <>
                            <Input
                              label="Email"
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                            />
                            <div className="grid gap-4 sm:grid-cols-2">
                              <PhoneInput
                                label="Mobile Number"
                                placeholder="9876xxxxxx"
                                value={editMobileNumber}
                                onValueChange={setEditMobileNumber}
                              />
                              <PhoneInput
                                label="WhatsApp Number"
                                placeholder="9876xxxxxx"
                                value={editWhatsappNumber}
                                onValueChange={setEditWhatsappNumber}
                              />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Switch
                                label="Mobile Verified"
                                description="Mark mobile number as verified (trusted bypass)"
                                checked={editIsMobileVerified}
                                onChange={(e) => setEditIsMobileVerified(e.target.checked)}
                                disabled={!editMobileNumber.trim()}
                              />
                              <Switch
                                label="WhatsApp Verified"
                                description="Mark WhatsApp number as verified (trusted bypass)"
                                checked={editIsWhatsappVerified}
                                onChange={(e) => setEditIsWhatsappVerified(e.target.checked)}
                                disabled={!editWhatsappNumber.trim()}
                              />
                            </div>
                          </>
                        )}
                        {isAdminTarget && (
                          <p className="text-xs text-[var(--text-muted)]">
                            Email, mobile, and WhatsApp are managed separately below with OTP
                            verification.
                          </p>
                        )}
                        <div className="flex gap-3">
                          <Button
                            onClick={handleSaveProfile}
                            isLoading={updateProfileMutation.isPending}
                            disabled={!hasUnsavedChanges}
                            tooltip="Save profile changes"
                          >
                            Save Changes
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setIsEditing(false)}
                            tooltip="Discard changes"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">First Name</p>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {user.firstName || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)]">Last Name</p>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {user.lastName || '—'}
                          </p>
                        </div>
                        {!isAdminTarget && (
                          <>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Email</p>
                              <p className="text-sm font-medium text-[var(--text)]">{user.email}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Mobile Number</p>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {user.mobileNumber || '—'}
                                </p>
                                {user.mobileNumber && (
                                  <Badge
                                    variant={user.isMobileVerified ? 'success' : 'warning'}
                                    size="sm"
                                  >
                                    {user.isMobileVerified ? 'Verified' : 'Unverified'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">WhatsApp Number</p>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {user.whatsappNumber || '—'}
                                </p>
                                {user.whatsappNumber && (
                                  <Badge
                                    variant={user.isWhatsappVerified ? 'success' : 'warning'}
                                    size="sm"
                                  >
                                    {user.isWhatsappVerified ? 'Verified' : 'Unverified'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* Managed contact details (OTP-verified).
                      Available for EVERY role: the backend gates these on
                      users.{candidates,employers}.credentials.*, so restricting
                      them to ADMIN left candidates and employers with no way to
                      have a number verified except the no-OTP override checkbox. */}
                  {user.role !== 'SUPER_ADMIN' && (
                    <>
                      <ManagedEmailSection
                        userId={userId}
                        user={user}
                        invalidateUser={invalidateUser}
                      />
                      <ManagedMobileSection
                        userId={userId}
                        user={user}
                        invalidateUser={invalidateUser}
                      />
                      <ManagedWhatsappSection
                        userId={userId}
                        user={user}
                        invalidateUser={invalidateUser}
                      />
                    </>
                  )}

                  {user.role === 'SUPER_ADMIN' && (
                    <Card>
                      <div className="flex items-center gap-3 py-4">
                        <Shield className="h-5 w-5 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-secondary)]">
                          Email, mobile, and WhatsApp for super admin accounts can only be managed
                          directly in the database.
                        </p>
                      </div>
                    </Card>
                  )}

                  {/* Account Info */}
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
                        value={user.lastActiveAt ? formatDate(user.lastActiveAt) : 'Never'}
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
                        icon={SiWhatsapp}
                        label="WhatsApp"
                        value={user.whatsappNumber || 'Not provided'}
                      />
                      <InfoItem
                        icon={SiWhatsapp}
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

                  {/* Active Sessions */}
                  <Card
                    header={
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          Active Sessions
                        </h2>
                        {sessions.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<LogOut className="h-4 w-4" />}
                            onClick={() => revokeSessionsMutation.mutate()}
                            isLoading={revokeSessionsMutation.isPending}
                            tooltip="Revoke all active sessions for this user"
                          >
                            Revoke All
                          </Button>
                        )}
                      </div>
                    }
                  >
                    {sessionsLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} variant="rect" height={48} />
                        ))}
                      </div>
                    ) : sessions.length > 0 ? (
                      <div className="space-y-3">
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                                <Monitor className="h-4 w-4 text-[var(--text-muted)]" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[var(--text)]">
                                  {parseUserAgent(session.userAgent)}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                  <Globe className="h-3 w-3" />
                                  <span>{session.ipAddress || 'Unknown IP'}</span>
                                  <span className="text-[var(--border)]">|</span>
                                  <span>Created {formatDate(session.createdAt)}</span>
                                  {session.lastSeenAt && (
                                    <>
                                      <span className="text-[var(--border)]">|</span>
                                      <span>Last seen {formatDate(session.lastSeenAt)}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={session.isActive ? 'success' : 'neutral'} size="sm">
                                {session.isActive ? 'Active' : 'Expired'}
                              </Badge>
                              {session.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isLoading={revokingSessionId === session.id}
                                  onClick={() => handleRevokeSession(session.id)}
                                  className="text-[var(--error)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                                  tooltip="Revoke this session"
                                >
                                  Revoke
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                        No active sessions found.
                      </p>
                    )}
                  </Card>
                </>
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
                  {(user.candidateProfileRedacted || user.companyProfileRedacted) && (
                    <Card>
                      <div className="py-12 text-center">
                        <Lock className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 font-medium text-[var(--text)]">Profile restricted</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          This account has a profile, but reading it needs the{' '}
                          {user.candidateProfileRedacted ? 'candidate profile' : 'company profile'}{' '}
                          permission. Ask a super-admin to grant it.
                        </p>
                      </div>
                    </Card>
                  )}
                  {(user.role === 'ADMIN' ||
                    user.role === 'SUPER_ADMIN' ||
                    (!user.candidateProfile &&
                      !user.companyProfile &&
                      !user.candidateProfileRedacted &&
                      !user.companyProfileRedacted)) && (
                    <Card>
                      <div className="py-12 text-center">
                        <User className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 text-[var(--text-muted)]">
                          No profile data available for this role.
                        </p>
                      </div>
                    </Card>
                  )}

                  {/* Follow-graph drill-downs — only meaningful for
                      candidates (companies they follow) and employers
                      (followers of their company). */}
                  {user.role === 'CANDIDATE' && <UserFollowingPanel userId={user.id} />}
                  {user.role === 'EMPLOYER' && user.companyProfile?.id && (
                    <CompanyFollowersPanel companyId={user.companyProfile.id} />
                  )}
                </>
              )}

              {/* Applications Tab */}
              {activeTab === 'applications' && (
                <>
                  {applicationsLoading ? (
                    <Card>
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} variant="rect" height={48} />
                        ))}
                      </div>
                    </Card>
                  ) : applicationsData?.data?.items && applicationsData.data.items.length > 0 ? (
                    <Card>
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[var(--text)]">
                          Applications ({applicationsData.data.total})
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Applied
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Job Title
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Company
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Status
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Match
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {applicationsData.data.items.map((app) => (
                              <tr
                                key={app.id}
                                className="border-b border-[var(--border)] last:border-0"
                              >
                                <td className="py-3 text-sm text-[var(--text)]">
                                  {formatDate(app.appliedAt)}
                                </td>
                                <td className="py-3 text-sm font-medium text-[var(--text)]">
                                  {app.job.title}
                                </td>
                                <td className="py-3 text-sm text-[var(--text)]">
                                  {app.job.company.companyName}
                                </td>
                                <td className="py-3">
                                  <Badge
                                    variant={
                                      app.status === 'SHORTLISTED'
                                        ? 'success'
                                        : app.status === 'REJECTED'
                                          ? 'error'
                                          : 'info'
                                    }
                                    size="sm"
                                  >
                                    {app.status}
                                  </Badge>
                                </td>
                                <td className="py-3 text-sm text-[var(--text)]">
                                  {app.matchScore ? `${app.matchScore}%` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        className="mt-4"
                        currentPage={applicationsPage}
                        totalPages={applicationsData.data.totalPages}
                        onPageChange={setApplicationsPage}
                        totalItems={applicationsData.data.total}
                        pageSize={20}
                      />
                    </Card>
                  ) : (
                    <Card>
                      <div className="py-12 text-center">
                        <Briefcase className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 text-[var(--text-muted)]">
                          This candidate hasn&apos;t applied to any jobs yet.
                        </p>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* Jobs Tab */}
              {activeTab === 'jobs' && (
                <>
                  {jobsLoading ? (
                    <Card>
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} variant="rect" height={48} />
                        ))}
                      </div>
                    </Card>
                  ) : jobsData?.data?.items && jobsData.data.items.length > 0 ? (
                    <Card>
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[var(--text)]">
                          Job Posts ({jobsData.data.total})
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Posted
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Job Title
                              </th>
                              <th className="pb-3 text-left text-sm font-medium text-[var(--text-muted)]">
                                Status
                              </th>
                              <th className="pb-3 text-right text-sm font-medium text-[var(--text-muted)]">
                                Applications
                              </th>
                              <th className="pb-3 text-right text-sm font-medium text-[var(--text-muted)]">
                                Saved
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobsData.data.items.map((job) => (
                              <tr
                                key={job.id}
                                className="border-b border-[var(--border)] last:border-0"
                              >
                                <td className="py-3 text-sm text-[var(--text)]">
                                  {formatDate(job.createdAt)}
                                </td>
                                <td className="py-3 text-sm font-medium text-[var(--text)]">
                                  {job.title}
                                </td>
                                <td className="py-3">
                                  <Badge
                                    variant={
                                      job.status === 'ACTIVE'
                                        ? 'success'
                                        : job.status === 'CLOSED'
                                          ? 'error'
                                          : 'neutral'
                                    }
                                    size="sm"
                                  >
                                    {job.status}
                                  </Badge>
                                </td>
                                <td className="py-3 text-right text-sm text-[var(--text)]">
                                  {job._applicationCount}
                                </td>
                                <td className="py-3 text-right text-sm text-[var(--text)]">
                                  {job._savedCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        className="mt-4"
                        currentPage={jobsPage}
                        totalPages={jobsData.data.totalPages}
                        onPageChange={setJobsPage}
                        totalItems={jobsData.data.total}
                        pageSize={20}
                      />
                    </Card>
                  ) : (
                    <Card>
                      <div className="py-12 text-center">
                        <Building2 className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 text-[var(--text-muted)]">
                          This employer hasn&apos;t posted any jobs yet.
                        </p>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <>
                  {activityLoading ? (
                    <Card>
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} variant="rect" height={48} />
                        ))}
                      </div>
                    </Card>
                  ) : !activityData?.data?.items || activityData.data.items.length === 0 ? (
                    <Card>
                      <div className="py-12 text-center">
                        <Activity className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 text-[var(--text-muted)]">
                          No activity found for this user.
                        </p>
                      </div>
                    </Card>
                  ) : (
                    <Card>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-[var(--text)]">
                          Activity Log ({activityData.data.total} actions)
                        </h3>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          Recent actions performed by this user
                        </p>
                      </div>
                      <div className="space-y-3">
                        {activityData.data.items.map((log) => (
                          <div
                            key={log.id}
                            className="border-l-primary rounded-r-lg border border-l-2 border-[var(--border)] py-2 pl-4"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-[var(--text)]">{log.action}</span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {formatDate(log.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-[var(--text-muted)]">
                              {log.entity} {log.entityId && `(${log.entityId.substring(0, 8)}...)`}
                            </p>
                            {log.ipAddress && (
                              <p className="text-xs text-[var(--text-muted)]">
                                IP: {log.ipAddress}
                              </p>
                            )}
                            {log.details && (
                              <details className="mt-1">
                                <summary className="text-primary cursor-pointer text-xs">
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
                      <Pagination
                        className="mt-4"
                        currentPage={activityPage}
                        totalPages={activityData.data.totalPages}
                        onPageChange={setActivityPage}
                        totalItems={activityData.data.total}
                        pageSize={20}
                      />
                    </Card>
                  )}
                </>
              )}

              {/* Verification Tab */}
              {activeTab === 'verification' && (
                <>
                  {verificationsLoading ? (
                    <Card>
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} variant="rect" height={80} />
                        ))}
                      </div>
                    </Card>
                  ) : verificationsData?.data?.items && verificationsData.data.items.length > 0 ? (
                    <Card>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-[var(--text)]">
                          Verification Requests ({verificationsData.data.total})
                        </h3>
                      </div>
                      <div className="space-y-4">
                        {verificationsData.data.items.map((verification) => (
                          <div
                            key={verification.id}
                            className="rounded-lg border border-[var(--border)] p-4"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
                                  <p className="font-medium text-[var(--text)]">
                                    {verification.type}
                                  </p>
                                  <Badge
                                    variant={
                                      verification.status === 'APPROVED'
                                        ? 'success'
                                        : verification.status === 'REJECTED'
                                          ? 'error'
                                          : 'warning'
                                    }
                                    size="sm"
                                  >
                                    {verification.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">
                                  Submitted: {formatDate(verification.createdAt)}
                                </p>
                                {verification.reviewedAt && (
                                  <p className="text-sm text-[var(--text-muted)]">
                                    Reviewed: {formatDate(verification.reviewedAt)}
                                  </p>
                                )}
                                {verification.adminComments && (
                                  <p className="mt-2 text-sm text-[var(--error)]">
                                    Admin Comments: {verification.adminComments}
                                  </p>
                                )}
                              </div>
                              {verification.status === 'PENDING' && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      updateVerificationMutation.mutate({
                                        verificationId: verification.id,
                                        status: 'APPROVED',
                                      });
                                    }}
                                    isLoading={updateVerificationMutation.isPending}
                                    tooltip="Approve this verification request"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={async () => {
                                      const reason = await promptDialog({
                                        title: 'Reject verification',
                                        label: 'Reason for rejection:',
                                        required: true,
                                      });
                                      if (reason) {
                                        updateVerificationMutation.mutate({
                                          verificationId: verification.id,
                                          status: 'REJECTED',
                                          reason,
                                        });
                                      }
                                    }}
                                    isLoading={updateVerificationMutation.isPending}
                                    tooltip="Reject this verification request"
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Pagination
                        className="mt-4"
                        currentPage={verificationsPage}
                        totalPages={verificationsData.data.totalPages}
                        onPageChange={setVerificationsPage}
                        totalItems={verificationsData.data.total}
                        pageSize={20}
                      />
                    </Card>
                  ) : (
                    <Card>
                      <div className="py-12 text-center">
                        <ShieldCheck className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <p className="mt-4 text-[var(--text-muted)]">
                          No verification requests found.
                        </p>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <Card>
            <div className="py-12 text-center">
              <p className="text-[var(--text-muted)]">User not found.</p>
              <Link href={ROUTES.SUPER_ADMIN.USERS}>
                <Button variant="outline" size="sm" className="mt-4" tooltip="Return to user list">
                  Back to Users
                </Button>
              </Link>
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
                onClick={() => {
                  setShowSuspendModal(false);
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
                  if (!suspendReason.trim()) return;
                  suspendMutation.mutate({
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
                onClick={() => setShowDeleteModal(false)}
                tooltip="Cancel deletion"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
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
                onClick={() => {
                  setShowRoleModal(false);
                  setNewRole('');
                }}
                tooltip="Cancel role change"
              >
                Cancel
              </Button>
              <Button
                onClick={() => roleChangeMutation.mutate(newRole as Role)}
                isLoading={roleChangeMutation.isPending}
                disabled={!newRole || newRole === user?.role}
                tooltip="Confirm role update"
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

        {/* Reset Password Modal (2-step OTP) */}
        <Modal
          isOpen={showResetPwModal}
          onClose={closeResetPwModal}
          title={isAdminPasswordFlow ? 'Change Admin Password' : 'Reset Password'}
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
                  disabled={
                    isAdminPasswordFlow &&
                    (!resetSuperAdminPassword || !newPassword || !resetConfirmPassword)
                  }
                  tooltip="Send verification code to user email"
                >
                  Send Verification Code
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => resetPasswordMutation.mutate({ pw: newPassword, otp: resetOtp })}
                  isLoading={resetPasswordMutation.isPending}
                  disabled={
                    isAdminPasswordFlow
                      ? resetOtp.length !== otpConfig.LENGTH
                      : newPassword.length < passwordRules.MIN_LENGTH ||
                        resetOtp.length !== otpConfig.LENGTH
                  }
                  tooltip="Confirm password reset"
                >
                  {isAdminPasswordFlow ? 'Confirm Password Change' : 'Reset Password'}
                </Button>
              )}
            </div>
          }
        >
          {resetStep === 'send' ? (
            isAdminPasswordFlow ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[var(--warning)]" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    A verification code will be sent to the admin&apos;s email. All their active
                    sessions will be revoked.
                  </p>
                </div>
                <Input
                  label="Your Password (Super Admin)"
                  type="password"
                  value={resetSuperAdminPassword}
                  onChange={(e) => setResetSuperAdminPassword(e.target.value)}
                  placeholder="Enter your password to authorize"
                  error={resetErrors.password}
                  required
                />
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`Min ${passwordRules.MIN_LENGTH} characters`}
                  error={resetErrors.newPassword}
                  required
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  error={resetErrors.confirmPassword}
                  required
                />
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  A 6-digit verification code will be sent to this user&apos;s email to confirm the
                  password reset. This will revoke all their active sessions.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  {isAdminPasswordFlow
                    ? 'Enter the 6-digit code sent to the admin\u2019s email to confirm the password change.'
                    : 'Enter the 6-digit code sent to the user\u2019s email and the new password.'}
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

              {!isAdminPasswordFlow && (
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              )}
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

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
