'use client';

import { useState, useEffect } from 'react';
import { Mail, Phone, AlertCircle } from 'lucide-react';
import BrandIcon from '@/components/common/BrandIcon';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import OtpInput from '@/components/auth/OtpInput';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import { useOtpConfig } from '@/hooks/use-otp-config';
import type { ApiError } from '@/types/api';

/**
 * Super-admin managed contact details — email, mobile and WhatsApp, each
 * changed only through an OTP the OWNER receives.
 *
 * Lifted out of the super-admin user-detail page so the Admins page can use
 * the same flow. It was previously inline there AND gated on
 * `user.role === 'ADMIN'`, which meant:
 *
 *   • a candidate or employer created by a super-admin had no way to have
 *     their number verified — the only lever was the `isMobileVerified`
 *     checkbox, which flips the flag with no OTP at all; and
 *   • the Admins page, the obvious place to manage an admin, showed the
 *     number read-only.
 *
 * The backend never had that restriction: every route is gated by
 * `requireSubjectPermission('credentials.*')`, which resolves
 * `users.candidates.*` / `users.employers.*` from the TARGET's role. The
 * limitation was purely in the UI.
 */

export type ManagedContactProps = {
  userId: string;
  user: {
    email: string;
    mobileNumber: string | null;
    isMobileVerified: boolean;
    whatsappNumber: string | null;
    isWhatsappVerified: boolean;
  };
  invalidateUser: () => void;
};

