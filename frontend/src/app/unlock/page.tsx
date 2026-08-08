'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, AlertCircle } from 'lucide-react';
import Logo from '@/components/common/Logo';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/use-auth';

/**
 * The module's only entry point.
 *
 * Replaces the host application's /auth tree — 17 pages of candidate/employer
 * login, registration, OAuth callback, email verification and password reset.
 * There are no accounts here: one shared password unlocks the operator UI.
 *
 * Deliberately minimal. No "forgot password" (there is nobody to ask), no
 * sign-up, no social buttons, no role tabs.
 */
export default function UnlockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirect = searchParams?.get('redirect') || '/whatsapp';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError(null);
    try {
      const ok = await login(password);
      if (ok) {
        router.replace(redirect);
        return;
      }
      // `login` resolves false only for a genuinely wrong password.
      setError('Incorrect password.');
      setPassword('');
    } catch (err) {
      // A throw means the deployment is broken, not that the password is wrong —
      // most likely APP_PASSWORD is unset on the server. Say so, rather than
      // letting the operator retype a correct password forever.
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Same brand mark as the sidebar, and the same BRAND_NAME text
              fallback when no logo file is present. */}
          <Logo size="lg" href="" className="mb-4" />
          <span className="bg-primary-light mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full">
            <Lock className="text-primary h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Enter the app password to continue.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
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

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" isLoading={busy} disabled={!password} className="w-full">
            Unlock
          </Button>
        </form>
      </div>
    </main>
  );
}
