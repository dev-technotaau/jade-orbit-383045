'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  // Cache the scrollable page height so we don't read
  // `documentElement.scrollHeight` on every scroll event — that read
  // forces a synchronous layout (Lighthouse "forced reflow" warning).
  // The height only changes when content/viewport changes, so we
  // re-measure via ResizeObserver on <body> instead.
  const docHeightRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    let lastVisible = false;
    let lastProgressBucket = -1;

    const measureDocHeight = () => {
      docHeightRef.current = document.documentElement.scrollHeight - window.innerHeight;
    };
    measureDocHeight();

    const onScroll = () => {
      // Batch DOM reads + state writes inside rAF so the scroll
      // listener never triggers a forced reflow mid-tick — and we
      // collapse multiple scroll events fired within a single frame
      // into one render.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const scrollTop = window.scrollY;
        const docHeight = docHeightRef.current;
        const nextVisible = scrollTop > 400;
        if (nextVisible !== lastVisible) {
          lastVisible = nextVisible;
          setVisible(nextVisible);
        }
        // Quantise progress to whole percent — the only consumer is
        // the SVG ring + a `Math.round(progress * 100)` tooltip label,
        // so anything finer just churns React without visual change.
        const raw = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
        const bucket = Math.round(raw * 100);
        if (bucket !== lastProgressBucket) {
          lastProgressBucket = bucket;
          setProgress(bucket / 100);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measureDocHeight, { passive: true });

    // Re-measure when content streams in (lazy sections, fonts
    // affecting line-height, images decoding) — ResizeObserver fires
    // on any body height change so the doc-height cache stays fresh
    // without re-reading on every scroll tick.
    const observer = new ResizeObserver(measureDocHeight);
    observer.observe(document.body);

    // Prime the initial visibility/progress without waiting for the
    // first scroll event.
    onScroll();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measureDocHeight);
      observer.disconnect();
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <Tooltip content={`Scroll to top · ${Math.round(progress * 100)}%`}>
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Scroll to top"
        className={`fixed right-6 bottom-6 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        {/* Progress ring */}
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 44 44" fill="none">
          {/* Background track */}
          <circle
            cx="22"
            cy="22"
            r={RADIUS}
            stroke="var(--border)"
            strokeWidth="2.5"
            fill="var(--bg)"
          />
          {/* Progress arc */}
          <circle
            cx="22"
            cy="22"
            r={RADIUS}
            stroke="var(--color-primary)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="transition-none"
          />
        </svg>
        {/* Arrow icon */}
        <ArrowUp className="relative z-10 h-4.5 w-4.5 text-[var(--text)]" />
      </button>
    </Tooltip>
  );
}
