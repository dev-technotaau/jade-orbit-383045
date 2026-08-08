'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Close a popover / dropdown when a `mousedown` lands outside `ref`.
 *
 * Prefer this over a full-screen `fixed inset-0` click-catcher overlay. Such an
 * overlay sits on top of everything to catch the outside click, but because it
 * is `position: fixed` it swallows wheel events and does NOT scroll-chain to the
 * modal/page beneath it — so while the popover is open the underlying content
 * can only be scrolled when the cursor happens to be over the (absolutely
 * positioned) menu itself. A document listener has neither problem: nothing
 * overlays the scrollable area, so scrolling keeps working everywhere.
 *
 * @param ref     Wrapper element that counts as "inside" (trigger + menu).
 * @param handler Called on an outside `mousedown` (typically closes the popover).
 * @param enabled Usually the popover's open state — the listener only runs while
 *                true, so a closed popover adds no global listener.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled = true,
): void {
  // Keep the latest handler in a ref so callers can pass an inline arrow
  // without the document listener re-subscribing on every render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    function onMouseDown(e: MouseEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) handlerRef.current();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [ref, enabled]);
}
