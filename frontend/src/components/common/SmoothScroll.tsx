'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

/**
 * Global smooth scroll provider using Lenis.
 * - Disabled on touch devices (native momentum scroll is better)
 * - Doesn't affect overflow:auto/scroll containers (modals, sidebars, dropdowns)
 * - Pauses during hash navigation for instant jumps
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Skip on touch devices — native momentum scroll is smoother
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 0, // Disable Lenis on touch (handled by guard above)
      infinite: false,
    });

    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Override native scrollIntoView to use Lenis
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
      // If called with { behavior: 'instant' } or boolean, use native
      if (typeof arg === 'boolean' || (arg && arg.behavior === 'instant')) {
        originalScrollIntoView.call(this, arg);
        return;
      }
      // If element is inside a data-lenis-prevent container (dropdowns, sidebars,
      // modal bodies), use native scrollIntoView so only that scrollable parent
      // moves — not the whole page. Lenis hijacking would scroll the page instead.
      if ((this as HTMLElement).closest?.('[data-lenis-prevent]')) {
        originalScrollIntoView.call(this, arg);
        return;
      }
      // Use Lenis for smooth scrolling on regular page elements
      lenis.scrollTo(this as HTMLElement, {
        offset: 0,
        duration: 0.8,
      });
    };

    return () => {
      lenis.destroy();
      lenisRef.current = null;
      Element.prototype.scrollIntoView = originalScrollIntoView;
    };
  }, []);

  // Hash-anchor navigation. Lenis owns the page scroll, so the browser's
  // native scroll-to-#fragment (and Next's <Link> hash scroll) is overridden
  // by Lenis's RAF loop and never lands on the target — that's why deep links
  // like /pricing/employer#vendor_connect only ever worked on a hard reload.
  // Drive the scroll through Lenis instead (with a sticky-header offset),
  // retrying until the section has mounted after a client-side navigation.
  // Falls back to native scrollIntoView on touch devices (Lenis disabled).
  useEffect(() => {
    const HEADER_OFFSET = 96; // clears the sticky h-20 (80px) header

    const scrollToId = (id: string) => {
      // Ignore empty + data-style fragments (e.g. the OAuth callback's
      // #access_token=…&refresh_token=…) — they're not anchor targets.
      if (!id || id.includes('=') || id.includes('&')) return;
      let tries = 0;
      const attempt = () => {
        const el = document.getElementById(id);
        if (el) {
          const lenis = lenisRef.current;
          if (lenis) {
            lenis.resize();
            lenis.scrollTo(el, { offset: -HEADER_OFFSET, duration: 0.9 });
          } else {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        // Section may still be mounting after a client-side navigation.
        if (tries++ < 25) window.setTimeout(attempt, 60);
      };
      requestAnimationFrame(attempt);
    };

    const scrollToCurrentHash = () => {
      const raw = window.location.hash;
      if (!raw || raw === '#') return;
      scrollToId(decodeURIComponent(raw.slice(1)));
    };

    // Same-page anchor clicks (e.g. clicking a "Services" menu item while
    // already on that pricing page) don't change the pathname, and Next's
    // pushState doesn't fire `hashchange` — so neither the effect re-run nor
    // the listener below would catch them. Handle those at click time.
    const onDocClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.(
        'a[href*="#"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const hashIndex = href.indexOf('#');
      if (hashIndex < 0) return;
      const path = href.slice(0, hashIndex);
      const id = decodeURIComponent(href.slice(hashIndex + 1));
      // Only handle links targeting the current page — cross-page links are
      // handled by the pathname effect once navigation completes.
      if (path === '' || path === window.location.pathname) {
        // Defer so Next can update the URL hash first; we scroll by id.
        window.setTimeout(() => scrollToId(id), 0);
      }
    };

    scrollToCurrentHash();
    window.addEventListener('hashchange', scrollToCurrentHash);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('hashchange', scrollToCurrentHash);
      document.removeEventListener('click', onDocClick);
    };
  }, [pathname]);

  return <>{children}</>;
}
