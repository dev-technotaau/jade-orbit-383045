'use client';

/**
 * Shared register form used by /auth/register/candidate and
 * /auth/register/employer. Role is locked at the page level — the form
 * itself has NO tab UI. Every other behaviour (info → password → verify →
 * success steps, OTP, resend timer, password strength, terms modal,
 * Turnstile, post-verify redirect) is identical to the legacy combined
 * /auth/register page.
 */

import OtpInput from '@/components/auth/OtpInput';
import PasswordStrength from '@/components/auth/PasswordStrength';
import Turnstile from '@/components/auth/Turnstile';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import AuthRoleTabs from '@/components/auth/AuthRoleTabs';
import LegalModal from '@/components/common/LegalModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { ROLE_DASHBOARDS, ROUTES } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useOtpConfig } from '@/hooks/use-otp-config';
import { usePasswordRules } from '@/hooks/use-security-config';
import { cn } from '@/lib/utils';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import type { ApiError } from '@/types/api';
import type { Role } from '@/types/auth';
import { createRegisterSchema, type RegisterFormData } from '@/validators/auth';
import type { FaqAudience, FaqPageContext } from '@/data/faqs';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Building2, CheckCircle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

type Step = 'info' | 'password' | 'verify' | 'success';

export type RegisterFormRole = 'CANDIDATE' | 'EMPLOYER';

const LOGIN_HREF: Record<RegisterFormRole, string> = {
  CANDIDATE: ROUTES.AUTH.LOGIN_CANDIDATE,
  EMPLOYER: ROUTES.AUTH.LOGIN_EMPLOYER,
};

const FAQ_PAGE_CONTEXT: Record<RegisterFormRole, FaqPageContext> = {
  CANDIDATE: 'register-candidate',
  EMPLOYER: 'register-employer',
};

const FAQ_AUDIENCE: Record<RegisterFormRole, FaqAudience> = {
  CANDIDATE: 'candidate',
  EMPLOYER: 'employer',
};

interface RoleRegisterFormProps {
  role: RegisterFormRole;
  /** Chrome toggles — default true (candidate pages unchanged). The employer
      auth pages set these false and render that chrome in their own shell. */
  showRoleTabs?: boolean;
  showCrossLinks?: boolean;
  showSupportFooter?: boolean;
}

