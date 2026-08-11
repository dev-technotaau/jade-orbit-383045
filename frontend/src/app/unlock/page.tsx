'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';
import Logo from '@/components/common/Logo';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Turnstile from '@/components/common/Turnstile';
import OtpInput from '@/components/common/OtpInput';
import { useAuth } from '@/hooks/use-auth';

/**
 * The module's only entry point.
 *
 * Replaces the host application's /auth tree — 17 pages of candidate/employer
 * login, registration, OAuth callback, email verification and password reset.
 * There are no accounts here: one shared password unlocks the operator UI, and
 * when MFA is enabled a second factor finishes the job.
 *
 * Deliberately minimal. No "forgot password" (there is nobody to ask), no
 * sign-up, no social buttons, no role tabs.
 */
type Step = 'password' | 'mfa';

export default function UnlockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyMfa } = useAuth();

  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Bumping this re-runs the challenge: a Turnstile token is single-use, so a
  // failed submit must not be retried with the same one.
  const [challengeNonce, setChallengeNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirect = searchParams?.get('redirect') || '/whatsapp';

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError(null);
    try {
      const result = await login(password, turnstileToken);
      if (result.status === 'unlocked') {
        router.replace(redirect);
        return;
      }
      if (result.status === 'mfa_required') {
        // The password is done with. Drop it from state rather than leaving it
        // sitting in memory for the length of the MFA step.
        setPassword('');
        setStep('mfa');
        return;
      }
      setError('Incorrect password.');
      setPassword('');
      // A Turnstile token is single-use, so the next attempt needs a new one.
      setTurnstileToken(null);
      setChallengeNonce((n) => n + 1);
    } catch (err) {
      // A throw means the deployment is broken or the bot check was rejected —
      // not that the password is wrong. Say so, rather than letting the operator
      // retype a correct password forever.
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
      setTurnstileToken(null);
      setChallengeNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(value: string) {
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    try {
      const result = await verifyMfa(value, trustDevice);
      if (result.status === 'unlocked') {
        router.replace(redirect);
        return;
      }
      if (result.status === 'expired') {
        setError('That sign-in attempt expired. Enter the password again.');
        setStep('password');
        setCode('');
        setTurnstileToken(null);
        setChallengeNonce((n) => n + 1);
        return;
      }
      setError(useRecoveryCode ? 'That recovery code is not valid.' : 'That code is not valid.');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-secondary)] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Same brand mark as the sidebar, and the same BRAND_NAME text
              fallback when no logo file is present. */}
          <Logo size="lg" href="" className="mb-4" />
          <span className="bg-primary-light mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full">
            {step === 'password' ? (
              <Lock className="text-primary h-4 w-4" aria-hidden="true" />
            ) : (
              <ShieldCheck className="text-primary h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {step === 'password'
              ? 'Enter the app password to continue.'
              : useRecoveryCode
                ? 'Enter one of your recovery codes.'
                : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        {step === 'password' ? (
          <form onSubmit={submitPassword} className="space-y-4">
            <Input
              type="password"
              label="App password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              // Names the field for password managers without implying accounts.
              name="app-password"
              disabled={busy}
            />

            <Turnstile onToken={setTurnstileToken} resetKey={challengeNonce} />

            {error && <ErrorNote message={error} />}

            <Button type="submit" isLoading={busy} disabled={!password} className="w-full">
              Unlock
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {useRecoveryCode ? (
              <Input
                label="Recovery code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoFocus
                autoComplete="one-time-code"
                disabled={busy}
              />
            ) : (
              <OtpInput
                value={code}
                onChange={setCode}
                // Auto-submit on the sixth digit: with a fixed-length code there
                // is nothing left to decide, and it removes a click from a step
                // every operator performs daily.
                onComplete={(v) => void submitCode(v)}
                disabled={busy}
                autoFocus
              />
            )}

            <Checkbox
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              label="Trust this browser for 30 days"
              disabled={busy}
            />

            {error && <ErrorNote message={error} />}

            <Button
              type="button"
              isLoading={busy}
              disabled={code.length < (useRecoveryCode ? 8 : 6)}
              className="w-full"
              onClick={() => void submitCode(code)}
            >
              Verify
            </Button>

            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode((v) => !v);
                setCode('');
                setError(null);
              }}
              className="text-primary flex w-full items-center justify-center gap-1.5 text-sm hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              {useRecoveryCode ? 'Use your authenticator app instead' : 'Use a recovery code'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
