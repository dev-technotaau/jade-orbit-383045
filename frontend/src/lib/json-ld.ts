/**
 * JSON-LD structured-data builders for Hire Adda.
 *
 * Outputs schema.org markup that every major search/answer engine
 * consumes:
 *   - Google — rich results (knowledge panel, sitelinks search box,
 *     breadcrumbs, FAQ, Jobs, organization cards, video carousels)
 *   - Bing — knowledge cards, FAQ, job listings
 *   - Yandex — organization + event snippets
 *   - DuckDuckGo — uses the same structured data indirectly
 *   - Voice assistants (Alexa, Google Assistant) — Speakable blocks
 *   - AI engines (Perplexity, ChatGPT, Claude) — entity graph extraction
 *
 * Every builder returns a plain JSON-serialisable object ready to be
 * inserted into a `<script type="application/ld+json">` block via the
 * `JsonLd` component.
 *
 * Design rules:
 *   - Keep schemas minimal + accurate. Google penalises inaccurate markup
 *     by suppressing the rich result entirely.
 *   - Only include fields whose value is genuinely present and public.
 *   - Use `@id` anchors so entities on the same page cross-reference
 *     (e.g. JobPosting.hiringOrganization → Organization @id).
 *   - Prefer typed builders over hand-authored JSON to prevent drift.
 *
 * @see https://schema.org/
 * @see https://developers.google.com/search/docs/appearance/structured-data
 * @see https://schema.org/docs/full.html — full type hierarchy
 */

import { OG_IMAGE_VARIANTS } from '@/constants/og-images';

// ═══════════════════════════════════════════════════════════════════════
// 0.  Core constants + types
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

/** Canonical entity IDs — referenced across schemas for graph continuity. */
export const ORGANIZATION_ID = `${BASE_URL}/#organization`;
export const WEBSITE_ID = `${BASE_URL}/#website`;
export const SOFTWARE_APP_ID = `${BASE_URL}/#software`;

type JsonLd = Record<string, unknown>;

interface Named {
  name: string;
  url: string;
}

