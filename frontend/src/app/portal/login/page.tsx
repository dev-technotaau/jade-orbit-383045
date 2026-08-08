'use client';

import OtpInput from '@/components/auth/OtpInput';
import Turnstile from '@/components/auth/Turnstile';
import Logo from '@/components/common/Logo';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Divider from '@/components/ui/Divider';
import Input from '@/components/ui/Input';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { ROLE_DASHBOARDS } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { authService } from '@/services/auth.service';
import { webauthnService } from '@/services/webauthn.service';
import { useAuthStore } from '@/store/auth.store';
import type { ApiError } from '@/types/api';
import type { Role } from '@/types/auth';
import { loginSchema, type LoginFormData } from '@/validators/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { startAuthentication } from '@simplewebauthn/browser';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Fingerprint, Lock, Mail, Shield } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

type Step = 'email' | 'password' | 'mfa' | 'mfa-recovery';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { login } = useAuth();
  const queryClient = useQueryClient();
  const storeLogin = useAuthStore((s) => s.login);
  const storeLogout = useAuthStore((s) => s.logout);

  const [step, setStep] = useState<Step>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [mfaUserRole, setMfaUserRole] = useState<Role | null>(null);
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
        ...(mfaRequired && { mfaCode }),
      };
      const res = await login(loginData, turnstileToken || undefined);

      // Handle MFA requirement — backend returns requireMfa flag with user data (incl. role)
      if (res.data.requireMfa) {
        setMfaRequired(true);
        if (res.data.user?.role) setMfaUserRole(res.data.user.role as Role);
        setStep('mfa');
        return;
      }

      const role = res.data.user.role as Role;

      if (!ADMIN_ROLES.includes(role)) {
        storeLogout();
        showToast.error('Access denied. This portal is for administrators only.');
        return;
      }

      showToast.success('Welcome back!');
      router.push(redirect || ROLE_DASHBOARDS[role]);
    } catch (err) {
      const error = err as ApiError;
      if (error.message?.includes('MFA') || error.message?.includes('mfa')) {
        setMfaRequired(true);
        setStep('mfa');
      } else {
        showToast.error(error.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = () => {
    if (mfaCode.length === 6) {
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

      const role = authData.user.role as Role;
      if (!ADMIN_ROLES.includes(role)) {
        showToast.error('Access denied. This portal is for administrators only.');
        return;
      }

      queryClient.clear();
      storeLogin(authData.user);
      showToast.success('Welcome back!');
      router.push(redirect || ROLE_DASHBOARDS[role]);
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'NotAllowedError') {
        showToast.error(error.message || 'Passkey authentication failed');
      }
    } finally {
      setPasskeyLoading(false);
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
        const role = user.role as Role;
        if (!ADMIN_ROLES.includes(role)) {
          storeLogout();
          showToast.error('Access denied. This portal is for administrators only.');
          return;
        }
        queryClient.clear();
        storeLogin(user);
        showToast.success('MFA has been disabled. You are now logged in.');
        router.push(redirect || ROLE_DASHBOARDS[role]);
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
    <div className="flex min-h-screen flex-col bg-[var(--bg-secondary)]">
      {/* Centered content — logo sits directly above the auth card
          (instead of a top-left header) so the Hire Adda brand reads
          first, then the Admin Portal headline inside the card.
          Mirrors the AuthLayout structure used by the rest of /auth/*. */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center sm:mb-8">
            <Logo size="lg" />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            {/* Admin Portal Header */}
            <div className="mb-6 text-center">
              <div className="bg-primary-light mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                <Shield className="text-primary h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Admin Portal</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Sign in to access the administration panel
              </p>
            </div>

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
                      placeholder="Enter your admin email"
                      leftIcon={<Mail className="h-4 w-4" />}
                      error={errors.email?.message}
                      autoFocus
                      {...register('email')}
                    />
                    <Button type="submit" fullWidth className="mt-4" tooltip="Continue to password">
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
                      <span className="text-sm text-[var(--text-secondary)]">
                        {getValues('email')}
                      </span>
                      <Tooltip content="Change email address">
                        <button
                          type="button"
                          onClick={() => setStep('email')}
                          className="text-primary hover:text-primary-hover ml-auto cursor-pointer text-xs"
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
                            onClick={() => setShowPassword(!showPassword)}
                            className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
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
                      <p className="text-xs text-[var(--text-muted)]">
                        Forgot password? Contact a Super Admin.
                      </p>
                    </div>

                    <Turnstile
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken('')}
                    />

                    <Button
                      type="submit"
                      fullWidth
                      className="mt-4"
                      isLoading={isLoading}
                      tooltip="Sign in to admin portal"
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
                        Enter the 6-digit code from your authenticator app
                      </p>
                    </div>

                    <OtpInput value={mfaCode} onChange={setMfaCode} onComplete={handleMfaSubmit} />

                    <Button
                      type="submit"
                      fullWidth
                      className="mt-6"
                      isLoading={isLoading}
                      disabled={mfaCode.length !== 6}
                      tooltip="Verify MFA and sign in"
                    >
                      Verify & Sign In
                    </Button>

                    <Tooltip content="Return to login">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('password');
                          setMfaRequired(false);
                          setMfaCode('');
                        }}
                        className="mt-3 w-full cursor-pointer text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        Back to login
                      </button>
                    </Tooltip>

                    {/* Admin MFA is managed by Super Admin — only show recovery for Super Admin */}
                    {mfaUserRole !== 'ADMIN' && (
                      <Tooltip content="Recover MFA access">
                        <button
                          type="button"
                          onClick={() => {
                            setStep('mfa-recovery');
                            setRecoveryStep('request');
                            setRecoveryOtp('');
                            setMfaCode('');
                          }}
                          className="mt-4 w-full cursor-pointer text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          Can&apos;t access authenticator?
                        </button>
                      </Tooltip>
                    )}
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
                          <h3 className="text-lg font-semibold text-[var(--text)]">
                            Account Recovery
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            We&apos;ll send a 6-digit recovery code to{' '}
                            <strong className="text-[var(--text-secondary)]">
                              {getValues('email')?.replace(/(.{2})(.*)(@.*)/, '$1***$3')}
                            </strong>
                          </p>
                        </div>

                        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-stone-900">
                          This will <strong>disable two-factor authentication</strong> on your
                          account. You can re-enable it after signing in.
                        </p>

                        <Button
                          type="button"
                          fullWidth
                          onClick={handleRecoveryRequest}
                          isLoading={recoveryLoading}
                          tooltip="Send recovery code via email"
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
                          tooltip="Verify recovery code"
                        >
                          Verify & Sign In
                        </Button>

                        <Tooltip content="Resend recovery code">
                          <button
                            type="button"
                            onClick={handleRecoveryRequest}
                            disabled={resendTimer > 0 || recoveryLoading}
                            className="mt-3 w-full cursor-pointer text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
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
                        className="mt-3 w-full cursor-pointer text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
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
                tooltip="Authenticate using your registered passkey"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Sign in with Passkey
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="py-4 text-center text-sm text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} Hire Adda. All rights reserved.
      </footer>
    </div>
  );
}
