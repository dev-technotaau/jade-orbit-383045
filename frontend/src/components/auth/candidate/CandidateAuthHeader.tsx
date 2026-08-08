'use client';

/**
 * Sticky header for the enhanced candidate login / registration pages.
 * Mirrors the public site header (logo left, sticky + scroll blur) and carries
 * the chrome moved out of the auth form: an "Our Offerings" mega-dropdown
 * (candidate services), the "…as Employer" cross-link, the support helpline,
 * and a "Contact us" button that opens the shared ContactModal.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Compass,
  Phone,
  MessageCircle,
  Menu,
  X,
  Search,
  Building2,
  Sparkles,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/common/Logo';
import { ROUTES } from '@/constants/routes';
import { GENERIC_HELPLINE, GENERIC_HELPLINE_HOURS } from '@/constants/support';
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
      heading: 'Find Work',
      items: [
        {
          label: 'Search Jobs',
          sublabel: 'Browse thousands of live jobs across India',
          href: ROUTES.PUBLIC.JOBS,
          icon: Search,
        },
        {
          label: 'Browse Companies',
          sublabel: 'Explore companies hiring right now',
          href: '/companies',
          icon: Building2,
        },
      ],
    },
  ],
  [
    {
      heading: 'Grow Your Career',
      items: [
        {
          label: 'Premium Profile',
          sublabel: 'Stand out to recruiters & unlock premium perks',
          href: `${ROUTES.BILLING.PRICING_CANDIDATE}#candidate_premium`,
          icon: Sparkles,
          badge: 'Premium',
        },
        {
          label: 'AI Resume Builder',
          sublabel: 'Create an ATS-friendly resume in minutes',
          href: ROUTES.BILLING.PRICING_CANDIDATE,
          icon: FileText,
        },
      ],
    },
  ],
];

// `mode` is currently only consumed by the hidden employer cross-link. It stays
// in the props contract (every call site passes it, and restoring the link needs
// it) rather than being churned out and back in.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CandidateAuthHeader({ mode }: { mode: 'login' | 'register' }) {
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

  // Only used by the employer cross-link, which is temporarily hidden —
  // restore together with those two <Link> blocks below.
  // const employerHref =
  //   mode === 'login' ? ROUTES.AUTH.LOGIN_EMPLOYER : ROUTES.AUTH.REGISTER_EMPLOYER;
  // const employerLabel = mode === 'login' ? 'Sign in as Employer' : 'Register as Employer';

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
              <Compass className="h-4 w-4" />
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
                                          <span className="bg-primary inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
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
                  href={ROUTES.BILLING.PRICING_CANDIDATE}
                  onClick={() => setOfferingsOpen(false)}
                  role="menuitem"
                  className="hover:text-primary flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3 text-xs font-medium text-[var(--text-secondary)] transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  See candidate plans
                </Link>
              </div>
            )}
          </div>

          <a
            href={GENERIC_HELPLINE.href}
            title={`Helpline · ${GENERIC_HELPLINE_HOURS}`}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            <Phone className="text-primary h-4 w-4" />
            <span className="hidden xl:inline">{GENERIC_HELPLINE.display}</span>
            <span className="xl:hidden">Helpline</span>
          </a>

          {/* Cross-link to the employer side — TEMPORARILY HIDDEN.
              Restore this block (and the mobile one below) when ready.
          <Link
            href={employerHref}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            {employerLabel} →
          </Link>
          */}

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
            {/* Cross-link to the employer side — TEMPORARILY HIDDEN (mobile).
                Restore alongside the desktop link above.
            <Link
              href={employerHref}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              {employerLabel} →
            </Link>
            */}
            <a
              href={GENERIC_HELPLINE.href}
              className="flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <Phone className="text-primary h-4 w-4" />
              {GENERIC_HELPLINE.display}
            </a>
          </div>
        </div>
      )}

      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