/** Resolve a relative path to absolute; leave absolute URLs untouched. */
function abs(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 1.  Organization — canonical brand identity
// ═══════════════════════════════════════════════════════════════════════

/**
 * Organization schema for Hire Adda itself.
 *
 * Powers Google's knowledge panel on brand search ("Hire Adda") and drives
 * logo/site-name attribution across SERP.
 *
 * Emits the full OG image variant set so Google can pick the aspect ratio
 * that fits each rich-result surface (wide for articles, square for mobile
 * cards, tall for Discover feed).
 */
export function organizationSchema(): JsonLd {
  const imageObjects = OG_IMAGE_VARIANTS.map((v) => ({
    '@type': 'ImageObject',
    url: abs(v.url),
    width: v.width,
    height: v.height,
    caption: v.alt,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Hire Adda',
    legalName: 'Opportunity Makers Group',
    alternateName: ['HireAdda', 'Hire-Adda', 'hireadda.in'],
    url: BASE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${BASE_URL}/icons/logo.png`,
      width: 512,
      height: 512,
      caption: 'Hire Adda logo',
      contentUrl: `${BASE_URL}/icons/logo.png`,
    },
    image: imageObjects,
    slogan: 'Where Talent Meets Opportunity',
    description:
      "India's leading job portal and recruitment platform. Find top jobs, hire the best talent, and build your career with Hire Adda.",
    foundingDate: '2024',
    knowsAbout: [
      'Job Search',
      'Recruitment',
      'Hiring',
      'Career Development',
      'Talent Acquisition',
      'Human Resources',
      'Employment',
      'Workforce',
    ],
    areaServed: {
      '@type': 'Country',
      name: 'India',
      '@id': 'https://en.wikipedia.org/wiki/India',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Tricity Plaza, Peer Muchalla',
      addressLocality: 'Chandigarh',
      addressRegion: 'Chandigarh',
      postalCode: '160104',
      addressCountry: 'IN',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@hireadda.in',
        telephone: '+91-1762469136',
        url: `${BASE_URL}/contact`,
        areaServed: 'IN',
        availableLanguage: ['English', 'Hindi'],
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '18:00',
        },
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'billing@hireadda.in',
        // Public structured data → shared toll-free number. The dedicated
        // employer helpline is surfaced only inside the signed-in dashboard.
        telephone: '+91-1762469136',
        url: `${BASE_URL}/pricing/employer`,
        areaServed: 'IN',
        availableLanguage: ['English', 'Hindi'],
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          opens: '09:00',
          closes: '18:00',
        },
      },
      {
        '@type': 'ContactPoint',
        contactType: 'security',
        email: 'security@hireadda.in',
        areaServed: 'IN',
        availableLanguage: 'English',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'privacy',
        email: 'privacy@hireadda.in',
        areaServed: 'IN',
        availableLanguage: 'English',
      },
      {
        // WhatsApp support channel — surfaced on plans that include
        // WhatsApp/priority support. The `contactOption: 'TollFree'` +
        // wa.me URL pattern signals to Google that this is a chat channel,
        // not a voice line.
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: '+91-8054050551',
        url: 'https://wa.me/918054050551',
        areaServed: 'IN',
        availableLanguage: ['English', 'Hindi'],
        contactOption: 'WhatsApp',
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          opens: '09:00',
          closes: '21:00',
        },
      },
    ],
    sameAs: [
      // Populate when social profiles go live — drives "Profiles" card in SERP.
      // 'https://www.linkedin.com/company/hireadda',
      // 'https://twitter.com/hireadda',
      // 'https://www.facebook.com/hireadda',
      // 'https://www.instagram.com/hireadda',
      // 'https://www.youtube.com/@hireadda',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 2.  WebSite — sitelinks search box + publisher graph
// ═══════════════════════════════════════════════════════════════════════

/**
 * WebSite schema with SearchAction — the engine behind Google's "Sitelinks
 * Search Box" (in-SERP search input under the brand result).
 */
export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: BASE_URL,
    name: 'Hire Adda',
    alternateName: 'HireAdda',
    description: "India's leading job portal and recruitment platform.",
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-IN',
    copyrightYear: new Date().getFullYear(),
    copyrightHolder: { '@id': ORGANIZATION_ID },
    potentialAction: [
      {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${BASE_URL}/candidate/jobs?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 3.  SoftwareApplication — the platform as a product
// ═══════════════════════════════════════════════════════════════════════

/**
 * SoftwareApplication schema identifies Hire Adda as an app/product.
 *
 * Surfaces the platform in Google's software-carousel results and feeds
 * the Knowledge Graph with product-level attributes (categories, OS,
 * pricing tier).
 */
export function softwareApplicationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': SOFTWARE_APP_ID,
    name: 'Hire Adda',
    alternateName: 'Hire Adda Job Portal',
    url: BASE_URL,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Job Search & Recruitment',
    operatingSystem: 'Any (Web-based, PWA installable)',
    browserRequirements: 'Requires a modern browser with JavaScript enabled.',
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    description:
      'Full-featured job portal and recruitment platform: AI-matched opportunities, verified employers, quick-apply, passkey sign-in, and real-time application tracking.',
    featureList: [
      'AI-powered job matching',
      'Verified employer profiles',
      'Quick apply with saved profile',
      'Passkey (WebAuthn) authentication',
      'Real-time application status',
      'Resume parsing with Document AI',
      'Employer dashboard with analytics',
      'Canary-deployed progressive delivery',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      category: 'Free',
    },
    aggregateRating: undefined, // Populate when real ratings exist — never fake them.
    screenshot: [
      abs('/screenshots/home-desktop.png'),
      abs('/screenshots/home-mobile.png'),
      abs('/screenshots/jobs-mobile.png'),
      abs('/screenshots/profile-mobile.png'),
    ],
    inLanguage: 'en-IN',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 4.  Navigation + page-level
// ═══════════════════════════════════════════════════════════════════════

/**
 * BreadcrumbList — drives the breadcrumb trail below the result title in SERP.
 *
 * @param items Ordered path root → current page. First item should be "Home".
 */
export function breadcrumbSchema(items: ReadonlyArray<{ name: string; url: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.url),
    })),
  };
}

/**
 * SiteNavigationElement[] — exposes the primary site nav so search engines
 * can derive sitelinks (the 6-block grid under the top result). Google
 * also uses this to enrich the Knowledge Graph's "related links" pane.
 */
export function siteNavigationSchema(items: ReadonlyArray<Named>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Primary site navigation',
    itemListElement: items.map((item, i) => ({
      '@type': 'SiteNavigationElement',
      position: i + 1,
      name: item.name,
      url: abs(item.url),
    })),
  };
}

interface WebPageInput {
  url: string;
  name: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  breadcrumb?: JsonLd;
  /** Attaches Speakable regions so voice assistants can read the page aloud. */
  speakableCssSelectors?: string[];
  /** Optional primary image URL. Defaults to site-wide wide hero. */
  primaryImage?: string;
}

/** Generic WebPage — fallback type for any page without a more specific schema. */
export function webPageSchema(input: WebPageInput): JsonLd {
  const absUrl = abs(input.url);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': absUrl,
    url: absUrl,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-IN',
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.breadcrumb ? { breadcrumb: input.breadcrumb } : {}),
    ...(input.primaryImage
      ? { primaryImageOfPage: { '@type': 'ImageObject', url: abs(input.primaryImage) } }
      : {}),
    ...(input.speakableCssSelectors && input.speakableCssSelectors.length
      ? {
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: input.speakableCssSelectors,
          },
        }
      : {}),
  };
}

/** AboutPage — `/about`. Helps Google mark the page as company/mission info. */
export function aboutPageSchema(input: WebPageInput): JsonLd {
  return { ...webPageSchema(input), '@type': 'AboutPage' };
}

/** ContactPage — `/contact`. */
export function contactPageSchema(input: WebPageInput): JsonLd {
  return { ...webPageSchema(input), '@type': 'ContactPage' };
}

/** CollectionPage — index/listing pages (e.g. jobs, companies). */
export function collectionPageSchema(input: WebPageInput & { numberOfItems?: number }): JsonLd {
  const base = webPageSchema(input);
  return {
    ...base,
    '@type': 'CollectionPage',
    ...(input.numberOfItems !== undefined ? { numberOfItems: input.numberOfItems } : {}),
  };
}

/**
 * SearchResultsPage — search-results page (/jobs?q=…). Signals to Google
 * this is a SERP-like page, not primary content, so it won't be indexed
 * as a landing page.
 */
export function searchResultsPageSchema(input: WebPageInput & { numberOfItems?: number }): JsonLd {
  const base = webPageSchema(input);
  return {
    ...base,
    '@type': 'SearchResultsPage',
    ...(input.numberOfItems !== undefined ? { numberOfItems: input.numberOfItems } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 5.  FAQ / HowTo / Speakable — AEO (Answer Engine Optimization)
// ═══════════════════════════════════════════════════════════════════════

/**
 * FAQPage — renders eligible Q&A accordions in SERP.
 *
 * Google's policy (2024+): FAQ rich results are limited to pages whose
 * primary purpose is answering FAQs. Use on /help and sparingly elsewhere.
 */
export function faqPageSchema(faqs: ReadonlyArray<{ question: string; answer: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

/**
 * HowTo — procedural content (e.g. "How to post a job", "How to apply").
 * Triggers a step-carousel rich result on mobile.
 */
export function howToSchema(input: {
  name: string;
  description: string;
  totalTime?: string; // ISO 8601 duration — "PT5M" = 5 minutes
  estimatedCost?: { value: string; currency: string };
  supply?: string[];
  tool?: string[];
  steps: ReadonlyArray<{ name: string; text: string; image?: string; url?: string }>;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: input.name,
    description: input.description,
    ...(input.totalTime ? { totalTime: input.totalTime } : {}),
    ...(input.estimatedCost
      ? {
          estimatedCost: {
            '@type': 'MonetaryAmount',
            currency: input.estimatedCost.currency,
            value: input.estimatedCost.value,
          },
        }
      : {}),
    ...(input.supply
      ? { supply: input.supply.map((name) => ({ '@type': 'HowToSupply', name })) }
      : {}),
    ...(input.tool ? { tool: input.tool.map((name) => ({ '@type': 'HowToTool', name })) } : {}),
    step: input.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.image ? { image: abs(s.image) } : {}),
      ...(s.url ? { url: abs(s.url) } : {}),
    })),
  };
}

/**
 * Speakable — marks regions of the page suitable for voice readout
 * (Google Assistant, Alexa). Use CSS selectors pointing at key summary
 * nodes (page title + subtitle).
 */
export function speakableSchema(cssSelectors: ReadonlyArray<string>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SpeakableSpecification',
    cssSelector: cssSelectors,
  };
}

/**
 * Service schema — used to surface a specific Hire Adda service offering
 * (e.g. "Employer hiring solutions") with its dedicated phone helpline, area
 * served, and offer list. Renders the helpline as structured data so it can
 * appear in Google's Service / Knowledge Panel results when users search
 * "hire adda employer support phone" etc.
 *
 * The `provider` field references the Organization @id so the graph remains
 * connected — Google attributes the service to Hire Adda, not as a
 * standalone entity.
 *
 * Schema.org docs: https://schema.org/Service
 */
export interface ServiceSchemaInput {
  name: string;
  description: string;
  url: string;
  serviceType: string;
  /** Display + tel-URI form. */
  telephone?: { display: string; uri: string };
  /** Hours when the helpline / service is staffed. */
  hours?: {
    days: ReadonlyArray<
      'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
    >;
    opens: string; // "09:00"
    closes: string; // "18:00"
  };
  /** Audience targeted (e.g. "employers", "candidates", "vendors"). */
  audienceType?: string;
  /** Optional list of products/plans offered under this service. */
  offers?: ReadonlyArray<{
    name: string;
    pricePaise: number;
    currency?: string;
    url?: string;
  }>;
}

export function serviceSchema(input: ServiceSchemaInput): JsonLd {
  const channel: JsonLd | undefined = input.telephone
    ? {
        '@type': 'ServiceChannel',
        serviceUrl: abs(input.url),
        servicePhone: input.telephone.uri,
        ...(input.hours
          ? {
              availableLanguage: ['English', 'Hindi'],
              serviceLocation: {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: input.hours.days,
                opens: input.hours.opens,
                closes: input.hours.closes,
              },
            }
          : {}),
      }
    : undefined;

  const offers =
    input.offers && input.offers.length > 0
      ? input.offers.map((o) => ({
          '@type': 'Offer',
          name: o.name,
          price: (o.pricePaise / 100).toFixed(2),
          priceCurrency: o.currency ?? 'INR',
          ...(o.url ? { url: abs(o.url) } : {}),
          availability: 'https://schema.org/InStock',
        }))
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: abs(input.url),
    serviceType: input.serviceType,
    provider: { '@id': ORGANIZATION_ID },
    areaServed: { '@type': 'Country', name: 'India' },
    ...(input.audienceType
      ? { audience: { '@type': 'Audience', audienceType: input.audienceType } }
      : {}),
    ...(channel ? { availableChannel: channel } : {}),
    ...(offers
      ? { hasOfferCatalog: { '@type': 'OfferCatalog', name: input.name, itemListElement: offers } }
      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 6.  JobPosting — Google Jobs / SERP job carousel (critical for a job portal)
// ═══════════════════════════════════════════════════════════════════════

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACTOR'
  | 'TEMPORARY'
  | 'INTERN'
  | 'VOLUNTEER'
  | 'PER_DIEM'
  | 'OTHER';

interface MoneyRange {
  currency: string; // ISO 4217 — 'INR'
  min: number;
  max: number;
  /** 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR' */
  unitText?: 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR';
}

interface JobLocation {
  addressLocality: string;
  addressRegion?: string;
  postalCode?: string;
  streetAddress?: string;
  addressCountry: string;
}

export interface JobPostingInput {
  /** Absolute or relative URL — used as canonical. */
  url: string;
  title: string;
  description: string; // HTML allowed, up to 3000 chars recommended
  datePosted: string; // ISO 8601
  validThrough?: string; // ISO 8601 — when the posting closes
  employmentType: EmploymentType | EmploymentType[];
  /** Employer Organization @id or inline object. */
  hiringOrganization: { name: string; url?: string; logo?: string; sameAs?: string[] };
  /** Physical location OR remote flag. Provide one. */
  jobLocation?: JobLocation | JobLocation[];
  applicantLocationRequirements?: { name: string }[];
  jobLocationType?: 'TELECOMMUTE';
  baseSalary?: MoneyRange;
  qualifications?: string;
  responsibilities?: string;
  skills?: string[];
  experienceRequirements?: string;
  educationRequirements?: string;
  /** Google wants `directApply: true` for "Apply on publisher" button. */
  directApply?: boolean;
  identifier?: { name: string; value: string };
  industry?: string;
  occupationalCategory?: string; // ONET-SOC code if known
  workHours?: string;
  datePostedToGoogleJobs?: string;
}

/**
 * JobPosting — the single highest-leverage schema for this platform.
 *
 * Powers Google Jobs (jobs.google.com integration + SERP jobs-box), Bing
 * Jobs, and LinkedIn job surfacing. Google's policy:
 *   - Every field below that's marked required in their docs IS included.
 *   - `validThrough` should always be set — missing it causes the posting
 *     to be dropped from Google Jobs after ~30 days.
 *   - `directApply: true` tells Google the Apply button on our site is the
 *     authoritative application path (vs. redirecting via an aggregator).
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
export function jobPostingSchema(input: JobPostingInput): JsonLd {
  const locations = Array.isArray(input.jobLocation)
    ? input.jobLocation
    : input.jobLocation
      ? [input.jobLocation]
      : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    '@id': abs(input.url),
    url: abs(input.url),
    title: input.title,
    description: input.description,
    datePosted: input.datePosted,
    ...(input.validThrough ? { validThrough: input.validThrough } : {}),
    employmentType: input.employmentType,
    hiringOrganization: {
      '@type': 'Organization',
      name: input.hiringOrganization.name,
      ...(input.hiringOrganization.url ? { url: abs(input.hiringOrganization.url) } : {}),
      ...(input.hiringOrganization.logo ? { logo: abs(input.hiringOrganization.logo) } : {}),
      ...(input.hiringOrganization.sameAs ? { sameAs: input.hiringOrganization.sameAs } : {}),
    },
    ...(locations.length
      ? {
          jobLocation: locations.map((loc) => ({
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              streetAddress: loc.streetAddress,
              addressLocality: loc.addressLocality,
              addressRegion: loc.addressRegion,
              postalCode: loc.postalCode,
              addressCountry: loc.addressCountry,
            },
          })),
        }
      : {}),
    ...(input.applicantLocationRequirements
      ? {
          applicantLocationRequirements: input.applicantLocationRequirements.map((r) => ({
            '@type': 'Country',
            name: r.name,
          })),
        }
      : {}),
    ...(input.jobLocationType ? { jobLocationType: input.jobLocationType } : {}),
    ...(input.baseSalary
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: input.baseSalary.currency,
            value: {
              '@type': 'QuantitativeValue',
              minValue: input.baseSalary.min,
              maxValue: input.baseSalary.max,
              unitText: input.baseSalary.unitText || 'YEAR',
            },
          },
        }
      : {}),
    ...(input.qualifications ? { qualifications: input.qualifications } : {}),
    ...(input.responsibilities ? { responsibilities: input.responsibilities } : {}),
    ...(input.skills ? { skills: input.skills.join(', ') } : {}),
    ...(input.experienceRequirements
      ? { experienceRequirements: input.experienceRequirements }
      : {}),
    ...(input.educationRequirements ? { educationRequirements: input.educationRequirements } : {}),
    ...(input.directApply !== undefined ? { directApply: input.directApply } : {}),
    ...(input.identifier
      ? {
          identifier: {
            '@type': 'PropertyValue',
            name: input.identifier.name,
            value: input.identifier.value,
          },
        }
      : {}),
    ...(input.industry ? { industry: input.industry } : {}),
    ...(input.occupationalCategory ? { occupationalCategory: input.occupationalCategory } : {}),
    ...(input.workHours ? { workHours: input.workHours } : {}),
  };
}

/** ItemList of JobPostings — used on job search results pages for Google Jobs-list. */
export function jobPostingListSchema(
  url: string,
  postings: ReadonlyArray<{ url: string; title: string; hiringOrganizationName: string }>,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${abs(url)}#itemlist`,
    itemListElement: postings.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(p.url),
      name: `${p.title} at ${p.hiringOrganizationName}`,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 7.  Employer Organization / Company profile schemas
// ═══════════════════════════════════════════════════════════════════════

interface CompanyInput {
  /** Slug or absolute URL of the public company page. */
  url: string;
  name: string;
  legalName?: string;
  description?: string;
  logo?: string;
  foundingDate?: string;
  numberOfEmployees?: number | { min: number; max: number };
  industry?: string;
  website?: string;
  sameAs?: string[];
  address?: JobLocation;
  telephone?: string;
  email?: string;
}

/**
 * Employer organization — renders on public company profile pages.
 *
 * Uses plain Organization rather than LocalBusiness unless the employer
 * has a retail storefront open to walk-ins (rare for most tech employers).
 * LocalBusiness requires `openingHours` and physical address which don't
 * apply to most of our tenants.
 */
export function companySchema(input: CompanyInput): JsonLd {
  const num = input.numberOfEmployees;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${abs(input.url)}#organization`,
    url: abs(input.url),
    name: input.name,
    ...(input.legalName ? { legalName: input.legalName } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.logo ? { logo: abs(input.logo) } : {}),
    ...(input.foundingDate ? { foundingDate: input.foundingDate } : {}),
    ...(num !== undefined
      ? {
          numberOfEmployees:
            typeof num === 'number'
              ? { '@type': 'QuantitativeValue', value: num }
              : {
                  '@type': 'QuantitativeValue',
                  minValue: num.min,
                  maxValue: num.max,
                },
        }
      : {}),
    ...(input.industry ? { industry: input.industry } : {}),
    ...(input.website
      ? { sameAs: [...(input.sameAs ?? []), input.website] }
      : input.sameAs
        ? { sameAs: input.sameAs }
        : {}),
    ...(input.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: input.address.streetAddress,
            addressLocality: input.address.addressLocality,
            addressRegion: input.address.addressRegion,
            postalCode: input.address.postalCode,
            addressCountry: input.address.addressCountry,
          },
        }
      : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.email ? { email: input.email } : {}),
  };
}

/** LocalBusiness variant — use when the employer is a retail/physical-location business. */
export function localBusinessSchema(
  input: CompanyInput & {
    priceRange?: string;
    openingHours?: { dayOfWeek: string[]; opens: string; closes: string }[];
    geo?: { latitude: number; longitude: number };
  },
): JsonLd {
  const base = companySchema(input);
  return {
    ...base,
    '@type': 'LocalBusiness',
    ...(input.priceRange ? { priceRange: input.priceRange } : {}),
    ...(input.openingHours
      ? {
          openingHoursSpecification: input.openingHours.map((o) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: o.dayOfWeek,
            opens: o.opens,
            closes: o.closes,
          })),
        }
      : {}),
    ...(input.geo
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: input.geo.latitude,
            longitude: input.geo.longitude,
          },
        }
      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 8.  Person — candidate profiles (when public)
// ═══════════════════════════════════════════════════════════════════════

export function personSchema(input: {
  url: string;
  name: string;
  givenName?: string;
  familyName?: string;
  headline?: string;
  description?: string;
  image?: string;
  jobTitle?: string;
  worksFor?: { name: string; url?: string };
  alumniOf?: Array<{ name: string; url?: string }>;
  knowsAbout?: string[];
  sameAs?: string[];
  email?: string;
  address?: JobLocation;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${abs(input.url)}#person`,
    url: abs(input.url),
    name: input.name,
    ...(input.givenName ? { givenName: input.givenName } : {}),
    ...(input.familyName ? { familyName: input.familyName } : {}),
    ...(input.headline
      ? { jobTitle: input.headline }
      : input.jobTitle
        ? { jobTitle: input.jobTitle }
        : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: abs(input.image) } : {}),
    ...(input.worksFor
      ? {
          worksFor: {
            '@type': 'Organization',
            name: input.worksFor.name,
            ...(input.worksFor.url ? { url: input.worksFor.url } : {}),
          },
        }
      : {}),
    ...(input.alumniOf
      ? {
          alumniOf: input.alumniOf.map((a) => ({
            '@type': 'EducationalOrganization',
            name: a.name,
            ...(a.url ? { url: a.url } : {}),
          })),
        }
      : {}),
    ...(input.knowsAbout ? { knowsAbout: input.knowsAbout } : {}),
    ...(input.sameAs ? { sameAs: input.sameAs } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.address
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: input.address.addressLocality,
            addressRegion: input.address.addressRegion,
            addressCountry: input.address.addressCountry,
          },
        }
      : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 9.  Article / BlogPosting — content articles (help, blog, landing posts)
// ═══════════════════════════════════════════════════════════════════════

export function articleSchema(input: {
  url: string;
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished: string;
  dateModified?: string;
  authorName: string;
  authorUrl?: string;
  publisher?: { id: string } | null;
  keywords?: string[];
  articleSection?: string;
  wordCount?: number;
  speakableCssSelectors?: string[];
}): JsonLd {
  const images = input.image
    ? Array.isArray(input.image)
      ? input.image.map(abs)
      : [abs(input.image)]
    : OG_IMAGE_VARIANTS.map((v) => abs(v.url));

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${abs(input.url)}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(input.url) },
    url: abs(input.url),
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    image: images,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      '@type': 'Person',
      name: input.authorName,
      ...(input.authorUrl ? { url: abs(input.authorUrl) } : {}),
    },
    publisher: { '@id': input.publisher?.id ?? ORGANIZATION_ID },
    ...(input.keywords ? { keywords: input.keywords.join(', ') } : {}),
    ...(input.articleSection ? { articleSection: input.articleSection } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
    ...(input.speakableCssSelectors
      ? {
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: input.speakableCssSelectors,
          },
        }
      : {}),
    inLanguage: 'en-IN',
    isPartOf: { '@id': WEBSITE_ID },
  };
}

