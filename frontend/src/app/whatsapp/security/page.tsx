'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
  RefreshCw,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import OtpInput from '@/components/common/OtpInput';
import RecoveryCodes from '@/components/whatsapp/RecoveryCodes';
import { mfaService, type MfaEnrolment } from '@/services/mfa.service';
import type { ApiError } from '@/types/api';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || 'TechnoTaau';

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/**
 * Security settings — the MFA management surface.
 *
 * One shared TOTP seed protects the console, so this page is deliberately
 * explicit about what that does and does not buy: it says out loud that the
 * secret is shared, and puts the two controls that compensate for it (per-browser
 * trust revocation, and the epoch kill switch) in front of the operator rather
 * than burying them in an env var.
 */
export default function SecurityPage() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => mfaService.getStatus(),
  });

  const { data: devices } = useQuery({
    queryKey: ['mfa-devices'],
    queryFn: () => mfaService.listDevices(),
    enabled: status?.enabled === true,
  });

  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<null | 'disable' | 'regenerate' | 'rotate'>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['mfa-status'] });
    void qc.invalidateQueries({ queryKey: ['mfa-devices'] });
  };

  const resetForm = () => {
    setCode('');
    setPassword('');
    setConfirming(null);
  };

  const setupMut = useMutation({
    mutationFn: () => mfaService.beginSetup(),
    onSuccess: setEnrolment,
    onError: (e) => showToast.error(errText(e, 'Could not start setup')),
  });

  const enableMut = useMutation({
    mutationFn: () => mfaService.enable(code, password),
    onSuccess: (codes) => {
      setFreshCodes(codes);
      setEnrolment(null);
      resetForm();
      refresh();
      showToast.success('Two-factor authentication is on');
    },
    onError: (e) => showToast.error(errText(e, 'That code was not accepted')),
  });

  const disableMut = useMutation({
    mutationFn: () => mfaService.disable(code, password),
    onSuccess: () => {
      resetForm();
      refresh();
      showToast.success('Two-factor authentication is off');
    },
    onError: (e) => showToast.error(errText(e, 'Could not disable MFA')),
  });

  const regenerateMut = useMutation({
    mutationFn: () => mfaService.regenerateRecoveryCodes(code, password),
    onSuccess: (codes) => {
      setFreshCodes(codes);
      resetForm();
      refresh();
      showToast.success('New recovery codes issued — the old ones no longer work');
    },
    onError: (e) => showToast.error(errText(e, 'Could not regenerate codes')),
  });

  const rotateMut = useMutation({
    mutationFn: () => mfaService.rotateEpoch(password),
    onSuccess: () => {
      resetForm();
      refresh();
      showToast.success('Every authenticator and trusted browser has been revoked');
    },
    onError: (e) => showToast.error(errText(e, 'Could not rotate')),
  });

  const revokeDeviceMut = useMutation({
    mutationFn: (id: string) => mfaService.revokeDevice(id),
    onSuccess: () => {
      refresh();
      showToast.success('Browser revoked');
    },
    onError: (e) => showToast.error(errText(e, 'Could not revoke')),
  });

  const revokeAllMut = useMutation({
    mutationFn: () => mfaService.revokeAllDevices(),
    onSuccess: (n) => {
      refresh();
      showToast.success(`${n} browser${n === 1 ? '' : 's'} revoked`);
    },
    onError: (e) => showToast.error(errText(e, 'Could not revoke')),
  });

  const busy =
    enableMut.isPending || disableMut.isPending || regenerateMut.isPending || rotateMut.isPending;

  return (
    <DashboardLayout requiredRole={['ADMIN']}>
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="text-xl font-bold text-[var(--text)]">Security</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Two-factor authentication for the operator console.
          </p>
        </header>

        {isLoading && (
          <div className="flex justify-center p-10">
            <Spinner />
          </div>
        )}

        {status && (
          <>
            {/* ── Status ─────────────────────────────────────────────── */}
            <section className="rounded-xl border border-[var(--border)] bg-white p-5">
              <div className="flex items-start gap-4">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    status.enabled ? 'bg-emerald-50' : 'bg-amber-50'
                  }`}
                >
                  {status.enabled ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-[var(--text)]">
                    {status.enabled
                      ? 'Two-factor authentication is on'
                      : 'Two-factor authentication is off'}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {status.enabled
                      ? `Enabled ${status.enrolledAt ? new Date(status.enrolledAt).toLocaleDateString() : ''}. ` +
                        `${status.recoveryCodesRemaining} recovery code${status.recoveryCodesRemaining === 1 ? '' : 's'} left.`
                      : 'The console is protected by the app password alone.'}
                  </p>
                </div>
              </div>

              {/* The shared-seed caveat, said plainly rather than hidden. */}
              <p className="mt-4 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-muted)]">
                This module has one shared app password, so there is{' '}
                <strong>one shared authenticator secret</strong> that every operator enrols against.
                It stops a leaked password from being enough on its own, but it cannot tell
                operators apart. To cut off one machine, revoke its browser below; if the QR itself
                leaks, use <em>Revoke everything</em>.
              </p>

              {!status.canEnrol && (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <code>FIELD_ENCRYPTION_KEY</code> is not set on the server, so the authenticator
                    secret cannot be stored safely. MFA is unavailable until it is configured —
                    generate one with <code>openssl rand -hex 32</code>.
                  </span>
                </p>
              )}

              {!status.enabled && status.canEnrol && (
                <Button
                  className="mt-4"
                  onClick={() => setupMut.mutate()}
                  isLoading={setupMut.isPending}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                >
                  Set up two-factor authentication
                </Button>
              )}
            </section>

            {/* ── Newly issued recovery codes ────────────────────────── */}
            {freshCodes && (
              <section className="rounded-xl border border-[var(--border)] bg-white p-5">
                <h2 className="mb-3 font-semibold text-[var(--text)]">Your recovery codes</h2>
                <RecoveryCodes codes={freshCodes} brandName={BRAND} />
                <Button variant="secondary" className="mt-4" onClick={() => setFreshCodes(null)}>
                  I have saved them
                </Button>
              </section>
            )}

            {/* ── Manage, once enabled ───────────────────────────────── */}
            {status.enabled && (
              <>
                <section className="rounded-xl border border-[var(--border)] bg-white p-5">
                  <h2 className="font-semibold text-[var(--text)]">Recovery codes</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {status.recoveryCodesRemaining} remaining. Regenerating issues a fresh set and
                    immediately invalidates the old one.
                  </p>
                  {status.recoveryCodesRemaining <= 2 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      You are nearly out. Generate a new set before you run out entirely.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => setConfirming('regenerate')}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                  >
                    Regenerate recovery codes
                  </Button>
                </section>

                <section className="rounded-xl border border-[var(--border)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-[var(--text)]">Trusted browsers</h2>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        These skip the code prompt for 30 days. Revoking one forces it to verify
                        again — this is the closest thing to cutting off one person.
                      </p>
                    </div>
                    {(devices?.length ?? 0) > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeAllMut.mutate()}
                        isLoading={revokeAllMut.isPending}
                      >
                        Revoke all
                      </Button>
                    )}
                  </div>

                  <ul className="mt-4 divide-y divide-[var(--border)]">
                    {(devices ?? []).length === 0 && (
                      <li className="py-3 text-sm text-[var(--text-muted)]">
                        No trusted browsers.
                      </li>
                    )}
                    {(devices ?? []).map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Smartphone
                            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-[var(--text)]">
                              {d.label || 'Unknown device'}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {d.ip ? `${d.ip} · ` : ''}
                              {d.lastUsedAt
                                ? `last used ${new Date(d.lastUsedAt).toLocaleDateString()}`
                                : 'not used yet'}
                              {` · expires ${new Date(d.expiresAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Revoke ${d.label || 'device'}`}
                          onClick={() => revokeDeviceMut.mutate(d.id)}
                          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-red-200 bg-white p-5">
                  <h2 className="font-semibold text-[var(--text)]">Danger zone</h2>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">Revoke everything</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Invalidates the shared secret, every recovery code and every trusted
                        browser. MFA stays required and must be set up again. Use this if the QR
                        code leaks.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirming('rotate')}
                      leftIcon={<KeyRound className="h-4 w-4" />}
                    >
                      Revoke everything
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">
                        Turn off two-factor authentication
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        The console drops back to the app password alone.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirming('disable')}
                    >
                      Turn off
                    </Button>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Enrolment wizard ─────────────────────────────────────────── */}
      <Modal
        isOpen={enrolment !== null}
        onClose={() => {
          setEnrolment(null);
          resetForm();
        }}
        title="Set up two-factor authentication"
        size="md"
      >
        {enrolment && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>Open your authenticator app (Google Authenticator, 1Password, Authy…).</li>
              <li>Scan this code, or enter the key by hand.</li>
              <li>Type the 6-digit code it shows, and your app password, to confirm.</li>
            </ol>

            <div className="flex justify-center">
              <Image
                src={enrolment.qrCodeDataUrl}
                alt="QR code for enrolling an authenticator app"
                width={200}
                height={200}
                unoptimized
                className="rounded-lg border border-[var(--border)]"
              />
            </div>

            <div>
              <p className="text-xs text-[var(--text-muted)]">
                Or enter this key manually — everyone on the team enrols the same one:
              </p>
              <code className="mt-1 block rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-center font-mono text-sm tracking-wider break-all">
                {enrolment.secret}
              </code>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text)]">Code from the app</p>
              <OtpInput value={code} onChange={setCode} disabled={busy} autoFocus />
            </div>

            <Input
              type="password"
              label="App password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />

            <Button
              className="w-full"
              isLoading={enableMut.isPending}
              disabled={code.length !== 6 || !password}
              onClick={() => enableMut.mutate()}
            >
              Turn on two-factor authentication
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Confirmations ────────────────────────────────────────────── */}
      <Modal
        isOpen={confirming !== null}
        onClose={resetForm}
        title={
          confirming === 'disable'
            ? 'Turn off two-factor authentication'
            : confirming === 'regenerate'
              ? 'Regenerate recovery codes'
              : 'Revoke every authenticator'
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            {confirming === 'disable'
              ? 'The console will be protected by the app password alone. Confirm with your current code and password.'
              : confirming === 'regenerate'
                ? 'Your existing recovery codes stop working immediately.'
                : 'Everyone will have to enrol their authenticator again before they can sign in.'}
          </p>

          {/* Rotation needs the password only — the point is that the current
              authenticator may be in the wrong hands. */}
          {confirming !== 'rotate' && (
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text)]">
                Code from your authenticator
              </p>
              <OtpInput value={code} onChange={setCode} disabled={busy} autoFocus />
            </div>
          )}

          <Input
            type="password"
            label="App password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={busy}
            autoFocus={confirming === 'rotate'}
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              variant={confirming === 'regenerate' ? 'primary' : 'destructive'}
              isLoading={busy}
              disabled={!password || (confirming !== 'rotate' && code.length !== 6)}
              onClick={() => {
                if (confirming === 'disable') disableMut.mutate();
                else if (confirming === 'regenerate') regenerateMut.mutate();
                else rotateMut.mutate();
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
