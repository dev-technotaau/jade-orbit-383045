import Logo from '@/components/common/Logo';
import ManageCookiesButton from '@/components/common/ManageCookiesButton';
import PaymentMethodsBar from '@/components/common/PaymentMethodsBar';
import TrustBadges from '@/components/common/TrustBadges';
import Tooltip from '@/components/ui/Tooltip';
import FooterMegaSection from '@/components/layout/FooterMegaSection';
import { ROUTES } from '@/constants/routes';
import Link from 'next/link';

const footerLinks = {
  company: [
    { label: 'About Us', href: ROUTES.PUBLIC.ABOUT },
    { label: 'Contact Us', href: ROUTES.PUBLIC.CONTACT },
    { label: 'Careers', href: ROUTES.PUBLIC.CONTACT },
    { label: 'Press', href: ROUTES.PUBLIC.CONTACT },
    { label: 'Vendors', href: ROUTES.VENDORS_PUBLIC.LIST },
  ],
  jobSeekers: [
    { label: 'Browse Jobs', href: ROUTES.PUBLIC.JOBS },
    { label: 'Career Advice', href: ROUTES.PUBLIC.HELP },
    { label: 'Resume Builder', href: ROUTES.AUTH.LOGIN_CANDIDATE },
    { label: 'Salary Guide', href: ROUTES.PUBLIC.HELP },
    { label: 'Companies', href: ROUTES.PUBLIC.COMPANIES },
  ],
  employers: [
    { label: 'Post a Job', href: ROUTES.AUTH.REGISTER_EMPLOYER },
    { label: 'Search Candidates', href: ROUTES.AUTH.LOGIN_EMPLOYER },
    { label: 'Pricing', href: ROUTES.PUBLIC.CONTACT },
    { label: 'Employer Resources', href: ROUTES.PUBLIC.HELP },
    { label: 'Hiring Solutions', href: ROUTES.BILLING.PRICING_EMPLOYER },
  ],
  support: [
    { label: 'Help Center', href: ROUTES.PUBLIC.HELP },
    { label: 'Privacy Policy', href: ROUTES.PUBLIC.PRIVACY },
    { label: 'Terms of Service', href: ROUTES.PUBLIC.TERMS },
    { label: 'Accessibility', href: ROUTES.PUBLIC.ACCESSIBILITY },
    { label: 'Forgot Password', href: ROUTES.AUTH.FORGOT_PASSWORD },
  ],
  legal: [
    { label: 'Cookie Policy', href: ROUTES.PUBLIC.COOKIE_POLICY },
    { label: 'Refund Policy', href: ROUTES.PUBLIC.REFUND_POLICY },
    { label: 'Disclaimer', href: ROUTES.PUBLIC.DISCLAIMER },
    { label: 'Site Map', href: ROUTES.PUBLIC.SITEMAP },
  ],
};

interface FooterProps {
  /**
   * When true, suppress the mega-section ("Find Jobs / Popular Jobs /
   * Jobs by Department") and render only the standard footer columns.
   * Used on focused conversion pages (e.g. /pricing/employer) where the
   * mega-section's dense job-discovery links compete with the page's
   * primary CTA and dilute scroll attention.
   *
   * Passed down by PublicLayout based on the current pathname so each
   * page doesn't have to know about its own footer chrome.
   */
  hideMegaSection?: boolean;
}

export default function Footer({ hideMegaSection = false }: FooterProps) {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Footer mega-section (Phase 11) — Find Jobs / Popular Jobs /
          Jobs by Department. Stacked above the existing footer columns
          and visually separated by a thin horizontal divider. Suppressed
          via `hideMegaSection` on focused conversion pages. */}
      {!hideMegaSection && <FooterMegaSection />}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Company */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
              Company
            </h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Tooltip content={`Go to ${link.label}`}>
                    <Link
                      href={link.href}
                      className="hover:text-primary text-sm text-[var(--text-secondary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>

          {/* Job Seekers */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
              Job Seekers
            </h3>
            <ul className="space-y-3">
              {footerLinks.jobSeekers.map((link) => (
                <li key={link.label}>
                  <Tooltip content={`Go to ${link.label}`}>
                    <Link
                      href={link.href}
                      className="hover:text-primary text-sm text-[var(--text-secondary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>

          {/* Employers */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
              Employers
            </h3>
            <ul className="space-y-3">
              {footerLinks.employers.map((link) => (
                <li key={link.label}>
                  <Tooltip content={`Go to ${link.label}`}>
                    <Link
                      href={link.href}
                      className="hover:text-secondary text-sm text-[var(--text-secondary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
              Support
            </h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.label}>
                  <Tooltip content={`Go to ${link.label}`}>
                    <Link
                      href={link.href}
                      className="hover:text-primary text-sm text-[var(--text-secondary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
              Legal
            </h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Tooltip content={`Go to ${link.label}`}>
                    <Link
                      href={link.href}
                      className="hover:text-primary text-sm text-[var(--text-secondary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </Tooltip>
                </li>
              ))}
              <li>
                <ManageCookiesButton />
              </li>
            </ul>
          </div>
        </div>

        {/* Payments accepted — single flat row (no per-rail headings)
            so all Cards / UPI / Wallets / Net Banking logos sit on the
            same horizontal line under the centered title. */}
        <div className="mt-12 border-t border-[var(--border)] pt-10">
          <h3 className="mb-5 text-center text-sm font-semibold tracking-wider text-[var(--text)] uppercase">
            Payments we accept
          </h3>
          <PaymentMethodsBar variant="compact" className="justify-center" />
        </div>

        {/* Trust & credibility badges */}
        <div className="mt-10 border-t border-[var(--border)] pt-8">
          <TrustBadges />
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-8 sm:flex-row">
          <Logo size="md" />
          <p className="text-sm text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Hire Adda. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
