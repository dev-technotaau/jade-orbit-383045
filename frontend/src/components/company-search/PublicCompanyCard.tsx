'use client';

/**
 * Public-surface company card. Used on /companies listing and the
 * homepage company directory teaser. Auth-gated "Follow company" CTA.
 */

import Link from 'next/link';
import Image from 'next/image';
import { Building2, MapPin, Briefcase, ShieldCheck, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import CompanyFollowButton from '@/components/company-search/CompanyFollowButton';
import RatingBadge from '@/components/reviews/RatingBadge';
import { isOptimisableImageHost } from '@/lib/image-host';
import type { PublicCompanyCardData } from '@/services/public-companies.service';

interface Props {
  company: PublicCompanyCardData;
  searchKeyword?: string;
}

function detailHref(company: PublicCompanyCardData): string {
  return company.slug ? `/companies/${company.slug}` : `/company/${company.id}`;
}

export default function PublicCompanyCard({ company, searchKeyword }: Props) {
  const _kw = searchKeyword;
  return (
    <Card className="hover:border-primary/20 transition-all hover:shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
          {company.logo ? (
            <Image
              src={company.logo}
              alt={company.companyName}
              width={48}
              height={48}
              sizes="48px"
              loading="lazy"
              unoptimized={!isOptimisableImageHost(company.logo)}
              className="h-12 w-12 rounded-lg object-contain"
            />
          ) : (
            <Building2 className="h-7 w-7 text-[var(--text-muted)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={detailHref(company)}
              className="hover:text-primary text-base font-semibold text-[var(--text)] transition-colors"
            >
              {company.companyName}
            </Link>
            {company.isVerified && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success-dark)]">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            )}
            <RatingBadge
              rating={company.averageRating ?? 0}
              count={company.totalReviews ?? 0}
              size="xs"
              href={
                company.slug ? `/companies/${encodeURIComponent(company.slug)}/reviews` : undefined
              }
            />
          </div>
          {company.tagline && (
            <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-secondary)]">
              {company.tagline}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            {company.industry && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {company.industry}
              </span>
            )}
            {company.companySize && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {company.companySize}
              </span>
            )}
            {(company.city || company.headquarters) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {company.city ?? company.headquarters}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {company.companyType && (
              <Badge variant="info" size="sm">
                {company.companyType}
              </Badge>
            )}
            {(company.openJobsCount ?? 0) > 0 && (
              <Badge variant="success" size="sm">
                {company.openJobsCount} open jobs
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 self-center">
          {/* Compact follow button — visible on every card so users
              don't have to click into each company to follow. Same
              auth-gate behaviour as the detail-page button. */}
          <CompanyFollowButton idOrSlug={company.slug ?? company.id} compact variant="outline" />
          <Link
            href={detailHref(company)}
            className="text-primary text-sm font-semibold hover:underline"
          >
            View →
          </Link>
        </div>
      </div>
    </Card>
  );
}
