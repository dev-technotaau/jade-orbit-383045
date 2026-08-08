'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, ArrowRight, Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Logo from '@/components/common/Logo';
import { teamService } from '@/services/team.service';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

type Phase = 'loading' | 'unauthenticated' | 'accepting' | 'success' | 'error';

/**
 * Team-invite acceptance landing page. The invite email links here with
 * `?token=<32hex>`. Behaviour:
 *
 *   1. If not authenticated → show a sign-in prompt; preserve the token
 *      via the redirect query so the user lands back here after login.
 *   2. If authenticated but the email on the account doesn't match the
 *      invited email, the backend rejects with INVITE_EMAIL_MISMATCH —
 *      we surface that clearly with a "switch account" link.
 *   3. On success → show a confirmation card and route to /employer.
 *
 * Lives outside `/employer` so unauthenticated visitors can land here
 * without hitting EmployerPlanGuard.
 */
export default function TeamAcceptInvitePage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, isAuthenticated } = useAuthStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('error');
      setError('Missing invite token in the URL.');
      return;
    }

    // Wait for hydration of auth state on first render before deciding.
    const t = setTimeout(() => {
      if (!isAuthenticated || !user) {
        setPhase('unauthenticated');
        return;
      }
      setPhase('accepting');
      teamService
        .accept(token)
        .then(() => {
          setPhase('success');
        })
        .catch((err) => {
          const apiErr = err as unknown as ApiError;
          setError(apiErr.message ?? 'Failed to accept invitation');
          setPhase('error');
        });
    }, 100);
    return () => clearTimeout(t);
  }, [token, isAuthenticated, user]);

  const loginUrl = `${ROUTES.AUTH.LOGIN_EMPLOYER}?redirect=${encodeURIComponent(`/team/accept?token=${token}`)}`;
  const registerUrl = `${ROUTES.AUTH.REGISTER_EMPLOYER}?redirect=${encodeURIComponent(`/team/accept?token=${token}`)}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <Card padding="lg" className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <Logo size="md" href="/" />
        </div>

        {phase === 'loading' && (
          <div className="py-6">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {phase === 'unauthenticated' && (
          <>
            <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[var(--text)]">Sign in to accept</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              You&apos;ve been invited to join a team on Hire Adda. Sign in to your account to
              accept — or create one if this is your first time.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link href={loginUrl}>
                <Button variant="primary" className="w-full">
                  Sign in to accept <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <Link href={registerUrl}>
                <Button variant="outline" className="w-full">
                  Create an account
                </Button>
              </Link>
            </div>
          </>
        )}

        {phase === 'accepting' && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--text-muted)]" />
            <p className="mt-3 text-sm text-[var(--text-muted)]">Accepting invitation…</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[var(--text)]">You&apos;re in</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Welcome to the team. You now share the company&apos;s plan benefits — head to the
              dashboard to start working.
            </p>
            <Button
              variant="primary"
              className="mt-6 w-full"
              onClick={() => router.push(ROUTES.EMPLOYER.DASHBOARD)}
            >
              Go to dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
              <XCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[var(--text)]">
              Couldn&apos;t accept invitation
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/employer">
                <Button variant="primary" className="w-full">
                  Go to dashboard
                </Button>
              </Link>
              <Link href="/employer/help">
                <Button variant="ghost" className="w-full">
                  Contact support
                </Button>
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
