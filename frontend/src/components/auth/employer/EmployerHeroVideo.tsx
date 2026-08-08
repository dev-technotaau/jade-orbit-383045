'use client';

/**
 * EmployerHeroVideo — the employer auth hero background video with a smooth,
 * crossfaded loop.
 *
 * WHY THE CROSSFADE EXISTS. The ORIGINAL stock clip did not loop seamlessly, so
 * the native `loop` attribute hard-cut from the last frame back to the first and
 * read as a jarring jump. This component stacks two copies and dissolves opacity
 * across the seam: as the playing copy nears its end, the other starts from 0
 * and they crossfade, hiding the cut.
 *
 * CURRENT ASSET (1920x1080, 8s) was generated to loop seamlessly, which would
 * make this component redundant — a single `<video loop muted playsInline>`
 * would do, and would halve the decoding work by dropping the second element
 * and its `preload="auto"`. That simplification is deliberately NOT applied yet
 * because the loop has not been verified: it needs a human to watch the seam.
 * If the loop is clean, delete this file and inline a plain <video loop>. If it
 * is not, this keeps working exactly as before — the crossfade is harmless over
 * a seamless clip, it just costs a second decoder.
 *
 * Client component (needs refs + timeupdate); the parent shell stays a server
 * component. Background/decoration only — muted, aria-hidden, light-mode.
 */

import { useEffect, useRef, useState } from 'react';

const SRC = '/videos/employer_auth_banner.mp4';
/** Crossfade window over the loop seam, in seconds (clip is 8s). */
const FADE = 0.7;

export default function EmployerHeroVideo() {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef<HTMLVideoElement | null>(null);
  const swapping = useRef(false);
  const [showB, setShowB] = useState(false);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    activeRef.current = a;
    void a.play().catch(() => {});

    // When the active copy nears its end, start the other from 0 and crossfade.
    const onTime = (e: Event) => {
      const cur = e.currentTarget as HTMLVideoElement;
      if (cur !== activeRef.current || swapping.current) return;
      const d = cur.duration;
      if (!d || Number.isNaN(d) || cur.currentTime < d - FADE) return;

      swapping.current = true;
      const other = cur === a ? b : a;
      other.currentTime = 0;
      void other.play().catch(() => {});
      activeRef.current = other;
      setShowB(other === b);

      // Once the crossfade has covered the seam, park the old copy at frame 0
      // so it's ready for its next turn.
      window.setTimeout(() => {
        cur.pause();
        cur.currentTime = 0;
        swapping.current = false;
      }, FADE * 1000);
    };

    a.addEventListener('timeupdate', onTime);
    b.addEventListener('timeupdate', onTime);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      b.removeEventListener('timeupdate', onTime);
    };
  }, []);

  const base =
    'absolute inset-0 h-full w-full object-cover object-center transition-opacity ease-linear';
  const style = { transitionDuration: `${FADE}s` };

  return (
    <>
      <video
        ref={aRef}
        muted
        playsInline
        autoPlay
        preload="auto"
        aria-hidden
        className={`${base} ${showB ? 'opacity-0' : 'opacity-100'}`}
        style={style}
      >
        <source src={SRC} type="video/mp4" />
      </video>
      <video
        ref={bRef}
        muted
        playsInline
        preload="auto"
        aria-hidden
        className={`${base} ${showB ? 'opacity-100' : 'opacity-0'}`}
        style={style}
      >
        <source src={SRC} type="video/mp4" />
      </video>
    </>
  );
}
