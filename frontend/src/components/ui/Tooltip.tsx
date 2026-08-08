'use client';

import {
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Preferred position. Defaults to 'auto' which picks the best fit. */
  position?: TooltipPosition | 'auto';
  className?: string;
  /**
   * Render the wrapper as an inline `<span>` (display: inline-flex) instead of
   * the default block `<div>` (flex flex-col). Use this when the trigger lives
   * inside inline text / a `<p>` (a block `<div>` there is invalid HTML and
   * breaks the inline flow).
   */
  inline?: boolean;
}

const arrowStyles: Record<TooltipPosition, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--text)] border-x-transparent border-b-transparent',
  bottom:
    'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--text)] border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--text)] border-y-transparent border-r-transparent',
  right:
    'right-full top-1/2 -translate-y-1/2 border-r-[var(--text)] border-y-transparent border-l-transparent',
};

const GAP = 8;
const PADDING = 8;

function fitsInViewport(trigger: DOMRect, tw: number, th: number, pos: TooltipPosition): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = trigger.left + trigger.width / 2;
  const cy = trigger.top + trigger.height / 2;

  switch (pos) {
    case 'top':
      return (
        trigger.top - th - GAP > PADDING && cx - tw / 2 > PADDING && cx + tw / 2 < vw - PADDING
      );
    case 'bottom':
      return (
        trigger.bottom + th + GAP < vh - PADDING &&
        cx - tw / 2 > PADDING &&
        cx + tw / 2 < vw - PADDING
      );
    case 'left':
      return (
        trigger.left - tw - GAP > PADDING && cy - th / 2 > PADDING && cy + th / 2 < vh - PADDING
      );
    case 'right':
      return (
        trigger.right + tw + GAP < vw - PADDING &&
        cy - th / 2 > PADDING &&
        cy + th / 2 < vh - PADDING
      );
  }
}

function resolvePosition(
  trigger: DOMRect,
  tw: number,
  th: number,
  preferred: TooltipPosition | 'auto',
): TooltipPosition {
  if (preferred !== 'auto' && fitsInViewport(trigger, tw, th, preferred)) return preferred;
  const order: TooltipPosition[] = ['top', 'bottom', 'right', 'left'];
  for (const pos of order) {
    if (fitsInViewport(trigger, tw, th, pos)) return pos;
  }
  return 'bottom';
}

function getCoords(
  trigger: DOMRect,
  tw: number,
  th: number,
  pos: TooltipPosition,
): { top: number; left: number } {
  let top: number;
  let left: number;

  switch (pos) {
    case 'top':
      top = trigger.top - th - GAP;
      left = trigger.left + trigger.width / 2 - tw / 2;
      break;
    case 'bottom':
      top = trigger.bottom + GAP;
      left = trigger.left + trigger.width / 2 - tw / 2;
      break;
    case 'left':
      top = trigger.top + trigger.height / 2 - th / 2;
      left = trigger.left - tw - GAP;
      break;
    case 'right':
      top = trigger.top + trigger.height / 2 - th / 2;
      left = trigger.right + GAP;
      break;
  }

  // Clamp to keep tooltip within viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  top = Math.max(PADDING, Math.min(top, vh - th - PADDING));
  left = Math.max(PADDING, Math.min(left, vw - tw - PADDING));

  return { top, left };
}

const SHOW_DELAY = 600;

function Tooltip({
  content,
  children,
  position = 'auto',
  className,
  inline = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef<HTMLElement | null>(null);
  // Callback ref so the same ref works whether the wrapper is a <div> or <span>.
  const setWrapperRef = useCallback((el: HTMLElement | null) => {
    wrapperRef.current = el;
  }, []);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!isVisible || !wrapperRef.current || !el) return;
    // Position relative to the first child element (the actual trigger),
    // not the wrapper div, so tooltip centers on the visible element.
    const trigger = wrapperRef.current.firstElementChild ?? wrapperRef.current;
    const triggerRect = trigger.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const resolved = resolvePosition(triggerRect, tw, th, position);
    const coords = getCoords(triggerRect, tw, th, resolved);
    // Direct DOM update to avoid setState in effect
    el.style.top = `${coords.top}px`;
    el.style.left = `${coords.left}px`;
    el.classList.add('animate-fade-in');
    const arrow = el.querySelector<HTMLSpanElement>('[data-arrow]');
    if (arrow) arrow.className = `absolute border-4 ${arrowStyles[resolved]}`;
  }, [isVisible, position]);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setIsVisible(true), SHOW_DELAY);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setIsVisible(false);
  }, []);
  const onPointerEnter = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') show();
    },
    [show],
  );
  const onFocusIn = useCallback(
    (e: ReactFocusEvent) => {
      if ((e.target as HTMLElement).matches?.(':focus-visible')) show();
    },
    [show],
  );

  const tip =
    isVisible &&
    content &&
    createPortal(
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{ position: 'fixed', top: -9999, left: -9999 }}
        className={cn(
          'pointer-events-none z-[9999] rounded-md bg-[var(--text)] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-[var(--shadow-md)]',
          className,
        )}
      >
        {content}
        <span data-arrow className="absolute border-4 border-transparent" />
      </div>,
      document.body,
    );

  const handlers = {
    onPointerEnter,
    onPointerLeave: hide,
    onFocus: onFocusIn,
    onBlur: hide,
  };

  // Inline variant: a <span> (inline-flex) is valid inside <p>/inline text,
  // unlike the default block <div>, and keeps the trigger in the text flow.
  if (inline) {
    return (
      <span ref={setWrapperRef} className="inline-flex" {...handlers}>
        {children}
        {tip}
      </span>
    );
  }
  return (
    <div ref={setWrapperRef} className="flex min-w-0 flex-col" {...handlers}>
      {children}
      {tip}
    </div>
  );
}

Tooltip.displayName = 'Tooltip';

export default Tooltip;
