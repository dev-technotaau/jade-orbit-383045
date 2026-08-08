'use client';

/**
 * Shared login form used by /auth/login/candidate and /auth/login/employer.
 * The role is locked at the page level — the form
 * itself has NO tab UI. Every other behaviour (steps, MFA, passkey, MFA
 * recovery, trusted device cookie, Turnstile, rememberMe, forgot-password,
 * resend timer, post-login redirect) is identical to the legacy combined
 * /auth/login page.
 *
 * The `role` prop only affects the "Sign Up" footer link target — the
 * login API authenticates by email/password and returns the user's actual
 * role. Post-auth navigation uses ROLE_DASHBOARDS[user.role].
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import OtpInput from '@/components/auth/OtpInput';
import Checkbox from '@/components/ui/Checkbox';
import Divider from '@/components/ui/Divider';
import Turnstile from '@/components/auth/Turnstile';
import { showToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import { webauthnService } from '@/services/webauthn.service';
import { startAuthentication } from '@simplewebauthn/browser';
import { loginSchema, type LoginFormData } from '@/validators/auth';
import { ROUTES, ROLE_DASHBOARDS } from '@/constants/routes';
import Tooltip from '@/components/ui/Tooltip';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import AuthRoleTabs from '@/components/auth/AuthRoleTabs';
import type { Role } from '@/types/auth';
import type { ApiError } from '@/types/api';
import type { FaqAudience, FaqPageContext } from '@/data/faqs';

type Step = 'email' | 'password' | 'mfa' | 'mfa-recovery';

const TRUSTED_DEVICE_COOKIE = 'ha_mfa_trust';
const TRUSTED_DEVICE_DAYS = 30;

function getTrustedDeviceToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TRUSTED_DEVICE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setTrustedDeviceCookie(token: string) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${TRUSTED_DEVICE_COOKIE}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Strict; Secure`;
}

export type LoginFormRole = 'candidate' | 'employer';

const REGISTER_HREF: Record<LoginFormRole, string> = {
  candidate: ROUTES.AUTH.REGISTER_CANDIDATE,
  employer: ROUTES.AUTH.REGISTER_EMPLOYER,
};

const FAQ_PAGE_CONTEXT: Record<LoginFormRole, FaqPageContext> = {
  candidate: 'login-candidate',
  employer: 'login-employer',
};

const FAQ_AUDIENCE: Record<LoginFormRole, FaqAudience> = {
  candidate: 'candidate',
  employer: 'employer',
};

interface RoleLoginFormProps {
  role: LoginFormRole;
  /** Chrome toggles — default true (candidate pages unchanged). The employer
      auth pages set these false and render that chrome in their own shell. */
  showRoleTabs?: boolean;
  showCrossLinks?: boolean;
  showSupportFooter?: boolean;
}

