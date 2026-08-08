'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, KeyRound, Plus, Trash2, Monitor, Smartphone, LogOut } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MyAccessCard from '@/components/admin/MyAccessCard';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import { sessionService } from '@/services/session.service';
import { webauthnService } from '@/services/webauthn.service';
import { startRegistration } from '@simplewebauthn/browser';
import { QUERY_KEYS } from '@/constants/config';
import { formatRelativeDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';
import type { Session } from '@/types/auth';
import type { WebAuthnCredential } from '@/types/webauthn';

export default function AdminSettingsPage() {
  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Review your access, and manage your passkeys and active sessions
          </p>
        </div>

        <MyAccessCard />
        <PasskeysSection />
        <ActiveSessionsSection />
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Passkeys Section
// ---------------------------------------------------------------------------

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
    setDeletingId(id);
    setConfirmDeleteId(null);
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
            tooltip="Register a new passkey"
            onClick={handleRegister}
            isLoading={registering}
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
                  tooltip="Remove this passkey"
                  onClick={() => setConfirmDeleteId(cred.id)}
                  isLoading={deletingId === cred.id}
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
              tooltip="Cancel passkey registration"
              onClick={() => {
                setShowNameModal(false);
                setPendingCredential(null);
                setFriendlyName('');
              }}
            >
              Cancel
            </Button>
            <Button tooltip="Save and register passkey" onClick={handleConfirmRegister}>
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

// ---------------------------------------------------------------------------
// Active Sessions Section
// ---------------------------------------------------------------------------

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
              tooltip="Sign out all other devices"
              isLoading={revokingAll}
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={() => setShowConfirmRevokeAll(true)}
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
                    tooltip="Revoke this session"
                    isLoading={revokingId === session.id}
                    onClick={() => setConfirmRevokeId(session.id)}
                    className="text-[var(--error)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
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
