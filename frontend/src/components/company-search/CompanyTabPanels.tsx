'use client';

/**
 * Shared per-tab content for the company detail surface.
 *
 * Used by:
 *   - /companies/[slug] (public detail page) — server component passes
 *     `activeTab` from searchParams + the public data shape.
 *   - /employer/profile/preview (employer self-preview) — client
 *     component passes the employer's own CompanyProfile.
 *
 * Both surfaces converge on the same 8-tab structure so the employer
 * sees exactly what candidates will see (modulo the Jobs tab — which
 * is data-supplied per page).
 */

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import SocialLinksBento, { companySocialLinks } from '@/components/common/SocialLinksBento';
import type { CompanyTabKey } from './company-tabs-helpers';

/**
 * Loose shape — each tab tolerates missing fields by checking presence
 * before rendering. The intersection of `CompanyProfile` (employer
 * self-edit) + `PublicCompanyDetailResult.company` (public surface)
 * provides everything we need.
 */
export interface CompanyContentInput {
  id?: string;
  companyName: string;
  description?: string | null;
  whyWorkForUs?: string | null;
  missionStatement?: string | null;
  visionStatement?: string | null;
  coreValues?: string[] | null;
  companyCulture?: string | null;
  diversityStatement?: string | null;
  csrInitiatives?: string | null;
  benefits?: string[] | null;
  structuredPerks?: unknown;
  workplacePolicies?: unknown;
  leadershipTeam?: unknown;
  employeeTestimonials?: unknown;
  officePhotos?: unknown;
  companyVideoUrl?: string | null;
  techStack?: string[] | null;
  productsServices?: string[] | null;
  specialties?: string[] | null;
  interviewProcess?: string | null;
  socialLinks?: Record<string, unknown> | null | undefined;
}

interface Props {
  activeTab: CompanyTabKey;
  company: CompanyContentInput;
  /** Optional Jobs-tab content. Hosting page builds its own job list. */
  jobsTabContent?: React.ReactNode;
  /** Optional Overview-tab teaser (e.g. "View all jobs →" link). */
  overviewJobsTeaser?: React.ReactNode;
}

