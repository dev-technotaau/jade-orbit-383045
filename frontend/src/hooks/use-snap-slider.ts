'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSnapSlider — geometry-driven controller for a horizontal scroll-snap
 * slider. Fixes the old copy-pasted engine whose index desynced from actual
 * scroll: prev/next disabled state, page count and active page are all derived
 * from real scroll geometry, so they stay correct on manual swipe/trackpad
 * scroll and at any viewport width.
 *
 * Attach `trackRef` to the scroll container and `onScroll={sync}` to it, and
 * call `sync()` whenever the item count changes.
 */
export function useSnapSlider<T extends HTMLElement = HTMLUListElement>() {
  const trackRef = useRef<T>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [activePage, setActivePage] = useState(0);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setAtStart(scrollLeft <= 1);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
    setPageCount(Math.max(1, Math.round(scrollWidth / clientWidth)));
    setActivePage(clientWidth > 0 ? Math.round(scrollLeft / clientWidth) : 0);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);

  const scrollByPage = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' });
  }, []);

  return { trackRef, atStart, atEnd, pageCount, activePage, sync, scrollByPage, scrollToPage };
}
