'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Global navigation progress bar.
 *
 * ── Why this starts on CLICK ──
 * It used to trigger off `pathname !== prev`, which only becomes true once the
 * new route has COMMITTED — its own comment admitted it ran "after page already
 * rendered". So it animated after the wait rather than during it, and the only
 * thing covering the real click→paint gap was the root `app/loading.tsx`
 * full-screen spinner.
 *
 * That spinner was removed because it was a Suspense fallback: React streamed it
 * inline and parked the real page in `<div hidden id="S:0">`, so non-JS crawlers
 * (Bing) saw ~38 words of "Loading..." on every URL instead of the content. A
 * progress bar cannot cause that — it renders outside the content tree and
 * suspends nothing.
 *
 * ── Why the click decision is deferred one macrotask ──
 * The listener is on the CAPTURE phase, so it runs BEFORE React's own handlers.
 * Buttons nested inside a `<Link>` (e.g. "mark as read" in notifications, which
 * calls `e.preventDefault()`) would otherwise start a bar for a navigation that
 * never happens, leaving it stuck until the safety timeout. Deferring lets the
 * bubble-phase `preventDefault()` land first, so `defaultPrevented` is accurate.
 */

/** Hard stop. The bar must never hang if a navigation is cancelled. */
const SAFETY_MS = 2500;

export default function TopLoadingBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const prevPath = useRef(pathname);
  const active = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fade = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clearInterval(tick.current);
    clearTimeout(safety.current);
    setProgress(100);
    fade.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
  }, []);

  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    clearTimeout(fade.current);
    setVisible(true);
    setProgress(15);
    tick.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.random() * 12));
    }, 180);
    // A cancelled navigation never changes `pathname`, so the completion effect
    // below would never fire. This guarantees the bar always clears.
    safety.current = setTimeout(finish, SAFETY_MS);
  }, [finish]);

  /* ── Start: internal link clicks ── */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Let the browser handle new-tab / new-window / download / non-primary.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      // Same-origin, path-changing navigations only. This filters out mailto:,
      // tel:, external hosts, and pure `#hash` links in one check.
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      const target = new URL(href, window.location.origin);
      if (target.pathname === window.location.pathname) return;

      // Deferred so a bubble-phase preventDefault() is visible — see the note
      // in the file header.
      setTimeout(() => {
        if (!e.defaultPrevented) start();
      }, 0);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [start]);

  /* ── Start: back / forward ── */
  useEffect(() => {
    const onPop = () => {
      // Gated on the path actually changing. Hash-only and query-only history
      // entries (the "Skip to main content" link, filter updates) leave
      // `pathname` untouched, so an ungated start() would hang to SAFETY_MS.
      if (window.location.pathname !== prevPath.current) start();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [start]);

  /* ── Finish: the new route committed ── */
  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Deferred out of the effect body: setting state synchronously during an
    // effect trips react-hooks/set-state-in-effect and forces an extra render
    // pass. The previous implementation used queueMicrotask here for the same
    // reason.
    queueMicrotask(() => {
      if (active.current) {
        finish();
        return;
      }
      // A navigation we never saw begin — `router.push()` from code, which
      // emits no click. Brief post-commit flash, matching the previous
      // behaviour so this is never worse than before.
      active.current = true;
      setVisible(true);
      setProgress(80);
      fade.current = setTimeout(finish, 120);
    });
  }, [pathname, finish]);

  /* ── Unmount ── */
  useEffect(
    () => () => {
      clearInterval(tick.current);
      clearTimeout(safety.current);
      clearTimeout(fade.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[300] h-0.5">
      <div
        className="bg-primary h-full transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
