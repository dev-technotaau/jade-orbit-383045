'use client';

/**
 * CreateUserModal — the account-creation form for the super-admin panel.
 *
 * Both `/super-admin/users` (candidate / employer / admin) and
 * `/super-admin/admins` (admin only) render this, so an operator-created account
 * goes through exactly one form regardless of entry point.
 *
 * Why it exists: both surfaces previously used ad-hoc `useState` forms whose only
 * validation was "field is non-empty". That meant a password rejected at
 * `/auth/register` — no uppercase, no digit, no symbol — was accepted here, the
 * mobile number could not be entered at all, and the password field had no
 * reveal toggle or strength feedback. This form reuses the same pieces
 * self-registration uses:
 *
 *   · `createAdminCreatedUserSchema(passwordRules)` — the same `nameSchema` /
 *     `emailSchema` / `createPasswordSchema` / `phoneSchema` primitives, with
 *     the rules fetched from the backend security config so the client and
 *     server agree on the policy.
 *   · `PhoneInput` — the sitewide country-code picker, emitting E.164.
 *   · `PasswordStrength` — the same meter shown during registration.
 *   · Eye / EyeOff reveal toggles on both password fields.
 *
 * The backend enforces the same policy independently in
 * `superAdminService.createAdmin/createUser`, so this is convenience, not the
 * security boundary.
 */

import { useCallback, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PhoneInput from '@/components/ui/PhoneInput';
import Tooltip from '@/components/ui/Tooltip';
import PasswordStrength from '@/components/auth/PasswordStrength';
import { showToast } from '@/components/ui/Toast';
import Skeleton from '@/components/ui/Skeleton';
import PermissionTree, {
  fromSelection,
  type PermissionSelection,
} from '@/components/admin/PermissionTree';
import { adminService } from '@/services/admin.service';
import { adminPermissionService } from '@/services/admin-permission.service';
import { usePasswordRules } from '@/hooks/use-security-config';
import { createAdminCreatedUserSchema } from '@/validators/auth';
import { roleColorClass } from '@/constants/permissions';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/types/api';
import type { CreateUserRequest } from '@/types/admin';

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: 'CANDIDATE' | 'EMPLOYER' | 'ADMIN';
  mobileNumber?: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fired after a successful create so the caller can refetch its list. */
  onCreated: () => void;
  /**
   * `user`  → POST /super-admin/users, role picker shown.
   * `admin` → POST /super-admin/admins, role fixed to ADMIN.
   */
  mode: 'user' | 'admin';
  /** Role choices for `user` mode. Ignored in `admin` mode. */
  roleOptions?: { value: string; label: string }[];
}

const DEFAULTS: FormValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'CANDIDATE',
  mobileNumber: '',
};

