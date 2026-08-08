'use client';

import { useEffect, useState, type RefObject } from 'react';

type Placement = 'top' | 'bottom';

/**
 * Decides whether an absolute-positioned dropdown should open above or below
 * its trigger, based on available viewport space.
 *
 * Problem it fixes: when an `absolute top-full` dropdown opens near the bottom
 * of the viewport, it extends past the page bottom. The browser grows the
 * scrollable area to accommodate it, producing a visible blank strip below
 * the page. Flipping upward when there's no room below prevents this — page
 * height stays constant whether the dropdown is open or closed.
 *
 * Usage:
 *   const placement = usePopoverPlacement(triggerRef, isOpen);
 *   <div className={placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} />
 *
 * @param triggerRef Ref to the trigger element (button, input, or the relative
 *                   container that anchors the dropdown)
 * @param isOpen     Controlled open state — re-measures when this flips to true
 * @param estimatedHeight Upper bound on dropdown height in px. Defaults to 300.
 *                   If `spaceBelow < estimatedHeight` and `spaceAbove > spaceBelow`,
 *                   the placement flips to 'top'.
 */
export function usePopoverPlacement(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  estimatedHeight: number = 300,
): Placement {
  const [placement, setPlacement] = useState<Placement>('bottom');

  // We need to measure the trigger's position in the viewport — that's only
  // possible after render. Placement is derived from DOM geometry, not from
  // props/state, so the "compute during render" rule doesn't apply here.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacement(spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
  }, [isOpen, triggerRef, estimatedHeight]);

  return placement;
}