/** BlogPosting — narrower subtype of Article for dated blog content. */
export function blogPostingSchema(input: Parameters<typeof articleSchema>[0]): JsonLd {
  return { ...articleSchema(input), '@type': 'BlogPosting' };
}

/** NewsArticle — for news-grade content that qualifies for Top Stories. */
export function newsArticleSchema(input: Parameters<typeof articleSchema>[0]): JsonLd {
  return { ...articleSchema(input), '@type': 'NewsArticle' };
}

// ═══════════════════════════════════════════════════════════════════════
// 10. Reviews, Events, Video, Service — long-tail types we may need later
// ═══════════════════════════════════════════════════════════════════════

export function videoObjectSchema(input: {
  name: string;
  description: string;
  thumbnailUrl: string | string[];
  uploadDate: string;
  contentUrl: string;
  embedUrl?: string;
  duration?: string; // ISO 8601
  transcript?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
    description: input.description,
    thumbnailUrl: Array.isArray(input.thumbnailUrl)
      ? input.thumbnailUrl.map(abs)
      : abs(input.thumbnailUrl),
    uploadDate: input.uploadDate,
    contentUrl: abs(input.contentUrl),
    ...(input.embedUrl ? { embedUrl: abs(input.embedUrl) } : {}),
    ...(input.duration ? { duration: input.duration } : {}),
    ...(input.transcript ? { transcript: input.transcript } : {}),
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function eventSchema(input: {
  name: string;
  description: string;
  startDate: string; // ISO 8601
  endDate?: string;
  eventAttendanceMode?:
    | 'OnlineEventAttendanceMode'
    | 'OfflineEventAttendanceMode'
    | 'MixedEventAttendanceMode';
  eventStatus?: 'EventScheduled' | 'EventPostponed' | 'EventCancelled' | 'EventMovedOnline';
  location?: { name: string; address?: JobLocation; url?: string };
  image?: string[];
  organizer?: { name: string; url?: string };
  offers?: { url: string; price: string; priceCurrency: string; availability?: string };
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.name,
    description: input.description,
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    eventAttendanceMode: `https://schema.org/${input.eventAttendanceMode ?? 'OfflineEventAttendanceMode'}`,
    eventStatus: `https://schema.org/${input.eventStatus ?? 'EventScheduled'}`,
    ...(input.location
      ? {
          location: input.location.address
            ? {
                '@type': 'Place',
                name: input.location.name,
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: input.location.address.streetAddress,
                  addressLocality: input.location.address.addressLocality,
                  addressRegion: input.location.address.addressRegion,
                  postalCode: input.location.address.postalCode,
                  addressCountry: input.location.address.addressCountry,
                },
              }
            : { '@type': 'VirtualLocation', url: input.location.url ?? BASE_URL },
        }
      : {}),
    ...(input.image ? { image: input.image.map(abs) } : {}),
    organizer: {
      '@type': 'Organization',
      name: input.organizer?.name ?? 'Hire Adda',
      url: input.organizer?.url ?? BASE_URL,
    },
    ...(input.offers
      ? {
          offers: {
            '@type': 'Offer',
            url: abs(input.offers.url),
            price: input.offers.price,
            priceCurrency: input.offers.priceCurrency,
            availability: input.offers.availability ?? 'https://schema.org/InStock',
          },
        }
      : {}),
  };
}

export function reviewSchema(input: {
  itemName: string;
  itemType: string; // 'Organization' | 'Product' etc.
  authorName: string;
  reviewBody: string;
  ratingValue: number;
  bestRating?: number;
  datePublished: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': input.itemType, name: input.itemName },
    author: { '@type': 'Person', name: input.authorName },
    reviewBody: input.reviewBody,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: input.ratingValue,
      bestRating: input.bestRating ?? 5,
    },
    datePublished: input.datePublished,
  };
}