export default function CreateUserModal({
  isOpen,
  onClose,
  onCreated,
  mode,
  roleOptions = [],
}: Props) {
  const passwordRules = usePasswordRules();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /**
   * Initial access for `admin` mode.
   *
   * Set at creation rather than only afterwards: an admin account that
   * exists for even a minute with no permissions is a support ticket
   * ("I logged in and the console is empty"), and forcing a second trip to
   * the Permissions tab made granting feel like an afterthought rather than
   * part of provisioning.
   *
   * Roles are the headline control because they are the maintainable path;
   * the full tree is collapsed behind a disclosure for the exception case.
   */
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [permissionSelection, setPermissionSelection] = useState<PermissionSelection>(() => ({
    allow: new Set<string>(),
    deny: new Set<string>(),
  }));

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    // The schema is rebuilt when the backend rules load, so validation always
    // reflects the live policy rather than a hardcoded 8-character minimum.
    resolver: zodResolver(createAdminCreatedUserSchema(passwordRules)),
    mode: 'onChange',
    defaultValues: { ...DEFAULTS, role: mode === 'admin' ? 'ADMIN' : 'CANDIDATE' },
  });

  /* `useWatch` rather than `watch()`: the latter returns a fresh function each
     render, which makes the component uncompilable for React Compiler. Same
     values, memo-safe subscription. */
  const password = useWatch({ control, name: 'password' });
  const role = useWatch({ control, name: 'role' });
  const mobileNumber = useWatch({ control, name: 'mobileNumber' });

  /** Will this create an admin? True in `admin` mode, or in `user` mode with
   *  the role picker on Admin. Drives the access step below. */
  const creatingAdmin = mode === 'admin' || role === 'ADMIN';

  /* Clearing on close is event-driven, not an effect: `setState` inside an
     effect trips react-hooks/set-state-in-effect, and there is a real close
     event to hang this on. Every close path — the backdrop, Escape, Cancel and a
     successful create — routes through `closeAndReset`, so the next open never
     shows the previous operator's input, and a password never lingers in a
     mounted field. */
  const closeAndReset = useCallback(() => {
    reset({ ...DEFAULTS, role: mode === 'admin' ? 'ADMIN' : 'CANDIDATE' });
    setShowPassword(false);
    setShowConfirm(false);
    setSelectedRoleIds([]);
    setPermissionSelection({ allow: new Set<string>(), deny: new Set<string>() });
    onClose();
  }, [mode, onClose, reset]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const mobileNumber = values.mobileNumber?.trim() || undefined;
      if (mode === 'admin') {
        const permissions = fromSelection(permissionSelection);
        return adminService.createAdmin({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          password: values.password,
          mobileNumber,
          // Omitted entirely when empty so the server can tell "granted
          // nothing" from "did not touch access".
          ...(selectedRoleIds.length ? { roleIds: selectedRoleIds } : {}),
          ...(permissions.length ? { permissions } : {}),
        });
      }
      const selectedRole = (values.role ?? 'CANDIDATE') as CreateUserRequest['role'];
      const permissions = fromSelection(permissionSelection);
      const payload: CreateUserRequest = {
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        role: selectedRole,
        mobileNumber,
        // Only meaningful for an ADMIN target; the server ignores them for
        // any other role, and sending them would be noise.
        ...(selectedRole === 'ADMIN' && selectedRoleIds.length ? { roleIds: selectedRoleIds } : {}),
        ...(selectedRole === 'ADMIN' && permissions.length ? { permissions } : {}),
      };
      return adminService.createUser(payload);
    },
    onSuccess: (res, values) => {
      // An admin can be minted from either surface (this modal in `admin`
      // mode, or the users page with role=ADMIN), but each caller's
      // `onCreated` only refreshes its OWN list. Invalidate both here so the
      // new account — and its access summary — appears wherever the operator
      // looks next, instead of only on the page they happened to start from.
      const madeAdmin = mode === 'admin' || values.role === 'ADMIN';
      if (madeAdmin) {
        void queryClient.invalidateQueries({ queryKey: ['super-admin', 'admins'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      }

      const grantCount = madeAdmin ? selectedRoleIds.length + permissionSelection.allow.size : 0;
      showToast.success(
        mode === 'admin' || madeAdmin
          ? grantCount > 0
            ? 'Admin created with the selected access'
            : 'Admin created — no permissions granted yet'
          : 'User created successfully',
      );
      /* The backend returns `breachWarning` when the password appears in a known
         breach corpus. It does not block creation — same as registration — but
         the operator should know before handing the credentials over. */
      const warning = (res as unknown as { data?: { breachWarning?: string } } | undefined)?.data
        ?.breachWarning;
      if (warning) showToast.error(warning);
      onCreated();
      closeAndReset();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(
        error.message || (mode === 'admin' ? 'Failed to create admin' : 'Failed to create user'),
      );
    },
  });

  const submit = handleSubmit((values) => createMutation.mutate(values));

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeAndReset}
      title={mode === 'admin' ? 'Create Admin' : 'Create User'}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={closeAndReset} tooltip="Cancel and close">
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            isLoading={createMutation.isPending}
            disabled={!isValid || createMutation.isPending}
            tooltip={
              isValid
                ? `Create the ${mode === 'admin' ? 'admin' : 'user'} account`
                : 'Fix the highlighted fields first'
            }
          >
            Create
          </Button>
        </div>
      }
    >
      {/* `noValidate` so our messages show rather than the browser's. Enter still
          submits, matching the registration form. */}
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First Name"
            placeholder="First name"
            leftIcon={<User className="h-4 w-4" />}
            error={errors.firstName?.message}
            required
            {...register('firstName')}
          />
          <Input
            label="Last Name"
            placeholder="Last name"
            leftIcon={<User className="h-4 w-4" />}
            error={errors.lastName?.message}
            required
            {...register('lastName')}
          />
        </div>

        <Input
          label="Email"
          type="email"
          placeholder="user@example.com"
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          required
          {...register('email')}
        />

        {/* Sitewide phone control — country-code picker, emits E.164, which is
            the format the backend's e164Phone schema expects. */}
        <PhoneInput
          label="Mobile Number"
          placeholder="9876xxxxxx"
          error={errors.mobileNumber?.message}
          helperText="Optional. Used for OTP verification and notifications."
          value={mobileNumber}
          onValueChange={(val) => setValue('mobileNumber', val, { shouldValidate: true })}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Create a password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <Tooltip content={showPassword ? 'Hide password' : 'Show password'}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </Tooltip>
          }
          error={errors.password?.message}
          required
          {...register('password')}
        />
        <PasswordStrength password={password || ''} />

        <Input
          label="Confirm Password"
          type={showConfirm ? 'text' : 'password'}
          placeholder="Re-enter the password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <Tooltip content={showConfirm ? 'Hide password' : 'Show password'}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </Tooltip>
          }
          error={errors.confirmPassword?.message}
          required
          {...register('confirmPassword')}
        />

        {mode === 'user' && (
          <Select
            label="Role"
            options={roleOptions}
            value={role ?? 'CANDIDATE'}
            onChange={(val) =>
              setValue('role', val as FormValues['role'], { shouldValidate: true })
            }
            clearable={false}
          />
        )}

        {/* Shown whenever the account being created will be an ADMIN —
            `admin` mode always, and `user` mode when the role picker is set
            to Admin. Both routes produce the same kind of account, so both
            offer the same provisioning step. */}
        {creatingAdmin && (
          <AdminAccessPicker
            selectedRoleIds={selectedRoleIds}
            onRolesChange={setSelectedRoleIds}
            selection={permissionSelection}
            onSelectionChange={setPermissionSelection}
          />
        )}

        <p className="text-xs text-[var(--text-muted)]">
          The account is created unverified — we email a verification code, and the user sets up the
          rest of their profile on first sign-in.
        </p>
      </form>
    </Modal>
  );
}

