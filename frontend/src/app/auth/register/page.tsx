'use client';

/**
 * Legacy /auth/register URL — repurposed as a "choose your role" landing
 * page now that we have dedicated /auth/register/{candidate,employer}.
 *
 * Backward compat:
 *   • `?role=employer|candidate` → auto-redirect to the matching
 *     dedicated page. `?role=vendor` routes to employer registration —
 *     vendor is an employer capability (VENDOR_CONNECT plan), not a
 *     separate account type.
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

const registerJsonLd = graph(
  webPageSchema({
    url: '/auth/register',
    name: 'Create Account — Hire Adda',
    description: 'Create your Hire Adda account to apply for jobs or post openings. Free to join.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Register', url: '/auth/register' },
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
    description: 'Apply for jobs, build your profile, track applications.',
    href: ROUTES.AUTH.REGISTER_CANDIDATE,
    icon: GraduationCap,
  },
  {
    title: 'Employer',
    description:
      'Post jobs, search candidates and manage your hiring. Recruitment agencies register here too.',
    href: ROUTES.AUTH.REGISTER_EMPLOYER,
    icon: Building2,
  },
];

function RegisterChooserContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Backward compat: ?role=employer|vendor|candidate auto-redirects.
  // Vendors are employers now, so legacy vendor links land on employer signup.
  useEffect(() => {
    const role = searchParams.get('role');
    if (!role) return;
    const target =
      role === 'employer' || role === 'vendor'
        ? ROUTES.AUTH.REGISTER_EMPLOYER
        : role === 'candidate'
          ? ROUTES.AUTH.REGISTER_CANDIDATE
          : null;
    if (!target) return;
    const redirect = searchParams.get('redirect');
    const url = redirect ? `${target}?redirect=${encodeURIComponent(redirect)}` : target;
    router.replace(url);
  }, [searchParams, router]);

  const redirect = searchParams.get('redirect');
  const buildHref = (href: string) =>
    redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">Create Account</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Choose how you want to register</p>
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
                  Register as {card.title}
                </h2>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{card.description}</p>
              </div>
              <ArrowRight className="text-primary h-5 w-5 flex-none" />
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Already have an account?{' '}
        <Tooltip content="Sign in to your existing account" inline>
          <Link
            href={ROUTES.AUTH.LOGIN}
            className="text-primary hover:text-primary-hover font-medium"
          >
            Sign In
          </Link>
        </Tooltip>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthLayout>
      <JsonLd id="jsonld-register" data={registerJsonLd} />
      <Suspense fallback={null}>
        <RegisterChooserContent />
      </Suspense>
      <AuthSupportFooter pageContext="register" audience="all" />
    </AuthLayout>
  );
}