export function aggregateRatingSchema(input: {
  itemName: string;
  itemType: string;
  ratingValue: number;
  reviewCount: number;
  bestRating?: number;
  worstRating?: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateRating',
    itemReviewed: { '@type': input.itemType, name: input.itemName },
    ratingValue: input.ratingValue,
    reviewCount: input.reviewCount,
    bestRating: input.bestRating ?? 5,
    worstRating: input.worstRating ?? 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 10b. Course / EducationalOccupationalProgram — career-skill content
// ═══════════════════════════════════════════════════════════════════════

/**
 * Course schema — for help articles teaching a specific career skill
 * (resume writing, interview prep, salary negotiation, etc.). Triggers
 * the Course rich-result carousel on Google.
 */
export function courseSchema(input: {
  url: string;
  name: string;
  description: string;
  provider?: { name: string; url?: string };
  inLanguage?: string;
  isAccessibleForFree?: boolean;
  hasCourseInstance?: ReadonlyArray<{
    courseMode: 'Online' | 'Onsite' | 'Blended';
    startDate?: string;
    endDate?: string;
    courseWorkload?: string;
    location?: string;
    instructor?: { name: string; url?: string };
  }>;
  educationalLevel?: string;
  about?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    description: input.description,
    url: abs(input.url),
    inLanguage: input.inLanguage ?? 'en-IN',
    provider: input.provider
      ? {
          '@type': 'Organization',
          name: input.provider.name,
          ...(input.provider.url ? { url: abs(input.provider.url) } : {}),
        }
      : { '@id': ORGANIZATION_ID },
    isAccessibleForFree: input.isAccessibleForFree ?? true,
    ...(input.educationalLevel ? { educationalLevel: input.educationalLevel } : {}),
    ...(input.about ? { about: input.about } : {}),
    ...(input.hasCourseInstance && input.hasCourseInstance.length > 0
      ? {
          hasCourseInstance: input.hasCourseInstance.map((inst) => ({
            '@type': 'CourseInstance',
            courseMode: inst.courseMode,
            ...(inst.startDate ? { startDate: inst.startDate } : {}),
            ...(inst.endDate ? { endDate: inst.endDate } : {}),
            ...(inst.courseWorkload ? { courseWorkload: inst.courseWorkload } : {}),
            ...(inst.location ? { location: inst.location } : {}),
            ...(inst.instructor
              ? {
                  instructor: {
                    '@type': 'Person',
                    name: inst.instructor.name,
                    ...(inst.instructor.url ? { url: inst.instructor.url } : {}),
                  },
                }
              : {}),
          })),
        }
      : {}),
  };
}

/** EducationalOccupationalProgram — long-form skills program. */
export function educationalProgramSchema(input: {
  url: string;
  name: string;
  description: string;
  occupationalCategory?: string;
  programType?: string;
  educationalLevel?: string;
  timeOfDay?: string;
  applicationDeadline?: string;
  numberOfCredits?: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    url: abs(input.url),
    name: input.name,
    description: input.description,
    provider: { '@id': ORGANIZATION_ID },
    ...(input.occupationalCategory ? { occupationalCategory: input.occupationalCategory } : {}),
    ...(input.programType ? { programType: input.programType } : {}),
    ...(input.educationalLevel ? { educationalLevel: input.educationalLevel } : {}),
    ...(input.timeOfDay ? { timeOfDay: input.timeOfDay } : {}),
    ...(input.applicationDeadline ? { applicationDeadline: input.applicationDeadline } : {}),
    ...(input.numberOfCredits ? { numberOfCredits: input.numberOfCredits } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 10c. QAPage / Quiz / Dataset / Product / ProfilePage / ImageGallery
// ═══════════════════════════════════════════════════════════════════════

/** QAPage — community Q&A; distinct from owner-curated FAQPage. */
export function qaPageSchema(input: {
  url: string;
  question: string;
  questionDatePublished: string;
  questionAuthorName: string;
  upvoteCount?: number;
  answerCount?: number;
  acceptedAnswer?: {
    text: string;
    datePublished: string;
    authorName: string;
    upvoteCount?: number;
    url?: string;
  };
  suggestedAnswers?: ReadonlyArray<{
    text: string;
    datePublished: string;
    authorName: string;
    upvoteCount?: number;
    url?: string;
  }>;
}): JsonLd {
  type AnswerInput = NonNullable<typeof input.acceptedAnswer>;
  const buildAnswer = (a: AnswerInput) => ({
    '@type': 'Answer',
    text: a.text,
    datePublished: a.datePublished,
    author: { '@type': 'Person', name: a.authorName },
    ...(a.upvoteCount !== undefined ? { upvoteCount: a.upvoteCount } : {}),
    ...(a.url ? { url: abs(a.url) } : {}),
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: {
      '@type': 'Question',
      name: input.question,
      text: input.question,
      datePublished: input.questionDatePublished,
      author: { '@type': 'Person', name: input.questionAuthorName },
      ...(input.upvoteCount !== undefined ? { upvoteCount: input.upvoteCount } : {}),
      ...(input.answerCount !== undefined ? { answerCount: input.answerCount } : {}),
      ...(input.acceptedAnswer ? { acceptedAnswer: buildAnswer(input.acceptedAnswer) } : {}),
      ...(input.suggestedAnswers && input.suggestedAnswers.length > 0
        ? { suggestedAnswer: input.suggestedAnswers.map(buildAnswer) }
        : {}),
    },
    url: abs(input.url),
  };
}

/** Quiz — skill assessment / role-fit quiz. */
export function quizSchema(input: {
  url: string;
  name: string;
  description: string;
  about?: string;
  educationalLevel?: string;
  timeRequired?: string;
  numberOfQuestions?: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    url: abs(input.url),
    name: input.name,
    description: input.description,
    ...(input.about ? { about: input.about } : {}),
    ...(input.educationalLevel ? { educationalLevel: input.educationalLevel } : {}),
    ...(input.timeRequired ? { timeRequired: input.timeRequired } : {}),
    ...(input.numberOfQuestions ? { numberOfQuestions: input.numberOfQuestions } : {}),
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * Dataset — surfaces public data to Google Dataset Search and AI engines.
 * Use on /jobs and /companies listing pages.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/dataset
 */
export function datasetSchema(input: {
  url: string;
  name: string;
  description: string;
  dateModified?: string;
  datePublished?: string;
  spatialCoverage?: string;
  temporalCoverage?: string;
  keywords?: string[];
  license?: string;
  distribution?: ReadonlyArray<{ encodingFormat: string; contentUrl: string }>;
  size?: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    url: abs(input.url),
    name: input.name,
    description: input.description,
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-IN',
    isAccessibleForFree: true,
    license: input.license ? abs(input.license) : abs('/terms'),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.spatialCoverage
      ? { spatialCoverage: { '@type': 'Place', name: input.spatialCoverage } }
      : {}),
    ...(input.temporalCoverage ? { temporalCoverage: input.temporalCoverage } : {}),
    ...(input.keywords ? { keywords: input.keywords } : {}),
    ...(input.distribution
      ? {
          distribution: input.distribution.map((d) => ({
            '@type': 'DataDownload',
            encodingFormat: d.encodingFormat,
            contentUrl: abs(d.contentUrl),
          })),
        }
      : {}),
    ...(input.size
      ? { variableMeasured: { '@type': 'PropertyValue', name: 'size', value: input.size } }
      : {}),
  };
}

/** Product — for paid plan pages. */
export function productSchema(input: {
  url: string;
  name: string;
  description: string;
  image?: string | string[];
  brand?: string;
  category?: string;
  offers: {
    pricePaise: number;
    currency?: string;
    priceValidUntil?: string;
    availability?: string;
    url?: string;
    priceValidFrom?: string;
  };
  aggregateRating?: { ratingValue: number; reviewCount: number };
  sku?: string;
}): JsonLd {
  const images = input.image
    ? Array.isArray(input.image)
      ? input.image.map(abs)
      : [abs(input.image)]
    : OG_IMAGE_VARIANTS.map((v) => abs(v.url));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    url: abs(input.url),
    name: input.name,
    description: input.description,
    image: images,
    brand: { '@type': 'Brand', name: input.brand ?? 'Hire Adda' },
    ...(input.category ? { category: input.category } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    offers: {
      '@type': 'Offer',
      price: (input.offers.pricePaise / 100).toFixed(2),
      priceCurrency: input.offers.currency ?? 'INR',
      availability: input.offers.availability ?? 'https://schema.org/InStock',
      url: abs(input.offers.url ?? input.url),
      ...(input.offers.priceValidUntil ? { priceValidUntil: input.offers.priceValidUntil } : {}),
      ...(input.offers.priceValidFrom ? { priceValidFrom: input.offers.priceValidFrom } : {}),
      seller: { '@id': ORGANIZATION_ID },
    },
    ...(input.aggregateRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.aggregateRating.ratingValue,
            reviewCount: input.aggregateRating.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** ProfilePage — wraps a Person/Organization for profile-style URLs. */
export function profilePageSchema(input: {
  url: string;
  mainEntity: JsonLd;
  dateCreated?: string;
  dateModified?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: abs(input.url),
    mainEntity: input.mainEntity,
    ...(input.dateCreated ? { dateCreated: input.dateCreated } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  };
}

/** ImageGallery — for company office-photo galleries. */
export function imageGallerySchema(input: {
  url: string;
  name: string;
  description?: string;
  images: ReadonlyArray<{
    url: string;
    caption?: string;
    width?: number;
    height?: number;
  }>;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    url: abs(input.url),
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    associatedMedia: input.images.map((img) => ({
      '@type': 'ImageObject',
      contentUrl: abs(img.url),
      url: abs(img.url),
      ...(img.caption ? { caption: img.caption } : {}),
      ...(img.width ? { width: img.width } : {}),
      ...(img.height ? { height: img.height } : {}),
    })),
  };
}

/** ItemList — generic homogeneous URL list (sitemap, related-items panel). */
export function itemListSchema(input: {
  url: string;
  name: string;
  items: ReadonlyArray<{ url: string; name: string; image?: string; description?: string }>;
  itemListOrder?: 'Ascending' | 'Descending' | 'Unordered';
  numberOfItems?: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: abs(input.url),
    name: input.name,
    itemListOrder: `https://schema.org/ItemListOrder${input.itemListOrder ?? 'Unordered'}`,
    numberOfItems: input.numberOfItems ?? input.items.length,
    itemListElement: input.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(it.url),
      name: it.name,
      ...(it.image ? { image: abs(it.image) } : {}),
      ...(it.description ? { description: it.description } : {}),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 11. Graph helper — combine multiple entities into an @graph document
// ═══════════════════════════════════════════════════════════════════════

/**
 * Wrap multiple top-level schemas into a single `@graph` document.
 * More efficient than emitting N separate <script> tags and lets
 * crawlers see cross-references between entities (e.g. JobPosting
 * → hiringOrganization → Organization).
 */
export function graph(...items: JsonLd[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': items.map((item) => {
      // Strip nested @context — redundant inside @graph.
      const copy = { ...item };
      delete copy['@context'];
      return copy;
    }),
  };
}
