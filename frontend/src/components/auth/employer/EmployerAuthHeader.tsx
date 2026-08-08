'use client';

/**
 * Sticky header for the enhanced employer login / registration pages.
 * Mirrors the public site header (logo left, sticky + scroll blur) and carries
 * the chrome moved out of the auth form: an "Our Offerings" mega-dropdown
 * (employer services), the "…as Candidate" cross-link, the employer helpline,
 * and a "Contact us" button that opens the shared ContactModal.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Briefcase,
  Phone,
  MessageCircle,
  Menu,
  X,
  Building2,
  Search,
  Headphones,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/common/Logo';
import { ROUTES } from '@/constants/routes';
// Auth pages are pre-login → shared toll-free helpline (`signedIn` = false).
import { resolveEmployerHelpline, resolveEmployerHelplineHours } from '@/constants/support';
import TollFreeBadge from '@/components/support/TollFreeBadge';

const AUTH_HELPLINE = resolveEmployerHelpline(false);
const AUTH_HELPLINE_HOURS = resolveEmployerHelplineHours(false);
import ContactModal from '@/components/support/ContactModal';

interface OfferingItem {
  label: string;
  sublabel: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}
interface OfferingGroup {
  heading: string;
  items: OfferingItem[];
}

const OFFERINGS_COLUMNS: OfferingGroup[][] = [
  [
    {
      heading: 'Employer Services',
      items: [
        {
          label: 'Job Posting',
          sublabel: 'Post jobs & reach the right candidates fast',
          href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_job_post`,
          icon: Building2,
          badge: 'Free',
        },
        {
          label: 'CV Database / HireDex',
          sublabel: 'Search & unlock candidate CVs from the Talent Vault',
          href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_cv_database`,
          icon: Search,
        },
        {
          label: 'Assisted Hiring',
          sublabel: 'Our team sources matching CVs for your role',
          href: `${ROUTES.BILLING.PRICING_EMPLOYER}#employer_assisted_hiring`,
          icon: Headphones,
        },
      ],
    },
  ],
  [
    {
      heading: 'Vendor Services',
      items: [
        {
          label: 'Vendor Connect',
          sublabel: 'Receive hiring leads & connect with client companies',
          href: `${ROUTES.BILLING.PRICING_EMPLOYER}#vendor_connect`,
          icon: Users,
        },
      ],
    },
  ],
];

// `mode` is currently only consumed by the hidden candidate cross-link. It stays
// in the props contract (every call site passes it, and restoring the link needs
// it) rather than being churned out and back in.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function EmployerAuthHeader({ mode }: { mode: 'login' | 'register' }) {
  const [scrolled, setScrolled] = useState(false);
  const [offeringsOpen, setOfferingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const offeringsRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOfferingsOpen(false), 150);
  }, [cancelClose]);

  // Sticky scroll blur — same behavior as the public header.
  useEffect(() => {
    let last = false;
    const onScroll = () => {
      const s = window.scrollY > 10;
      if (s !== last) {
        last = s;
        setScrolled(s);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!offeringsOpen) return;
    const handler = (e: MouseEvent) => {
      if (offeringsRef.current && !offeringsRef.current.contains(e.target as Node)) {
        setOfferingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [offeringsOpen]);

  // Escape closes menus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOfferingsOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Only used by the candidate cross-link, which is temporarily hidden —
  // restore together with those two <Link> blocks below.
  // const candidateHref =
  //   mode === 'login' ? ROUTES.AUTH.LOGIN_CANDIDATE : ROUTES.AUTH.REGISTER_CANDIDATE;
  // const candidateLabel = mode === 'login' ? 'Sign in as Candidate' : 'Register as Candidate';

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'bg-white/80 shadow-sm backdrop-blur-lg'
          : 'border-b border-[var(--border)] bg-white',
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        {/* ── desktop nav ── */}
        <nav className="hidden items-center gap-1 lg:flex">
          {/* Our Offerings dropdown (clone of the public header "Services" menu) */}
          <div
            ref={offeringsRef}
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setOfferingsOpen(true);
            }}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              onClick={() => setOfferingsOpen((v) => !v)}
              onFocus={() => {
                cancelClose();
                setOfferingsOpen(true);
              }}
              aria-expanded={offeringsOpen}
              aria-haspopup="menu"
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                offeringsOpen
                  ? 'bg-primary-light text-primary'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
              )}
            >
              <Briefcase className="h-4 w-4" />
              Our Offerings
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', offeringsOpen && 'rotate-180')}
              />
            </button>
            {offeringsOpen && (
              <div
                role="menu"
                onMouseEnter={cancelClose}
                className="animate-scale-in absolute right-0 z-50 mt-2 w-[min(96vw,600px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-xl"
              >
                <div className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2">
                  {OFFERINGS_COLUMNS.map((column) => (
                    <div key={column[0].heading} className="space-y-6">
                      {column.map((group) => (
                        <div key={group.heading}>
                          <h4 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
                            {group.heading}
                          </h4>
                          <ul className="space-y-1">
                            {group.items.map((item) => {
                              const Icon = item.icon;
                              return (
                                <li key={item.href}>
                                  <Link
                                    href={item.href}
                                    onClick={() => setOfferingsOpen(false)}
                                    role="menuitem"
                                    className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
                                  >
                                    <div className="bg-primary/10 text-primary flex h-9 w-9 flex-none items-center justify-center rounded-lg">
                                      <Icon className="h-4.5 w-4.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-[var(--text)]">
                                          {item.label}
                                        </span>
                                        {item.badge && (
                                          <span className="bg-primary animate-blink inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase motion-reduce:animate-none">
                                            {item.badge}
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                        {item.sublabel}
                                      </p>
                                    </div>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <Link
                  href={ROUTES.BILLING.PRICING_EMPLOYER}
                  onClick={() => setOfferingsOpen(false)}
                  role="menuitem"
                  className="hover:text-primary flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 text-xs font-medium text-[var(--text-secondary)] transition-colors"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  See all employer plans
                </Link>
              </div>
            )}
          </div>

          {/* Employer helpline (compact — number visible from xl). Auth pages
              are pre-login, so this is the shared toll-free number; the
              dedicated employer line appears once inside the dashboard. */}
          <a
            href={AUTH_HELPLINE.href}
            title={`Employer helpline · ${AUTH_HELPLINE_HOURS}${
              AUTH_HELPLINE.tollFree ? ' · Toll-free' : ''
            }`}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            <Phone className="text-primary h-4 w-4" />
            <span className="hidden xl:inline">{AUTH_HELPLINE.display}</span>
            <span className="xl:hidden">Helpline</span>
          </a>

          {/* Cross-link to the candidate side — TEMPORARILY HIDDEN.
              Restore this block (and the mobile one below) when ready.
          <Link
            href={candidateHref}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            {candidateLabel} →
          </Link>
          */}

          {/* Contact us → opens the shared ContactModal */}
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="bg-primary hover:bg-primary-hover ml-1 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Contact us
          </button>
        </nav>

        {/* ── mobile actions ── */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            aria-label="Contact us"
            className="bg-primary hover:bg-primary-hover flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── mobile panel ── */}
      {mobileOpen && (
        <div className="animate-scale-in border-t border-[var(--border)] bg-white px-4 py-4 lg:hidden">
          <p className="mb-2 text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase">
            Our Offerings
          </p>
          <ul className="space-y-1">
            {OFFERINGS_COLUMNS.flat()
              .flatMap((g) => g.items)
              .map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <div className="bg-primary/10 text-primary flex h-8 w-8 flex-none items-center justify-center rounded-lg">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-[var(--text)]">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
          <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
            {/* Cross-link to the candidate side — TEMPORARILY HIDDEN (mobile).
                Restore alongside the desktop link above.
            <Link
              href={candidateHref}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              {candidateLabel} →
            </Link>
            */}
            <a
              href={AUTH_HELPLINE.href}
              className="flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <Phone className="text-primary h-4 w-4" />
              {AUTH_HELPLINE.display}
              {AUTH_HELPLINE.tollFree && <TollFreeBadge size="xs" />}
            </a>
          </div>
        </div>
      )}

      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        // Pre-login surface → shared toll-free number, not the dedicated line.
        defaultCategory="GENERAL"
      />
    </header>
  );
}
