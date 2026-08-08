'use client';

import OtpInput from '@/components/auth/OtpInput';
import BackupCodes from '@/components/auth/BackupCodes';
import DashboardLayout from '@/components/layout/DashboardLayout';
import BrandIcon from '@/components/common/BrandIcon';
import WhatsappOptInToggle from '@/components/common/WhatsappOptInToggle';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PhoneInput from '@/components/ui/PhoneInput';
import Tabs from '@/components/ui/Tabs';
import { showToast } from '@/components/ui/Toast';
import DigestPreferences, { type DigestPrefsValue } from '@/components/settings/DigestPreferences';
import Tooltip from '@/components/ui/Tooltip';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useOtpConfig } from '@/hooks/use-otp-config';
import { usePasswordRules } from '@/hooks/use-security-config';
import { formatRelativeDate } from '@/lib/utils';
import { authService } from '@/services/auth.service';
import { candidateService } from '@/services/candidate.service';
import { sessionService } from '@/services/session.service';
import { webauthnService } from '@/services/webauthn.service';
import type { ApiError } from '@/types/api';
import type { MfaSetupResponse, Session } from '@/types/auth';
import type { WebAuthnCredential } from '@/types/webauthn';
import { startRegistration } from '@simplewebauthn/browser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Check,
  CheckCircle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Phone,
  Plus,
  Scale,
  Shield,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const TABS = [
  { key: 'account', label: 'Account' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'legal', label: 'Legal' },
];

type ProfileVisibility = 'public' | 'registered' | 'private';

export default function CandidateSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() =>
    tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : 'account',
  );

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange}>
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'security' && <SecurityTab user={user} />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'privacy' && <PrivacyTab />}
          {activeTab === 'legal' && <LegalTab />}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Account Tab
// ---------------------------------------------------------------------------

function AccountTab() {
  return (
    <div className="space-y-6">
      <ChangeEmailSection />
      <MobileVerificationSection />
      <WhatsAppVerificationSection />
      <ChangePasswordSection />
      <DangerZoneSection />
    </div>
  );
}

