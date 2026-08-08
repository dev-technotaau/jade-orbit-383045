import Breadcrumbs from '@/components/common/Breadcrumbs';
import PublicLayout from '@/components/layout/PublicLayout';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import Tooltip from '@/components/ui/Tooltip';
import {
  breadcrumbSchema,
  graph,
  itemListSchema,
  siteNavigationSchema,
  webPageSchema,
} from '@/lib/json-ld';
import {
  Briefcase,
  Building2,
  FileText,
  Gauge,
  Globe,
  Home,
  Info,
  KeyRound,
  LifeBuoy,
  Lock,
  LogIn,
  Mail,
  Map,
  Newspaper,
  Radio,
  Rss,
  Scale,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Users,
  UserPlus,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildMetadata({
  title: 'Site Map',
  description:
    'Complete site map of Hire Adda — every public page on the site in one place. Browse jobs, companies, reviews, vendors, pricing, legal pages, feeds, and crawler resources.',
  keywords: ['hire adda site map', 'sitemap', 'all pages', 'site index', 'navigation'],
  url: '/site-map',
});

type LinkItem = {
  label: string;
  href: string;
  description: string;
  external?: boolean;
  badge?: 'private' | 'raw' | 'pattern';
};

type Section = {
  icon: typeof Home;
  title: string;
  accent: string;
  description: string;
  links: LinkItem[];
};

const SECTIONS: Section[] = [
  {
    icon: Home,
    title: 'Main',
    accent: 'text-primary bg-primary-light',
    description: 'Core public pages — what the site is and how to reach us.',
    links: [
      { label: 'Home', href: '/', description: 'Landing page and search entry' },
      { label: 'About', href: '/about', description: 'Mission, story, team and values' },
      { label: 'Contact', href: '/contact', description: 'Reach the support team' },
      { label: 'Help & FAQ', href: '/help', description: 'Answers to common questions' },
    ],
  },
  {
    icon: Search,
    title: 'Browse Jobs',
    accent: 'text-primary bg-primary-light',
    description:
      'Public job board surfaces — open to guests and authenticated candidates alike. Curated landings rank well for "{role} jobs in {city}" queries.',
    links: [
      { label: 'All Jobs', href: '/jobs', description: 'Public job board with filters and search' },
      {
        label: 'Jobs by City',
        href: '/jobs/in/bangalore',
        description: 'Pattern: /jobs/in/{city} — e.g. /jobs/in/bangalore, /jobs/in/delhi',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Role + City',
        href: '/jobs/software-developer-jobs-in-noida',
        description: 'Pattern: /jobs/{role}-jobs-in-{city} — long-tail SEO landings',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Role + Experience',
        href: '/jobs/data-scientist-jobs-5-years-experience',
        description: 'Pattern: /jobs/{role}-jobs-{n}-years-experience',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Category',
        href: '/jobs/category/it-software',
        description: 'Pattern: /jobs/category/{kebab}',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Department',
        href: '/jobs/department/sales',
        description: 'Pattern: /jobs/department/{kebab}',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Qualification',
        href: '/jobs/qualification/btech',
        description: 'Pattern: /jobs/qualification/{kebab}',
        badge: 'pattern',
      },
      {
        label: 'Jobs by Collection',
        href: '/jobs/collection/remote-india-jobs',
        description: 'Pattern: /jobs/collection/{kebab} — curated thematic sets',
        badge: 'pattern',
      },
    ],
  },
  {
    icon: Building2,
    title: 'Browse Companies',
    accent: 'text-secondary bg-secondary-light',
    description:
      'Public company directory — verified employers with open jobs, reviews, and culture pages.',
    links: [
      {
        label: 'All Companies',
        href: '/companies',
        description: 'Public verified-employer index with industry + city filters',
      },
      {
        label: 'Company Profile',
        href: '/companies/example-company',
        description: 'Pattern: /companies/{slug} — full profile + jobs + reviews',
        badge: 'pattern',
      },
      {
        label: 'Companies by City',
        href: '/companies/in/bangalore',
        description: 'Pattern: /companies/in/{city} — geo-segmented company landings',
        badge: 'pattern',
      },
      {
        label: 'Companies by Industry',
        href: '/companies/industry/saas',
        description: 'Pattern: /companies/industry/{kebab} — industry-segmented landings',
        badge: 'pattern',
      },
      {
        label: 'Companies by Category',
        href: '/companies/category/unicorn',
        description: 'Pattern: /companies/category/{kebab} — curated industry segments',
        badge: 'pattern',
      },
      {
        label: 'Companies by Collection',
        href: '/companies/collection/featured',
        description: 'Pattern: /companies/collection/{kebab} — curated company sets',
        badge: 'pattern',
      },
      {
        label: 'Legacy Company Profile',
        href: '/company/abc123',
        description:
          'Pattern: /company/{id} — pre-slug fallback that adapts to auth state. Public-readable.',
        badge: 'pattern',
      },
    ],
  },
  {
    icon: Star,
    title: 'Reviews & Ratings',
    accent: 'text-warning bg-warning-light',
    description:
      'Anonymous-friendly company reviews. Anyone can rate (single submission per company per user / fingerprint).',
    links: [
      {
        label: 'Company Reviews Page',
        href: '/companies/example-company/reviews',
        description:
          'Pattern: /companies/{slug}/reviews — overall rating, criteria, demographics, filters',
        badge: 'pattern',
      },
      {
        label: 'Write a Review',
        href: '/reviews/write',
        description: 'Standalone form — search any Hire Adda company and rate it',
      },
      {
        label: 'Write Review for Company',
        href: '/companies/example-company/reviews/write',
        description: 'Pattern: /companies/{slug}/reviews/write — pre-filled by slug',
        badge: 'pattern',
      },
    ],
  },
  {
    icon: Globe,
    title: 'Vendors / Recruitment Agencies',
    accent: 'text-info bg-info-light',
    description:
      'Public vendor directory + per-vendor profile pages. Listings come from employers with the Vendor Connect add-on; their tools live in the employer dashboard.',
    links: [
      {
        label: 'Browse Vendors',
        href: '/vendors',
        description: 'Public directory of recruitment agencies and consultancies',
      },
      {
        label: 'Vendor Profile',
        href: '/vendors/example-agency',
        description: 'Pattern: /vendors/{slug} — agency profile with industries + leads',
        badge: 'pattern',
      },
    ],
  },
  {
    icon: Tag,
    title: 'Pricing & Plans',
    accent: 'text-primary bg-primary-light',
    description:
      'All plans for employers and candidates — including the Vendor Connect employer add-on. Start free or pick the plan that fits your stage.',
    links: [
      {
        label: 'All Plans',
        href: '/pricing',
        description: 'Side-by-side comparison across every audience',
      },
      {
        label: 'Employer Pricing',
        href: '/pricing/employer',
        description: 'Job posts, CV database, enterprise & assisted hiring',
      },
      {
        label: 'Candidate Pricing',
        href: '/pricing/candidate',
        description: 'Premium profile, verified badge & top visibility',
      },
      {
        label: 'Per-plan Detail',
        href: '/pricing/employer-standard',
        description: 'Pattern: /pricing/{slug} — full feature breakdown + offer',
        badge: 'pattern',
      },
      {
        label: 'Enterprise Quote — Contact Sales',
        href: '/billing/quote',
        description:
          'Custom CV access plans for 1000+ unlocks, multi-user seats and dedicated support — 24h response',
      },
    ],
  },
  {
    icon: LogIn,
    title: 'Get Started',
    accent: 'text-success bg-success-light',
    description: 'Sign in or create an account to unlock the platform.',
    links: [
      { label: 'Login (chooser)', href: '/auth/login', description: 'Pick your role' },
      { label: 'Candidate Login', href: '/auth/login/candidate', description: 'Job seekers' },
      { label: 'Employer Login', href: '/auth/login/employer', description: 'Companies hiring' },
      {
        label: 'Register (chooser)',
        href: '/auth/register',
        description: 'Pick your role',
      },
      {
        label: 'Candidate Register',
        href: '/auth/register/candidate',
        description: 'New job seekers',
      },
      {
        label: 'Employer Register',
        href: '/auth/register/employer',
        description: 'Companies hiring',
      },
      {
        label: 'Forgot Password',
        href: '/auth/forgot-password',
        description: 'Reset via email link',
      },
    ],
  },
  {
    icon: Users,
    title: 'For Candidates',
    accent: 'text-secondary bg-secondary-light',
    description:
      'Features available once you sign in as a candidate. All links redirect to login if you are not yet authenticated.',
    links: [
      {
        label: 'Candidate Dashboard',
        href: '/candidate',
        description: 'Overview of applications, saved jobs and recommendations',
        badge: 'private',
      },
      {
        label: 'Job Search',
        href: '/candidate/jobs',
        description: 'Find and apply to jobs with smart filters',
        badge: 'private',
      },
      {
        label: 'Profile',
        href: '/candidate/profile',
        description: 'Edit your professional profile and resume',
        badge: 'private',
      },
      {
        label: 'Applications',
        href: '/candidate/applications',
        description: 'Track submitted applications and their status',
        badge: 'private',
      },
      {
        label: 'Following',
        href: '/candidate/following',
        description: 'Companies you follow — new-job alerts + activity feed',
        badge: 'private',
      },
      {
        label: 'My Reviews',
        href: '/candidate/reviews',
        description: 'Your submitted reviews + moderation status',
        badge: 'private',
      },
      {
        label: 'Recommendations',
        href: '/candidate/recommendations',
        description: 'AI-matched job recommendations',
        badge: 'private',
      },
      {
        label: 'Job Alerts',
        href: '/candidate/job-alerts',
        description: 'Saved searches with email/push notifications',
        badge: 'private',
      },
      {
        label: 'Verification',
        href: '/candidate/verification',
        description: 'Document + employment verification',
        badge: 'private',
      },
    ],
  },
  {
    icon: Briefcase,
    title: 'For Employers',
    accent: 'text-accent bg-accent-light',
    description:
      'Features available once you sign in as an employer. All links redirect to login if you are not yet authenticated.',
    links: [
      {
        label: 'Employer Dashboard',
        href: '/employer',
        description: 'Overview of jobs, applicants and team',
        badge: 'private',
      },
      {
        label: 'Post a Job',
        href: '/employer/jobs/new',
        description: 'Create a new job listing',
        badge: 'private',
      },
      {
        label: 'My Jobs',
        href: '/employer/jobs',
        description: 'Manage your active and closed job posts',
        badge: 'private',
      },
      {
        label: 'Candidates',
        href: '/employer/candidates',
        description: 'Shortlist and review applicants',
        badge: 'private',
      },
      {
        label: 'Company Profile',
        href: '/employer/profile',
        description: 'Edit your company page',
        badge: 'private',
      },
      {
        label: 'Followers',
        href: '/employer/followers',
        description: 'Candidates following your company',
        badge: 'private',
      },
      {
        label: 'Reviews',
        href: '/employer/reviews',
        description: 'Track reviews on your company + KPI dashboard',
        badge: 'private',
      },
      {
        label: 'Team',
        href: '/employer/team',
        description: 'Multi-seat employer team management',
        badge: 'private',
      },
      {
        label: 'Vendor Connect Hub',
        href: '/employer/vendor',
        description: 'Vendor Connect add-on home — leads, profile and job board',
        badge: 'private',
      },
      {
        label: 'Vendor Hiring Job Board',
        href: '/employer/vendor/jobs',
        description: 'Browse hiring requirements posted by other employers',
        badge: 'private',
      },
      {
        label: 'Vendor Lead Inbox',
        href: '/employer/vendor/leads',
        description: 'Hiring requirements routed to your agency',
        badge: 'private',
      },
      {
        label: 'Vendor Profile',
        href: '/employer/vendor/profile',
        description: 'Edit your agency page shown in the public directory',
        badge: 'private',
      },
    ],
  },
  {
    icon: Scale,
    title: 'Legal & Policies',
    accent: 'text-info bg-info-light',
    description: 'Terms that govern your use of Hire Adda and explain how we handle your data.',
    links: [
      {
        label: 'Privacy Policy',
        href: '/privacy',
        description: 'How we collect, use and protect your data',
      },
      { label: 'Terms of Service', href: '/terms', description: 'Rules of the road' },
      {
        label: 'Cookie Policy',
        href: '/cookie-policy',
        description: 'What cookies we use and why',
      },
      {
        label: 'Refund Policy',
        href: '/refund-policy',
        description: 'When and how refunds are issued',
      },
      {
        label: 'Accessibility',
        href: '/accessibility',
        description: 'Our commitment to WCAG 2.1 AA',
      },
      {
        label: 'Disclaimer',
        href: '/disclaimer',
        description: 'Limitations of content and liability',
      },
    ],
  },
  {
    icon: Rss,
    title: 'Feeds & Subscriptions',
    accent: 'text-primary bg-primary-light',
    description:
      'Machine-readable feeds of the latest 100 public jobs in three formats — pick whichever your reader supports.',
    links: [
      {
        label: 'RSS 2.0 Feed',
        href: '/feed.xml',
        description: 'Latest 100 jobs in RSS 2.0',
        badge: 'raw',
      },
      {
        label: 'Atom 1.0 Feed',
        href: '/feed.atom',
        description: 'Latest 100 jobs in Atom 1.0 (newer reader spec)',
        badge: 'raw',
      },
      {
        label: 'JSON Feed v1.1',
        href: '/feed.json',
        description: 'Latest 100 jobs in JSON Feed (machine-friendly for AI agents)',
        badge: 'raw',
      },
    ],
  },
  {
    icon: Newspaper,
    title: 'Sitemaps & SEO',
    accent: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
    description: 'XML sitemaps for search engine discovery — sharded by content type.',
    links: [
      {
        label: 'Sitemap Index',
        href: '/sitemap.xml',
        description: 'Top-level sitemap that references all shards',
        badge: 'raw',
      },
      {
        label: 'Google News Sitemap',
        href: '/sitemap-news.xml',
        description: 'Google News-eligible content (≤48h old)',
        badge: 'raw',
      },
      {
        label: 'robots.txt',
        href: '/robots.txt',
        description: 'Crawler policy with per-agent rules + AI bot disallows',
        badge: 'raw',
      },
      {
        label: 'OpenSearch Description',
        href: '/opensearch.xml',
        description: 'Add Hire Adda as a browser search engine',
        badge: 'raw',
      },
    ],
  },
  {
    icon: Radio,
    title: 'AI & LLM Resources',
    accent: 'text-info bg-info-light',
    description:
      'Policy + content guidance for AI engines (ChatGPT search, Claude, Perplexity, Gemini, etc.).',
    links: [
      {
        label: 'llms.txt — short policy',
        href: '/llms.txt',
        description: 'High-level overview of public surfaces + AI ingest policy',
        badge: 'raw',
      },
      {
        label: 'llms-full.txt — deep manifest',
        href: '/llms-full.txt',
        description: 'Every public URL family + every JSON-LD schema in rotation',
        badge: 'raw',
      },
      {
        label: 'ai.txt — training opt-out',
        href: '/ai.txt',
        description: 'Spawning.ai-format training-data policy',
        badge: 'raw',
      },
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Well-Known Files',
    accent: 'text-success bg-success-light',
    description: 'RFC 8615 well-known files for security, privacy, and platform integrations.',
    links: [
      {
        label: 'Security Policy',
        href: '/.well-known/security.txt',
        description: 'How to report a vulnerability',
        badge: 'raw',
      },
      {
        label: 'Change Password',
        href: '/.well-known/change-password',
        description: 'RFC 8615 — password-manager redirect',
        badge: 'raw',
      },
      {
        label: 'MTA-STS Policy',
        href: '/.well-known/mta-sts.txt',
        description: 'Email transport security policy',
        badge: 'raw',
      },
      {
        label: 'Global Privacy Control',
        href: '/.well-known/gpc.json',
        description: 'CCPA / CPRA / VCDPA compliance signal',
        badge: 'raw',
      },
      {
        label: 'DNT Policy',
        href: '/.well-known/dnt-policy.txt',
        description: 'EFF Do-Not-Track policy v1.0',
        badge: 'raw',
      },
      {
        label: 'Traffic Advice',
        href: '/.well-known/traffic-advice',
        description: 'Private prefetch proxy directives',
        badge: 'raw',
      },
      {
        label: 'Apple Universal Links',
        href: '/.well-known/apple-app-site-association',
        description: 'iOS deep-link configuration',
        badge: 'raw',
      },
      {
        label: 'Android App Links',
        href: '/.well-known/assetlinks.json',
        description: 'Android Digital Asset Links',
        badge: 'raw',
      },
    ],
  },
  {
    icon: Settings2,
    title: 'Developer & Platform Resources',
    accent: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]',
    description:
      'Additional machine-readable files for engineers, search engines, and PWA tooling.',
    links: [
      {
        label: 'humans.txt',
        href: '/humans.txt',
        description: 'Team and technology credits',
        badge: 'raw',
      },
      {
        label: 'ads.txt',
        href: '/ads.txt',
        description: 'IAB Authorized Digital Sellers declaration',
        badge: 'raw',
      },
      {
        label: 'carbon.txt',
        href: '/carbon.txt',
        description: 'Sustainability disclosure (carbontxt.org)',
        badge: 'raw',
      },
      {
        label: 'PWA Manifest',
        href: '/manifest.webmanifest',
        description: 'Install Hire Adda as a Progressive Web App',
        badge: 'raw',
      },
    ],
  },
];

const BADGE_STYLES: Record<NonNullable<LinkItem['badge']>, { label: string; className: string }> = {
  private: {
    label: 'Login required',
    className: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  },
  raw: {
    label: 'Raw file',
    className: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
  },
  pattern: {
    label: 'URL pattern',
    className: 'bg-[var(--info-light)] text-[var(--info-dark)]',
  },
};

function totalLinkCount(): number {
  return SECTIONS.reduce((n, s) => n + s.links.length, 0);
}

export default function SitemapPage() {
  const totalLinks = totalLinkCount();

  // Build the JSON-LD graph: WebPage + Breadcrumb + SiteNavigationElement
  // for every link + a top-level ItemList that mirrors the visible sections.
  // Search engines extract SiteNavigationElement entries to power "sitelinks"
  // and ItemList entries for richer SERP previews.
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Site Map', url: '/site-map' },
  ]);
  const allLinkItems = SECTIONS.flatMap((s) =>
    s.links
      .filter((l) => l.badge !== 'pattern' && l.badge !== 'private')
      .map((l) => ({ name: l.label, url: l.href, description: l.description })),
  );
  const navSchema = siteNavigationSchema(allLinkItems.map((l) => ({ name: l.name, url: l.url })));
  const itemList = itemListSchema({
    url: '/site-map',
    name: 'Hire Adda — Complete site map',
    items: allLinkItems,
    itemListOrder: 'Unordered',
  });

  const sitemapJsonLd = graph(
    webPageSchema({
      url: '/site-map',
      name: 'Site Map — Hire Adda',
      description:
        'Complete site map of Hire Adda — every public page, account entry point, feed, well-known file, and crawler resource.',
      breadcrumb,
      speakableCssSelectors: ['h1', '[data-speakable]'],
    }),
    breadcrumb,
    navSchema,
    itemList,
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-sitemap" data={sitemapJsonLd} />

      {/* Hero */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="bg-primary-light mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl">
              <Map className="text-primary h-7 w-7" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl lg:text-6xl">
              Site <span className="text-primary">Map</span>
            </h1>
            <p
              data-speakable="true"
              className="mx-auto mt-6 max-w-2xl text-lg text-[var(--text-secondary)] sm:text-xl"
            >
              Every page on Hire Adda, organised in one place. {totalLinks} destinations across{' '}
              {SECTIONS.length} categories — public pages, role-specific dashboards, feeds, AI
              policy files, well-known endpoints, and crawler resources.
            </p>
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              For machine-readable discovery, see the{' '}
              <Link href="/sitemap.xml" className="text-primary underline">
                XML sitemap index
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
              >
                <div className="mb-4 flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${section.accent}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[var(--text)] sm:text-2xl">
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{section.description}</p>
                  </div>
                </div>

                <ul className="mt-4 space-y-2">
                  {section.links.map((link) => {
                    const badge = link.badge ? BADGE_STYLES[link.badge] : null;
                    const LinkIcon = pickLinkIcon(link.label);
                    const linkContent = (
                      <>
                        <LinkIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[var(--text)] group-hover:text-[var(--primary)]">
                              {link.label}
                            </span>
                            {badge && (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                            {link.description}
                          </span>
                        </span>
                      </>
                    );

                    return (
                      <li key={link.href}>
                        <Tooltip content={`Open ${link.label}`}>
                          <Link
                            href={link.href}
                            className="group flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
                            {...(link.external
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : {})}
                          >
                            {linkContent}
                          </Link>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-12 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center text-sm text-[var(--text-muted)] sm:p-8">
          <p>
            Looking for something you can&apos;t find?{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              Get in touch
            </Link>{' '}
            or explore our{' '}
            <Link href="/help" className="text-primary underline underline-offset-2">
              Help Center
            </Link>
            . Search engines: see{' '}
            <Link href="/sitemap.xml" className="text-primary underline underline-offset-2">
              /sitemap.xml
            </Link>{' '}
            and{' '}
            <Link href="/robots.txt" className="text-primary underline underline-offset-2">
              /robots.txt
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Site Map' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}

/**
 * Pick a small icon by label heuristic — keeps the markup visually varied
 * without hand-assigning an icon to every single link.
 */
function pickLinkIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('dashboard')) return Gauge;
  if (l.includes('login') || l.includes('password')) return KeyRound;
  if (l.includes('register')) return UserPlus;
  if (l.includes('profile')) return Users;
  if (l.includes('contact') || l.includes('mail')) return Mail;
  if (l.includes('help') || l.includes('support')) return LifeBuoy;
  if (l.includes('home')) return Home;
  if (l.includes('about')) return Info;
  if (l.includes('job')) return Briefcase;
  if (l.includes('compan')) return Building2;
  if (l.includes('vendor')) return Globe;
  if (l.includes('review') || l.includes('rating')) return Star;
  if (l.includes('feed') || l.includes('rss') || l.includes('atom') || l.includes('json'))
    return Rss;
  if (l.includes('news') || l.includes('sitemap')) return Newspaper;
  if (l.includes('llm') || l.includes('ai.txt') || l.includes('llms')) return Radio;
  if (
    l.includes('privacy') ||
    l.includes('security') ||
    l.includes('mta') ||
    l.includes('well-known') ||
    l.includes('gpc') ||
    l.includes('dnt')
  )
    return Lock;
  if (l.includes('terms') || l.includes('policy') || l.includes('disclaimer')) return ScrollText;
  if (l.includes('manifest') || l.includes('opensearch') || l.includes('robots')) return Settings2;
  if (l.includes('sparkle') || l.includes('ai')) return Sparkles;
  return FileText;
}
