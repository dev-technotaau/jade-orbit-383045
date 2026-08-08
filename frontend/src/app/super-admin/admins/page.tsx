'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  UserPlus,
  Trash2,
  AlertTriangle,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordStrength from '@/components/auth/PasswordStrength';
import { usePasswordRules } from '@/hooks/use-security-config';
import { createPasswordSchema } from '@/utils/validation';
import CreateUserModal from '@/components/super-admin/CreateUserModal';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import OtpInput from '@/components/auth/OtpInput';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { adminPermissionService } from '@/services/admin-permission.service';
import { roleColorClass } from '@/constants/permissions';
import { cn } from '@/lib/utils';
import type { MatrixRow } from '@/types/permissions';
import { useOtpConfig } from '@/hooks/use-otp-config';
import { formatRelativeDate } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';
import type { UserListItem } from '@/types/admin';

export default function ManageAdminsPage() {
  const queryClient = useQueryClient();
  const otpConfig = useOtpConfig();
  const [showCreate, setShowCreate] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; email: string } | null>(null);
  // The create form's own state lives in <CreateUserModal>.
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'admins'],
    queryFn: () => adminService.listAdmins(),
  });

  // One matrix fetch for the whole list — each row reads its own slice
  // rather than issuing a request per admin.
  const { data: matrix } = useQuery({
    queryKey: ['admin-control', 'matrix'],
    queryFn: () => adminPermissionService.getMatrix(),
  });

  const admins: UserListItem[] = data?.data?.items || [];

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminService.removeAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'admins'] });
      showToast.success('Admin removed');
      setRemoveTarget(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to remove admin');
    },
  });

  // Password reset state
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetStep, setResetStep] = useState<'send' | 'verify'>('send');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const passwordRules = usePasswordRules();
  /* Validate against the live backend policy rather than a hardcoded minimum, so
     the operator sees the same message the server would return. Derived during
     render — no effect, no extra state to fall out of sync. */
  const resetPasswordError = (() => {
    if (!resetPassword) return undefined;
    const parsed = createPasswordSchema(passwordRules).safeParse(resetPassword);
    return parsed.success ? undefined : parsed.error.issues[0]?.message;
  })();
  const passwordPolicyHint = `At least ${passwordRules.MIN_LENGTH} characters${
    passwordRules.REQUIRE_UPPERCASE ? ', one uppercase' : ''
  }${passwordRules.REQUIRE_LOWERCASE ? ', one lowercase' : ''}${
    passwordRules.REQUIRE_NUMBER ? ', one number' : ''
  }${passwordRules.REQUIRE_SPECIAL ? ', one symbol' : ''}`;
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendResetOtp = async () => {
    if (!resetTarget) return;
    setIsSendingOtp(true);
    try {
      await adminService.sendPasswordResetOtp(resetTarget.id);
      showToast.success(`Verification code sent to ${resetTarget.email}`);
      setResetStep('verify');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (!resetTarget) return;
    setIsResending(true);
    try {
      await adminService.sendPasswordResetOtp(resetTarget.id);
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

  const handleConfirmReset = async () => {
    if (!resetTarget || resetOtp.length !== otpConfig.LENGTH || !resetPassword) return;
    if (resetPasswordError) return;
    setIsResettingPassword(true);
    try {
      await adminService.resetUserPassword(resetTarget.id, {
        newPassword: resetPassword,
        otp: resetOtp,
      });
      showToast.success('Password reset successfully');
      closeResetModal();
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reset password');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setResetStep('send');
    setResetOtp('');
    setResetPassword('');
    setResendTimer(0);
  };

  return (
    <DashboardLayout requiredRole={['SUPER_ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Manage Admins</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Create and manage admin accounts
            </p>
          </div>
          <Button
            leftIcon={<UserPlus className="h-4 w-4" />}
            onClick={() => setShowCreate(true)}
            tooltip="Create a new admin account"
          >
            Create Admin
          </Button>
        </div>

        <Card variant="bordered">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
              ))}
            </div>
          ) : admins.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-full">
                      <Shield className="text-primary h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {admin.firstName} {admin.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <Mail className="h-3 w-3" />
                        <span>{admin.email}</span>
                      </div>
                      {/* Access summary — the question a super-admin is
                          actually scanning this list for. */}
                      <AdminAccessSummary adminId={admin.id} matrix={matrix} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={admin.isActive ? 'success' : 'error'} size="sm">
                      {admin.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-[var(--text-muted)]">
                      Joined {formatRelativeDate(admin.createdAt)}
                    </span>
                    <Tooltip content="Manage this admin's permissions">
                      <Link href={`${ROUTES.SUPER_ADMIN.ADMIN_DETAIL(admin.id)}?tab=permissions`}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<KeyRound className="h-3.5 w-3.5" />}
                        >
                          Permissions
                        </Button>
                      </Link>
                    </Tooltip>
                    <Tooltip content="View admin details">
                      <Link href={ROUTES.SUPER_ADMIN.ADMIN_DETAIL(admin.id)}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Eye className="h-3.5 w-3.5" />}
                          tooltip="View admin details"
                        >
                          View
                        </Button>
                      </Link>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetTarget({ id: admin.id, email: admin.email })}
                      tooltip="Reset admin password"
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget({ id: admin.id, email: admin.email })}
                      className="text-[var(--error)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                      tooltip="Remove admin"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Shield}
              title="No admins"
              description="Create admin accounts to help manage the platform."
            />
          )}
        </Card>

        {/* Shared with /super-admin/users, so an admin account created here goes
            through the same validation, PhoneInput and password UX as any other
            account. */}
        <CreateUserModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['super-admin', 'admins'] });
          }}
          mode="admin"
        />

        {/* Remove Admin Modal */}
        <Modal
          isOpen={!!removeTarget}
          onClose={() => setRemoveTarget(null)}
          title="Remove Admin"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setRemoveTarget(null)}
                tooltip="Cancel and close"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
                isLoading={removeMutation.isPending}
                tooltip="Confirm admin removal"
              >
                Remove
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--error)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to remove <strong>{removeTarget?.email}</strong> as admin? This
              will revoke their admin privileges immediately.
            </p>
          </div>
        </Modal>

        {/* Reset Password Modal */}
        <Modal
          isOpen={!!resetTarget}
          onClose={closeResetModal}
          title="Reset Admin Password"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeResetModal} tooltip="Cancel and close">
                Cancel
              </Button>
              {resetStep === 'send' ? (
                <Button
                  onClick={handleSendResetOtp}
                  isLoading={isSendingOtp}
                  tooltip="Send OTP verification code"
                >
                  Send Verification Code
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmReset}
                  isLoading={isResettingPassword}
                  disabled={
                    resetOtp.length !== otpConfig.LENGTH ||
                    !resetPassword ||
                    Boolean(resetPasswordError)
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
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                A 6-digit verification code will be sent to <strong>{resetTarget?.email}</strong> to
                confirm the password reset.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium text-[var(--text)]">{resetTarget?.email}</span> and
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
                    <Tooltip content="Resend verification code to admin email">
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={isResending}
                        className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                      >
                        {isResending ? 'Sending...' : 'Resend Code'}
                      </button>
                    </Tooltip>
                  )}
                </p>
              </div>

              {/* Same treatment as every other password field on the platform:
                  a reveal toggle, live strength feedback, and the real policy
                  spelled out instead of "at least 8 characters" — the backend
                  enforces uppercase/lowercase/number/symbol here too, via
                  validatePasswordStrength in superAdminService. */}
              <Input
                label="New Password"
                type={showResetPassword ? 'text' : 'password'}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <Tooltip content={showResetPassword ? 'Hide password' : 'Show password'}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                    >
                      {showResetPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                }
                error={resetPasswordError}
                helperText={resetPasswordError ? undefined : passwordPolicyHint}
                required
              />
              <PasswordStrength password={resetPassword} />
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

