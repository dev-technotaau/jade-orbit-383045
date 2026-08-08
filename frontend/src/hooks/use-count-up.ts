'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpOptions {
  /** Animation length in ms. */
  duration?: number;
  /** Fraction of the element visible before it starts. */
  threshold?: number;
}

/**
 * useCountUp — animate a number from 0 to `target` once it scrolls into view.
 *
 * Returns a `ref` to attach to the element to observe and the current `value`.
 * Honors `prefers-reduced-motion` (jumps straight to the target) and only ever
 * fires once. rAF-timestamp based (no Date.now / performance.now dependency).
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(
  target: number,
  { duration = 1600, threshold = 0.4 }: CountUpOptions = {},
) {
  const [value, setValue] = useState(0);
  const ref = useRef<T>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        // Reduced-motion / non-positive target: jump straight to the value.
        if (reduce || target <= 0) {
          setValue(target);
          return;
        }

        let startTs = 0;
        const tick = (now: number) => {
          if (!startTs) startTs = now;
          const t = Math.min(1, (now - startTs) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
          setValue(Math.round(target * eased));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, threshold]);

  return { value, ref };
}
