'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '@/components/layout/AuthLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordStrength from '@/components/auth/PasswordStrength';
import { showToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';
import { createResetPasswordSchema, type ResetPasswordFormData } from '@/validators/auth';
import Tooltip from '@/components/ui/Tooltip';
import { ROUTES } from '@/constants/routes';
import { usePasswordRules } from '@/hooks/use-security-config';
import type { ApiError } from '@/types/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const passwordRules = usePasswordRules();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const dynamicSchema = useMemo(() => createResetPasswordSchema(passwordRules), [passwordRules]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      token: token || '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    try {
      await authService.resetPassword({
        token: data.token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      setIsSuccess(true);
      showToast.success('Password reset successfully!');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const slideVariants = {
    enter: { x: 20, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 },
  };

  if (!token) {
    return (
      <AuthLayout>
        <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
          <div className="text-center">
            <div className="bg-warning-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <AlertTriangle className="text-warning h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">Invalid Reset Link</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Link href={ROUTES.AUTH.FORGOT_PASSWORD}>
              <Button fullWidth className="mt-6" tooltip="Request a new password reset link">
                Request New Link
              </Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="form"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6 text-center">
                <div className="bg-primary-light mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                  <Lock className="text-primary h-7 w-7" />
                </div>
                <h1 className="text-2xl font-bold text-[var(--text)]">Set New Password</h1>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Your new password must be different from previously used passwords.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <input type="hidden" {...register('token')} />

                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
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
                  autoFocus
                  {...register('password')}
                />
                <PasswordStrength password={password || ''} />

                <Input
                  label="Confirm Password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm new password"
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

                <Button
                  type="submit"
                  fullWidth
                  isLoading={isLoading}
                  tooltip="Set your new password"
                >
                  Reset Password
                </Button>
              </form>
            </motion.div>
          ) : (
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
                <h2 className="text-xl font-bold text-[var(--text)]">Password Reset!</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Your password has been successfully reset. You can now log in with your new
                  password.
                </p>
                <Button
                  fullWidth
                  className="mt-6"
                  onClick={() => router.push(ROUTES.AUTH.LOGIN)}
                  tooltip="Go back to login"
                >
                  Go to Login
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
