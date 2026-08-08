// Trigger CI/CD rebuild — refresh ghcr-credentials after VPS reboot (token expired during downtime)
// Trigger CI/CD rebuild again — full pipeline (backend + frontend builds + deploy-k8s)
// Trigger CI/CD rebuild — verify deploy-k8s SSH after MaxAuthTries fix and IdentitiesOnly flag
import AuthHomeRedirect from '@/components/common/AuthHomeRedirect';
import PublicLayout from '@/components/layout/PublicLayout';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { SEO_CONFIG } from '@/constants/seo';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import {
  graph,
  siteNavigationSchema,
  webPageSchema,
  ORGANIZATION_ID,
  WEBSITE_ID,
} from '@/lib/json-ld';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  Code,
  Eye,
  FileText,
  GraduationCap,
  Headphones,
  Lock,
  Megaphone,
  PenTool,
  Search,
  Shield,
  Stethoscope,
  Target,
  Truck,
  // UserCheck is only used by the temporarily hidden `securityPoints` list —
  // restore together.
  // UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import HeroShowcase from '@/components/home/HeroShowcase';
import Link from 'next/link';
import HeroJobSearchBar from '@/components/job-search/HeroJobSearchBar';
import JobSearchHistoryChips from '@/components/job-search/JobSearchHistoryChips';
// Discovery widgets (Sections 1–4 of the homepage discovery layer).
import JobsCategoriesChipsSection from '@/components/home/JobsCategoriesChipsSection';
// TopCompanyCategoriesSlider is temporarily hidden in the discovery layer —
// restore together with its section below.
// import TopCompanyCategoriesSlider from '@/components/home/TopCompanyCategoriesSlider';
// FeaturedCompaniesSlider is temporarily hidden in the discovery layer — restore together.
// import FeaturedCompaniesSlider from '@/components/home/FeaturedCompaniesSlider';
// PopularRolesGrid is temporarily hidden in the discovery layer —
// restore together with its section below.
// import PopularRolesGrid from '@/components/home/PopularRolesGrid';
import ImpactBanner from '@/components/home/ImpactBanner';
import ValueBanner from '@/components/home/ValueBanner';
import LatestJobsSection from '@/components/home/LatestJobsSection';
import HireSolutionsSection from '@/components/home/HireSolutionsSection';
import TrustMarquee from '@/components/home/TrustMarquee';
import BrowserMock from '@/components/home/BrowserMock';
import FaqAccordion from '@/components/home/FaqAccordion';
import SectionBackdrop from '@/components/home/SectionBackdrop';
import TestimonialCarousel from '@/components/common/TestimonialCarousel';
import { HOME_TESTIMONIALS } from '@/data/testimonials';

export const metadata: Metadata = buildMetadata({
  title: "Hire Adda: India's Leading Job Portal & Recruitment Platform",
  description:
    "Find your dream job or hire top talent on India's AI-powered recruitment platform. Verified employers, smart matching, and quick apply.",
  keywords: [
    'jobs',
    'careers',
    'recruitment',
    'hiring',
    'job portal',
    'India jobs',
    'hire adda',
    'job search',
    'hire talent',
    'AI recruitment',
  ],
  url: '/',
  // Surface explicit `article:published_time` /
  // `article:modified_time` meta tags + JSON-LD dates. Pulled from
  // SEO_CONFIG so the same constants drive the homepage,
  // <meta name="last-modified"> in layout.tsx, and every page's
  // schema.org graph.
  datePublished: SEO_CONFIG.siteLaunchDate,
  dateModified: SEO_CONFIG.siteLastModified,
});

/**
 * Homepage structured-data graph — emitted as a single `@graph` so Google
 * sees the entity cross-references (WebPage belongs to WebSite, about
 * Organization). Keeps payload compact vs. 4 separate <script> tags.
 *
 * Layout.tsx already ships Organization + WebSite + WebApplication
 * sitewide; here we add the homepage-specific WebPage + primary nav.
 */
