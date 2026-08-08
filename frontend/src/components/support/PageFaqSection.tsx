'use client';

/**
 * PageFaqSection — embedded FAQ block tailored to a specific landing page.
 *
 * Pulls FAQs from the shared corpus filtered by `pageContext` + `audience`,
 * with the same fuzzy search + locale picker the modal uses. Each section
 * emits its own FAQPage JSON-LD with only the visible questions, so search
 * engines pick up rich-result eligibility per landing page (e.g. /pricing/
 * employer's "Employer Pricing FAQ" gets its own SERP card).
 *
 * Never render this alongside another FAQ block on the same page — duplicated
 * FAQPage schema confuses Google. All three pricing pages now use ONLY this
 * component; the old static `PricingFAQ` grid it used to warn about is
 * retired (kept in the tree, no longer mounted anywhere).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { ChevronDown, Search, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import JsonLd from '@/components/seo/JsonLd';
import Select from '@/components/ui/Select';
import { faqPageSchema } from '@/lib/json-ld';
import {
  CATEGORY_LABELS,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getFaqsForPage,
  type FaqAudience,
  type FaqEntry,
  type FaqPageContext,
  type LocaleCode,
} from '@/data/faqs';
import { useFaqLocale } from '@/hooks/use-faq-locale';

interface PageFaqSectionProps {
  pageContext: FaqPageContext;
  audience?: FaqAudience;
  /** Heading override. Default: "Frequently Asked Questions". */
  heading?: string;
  /** Sub-heading copy under the H2. */
  subheading?: string;
  /** Cap visible FAQs (e.g. show top 10 on a marketing page). */
  limit?: number;
  /**
   * How many questions to render before the "Load more" button. The rest are
   * revealed in batches of this size on click. Set to `Infinity` to render
   * every question up-front.
   */
  initialCount?: number;
  /** Stable id for the JsonLd block — must be unique across the page. */
  jsonLdId?: string;
  className?: string;
}

const DEFAULT_INITIAL_COUNT = 6;

export default function PageFaqSection({
  pageContext,
  audience = 'all',
  heading = 'Frequently Asked Questions',
  subheading,
  limit,
  initialCount = DEFAULT_INITIAL_COUNT,
  jsonLdId,
  className,
}: PageFaqSectionProps) {
  const { locale, setLocale } = useFaqLocale();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // How many questions are currently rendered. Grows in `initialCount`
  // batches via the "Load more" button.
  const [shownCount, setShownCount] = useState(initialCount);

  const faqs = useMemo<FaqEntry[]>(
    () => getFaqsForPage(pageContext, { locale, audience, limit }),
    [pageContext, locale, audience, limit],
  );

  const fuse = useMemo(
    () =>
      new Fuse(faqs, {
        keys: [
          { name: 'question', weight: 0.5 },
          { name: 'answer', weight: 0.2 },
          { name: 'keywords', weight: 0.3 },
        ],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2,
      }),
    [faqs],
  );

  const visible = useMemo<FaqEntry[]>(() => {
    const q = query.trim();
    if (!q) return faqs;
    return fuse.search(q).map((r) => r.item);
  }, [query, fuse, faqs]);

  // Only render the first `shownCount` matches. Slicing (rather than resetting
  // `shownCount` when the query changes) means a search that returns fewer
  // results than the current count simply shows all of them — no state sync
  // in an effect, so no stale/one-frame-behind list.
  const rendered = visible.slice(0, shownCount);
  const remaining = visible.length - rendered.length;

  // SEO: emit FAQPage schema with the canonical English wording so the
  // schema is locale-independent and matches what we serve to Googlebot.
  const englishFaqs = useMemo(
    () => getFaqsForPage(pageContext, { locale: DEFAULT_LOCALE, audience, limit }),
    [pageContext, audience, limit],
  );
  const schema = useMemo(
    () => faqPageSchema(englishFaqs.map((f) => ({ question: f.question, answer: f.answer }))),
    [englishFaqs],
  );

  if (faqs.length === 0) return null;

  const id = jsonLdId ?? `jsonld-faq-${pageContext}`;

  return (
    <section className={`bg-[var(--bg-secondary)] py-16 ${className ?? ''}`}>
      <JsonLd id={id} data={schema} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">{heading}</h2>
            {subheading && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{subheading}</p>
            )}
          </div>
          <div>
            <label htmlFor="faq-language" className="sr-only">
              Language
            </label>
            <Select
              id="faq-language"
              value={locale}
              onChange={(val) => setLocale(val as LocaleCode)}
              options={SUPPORTED_LOCALES.map((l) => ({ value: l.code, label: l.nativeLabel }))}
              clearable={false}
              size="sm"
              className="w-40"
            />
          </div>
        </div>

        <div className="relative mb-4">
          <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="search"
            placeholder="Search this section..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-10 pl-9 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
            aria-label="Search this FAQ section"
          />
          <span className="text-primary pointer-events-none absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium">
            <Sparkles className="h-3 w-3" />
            AI
          </span>
        </div>

        <div className="space-y-2">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No matches in this section. Try the{' '}
              <Link href="/help" className="text-primary underline underline-offset-2">
                full FAQ
              </Link>{' '}
              instead.
            </p>
          ) : (
            rendered.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                        {CATEGORY_LABELS[faq.category][locale]}
                      </p>
                      <p className="mt-0.5 font-medium text-[var(--text)]">{faq.question}</p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {/* Smooth height+opacity tween — see help/page.tsx
                      for the easing rationale. The outer card already
                      has `overflow-hidden`, but the motion wrapper
                      needs its own `overflow: hidden` so height: 0
                      → auto doesn't visually pop. */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] },
                          opacity: { duration: 0.2, ease: 'easeOut' },
                        }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 px-5 py-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Load more — keeps long sections short on first paint. The FAQPage
            JSON-LD above always contains the FULL question set (it is built
            from `englishFaqs`, not from what's rendered), so paginating here
            costs nothing in rich-result eligibility. */}
        {remaining > 0 && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setShownCount((n) => n + initialCount)}
              className="hover:border-primary hover:text-primary inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors"
            >
              Load {Math.min(remaining, initialCount)} more
              <span className="text-[var(--text-muted)]">({remaining} left)</span>
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Looking for something else?{' '}
          <Link href={`/help?lang=${locale}`} className="text-primary underline underline-offset-2">
            Browse all FAQs
          </Link>
        </p>
      </div>
    </section>
  );
}