/**
 * Initial access picker, shown only when creating an ADMIN.
 *
 * Two tiers, deliberately weighted:
 *
 *   1. ROLES (prominent) — the maintainable path. Picking "Support Agent"
 *      grants a coherent job description in one click and stays live-linked,
 *      so a later edit to the role reaches this admin too.
 *   2. INDIVIDUAL PERMISSIONS (collapsed) — the exception path, for the
 *      "…plus refund approval, just for them" case.
 *
 * Both are optional. An admin created with neither is valid — they sign in
 * to an empty console until a super-admin grants something — but the empty
 * state says so explicitly, because silently provisioning an admin who can
 * do nothing is the confusing outcome this picker exists to avoid.
 */
function AdminAccessPicker({
  selectedRoleIds,
  onRolesChange,
  selection,
  onSelectionChange,
}: {
  selectedRoleIds: string[];
  onRolesChange: (ids: string[]) => void;
  selection: PermissionSelection;
  onSelectionChange: (next: PermissionSelection) => void;
}) {
  const [showTree, setShowTree] = useState(false);

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-control', 'roles'],
    queryFn: () => adminPermissionService.listRoles(),
  });

  // Only fetched once the operator opens the tree — the registry is a large
  // payload and most admins are provisioned from a role alone.
  const { data: registry } = useQuery({
    queryKey: ['admin-control', 'registry'],
    queryFn: () => adminPermissionService.getRegistry(),
    staleTime: Infinity,
    enabled: showTree,
  });

  const directCount = selection.allow.size + selection.deny.size;
  const nothingGranted = selectedRoleIds.length === 0 && directCount === 0;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-primary h-4 w-4" />
        <h3 className="text-sm font-semibold text-[var(--text)]">Initial access</h3>
      </div>

      <div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Assign one or more roles. You can change any of this later from the admin&apos;s
          Permissions tab.
        </p>

        {rolesLoading ? (
          <Skeleton />
        ) : !roles?.length ? (
          <p className="text-xs text-[var(--text-muted)]">
            No roles defined yet — create one in the Admin Control Centre, or grant individual
            permissions below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const on = selectedRoleIds.includes(r.id);
              return (
                <Tooltip
                  key={r.id}
                  content={r.description || `${r.permissions.length} permissions`}
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      onRolesChange(
                        on
                          ? selectedRoleIds.filter((id) => id !== r.id)
                          : [...selectedRoleIds, r.id],
                      )
                    }
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all',
                      on
                        ? cn(roleColorClass(r.color), 'ring-2')
                        : 'bg-white text-[var(--text-muted)] ring-[var(--border)] hover:ring-[var(--border-hover)]',
                    )}
                  >
                    {r.name}
                    <span className="ml-1.5 text-[10px] opacity-70">{r.permissions.length}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-3">
        <button
          type="button"
          onClick={() => setShowTree((v) => !v)}
          aria-expanded={showTree}
          className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', showTree && 'rotate-90')}
          />
          Fine-tune individual permissions
          {directCount > 0 && (
            <span className="bg-primary-light text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold">
              {directCount} selected
            </span>
          )}
        </button>

        {showTree && (
          <div className="mt-3">
            {registry ? (
              <PermissionTree
                tree={registry.tree}
                selection={selection}
                onChange={onSelectionChange}
              />
            ) : (
              <Skeleton />
            )}
          </div>
        )}
      </div>

      {nothingGranted && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No access selected. The account will be created and can sign in, but the admin console
          will be empty until you grant something.
        </p>
      )}
    </div>
  );
}