export default function RoleRegisterForm({
  role,
  // The Candidate/Employer role-switch pill is hidden everywhere by default —
  // the enhanced auth shells provide the cross-role link in their own header.
  // Pass showRoleTabs to explicitly opt back in.
  showRoleTabs = false,
  showCrossLinks = true,
  showSupportFooter = true,
}: RoleRegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpConfig = useOtpConfig();
  const passwordRules = usePasswordRules();
  const { register: registerUser } = useAuth();
  const storeLogin = useAuthStore((s) => s.login);

  const [step, setStep] = useState<Step>('info');
  // Role is locked from props — no tab switching here. Kept as `activeTab`
  // internally to keep the form logic byte-identical to the legacy combined
  // page during extraction (just one less degree of freedom).
  const activeTab = role;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const dynamicSchema = useMemo(() => createRegisterSchema(passwordRules), [passwordRules]);

  const {
    register,
    formState: { errors },
    watch,
    trigger,
    setValue,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role,
      mobileNumber: '',
      companyName: '',
      acceptTerms: false,
    },
  });

  // Lock the form's role to the page-level role on mount and on prop change.
  useEffect(() => {
    setValue('role', role);
  }, [role, setValue]);

  const password = watch('password');

  // Resend cooldown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleOtpVerify = useCallback(async () => {
    if (otp.length !== otpConfig.LENGTH) return;
    setIsVerifying(true);
    try {
      const res = await authService.verifyEmail({ token: otp });
      showToast.success('Email verified! Taking you to your dashboard...');
      setStep('success');

      // Tokens are set as httpOnly cookies by the BFF — just store user
      const verifiedUser = res.data.user;
      storeLogin(verifiedUser);
      const userRole = verifiedUser.role as Role;
      // Honor `?redirect=...` so flows like team-invite acceptance
      // (`/team/accept?token=`) auto-resume after signup. Default to the
      // role's dashboard when no redirect is specified.
      const redirectTarget = searchParams.get('redirect');
      const target =
        redirectTarget && redirectTarget.startsWith('/')
          ? redirectTarget
          : ROLE_DASHBOARDS[userRole];
      setTimeout(() => {
        router.push(target);
      }, 1500);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Invalid or expired verification code.');
    } finally {
      setIsVerifying(false);
    }
  }, [otp, otpConfig.LENGTH, storeLogin, router, searchParams]);

  const handleResendOtp = async () => {
    const email = watch('email');
    if (!email) return;
    setIsResending(true);
    try {
      await authService.resendEmailVerification(email);
      showToast.success('Verification code resent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setOtp('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleInfoNext = async () => {
    const fields: Array<keyof RegisterFormData> = ['firstName', 'lastName', 'email'];
    if (activeTab === 'EMPLOYER') fields.push('companyName');
    const valid = await trigger(fields);
    if (valid) setStep('password');
  };

  const handlePasswordNext = async () => {
    const valid = await trigger(['password', 'confirmPassword', 'acceptTerms']);
    if (valid) {
      onSubmit(watch());
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await registerUser(
        {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password,
          role: data.role,
          mobileNumber: data.mobileNumber || undefined,
          companyName: data.companyName || undefined,
        },
        turnstileToken || undefined,
      );
      showToast.success('Account created! Please check your email for the verification code.');
      setStep('verify');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'info') handleInfoNext();
    else if (step === 'password') handlePasswordNext();
    else if (step === 'verify') handleOtpVerify();
  };

  const slideVariants = {
    enter: { x: 20, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 },
  };

  return (
    <>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        {/* Candidate / Employer role tabs — same pill-toggle layout the
            pre-cutover unified /auth/register page used. */}
        {showRoleTabs && (
          <AuthRoleTabs mode="register" active={role === 'CANDIDATE' ? 'candidate' : 'employer'} />
        )}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--text)]">Create Account</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Join Hire Adda to find your perfect match
          </p>
        </div>

        {/* Step indicator */}
        {step !== 'success' && (
          <div className="mb-6 flex items-center justify-center gap-2">
            {(['info', 'password', 'verify'] as const).map((s, i) => {
              const stepOrder = ['info', 'password', 'verify', 'success'];
              const currentIdx = stepOrder.indexOf(step);
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                      step === s
                        ? 'bg-primary text-white'
                        : currentIdx > i
                          ? 'bg-success text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                    )}
                  >
                    {i + 1}
                  </div>
                  {i < 2 && (
                    <div
                      className={cn(
                        'h-0.5 w-8',
                        currentIdx > i ? 'bg-success' : 'bg-[var(--border)]',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <AnimatePresence mode="wait">
            {step === 'info' && (
              <motion.div
                key="info"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Social — temporarily disabled, uncomment when OAuth is configured */}
                {/* <SocialButtons mode="register" role={activeTab} /> */}
                {/* <Divider label="OR" /> */}

                {activeTab === 'EMPLOYER' && (
                  <Input
                    label="Company Name"
                    placeholder="Your company or agency name"
                    leftIcon={<Building2 className="h-4 w-4" />}
                    error={errors.companyName?.message}
                    required
                    {...register('companyName')}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="First Name"
                    placeholder="First name"
                    leftIcon={<User className="h-4 w-4" />}
                    error={errors.firstName?.message}
                    required
                    autoFocus
                    {...register('firstName')}
                  />
                  <Input
                    label="Last Name"
                    placeholder="Last name"
                    error={errors.lastName?.message}
                    required
                    {...register('lastName')}
                  />
                </div>

                <Input
                  label="Email Address"
                  type="email"
                  placeholder="Enter your email"
                  leftIcon={<Mail className="h-4 w-4" />}
                  error={errors.email?.message}
                  required
                  {...register('email')}
                />

                <PhoneInput
                  label="Phone Number"
                  placeholder="9876xxxxxx"
                  error={errors.mobileNumber?.message}
                  helperText="Optional, for OTP verification"
                  value={watch('mobileNumber')}
                  onValueChange={(val) => setValue('mobileNumber', val)}
                />

                <Button type="submit" fullWidth tooltip="Continue to password step">
                  Continue
                </Button>
              </motion.div>
            )}

            {step === 'password' && (
              <motion.div
                key="password"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Tooltip content="Go back to personal information">
                  <button
                    type="button"
                    onClick={() => setStep('info')}
                    className="mb-2 flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                </Tooltip>

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
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
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
                  placeholder="Confirm your password"
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

                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="text-primary mt-1 h-4 w-4 rounded border-[var(--border)]"
                    {...register('acceptTerms')}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setLegalModal('terms')}
                      className="text-primary underline underline-offset-2"
                      title="View Terms of Service"
                    >
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={() => setLegalModal('privacy')}
                      className="text-primary underline underline-offset-2"
                      title="View Privacy Policy"
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p className="text-error text-sm">{errors.acceptTerms.message}</p>
                )}

                <Turnstile onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken('')} />

                <Button
                  type="submit"
                  fullWidth
                  isLoading={isLoading}
                  tooltip="Create your new account"
                >
                  Create Account
                </Button>
              </motion.div>
            )}

            {step === 'verify' && (
              <motion.div
                key="verify"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <div className="text-center">
                  <div className="bg-primary-light mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                    <Mail className="text-primary h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">Verify Your Email</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Enter the 6-digit code we sent to{' '}
                    <span className="font-medium text-[var(--text)]">{watch('email')}</span>
                  </p>
                </div>

                <div className="mt-6 space-y-6">
                  <OtpInput
                    value={otp}
                    onChange={setOtp}
                    onComplete={handleOtpVerify}
                    length={otpConfig.LENGTH}
                  />

                  <Button
                    type="submit"
                    fullWidth
                    isLoading={isVerifying}
                    disabled={otp.length !== otpConfig.LENGTH}
                    tooltip="Verify your email and continue"
                  >
                    Verify & Continue
                  </Button>

                  <div className="text-center">
                    <p className="text-sm text-[var(--text-muted)]">
                      Didn&apos;t receive the code?{' '}
                      {resendTimer > 0 ? (
                        <span className="text-[var(--text-secondary)]">
                          Resend in {resendTimer}s
                        </span>
                      ) : (
                        <Tooltip content="Resend verification code to your email" inline>
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={isResending}
                            className="text-primary font-medium hover:underline disabled:opacity-50"
                          >
                            {isResending ? 'Sending...' : 'Resend Code'}
                          </button>
                        </Tooltip>
                      )}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <div className="py-4 text-center">
                  <div className="bg-success-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                    <CheckCircle className="text-success h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text)]">Registration Successful!</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Taking you to your dashboard...
                  </p>
                  <div className="mt-4 flex justify-center">
                    <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                      <motion.div
                        className="bg-primary h-full rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.5, ease: 'easeInOut' }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {step !== 'verify' && step !== 'success' && (
          <>
            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              Already have an account?{' '}
              <Tooltip content="Sign in to your existing account" inline>
                <Link
                  href={LOGIN_HREF[role]}
                  className="text-primary hover:text-primary-hover font-medium"
                >
                  Sign In
                </Link>
              </Tooltip>
            </p>

            {/* Switch role — fallback to chooser. */}
            {showCrossLinks && (
              <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
                {role === 'CANDIDATE' ? (
                  <Link
                    href={ROUTES.AUTH.REGISTER}
                    className="hover:text-[var(--text)] hover:underline"
                  >
                    Register as Employer →
                  </Link>
                ) : (
                  <Link
                    href={ROUTES.AUTH.REGISTER}
                    className="hover:text-[var(--text)] hover:underline"
                  >
                    Register as Candidate →
                  </Link>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <LegalModal
        isOpen={legalModal !== null}
        onClose={() => setLegalModal(null)}
        type={legalModal ?? 'terms'}
      />

      {showSupportFooter && (
        <AuthSupportFooter pageContext={FAQ_PAGE_CONTEXT[role]} audience={FAQ_AUDIENCE[role]} />
      )}
    </>
  );
}
