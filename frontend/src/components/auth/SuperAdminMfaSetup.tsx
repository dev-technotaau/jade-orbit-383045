'use client';

import { useState, useCallback } from 'react';
import { Shield, Copy, Check, LogOut, Lock } from 'lucide-react';
import Logo from '@/components/common/Logo';
import BackupCodes from '@/components/auth/BackupCodes';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import OtpInput from '@/components/auth/OtpInput';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import type { MfaSetupResponse } from '@/types/auth';
import type { User } from '@/types/auth';
import type { ApiError } from '@/types/api';

type Step = 'idle' | 'setup' | 'backup-codes';

export default function SuperAdminMfaSetup() {
  const { logout } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<Step>('idle');
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [enablePassword, setEnablePassword] = useState('');
  const [enableLoading, setEnableLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await authService.mfaSetup();
      setMfaSetup(res.data);
      setStep('setup');
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to initialize MFA setup');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleEnable = async () => {
    if (!enablePassword) {
      showToast.error('Please enter your password');
      return;
    }
    if (!verifyCode || verifyCode.length !== 6) {
      showToast.error('Please enter the 6-digit verification code');
      return;
    }
    setEnableLoading(true);
    try {
      const res = await authService.mfaEnable({ token: verifyCode, password: enablePassword });
      setBackupCodes(res.data?.backupCodes ?? []);
      setStep('backup-codes');
      showToast.success('MFA enabled successfully!');
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Invalid verification code');
    } finally {
      setEnableLoading(false);
    }
  };

  const handleContinue = async () => {
    setContinueLoading(true);
    try {
      const res = await authService.getMe();
      const payload = res.data as unknown as Record<string, unknown>;
      const userData = (payload?.user ?? res.data) as User;
      setUser(userData);
    } catch {
      window.location.reload();
    } finally {
      setContinueLoading(false);
    }
  };

  const copySecret = useCallback(() => {
    if (mfaSetup?.secret) {
      navigator.clipboard.writeText(mfaSetup.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }, [mfaSetup?.secret]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-secondary)]">
      <header className="flex h-16 items-center px-4 sm:h-20 sm:px-6">
        <Logo />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 text-center">
              <div className="bg-primary-light mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                <Shield className="text-primary h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--text)]">
                Set Up Two-Factor Authentication
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                MFA is required to access the Super Admin panel
              </p>
            </div>

            {/* Step 1: Idle */}
            {step === 'idle' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-muted)]">
                  <p>
                    You need to set up two-factor authentication using an authenticator app (e.g.,
                    Google Authenticator, Authy) before you can access the administration panel.
                  </p>
                </div>

                <Button
                  fullWidth
                  isLoading={setupLoading}
                  onClick={handleSetup}
                  tooltip="Begin MFA setup"
                >
                  Set Up MFA
                </Button>
              </div>
            )}

            {/* Step 2: QR + OTP verification */}
            {step === 'setup' && mfaSetup && (
              <div className="space-y-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  Scan the QR code below with your authenticator app, then enter the 6-digit
                  verification code.
                </p>

                <div className="flex justify-center">
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <img src={mfaSetup.qrCodeUrl} alt="MFA QR Code" className="h-48 w-48" />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--text)]">
                    Or enter this secret manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 font-mono text-sm break-all text-[var(--text)]">
                      {mfaSetup.secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copySecret}
                      leftIcon={
                        copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
                      }
                      tooltip="Copy secret key"
                    >
                      {copiedSecret ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <Input
                  label="Password"
                  type="password"
                  value={enablePassword}
                  onChange={(e) => setEnablePassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Verification Code
                  </label>
                  <OtpInput value={verifyCode} onChange={setVerifyCode} onComplete={handleEnable} />
                </div>

                <Button
                  fullWidth
                  isLoading={enableLoading}
                  onClick={handleEnable}
                  disabled={!enablePassword || verifyCode.length !== 6}
                  tooltip="Verify code and enable MFA"
                >
                  Verify &amp; Enable
                </Button>
              </div>
            )}

            {/* Step 3: Backup codes */}
            {step === 'backup-codes' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-[var(--success)]/10 px-4 py-2 text-center">
                  <p className="text-sm font-medium text-[var(--success)]">
                    MFA has been enabled for your account
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--text)]">Backup Codes</p>
                  <p className="mb-3 text-xs text-[var(--text-muted)]">
                    Save these codes in a safe place. You can use them to access your account if you
                    lose your authenticator device.
                  </p>
                  <BackupCodes codes={backupCodes} />
                </div>

                <Button
                  fullWidth
                  isLoading={continueLoading}
                  onClick={handleContinue}
                  tooltip="Go to dashboard"
                >
                  Continue to Dashboard
                </Button>
              </div>
            )}

            {/* Sign out — always visible */}
            <Tooltip content="Sign out of your account" className="mt-4">
              <button
                type="button"
                onClick={() => logout()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </Tooltip>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-sm text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} HireAdda. All rights reserved.
      </footer>
    </div>
  );
}
