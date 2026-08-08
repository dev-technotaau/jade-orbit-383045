import type { ReactNode } from 'react';
import { Compass, Check } from 'lucide-react';
import CandidateAuthHeader from './CandidateAuthHeader';
import CandidateHeroImage from './CandidateHeroImage';
import CandidateOfferings from './CandidateOfferings';
import CandidateJobSeekers from './CandidateJobSeekers';
import CandidateAuthCta from './CandidateAuthCta';
import TestimonialCarousel from '@/components/common/TestimonialCarousel';
import { CANDIDATE_TESTIMONIALS } from '@/data/testimonials';
import PageFaqSection from '@/components/support/PageFaqSection';
import Footer from '@/components/layout/Footer';
import WhatsAppFloatingButton from '@/components/common/WhatsAppFloatingButton';

interface CandidateAuthShellProps {
  mode: 'login' | 'register';
  /** The auth form (RoleLoginForm / RoleRegisterForm) — placed in the hero. */
  children: ReactNode;
}

const HERO_COPY = {
  login: {
    title: 'Welcome back — your next opportunity awaits.',
    subtitle:
      'Sign in to apply to jobs, track your applications and keep your profile in front of recruiters.',
  },
  register: {
    title: 'Find your dream job with Hire Adda.',
    subtitle:
      'Create your free account to apply to thousands of jobs, build a standout resume and get discovered by top recruiters.',
  },
} as const;

const HERO_POINTS = [
  'Apply to thousands of live jobs across India',
  'Build an ATS-friendly resume — free',
  'Get discovered by verified recruiters',
];

export default function CandidateAuthShell({ mode, children }: CandidateAuthShellProps) {
  const copy = HERO_COPY[mode];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <CandidateAuthHeader mode={mode} />

      {/* ── Hero — image background (not full-viewport height) + black overlay ── */}
      {/* Dark brand gradient is the fallback so the hero looks intentional even
          before the background image is added (or if it fails to load). */}
      <section className="from-primary-dark relative overflow-hidden bg-gradient-to-br to-slate-900">
        <CandidateHeroImage />
        {/* Black legibility overlay */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-12 lg:px-8">
          {/* Left — hero content */}
          <div className="text-white">
            <span className="bg-primary/20 text-primary-light ring-primary/30 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 backdrop-blur-sm">
              <Compass className="h-3.5 w-3.5" />
              For Job Seekers
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

      {/* ── What Hire Adda offers (candidate features) ── */}
      <CandidateOfferings />

      {/* ── Built for every job seeker ── */}
      <CandidateJobSeekers />

      {/* ── CTA banner → Request callback ── */}
      <CandidateAuthCta />

      {/* ── Testimonials — job seekers ── */}
      <TestimonialCarousel
        variant="candidate"
        heading="Loved by job seekers like you"
        subheading="Real stories from candidates who found their next role on Hire Adda."
        testimonials={CANDIDATE_TESTIMONIALS}
      />

      {/* ── FAQ ── */}
      <div className="bg-[var(--bg-secondary)] pb-4">
        <PageFaqSection
          pageContext="pricing-candidate"
          audience="candidate"
          heading="Job Seeker FAQ"
          subheading="Quick answers about applying to jobs, your profile, resume and premium."
          jsonLdId={`jsonld-faq-candidate-${mode}`}
        />
      </div>

      {/* ── Full site footer (with the mega-menu section) ── */}
      <Footer />

      {/* Public-only floating WhatsApp button — these shells render Header/Footer
          directly instead of via PublicLayout, so they need their own mount. */}
      <WhatsAppFloatingButton />
    </div>
  );
}
