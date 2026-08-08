'use client';

/**
 * /companies/[slug]/reviews/write — review form prefilled with the
 * company resolved from the slug. User can clear and pick another
 * company via the autocomplete; submission goes to the SELECTED
 * company id, not necessarily the URL slug.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ReviewForm from '@/components/reviews/ReviewForm';
import { companyReviewService } from '@/services/company-review.service';
import type { CompanyAutocompleteItem } from '@/types/review';

export default function WriteReviewForCompanyPage() {
  const params = useParams<{ slug: string }>();
  const slug = (params?.slug as string) || '';
  const [initialCompany, setInitialCompany] = useState<CompanyAutocompleteItem | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!slug) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Use the autocomplete endpoint with the slug as the query —
        // returns a list, we pick the slug-match.
        const matches = await companyReviewService.searchCompaniesForForm(slug);
        const exact = matches.find((c) => c.slug === slug) ?? matches[0] ?? null;
        if (!cancelled) setInitialCompany(exact);
      } catch {
        if (!cancelled) setInitialCompany(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6">
        <Link
          href={`/companies/${slug}/reviews`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to reviews
        </Link>
      </div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text)]">Write a review</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Share your honest experience to help other candidates make informed career decisions. Your
          review is anonymous.
        </p>
      </header>
      {loaded ? (
        <ReviewForm initialCompany={initialCompany} />
      ) : (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-muted)]">
          Loading company…
        </div>
      )}
    </main>
  );
}
