'use client';

/**
 * Public marketing layout — also acts as the "in-app pricing" chrome
 * adapter so the sidebar's Plans tab on candidate/employer
 * dashboards lands logged-in users inside dashboard chrome instead of
 * the public marketing layout.
 *
 * Why it lives here (and not via a /candidate/pricing duplicate page):
 *   The pricing pages (`/pricing`, `/pricing/candidate`, `/pricing/employer`)
 *   already render `<PublicLayout>` from their own JSX. Adding a
 *   role-scoped `/candidate/pricing` route would either duplicate every
 *   pricing page or intercept it via Next.js parallel routes — both of
 *   which add maintenance surface. Switching the chrome *inside*
 *   PublicLayout based on (path, role) keeps a single source of truth.
 *
 * Why we don't render `<DashboardLayout>` directly:
 *   DashboardLayout owns its own auth gate, requiredRole check,
 *   useSessionTimeout, and EmployerPlanGuard. The pricing pages aren't
 *   role-scoped routes — they're public URLs that *also* render inside
 *   the app for logged-in users. Inlining the chrome (DashboardHeader
 *   + Sidebar + MobileSidebar) gives the same visual shell without
 *   re-running auth redirects that already fired upstream.
 *
 * Why client component:
 *   We need `usePathname()` + the zustand auth store. Both are client-
 *   only. PublicLayout was previously a server component, but its only
 *   responsibilities (rendering Header/Footer) don't need server-side
 *   work; downstream pages still keep their own `metadata` /
 *   `revalidate` / async data fetches since those are page-level
 *   features, not layout-level.
 *
 * Hydration:
 *   The auth store initialises with `user: null` on both server and
 *   client first paint, so SSR output matches the first client render
 *   (public chrome). After the store hydrates from the cookie/cache,
 *   the role becomes available and the chrome swaps in a normal React
 *   re-render — no hydration mismatch error.
 */

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DashboardHeader from './DashboardHeader';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import WhatsAppFloatingButton from '@/components/common/WhatsAppFloatingButton';
import { useAuthStore } from '@/store/auth.store';

interface PublicLayoutProps {
  children: React.ReactNode;
  /**
   * Opt this page's logged-in users into the in-app chrome (sidebar +
   * DashboardHeader) instead of the public marketing chrome. Used by
   * routes that double as both a public-deep-link and an in-app
   * destination — pricing, company detail, job detail — where a
   * signed-in user expects the surrounding app shell to stay put.
   *
   * Pricing pages are auto-detected via the pathname, so they don't
   * need to pass this. New page types should pass `inAppForLoggedIn`
   * directly to keep the swap explicit at the call site.
   */
  inAppForLoggedIn?: boolean;
}

function PublicChrome({
  children,
  hideFooterMegaSection,
}: {
  children: React.ReactNode;
  hideFooterMegaSection?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      {/*
        `-mt-20` pulls the body up under the still-`sticky` header so the first
        section starts at y=0 and its background runs behind the transparent
        top-state header. The height is given back INSIDE that section by the
        `under-public-header` class, so nothing moves and total page height is
        unchanged — see the "Public header overlay" block in globals.css.

        `data-public-chrome` scopes that class to this chrome only: the same
        page bodies render inside `InAppChrome` for logged-in users on
        pricing / company / job-detail / vendor routes, where the offset would
        be an 80px hole under `DashboardHeader`.
      */}
      <main data-public-chrome className="-mt-20 flex-1">
        {children}
      </main>
      <Footer hideMegaSection={hideFooterMegaSection} />
      {/*
        Public-only floating WhatsApp button. Mounted HERE rather than in the
        root layout (where BackToTop lives) precisely so it never appears on
        dashboard chrome — including the `InAppChrome` branch below, which
        logged-in candidates/employers get on /pricing, /vendors and company
        detail. It stacks directly above BackToTop; see the component.
      */}
      <WhatsAppFloatingButton />
    </div>
  );
}

function InAppChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--bg-secondary)]">
      <DashboardHeader />
      <MobileSidebar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default function PublicLayout({ children, inAppForLoggedIn }: PublicLayoutProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // Swap chrome on pricing and company-detail routes (path-detected) plus
  // any caller that opts in via `inAppForLoggedIn` (e.g. /jobs/<slug>
  // detail variant, which shares a catch-all route with listing pages so
  // can't be cleanly distinguished by path alone). Every other public
  // surface (homepage, about, jobs listing, etc.) keeps the marketing
  // layout even when the visitor is logged in.
  //
  // The /companies listing index (`/companies`) and its tag/filter
  // sub-indexes (`/companies/category/...`, `/companies/in/...`, etc.)
  // stay public. Only the detail page `/companies/<slug>` (and its
  // nested review subpages) swap into the dashboard chrome — that's
  // where a logged-in user is likely deep-linked from inside the app
  // (e.g. via "View company" on a job card) and would expect the
  // surrounding sidebar/header to stay put.
  const isPricingRoute = pathname?.startsWith('/pricing') ?? false;
  const isCompanyDetailRoute = /^\/companies\/(?!$|category\/|collection\/|in\/|industry\/)/.test(
    pathname ?? '',
  );
  // The public recruitment-partner directory (/vendors and /vendors/<slug>)
  // is a marketing surface for guests, but an authenticated employer reaches
  // it from their dashboard ("Recruitment Partners" nav) to hire a vendor —
  // so they keep the dashboard chrome, same treatment as /pricing.
  const isVendorsRoute = pathname?.startsWith('/vendors') ?? false;
  const wantsInApp =
    isPricingRoute || isCompanyDetailRoute || isVendorsRoute || Boolean(inAppForLoggedIn);
  // ADMIN / SUPER_ADMIN have their own portals — they shouldn't see the
  // candidate/employer sidebar chrome on these surfaces.
  const isInAppRole = user?.role === 'CANDIDATE' || user?.role === 'EMPLOYER';

  if (wantsInApp && isInAppRole) {
    return <InAppChrome>{children}</InAppChrome>;
  }

  // Suppress the footer mega-section on `/pricing/employer` only. The
  // employer pricing page is a focused conversion surface — the
  // mega-section's "Find Jobs / Popular Jobs / Jobs by Department"
  // grid is candidate-side content that doesn't serve the employer
  // intent on this page and competes with the primary CTA. Other
  // pricing pages and every other public page keep the mega-section.
  const hideFooterMegaSection = pathname === '/pricing/employer';

  return <PublicChrome hideFooterMegaSection={hideFooterMegaSection}>{children}</PublicChrome>;
}
