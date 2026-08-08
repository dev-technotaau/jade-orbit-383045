'use client';

/**
 * HeroShowcase — the homepage hero's right-hand visual: a bespoke, fully
 * hand-authored "Hire Adda Hiring Console" mockup with choreographed
 * hover/click motion. Replaces the old generic stock `hero-illustration.svg`.
 *
 * WHY INLINE SVG (not an image, not canvas/WebGL)
 *   - It removes a 42 KB request from the LCP path — the hero is above the
 *     fold, so this is a measurable perf win, not just a stylistic choice.
 *   - Every sub-element is individually addressable, which is what makes the
 *     motion design possible at all.
 *   - It stays crisp at any DPR, themes off the design tokens, and keeps a
 *     real accessible name. A <canvas> would forfeit all three.
 *
 * WHY GSAP, LAZY-LOADED
 *   Reversible, overlapping, timeline-based choreography is GSAP's core
 *   strength. It is imported dynamically inside an effect so none of it is on
 *   the critical path — the SVG paints immediately, motion attaches after.
 *
 * ACCESSIBILITY / RESILIENCE
 *   The *static* SVG is deliberately authored in its finished state (query
 *   typed, rings filled, counts populated). So with no JS, or under
 *   `prefers-reduced-motion`, it still reads as a complete, polished product
 *   shot. Hover then RE-animates that state rather than revealing it from
 *   empty — no flash of blank UI, and nothing is motion-dependent.
 *
 * The whole thing is decorative: `aria-hidden` on the art, with a single
 * descriptive label on the wrapper for assistive tech.
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * Minimal structural type for the bits of a GSAP timeline we touch. Declared
 * locally rather than importing GSAP's namespace so this module carries no
 * value-level dependency on gsap — the library is only ever pulled in through
 * the dynamic import inside the effect.
 */
type Timeline = {
  play: () => void;
  reverse: () => void;
  restart: () => void;
  progress: () => number;
  reversed: () => boolean;
  kill: () => void;
};

type HotspotId = 'search' | 'job-0' | 'job-1' | 'job-2' | 'ai' | 'pipeline';

/** Job rows in the mock results list. `match` drives the ring + counter. */
const JOB_ROWS = [
  { title: 'Senior React Developer', meta: 'TechCorp · Bangalore', pay: '28 LPA', match: 94 },
  { title: 'DevOps Engineer', meta: 'CloudScale · Hyderabad', pay: '22 LPA', match: 88 },
  { title: 'Product Designer', meta: 'StudioNine · Remote', pay: '18 LPA', match: 81 },
] as const;

/**
 * Pipeline stages — the connectors between them carry the flowing dots.
 * `x` is an ABSOLUTE viewBox coordinate (no wrapper transform), chosen so all
 * four nodes sit inside the pipeline card's 150→480 span with even padding.
 *
 * Only stages the product actually supports belong here. "Interview" was
 * removed because interview scheduling is not a shipped feature — the hero
 * must not advertise something a visitor cannot do. "Offered" maps to the
 * real OFFERED application status, so the funnel stays truthful.
 */
const STAGES = [
  { label: 'Applied', count: 248, x: 192 },
  { label: 'Shortlist', count: 61, x: 274 },
  { label: 'Offered', count: 12, x: 356 },
  { label: 'Hired', count: 9, x: 438 },
] as const;

const ROW_Y = [152, 214, 276] as const;
const SEARCH_QUERY = 'React Developer';

/*
 * NOTE ON EXPANDING RINGS — do not "optimise" these back to `scale`.
 *
 * Every growing circle here animates its `r` ATTRIBUTE, never `scale`. A
 * circle's r grows about its own (cx, cy) by definition, so the ring stays
 * perfectly concentric with whatever it surrounds — no transform-origin maths
 * is involved and nothing can drift.
 *
 * Two earlier attempts with `scale` both failed: a CSS-style
 * `transformOrigin: '50% 50%'` makes GSAP derive the origin from getBBox()
 * (which for the pipeline's "Hired" ring scaled it up-and-left off the node),
 * and `svgOrigin` supplied as a GSAP function-based value is not resolved for
 * that property, so it silently fell back to the same broken origin.
 */