/**
 * Compact access summary for a row in the admins list.
 *
 * Shows the roles an admin holds plus a total permission count, so the list
 * answers "who has what" at a glance instead of requiring a click into each
 * admin. Renders nothing until the matrix loads, and shows an explicit
 * "no access" state — an admin with zero permissions is a real and
 * important state (a freshly-created account), not a loading artefact.
 */
function AdminAccessSummary({
  adminId,
  matrix,
}: {
  adminId: string;
  matrix: MatrixRow[] | undefined;
}) {
  if (!matrix) return null;
  const row = matrix.find((r) => r.admin.id === adminId);
  // Super-admins never appear in the matrix (they hold no grant rows).
  if (!row) return null;

  if (row.roles.length === 0 && row.allowed.length === 0) {
    return (
      <p className="mt-1 text-xs text-amber-600">
        No permissions granted yet — this admin sees an empty console.
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {row.roles.map((r) => (
        <span
          key={r.id}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1',
            roleColorClass(r.color),
          )}
        >
          {r.name}
        </span>
      ))}
      <span className="text-[11px] text-[var(--text-muted)]">
        {row.allowed.length} permission{row.allowed.length === 1 ? '' : 's'}
        {row.denyCount > 0 && ` · ${row.denyCount} denied`}
      </span>
    </div>
  );
}
