/**
 * Locale-aware FAQ access. Single import point for all consumers.
 *
 *   - `getFaqsForLocale(locale)`            full corpus in the chosen locale
 *   - `getFaqsForPage(pageContext, locale)` page-aware filter
 *   - `getFaqsForCategory(category, locale)` tab-aware filter
 *   - `findFaqById(id, locale)`              single lookup with locale fallback
 *
 * Untranslated entries silently fall back to English at the data layer
 * (see faqs.<locale>.ts), so consumers never have to handle missing
 * translations.
 */

import { FAQS_EN } from './faqs.en';
import { FAQS_HI } from './faqs.hi';
import { FAQS_TA } from './faqs.ta';
import { FAQS_TE } from './faqs.te';
import { FAQS_BN } from './faqs.bn';
import { FAQS_MR } from './faqs.mr';
import {
  DEFAULT_LOCALE,
  type FaqAudience,
  type FaqCategory,
  type FaqEntry,
  type FaqPageContext,
  type LocaleCode,
} from './types';

const CORPUS: Record<LocaleCode, FaqEntry[]> = {
  en: FAQS_EN,
  hi: FAQS_HI,
  ta: FAQS_TA,
  te: FAQS_TE,
  bn: FAQS_BN,
  mr: FAQS_MR,
};

export function getFaqsForLocale(locale: LocaleCode = DEFAULT_LOCALE): FaqEntry[] {
  return CORPUS[locale] ?? CORPUS[DEFAULT_LOCALE];
}

export function getFaqsForPage(
  pageContext: FaqPageContext,
  options: { locale?: LocaleCode; audience?: FaqAudience; limit?: number } = {},
): FaqEntry[] {
  const { locale = DEFAULT_LOCALE, audience, limit } = options;
  const list = getFaqsForLocale(locale).filter((f) => {
    const matchesPage = f.pageContexts.includes(pageContext);
    const matchesAudience =
      !audience ||
      audience === 'all' ||
      f.audiences.includes('all') ||
      f.audiences.includes(audience);
    return matchesPage && matchesAudience;
  });
  return typeof limit === 'number' ? list.slice(0, limit) : list;
}

export function getFaqsForCategory(
  category: FaqCategory,
  locale: LocaleCode = DEFAULT_LOCALE,
): FaqEntry[] {
  return getFaqsForLocale(locale).filter((f) => f.category === category);
}

export function findFaqById(id: string, locale: LocaleCode = DEFAULT_LOCALE): FaqEntry | undefined {
  return getFaqsForLocale(locale).find((f) => f.id === id);
}

/**
 * FAQ subset suitable for the global /jobs index — pulls candidate-
 * relevant entries (general + candidate categories) without requiring
 * every FAQ to be retagged with the `public-jobs` page context.
 *
 * Used by the FAQ accordion + FAQPage JSON-LD on /jobs and the curated
 * landings under /jobs/[...slug].
 */
export function getPublicJobsFaqs(locale: LocaleCode = DEFAULT_LOCALE, limit = 8): FaqEntry[] {
  const corpus = getFaqsForLocale(locale);
  const candidateFacing = corpus.filter(
    (f) =>
      f.category === 'general' || f.category === 'candidates' || f.category === 'account-security',
  );
  return candidateFacing.slice(0, limit);
}

/**
 * FAQ subset for the /companies index + curated company landings.
 * Pulls general + employer-relevant entries (employers' FAQ entries
 * are written in third-person voice that suits a candidate-reading-
 * about-companies framing too).
 */
export function getPublicCompaniesFaqs(locale: LocaleCode = DEFAULT_LOCALE, limit = 6): FaqEntry[] {
  const corpus = getFaqsForLocale(locale);
  const relevant = corpus.filter((f) => f.category === 'general' || f.category === 'employers');
  return relevant.slice(0, limit);
}

export {
  type FaqEntry,
  type FaqCategory,
  type FaqPageContext,
  type FaqAudience,
  type LocaleCode,
} from './types';

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, CATEGORY_LABELS } from './types';