export function ManagedEmailSection({ userId, user, invalidateUser }: ManagedContactProps) {
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'idle' | 'form' | 'otp'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  const reset = () => {
    setStep('idle');
    setNewEmail('');
    setPassword('');
    setOtp('');
  };

  const handleInitiate = async () => {
    setLoading(true);
    try {
      await adminService.initiateAdminEmailChange(userId, { newEmail, password });
      showToast.success('Verification code sent to new email');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to initiate email change');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await adminService.confirmAdminEmailChange(userId, { otp });
      showToast.success('Admin email updated successfully');
      invalidateUser();
      reset();
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await adminService.resendAdminEmailOtp(userId);
      showToast.success('Code resent');
      setOtp('');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to resend');
    }
  };

  return (
    <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Email Management</h2>}>
      {step === 'idle' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <p className="text-sm font-medium text-[var(--text)]">{user.email}</p>
              <Badge variant="success" size="sm">
                Verified
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep('form')}
            tooltip="Change admin email address"
          >
            Change Email
          </Button>
        </div>
      )}

      {step === 'form' && (
        <div className="space-y-4">
          <Input
            label="New Email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
          />
          <Input
            label="Your Password (Super Admin)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password to confirm"
          />
          <div className="flex gap-3">
            <Button
              onClick={handleInitiate}
              isLoading={loading}
              disabled={!newEmail || !password}
              tooltip="Send verification code to new email"
            >
              Send Verification Code
            </Button>
            <Button variant="outline" onClick={reset} tooltip="Cancel email change">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Enter the 6-digit code sent to <span className="font-medium">{newEmail}</span>
            </p>
          </div>
          <OtpInput value={otp} onChange={setOtp} length={otpConfig.LENGTH} />
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {resendTimer > 0 ? (
                <span>Resend in {resendTimer}s</span>
              ) : (
                <Tooltip content="Resend verification code">
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-primary cursor-pointer font-medium hover:underline"
                  >
                    Resend Code
                  </button>
                </Tooltip>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleConfirm}
              isLoading={loading}
              disabled={otp.length !== otpConfig.LENGTH}
              tooltip="Confirm email change"
            >
              Confirm Email Change
            </Button>
            <Button variant="outline" onClick={reset} tooltip="Cancel email change">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin Mobile Section (OTP-verified)
// ---------------------------------------------------------------------------

export function ManagedMobileSection({ userId, user, invalidateUser }: ManagedContactProps) {
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'idle' | 'form' | 'otp'>('idle');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  const reset = () => {
    setStep('idle');
    setMobileNumber('');
    setPassword('');
    setOtp('');
  };

  const handleInitiate = async () => {
    setLoading(true);
    try {
      const payload: { mobileNumber: string; password?: string } = { mobileNumber };
      if (user.mobileNumber) payload.password = password; // Password required only for "change"
      await adminService.initiateAdminMobileChange(userId, payload);
      showToast.success('Verification code sent via SMS');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to send SMS OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await adminService.confirmAdminMobileChange(userId, { otp });
      showToast.success('Admin mobile number updated');
      invalidateUser();
      reset();
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await adminService.resendAdminMobileOtp(userId);
      showToast.success('Code resent');
      setOtp('');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to resend');
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await adminService.removeAdminMobile(userId);
      showToast.success('Mobile number removed');
      invalidateUser();
      setShowRemoveModal(false);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to remove');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Card
        header={
          <h2 className="text-lg font-semibold text-[var(--text)]">Mobile Number Management</h2>
        }
      >
        {step === 'idle' && (
          <>
            {user.mobileNumber ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-[var(--text-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{user.mobileNumber}</p>
                    <Badge variant={user.isMobileVerified ? 'success' : 'warning'} size="sm">
                      {user.isMobileVerified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep('form')}
                    tooltip="Change mobile number"
                  >
                    Change
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[var(--error)]"
                    onClick={() => setShowRemoveModal(true)}
                    tooltip="Remove mobile number"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text-muted)]">No mobile number set</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('form')}
                  tooltip="Add a mobile number"
                >
                  Add Mobile
                </Button>
              </div>
            )}
          </>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <PhoneInput
              label="Mobile Number"
              placeholder="9876xxxxxx"
              value={mobileNumber}
              onValueChange={setMobileNumber}
            />
            {user.mobileNumber && (
              <Input
                label="Your Password (Super Admin)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Required for changing existing number"
              />
            )}
            {!user.whatsappNumber && user.isWhatsappVerified && user.mobileNumber && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--warning-light)] px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--warning)]" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Changing mobile will reset WhatsApp verification since no separate WhatsApp number
                  is set.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={handleInitiate}
                isLoading={loading}
                disabled={!mobileNumber || (!!user.mobileNumber && !password)}
                tooltip="Send SMS verification code"
              >
                Send SMS Code
              </Button>
              <Button variant="outline" onClick={reset} tooltip="Cancel mobile change">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Enter the code sent to <span className="font-medium">{mobileNumber}</span>
              </p>
            </div>
            <OtpInput value={otp} onChange={setOtp} length={otpConfig.LENGTH} />
            <div className="text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {resendTimer > 0 ? (
                  <span>Resend in {resendTimer}s</span>
                ) : (
                  <Tooltip content="Resend verification code">
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-primary cursor-pointer font-medium hover:underline"
                    >
                      Resend Code
                    </button>
                  </Tooltip>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleConfirm}
                isLoading={loading}
                disabled={otp.length !== otpConfig.LENGTH}
                tooltip="Confirm mobile number change"
              >
                Confirm
              </Button>
              <Button variant="outline" onClick={reset} tooltip="Cancel mobile change">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Remove Mobile Number"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowRemoveModal(false)}
              tooltip="Cancel removal"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              isLoading={removing}
              tooltip="Confirm removing mobile number"
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This will remove the admin&apos;s mobile number and reset mobile verification.
          {!user.whatsappNumber &&
            user.isWhatsappVerified &&
            ' WhatsApp verification will also be reset.'}
        </p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Admin WhatsApp Section (OTP-verified)
// ---------------------------------------------------------------------------

export function ManagedWhatsappSection({ userId, user, invalidateUser }: ManagedContactProps) {
  const otpConfig = useOtpConfig();
  const [step, setStep] = useState<'idle' | 'verify' | 'add-separate' | 'change' | 'otp'>('idle');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  const reset = () => {
    setStep('idle');
    setWhatsappNumber('');
    setPassword('');
    setOtp('');
  };

  const hasMobile = !!user.mobileNumber;
  const effectiveWhatsapp = user.whatsappNumber || user.mobileNumber;

  const handleVerifyMobile = async () => {
    if (!user.mobileNumber) return;
    setLoading(true);
    try {
      await adminService.initiateAdminWhatsappVerify(userId, { mobileNumber: user.mobileNumber });
      showToast.success('WhatsApp OTP sent');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to send WhatsApp OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSeparate = async () => {
    setLoading(true);
    try {
      await adminService.initiateAdminWhatsappVerify(userId, {
        mobileNumber: user.mobileNumber || whatsappNumber,
        whatsappNumber,
      });
      showToast.success('WhatsApp OTP sent');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to send WhatsApp OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    setLoading(true);
    try {
      await adminService.initiateAdminWhatsappChange(userId, {
        newWhatsappNumber: whatsappNumber,
        password,
      });
      showToast.success('WhatsApp OTP sent to new number');
      setStep('otp');
      setResendTimer(otpConfig.RESEND_COOLDOWN);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to change WhatsApp number');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await adminService.confirmAdminWhatsappOtp(userId, { otp });
      showToast.success('WhatsApp verified');
      invalidateUser();
      reset();
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await adminService.removeAdminWhatsappNumber(userId);
      showToast.success('WhatsApp number removed');
      invalidateUser();
      setShowRemoveModal(false);
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to remove');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Card
        header={<h2 className="text-lg font-semibold text-[var(--text)]">WhatsApp Management</h2>}
      >
        {step === 'idle' && (
          <>
            {!hasMobile && !user.isMobileVerified ? (
              <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                <BrandIcon name="whatsapp" className="h-5 w-5" />
                <p>Add and verify a mobile number first to enable WhatsApp.</p>
              </div>
            ) : user.isWhatsappVerified ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandIcon name="whatsapp" className="h-5 w-5 text-[var(--text-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{effectiveWhatsapp}</p>
                    <Badge variant="success" size="sm">
                      Verified
                    </Badge>
                    {user.whatsappNumber && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        (separate number)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep('change')}
                    tooltip="Change WhatsApp number"
                  >
                    Change
                  </Button>
                  {user.whatsappNumber && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[var(--error)]"
                      onClick={() => setShowRemoveModal(true)}
                      tooltip="Remove WhatsApp number"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandIcon name="whatsapp" className="h-5 w-5 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-muted)]">WhatsApp not verified</p>
                </div>
                <div className="flex gap-2">
                  {hasMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerifyMobile}
                      isLoading={loading}
                      tooltip="Verify mobile number for WhatsApp"
                    >
                      Verify Mobile for WhatsApp
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep('add-separate')}
                    tooltip="Add a separate WhatsApp number"
                  >
                    Add Separate Number
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'add-separate' && (
          <div className="space-y-4">
            <PhoneInput
              label="WhatsApp Number"
              placeholder="9876xxxxxx"
              value={whatsappNumber}
              onValueChange={setWhatsappNumber}
            />
            <div className="flex gap-3">
              <Button
                onClick={handleAddSeparate}
                isLoading={loading}
                disabled={!whatsappNumber}
                tooltip="Send OTP via WhatsApp"
              >
                Send WhatsApp OTP
              </Button>
              <Button variant="outline" onClick={reset} tooltip="Cancel adding WhatsApp number">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'change' && (
          <div className="space-y-4">
            <PhoneInput
              label="New WhatsApp Number"
              placeholder="9876xxxxxx"
              value={whatsappNumber}
              onValueChange={setWhatsappNumber}
            />
            <Input
              label="Your Password (Super Admin)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password to confirm"
            />
            <div className="flex gap-3">
              <Button
                onClick={handleChange}
                isLoading={loading}
                disabled={!whatsappNumber || !password}
                tooltip="Send OTP to new WhatsApp number"
              >
                Send WhatsApp OTP
              </Button>
              <Button variant="outline" onClick={reset} tooltip="Cancel WhatsApp change">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Enter the OTP received on WhatsApp
              </p>
            </div>
            <OtpInput value={otp} onChange={setOtp} length={otpConfig.LENGTH} />
            <div className="text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {resendTimer > 0 ? (
                  <span>Resend in {resendTimer}s</span>
                ) : (
                  <span className="text-[var(--text-muted)]">
                    Use the buttons above to request a new code
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleConfirm}
                isLoading={loading}
                disabled={otp.length !== otpConfig.LENGTH}
                tooltip="Confirm WhatsApp verification"
              >
                Confirm
              </Button>
              <Button variant="outline" onClick={reset} tooltip="Cancel WhatsApp verification">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Remove WhatsApp Number"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowRemoveModal(false)}
              tooltip="Cancel removal"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              isLoading={removing}
              tooltip="Confirm removing WhatsApp number"
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This will remove the separate WhatsApp number. WhatsApp verification will be reset.
        </p>
      </Modal>
    </>
  );
}
