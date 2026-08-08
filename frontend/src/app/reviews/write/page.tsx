'use client';

/**
 * /reviews/write — standalone review entry. No company prefill, user
 * picks via the autocomplete. Useful from a homepage CTA or any
 * "rate a company" link not scoped to a slug.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ReviewForm from '@/components/reviews/ReviewForm';
import Breadcrumbs from '@/components/common/Breadcrumbs';

export default function WriteReviewStandalonePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6">
        <Link
          href="/companies"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to companies
        </Link>
      </div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text)]">Rate a company</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Search for a company and share your honest experience. Reviews are submitted anonymously.
        </p>
      </header>
      <ReviewForm initialCompany={null} />

      {/* Breadcrumbs — bottom placement. No page-level
          `breadcrumbSchema`, so the component emits its own
          BreadcrumbList JSON-LD via the href on each item. */}
      <div className="mt-10 border-t border-[var(--border)] pt-4">
        <Breadcrumbs
          items={[
            { name: 'Companies', href: '/companies' },
            { name: 'Write a review', href: '/reviews/write' },
          ]}
        />
      </div>
    </main>
  );
}
