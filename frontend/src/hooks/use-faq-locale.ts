'use client';

/**
 * Persistent FAQ locale across modals + the /help page. Reads `?lang=` from
 * the URL first (so deep-linked Hindi /help?lang=hi works), then localStorage
 * (so the user's choice persists across sessions), then falls back to
 * DEFAULT_LOCALE. Updates write to BOTH so a cross-tab open of /help picks
 * up the change.
 *
 * Not bound to a route segment — single language picker drives every FAQ
 * surface (modals, help page, per-page FAQ sections).
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleCode } from '@/data/faqs';

const STORAGE_KEY = 'ha_faq_locale';
const VALID_CODES = new Set<LocaleCode>(SUPPORTED_LOCALES.map((l) => l.code));

function isValidLocale(value: string | null | undefined): value is LocaleCode {
  return !!value && VALID_CODES.has(value as LocaleCode);
}

function readInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (isValidLocale(fromUrl)) return fromUrl;
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (isValidLocale(fromStorage)) return fromStorage;
  } catch {
    /* localStorage may be blocked — fall through to default */
  }
  return DEFAULT_LOCALE;
}

export function useFaqLocale(): {
  locale: LocaleCode;
  setLocale: (next: LocaleCode) => void;
} {
  // Use SSR-safe initial state. The actual user-preferred locale is hydrated
  // in an effect to avoid SSR/CSR mismatch on the first paint.
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(readInitialLocale());
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore storage errors (incognito, quota) */
    }
  }, []);

  return { locale, setLocale };
}
