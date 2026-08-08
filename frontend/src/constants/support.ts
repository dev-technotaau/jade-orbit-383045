/**
 * Support contact information used across modals, footers, and dashboard
 * widgets. Single source of truth — change a value here and it propagates
 * everywhere.
 *
 * The employer helpline is a separate, dedicated number for signed-in
 * employers (and recruiters, including employers with the Vendor Connect
 * add-on). It is reserved for signed-in employer surfaces only — see
 * `resolveEmployerHelpline`. Everywhere else (public pages, auth pages,
 * pricing pages) shows the shared toll-free helpline, so every visitor
 * sees one consistent contact number before signing in.
 */

export interface SupportPhone {
  /** Display value with country-code spacing for visual scan. */
  display: string;
  /** Tel-URI value (E.164, no spaces). */
  href: string;
  /** Toll-free line — renders a "Toll-free" badge beside the number. */
  tollFree?: boolean;
}

export const SUPPORT_EMAIL = 'support@hireadda.in';

/**
 * Shared toll-free helpline. Shown on /help, /contact, as the candidate /
 * vendor-directory / pre-purchase support number, AND as the employer
 * helpline on every pre-login surface (auth + pricing + public pages).
 */
export const GENERIC_HELPLINE: SupportPhone = {
  display: '+91 1762469136',
  href: 'tel:+911762469136',
  // The "Toll-free" badge is hidden site-wide — flip this back to `true` to
  // restore it everywhere. Every surface that shows the badge (help page,
  // ContactModal, AuthSupportFooter, EmployerHelplineBanner, EmployerAuthHeader)
  // gates on this one flag, so nothing else needs touching either way. The
  // number itself is unchanged; only the badge and the matching " · Toll-free"
  // tooltip suffix are suppressed.
  tollFree: false,
};

/**
 * Dedicated employer helpline — surfaced ONLY once the employer is signed
 * in and inside their own area:
 *   - /employer dashboard
 *   - Employer onboarding
 *
 * Pre-login employer surfaces (/pricing/employer, the employer login and
 * register pages, /help) intentionally show `GENERIC_HELPLINE` instead, via
 * `resolveEmployerHelpline`.
 *
 * Mon–Sat 09:00–18:00 IST. tel:-link only (no WhatsApp per business
 * preference).
 */
export const EMPLOYER_HELPLINE: SupportPhone = {
  display: '+91 73740 11333',
  href: 'tel:+917374011333',
};

export const EMPLOYER_HELPLINE_HOURS = 'Mon–Sat, 9:00 AM – 6:00 PM IST';
export const GENERIC_HELPLINE_HOURS = 'Mon–Fri, 9:00 AM – 6:00 PM IST';

/**
 * Picks the number to show in an "employer helpline" slot.
 *
 * `signedInEmployerSurface` must be true ONLY for surfaces that live behind
 * employer auth (the /employer dashboard and employer onboarding). Public,
 * auth and pricing surfaces pass false (the default at every call site) so
 * they show the shared toll-free number.
 */
export function resolveEmployerHelpline(signedInEmployerSurface: boolean): SupportPhone {
  return signedInEmployerSurface ? EMPLOYER_HELPLINE : GENERIC_HELPLINE;
}

/** Support hours that match whichever number `resolveEmployerHelpline` returned. */
export function resolveEmployerHelplineHours(signedInEmployerSurface: boolean): string {
  return signedInEmployerSurface ? EMPLOYER_HELPLINE_HOURS : GENERIC_HELPLINE_HOURS;
}

/**
 * WhatsApp support channel.
 *
 * Surfaced ONLY to plans that include `feature.whatsapp_priority`,
 * `feature.whatsapp_support`, or `feature.priority_support`:
 *   - Candidate Premium (₹199)            → Priority WhatsApp Support
 *   - Employer Standard (₹499)            → WhatsApp Support
 *   - Employer Premium (₹999)             → Priority WhatsApp Support
 *   - CV Pro (₹3999)                      → Priority Support (incl. WhatsApp)
 *   - Assisted Hiring (₹1499)             → WhatsApp Support
 *   - Vendor Connect (₹199/mo)            → WhatsApp Support
 *
 * Priority tier (HIGH ticket priority on the backend, ≤30 min response
 * SLA in copy) vs Standard tier (HIGH priority but ≤24 h SLA copy) is
 * signalled by the feature flag set the user holds.
 */
export interface WhatsappContact {
  /** Display value with country-code spacing for visual scan. */
  display: string;
  /** wa.me/ deep-link form (no plus sign, includes country code). */
  href: string;
  /** Tel-URI form (E.164 with plus). */
  telHref: string;
  /** E.164 form for schema.org telephone fields. */
  e164: string;
}

export const WHATSAPP_SUPPORT: WhatsappContact = {
  display: '+91 80540 50551',
  href: 'https://wa.me/918054050551',
  telHref: 'tel:+918054050551',
  e164: '+91-8054050551',
};

export const WHATSAPP_PRIORITY_SLA = 'Replies typically within 30 minutes';
export const WHATSAPP_STANDARD_SLA = 'Replies typically within a few hours';
export const WHATSAPP_AVAILABILITY = 'Mon–Sat, 9:00 AM – 9:00 PM IST';

/**
 * Pre-filled WhatsApp message that opens when the user taps the chat
 * link. Includes the user's plan + ticket-priority context so the
 * support agent can triage instantly.
 */
export function buildWhatsappChatUrl(presetMessage?: string): string {
  if (!presetMessage) return WHATSAPP_SUPPORT.href;
  return `${WHATSAPP_SUPPORT.href}?text=${encodeURIComponent(presetMessage)}`;
}