export default function HeroShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  /** Hover timelines, keyed by hotspot. Populated once GSAP resolves. */
  const tls = useRef<Partial<Record<HotspotId, Timeline>>>({});
  /** One-shot click timelines (apply burst / flow replay). */
  const clickTls = useRef<Partial<Record<HotspotId, Timeline>>>({});
  const reducedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let ctx: { revert: () => void } | undefined;

    (async () => {
      const [{ gsap }, motionPath] = await Promise.all([
        import('gsap'),
        import('gsap/MotionPathPlugin'),
      ]);
      if (cancelled || !rootRef.current) return;
      gsap.registerPlugin(motionPath.MotionPathPlugin);

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      reducedRef.current = reduced;

      ctx = gsap.context(() => {
        const q = gsap.utils.selector(rootRef);
        const root = rootRef.current!;

        /* ── Ambient idle motion ─────────────────────────────────────────
           Low amplitude, and running ONLY while the hero is on screen.
           Skipped entirely when the user asks for reduced motion.

           Every repeating tween is collected into `ambient` so the visibility
           gate further down can pause the whole set together. These are
           `repeat: -1`, so left ungated they would tick for the entire life
           of the page — including the `live-ring` one, which animates an SVG
           geometry attribute (`r`) and so re-lays-out and repaints the SVG on
           every frame. A hero scrolled far out of view must cost the rest of
           the page nothing. */
        const ambient: ReturnType<typeof gsap.to>[] = [];

        if (!reduced) {
          // NOTE: the layers' "free float" is NOT a tween. It is folded into
          // the single ticker below together with the pointer parallax, because
          // two tweens writing `y` on the same element fight each other every
          // frame and the result visibly stutters.
          //
          // "Live" dot in the window chrome.
          ambient.push(
            gsap.to(q('[data-el="live"]'), {
              opacity: 0.25,
              duration: 0.9,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            }),
          );
          // Radar "ping" behind the live dot — grows via `r` so it stays
          // centred on the dot (see the expanding-rings note above).
          ambient.push(
            gsap.fromTo(
              q('[data-el="live-ring"]'),
              { attr: { r: 3 }, opacity: 0.6 },
              {
                attr: { r: 9 },
                opacity: 0,
                duration: 1.8,
                ease: 'power2.out',
                repeat: -1,
              },
            ),
          );
          // Periodic sheen sweeping across the window glass.
          ambient.push(
            gsap.fromTo(
              q('[data-el="sheen"]'),
              { xPercent: -140, opacity: 0 },
              {
                xPercent: 260,
                opacity: 1,
                duration: 2.4,
                ease: 'power2.inOut',
                repeat: -1,
                repeatDelay: 5,
              },
            ),
          );
          // Sparkles drifting on the AI card.
          ambient.push(
            gsap.to(q('[data-el="drift"]'), {
              y: -7,
              opacity: 0.35,
              duration: 2.2,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
              stagger: { each: 0.35, from: 'random' },
            }),
          );

          /* Mount entrance — floating cards settle in once. Deliberately NOT
             added to `ambient`: it is a 0.7s one-shot that finishes and then
             costs nothing, and pausing it would strand the cards at opacity 0
             if the observer reported the hero off-screen at load.
             Deliberately opacity + scale only: `y` belongs to the float/parallax
             ticker, and animating it here too would make the cards jitter for
             the first 0.7s. Different transform properties compose fine. */
          gsap.from(q('[data-entrance]'), {
            opacity: 0,
            scale: 0.94,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.09,
            transformOrigin: '50% 50%',
          });

          /* Start the repeating set PAUSED so it matches the visibility
             gate's initial `running = false`. GSAP plays tweens the moment
             they are created, so without this the gate's `want === running`
             early-out would read "already stopped" for a hero that loads off
             screen and would never actually pause them. */
          for (const t of ambient) t.pause();
        }

        /* ── Free float + pointer parallax (single writer) ───────────────
           Both effects translate the same layer groups, so they MUST be
           produced by one place. Previously a repeating `y` tween and a
           quickTo `y` setter both wrote the same property every frame and
           fought, which read as jerky floating.

           Here one ticker computes, per layer:
               y = smoothed(pointer.y * depth) + sin(time) * floatAmp
           and commits it with a single gsap.set — no competing tweens, and
           the sine keeps the drift perfectly continuous (no yoyo turnaround
           to stutter on). Depth + period differ per layer for parallax. */
        if (!reduced) {
          const layers = (
            [
              // sel, parallax depth (px), float amplitude (px), period (s), phase
              ['[data-layer="back"]', 6, 0, 0, 0],
              ['[data-layer="near"]', 12, 5, 7.5, 0],
              ['[data-layer="mid"]', 20, 6.5, 6.5, 2.1],
              ['[data-layer="far"]', 30, 8, 5.5, 4.2],
            ] as const
          ).map(([sel, depth, amp, period, phase]) => ({
            els: q(sel),
            depth,
            amp,
            // radians per second
            w: period ? (Math.PI * 2) / period : 0,
            phase,
            cx: 0,
            cy: 0,
          }));

          /* PERF — the single most important line in this file.
             Every layer group contains a child carrying an SVG drop-shadow
             filter (#hs-soft at 681, #hs-card at 1010/1141/1258/1294).
             Transforming a subtree that contains a filter invalidates that
             filter's cached raster, so without promotion the browser re-runs
             a stdDeviation 9-14 blur over the filter region on EVERY frame —
             and #hs-card's region is 220%x400% of its bbox, i.e. 8.8x the
             card's own area.

             Promoting each animated layer lets the filtered content
             rasterize ONCE; subsequent frames only composite the transform.
             Measured on a 90-card stress build driven by setAttribute
             ('transform', ...) exactly as GSAP drives SVG: 23fps before,
             60fps after — identical to the same scene with no filters at
             all. Tightening the filter region or swapping to a CSS
             drop-shadow only reached ~1.5x, and both would have altered the
             rendered shadow.

             Applied from JS rather than the markup so the hint exists ONLY
             while the layers are actually moving — never under reduced
             motion, and never while the hero is off screen. `will-change`
             reserves GPU memory for a composited layer, so leaving it on six
             idle groups would trade one problem for another. The visibility
             gate below owns calling this. */
          const setPromoted = (on: boolean) => {
            for (const l of layers) {
              for (const el of l.els) el.style.willChange = on ? 'transform' : '';
            }
          };

          // Normalised pointer offset (-0.5 … 0.5), 0,0 when not hovering.
          let px = 0;
          let py = 0;
          const onMove = (e: PointerEvent) => {
            const r = root.getBoundingClientRect();
            px = (e.clientX - r.left) / r.width - 0.5;
            py = (e.clientY - r.top) / r.height - 0.5;
          };
          const onLeave = () => {
            px = 0;
            py = 0;
          };

          const tick = () => {
            const t = gsap.ticker.time;
            // Frame-rate independent smoothing, so it feels the same at 60/120Hz.
            const k = Math.min(1, 0.09 * gsap.ticker.deltaRatio());
            for (const l of layers) {
              l.cx += (px * l.depth - l.cx) * k;
              l.cy += (py * l.depth - l.cy) * k;
              const fy = l.amp ? Math.sin(t * l.w + l.phase) * l.amp : 0;
              gsap.set(l.els, { x: l.cx, y: l.cy + fy });
            }
          };

          /* PERF — the hero does NO work unless it is on screen and the tab is
             foregrounded. Previously all of this ran for the entire life of
             the page: a user reading the FAQ at the bottom was still paying
             for hero parallax and four infinite tweens every frame, competing
             with the TrustMarquee loop and the jobs carousel, and still
             holding six promoted compositor layers.

             The gate covers all three costs together:
               1. the per-frame float/parallax ticker,
               2. the repeating ambient tweens (incl. the `r`-attribute radar
                  ping, which repaints the SVG every frame),
               3. the will-change GPU layers.

             Pausing is visually free because the float is `sin(absolute
             time)` — a pure function of the clock, not an accumulator. It is
             sampled at whatever value the clock has on resume, so there is no
             discontinuity to jump over, no matter how long it was stopped.
             The ambient tweens resume from their own paused playheads. */
          let onScreen = false;
          let running = false;
          const sync = () => {
            const want = onScreen && !document.hidden;
            if (want === running) return;
            running = want;
            setPromoted(want);
            if (want) {
              gsap.ticker.add(tick);
              for (const t of ambient) t.resume();
            } else {
              gsap.ticker.remove(tick);
              for (const t of ambient) t.pause();
            }
          };

          const io = new IntersectionObserver(
            (entries) => {
              onScreen = entries[0]?.isIntersecting ?? false;
              sync();
            },
            { threshold: 0 },
          );
          io.observe(root);
          document.addEventListener('visibilitychange', sync);
          root.addEventListener('pointermove', onMove);
          root.addEventListener('pointerleave', onLeave);
          // Returned cleanup runs on ctx.revert().
          return () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', sync);
            if (running) gsap.ticker.remove(tick);
            root.removeEventListener('pointermove', onMove);
            root.removeEventListener('pointerleave', onLeave);
            setPromoted(false);
          };
        }
      }, rootRef);

      /* ── Hotspot timelines ─────────────────────────────────────────────
         Built paused + reversible. Under reduced motion we build nothing;
         the static SVG already shows the finished state. */
      if (reduced) return;

      const q = gsap.utils.selector(rootRef);
      const mk = () => gsap.timeline({ paused: true });

      /** Tween a numeric text node from → to. */
      const countTo = (sel: string, from: number, to: number, suffix = '') => {
        const el = q(sel)[0];
        if (!el) return gsap.to({}, { duration: 0 });
        const obj = { v: from };
        return gsap.to(obj, {
          v: to,
          duration: 0.9,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = `${Math.round(obj.v)}${suffix}`;
          },
        });
      };

      /* SEARCH — retype the query, sweep a scan line, restagger results. */
      {
        const tl = mk();
        const text = q('[data-el="q-text"]')[0];
        const typed = { n: SEARCH_QUERY.length };
        tl.to(q('[data-el="field-kw"]'), { stroke: '#1e5caf', duration: 0.2 }, 0)
          .to(q('[data-el="caret"]'), { opacity: 1, duration: 0.1 }, 0)
          .to(
            typed,
            {
              n: 0,
              duration: 0.22,
              ease: 'none',
              onUpdate: () => {
                if (text) text.textContent = SEARCH_QUERY.slice(0, Math.round(typed.n));
              },
            },
            0,
          )
          .to(
            typed,
            {
              n: SEARCH_QUERY.length,
              duration: 0.75,
              ease: 'none',
              onUpdate: () => {
                if (text) text.textContent = SEARCH_QUERY.slice(0, Math.round(typed.n));
              },
            },
            0.24,
          )
          .fromTo(
            q('[data-el="loc-text"]'),
            { opacity: 0.35, x: -3 },
            { opacity: 1, x: 0, duration: 0.3 },
            0.7,
          )
          .to(
            q('[data-el="search-btn"]'),
            { scale: 1.06, duration: 0.16, yoyo: true, repeat: 1, transformOrigin: '50% 50%' },
            0.95,
          )
          // Scan line sweeps the result list.
          .fromTo(q('[data-el="scan"]'), { opacity: 0, y: 0 }, { opacity: 1, duration: 0.12 }, 1.0)
          .to(q('[data-el="scan"]'), { y: 176, duration: 0.7, ease: 'power1.inOut' }, 1.05)
          .to(q('[data-el="scan"]'), { opacity: 0, duration: 0.2 }, 1.6)
          // Rows re-enter behind the sweep.
          .fromTo(
            q('[data-row]'),
            { opacity: 0.45, x: -8 },
            { opacity: 1, x: 0, duration: 0.4, stagger: 0.12, ease: 'power2.out' },
            1.15,
          )
          .to(q('[data-el="field-kw"]'), { stroke: '#cbd5e1', duration: 0.3 }, 1.7)
          .to(q('[data-el="caret"]'), { opacity: 0, duration: 0.2 }, 1.7);
        tls.current.search = tl;
      }

      /* JOB ROWS — lift, redraw match ring, count %, pop skill chips. */
      JOB_ROWS.forEach((job, i) => {
        const tl = mk();
        const ring = `[data-row="${i}"] [data-el="ring-fg"]`;
        tl.to(`[data-row="${i}"] [data-el="row-bg"]`, {
          y: -3,
          duration: 0.28,
          ease: 'power2.out',
        })
          // Full opacity — the filter itself already scales the shadow's alpha.
          .to(`[data-row="${i}"] [data-el="row-shadow"]`, { opacity: 1, duration: 0.28 }, 0)
          .to(`[data-row="${i}"] [data-el="row-content"]`, { y: -3, duration: 0.28 }, 0)
          .to(`[data-row="${i}"] [data-el="row-bg"]`, { stroke: '#1e5caf', duration: 0.28 }, 0)
          // Ring redraws from 0 → match%.
          .fromTo(
            ring,
            { strokeDashoffset: 1 },
            { strokeDashoffset: 1 - job.match / 100, duration: 0.85, ease: 'power2.out' },
            0.05,
          )
          .add(countTo(`[data-row="${i}"] [data-el="pct"]`, 0, job.match), 0.05)
          // Skill chips + verified tick.
          .fromTo(
            `[data-row="${i}"] [data-el="chip"]`,
            { opacity: 0, scale: 0.7, y: 4 },
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.3,
              stagger: 0.07,
              ease: 'back.out(2.2)',
              transformOrigin: '50% 50%',
            },
            0.18,
          )
          .fromTo(
            `[data-row="${i}"] [data-el="vtick"]`,
            { strokeDashoffset: 1 },
            { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' },
            0.3,
          );
        tls.current[`job-${i}` as HotspotId] = tl;

        /* Click → "apply" burst + Applied chip. Reversible on second click. */
        const ctl = mk();
        ctl
          .fromTo(
            ring,
            { strokeDashoffset: 1 - job.match / 100 },
            { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' },
            0,
          )
          .to(`[data-row="${i}"] [data-el="ring-fg"]`, { stroke: '#22c55e', duration: 0.3 }, 0)
          .fromTo(
            `[data-row="${i}"] [data-el="applied"]`,
            { opacity: 0, scale: 0.6, y: 6 },
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.42,
              ease: 'back.out(3)',
              transformOrigin: '50% 50%',
            },
            0.15,
          )
          // Triple ripple out of the match ring. `r` again, so all three stay
          // concentric with the ring they burst from.
          .fromTo(
            `[data-row="${i}"] [data-el="burst"]`,
            { attr: { r: 13 }, opacity: 1 },
            {
              attr: { r: 38 },
              opacity: 0,
              duration: 0.7,
              ease: 'power2.out',
              stagger: 0.05,
            },
            0.15,
          );
        clickTls.current[`job-${i}` as HotspotId] = ctl;
      });

      /* AI MATCH — gauge sweeps, counter runs, resume "parse" lines scan. */
      {
        const tl = mk();
        tl.fromTo(
          q('[data-el="gauge-fg"]'),
          { strokeDashoffset: 1 },
          { strokeDashoffset: 1 - 0.94 * 0.75, duration: 1.1, ease: 'power2.out' },
          0,
        )
          .add(countTo('[data-el="gauge-pct"]', 0, 94, '%'), 0)
          .to(
            q('[data-el="gauge-head"]'),
            {
              rotate: 0.94 * 270 - 135,
              duration: 1.1,
              ease: 'power2.out',
              transformOrigin: '0px 0px',
            },
            0,
          )
          .fromTo(
            q('[data-el="parse-line"]'),
            { scaleX: 0, opacity: 0.3 },
            {
              scaleX: 1,
              opacity: 1,
              duration: 0.4,
              stagger: 0.12,
              ease: 'power2.out',
              transformOrigin: 'left center',
            },
            0.25,
          )
          .fromTo(
            q('[data-el="parse-scan"]'),
            { opacity: 0, y: -2 },
            { opacity: 1, y: 26, duration: 0.75, ease: 'power1.inOut' },
            0.3,
          )
          .to(q('[data-el="parse-scan"]'), { opacity: 0, duration: 0.2 }, 1.05)
          // Sparkles pop in. `r` again — a scale would make each one appear to
          // fly in from elsewhere rather than grow in place.
          .fromTo(
            q('[data-el="spark"]'),
            { attr: { r: 0 }, opacity: 0 },
            {
              attr: { r: 2.6 },
              opacity: 1,
              duration: 0.4,
              stagger: 0.08,
              ease: 'back.out(3)',
            },
            0.5,
          )
          .to(q('[data-el="ai-card"]'), { y: -5, duration: 0.35, ease: 'power2.out' }, 0);
        tls.current.ai = tl;
      }

      /* PIPELINE — connectors light up, dots FLOW along them, counts tick. */
      {
        const tl = mk();
        q('[data-el="pipe-path"]').forEach((el, i) => {
          // gsap.utils.selector() is typed for HTML elements; these are SVG
          // paths, and MotionPathPlugin needs the real SVGPathElement.
          const path = el as unknown as SVGPathElement;
          const at = i * 0.42;
          tl.fromTo(
            path,
            { strokeDashoffset: 1 },
            { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' },
            at,
          )
            // A dot literally travels the connector via MotionPath.
            .fromTo(
              q(`[data-el="pipe-dot"][data-i="${i}"]`),
              { opacity: 0 },
              { opacity: 1, duration: 0.12 },
              at,
            )
            .to(
              q(`[data-el="pipe-dot"][data-i="${i}"]`),
              {
                motionPath: { path, align: path, alignOrigin: [0.5, 0.5] as [number, number] },
                duration: 0.62,
                ease: 'power1.inOut',
              },
              at,
            )
            .to(q(`[data-el="pipe-dot"][data-i="${i}"]`), { opacity: 0, duration: 0.15 }, at + 0.55)
            // Receiving node reacts.
            .to(
              q(`[data-el="pipe-node"][data-i="${i + 1}"]`),
              { scale: 1.16, duration: 0.2, yoyo: true, repeat: 1, transformOrigin: '50% 50%' },
              at + 0.5,
            );
        });
        STAGES.forEach((s, i) => {
          tl.add(countTo(`[data-el="pipe-count"][data-i="${i}"]`, 0, s.count), i * 0.14);
        });
        // Final "hired" celebration ring. Grows via `r`, so it stays exactly
        // concentric with the node (the node circle is r=14 at the same cx/cy).
        tl.fromTo(
          q('[data-el="hired-ring"]'),
          { attr: { r: 13 }, opacity: 0.9 },
          {
            attr: { r: 32 },
            opacity: 0,
            duration: 0.9,
            ease: 'power2.out',
          },
          1.3,
        ).to(q('[data-el="pipe-card"]'), { y: -4, duration: 0.35, ease: 'power2.out' }, 0);
        tls.current.pipeline = tl;
      }
    })();

    return () => {
      cancelled = true;
      Object.values(tls.current).forEach((t) => t?.kill());
      Object.values(clickTls.current).forEach((t) => t?.kill());
      tls.current = {};
      clickTls.current = {};
      ctx?.revert();
    };
  }, []);

  const enter = useCallback((id: HotspotId) => {
    if (reducedRef.current) return;
    tls.current[id]?.play();
  }, []);
  const leave = useCallback((id: HotspotId) => {
    if (reducedRef.current) return;
    tls.current[id]?.reverse();
  }, []);
  /** Click toggles the one-shot timeline where one exists, else replays hover. */
  const activate = useCallback((id: HotspotId) => {
    if (reducedRef.current) return;
    const ctl = clickTls.current[id];
    if (ctl) {
      // Reversed/at-zero → play forward; otherwise rewind.
      if (ctl.progress() === 0 || ctl.reversed()) ctl.play();
      else ctl.reverse();
      return;
    }
    tls.current[id]?.restart();
  }, []);

  /** Shared props for an interactive hotspot group. */
  const hot = (id: HotspotId) => ({
    onMouseEnter: () => enter(id),
    onMouseLeave: () => leave(id),
    onClick: () => activate(id),
    style: { cursor: 'pointer' } as const,
  });

  return (
    <div
      ref={rootRef}
      // Same 600×500 footprint as the illustration it replaces, so the hero
      // grid geometry (and therefore CLS) is unchanged.
      className="relative w-full select-none"
      role="img"
      aria-label="Hire Adda hiring console — job search results with AI match scores and a candidate pipeline"
    >
      <svg viewBox="0 0 600 500" className="h-auto w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="hs-logo-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#1e5caf" />
          </linearGradient>
          <linearGradient id="hs-logo-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="hs-logo-c" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c084fc" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id="hs-btn" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f6fc0" />
            <stop offset="1" stopColor="#1e5caf" />
          </linearGradient>
          <linearGradient id="hs-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hs-scan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1e5caf" stopOpacity="0" />
            <stop offset="0.5" stopColor="#1e5caf" stopOpacity="0.85" />
            <stop offset="1" stopColor="#1e5caf" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hs-gauge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0ea5e9" />
            <stop offset="0.55" stopColor="#1e5caf" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <radialGradient id="hs-blob-a">
            <stop offset="0" stopColor="#1e5caf" stopOpacity="0.22" />
            <stop offset="1" stopColor="#1e5caf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hs-blob-b">
            <stop offset="0" stopColor="#f5880a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#f5880a" stopOpacity="0" />
          </radialGradient>
          <pattern id="hs-dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#1e5caf" fillOpacity="0.13" />
          </pattern>
          <clipPath id="hs-win-clip">
            <rect x="24" y="64" width="400" height="356" rx="18" />
          </clipPath>
          {/* Tall enough to fully contain all three rows (last ends at y=328)
              plus room for their hover lift, so nothing gets sheared off. */}
          <clipPath id="hs-results-clip">
            <rect x="36" y="138" width="376" height="196" />
          </clipPath>
          <filter id="hs-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="14"
              floodColor="#0f172a"
              floodOpacity="0.13"
            />
          </filter>
          {/* Shadow-ONLY filter. Deliberately never merges SourceGraphic, so
              the element it is applied to contributes nothing but its blurred,
              offset silhouette. Using feDropShadow here instead would paint
              the source rect too — a hard dark slab rather than a shadow. */}
          <filter id="hs-rowshadow" x="-40%" y="-60%" width="180%" height="260%">
            {/* Wide blur + small offset + LOW alpha. An earlier pass used
                stdDeviation 5 / slope 0.5, which rendered as a hard grey slab
                under the row instead of depth. */}
            <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
            <feOffset dy="4" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.16" />
            </feComponentTransfer>
          </filter>
          {/* Filter regions are a PERCENTAGE of each element's own bbox, but a
              drop shadow needs a FIXED amount of room (dy 6 + ~3σ = ~33px).
              At the old -40%/180% the short elements starved and their shadows
              were sliced off: the 38px-tall GST chip only got 15px of room and
              the 56px stat bubble only 22px. -150%/400% leaves 1.5x the element
              height below the box, which covers even the shortest chip. */}
          <filter id="hs-card" x="-60%" y="-150%" width="220%" height="400%">
            <feDropShadow dx="0" dy="6" stdDeviation="9" floodColor="#0f172a" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* ── Backdrop ── */}
        <g data-layer="back">
          <circle cx="120" cy="120" r="140" fill="url(#hs-blob-a)" />
          <circle cx="500" cy="380" r="150" fill="url(#hs-blob-b)" />
          <rect x="330" y="330" width="150" height="120" fill="url(#hs-dots)" rx="12" />
        </g>

        {/* ══════════════ MAIN WINDOW ══════════════ */}
        <g data-layer="near">
          <g filter="url(#hs-soft)">
            <rect x="24" y="64" width="400" height="356" rx="18" fill="#fff" />
          </g>
          <rect
            x="24"
            y="64"
            width="400"
            height="356"
            rx="18"
            fill="#fff"
            stroke="#e4eaf1"
            strokeWidth="1.5"
          />

          {/* Chrome */}
          <g>
            <circle cx="46" cy="82" r="4" fill="#f87171" />
            <circle cx="60" cy="82" r="4" fill="#fbbf24" />
            <circle cx="74" cy="82" r="4" fill="#34d399" />
            <rect x="90" y="73" width="168" height="18" rx="9" fill="#f4f7fa" />
            <text x="101" y="86" fontSize="9.5" fill="#8fa0b4" fontFamily="inherit">
              hireadda.in/jobs
            </text>
            <g>
              <circle data-el="live-ring" cx="404" cy="82" r="4" fill="#22c55e" fillOpacity="0.4" />
              <circle data-el="live" cx="404" cy="82" r="3.2" fill="#22c55e" />
            </g>
            <text x="380" y="86" fontSize="8" fill="#22c55e" textAnchor="end" fontFamily="inherit">
              LIVE
            </text>
            <line x1="24" y1="100" x2="424" y2="100" stroke="#eef2f7" strokeWidth="1.5" />
          </g>

          {/* ── HOTSPOT: search ── */}
          <g {...hot('search')}>
            {/* Transparent hit area so the whole row is grabbable. */}
            <rect x="36" y="106" width="376" height="42" fill="transparent" />
            <rect
              data-el="field-kw"
              x="44"
              y="112"
              width="196"
              height="30"
              rx="8"
              fill="#fff"
              stroke="#cbd5e1"
              strokeWidth="1.4"
            />
            <g stroke="#1e5caf" strokeWidth="1.6" fill="none">
              <circle cx="60" cy="126" r="4.6" />
              <line x1="63.4" y1="129.4" x2="66.5" y2="132.5" strokeLinecap="round" />
            </g>
            <text
              data-el="q-text"
              x="73"
              y="130"
              fontSize="10.5"
              fill="#243447"
              fontFamily="inherit"
            >
              {SEARCH_QUERY}
            </text>
            <rect
              data-el="caret"
              x="171"
              y="119"
              width="1.6"
              height="16"
              fill="#1e5caf"
              opacity="0"
            />

            <rect
              x="248"
              y="112"
              width="104"
              height="30"
              rx="8"
              fill="#fff"
              stroke="#cbd5e1"
              strokeWidth="1.4"
            />
            {/* Location pin. Spans y 121→132 so its centre (126.5) matches the
                label's optical centre (baseline 130 − ~0.35em). It previously
                started at 121.5, centring it at 123 — visibly riding above the
                text, unlike the correctly-placed magnifier in the field left. */}
            <path
              d="M262 125c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3-4 7-4 7s-4-4-4-7z"
              fill="none"
              stroke="#f5880a"
              strokeWidth="1.5"
            />
            <circle cx="266" cy="125" r="1.3" fill="#f5880a" />
            <text
              data-el="loc-text"
              x="276"
              y="130"
              fontSize="10.5"
              fill="#243447"
              fontFamily="inherit"
            >
              Bangalore
            </text>

            <g data-el="search-btn">
              <rect x="360" y="112" width="52" height="30" rx="8" fill="url(#hs-btn)" />
              <g stroke="#fff" strokeWidth="1.9" fill="none">
                <circle cx="382" cy="126" r="5" />
                <line x1="386" y1="130" x2="389.5" y2="133.5" strokeLinecap="round" />
              </g>
            </g>
          </g>

          {/* ── Results list ── */}
          <g clipPath="url(#hs-results-clip)">
            {JOB_ROWS.map((job, i) => {
              const y = ROW_Y[i];
              return (
                <g key={job.title} data-row={i} {...hot(`job-${i}` as HotspotId)}>
                  {/* Soft lift shadow — inset so the blur reads as depth under
                      the row rather than a visible edge. Only its silhouette
                      renders (see #hs-rowshadow). */}
                  <rect
                    data-el="row-shadow"
                    x="60"
                    y={y + 12}
                    width="328"
                    height="36"
                    rx="14"
                    fill="#0f172a"
                    opacity="0"
                    filter="url(#hs-rowshadow)"
                  />
                  <rect
                    data-el="row-bg"
                    x="44"
                    y={y}
                    width="360"
                    height="52"
                    rx="11"
                    fill="#fff"
                    stroke="#e4eaf1"
                    strokeWidth="1.4"
                  />
                  <g data-el="row-content">
                    <rect
                      x="56"
                      y={y + 10}
                      width="32"
                      height="32"
                      rx="9"
                      fill={`url(#hs-logo-${(['a', 'b', 'c'] as const)[i]})`}
                    />
                    <rect
                      x="64"
                      y={y + 20}
                      width="16"
                      height="3"
                      rx="1.5"
                      fill="#fff"
                      opacity="0.9"
                    />
                    <rect
                      x="64"
                      y={y + 27}
                      width="10"
                      height="3"
                      rx="1.5"
                      fill="#fff"
                      opacity="0.65"
                    />

                    <text
                      x="98"
                      y={y + 22}
                      fontSize="11"
                      fontWeight="600"
                      fill="#16233a"
                      fontFamily="inherit"
                    >
                      {job.title}
                    </text>
                    <text x="98" y={y + 35} fontSize="9" fill="#8695a8" fontFamily="inherit">
                      {job.meta}
                    </text>

                    {/* Verified tick — drawn on hover. pathLength=1 keeps the
                        dash math trivial and resolution-independent. */}
                    <g transform={`translate(${98 + job.meta.length * 4.6 + 6}, ${y + 31})`}>
                      <circle cx="4" cy="0" r="5" fill="#dcfce7" />
                      <path
                        data-el="vtick"
                        d="M1.7 0.2 L3.5 2 L6.4 -1.6"
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        pathLength={1}
                        strokeDasharray={1}
                        strokeDashoffset={0}
                      />
                    </g>

                    {/* Skill chips */}
                    <g data-el="chip">
                      <rect x="98" y={y + 40} width="34" height="9" rx="4.5" fill="#eaf1fb" />
                      <text x="103" y={y + 46.6} fontSize="6" fill="#1e5caf" fontFamily="inherit">
                        Remote
                      </text>
                    </g>
                    <g data-el="chip">
                      <rect x="136" y={y + 40} width="30" height="9" rx="4.5" fill="#eaf1fb" />
                      <text x="141" y={y + 46.6} fontSize="6" fill="#1e5caf" fontFamily="inherit">
                        5+ yrs
                      </text>
                    </g>

                    <text
                      x="300"
                      y={y + 30}
                      fontSize="10.5"
                      fontWeight="700"
                      fill="#16233a"
                      textAnchor="end"
                      fontFamily="inherit"
                    >
                      ₹{job.pay}
                    </text>

                    {/* Match ring */}
                    <g transform={`translate(370, ${y + 26})`}>
                      <circle r="15" fill="none" stroke="#eef2f7" strokeWidth="3.4" />
                      <circle
                        data-el="ring-fg"
                        r="15"
                        fill="none"
                        stroke="#1e5caf"
                        strokeWidth="3.4"
                        strokeLinecap="round"
                        transform="rotate(-90)"
                        pathLength={1}
                        strokeDasharray={1}
                        strokeDashoffset={1 - job.match / 100}
                      />
                      <text
                        data-el="pct"
                        y="3.2"
                        fontSize="9"
                        fontWeight="700"
                        fill="#1e5caf"
                        textAnchor="middle"
                        fontFamily="inherit"
                      >
                        {job.match}
                      </text>
                    </g>

                    {/* Applied confirmation (click) */}
                    <g data-el="applied" opacity="0">
                      <rect x="196" y={y + 39} width="52" height="11" rx="5.5" fill="#dcfce7" />
                      <path
                        d="M203 44.5 l2 2 l3.6 -4"
                        transform={`translate(0, ${y})`}
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <text
                        x="212"
                        y={y + 47.4}
                        fontSize="6.4"
                        fontWeight="700"
                        fill="#15803d"
                        fontFamily="inherit"
                      >
                        APPLIED
                      </text>
                    </g>
                    {/* Click burst */}
                    {[0, 1, 2].map((k) => (
                      <circle
                        key={k}
                        data-el="burst"
                        cx="370"
                        cy={y + 26}
                        r={16 + k * 6}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1.4"
                        opacity="0"
                      />
                    ))}
                  </g>
                </g>
              );
            })}
            {/* Scan line — rides above the rows during a search sweep. */}
            <rect
              data-el="scan"
              x="44"
              y="146"
              width="360"
              height="3"
              rx="1.5"
              fill="url(#hs-scan)"
              opacity="0"
            />
          </g>

          {/* Glass sheen (idle) */}
          <g clipPath="url(#hs-win-clip)">
            <rect
              data-el="sheen"
              x="24"
              y="64"
              width="90"
              height="356"
              fill="url(#hs-sheen)"
              opacity="0"
              transform="skewX(-16)"
            />
          </g>
        </g>

        {/* ══════════════ AI MATCH CARD (hotspot) ══════════════ */}
        <g data-layer="far" data-entrance {...hot('ai')}>
          <g data-el="ai-card">
            <g filter="url(#hs-card)">
              <rect x="404" y="150" width="172" height="162" rx="18" fill="#fff" />
            </g>
            <rect
              x="404"
              y="150"
              width="172"
              height="162"
              rx="18"
              fill="#fff"
              stroke="#e4eaf1"
              strokeWidth="1.5"
            />
            <text
              x="422"
              y="174"
              fontSize="10"
              fontWeight="700"
              fill="#16233a"
              fontFamily="inherit"
            >
              AI Match Score
            </text>
            {/* sparkle */}
            <path
              d="M556 168 l1.9 4.4 4.7 .5 -3.6 3.1 1 4.6 -4 -2.4 -4 2.4 1 -4.6 -3.6 -3.1 4.7 -.5z"
              fill="#f5880a"
            />

            {/* Gauge — 270° arc via pathLength=1 (0.75 of a full circle). */}
            <g transform="translate(490, 232)">
              <circle
                r="34"
                fill="none"
                stroke="#eef2f7"
                strokeWidth="8"
                strokeLinecap="round"
                transform="rotate(135)"
                pathLength={1}
                strokeDasharray="0.75 0.25"
              />
              <circle
                data-el="gauge-fg"
                r="34"
                fill="none"
                stroke="url(#hs-gauge)"
                strokeWidth="8"
                strokeLinecap="round"
                transform="rotate(135)"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - 0.94 * 0.75}
              />
              <g data-el="gauge-head" transform={`rotate(${0.94 * 270 - 135})`}>
                <circle cx="34" cy="0" r="4.5" fill="#fff" stroke="#1e5caf" strokeWidth="2.4" />
              </g>
              <text
                data-el="gauge-pct"
                y="4"
                fontSize="20"
                fontWeight="800"
                fill="#16233a"
                textAnchor="middle"
                fontFamily="inherit"
              >
                94%
              </text>
              <text y="18" fontSize="7.5" fill="#8695a8" textAnchor="middle" fontFamily="inherit">
                resume fit
              </text>
            </g>

            {/* Mini "resume" being parsed */}
            <g>
              <rect
                data-el="parse-line"
                x="424"
                y="278"
                width="90"
                height="4"
                rx="2"
                fill="#dde6f2"
              />
              <rect
                data-el="parse-line"
                x="424"
                y="288"
                width="120"
                height="4"
                rx="2"
                fill="#dde6f2"
              />
              <rect
                data-el="parse-line"
                x="424"
                y="298"
                width="66"
                height="4"
                rx="2"
                fill="#dde6f2"
              />
              <rect
                data-el="parse-scan"
                x="420"
                y="276"
                width="136"
                height="2"
                rx="1"
                fill="url(#hs-scan)"
                opacity="0"
              />
            </g>
            {[
              [418, 196],
              [566, 246],
              [412, 262],
            ].map(([cx, cy], k) => (
              <circle key={k} data-el="spark" cx={cx} cy={cy} r="2.6" fill="#0ea5e9" opacity="0" />
            ))}
            {[
              [570, 200],
              [408, 230],
            ].map(([cx, cy], k) => (
              <circle key={k} data-el="drift" cx={cx} cy={cy} r="2" fill="#7c3aed" opacity="0.6" />
            ))}
          </g>
        </g>

        {/* ══════════════ PIPELINE CARD (hotspot) ══════════════ */}
        <g data-layer="mid" data-entrance {...hot('pipeline')}>
          <g data-el="pipe-card">
            <g filter="url(#hs-card)">
              <rect x="150" y="392" width="330" height="92" rx="16" fill="#fff" />
            </g>
            <rect
              x="150"
              y="392"
              width="330"
              height="92"
              rx="16"
              fill="#fff"
              stroke="#e4eaf1"
              strokeWidth="1.5"
            />
            <text
              x="168"
              y="412"
              fontSize="9.5"
              fontWeight="700"
              fill="#16233a"
              fontFamily="inherit"
            >
              Hiring pipeline
            </text>
            <text x="462" y="412" fontSize="8" fill="#8695a8" textAnchor="end" fontFamily="inherit">
              this month
            </text>

            {/* Connectors (drawn) + travelling dots. STAGES.x are absolute
                viewBox coords, so this group carries no transform — a wrapper
                offset here previously pushed the first node outside the card. */}
            <g>
              {[0, 1, 2].map((i) => {
                const x1 = STAGES[i].x + 14;
                const x2 = STAGES[i + 1].x - 14;
                return (
                  <path
                    key={i}
                    data-el="pipe-path"
                    d={`M${x1} 446 C ${x1 + (x2 - x1) / 2} 446, ${x1 + (x2 - x1) / 2} 446, ${x2} 446`}
                    fill="none"
                    stroke="#cfdbea"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="1"
                    pathLength={1}
                    strokeDashoffset={0}
                  />
                );
              })}
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  data-el="pipe-dot"
                  data-i={i}
                  r="3.6"
                  fill="#1e5caf"
                  opacity="0"
                  cx={STAGES[i].x + 14}
                  cy={446}
                />
              ))}

              {STAGES.map((s, i) => (
                <g key={s.label}>
                  {i === STAGES.length - 1 && (
                    <circle
                      data-el="hired-ring"
                      cx={s.x}
                      cy={446}
                      r="14"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="1.6"
                      opacity="0"
                    />
                  )}
                  <g data-el="pipe-node" data-i={i}>
                    <circle
                      cx={s.x}
                      cy={446}
                      r="14"
                      fill={i === STAGES.length - 1 ? '#dcfce7' : '#eaf1fb'}
                      stroke={i === STAGES.length - 1 ? '#22c55e' : '#c3d6ef'}
                      strokeWidth="1.5"
                    />
                    <text
                      data-el="pipe-count"
                      data-i={i}
                      x={s.x}
                      y={449.5}
                      fontSize="9"
                      fontWeight="700"
                      fill={i === STAGES.length - 1 ? '#15803d' : '#1e5caf'}
                      textAnchor="middle"
                      fontFamily="inherit"
                    >
                      {s.count}
                    </text>
                  </g>
                  <text
                    x={s.x}
                    y={471}
                    fontSize="7.5"
                    fill="#8695a8"
                    textAnchor="middle"
                    fontFamily="inherit"
                  >
                    {s.label}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </g>

        {/* ══════════════ GST VERIFIED CHIP ══════════════ */}
        <g data-layer="far" data-entrance>
          <g filter="url(#hs-card)">
            <rect x="392" y="86" width="150" height="38" rx="19" fill="#fff" />
          </g>
          <rect
            x="392"
            y="86"
            width="150"
            height="38"
            rx="19"
            fill="#fff"
            stroke="#e4eaf1"
            strokeWidth="1.5"
          />
          <path
            d="M414 96 l9 3 v6.5 c0 5 -3.7 8 -9 9.5 -5.3 -1.5 -9 -4.5 -9 -9.5 V99z"
            fill="#dcfce7"
            stroke="#16a34a"
            strokeWidth="1.4"
          />
          <path
            d="M409.6 105.4 l2.6 2.6 l4.6 -5.2"
            fill="none"
            stroke="#16a34a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <text x="430" y="102" fontSize="9" fontWeight="700" fill="#16233a" fontFamily="inherit">
            GST Verified
          </text>
          <text x="430" y="113" fontSize="7.5" fill="#8695a8" fontFamily="inherit">
            Employer authenticity
          </text>
        </g>

        {/* ══════════════ HIRES STAT BUBBLE ══════════════ */}
        <g data-layer="mid" data-entrance>
          <g filter="url(#hs-card)">
            <rect x="12" y="336" width="132" height="56" rx="16" fill="#fff" />
          </g>
          <rect
            x="12"
            y="336"
            width="132"
            height="56"
            rx="16"
            fill="#fff"
            stroke="#e4eaf1"
            strokeWidth="1.5"
          />
          <text x="28" y="358" fontSize="15" fontWeight="800" fill="#16233a" fontFamily="inherit">
            12,480
          </text>
          <text x="28" y="371" fontSize="7.5" fill="#8695a8" fontFamily="inherit">
            hires made
          </text>
          <path
            d="M28 383 L46 377 L62 380 L80 370 L98 374 L116 364"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="116" cy="364" r="2.8" fill="#22c55e" />
        </g>
      </svg>
    </div>
  );
}
