'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '@/components/layout/AuthLayout';
import Button from '@/components/ui/Button';
import OtpInput from '@/components/auth/OtpInput';
import { showToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';
import Tooltip from '@/components/ui/Tooltip';
import { ROUTES } from '@/constants/routes';
import { useOtpConfig } from '@/hooks/use-otp-config';
import type { ApiError } from '@/types/api';

type Status = 'pending' | 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpConfig = useOtpConfig();
  const token = searchParams.get('token');
  const email = searchParams.get('email') || '';

  const [status, setStatus] = useState<Status>('pending');
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // Auto-verify if token in URL (e.g. from email link)
  const verifyWithToken = useCallback(async (verifyToken: string) => {
    setStatus('verifying');
    try {
      await authService.verifyEmail({ token: verifyToken });
      setStatus('success');
      showToast.success('Email verified successfully!');
    } catch (err) {
      const error = err as ApiError;
      setStatus('error');
      setErrorMessage(error.message || 'Verification failed. The code may have expired.');
    }
  }, []);

  useEffect(() => {
    if (token) {
      verifyWithToken(token);
    }
  }, [token, verifyWithToken]);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleOtpSubmit = async () => {
    if (otp.length !== otpConfig.LENGTH) return;
    setStatus('verifying');
    try {
      await authService.verifyEmail({ token: otp });
      setStatus('success');
      showToast.success('Email verified successfully!');
    } catch (err) {
      const error = err as ApiError;
      setStatus('error');
      setErrorMessage(error.message || 'Invalid or expired verification code.');
    }
  };

  const handleResend = async () => {
    if (!email) {
      showToast.error('Email address is required to resend the code.');
      return;
    }
    setIsResending(true);
    try {
      await authService.resendEmailVerification(email);
      showToast.success('Verification code resent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setStatus('pending');
      setOtp('');
      setErrorMessage('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleContinue = () => {
    router.push(ROUTES.AUTH.LOGIN);
  };

  const slideVariants = {
    enter: { y: 10, opacity: 0 },
    center: { y: 0, opacity: 1 },
    exit: { y: -10, opacity: 0 },
  };

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        <AnimatePresence mode="wait">
          {/* Verifying state */}
          {status === 'verifying' && (
            <motion.div
              key="verifying"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="py-8 text-center">
                <div className="bg-primary-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <RefreshCw className="text-primary h-8 w-8 animate-spin" />
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Verifying Your Email...
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Please wait while we verify your email address.
                </p>
              </div>
            </motion.div>
          )}

          {/* Pending — OTP input */}
          {status === 'pending' && (
            <motion.div
              key="pending"
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
                <h1 className="text-2xl font-bold text-[var(--text)]">Verify Your Email</h1>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Enter the 6-digit code we sent to your email.
                  {email && (
                    <span className="mt-1 block font-medium text-[var(--text)]">{email}</span>
                  )}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleOtpSubmit();
                }}
                className="mt-6 space-y-6"
              >
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={handleOtpSubmit}
                  length={otpConfig.LENGTH}
                  autoFocus
                />

                <Button
                  type="submit"
                  fullWidth
                  disabled={otp.length !== otpConfig.LENGTH}
                  tooltip="Verify your email address"
                >
                  Verify Email
                </Button>

                <div className="text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    Didn&apos;t receive the code?{' '}
                    {resendTimer > 0 ? (
                      <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
                    ) : (
                      <Tooltip content="Resend verification code to your email" inline>
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={isResending || !email}
                          className="text-primary font-medium hover:underline disabled:opacity-50"
                        >
                          {isResending ? 'Sending...' : 'Resend Code'}
                        </button>
                      </Tooltip>
                    )}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Wrong email?{' '}
                    <Link
                      href={ROUTES.AUTH.REGISTER}
                      className="text-primary font-medium hover:underline"
                    >
                      Change email & re-register
                    </Link>
                  </p>
                </div>
              </form>
            </motion.div>
          )}

          {/* Success */}
          {status === 'success' && (
            <motion.div
              key="success"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="text-center">
                <div className="bg-success-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <CheckCircle className="text-success h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text)]">Email Verified!</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Your email has been successfully verified. You can now log in to your account.
                </p>
                <Button
                  fullWidth
                  className="mt-6"
                  onClick={handleContinue}
                  tooltip="Go to the login page"
                >
                  Continue to Login
                </Button>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {status === 'error' && (
            <motion.div
              key="error"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="text-center">
                <div className="bg-error-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <AlertTriangle className="text-error h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text)]">Verification Failed</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{errorMessage}</p>
                <div className="mt-6 space-y-3">
                  {email && (
                    <Button
                      fullWidth
                      onClick={handleResend}
                      isLoading={isResending}
                      tooltip="Resend verification code to your email"
                    >
                      Resend Verification Code
                    </Button>
                  )}
                  <Link href={ROUTES.AUTH.LOGIN}>
                    <Button variant="outline" fullWidth tooltip="Go back to login">
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