export default function RoleLoginForm({
  role,
  // The Candidate/Employer role-switch pill is hidden everywhere by default —
  // the enhanced auth shells provide the cross-role link in their own header.
  // Pass showRoleTabs to explicitly opt back in.
  showRoleTabs = false,
  showCrossLinks = true,
  showSupportFooter = true,
}: RoleLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { login } = useAuth();
  const queryClient = useQueryClient();
  const storeLogin = useAuthStore((s) => s.login);

  const [step, setStep] = useState<Step>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  // Passkey + MFA flow state
  const [passkeyCredential, setPasskeyCredential] = useState<unknown>(null);
  const [passkeyMfaRequired, setPasskeyMfaRequired] = useState(false);
  // MFA recovery state
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    trigger,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  const handleEmailNext = async () => {
    const valid = await trigger('email');
    if (valid) setStep('password');
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const loginData = {
        ...data,
        ...(mfaRequired && { mfaCode, trustDevice }),
        trustDeviceToken: getTrustedDeviceToken(),
      };
      const res = await login(loginData, turnstileToken || undefined);

      // Handle MFA required response (success path, not error)
      if (res.data.requireMfa) {
        setMfaRequired(true);
        setStep('mfa');
        return;
      }

      // Store trusted device cookie if returned
      if (res.data.trustedDeviceToken) {
        setTrustedDeviceCookie(res.data.trustedDeviceToken);
      }

      showToast.success('Welcome back!');
      const userRole = res.data.user.role as Role;
      router.push(redirect || ROLE_DASHBOARDS[userRole]);
    } catch (err) {
      const error = err as ApiError;
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        const loginEmail = getValues('email');
        router.push(`${ROUTES.AUTH.VERIFY_EMAIL}?email=${encodeURIComponent(loginEmail)}`);
        return;
      }
      showToast.error(error.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = () => {
    // For passkey MFA flow
    if (passkeyMfaRequired && passkeyCredential) {
      handlePasskeyMfaVerify();
      return;
    }
    // For password MFA flow: backup codes are 8-9 chars, TOTP is 6
    const minLength = useBackupCode ? 8 : 6;
    if (mfaCode.length >= minLength) {
      handleSubmit(onSubmit)();
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const optionsRes = await webauthnService.getAuthenticationOptions();
      const options = optionsRes.data;
      if (!options) throw new Error('Failed to get authentication options');

      const credential = await startAuthentication({ optionsJSON: options });
      const verifyRes = await webauthnService.verifyAuthentication(credential);
      const authData = verifyRes.data;
      if (!authData) throw new Error('Authentication failed');

      // If MFA is required after passkey, show MFA step
      if (authData.requireMfa) {
        setPasskeyCredential(credential);
        setPasskeyMfaRequired(true);
        setMfaRequired(true);
        setStep('mfa');
        return;
      }

      queryClient.clear();
      storeLogin(authData.user);
      showToast.success('Welcome back!');
      const userRole = authData.user.role as Role;
      router.push(redirect || ROLE_DASHBOARDS[userRole]);
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'NotAllowedError') {
        showToast.error(error.message || 'Passkey authentication failed');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handlePasskeyMfaVerify = async () => {
    if (!passkeyCredential || !mfaCode) return;
    setIsLoading(true);
    try {
      const verifyRes = await webauthnService.verifyAuthentication(passkeyCredential, mfaCode);
      const authData = verifyRes.data;
      if (!authData) throw new Error('Authentication failed');

      queryClient.clear();
      storeLogin(authData.user);
      showToast.success('Welcome back!');
      const userRole = authData.user.role as Role;
      router.push(redirect || ROLE_DASHBOARDS[userRole]);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'MFA verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // MFA Recovery: request OTP
  const handleRecoveryRequest = useCallback(async () => {
    const email = getValues('email');
    if (!email) return;
    setRecoveryLoading(true);
    try {
      await authService.mfaRecoveryRequest(email);
      showToast.success('Recovery code sent to your email.');
      setRecoveryStep('verify');
      setResendTimer(30);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to send recovery code');
    } finally {
      setRecoveryLoading(false);
    }
  }, [getValues]);

  // MFA Recovery: verify OTP → login
  const handleRecoveryVerify = async () => {
    if (recoveryOtp.length !== 6) return;
    const email = getValues('email');
    if (!email) return;
    setRecoveryLoading(true);
    try {
      const res = await authService.mfaRecoveryVerify({ email, otp: recoveryOtp });
      const user = res.data?.user;
      if (user) {
        queryClient.clear();
        storeLogin(user);
        showToast.success('MFA has been disabled. You are now logged in.');
        const userRole = user.role as Role;
        router.push(redirect || ROLE_DASHBOARDS[userRole]);
      }
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Invalid or expired recovery code');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'email') handleEmailNext();
    else if (step === 'password') handleSubmit(onSubmit)();
    else if (step === 'mfa') handleMfaSubmit();
    else if (step === 'mfa-recovery') handleRecoveryVerify();
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
            pre-cutover unified /auth/login page used. */}
        {showRoleTabs && <AuthRoleTabs mode="login" active={role} />}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--text)]">Welcome Back</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Sign in to your account to continue
          </p>
        </div>

        {/* Social Login — temporarily disabled, uncomment when OAuth is configured */}
        {/* <SocialButtons mode="login" role={role === 'employer' ? 'EMPLOYER' : 'CANDIDATE'} /> */}
        {/* <Divider label="OR" className="my-6" /> */}

        {/* Step-wise Form */}
        <form onSubmit={handleFormSubmit}>
          <AnimatePresence mode="wait">
            {step === 'email' && (
              <motion.div
                key="email"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="Enter your email"
                  leftIcon={<Mail className="h-4 w-4" />}
                  error={errors.email?.message}
                  autoFocus
                  {...register('email')}
                />
                <Button
                  type="submit"
                  fullWidth
                  className="mt-4"
                  tooltip="Continue to password step"
                >
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
              >
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
                  <Mail className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-secondary)]">{getValues('email')}</span>
                  <Tooltip content="Change email address">
                    <button
                      type="button"
                      onClick={() => setStep('email')}
                      className="text-primary hover:text-primary-hover ml-auto text-xs"
                    >
                      Change
                    </button>
                  </Tooltip>
                </div>

                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  leftIcon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <Tooltip content={showPassword ? 'Hide password' : 'Show password'}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[var(--text-muted)] hover:text-[var(--text)]"
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
                  autoFocus
                  {...register('password')}
                />

                <div className="mt-3 flex items-center justify-between">
                  <Checkbox label="Remember me" {...register('rememberMe')} />
                  <Tooltip content="Reset your password">
                    <Link
                      href={`${ROUTES.AUTH.FORGOT_PASSWORD}?email=${encodeURIComponent(getValues('email') || '')}`}
                      className="text-primary hover:text-primary-hover text-sm whitespace-nowrap"
                    >
                      Forgot password?
                    </Link>
                  </Tooltip>
                </div>

                <Turnstile onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken('')} />

                <Button
                  type="submit"
                  fullWidth
                  className="mt-4"
                  isLoading={isLoading}
                  tooltip="Sign in to your account"
                >
                  Sign In
                </Button>
              </motion.div>
            )}

            {step === 'mfa' && (
              <motion.div
                key="mfa"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6 text-center">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Two-Factor Authentication
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {useBackupCode
                      ? 'Enter one of your backup codes (e.g. XXXX-XXXX)'
                      : 'Enter the 6-digit code from your authenticator app'}
                  </p>
                </div>

                {useBackupCode ? (
                  <Input
                    label="Backup Code"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    maxLength={9}
                    autoFocus
                  />
                ) : (
                  <OtpInput value={mfaCode} onChange={setMfaCode} onComplete={handleMfaSubmit} />
                )}

                {/* Trust device checkbox */}
                {!passkeyMfaRequired && (
                  <div className="mt-4">
                    <Checkbox
                      label="Trust this device for 30 days"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  fullWidth
                  className="mt-4"
                  isLoading={isLoading}
                  disabled={useBackupCode ? mfaCode.length < 8 : mfaCode.length !== 6}
                  tooltip="Verify MFA code and sign in"
                >
                  Verify & Sign In
                </Button>

                <div className="mt-3 flex items-center justify-between">
                  <Tooltip
                    content={
                      useBackupCode ? 'Switch to authenticator code' : 'Switch to backup code'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(!useBackupCode);
                        setMfaCode('');
                      }}
                      className="text-primary hover:text-primary-hover text-sm"
                    >
                      {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
                    </button>
                  </Tooltip>
                  <Tooltip content="Go back to login">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('password');
                        setMfaRequired(false);
                        setMfaCode('');
                        setPasskeyMfaRequired(false);
                        setPasskeyCredential(null);
                        setUseBackupCode(false);
                        setTrustDevice(false);
                      }}
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      Back to login
                    </button>
                  </Tooltip>
                </div>

                <Tooltip content="Recover your account without authenticator">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('mfa-recovery');
                      setRecoveryStep('request');
                      setRecoveryOtp('');
                      setMfaCode('');
                    }}
                    className="mt-4 w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Can&apos;t access authenticator?
                  </button>
                </Tooltip>
              </motion.div>
            )}

            {step === 'mfa-recovery' && (
              <motion.div
                key="mfa-recovery"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                {recoveryStep === 'request' ? (
                  <>
                    <div className="mb-6 text-center">
                      <h3 className="text-lg font-semibold text-[var(--text)]">Account Recovery</h3>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        We&apos;ll send a 6-digit recovery code to{' '}
                        <strong className="text-[var(--text-secondary)]">
                          {getValues('email')?.replace(/(.{2})(.*)(@.*)/, '$1***$3')}
                        </strong>
                      </p>
                    </div>

                    <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-stone-900">
                      This will <strong>disable two-factor authentication</strong> on your account.
                      You can re-enable it after signing in.
                    </p>

                    <Button
                      type="button"
                      fullWidth
                      onClick={handleRecoveryRequest}
                      isLoading={recoveryLoading}
                      tooltip="Send a recovery code to your email"
                    >
                      Send Recovery Code
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="mb-6 text-center">
                      <h3 className="text-lg font-semibold text-[var(--text)]">
                        Enter Recovery Code
                      </h3>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Check your email for the 6-digit recovery code
                      </p>
                    </div>

                    <OtpInput
                      value={recoveryOtp}
                      onChange={setRecoveryOtp}
                      onComplete={handleRecoveryVerify}
                    />

                    <Button
                      type="submit"
                      fullWidth
                      className="mt-4"
                      isLoading={recoveryLoading}
                      disabled={recoveryOtp.length !== 6}
                      tooltip="Verify recovery code and sign in"
                    >
                      Verify & Sign In
                    </Button>

                    <Tooltip content="Resend the recovery code to your email">
                      <button
                        type="button"
                        onClick={handleRecoveryRequest}
                        disabled={resendTimer > 0 || recoveryLoading}
                        className="mt-3 w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                      >
                        {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                      </button>
                    </Tooltip>
                  </>
                )}

                <Tooltip content="Return to MFA verification">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('mfa');
                      setRecoveryStep('request');
                      setRecoveryOtp('');
                    }}
                    className="mt-3 w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Back to MFA
                  </button>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Passkey Login */}
        <div className="mt-4">
          <Divider label="OR" className="my-4" />
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={handlePasskeyLogin}
            isLoading={passkeyLoading}
            tooltip="Authenticate using your passkey or biometrics"
          >
            <Fingerprint className="mr-2 h-4 w-4" />
            Sign in with Passkey
          </Button>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Don&apos;t have an account?{' '}
          <Tooltip content="Create a new account" inline>
            <Link
              href={REGISTER_HREF[role]}
              className="text-primary hover:text-primary-hover font-medium"
            >
              Sign Up
            </Link>
          </Tooltip>
        </p>

        {/* Switch role — fallback to chooser for users on the wrong page. The
          other role is always reachable from here, regardless of which
          dedicated page is currently rendered. */}
        {showCrossLinks && (
          <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
            {role === 'candidate' ? (
              <Link href={ROUTES.AUTH.LOGIN} className="hover:text-[var(--text)] hover:underline">
                Sign in as Employer →
              </Link>
            ) : (
              <Link href={ROUTES.AUTH.LOGIN} className="hover:text-[var(--text)] hover:underline">
                Sign in as Candidate →
              </Link>
            )}
          </p>
        )}
      </div>

      {showSupportFooter && (
        <AuthSupportFooter pageContext={FAQ_PAGE_CONTEXT[role]} audience={FAQ_AUDIENCE[role]} />
      )}
    </>
  );
}