function ChangeEmailSection() {
  const { user } = useAuth();
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!newEmail) newErrors.newEmail = 'New email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      newErrors.newEmail = 'Please enter a valid email';
    else if (newEmail === user?.email)
      newErrors.newEmail = 'New email must be different from your current email';
    if (!password) newErrors.password = 'Password is required for verification';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      await authService.initiateChangeEmail({ newEmail, password });
      showToast.success('Verification code sent to your new email address.');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setErrors({});
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to initiate email change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.length !== otpConfig.LENGTH) return;
    setIsLoading(true);
    try {
      await authService.confirmChangeEmail({ otp });
      showToast.success('Email changed successfully!');
      setStep('form');
      setNewEmail('');
      setPassword('');
      setOtp('');
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Invalid or expired verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authService.resendChangeEmailOtp();
      showToast.success('New verification code sent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setOtp('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const handleCancel = () => {
    setStep('form');
    setOtp('');
    setErrors({});
  };

  return (
    <Card variant="bordered">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
          <Mail className="text-primary h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Change Email</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Update the email address associated with your account
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
        <p className="text-sm text-[var(--text-muted)]">Current email</p>
        <p className="text-sm font-medium text-[var(--text)]">{user?.email}</p>
      </div>

      {step === 'form' ? (
        <form onSubmit={handleInitiate} className="max-w-md space-y-4">
          <Input
            label="New Email Address"
            type="email"
            placeholder="Enter your new email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            error={errors.newEmail}
            leftIcon={<Mail className="h-4 w-4" />}
            required
          />
          <Input
            label="Current Password"
            type="password"
            placeholder="Enter your password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />
          <div className="pt-2">
            <Button type="submit" isLoading={isLoading} tooltip="Submit email change request">
              Change Email
            </Button>
          </div>
        </form>
      ) : (
        <div className="max-w-md space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              A verification code has been sent to{' '}
              <span className="font-medium text-[var(--text)]">{newEmail}</span>. Enter it below to
              confirm your email change.
            </p>
          </div>
          <OtpInput
            value={otp}
            onChange={setOtp}
            length={otpConfig.LENGTH}
            onComplete={handleConfirm}
          />
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Didn&apos;t receive the code?{' '}
              {resendTimer > 0 ? (
                <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
              ) : (
                <Tooltip content="Resend verification code to your email">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                  >
                    {isResending ? 'Sending...' : 'Resend Code'}
                  </button>
                </Tooltip>
              )}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              isLoading={isLoading}
              onClick={handleConfirm}
              disabled={otp.length !== otpConfig.LENGTH}
              tooltip="Confirm email change"
            >
              Confirm Change
            </Button>
            <Button variant="outline" onClick={handleCancel} tooltip="Cancel email change">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MobileVerificationSection() {
  const { user } = useAuth();
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'idle' | 'change' | 'otp'>('idle');
  const [mode, setMode] = useState<'verify' | 'change'>('verify');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Verify existing unverified number
  const handleSendOtp = async () => {
    const number = mobileNumber || user?.mobileNumber;
    if (!number) {
      showToast.error('Please enter a mobile number');
      return;
    }
    setIsLoading(true);
    try {
      await authService.resendMobileOtp({ mobileNumber: number });
      showToast.success('OTP sent to your mobile number');
      setMode('verify');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Initiate mobile number change (with password)
  const handleInitiateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!mobileNumber) newErrors.mobileNumber = 'New mobile number is required';
    else if (mobileNumber === user?.mobileNumber)
      newErrors.mobileNumber = 'New number must be different from current number';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    try {
      await authService.initiateChangeMobile({ newMobileNumber: mobileNumber, password });
      showToast.success('Verification code sent to your new number');
      setMode('change');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setErrors({});
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to initiate mobile change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      if (mode === 'change') {
        await authService.resendChangeMobileOtp();
      } else {
        const number = mobileNumber || user?.mobileNumber;
        if (!number) return;
        await authService.resendMobileOtp({ mobileNumber: number });
      }
      showToast.success('New OTP sent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setOtp('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== otpConfig.LENGTH) return;
    setIsLoading(true);
    try {
      if (mode === 'change') {
        await authService.confirmChangeMobile({ otp });
        showToast.success('Mobile number changed successfully!');
      } else {
        await authService.verifyMobile({
          mobileNumber: mobileNumber || user?.mobileNumber || '',
          otp,
        });
        showToast.success('Mobile number verified successfully!');
      }
      setStep('idle');
      setOtp('');
      setMobileNumber('');
      setPassword('');
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setStep('idle');
    setOtp('');
    setMobileNumber('');
    setPassword('');
    setErrors({});
  };

  const hasMobile = user?.mobileNumber;
  const isVerified = user?.isMobileVerified;

  return (
    <Card variant="bordered">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
          <Phone className="text-primary h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Phone Number</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Verify your phone number for SMS notifications and account recovery
          </p>
        </div>
      </div>

      {hasMobile && step !== 'change' && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
          <div className="flex-1">
            <p className="text-sm text-[var(--text-muted)]">Current number</p>
            <p className="text-sm font-medium text-[var(--text)]">{user.mobileNumber}</p>
          </div>
          {isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-3 py-1 text-xs font-medium text-[var(--success)]">
              <CheckCircle className="h-3.5 w-3.5" /> Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)]/10 px-3 py-1 text-xs font-medium text-[var(--warning)]">
              Not verified
            </span>
          )}
        </div>
      )}

      {step === 'idle' && (
        <div className="max-w-md space-y-4">
          {!hasMobile && (
            <PhoneInput
              label="Mobile Number"
              placeholder="9876xxxxxx"
              value={mobileNumber}
              onValueChange={setMobileNumber}
            />
          )}
          <div className="flex gap-3 pt-1">
            {!isVerified && (
              <Button
                isLoading={isLoading}
                onClick={handleSendOtp}
                disabled={!hasMobile && !mobileNumber}
                tooltip="Send verification code to your phone"
              >
                {hasMobile ? 'Verify Phone Number' : 'Add & Verify'}
              </Button>
            )}
            {hasMobile && (
              <Button
                variant={isVerified ? 'primary' : 'outline'}
                onClick={() => {
                  setStep('change');
                  setMobileNumber('');
                  setPassword('');
                  setErrors({});
                }}
                tooltip="Change your phone number"
              >
                Change Number
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'change' && (
        <form onSubmit={handleInitiateChange} className="max-w-md space-y-4">
          <PhoneInput
            label="New Mobile Number"
            placeholder="9876xxxxxx"
            value={mobileNumber}
            onValueChange={setMobileNumber}
            error={errors.mobileNumber}
            required
          />
          <Input
            label="Current Password"
            type="password"
            placeholder="Enter your password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              {user?.whatsappNumber
                ? "Your separate WhatsApp number won't be affected by this change."
                : 'WhatsApp verification will be reset when you change your mobile number.'}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={isLoading} tooltip="Submit number change request">
              Change Number
            </Button>
            <Button variant="outline" onClick={handleCancel} tooltip="Cancel number change">
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'otp' && (
        <div className="max-w-md space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Enter the verification code sent to{' '}
              {mode === 'change' ? (
                <span className="font-medium text-[var(--text)]">{mobileNumber}</span>
              ) : (
                'your phone'
              )}
              .
            </p>
          </div>
          <OtpInput
            value={otp}
            onChange={setOtp}
            length={otpConfig.LENGTH}
            onComplete={handleVerify}
          />
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Didn&apos;t receive the code?{' '}
              {resendTimer > 0 ? (
                <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
              ) : (
                <Tooltip content="Resend verification code to your phone">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                  >
                    {isResending ? 'Sending...' : 'Resend Code'}
                  </button>
                </Tooltip>
              )}
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              isLoading={isLoading}
              onClick={handleVerify}
              disabled={otp.length !== otpConfig.LENGTH}
              tooltip="Verify your phone number"
            >
              Verify
            </Button>
            <Button variant="outline" onClick={handleCancel} tooltip="Cancel verification">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function WhatsAppVerificationSection() {
  const { user } = useAuth();
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'idle' | 'otp' | 'change'>('idle');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [newWhatsappNumber, setNewWhatsappNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showRemoveWhatsappConfirm, setShowRemoveWhatsappConfirm] = useState(false);
  const [showRemoveSeparateConfirm, setShowRemoveSeparateConfirm] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const hasMobile = user?.mobileNumber;
  const isVerified = user?.isWhatsappVerified;
  const hasSeparateNumber = !!user?.whatsappNumber;
  const displayNumber = user?.whatsappNumber || user?.mobileNumber;

  const handleSendOtp = async () => {
    if (!user?.mobileNumber) {
      showToast.error('Please verify your phone number first');
      return;
    }
    setIsLoading(true);
    try {
      await authService.verifyWhatsApp({ mobileNumber: user.mobileNumber });
      showToast.success('OTP sent to your WhatsApp');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to send WhatsApp OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhatsappNumber || !password) return;
    setIsLoading(true);
    try {
      await authService.changeWhatsappNumber({ newWhatsappNumber, password });
      showToast.success('OTP sent to your new WhatsApp number');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to change WhatsApp number');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveSeparateNumber = async () => {
    setShowRemoveSeparateConfirm(false);
    setIsLoading(true);
    try {
      await authService.removeWhatsappNumber();
      showToast.success(
        'Separate WhatsApp number removed. You can re-verify using your mobile number.',
      );
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to remove WhatsApp number');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveWhatsapp = async () => {
    setShowRemoveWhatsappConfirm(false);
    setIsLoading(true);
    try {
      await authService.removeWhatsappNumber();
      showToast.success('WhatsApp verification removed.');
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to remove WhatsApp verification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      // If changing number, resend to the new number via changeWhatsappNumber
      // Otherwise use the standard verify flow with mobile number
      if (newWhatsappNumber && password) {
        await authService.changeWhatsappNumber({ newWhatsappNumber, password });
      } else if (user?.mobileNumber) {
        await authService.verifyWhatsApp({ mobileNumber: user.mobileNumber });
      } else {
        return;
      }
      showToast.success('New OTP sent to WhatsApp!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setOtp('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async () => {
    const verifyNumber = newWhatsappNumber || user?.mobileNumber;
    if (otp.length !== otpConfig.LENGTH || !verifyNumber) return;
    setIsLoading(true);
    try {
      await authService.verifyWhatsAppOtp({ mobileNumber: verifyNumber, otp });
      showToast.success('WhatsApp verified successfully!');
      setStep('idle');
      setOtp('');
      setNewWhatsappNumber('');
      setPassword('');
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const resetToIdle = () => {
    setStep('idle');
    setOtp('');
    setNewWhatsappNumber('');
    setPassword('');
  };

  return (
    <Card variant="bordered">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
          <BrandIcon name="whatsapp" className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">WhatsApp Verification</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Verify WhatsApp to receive notifications via WhatsApp
          </p>
        </div>
      </div>

      {isVerified && step === 'idle' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <div className="flex-1">
              <p className="text-sm text-[var(--text-muted)]">WhatsApp number</p>
              <p className="text-sm font-medium text-[var(--text)]">
                {displayNumber}
                {hasSeparateNumber && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    (different from mobile)
                  </span>
                )}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-3 py-1 text-xs font-medium text-[var(--success)]">
              <CheckCircle className="h-3.5 w-3.5" /> Verified
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Tooltip
              content={
                hasSeparateNumber
                  ? 'Change your WhatsApp number'
                  : 'Use a different number for WhatsApp'
              }
            >
              <button
                type="button"
                onClick={() => setStep('change')}
                className="text-primary cursor-pointer text-sm font-medium hover:underline"
              >
                {hasSeparateNumber
                  ? 'Change WhatsApp number'
                  : 'Use a different number for WhatsApp'}
              </button>
            </Tooltip>
            {hasSeparateNumber && (
              <Tooltip content="Revert to using your mobile number for WhatsApp">
                <button
                  type="button"
                  onClick={() => setShowRemoveSeparateConfirm(true)}
                  disabled={isLoading}
                  className="cursor-pointer text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:underline disabled:opacity-50"
                >
                  Use mobile number instead
                </button>
              </Tooltip>
            )}
            <Tooltip content="Remove WhatsApp from your account">
              <button
                type="button"
                onClick={() => setShowRemoveWhatsappConfirm(true)}
                disabled={isLoading}
                className="cursor-pointer text-sm font-medium text-[var(--error)] hover:underline disabled:opacity-50"
              >
                Remove WhatsApp verification
              </button>
            </Tooltip>
          </div>
        </div>
      ) : step === 'change' ? (
        <form onSubmit={handleChangeNumber} className="max-w-md space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-muted)]">
              Enter a different WhatsApp number. An OTP will be sent to verify it.
            </p>
          </div>
          <PhoneInput
            label="New WhatsApp Number"
            placeholder="9876xxxxxx"
            value={newWhatsappNumber}
            onValueChange={setNewWhatsappNumber}
            required
          />
          <Input
            label="Current Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="flex gap-3 pt-1">
            <Button
              type="submit"
              isLoading={isLoading}
              disabled={!newWhatsappNumber || !password}
              tooltip="Continue with WhatsApp number change"
            >
              Continue
            </Button>
            <Button variant="outline" onClick={resetToIdle} tooltip="Cancel WhatsApp number change">
              Cancel
            </Button>
          </div>
        </form>
      ) : step === 'otp' ? (
        <div className="max-w-md space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Enter the 6-digit code sent to your WhatsApp
              {newWhatsappNumber && (
                <span className="font-medium text-[var(--text)]"> ({newWhatsappNumber})</span>
              )}
              .
            </p>
          </div>
          <OtpInput
            value={otp}
            onChange={setOtp}
            length={otpConfig.LENGTH}
            onComplete={handleVerify}
          />
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Didn&apos;t receive the code?{' '}
              {resendTimer > 0 ? (
                <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
              ) : (
                <Tooltip content="Resend verification code to WhatsApp">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                  >
                    {isResending ? 'Sending...' : 'Resend Code'}
                  </button>
                </Tooltip>
              )}
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              isLoading={isLoading}
              onClick={handleVerify}
              disabled={otp.length !== otpConfig.LENGTH}
              tooltip="Verify your WhatsApp number"
            >
              Verify
            </Button>
            <Button variant="outline" onClick={resetToIdle} tooltip="Cancel verification">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* step === 'idle' && !isVerified */
        <div className="max-w-md space-y-4">
          {displayNumber ? (
            <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-muted)]">
                WhatsApp number:{' '}
                <span className="font-medium text-[var(--text)]">{displayNumber}</span>
                {!hasSeparateNumber && hasMobile && ' (same as mobile)'}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-muted)]">
                No WhatsApp number set. Add a number to receive WhatsApp notifications.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {hasMobile && (
              <Button
                isLoading={isLoading}
                onClick={handleSendOtp}
                tooltip="Send verification code to your WhatsApp"
              >
                Verify WhatsApp
              </Button>
            )}
            <Tooltip
              content={displayNumber ? 'Change your WhatsApp number' : 'Add a WhatsApp number'}
            >
              <button
                type="button"
                onClick={() => setStep('change')}
                className="text-primary cursor-pointer text-sm font-medium hover:underline"
              >
                {displayNumber ? 'Change WhatsApp number' : 'Add WhatsApp number'}
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showRemoveWhatsappConfirm}
        onClose={() => setShowRemoveWhatsappConfirm(false)}
        onConfirm={handleRemoveWhatsapp}
        title="Remove WhatsApp Verification"
        message="Are you sure you want to remove WhatsApp verification? You will stop receiving WhatsApp notifications."
        confirmLabel="Remove"
      />
      <ConfirmDialog
        isOpen={showRemoveSeparateConfirm}
        onClose={() => setShowRemoveSeparateConfirm(false)}
        onConfirm={handleRemoveSeparateNumber}
        title="Remove Separate WhatsApp Number"
        message="Are you sure you want to remove your separate WhatsApp number? Your mobile number will be used instead."
        confirmLabel="Remove"
        variant="warning"
      />
    </Card>
  );
}

function ChangePasswordSection() {
  const otpConfig = useOtpConfig();
  const passwordRules = usePasswordRules();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!currentPassword) newErrors.currentPassword = 'Current password is required';
    if (!newPassword) newErrors.newPassword = 'New password is required';
    else if (newPassword.length < passwordRules.MIN_LENGTH)
      newErrors.newPassword = `Password must be at least ${passwordRules.MIN_LENGTH} characters`;
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your new password';
    else if (newPassword !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      await authService.initiateChangePassword({
        currentPassword,
      });
      showToast.success('Verification code sent to your email');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setErrors({});
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to initiate password change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authService.initiateChangePassword({
        currentPassword,
      });
      showToast.success('New verification code sent!');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
      setOtp('');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.length !== otpConfig.LENGTH) {
      setErrors({ otp: 'Please enter the complete 6-digit code' });
      return;
    }

    setIsLoading(true);
    try {
      await authService.confirmChangePassword({ otp, newPassword, confirmPassword });
      showToast.success('Password changed successfully');
      setStep('form');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtp('');
      setErrors({});
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to confirm password change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setStep('form');
    setOtp('');
    setErrors({});
  };

  return (
    <Card variant="bordered">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
          <Lock className="text-primary h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Change Password</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Update your password to keep your account secure
          </p>
        </div>
      </div>

      {step === 'form' ? (
        <form onSubmit={handleInitiate} className="max-w-md space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={errors.currentPassword}
            leftIcon={<KeyRound className="h-4 w-4" />}
            required
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            helperText="Must be at least 8 characters"
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />
          <div className="pt-2">
            <Button type="submit" isLoading={isLoading} tooltip="Submit password change request">
              Update Password
            </Button>
          </div>
        </form>
      ) : (
        <div className="max-w-md space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              A verification code has been sent to your email. Enter it below to confirm your
              password change.
            </p>
          </div>
          <OtpInput value={otp} onChange={setOtp} length={otpConfig.LENGTH} />
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Didn&apos;t receive the code?{' '}
              {resendTimer > 0 ? (
                <span className="text-[var(--text-secondary)]">Resend in {resendTimer}s</span>
              ) : (
                <Tooltip content="Resend verification code to your email">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-primary cursor-pointer font-medium hover:underline disabled:opacity-50"
                  >
                    {isResending ? 'Sending...' : 'Resend Code'}
                  </button>
                </Tooltip>
              )}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              isLoading={isLoading}
              onClick={handleConfirm}
              disabled={otp.length !== otpConfig.LENGTH}
              tooltip="Confirm password change"
            >
              Confirm Change
            </Button>
            <Button variant="outline" onClick={handleCancel} tooltip="Cancel password change">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DangerZoneSection() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <>
      <Card variant="bordered" className="border-opacity-30 border-[var(--error)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--error-light)]">
            <Trash2 className="h-5 w-5 text-[var(--error)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--error)]">Danger Zone</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Irreversible and destructive actions
            </p>
          </div>
        </div>

        <div className="border-opacity-30 flex items-center justify-between rounded-lg border border-[var(--error)] p-4">
          <div>
            <p className="font-medium text-[var(--text)]">Delete Account</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() => setShowDeleteModal(true)}
            tooltip="Permanently delete your account"
          >
            Delete Account
          </Button>
        </div>
      </Card>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setConfirmText('');
        }}
        title="Delete Account"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setConfirmText('');
              }}
              tooltip="Cancel account deletion"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== 'DELETE'}
              onClick={() => {
                showToast.info('Account deletion is not yet available. Please contact support.');
                setShowDeleteModal(false);
                setConfirmText('');
              }}
              tooltip="Confirm account deletion"
            >
              Delete Account
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            This action is <strong className="text-[var(--error)]">permanent</strong> and cannot be
            undone. All your data, including your profile, applications, and saved jobs will be
            permanently deleted.
          </p>
          <Input
            label='Type "DELETE" to confirm'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Security Tab
// ---------------------------------------------------------------------------

interface SecurityTabProps {
  user: ReturnType<typeof useAuth>['user'];
}

function SecurityTab({ user }: SecurityTabProps) {
  return (
    <div className="space-y-6">
      <MfaSection mfaEnabled={user?.mfaEnabled ?? false} />
      <PasskeysSection />
      <ActiveSessionsSection />
    </div>
  );
}

function MfaSection({ mfaEnabled }: { mfaEnabled: boolean }) {
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);

  // Enable MFA state
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [enablePassword, setEnablePassword] = useState('');
  const [enableLoading, setEnableLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Disable MFA state
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  // Regenerate backup codes state
  const [regenPassword, setRegenPassword] = useState('');
  const [regenCode, setRegenCode] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  const queryClient = useQueryClient();

  // Fetch backup code count when MFA is enabled
  const { data: backupCountRes } = useQuery({
    queryKey: ['mfa', 'backup-count'],
    queryFn: () => authService.mfaBackupCodeCount(),
    enabled: mfaEnabled,
  });
  const backupCodeCount = backupCountRes?.data?.count ?? 0;

  const handleSetupMfa = async () => {
    setSetupLoading(true);
    try {
      const res = await authService.mfaSetup();
      setMfaSetup(res.data);
      setShowEnableModal(true);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to setup MFA');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleEnableMfa = async () => {
    if (!enablePassword) {
      showToast.error('Please enter your password');
      return;
    }
    if (!verifyCode) {
      showToast.error('Please enter the verification code');
      return;
    }
    setEnableLoading(true);
    try {
      await authService.mfaEnable({ token: verifyCode, password: enablePassword });
      showToast.success('MFA enabled successfully');
      setShowEnableModal(false);
      setMfaSetup(null);
      setVerifyCode('');
      setEnablePassword('');
      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      // Force a page reload to refresh user state
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to enable MFA');
    } finally {
      setEnableLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePassword || !disableCode) {
      showToast.error('Please enter your password and verification code');
      return;
    }
    setDisableLoading(true);
    try {
      await authService.mfaDisable({ password: disablePassword, token: disableCode });
      showToast.success('MFA disabled successfully');
      setShowDisableModal(false);
      setDisablePassword('');
      setDisableCode('');
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to disable MFA');
    } finally {
      setDisableLoading(false);
    }
  };

  const copySecret = useCallback(() => {
    if (mfaSetup?.secret) {
      navigator.clipboard.writeText(mfaSetup.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }, [mfaSetup?.secret]);

  const handleRegenerateBackupCodes = async () => {
    if (!regenPassword || !regenCode) {
      showToast.error('Please enter your password and verification code');
      return;
    }
    setRegenLoading(true);
    try {
      const res = await authService.mfaRegenerateBackup({
        password: regenPassword,
        token: regenCode,
      });
      if (res.data?.backupCodes) {
        setNewBackupCodes(res.data.backupCodes);
        showToast.success('Backup codes regenerated');
        queryClient.invalidateQueries({ queryKey: ['mfa', 'backup-count'] });
      }
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to regenerate backup codes');
    } finally {
      setRegenLoading(false);
    }
  };

  return (
    <>
      <Card variant="bordered">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Shield className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Two-Factor Authentication (MFA)
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Add an extra layer of security to your account
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <p className="font-medium text-[var(--text)]">Authenticator App</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {mfaEnabled
                  ? 'Two-factor authentication is currently enabled'
                  : 'Use an authenticator app to generate one-time codes'}
              </p>
            </div>
          </div>
          {mfaEnabled ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDisableModal(true)}
              tooltip="Disable two-factor authentication"
            >
              Disable MFA
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              isLoading={setupLoading}
              onClick={handleSetupMfa}
              tooltip="Enable two-factor authentication"
            >
              Enable MFA
            </Button>
          )}
        </div>

        {mfaEnabled && (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--success)]/10 px-4 py-2">
              <Shield className="h-4 w-4 text-[var(--success)]" />
              <span className="text-sm text-[var(--success)]">
                Your account is protected with two-factor authentication
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Backup Codes</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {backupCodeCount} backup {backupCodeCount === 1 ? 'code' : 'codes'} remaining
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRegenModal(true);
                  setRegenPassword('');
                  setRegenCode('');
                  setNewBackupCodes([]);
                }}
                tooltip="Generate new backup codes"
              >
                Regenerate
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Enable MFA Modal */}
      <Modal
        isOpen={showEnableModal}
        onClose={() => {
          setShowEnableModal(false);
          setMfaSetup(null);
          setVerifyCode('');
          setEnablePassword('');
        }}
        title="Enable Two-Factor Authentication"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEnableModal(false);
                setMfaSetup(null);
                setVerifyCode('');
                setEnablePassword('');
              }}
              tooltip="Cancel MFA setup"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={enableLoading}
              onClick={handleEnableMfa}
              tooltip="Verify code and enable MFA"
            >
              Verify &amp; Enable
            </Button>
          </div>
        }
      >
        {mfaSetup && (
          <div className="space-y-6">
            <div>
              <p className="mb-4 text-sm text-[var(--text-secondary)]">
                Scan the QR code below with your authenticator app (e.g., Google Authenticator,
                Authy), then enter the 6-digit verification code.
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <img src={mfaSetup.qrCodeUrl} alt="MFA QR Code" className="h-48 w-48" />
              </div>
            </div>

            {/* Manual entry secret */}
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
                  tooltip="Copy secret to clipboard"
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Password */}
            <Input
              label="Password"
              type="password"
              value={enablePassword}
              onChange={(e) => setEnablePassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              required
            />

            {/* Verification Code Input */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Verification Code
              </label>
              <OtpInput value={verifyCode} onChange={setVerifyCode} length={6} />
            </div>
          </div>
        )}
      </Modal>

      {/* Disable MFA Modal */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => {
          setShowDisableModal(false);
          setDisablePassword('');
          setDisableCode('');
        }}
        title="Disable Two-Factor Authentication"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDisableModal(false);
                setDisablePassword('');
                setDisableCode('');
              }}
              tooltip="Cancel MFA disabling"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              isLoading={disableLoading}
              onClick={handleDisableMfa}
              tooltip="Confirm disabling MFA"
            >
              Disable MFA
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Disabling MFA will make your account less secure. You will need to provide your password
            and a verification code from your authenticator app to confirm.
          </p>
          <Input
            label="Password"
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">
              Verification Code
            </label>
            <OtpInput value={disableCode} onChange={setDisableCode} length={6} />
          </div>
        </div>
      </Modal>

      {/* Regenerate Backup Codes Modal */}
      <Modal
        isOpen={showRegenModal}
        onClose={() => {
          setShowRegenModal(false);
          setRegenPassword('');
          setRegenCode('');
          setNewBackupCodes([]);
        }}
        title={newBackupCodes.length > 0 ? 'New Backup Codes' : 'Regenerate Backup Codes'}
        size="sm"
        footer={
          newBackupCodes.length > 0 ? (
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setShowRegenModal(false);
                  setNewBackupCodes([]);
                }}
                tooltip="Close and save backup codes"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRegenModal(false)}
                tooltip="Cancel backup code regeneration"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={regenLoading}
                onClick={handleRegenerateBackupCodes}
                tooltip="Generate new backup codes"
              >
                Regenerate
              </Button>
            </div>
          )
        }
      >
        {newBackupCodes.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Save these new codes in a safe place. Your previous backup codes are no longer valid.
            </p>
            <BackupCodes codes={newBackupCodes} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              This will invalidate all existing backup codes and generate new ones. Enter your
              password and a verification code to confirm.
            </p>
            <Input
              label="Password"
              type="password"
              value={regenPassword}
              onChange={(e) => setRegenPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              required
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Verification Code
              </label>
              <OtpInput value={regenCode} onChange={setRegenCode} length={6} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function PasskeysSection() {
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [friendlyName, setFriendlyName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingCredential, setPendingCredential] = useState<unknown>(null);

  const { data: credentialsResponse, isLoading } = useQuery({
    queryKey: QUERY_KEYS.WEBAUTHN.CREDENTIALS,
    queryFn: () => webauthnService.listCredentials(),
  });

  const credentials: WebAuthnCredential[] = credentialsResponse?.data ?? [];

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const optionsRes = await webauthnService.getRegistrationOptions();
      const options = optionsRes.data;
      if (!options) throw new Error('Failed to get registration options');

      const credential = await startRegistration({ optionsJSON: options });
      setPendingCredential(credential);
      setShowNameModal(true);
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'NotAllowedError') {
        showToast.error(error.message || 'Failed to register passkey');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleConfirmRegister = async () => {
    if (!pendingCredential) return;
    try {
      await webauthnService.verifyRegistration(pendingCredential, friendlyName || undefined);
      showToast.success('Passkey registered successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WEBAUTHN.CREDENTIALS });
      setShowNameModal(false);
      setFriendlyName('');
      setPendingCredential(null);
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to verify passkey');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await webauthnService.deleteCredential(id);
      showToast.success('Passkey removed');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.WEBAUTHN.CREDENTIALS });
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to remove passkey');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Fingerprint className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)]">Passkeys</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Use biometrics, security keys, or your device to sign in without a password.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegister}
            isLoading={registering}
            tooltip="Register a new passkey"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Passkey
          </Button>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-sm text-[var(--text-muted)]">
            Loading passkeys...
          </div>
        ) : credentials.length > 0 ? (
          <div className="space-y-3">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-[var(--text-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {cred.friendlyName || 'Passkey'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Added {formatRelativeDate(cred.createdAt)}
                      {cred.deviceType && ` \u00B7 ${cred.deviceType}`}
                      {cred.backedUp && ' \u00B7 Backed up'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteId(cred.id)}
                  isLoading={deletingId === cred.id}
                  tooltip="Remove this passkey"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
            No passkeys registered. Add one to enable passwordless sign-in.
          </p>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Remove Passkey"
        message="Are you sure you want to remove this passkey? You will no longer be able to use it to sign in."
        confirmLabel="Remove"
      />

      <Modal
        isOpen={showNameModal}
        onClose={() => {
          setShowNameModal(false);
          setPendingCredential(null);
          setFriendlyName('');
        }}
        title="Name Your Passkey"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNameModal(false);
                setPendingCredential(null);
                setFriendlyName('');
              }}
              tooltip="Cancel passkey registration"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmRegister} tooltip="Save and register this passkey">
              Save Passkey
            </Button>
          </div>
        }
      >
        <Input
          label="Passkey Name"
          placeholder="e.g., MacBook Pro, iPhone, YubiKey"
          value={friendlyName}
          onChange={(e) => setFriendlyName(e.target.value)}
          leftIcon={<KeyRound className="h-4 w-4" />}
        />
      </Modal>
    </>
  );
}

function ActiveSessionsSection() {
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [showConfirmRevokeAll, setShowConfirmRevokeAll] = useState(false);

  const { data: sessionsResponse, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SESSIONS.LIST,
    queryFn: () => sessionService.listSessions(),
  });

  const sessions: Session[] = sessionsResponse?.data ?? [];

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    setConfirmRevokeId(null);
    try {
      await sessionService.revokeSession(sessionId);
      showToast.success('Session revoked successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.LIST });
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setShowConfirmRevokeAll(false);
    try {
      await sessionService.revokeAllSessions();
      showToast.success('All other sessions have been revoked');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS.LIST });
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  };

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Monitor className="h-5 w-5" />;
    const lower = deviceInfo.toLowerCase();
    if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
      return <Smartphone className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  return (
    <>
      <Card variant="bordered">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
              <Monitor className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Active Sessions</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Manage your active sessions across devices
              </p>
            </div>
          </div>
          {sessions.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              isLoading={revokingAll}
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={() => setShowConfirmRevokeAll(true)}
              tooltip="Sign out all other devices"
            >
              Revoke All Other Sessions
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No active sessions found
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-[var(--text-muted)]">
                    {getDeviceIcon(session.deviceInfo ?? null)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text)]">
                        {session.deviceInfo || 'Unknown Device'}
                      </p>
                      {session.isCurrent && (
                        <span className="rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      IP: {session.ipAddress || 'Unknown'} &middot; Last active{' '}
                      {formatRelativeDate(session.lastActive || session.createdAt)}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={revokingId === session.id}
                    onClick={() => setConfirmRevokeId(session.id)}
                    className="text-[var(--error)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
                    tooltip="Sign out this device"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!confirmRevokeId}
        onClose={() => setConfirmRevokeId(null)}
        onConfirm={() => confirmRevokeId && handleRevoke(confirmRevokeId)}
        title="Revoke Session"
        message="Are you sure you want to revoke this session? The device will be signed out immediately."
        confirmLabel="Revoke"
      />
      <ConfirmDialog
        isOpen={showConfirmRevokeAll}
        onClose={() => setShowConfirmRevokeAll(false)}
        onConfirm={handleRevokeAll}
        title="Revoke All Other Sessions"
        message="Are you sure you want to revoke all other sessions? All other devices will be signed out immediately."
        confirmLabel="Revoke All"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Notifications Tab
// ---------------------------------------------------------------------------

function NotificationsTab() {
  const { data: profileData } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PROFILE,
    queryFn: () => candidateService.getProfile(),
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    smsNotifications: true,
    whatsappNotifications: true,
    inAppNotifications: true,
    fcmNotifications: true,
    webPushNotifications: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  /* Cadence / quiet-hours live in the SAME notificationPreferences document as
     the channel toggles, so they are held separately here only to keep the
     boolean map clean, then merged on save into one request. */
  const [digestPrefs, setDigestPrefs] = useState<DigestPrefsValue>({});

  useEffect(() => {
    const p = (profileData?.data as unknown as Record<string, unknown>)?.notificationPreferences as
      | Record<string, unknown>
      | undefined;
    if (p) {
      setDigestPrefs({
        digests: (p.digests as DigestPrefsValue['digests']) ?? undefined,
        quietHours: (p.quietHours as DigestPrefsValue['quietHours']) ?? undefined,
        timezone: (p.timezone as string) ?? undefined,
      });
      const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
      setPreferences((prev) => ({
        emailNotifications: bool(p.emailNotifications, prev.emailNotifications),
        smsNotifications: bool(p.smsNotifications, prev.smsNotifications),
        whatsappNotifications: bool(p.whatsappNotifications, prev.whatsappNotifications),
        inAppNotifications: bool(p.inAppNotifications, prev.inAppNotifications),
        fcmNotifications: bool(p.fcmNotifications, prev.fcmNotifications),
        webPushNotifications: bool(p.webPushNotifications, prev.webPushNotifications),
      }));
    }
  }, [profileData]);

  const togglePreference = (key: keyof typeof preferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await candidateService.updateProfile({
        notificationPreferences: { ...preferences, ...digestPrefs },
      });
      showToast.success('Notification preferences saved');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to save notification preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const notificationOptions = [
    {
      key: 'emailNotifications' as const,
      label: 'Email Notifications',
      description: 'Receive job alerts, application updates, and messages via email',
      icon: <Mail className="h-5 w-5" />,
    },
    {
      key: 'smsNotifications' as const,
      label: 'SMS Notifications',
      description: 'Get important alerts delivered as text messages',
      icon: <Phone className="h-5 w-5" />,
    },
    {
      key: 'whatsappNotifications' as const,
      label: 'WhatsApp Notifications',
      description: 'Receive notifications through WhatsApp messaging',
      icon: <BrandIcon name="whatsapp" className="h-5 w-5" />,
    },
    {
      key: 'inAppNotifications' as const,
      label: 'In-App Notifications',
      description: 'See notifications inside the app notification center',
      icon: <Bell className="h-5 w-5" />,
    },
    {
      key: 'fcmNotifications' as const,
      label: 'Mobile Push Notifications',
      description: 'Get push notifications on your mobile device',
      icon: <Smartphone className="h-5 w-5" />,
    },
    {
      key: 'webPushNotifications' as const,
      label: 'Web Push Notifications',
      description: 'Get real-time push notifications in your browser',
      icon: <Monitor className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <Card variant="bordered">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Bell className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Notification Preferences</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Choose how you want to receive notifications
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {notificationOptions.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <div className="flex items-center gap-3">
                <div className="text-[var(--text-muted)]">{option.icon}</div>
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">{option.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{option.description}</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={preferences[option.key]}
                  onChange={() => togglePreference(option.key)}
                  className="peer sr-only"
                />
                <div className="peer-checked:bg-primary peer-focus-visible:ring-primary h-6 w-11 rounded-full bg-[var(--border)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2" />
                <div className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          ))}
        </div>

        <div className="mt-8 border-t border-[var(--border)] pt-8">
          <DigestPreferences role="candidate" value={digestPrefs} onChange={setDigestPrefs} />
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant="primary"
            isLoading={isSaving}
            onClick={handleSave}
            tooltip="Save notification preferences"
          >
            Save Preferences
          </Button>
        </div>
      </Card>

      <WhatsappOptInToggle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy Tab
// ---------------------------------------------------------------------------

function PrivacyTab() {
  const { data: profileData } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PROFILE,
    queryFn: () => candidateService.getProfile(),
  });

  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('registered');
  const [resumeSearchable, setResumeSearchable] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const p = profileData?.data as unknown as Record<string, unknown> | undefined;
    if (p) {
      if (p.profileVisibility) setProfileVisibility(p.profileVisibility as ProfileVisibility);
      if (typeof p.resumeSearchable === 'boolean') setResumeSearchable(p.resumeSearchable);
    }
  }, [profileData]);

  const visibilityOptions: {
    value: ProfileVisibility;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone can view your profile, including non-registered users',
      icon: <Globe className="h-5 w-5" />,
    },
    {
      value: 'registered',
      label: 'Registered Users Only',
      description: 'Only employers and recruiters with an account can view your profile',
      icon: <Users className="h-5 w-5" />,
    },
    {
      value: 'private',
      label: 'Private',
      description: 'Your profile is hidden. Only employers you apply to can see it',
      icon: <EyeOff className="h-5 w-5" />,
    },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await candidateService.updateProfile({ profileVisibility, resumeSearchable });
      showToast.success('Privacy settings saved');
    } catch (err) {
      const error = err as ApiError;
      showToast.error(error.message || 'Failed to save privacy settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Visibility */}
      <Card variant="bordered">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Eye className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Profile Visibility</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Control who can see your profile information
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {visibilityOptions.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors ${
                profileVisibility === option.value
                  ? 'border-primary bg-primary-light/50'
                  : 'border-[var(--border)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              <input
                type="radio"
                name="profileVisibility"
                value={option.value}
                checked={profileVisibility === option.value}
                onChange={() => setProfileVisibility(option.value)}
                className="text-primary focus:ring-primary h-4 w-4 border-[var(--border)]"
              />
              <div className="flex flex-1 items-center gap-3">
                <div className="text-[var(--text-muted)]">{option.icon}</div>
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">{option.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{option.description}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* Resume Visibility */}
      <Card variant="bordered">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <FileText className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Resume Visibility</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Control whether employers can find your resume through search
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                Allow employers to search your resume
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                When enabled, employers can discover your resume through their candidate search
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={resumeSearchable}
              onChange={() => setResumeSearchable(!resumeSearchable)}
              className="peer sr-only"
            />
            <div className="peer-checked:bg-primary peer-focus-visible:ring-primary h-6 w-11 rounded-full bg-[var(--border)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2" />
            <div className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
          </div>
        </label>
      </Card>

      {/* Download My Data */}
      <Card variant="bordered">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Download className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Download My Data</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Export a copy of all your personal data stored on Hire Adda
            </p>
          </div>
        </div>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          You&apos;ll receive a JSON file via email containing your profile, applications, saved
          jobs, notifications, and other account data. This may take a few minutes to prepare.
        </p>
        <Button
          variant="outline"
          isLoading={isExporting}
          tooltip="Request a copy of all your personal data"
          onClick={async () => {
            setIsExporting(true);
            try {
              await authService.exportMyData();
              showToast.success('Data export requested! Check your email shortly.');
            } catch (err) {
              const error = err as ApiError;
              showToast.error(error.message || 'Failed to request data export');
            } finally {
              setIsExporting(false);
            }
          }}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Request Data Export
        </Button>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          isLoading={isSaving}
          onClick={handleSave}
          tooltip="Save privacy settings"
        >
          Save Privacy Settings
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legal Tab
// ---------------------------------------------------------------------------

const legalLinks = [
  {
    label: 'Terms of Service',
    description: 'Rules and guidelines for using Hire Adda',
    href: ROUTES.PUBLIC.TERMS,
    icon: FileText,
  },
  {
    label: 'Privacy Policy',
    description: 'How we collect, use, and protect your data',
    href: ROUTES.PUBLIC.PRIVACY,
    icon: Shield,
  },
  {
    label: 'Cookie Policy',
    description: 'How we use cookies and similar technologies',
    href: ROUTES.PUBLIC.COOKIE_POLICY,
    icon: Globe,
  },
  {
    label: 'Refund Policy',
    description: 'Refund and cancellation terms for paid services',
    href: ROUTES.PUBLIC.REFUND_POLICY,
    icon: FileText,
  },
  {
    label: 'Accessibility Statement',
    description: 'Our commitment to digital accessibility',
    href: ROUTES.PUBLIC.ACCESSIBILITY,
    icon: Eye,
  },
  {
    label: 'Disclaimer',
    description: 'Important disclaimers about platform usage',
    href: ROUTES.PUBLIC.DISCLAIMER,
    icon: Scale,
  },
];

function LegalTab() {
  return (
    <div className="space-y-4">
      <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Legal & Policies</h2>}>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Review our legal documents, policies, and compliance information.
        </p>
        <div className="space-y-2">
          {legalLinks.map((link) => (
            <Tooltip key={link.label} content={`View ${link.label}`}>
              <Link
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <div className="bg-primary-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <link.icon className="text-primary h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text)]">{link.label}</p>
                  <p className="text-sm text-[var(--text-muted)]">{link.description}</p>
                </div>
              </Link>
            </Tooltip>
          ))}
        </div>
      </Card>
    </div>
  );
}
