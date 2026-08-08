import Image from 'next/image';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import StatsSection from '@/components/common/StatsSection';
import PublicLayout from '@/components/layout/PublicLayout';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { aboutPageSchema, breadcrumbSchema, graph } from '@/lib/json-ld';
import {
  ArrowRight,
  // Award / Heart / Lightbulb were the Our Values card icons. That section is
  // now an editorial split whose glyphs are drawn inline in <ValuesCompass />,
  // so these are no longer referenced here.
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
// BrandIcon is only used by the temporarily-hidden team section — restore together.
// import BrandIcon from '@/components/common/BrandIcon';
import MissionVisual from '@/components/about/MissionVisual';
import ValuesCompass from '@/components/about/ValuesCompass';
import {
  EncryptionArt,
  InvoiceArt,
  PaymentMethodsArt,
  TrustPillarCard,
} from '@/components/about/trust-visuals';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildMetadata({
  title: 'About Us',
  description:
    'Learn about Hire Adda — our mission to connect talent with opportunity across India. Meet our team and discover our values.',
  keywords: ['about hire adda', 'job portal India', 'recruitment platform', 'our mission'],
  url: '/about',
});

// `tone`/`rule` are the numeral colour and hairline for the Our Values list,
// and they intentionally match the four badge colours in <ValuesCompass /> so
// the illustration and the list read as one system. Keep them in sync.
const values = [
  {
    tone: 'text-secondary',
    rule: 'bg-secondary',
    title: 'Innovation',
    description:
      'We continuously push the boundaries of recruitment technology, leveraging AI-powered matching and smart search to create better outcomes for candidates and employers alike.',
  },
  {
    tone: 'text-primary',
    rule: 'bg-primary',
    title: 'Trust',
    description:
      'Every company on our platform is verified, and every interaction is secured. We believe trust is the foundation of meaningful professional connections.',
  },
  {
    tone: 'text-accent',
    rule: 'bg-accent',
    title: 'Inclusion',
    description:
      'We are committed to building a platform where everyone has equal access to opportunities, regardless of background, gender, location, or experience level.',
  },
  {
    tone: 'text-emerald-500',
    rule: 'bg-emerald-500',
    title: 'Excellence',
    description:
      'From the quality of our job listings to the responsiveness of our support team, we strive for excellence in every aspect of the Hire Adda experience.',
  },
];

/*
 * Team — TEMPORARILY HIDDEN (placeholder people, no real team to show yet).
 * Data preserved for an easy restore alongside the "Meet Our Team" section.
const team = [
  {
    name: 'Arjun Mehta',
    role: 'Chief Executive Officer',
    bio: 'Former VP at Naukri.com with 15+ years in HR tech. Passionate about democratizing access to career opportunities across India.',
  },
  {
    name: 'Priya Sharma',
    role: 'Chief Technology Officer',
    bio: 'Ex-Google engineer with deep expertise in AI/ML and distributed systems. Leads the engineering team building the next generation of recruitment technology.',
  },
  {
    name: 'Rohan Kapoor',
    role: 'Head of Product',
    bio: 'Product leader with experience at LinkedIn and Flipkart. Obsessed with building intuitive, user-first experiences that solve real problems.',
  },
  {
    name: 'Ananya Reddy',
    role: 'Head of Design',
    bio: 'Award-winning designer who previously led design at Swiggy. Champions accessible, beautiful design that makes complex workflows feel effortless.',
  },
];
*/

// Platform capabilities shown in place of the team section — real, verifiable
// product differentiators (no placeholder people).
const pillars = [
  {
    icon: Sparkles,
    title: 'AI-powered matching',
    description:
      'Resume parsing and intelligent ranking surface the most relevant jobs for candidates and the strongest applicants for recruiters — automatically.',
    badge: 'from-blue-500 to-indigo-600',
    bar: 'bg-blue-500',
  },
  {
    icon: ShieldCheck,
    title: 'Verified employers',
    description:
      'GST-verified company profiles and clear trust signals mean candidates apply with confidence and genuine employers stand out.',
    badge: 'from-emerald-500 to-teal-600',
    bar: 'bg-emerald-500',
  },
  {
    icon: Search,
    title: 'Powerful search',
    description:
      'Lightning-fast, filter-rich search across jobs and talent puts the right match just a few keystrokes away.',
    badge: 'from-amber-500 to-orange-600',
    bar: 'bg-amber-500',
  },
  {
    icon: Zap,
    title: 'Real-time experience',
    description:
      'Instant notifications and live updates keep candidates and recruiters moving forward — no refreshing, no waiting.',
    badge: 'from-violet-500 to-purple-600',
    bar: 'bg-violet-500',
  },
];

const aboutJsonLd = graph(
  aboutPageSchema({
    url: '/about',
    name: 'About Hire Adda',
    description:
      'Learn about Hire Adda — our mission to connect talent with opportunity across India. Meet our team and discover our values.',
    speakableCssSelectors: ['h1', '.subtitle'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'About', url: '/about' },
  ]),
);

export default function AboutPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-about" data={aboutJsonLd} />
      {/* Hero Section */}
      <section className="bg-primary-50 under-public-header relative overflow-hidden">
        {/* Background — a candid workplace photograph, composed 3:1 with bright,
            airy negative space across the left ~45% so the headline sits on
            near-white and the group reads on the right.

            CROP BUDGET (why the art is composed the way it is): the section has
            no fixed height — it is sized by its own padding — so `object-cover`
            crops differently per breakpoint. At ~1440 the slot is ~4.1:1 against
            a 3:1 source, so the top and bottom ~13% are cut and only the middle
            ~73% survives; every face sits inside that band. Below `sm` the slot
            is ~1.27:1, so only the middle ~42% of the width survives, which is
            why the flat white scrim below turns the art into ambient texture
            there rather than something you are meant to read. Keep any
            replacement at 3:1 with the subject right-of-centre and clear of the
            vertical extremes. */}
        <Image
          src="/images/about-hero.jpg"
          alt="Four colleagues gathered around a laptop in a bright, sunlit office, smiling as they look at the screen together"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Legibility scrims: (1) a left→right white wash so the headline on
            the left stays crisp while the group on the right shows through —
            note it is still ~85% white at the halfway point, so the photo only
            truly reads across the right third; (2) a flatter white wash on
            mobile only, where the art crops tighter behind the full-width
            text. */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent" />
        <div className="absolute inset-0 bg-white/55 sm:bg-transparent" />
        {/* Top scrim for the overlaying header. At scroll-top the public
            header is transparent and sits over this photograph; the left→right
            wash above only protects the left side, so the nav links and auth
            buttons on the right would land on raw image. This 80px veil keeps
            the whole bar legible and stops exactly where the header ends, so
            the composition below it is untouched. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white via-white/75 to-transparent"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="max-w-xl">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              About <span className="text-primary">Hire Adda</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-[var(--text-secondary)]">
              We are on a mission to transform how India hires. By bridging the gap between
              exceptional talent and forward-thinking companies, we are building a future where
              every professional finds work that matters.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">Our Mission</h2>
              <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)]">
                At Hire Adda, we believe that the right job can change a life, and the right hire
                can transform a business. Our mission is to connect talent with opportunity across
                India, making the recruitment process smarter, faster, and more equitable for
                everyone involved.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-[var(--text-secondary)]">
                Founded in 2026, we set out to solve the inefficiencies that plague traditional
                hiring. From AI-powered job matching to verified employer profiles, every feature we
                build is designed to create meaningful connections between candidates and companies.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-[var(--text-secondary)]">
                Whether you are a fresh graduate looking for your first opportunity or a seasoned
                professional seeking your next challenge, Hire Adda is here to help you take the
                next step in your career journey.
              </p>
            </div>
            {/*
              Founder quote card — TEMPORARILY HIDDEN. Restore this block (and
              remove <MissionVisual />) once we have a real founder name/quote.
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 sm:p-12">
              <blockquote className="text-lg leading-relaxed text-[var(--text-secondary)] italic">
                &ldquo;We envision an India where geography, background, and connections no longer
                determine career outcomes. Hire Adda exists to level the playing field and let merit
                shine.&rdquo;
              </blockquote>
              <div className="mt-6">
                <p className="font-semibold text-[var(--text)]">Arjun Mehta</p>
                <p className="text-sm text-[var(--text-muted)]">CEO & Co-Founder, Hire Adda</p>
              </div>
            </div>
            */}
            <MissionVisual />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-secondary)] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Our Impact in Numbers
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Growing every day as more professionals and companies trust Hire Adda
            </p>
          </div>
          <StatsSection variant="card" />
        </div>
      </section>

      {/* Trust & Security — copy + 3 pillars only. The payment-
          methods row and trust-badges row were removed because
          they already render in the site-wide footer, so showing
          them again here was duplicate chrome on a page users
          will usually scroll all the way through. */}
      <section className="from-primary-50 relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Trust &amp; Security
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Built for India, regulated and audited the way enterprise software should be. Every
              payment runs on Razorpay&apos;s PCI-DSS Level 1 infrastructure — we never see or store
              your card details.
            </p>
          </div>

          {/* Three pillars — each carries a bespoke inline SVG depicting the
              specific claim it makes (see components/about/trust-visuals). */}
          <div className="mb-12 grid gap-6 sm:grid-cols-3">
            <TrustPillarCard tone="primary" title="Bank-grade encryption" art={<EncryptionArt />}>
              256-bit TLS on every request. Card data is tokenised by Razorpay; Hire Adda stores
              only the last four digits and never your CVV or expiry.
            </TrustPillarCard>
            <TrustPillarCard tone="emerald" title="GST-compliant invoicing" art={<InvoiceArt />}>
              FY-aware sequential GST invoices on every order, with CGST/SGST/IGST splits and
              downloadable PDFs — claim full input-tax-credit without any chase.
            </TrustPillarCard>
            <TrustPillarCard tone="amber" title="Every payment method" art={<PaymentMethodsArt />}>
              Cards (Visa / Mastercard / Amex / RuPay), UPI, all major Net Banking, top wallets and
              EMI — pick whatever works on your day.
            </TrustPillarCard>
          </div>
        </div>
      </section>

      {/* Values Section — DELIBERATELY NOT A CARD GRID. The sections directly
          above (Trust & Security) and below (Built for how India hires) are
          both card grids, and three in a row read as one long undifferentiated
          block. This one is an editorial split instead: a single compass
          composition beside an unboxed numbered list, with a left-aligned
          heading where every neighbouring section centres its own. */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              What we stand for
            </span>
            <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">Our Values</h2>
            <p className="mt-4 text-lg text-[var(--text-secondary)]">
              The principles that guide everything we do at Hire Adda
            </p>
          </div>

          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex justify-center lg:justify-start">
              <ValuesCompass />
            </div>

            {/* Hairline-separated list — no borders, no boxes. */}
            <ol className="divide-y divide-[var(--border)]">
              {values.map((value, i) => (
                <li key={value.title} className="group flex gap-5 py-6 first:pt-0 last:pb-0">
                  <span
                    className={`w-8 shrink-0 text-2xl font-bold tabular-nums transition-opacity ${value.tone} opacity-45 group-hover:opacity-100`}
                    aria-hidden="true"
                  >
                    {`0${i + 1}`}
                  </span>
                  <span
                    className={`w-px shrink-0 self-stretch ${value.rule} opacity-30 transition-opacity group-hover:opacity-100`}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text)]">{value.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {value.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/*
        Team section ("Meet Our Team") — TEMPORARILY HIDDEN (placeholder people).
        The `team` data is preserved (commented) near the top of this file, and
        the markup is restorable from git history. Replaced with the platform
        capabilities section below, which shows real, verifiable differentiators.
      */}
      <section className="bg-[var(--bg-secondary)] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Why Hire Adda
            </span>
            <h2 className="mt-4 text-3xl font-bold text-[var(--text)] sm:text-4xl">
              Built for how India hires
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
              Every feature is engineered to make hiring faster, fairer, and more transparent — for
              candidates and companies alike.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
                >
                  {/* Top accent bar — wipes in on hover */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${pillar.bar}`}
                  />
                  {/* Gradient icon badge */}
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-300 group-hover:scale-110 ${pillar.badge}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[var(--text)]">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {pillar.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Join Our Growing Community</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
            Be part of India&apos;s fastest-growing talent platform. Whether you are looking for
            your next role or your next hire, Hire Adda is the place to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Tooltip content="Create your free Hire Adda account">
              <Link href="/auth/register">
                <Button
                  size="lg"
                  className="text-primary bg-white hover:bg-white/90"
                  rightIcon={<ArrowRight className="h-5 w-5" />}
                >
                  Get Started Free
                </Button>
              </Link>
            </Tooltip>
            <Tooltip content="Get in touch with our team">
              <Link href="/contact">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Contact Us
                </Button>
              </Link>
            </Tooltip>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom-of-content placement (above site footer)
          for consistency. Schema already in the page's JSON-LD graph. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'About' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
