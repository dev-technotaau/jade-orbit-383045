'use client';

/**
 * Legacy /auth/login URL — repurposed as a "choose your role" landing
 * page now that we have dedicated /auth/login/{candidate,employer}.
 *
 * Backward compat:
 *   • `?tab=employer|candidate` → auto-redirect to the matching
 *     dedicated page (preserves any existing inbound links). `?tab=vendor`
 *     routes to the employer page — vendor is an employer capability now,
 *     not a separate account type.
 *   • `?redirect=...` is preserved through the redirect.
 */

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, GraduationCap, ArrowRight } from 'lucide-react';
import AuthLayout from '@/components/layout/AuthLayout';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import JsonLd from '@/components/seo/JsonLd';
import Tooltip from '@/components/ui/Tooltip';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import { ROUTES } from '@/constants/routes';

const loginJsonLd = graph(
  webPageSchema({
    url: '/auth/login',
    name: 'Sign In — Hire Adda',
    description: 'Sign in to your Hire Adda account to find jobs or hire talent.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Sign In', url: '/auth/login' },
  ]),
);

interface RoleCard {
  title: string;
  description: string;
  href: string;
  icon: typeof Building2;
}

const ROLE_CARDS: RoleCard[] = [
  {
    title: 'Candidate',
    description: 'Apply for jobs, manage your profile, track applications.',
    href: ROUTES.AUTH.LOGIN_CANDIDATE,
    icon: GraduationCap,
  },
  {
    title: 'Employer',
    description: 'Post jobs, search CVs, manage applications and hiring.',
    href: ROUTES.AUTH.LOGIN_EMPLOYER,
    icon: Building2,
  },
];

function LoginChooserContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Backward compat: ?tab=employer|vendor|candidate auto-redirects.
  // Vendors are employers now, so legacy vendor links land on employer login.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const target =
      tab === 'employer' || tab === 'vendor'
        ? ROUTES.AUTH.LOGIN_EMPLOYER
        : tab === 'candidate'
          ? ROUTES.AUTH.LOGIN_CANDIDATE
          : null;
    if (!target) return;
    const redirect = searchParams.get('redirect');
    const url = redirect ? `${target}?redirect=${encodeURIComponent(redirect)}` : target;
    router.replace(url);
  }, [searchParams, router]);

  // Preserve any redirect param on chooser links so the post-auth flow
  // returns to where the user came from.
  const redirect = searchParams.get('redirect');
  const buildHref = (href: string) =>
    redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">Sign In</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Choose how you want to sign in</p>
      </div>

      <div className="space-y-3">
        {ROLE_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={buildHref(card.href)}
              className="hover:border-primary/40 group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-white p-4 transition-all hover:shadow-sm"
            >
              <div className="bg-primary/10 text-primary flex h-12 w-12 flex-none items-center justify-center rounded-xl">
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="group-hover:text-primary font-semibold text-[var(--text)]">
                  Sign in as {card.title}
                </h2>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{card.description}</p>
              </div>
              <ArrowRight className="text-primary h-5 w-5 flex-none" />
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Don&apos;t have an account?{' '}
        <Tooltip content="Create a new account" inline>
          <Link
            href={ROUTES.AUTH.REGISTER}
            className="text-primary hover:text-primary-hover font-medium"
          >
            Sign Up
          </Link>
        </Tooltip>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <JsonLd id="jsonld-login" data={loginJsonLd} />
      <Suspense fallback={null}>
        <LoginChooserContent />
      </Suspense>
      <AuthSupportFooter pageContext="login" audience="all" />
    </AuthLayout>
  );
}
