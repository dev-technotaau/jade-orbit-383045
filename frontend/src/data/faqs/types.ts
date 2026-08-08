/**
 * Multi-locale FAQ system.
 *
 * Locales are split into per-language files (faqs.en.ts, faqs.hi.ts, etc.)
 * with the same `id` order so `getFaqsForLocale(locale)` is just a lookup.
 * The English file is the canonical source — translations fall back to
 * English when missing so a half-translated locale never shows blanks.
 *
 * Each FAQ is tagged with:
 *   - `category`     — drives the tabbed UI on /help
 *   - `pageContexts` — drives the per-page modal filter (e.g. show only
 *                      'login' + 'pricing-employer' FAQs in the modal on
 *                      `/auth/login/employer`)
 *   - `audiences`    — drives role-aware filtering (candidate / employer /
 *                      vendor / all)
 *   - `keywords`     — additional search-only terms (synonyms, common
 *                      misspellings, related concepts) used by fuzzy search
 */

export type FaqCategory =
  | 'general'
  | 'account-security'
  | 'candidates'
  | 'employers'
  | 'vendors'
  | 'billing-payments';

export type FaqPageContext =
  | 'home'
  | 'login'
  | 'register'
  | 'login-candidate'
  | 'login-employer'
  | 'register-candidate'
  | 'register-employer'
  | 'pricing'
  | 'pricing-employer'
  | 'pricing-candidate'
  | 'pricing-detail'
  | 'onboarding-candidate'
  | 'onboarding-employer'
  | 'dashboard-candidate'
  | 'dashboard-employer'
  // Public discovery surfaces — drive FAQPage JSON-LD on curated
  // landings + the global /jobs and /companies indexes.
  | 'public-jobs'
  | 'public-companies'
  | 'public-job-detail'
  | 'public-company-detail';

// 'vendor' = an employer using the Vendor Connect add-on (vendor is a
// purchasable capability on an employer account, not a separate role).
export type FaqAudience = 'all' | 'candidate' | 'employer' | 'vendor';

export interface FaqEntry {
  id: string;
  category: FaqCategory;
  audiences: FaqAudience[];
  pageContexts: FaqPageContext[];
  keywords: string[];
  question: string;
  answer: string;
}

export type LocaleCode = 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr';

export const SUPPORTED_LOCALES: { code: LocaleCode; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export const CATEGORY_LABELS: Record<FaqCategory, Record<LocaleCode, string>> = {
  general: {
    en: 'General',
    hi: 'सामान्य',
    ta: 'பொது',
    te: 'సాధారణ',
    bn: 'সাধারণ',
    mr: 'सामान्य',
  },
  'account-security': {
    en: 'Account & Security',
    hi: 'खाता और सुरक्षा',
    ta: 'கணக்கு & பாதுகாப்பு',
    te: 'ఖాతా & భద్రత',
    bn: 'অ্যাকাউন্ট ও নিরাপত্তা',
    mr: 'खाते व सुरक्षा',
  },
  candidates: {
    en: 'For Candidates',
    hi: 'उम्मीदवारों के लिए',
    ta: 'வேட்பாளர்களுக்கு',
    te: 'అభ్యర్థుల కోసం',
    bn: 'প্রার্থীদের জন্য',
    mr: 'उमेदवारांसाठी',
  },
  employers: {
    en: 'For Employers',
    hi: 'नियोक्ताओं के लिए',
    ta: 'வேலைவாய்ப்பு வழங்குநர்களுக்கு',
    te: 'యజమానుల కోసం',
    bn: 'নিয়োগকর্তাদের জন্য',
    mr: 'नियोक्त्यांसाठी',
  },
  vendors: {
    en: 'Vendor Connect',
    hi: 'वेंडर कनेक्ट',
    ta: 'வெண்டர் கனெக்ட்',
    te: 'వెండర్ కనెక్ట్',
    bn: 'ভেন্ডর কানেক্ট',
    mr: 'व्हेंडर कनेक्ट',
  },
  'billing-payments': {
    en: 'Billing & Payments',
    hi: 'बिलिंग और भुगतान',
    ta: 'பில்லிங் & கட்டணங்கள்',
    te: 'బిల్లింగ్ & చెల్లింపులు',
    bn: 'বিলিং ও পেমেন্ট',
    mr: 'बिलिंग व पेमेंट',
  },
};