const homeJsonLd = graph(
  webPageSchema({
    url: '/',
    name: "Hire Adda: India's Leading Job Portal & Recruitment Platform",
    description:
      "Find your dream job or hire top talent on India's AI-powered recruitment platform. Verified employers, smart matching, and quick apply.",
    speakableCssSelectors: ['h1', '.hero-subtitle', '[data-speakable]'],
    primaryImage: '/images/og-home.jpg',
    // Drives JSON-LD `datePublished` + `dateModified` — Google Search
    // uses these to attribute freshness signals in rich results.
    // Same source-of-truth dates as the Open Graph article:* meta tags.
    datePublished: SEO_CONFIG.siteLaunchDate,
    dateModified: SEO_CONFIG.siteLastModified,
  }),
  // Primary navigation — drives SERP sitelinks under the top brand result.
  siteNavigationSchema([
    { name: 'Jobs', url: '/candidate/jobs' },
    { name: 'Companies', url: '/companies' },
    { name: 'About', url: '/about' },
    { name: 'Help', url: '/help' },
    { name: 'Contact', url: '/contact' },
    { name: 'Site Map', url: '/sitemap' },
    { name: 'Login', url: '/auth/login' },
    { name: 'Register', url: '/auth/register' },
  ]),
  // Explicit SearchAction bound to the search form on the hero — gives
  // Google Sitelinks Search Box the exact URL template with the
  // `required` query-input hint.
  {
    '@context': 'https://schema.org',
    '@type': 'SearchAction',
    '@id': `${WEBSITE_ID}#hero-search`,
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://hireadda.in'}/candidate/jobs?search={search_term_string}&location={location_string}`,
      actionPlatform: [
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/MobileWebPlatform',
      ],
    },
    'query-input': ['required name=search_term_string', 'name=location_string'],
    inLanguage: 'en-IN',
    potentialAction: { '@id': ORGANIZATION_ID },
  },
);

// ---------------------------------------------------------------------------
// Server-side data fetching
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

interface PublicStats {
  activeJobs: number;
  companies: number;
  candidates: number;
  /** Applications submitted — a fully on-platform action, so always accurate. */
  applications: number;
}

const EMPTY_STATS: PublicStats = { activeJobs: 0, companies: 0, candidates: 0, applications: 0 };