export default function CompanyTabPanels({
  activeTab,
  company,
  jobsTabContent,
  overviewJobsTeaser,
}: Props) {
  const social = companySocialLinks(company.socialLinks);

  if (activeTab === 'overview') {
    return (
      <>
        {company.description && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">About</h2>
            {/* description may be HTML or plain text — render as text
                here to avoid XSS exposure across multiple consumers. */}
            <p className="prose prose-sm max-w-none whitespace-pre-line text-[var(--text-secondary)]">
              {company.description}
            </p>
          </Card>
        )}
        {(company.techStack?.length ?? 0) > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Tech stack</h2>
            <div className="flex flex-wrap gap-1.5">
              {company.techStack!.map((t) => (
                <Badge key={t} variant="neutral" size="sm">
                  {t}
                </Badge>
              ))}
            </div>
          </Card>
        )}
        {(company.specialties?.length ?? 0) > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Specialties</h2>
            <div className="flex flex-wrap gap-1.5">
              {company.specialties!.map((s) => (
                <Badge key={s} variant="neutral" size="sm">
                  {s}
                </Badge>
              ))}
            </div>
          </Card>
        )}
        {(company.productsServices?.length ?? 0) > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Products & services</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {company.productsServices!.map((p) => (
                <li
                  key={p}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {social.length > 0 && <SocialLinksBento heading="Connect with us" links={social} />}
        {overviewJobsTeaser}
      </>
    );
  }

  if (activeTab === 'why-work-with-us' && company.whyWorkForUs) {
    return (
      <Card padding="lg">
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
          Why work with {company.companyName}
        </h2>
        <div className="prose prose-sm max-w-none whitespace-pre-line text-[var(--text-secondary)]">
          {company.whyWorkForUs}
        </div>
      </Card>
    );
  }

  if (activeTab === 'culture') {
    return (
      <>
        {company.missionStatement && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Our mission</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.missionStatement}
            </p>
          </Card>
        )}
        {company.visionStatement && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Our vision</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.visionStatement}
            </p>
          </Card>
        )}
        {(company.coreValues?.length ?? 0) > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Core values</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {company.coreValues!.map((v) => (
                <li
                  key={v}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {v}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {company.companyCulture && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
              Working at {company.companyName}
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.companyCulture}
            </p>
          </Card>
        )}
        {company.diversityStatement && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Diversity & inclusion</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.diversityStatement}
            </p>
          </Card>
        )}
        {company.csrInitiatives && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Social impact</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.csrInitiatives}
            </p>
          </Card>
        )}
      </>
    );
  }

  if (activeTab === 'benefits') {
    return (
      <>
        {(company.benefits?.length ?? 0) > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Benefits</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {company.benefits!.map((b) => (
                <li
                  key={b}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {Array.isArray(company.workplacePolicies) && company.workplacePolicies.length > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Workplace policies</h2>
            <ul className="space-y-3">
              {(
                company.workplacePolicies as Array<{
                  title?: string;
                  description?: string;
                }>
              ).map((p, i) => (
                <li
                  key={`${p.title ?? 'policy'}-${i}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                >
                  {p.title && <p className="text-sm font-semibold text-[var(--text)]">{p.title}</p>}
                  {p.description && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{p.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (activeTab === 'people') {
    return (
      <>
        {Array.isArray(company.leadershipTeam) && company.leadershipTeam.length > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Leadership</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(
                company.leadershipTeam as Array<{
                  name?: string;
                  designation?: string;
                  imageUrl?: string;
                  bio?: string;
                  linkedinUrl?: string;
                }>
              ).map((p, i) => (
                <li
                  key={`${p.name ?? 'leader'}-${i}`}
                  className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.name ?? 'Leader'}
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text)]">{p.name}</p>
                    {p.designation && (
                      <p className="text-xs text-[var(--text-muted)]">{p.designation}</p>
                    )}
                    {p.bio && (
                      <p className="mt-1 line-clamp-3 text-xs text-[var(--text-secondary)]">
                        {p.bio}
                      </p>
                    )}
                    {p.linkedinUrl && (
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-1 inline-block text-xs font-semibold hover:underline"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {Array.isArray(company.employeeTestimonials) && company.employeeTestimonials.length > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">What our team says</h2>
            <ul className="space-y-3">
              {(
                company.employeeTestimonials as Array<{
                  name?: string;
                  designation?: string;
                  quote?: string;
                  imageUrl?: string;
                }>
              ).map((t, i) => (
                <li
                  key={`${t.name ?? 'testimonial'}-${i}`}
                  className="rounded-lg border-l-2 border-[var(--primary)] bg-[var(--bg-secondary)] p-3"
                >
                  {t.quote && (
                    <p className="text-sm text-[var(--text-secondary)] italic">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  )}
                  <p className="mt-2 text-xs font-semibold text-[var(--text)]">
                    — {t.name}
                    {t.designation ? `, ${t.designation}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (activeTab === 'gallery') {
    return (
      <>
        {company.companyVideoUrl && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Company video</h2>
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                src={company.companyVideoUrl}
                title={`${company.companyName} video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </Card>
        )}
        {Array.isArray(company.officePhotos) && company.officePhotos.length > 0 && (
          <Card padding="lg">
            <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Office photos</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                company.officePhotos as Array<{
                  url?: string;
                  caption?: string;
                  location?: string;
                }>
              ).map((p, i) => (
                <li key={`photo-${i}`} className="overflow-hidden rounded-xl">
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={p.caption ?? `${company.companyName} office`}
                      className="aspect-video w-full object-cover"
                    />
                  )}
                  {(p.caption || p.location) && (
                    <p className="mt-1 px-1 text-xs text-[var(--text-muted)]">
                      {p.caption}
                      {p.location ? ` · ${p.location}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (activeTab === 'hiring' && company.interviewProcess) {
    return (
      <Card padding="lg">
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Hiring process</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
          {company.interviewProcess}
        </p>
      </Card>
    );
  }

  if (activeTab === 'jobs') {
    return <>{jobsTabContent}</>;
  }

  return null;
}
