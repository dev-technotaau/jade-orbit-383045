'use client';

/**
 * HelpModal — page-aware FAQ search modal.
 *
 *   - Filters FAQs by `pageContext` + `audience` so each surface shows
 *     only relevant questions (login pages get auth + getting-started,
 *     pricing pages get billing + plan benefits, etc.).
 *   - Fuse.js fuzzy search across question, answer, and the per-FAQ
 *     `keywords` array — typo-tolerant + synonym-aware ("how to pay" →
 *     "billing-payment-methods" via keyword match).
 *   - Language picker switches the entire visible content + search
 *     index in real time. Choice persists across modals via
 *     `useFaqLocale`.
 *   - "View all FAQs" link to /help when the user wants the full
 *     corpus or to share a deep-link.
 */

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { ChevronDown, ExternalLink, Search, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useFaqLocale } from '@/hooks/use-faq-locale';
import {
  CATEGORY_LABELS,
  SUPPORTED_LOCALES,
  getFaqsForPage,
  type FaqAudience,
  type FaqEntry,
  type FaqPageContext,
} from '@/data/faqs';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext: FaqPageContext;
  audience?: FaqAudience;
  /** Page-scoped title override. Default: "Help & FAQs". */
  title?: string;
}

/** Questions revealed per "Load more" click inside the help modal. */
const HELP_MODAL_BATCH = 8;

export default function HelpModal({
  isOpen,
  onClose,
  pageContext,
  audience = 'all',
  title = 'Help & FAQs',
}: HelpModalProps) {
  const { locale, setLocale } = useFaqLocale();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownCount, setShownCount] = useState(HELP_MODAL_BATCH);

  const faqs = useMemo<FaqEntry[]>(
    () => getFaqsForPage(pageContext, { locale, audience }),
    [pageContext, locale, audience],
  );

  const fuse = useMemo(
    () =>
      new Fuse(faqs, {
        keys: [
          { name: 'question', weight: 0.5 },
          { name: 'answer', weight: 0.2 },
          { name: 'keywords', weight: 0.3 },
        ],
        threshold: 0.4, // typo-tolerant — "paymentt" still matches "payment"
        includeScore: true,
        minMatchCharLength: 2,
      }),
    [faqs],
  );

  const visible: FaqEntry[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return faqs;
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, fuse, faqs]);

  // Only render the first batch; the rest come in on "Load more". Slicing
  // means a narrower search just shows everything it matched.
  const rendered = visible.slice(0, shownCount);
  const remaining = visible.length - rendered.length;

  // Reset query + close any expanded entries when the modal opens fresh
  // or the page context changes — feels cleaner across nav.
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      setOpenId(null);
      // Collapse back to the first batch so a reopened modal starts short.
      setShownCount(HELP_MODAL_BATCH);
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      {/* Language picker + AI badge */}
      <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-primary inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium">
          <WandSparkles className="h-3.5 w-3.5" />
          AI-powered search
        </div>
        {/* Custom Select (not a native <select>) — matches the /help
            page's language picker so the dropdown styling is consistent
            with the design system instead of the OS-drawn control. */}
        <div className="w-36">
          <label htmlFor="help-modal-language-select" className="sr-only">
            Language
          </label>
          <Select
            id="help-modal-language-select"
            value={locale}
            onChange={(v) => setLocale(v as typeof locale)}
            options={SUPPORTED_LOCALES.map((l) => ({
              value: l.code,
              label: l.nativeLabel,
            }))}
            size="sm"
            clearable={false}
          />
        </div>
      </div>

      {/* Search */}
      <Input
        type="search"
        placeholder="Try: 'how to pay', 'forgot password', 'CV unlock'..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        leftIcon={<Search className="h-4 w-4" />}
        aria-label="Search FAQs"
      />

      <p className="mt-3 mb-2 text-xs text-[var(--text-muted)]">
        {query.trim() === ''
          ? `Showing ${faqs.length} relevant ${faqs.length === 1 ? 'question' : 'questions'} for this page`
          : `${visible.length} of ${faqs.length} match "${query.trim()}"`}
      </p>

      {/* Results */}
      <div data-lenis-prevent className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-6 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No matches found. Try different words or{' '}
              <Link
                href="/help"
                className="text-primary underline underline-offset-2"
                onClick={onClose}
              >
                browse all FAQs
              </Link>
              .
            </p>
          </div>
        ) : (
          rendered.map((faq) => {
            const isOpen = openId === faq.id;
            const categoryLabel = CATEGORY_LABELS[faq.category][locale];
            return (
              <div
                key={faq.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                      {categoryLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--text)]">
                      {faq.question}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Smooth collapse — height + opacity tween, matches
                    the help-page FAQ + PageFaqSection convention. */}
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
                      <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}

        {/* Load more — keeps the modal short on open instead of dumping the
            whole page-scoped FAQ set into its scroll area. */}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setShownCount((n) => n + HELP_MODAL_BATCH)}
            className="hover:border-primary hover:text-primary mt-1 w-full rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors"
          >
            Load {Math.min(remaining, HELP_MODAL_BATCH)} more{' '}
            <span className="font-normal text-[var(--text-muted)]">({remaining} left)</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs">
        <Link
          href={`/help?lang=${locale}`}
          onClick={onClose}
          className="text-primary inline-flex items-center gap-1 hover:underline"
        >
          View all FAQs <ExternalLink className="h-3 w-3" />
        </Link>
        <Link
          href="/contact"
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Still need help? Contact us →
        </Link>
      </div>
    </Modal>
  );
}