async function fetchPublicStats(): Promise<PublicStats> {
  try {
    const res = await fetch(`${API_URL}/public/stats`, { next: { revalidate: 600 } });
    if (!res.ok) return EMPTY_STATS;
    const json = await res.json();
    return json.data ?? EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

async function fetchCategoryCounts(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${API_URL}/public/jobs/category-counts`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return {};
    const json = await res.json();
    return json.data ?? {};
  } catch {
    return {};
  }
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k+`;
  if (n > 0) return `${n}+`;
  return '0';
}

// Maps each display category to possible department values (case-insensitive match)
const categoryKeywords: Record<string, string[]> = {
  'Technology & IT': ['technology', 'it', 'engineering', 'software', 'tech', 'development'],
  'Finance & Accounting': ['finance', 'accounting', 'banking', 'financial'],
  'Design & Creative': ['design', 'creative', 'ux', 'ui', 'graphic'],
  'Marketing & Sales': ['marketing', 'sales', 'business development', 'growth'],
  'Customer Support': ['customer support', 'support', 'customer service', 'service'],
  'Education & Training': ['education', 'training', 'learning', 'teaching'],
  'Healthcare & Pharma': ['healthcare', 'pharma', 'medical', 'health', 'pharmaceutical'],
  'Operations & Logistics': ['operations', 'logistics', 'supply chain', 'warehouse'],
};

function getCategoryCount(categoryTitle: string, departmentCounts: Record<string, number>): number {
  const keywords = categoryKeywords[categoryTitle] ?? [];
  let total = 0;
  for (const [dept, count] of Object.entries(departmentCounts)) {
    const lower = dept.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) {
      total += count;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Static Data
// ---------------------------------------------------------------------------

const howItWorks = [
  {
    step: '1',
    title: 'Create Your Profile',
    description:
      'Sign up for free and build your professional profile with your skills, experience, and career preferences. Upload your resume for AI-powered parsing.',
    icon: Users,
  },
  {
    step: '2',
    title: 'Discover Opportunities',
    description:
      'Browse verified jobs or let our AI matching engine find the perfect opportunities tailored to your skills and aspirations.',
    icon: Search,
  },
  {
    step: '3',
    title: 'Get Hired',
    description:
      'Apply with a single click, connect with employers directly, track your applications in real-time, and land your dream job.',
    icon: Award,
  },
];

const features = [
  {
    icon: Target,
    title: 'AI-Powered Matching',
    spotlight: true,
    description:
      'Our machine-learning engine analyses your profile and surfaces the most relevant opportunities with precision — so the right jobs find you.',
  },
  {
    icon: Zap,
    title: 'Quick Apply',
    spotlight: true,
    description:
      'Apply to multiple jobs with a single click using your saved profile and AI-parsed resume — no repetitive forms, ever.',
  },
  {
    icon: BadgeCheck,
    title: 'Verified Employers',
    description:
      'Every company is verified, so you apply and share your details only with trustworthy, genuine recruiters.',
  },
  {
    icon: FileText,
    title: 'AI Resume Parsing',
    description:
      'Upload your resume and our Document AI extracts your skills, experience and qualifications automatically.',
  },
  {
    icon: Bell,
    title: 'Smart Job Alerts',
    description:
      'Get notified the moment new jobs match your criteria — via email, push or WhatsApp.',
  },
  {
    icon: Lock,
    title: 'Privacy & Security',
    description:
      'Enterprise-grade protection — encrypted data, CSRF protection and full control over who sees your profile.',
  },
];

const candidateBenefits = [
  { icon: Target, text: 'AI-powered job recommendations based on your skills and preferences' },
  { icon: Zap, text: 'One-click Quick Apply with your saved profile and resume' },
  { icon: Eye, text: 'Real-time application tracking and status updates' },
  { icon: BarChart3, text: 'Salary insights and career growth analytics' },
  { icon: Bell, text: 'Smart job alerts via email, push notifications, and WhatsApp' },
  { icon: FileText, text: 'Resume parsing powered by Google Document AI' },
];

const employerBenefits = [
  { icon: Megaphone, text: 'Post jobs and reach qualified candidates instantly' },
  { icon: Target, text: 'AI-powered candidate matching and ranking' },
  { icon: BadgeCheck, text: 'Verified employer badge to build trust with candidates' },
  { icon: Search, text: 'Advanced search filters with Elasticsearch integration' },
  { icon: BarChart3, text: 'Real-time analytics dashboard with hiring funnel metrics' },
  { icon: Code, text: 'Webhook integrations with your existing ATS and tools' },
];

/**
 * Homepage industry cards.
 *
 * `query` is the URL search-string each card links to. It used to be built as
 * `?q=${title.split('&')[0]}` — i.e. the card NAME dropped into free-text
 * search. That could never work: the backend's `q` searches title,
 * description, requirements, companyName, skills and tags only, so
 * `?q=Technology` never reaches a job whose *industry* is "Information
 * Technology". Every card led to an empty result page.
 *
 * These now use `department`, a real indexed field, matched with a `term` OR
 * `prefix` clause on the backend.
 *
 * Honest caveat: `department` is free-text entered by employers and is
 * currently null or empty on most job records, so several of these will show
 * no results until job data is tagged consistently. That is a data problem,
 * not a link problem — but the link is now at least pointed at the right
 * field, so these pages start working the moment tagging improves.
 */
const jobCategories = [
  {
    icon: Code,
    title: 'Technology & IT',
    image: '/images/home/cat-technology.webp',
    query: 'department=Engineering',
  },
  {
    icon: BarChart3,
    title: 'Finance & Accounting',
    image: '/images/home/cat-finance.webp',
    query: 'department=Finance',
  },
  {
    icon: PenTool,
    title: 'Design & Creative',
    image: '/images/home/cat-design.webp',
    query: 'department=Design',
  },
  {
    icon: Megaphone,
    title: 'Marketing & Sales',
    image: '/images/home/cat-marketing.webp',
    query: 'department=Marketing',
  },
  {
    icon: Headphones,
    title: 'Customer Support',
    image: '/images/home/cat-support.webp',
    query: 'department=Customer Support',
  },
  {
    icon: GraduationCap,
    title: 'Education & Training',
    image: '/images/home/cat-education.webp',
    query: 'department=Education',
  },
  {
    icon: Stethoscope,
    title: 'Healthcare & Pharma',
    image: '/images/home/cat-healthcare.webp',
    query: 'industry=Healthcare',
  },
  {
    icon: Truck,
    title: 'Operations & Logistics',
    image: '/images/home/cat-operations.webp',
    query: 'department=Operations',
  },
];

// securityPoints is temporarily hidden — restore together with the icon list
// in the "Your Data is Safe With Us" section below.
// const securityPoints = [
//   {
//     icon: Lock,
//     title: 'End-to-End Encryption',
//     description: 'All data is encrypted in transit and at rest using AES-256 encryption.',
//   },
//   {
//     icon: Shield,
//     title: 'GDPR & Data Privacy Compliant',
//     description: 'Full compliance with data protection regulations. You control your data.',
//   },
//   {
//     icon: UserCheck,
//     title: 'Verified Employers Only',
//     description: 'Every employer undergoes document verification before posting jobs.',
//   },
//   {
//     icon: Eye,
//     title: 'Transparent Data Practices',
//     description: 'Clear privacy policy with full visibility into how your data is used.',
//   },
// ];

const trustBadges = [
  { src: '/icons/payments/ssl-secure.svg', label: 'SSL Secured', sub: '256-bit TLS' },
  { src: '/icons/payments/pci-dss.svg', label: 'PCI-DSS', sub: 'Payment security' },
  {
    src: '/icons/payments/gstin-verified.svg',
    label: 'GSTIN Verified',
    sub: 'Registered business',
  },
  { src: '/icons/payments/startup-india.svg', label: 'Startup India', sub: 'DPIIT recognised' },
  { src: '/icons/payments/msme-udyam.svg', label: 'MSME · Udyam', sub: 'Govt. registered' },
  { src: '/icons/payments/make-in-india.svg', label: 'Make in India', sub: 'Built in India' },
];

const faqs = [
  {
    question: 'Is Hire Adda free for job seekers?',
    answer:
      'Yes, Hire Adda is completely free for job seekers. You can create a profile, search for jobs, apply to unlimited positions, and access career insights at no cost whatsoever.',
  },
  {
    question: 'How does the AI-powered job matching work?',
    answer:
      'Our matching engine analyzes your profile, skills, experience, and preferences, then uses machine learning algorithms to rank and recommend jobs that best fit your career goals. The more you use the platform, the smarter the recommendations become.',
  },
  {
    question: 'Are all employers verified on the platform?',
    answer:
      'Yes, every employer on Hire Adda undergoes a verification process that includes document checks and business validation. Verified employers display a blue badge on their profile, giving you confidence that the job listings are legitimate.',
  },
  {
    question: 'How can I post a job as an employer?',
    answer:
      'Register as an employer, complete your company profile, and submit it for verification. Once verified, you can post jobs from your dashboard. We offer a free plan with up to 3 active job postings, and premium plans for unlimited access and advanced features.',
  },
  {
    question: 'What makes Hire Adda different from other job portals?',
    answer:
      'Hire Adda combines AI-powered matching, verified employers, real-time analytics, and multi-channel notifications (email, push, WhatsApp) in one platform. Our focus on trust, technology, and user experience sets us apart from traditional job boards.',
  },
  {
    question: 'Can I track my application status in real-time?',
    answer:
      'Absolutely. Your dashboard shows real-time status updates for every application you submit. You will also receive instant notifications via email, push, or WhatsApp when an employer views your profile, shortlists you, or schedules an interview.',
  },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default async function Home() {
  const [stats, categoryCounts] = await Promise.all([fetchPublicStats(), fetchCategoryCounts()]);

  return (
    <PublicLayout>
      {/* NOTE: the hero illustration used to be a 42 KB
          `/images/hero-illustration.svg` <Image>, which needed an explicit
          LCP preload here — Lighthouse measured a 7.9s "resource load delay"
          because Next's auto-emitted preload landed after the render-blocking
          CSS. It is now <HeroShowcase />, an INLINE SVG, so there is no hero
          image request to preload or delay at all. GSAP attaches afterwards
          via a dynamic import, keeping motion off the critical path. */}
      <AuthHomeRedirect />
      {/* Homepage structured-data graph — WebPage + SiteNavigationElement
          + dedicated hero SearchAction. Sitewide Organization + WebSite +
          WebApplication are already in layout.tsx. */}
      <JsonLd id="jsonld-home" data={homeJsonLd} />

      {/* ================================================================
                SECTION 1: Hero (Enhanced)
            ================================================================ */}
      {/* NOTE: `overflow-hidden` is intentionally NOT on the <section>.
          The hero search bar (keyword / location / experience) renders
          floating dropdowns that extend below the section — clipping them
          at the section boundary was a previous UX bug. Decorative blobs
          are wrapped in their own overflow-hidden container below so they
          stay contained without affecting child overflow. */}
      <section className="from-primary-100 to-accent-light under-public-header relative bg-gradient-to-br via-white">
        {/* Decorative blobs — contained in a pointer-events-none wrapper
            with overflow-hidden so they don't bleed into adjacent sections
            but ALSO don't clip the search bar's autosuggest popovers. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="bg-primary/5 absolute -top-40 -right-40 h-80 w-80 rounded-full blur-3xl" />
          <div className="bg-accent/5 absolute -bottom-40 -left-40 h-80 w-80 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: Text */}
            <div>
              <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <Zap className="h-3.5 w-3.5" /> AI-Powered Job Portal
              </span>

              <h1 className="mt-6 text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl lg:text-6xl">
                Find Your <span className="text-primary whitespace-nowrap">Dream Job,</span>{' '}
                <br className="hidden sm:block" />
                Build Your Future
              </h1>

              <p className="hero-subtitle mt-6 max-w-xl text-lg text-[var(--text-secondary)] sm:text-xl">
                Connect with top companies and discover opportunities that match your skills.
                Whether you&apos;re hiring or looking for your next role, Hire Adda has you covered.
              </p>

              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row">
                <Tooltip content="Create your free account and start your job search">
                  <Link href="/auth/register/candidate">
                    <Button size="lg" rightIcon={<ArrowRight className="h-5 w-5" />}>
                      Find Jobs
                    </Button>
                  </Link>
                </Tooltip>
                <Tooltip content="Register as an employer and post job listings">
                  <Link href="/auth/register/employer">
                    <Button variant="highlight" size="lg">
                      Post a Job
                    </Button>
                  </Link>
                </Tooltip>
              </div>

              {/* Trust badges — real numbers */}
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-[var(--success)]" />{' '}
                  {formatNumber(stats.companies)} Companies
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-[var(--success)]" />{' '}
                  {formatNumber(stats.candidates)} Candidates
                </span>
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-[var(--success)]" /> Verified & Secure
                </span>
              </div>
            </div>

            {/* Right: Hero showcase — bespoke interactive Hire Adda console.
                Same 600×500 footprint as the illustration it replaced, so the
                hero grid geometry (and CLS) is unchanged. Desktop-only, as
                before. */}
            <div className="hidden lg:block">
              <HeroShowcase />
            </div>
          </div>

          {/* Public hero search bar (Phase 9) — placed as a full-width
              row BELOW the 2-column heading/illustration grid so the
              keyword + location + experience + Search button each get
              comfortable width on desktop (~1280 px canvas) instead of
              fighting for the ~640 px of the constrained left column.
              Submitting navigates to /jobs?q=&location=&experienceMin/Max=
              so the user lands on the public listing surface with their
              search pre-applied. */}
          <div className="mt-12 sm:mt-14 lg:mt-16">
            <HeroJobSearchBar destination="/jobs" />
            <JobSearchHistoryChips type="JOB" destination="/jobs" className="mt-3" hideWhenEmpty />
          </div>
        </div>
      </section>

      {/* ================================================================
                DISCOVERY LAYER (4 sections): chips · top-categories ·
                featured companies · popular roles. Drive guests deeper
                into the public job/company surfaces without a search.
            ================================================================ */}
      {/* Section 1 — Jobs in Demand + Popular Categories chips (no heading) */}
      <div className="relative overflow-hidden bg-white">
        <SectionBackdrop variant="dots" />
        <div className="relative">
          <JobsCategoriesChipsSection />
        </div>
      </div>

      {/* Section 2 — Featured Companies Actively Hiring — TEMPORARILY HIDDEN.
          Restore this block when ready. While it is out, Section 1 (chips) is
          white so the discovery layer keeps its alternating gray/white rhythm.
      <div className="relative overflow-hidden bg-white">
        <SectionBackdrop variant="mesh" />
        <div className="relative">
          <FeaturedCompaniesSlider />
        </div>
      </div>
      */}

      {/* Section 3 — Top Companies Hiring Now — TEMPORARILY HIDDEN.
          Restore this block (and its import) when ready.
      <div className="relative overflow-hidden bg-[var(--bg-secondary)]">
        <SectionBackdrop variant="glow" />
        <div className="relative">
          <TopCompanyCategoriesSlider />
        </div>
      </div>
      */}

      {/* Section 4 — Discover Jobs Across Popular Roles — TEMPORARILY HIDDEN.
          Restore this block (and its import) when ready. With Sections 2-4 out,
          the discovery layer is just the white chips section, which still
          alternates correctly against the gray Latest Jobs section below.
      <div className="relative overflow-hidden bg-white">
        <SectionBackdrop variant="grid" />
        <div className="relative">
          <PopularRolesGrid />
        </div>
      </div>
      */}

      {/* Section 4.5 — Live latest jobs (real data from the public jobs API) */}
      <LatestJobsSection />

      {/* ================================================================
                SECTION 1.5: Hiring solutions (per pricing-guide §"Best Website Home Options")
            ================================================================ */}
      <HireSolutionsSection />

      {/* ================================================================
                SECTION 2: Impact banner (dark band, animated count-up stats)
            ================================================================ */}
      <ImpactBanner stats={stats} />

      {/* Trust marquee — auto-scrolling value/trust-signal strip */}
      <TrustMarquee />

      {/* Value banner — full-width, image-led "talent meets opportunity" beat */}
      <ValueBanner />

      {/* ================================================================
                SECTION 3: How It Works (Improved)
            ================================================================ */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              Simple Process
            </span>
            <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">
              How Hire Adda Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Get started in just three simple steps &mdash; whether you&apos;re looking for a job
              or hiring talent
            </p>
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left — vertical, connected steps */}
            <div>
              {howItWorks.map((item, i) => {
                const a = [
                  { tile: 'from-blue-500 to-indigo-600', chip: 'bg-blue-600' },
                  { tile: 'from-violet-500 to-purple-600', chip: 'bg-violet-600' },
                  { tile: 'from-emerald-500 to-teal-600', chip: 'bg-emerald-600' },
                ][i % 3];
                const isLast = i === howItWorks.length - 1;
                return (
                  <div key={item.step} className="flex gap-5">
                    {/* tile + connector rail */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br ${a.tile} text-white shadow-lg`}
                      >
                        <item.icon className="h-6 w-6" />
                      </div>
                      {!isLast && <div className="mt-2 w-0.5 flex-1 bg-[var(--border)]" />}
                    </div>
                    <div className={isLast ? '' : 'pb-8'}>
                      <span
                        className={`${a.chip} inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white`}
                      >
                        Step {item.step}
                      </span>
                      <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-[var(--text-secondary)]">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right — pure-CSS product device mock (replaces a screenshot) */}
            <BrowserMock />
          </div>
        </div>
      </section>

      {/* ================================================================
                SECTION 4: Features (Expanded to 8)
            ================================================================ */}
      <section className="bg-[var(--bg-secondary)] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            {/* Two fixes, both measured. (1) `bg-secondary-light` (#fef3e1) and
                this section's `--bg-secondary` (#f1f5f9) have IDENTICAL
                luminance — 1.00:1 — so the pill had no edge at all. No on-token
                tint fixes that (every candidate lands at 1.00-1.10), so the
                boundary comes from a ring instead of the fill. (2) The label was
                `text-secondary` on that fill: 2.27:1, well under the 4.5:1 AA
                floor. `text-secondary-dark` measures 4.71:1 and keeps the amber
                identity. */}
            <span className="bg-secondary-light text-secondary-dark ring-secondary/40 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1">
              Platform Features
            </span>
            <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Why Choose Hire Adda?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Enterprise-grade tools and features for a seamless hiring experience
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => {
              const tile = [
                'from-blue-500 to-indigo-600',
                'from-violet-500 to-purple-600',
                'from-emerald-500 to-teal-600',
                'from-amber-500 to-orange-600',
              ][i % 4];
              const spot = feature.spotlight;
              return (
                <div
                  key={feature.title}
                  className={`group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl sm:p-7 ${
                    spot ? 'sm:col-span-2' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r ${tile} transition-transform duration-300 group-hover:scale-x-100`}
                  />
                  {spot && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${tile} opacity-10 blur-2xl`}
                    />
                  )}
                  <div
                    className={`relative mb-4 flex items-center justify-center rounded-xl bg-gradient-to-br ${tile} text-white shadow-md transition-transform duration-300 group-hover:scale-110 ${
                      spot ? 'h-14 w-14' : 'h-12 w-12'
                    }`}
                  >
                    <feature.icon className={spot ? 'h-7 w-7' : 'h-6 w-6'} />
                  </div>
                  <h3
                    className={`relative mb-2 font-semibold text-[var(--text)] ${spot ? 'text-xl' : 'text-lg'}`}
                  >
                    {feature.title}
                  </h3>
                  <p className="relative text-sm leading-relaxed text-[var(--text-secondary)]">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================
                SECTION 5: For Candidates / For Employers
            ================================================================ */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Built for Everyone in the Hiring Journey
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Whether you&apos;re looking for your next opportunity or your next great hire
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* For Candidates */}
            <div className="from-primary-50 rounded-2xl border border-[var(--border)] bg-gradient-to-br to-white p-8 sm:p-10">
              <div className="mb-8 overflow-hidden rounded-xl border border-[var(--border)] shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/home/candidate-proof.webp"
                  alt="Searching and applying to jobs on Hire Adda"
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover object-center"
                />
              </div>
              <h3 className="mb-2 text-2xl font-bold text-[var(--text)]">For Job Seekers</h3>
              <p className="mb-6 text-[var(--text-secondary)]">
                Everything you need to find and land your dream job
              </p>
              <ul className="mb-8 space-y-3">
                {candidateBenefits.map((b) => (
                  <li
                    key={b.text}
                    className="flex items-start gap-3 text-sm text-[var(--text-secondary)]"
                  >
                    <span className="bg-primary/10 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md">
                      <b.icon className="h-3 w-3" />
                    </span>
                    {b.text}
                  </li>
                ))}
              </ul>
              <Tooltip content="Sign up and find your dream job">
                <Link href="/auth/register/candidate">
                  <Button size="lg" rightIcon={<ArrowRight className="h-5 w-5" />}>
                    Start Your Job Search
                  </Button>
                </Link>
              </Tooltip>
            </div>

            {/* For Employers */}
            <div className="from-secondary-light rounded-2xl border border-[var(--border)] bg-gradient-to-br to-white p-8 sm:p-10">
              <div className="mb-8 overflow-hidden rounded-xl border border-[var(--border)] shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/home/employer-proof.webp"
                  alt="Searching candidates in the Hire Adda CV database"
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover object-center"
                />
              </div>
              <h3 className="mb-2 text-2xl font-bold text-[var(--text)]">For Employers</h3>
              <p className="mb-6 text-[var(--text-secondary)]">
                Powerful tools to find, evaluate, and hire the best talent
              </p>
              <ul className="mb-8 space-y-3">
                {employerBenefits.map((b) => (
                  <li
                    key={b.text}
                    className="flex items-start gap-3 text-sm text-[var(--text-secondary)]"
                  >
                    <span className="bg-secondary/10 text-secondary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md">
                      <b.icon className="h-3 w-3" />
                    </span>
                    {b.text}
                  </li>
                ))}
              </ul>
              <Tooltip content="Register as an employer and start hiring">
                <Link href="/auth/register/employer">
                  <Button
                    size="lg"
                    className="bg-secondary hover:bg-secondary-hover text-white"
                    rightIcon={<ArrowRight className="h-5 w-5" />}
                  >
                    Start Hiring Today
                  </Button>
                </Link>
              </Tooltip>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
                SECTION 6: Popular Job Categories (real counts)
            ================================================================ */}
      <section className="bg-[var(--bg-secondary)] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              By industry
            </span>
            <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Explore jobs by industry
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Browse opportunities across India&apos;s fastest-growing industries.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {jobCategories.map((cat) => {
              const count = getCategoryCount(cat.title, categoryCounts);
              return (
                <Link
                  key={cat.title}
                  href={`/jobs?${cat.query.replace(/=(.*)$/, (_, v) => `=${encodeURIComponent(v)}`)}`}
                  aria-label={`Browse ${cat.title} jobs`}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cat.image}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {/* Progressive blur — frosts the lower part of the photo, faded upward */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-2/5 backdrop-blur-md"
                    style={{
                      maskImage: 'linear-gradient(to top, black 40%, transparent)',
                      WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent)',
                    }}
                  />
                  {/* Dark gradient — anchors the text with a strong, legible base */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  {/* Icon chip */}
                  <div className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md">
                    <cat.icon className="h-5 w-5" />
                  </div>
                  {/* Title + CTA — light text on the frosted, darkened base */}
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="text-base font-bold tracking-tight text-white drop-shadow-sm sm:text-lg">
                      {cat.title}
                    </h3>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-white/90">
                      {count > 0
                        ? `${count} active ${count === 1 ? 'job' : 'jobs'}`
                        : 'Browse jobs'}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================
                SECTION 7: Testimonials (photo carousel — real headshots)
            ================================================================ */}
      <TestimonialCarousel
        variant="candidate"
        heading="What our users say"
        subheading="Real stories from job seekers and employers who found success on Hire Adda."
        testimonials={HOME_TESTIMONIALS}
        className="bg-white"
      />

      {/* ================================================================
                SECTION 8: Security & Trust
            ================================================================ */}
      <section className="bg-[var(--bg-secondary)] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: Text */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-light)] px-3 py-1 text-xs font-semibold text-[var(--success-dark)]">
                <Shield className="h-3.5 w-3.5" /> Enterprise-Grade Security
              </span>
              <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">
                Your Data is Safe With Us
              </h2>
              <p className="mt-4 text-lg text-[var(--text-secondary)]">
                Hire Adda is built with enterprise-level security from the ground up. We protect
                your personal information and career data with industry-leading practices.
              </p>
              {/* The security-points icon list is temporarily hidden — restore
                  together with the `securityPoints` const above. With it gone
                  this column is much shorter than the badge grid opposite, and
                  the row's `items-center` centres it vertically against them.
              <ul className="mt-8 space-y-4">
                {securityPoints.map((point) => (
                  <li key={point.title} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--success-light)]">
                      <point.icon className="h-4 w-4 text-[var(--success)]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--text)]">{point.title}</h3>
                      <p className="text-sm text-[var(--text-secondary)]">{point.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
              */}
            </div>

            {/* Right: Compliance & trust badges (real certifications) */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {trustBadges.map((badge) => (
                <div
                  key={badge.label}
                  className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-white p-5 text-center shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={badge.src}
                    alt={badge.label}
                    loading="lazy"
                    className="h-12 w-12 object-contain"
                  />
                  <div className="mt-3 text-sm font-semibold text-[var(--text)]">{badge.label}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">{badge.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
                SECTION 9: FAQ
            ================================================================ */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Got questions? We have answers. If you can&apos;t find what you&apos;re looking for,{' '}
              <Tooltip content="Go to contact page" inline>
                <Link href="/contact" className="text-primary underline underline-offset-2">
                  contact us
                </Link>
              </Tooltip>
              .
            </p>
          </div>
          <FaqAccordion faqs={faqs} />
        </div>
      </section>

      {/* ================================================================
                SECTION 10: Final CTA
            ================================================================ */}
      <section className="from-primary-dark via-primary to-accent relative overflow-hidden bg-gradient-to-br py-20 sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -right-20 -bottom-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,rgba(0,0,0,0.15))]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Take the Next Step?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
            Join thousands of professionals and companies who trust Hire Adda for smarter hiring and
            career growth.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Tooltip content="Sign up for a free Hire Adda account">
              <Link href="/auth/register/candidate">
                <Button
                  size="lg"
                  className="text-primary bg-white hover:bg-white/90"
                  rightIcon={<ArrowRight className="h-5 w-5" />}
                >
                  Create Free Account
                </Button>
              </Link>
            </Tooltip>
            <Tooltip content="Register as an employer and find top talent">
              <Link href="/auth/register/employer">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Hire Talent
                </Button>
              </Link>
            </Tooltip>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
