import type { ReactNode } from 'react';
import { Briefcase, Check } from 'lucide-react';
import EmployerAuthHeader from './EmployerAuthHeader';
import EmployerHeroVideo from './EmployerHeroVideo';
import EmployerOfferings from './EmployerOfferings';
import EmployerHiringSimple from './EmployerHiringSimple';
import EmployerAuthCta from './EmployerAuthCta';
import TestimonialCarousel from '@/components/common/TestimonialCarousel';
import { EMPLOYER_TESTIMONIALS } from '@/data/testimonials';
import PageFaqSection from '@/components/support/PageFaqSection';
import Footer from '@/components/layout/Footer';
import WhatsAppFloatingButton from '@/components/common/WhatsAppFloatingButton';

interface EmployerAuthShellProps {
  mode: 'login' | 'register';
  /** The auth form (RoleLoginForm / RoleRegisterForm) — placed in the hero. */
  children: ReactNode;
}

const HERO_COPY = {
  login: {
    title: 'Welcome back — let’s find your next great hire.',
    subtitle:
      'Sign in to post jobs, search the CV database and manage applications, all in one place.',
  },
  register: {
    title: 'Hire smarter and faster with Hire Adda.',
    subtitle:
      'Create your employer account to post jobs, unlock candidate CVs and reach lakhs of active job seekers across India.',
  },
} as const;

const HERO_POINTS = [
  'Reach lakhs of active, verified candidates',
  'Search & unlock CVs from the Talent Vault',
  'Assisted hiring & a dedicated employer helpline',
];

export default function EmployerAuthShell({ mode, children }: EmployerAuthShellProps) {
  const copy = HERO_COPY[mode];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <EmployerAuthHeader mode={mode} />

      {/* ── Hero — video background (not full-viewport height) + black overlay ── */}
      <section className="relative overflow-hidden">
        {/* Crossfaded loop — hides the clip's non-seamless loop point. */}
        <EmployerHeroVideo />
        {/* Black legibility overlay */}
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-12 lg:px-8">
          {/* Left — hero content */}
          <div className="text-white">
            <span className="bg-primary/20 text-primary-light ring-primary/30 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 backdrop-blur-sm">
              <Briefcase className="h-3.5 w-3.5" />
              For Employers
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-lg text-base text-white/80 sm:text-lg">{copy.subtitle}</p>
            <ul className="mt-6 space-y-2.5">
              {HERO_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2.5 text-sm text-white/90 sm:text-base"
                >
                  <span className="bg-primary mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — the auth form */}
          <div className="w-full max-w-md justify-self-center lg:justify-self-end">{children}</div>
        </div>
      </section>

      {/* ── What Hire Adda offers (employer plans grid) ── */}
      <EmployerOfferings />

      {/* ── Hiring made simple for every business ── */}
      <EmployerHiringSimple />

      {/* ── CTA banner → Request callback ── */}
      <EmployerAuthCta />

      {/* ── Testimonials — hiring leaders / company heads ── */}
      <TestimonialCarousel
        variant="employer"
        heading="Trusted by hiring teams across India"
        subheading="Employers and HR leaders who found the right talent faster with Hire Adda."
        testimonials={EMPLOYER_TESTIMONIALS}
      />

      {/* ── FAQ ── */}
      <div className="bg-[var(--bg-secondary)] pb-4">
        <PageFaqSection
          pageContext="pricing-employer"
          audience="employer"
          heading="Employer FAQ"
          subheading="Quick answers about plans, posting jobs, CV access and billing."
          jsonLdId={`jsonld-faq-employer-${mode}`}
        />
      </div>

      {/* ── Site footer (without the mega-menu section) ── */}
      <Footer hideMegaSection />

      {/* Public-only floating WhatsApp button — these shells render Header/Footer
          directly instead of via PublicLayout, so they need their own mount. */}
      <WhatsAppFloatingButton />
    </div>
  );
}
