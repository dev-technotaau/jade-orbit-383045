'use client';

/**
 * Full-screen welcome experience shown once per (user, role) after the
 * candidate / employer finishes onboarding and lands on their
 * dashboard.
 *
 * Why a screen, not a modal:
 *   The earlier modal version popped over the dashboard chrome, which
 *   meant the user saw their dashboard underneath while a popup card
 *   asked them to "Get started". For a first-touch moment we want the
 *   full attention — a confetti burst, a personalised greeting, and a
 *   clean CTA — without competing with sidebar / header / metric tiles.
 *
 * Trigger gate (same conservative rules as before):
 *   - User present + role ∈ {CANDIDATE, EMPLOYER}
 *   - `wasOnboardingSkipped(<role-key>)` is true (the wizard explicitly
 *     called markOnboardingComplete()). Defence-in-depth — the dashboard
 *     already redirects to onboarding when needed, so under normal flow
 *     this gate is redundant.
 *   - `localStorage[ha_welcomed_<role>_<userId>] !== '1'` (one-time per
 *     user on this device)
 *
 * Auto-dismiss:
 *   Plays a confetti burst on mount, shows the greeting, and self-
 *   closes after AUTO_DISMISS_MS. The user can short-circuit via the
 *   CTA, Escape, or the backdrop. A linear progress bar at the bottom
 *   visualises the countdown so the dismissal isn't a surprise.
 *
 * A11y / motion:
 *   - role="dialog", aria-modal, aria-labelledby
 *   - Body scroll locked while open
 *   - Escape closes
 *   - canvas-confetti's disableForReducedMotion + `motion-reduce:` classes
 *     on every ambient animation skip the motion when the user opts out
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuthStore } from '@/store/auth.store';
import { wasOnboardingSkipped } from '@/hooks/use-onboarding';
import type { Role } from '@/types/auth';

const STORAGE_KEY_PREFIX = 'ha_welcomed';
/**
 * Auto-dismiss after 6 seconds — long enough to read the greeting and
 * appreciate the confetti, short enough that the user doesn't feel
 * stuck before reaching their dashboard.
 */
const AUTO_DISMISS_MS = 6000;

const ONBOARDING_STORAGE_KEY: Partial<Record<Role, string>> = {
  CANDIDATE: 'ha_candidate_onboarding',
  EMPLOYER: 'ha_employer_onboarding',
};

const ROLE_TAGLINES: Partial<Record<Role, string>> = {
  CANDIDATE: 'Your next opportunity starts here.',
  EMPLOYER: 'Hire smarter. Hire faster.',
};

/**
 * Fixed congratulatory greeting, replacing the previous time-of-day one
 * ("Good morning" / "Good afternoon" / "Good evening" / "Welcome").
 *
 * This screen only ever fires on a milestone — finishing registration,
 * completing onboarding, or landing on the dashboard for the first time — and
 * it already opens with a confetti burst. "Congratulations" matches that
 * moment; what hour it happens to be does not.
 *
 * Rendered as `{GREETING},` above the user's name, so it reads
 * "Congratulations, <name>!".
 */
const GREETING = 'Congratulations';

function getDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && firstName.trim()) return firstName.trim();
  if (lastName && lastName.trim()) return lastName.trim();
  // Fall back to the local part of the email — better than showing
  // the full address in a giant heading.
  return email.split('@')[0] || 'there';
}

/* ------------------------------------------------------------------ */
/* Crest illustration                                                  */
/* ------------------------------------------------------------------ */

/** Ray fan behind the crest — 16 tapered spokes, drawn once and rotated. */
const RAYS = Array.from({ length: 16 }, (_, i) => i * (360 / 16));

/**
 * WelcomeCrest — a hand-authored achievement crest, drawn inline so it is
 * crisp at any size and costs no extra request.
 *
 * The glyph at its centre is role-aware: a briefcase for employers (their
 * milestone is being ready to hire) and an upward career arrow for candidates
 * (theirs is being ready to be found). Everything else is shared, so the two
 * variants read as one family.
 */
function WelcomeCrest({ role }: { role: Role }) {
  const isEmployer = role === 'EMPLOYER';
  return (
    <div className="relative h-36 w-36 sm:h-44 sm:w-44">
      {/* Rotating ray fan, behind the medallion. */}
      <svg
        viewBox="0 0 200 200"
        className="animate-halo-spin absolute inset-0 h-full w-full motion-reduce:animate-none"
        aria-hidden="true"
      >
        <defs>
          {/* Bright at the BASE, fading to nothing at the tip — light radiating
              OUT of the medallion. The stops were the other way round at first,
              which detached each ray from the disc and read as a grey spike.
              Warm (#ffe4b5) rather than white: pure white at partial alpha over
              this mid-blue reads grey, which made the fan look like clipart
              instead of light coming off the gold ring. */}
          <linearGradient id="wc-ray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe4b5" stopOpacity="0" />
            <stop offset="1" stopColor="#ffe4b5" stopOpacity="0.7" />
          </linearGradient>
          {/* Blur turns hard triangles into light shafts. Applied to the fan as
              a whole, once, on a 176px element — cheap, and it is the single
              thing that stops this reading as a sunburst sticker. */}
          <filter id="wc-ray-blur" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          {/* Soft aura behind the disc — does most of the "glow" work so the
              spokes only have to add structure. */}
          <radialGradient id="wc-aura">
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.30" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="url(#wc-aura)" />
        {/* Spokes run r=64→96, i.e. clear of the medallion's r=62 halo. They
            used to start at r=56 and poke through the disc. */}
        <g filter="url(#wc-ray-blur)">
          {RAYS.map((deg, i) => (
            <path
              key={deg}
              d="M100 4 L106 36 L94 36 Z"
              fill="url(#wc-ray)"
              opacity={i % 2 === 0 ? 0.9 : 0.45}
              transform={`rotate(${deg} 100 100)`}
            />
          ))}
        </g>
      </svg>

      {/* Medallion */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full drop-shadow-2xl"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wc-disc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#dbe9fb" />
          </linearGradient>
          <linearGradient id="wc-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5880a" />
            <stop offset="0.5" stopColor="#ffd700" />
            <stop offset="1" stopColor="#f5880a" />
          </linearGradient>
          <linearGradient id="wc-glyph" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e5caf" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        <circle cx="100" cy="100" r="62" fill="#ffffff" fillOpacity="0.16" />
        <circle cx="100" cy="100" r="54" stroke="url(#wc-ring)" strokeWidth="4" fill="none" />
        <circle cx="100" cy="100" r="46" fill="url(#wc-disc)" />

        {isEmployer ? (
          /* Briefcase — ready to hire. */
          <g>
            <path
              d="M86 82v-4a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v4"
              stroke="url(#wc-glyph)"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <rect x="72" y="82" width="56" height="38" rx="8" fill="url(#wc-glyph)" />
            <rect x="92" y="96" width="16" height="6" rx="3" fill="#ffffff" fillOpacity="0.9" />
          </g>
        ) : (
          /* Rising arrow over a base line — ready to be found. */
          <g>
            <path
              d="M76 116 L94 98 L106 110 L126 88"
              stroke="url(#wc-glyph)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M114 86 h14 v14"
              stroke="url(#wc-glyph)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        )}

        {/* Verified tick, seated on the medallion's lower-right edge. */}
        <circle cx="141" cy="139" r="17" fill="#22c55e" />
        <circle cx="141" cy="139" r="17" stroke="#ffffff" strokeWidth="3" fill="none" />
        <path
          d="M133 139.5 l5.5 5.5 L150 133"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti                                                            */
/* ------------------------------------------------------------------ */

type FireConfetti = (opts: confetti.Options) => void;

/**
 * Multi-wave confetti pattern. Four staggered waves across ~1.4s so the
 * celebration has a build and a tail rather than one flat pop.
 *
 * Colours match the brand palette: primary blue + secondary orange +
 * accent sky + success green + a touch of gold + white. Shapes mix squares,
 * circles and stars at varied scalars so the burst reads as confetti rather
 * than uniform dots.
 *
 * Returns a cleanup that clears its pending timers — without it, a user who
 * dismisses inside the first second still got later waves firing against a
 * torn-down canvas.
 */
function fireConfettiCelebration(fire: FireConfetti): () => void {
  if (typeof window === 'undefined') return () => {};

  const colors = ['#1e5caf', '#f5880a', '#0ea5e9', '#22c55e', '#ffd700', '#ffffff'];
  const baseDefaults = {
    ticks: 220,
    gravity: 0.9,
    decay: 0.94,
    startVelocity: 35,
    colors,
    scalar: 1.05,
    shapes: ['square', 'circle', 'star'] as confetti.Shape[],
    // canvas-confetti respects the OS / browser reduced-motion setting
    // when this is true — no-ops if the user opts out of animation.
    disableForReducedMotion: true,
  };

  const timers: number[] = [];

  // Burst 1 — angled from both bottom corners towards the centre.
  fire({ ...baseDefaults, angle: 60, spread: 70, particleCount: 80, origin: { x: 0, y: 0.7 } });
  fire({
    ...baseDefaults,
    angle: 120,
    spread: 70,
    particleCount: 80,
    origin: { x: 1, y: 0.7 },
  });

  // Burst 2 — a single wide spread from the middle, slightly delayed.
  timers.push(
    window.setTimeout(() => {
      fire({
        ...baseDefaults,
        angle: 90,
        spread: 120,
        particleCount: 120,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.5 },
      });
    }, 250),
  );

  // Burst 3 — side bursts again, lower and softer. Gives a tail to the
  // celebration so the screen doesn't go quiet too fast.
  timers.push(
    window.setTimeout(() => {
      fire({
        ...baseDefaults,
        angle: 60,
        spread: 80,
        particleCount: 60,
        origin: { x: 0.1, y: 0.8 },
      });
      fire({
        ...baseDefaults,
        angle: 120,
        spread: 80,
        particleCount: 60,
        origin: { x: 0.9, y: 0.8 },
      });
    }, 800),
  );

  // Burst 4 — fine, slow glitter drifting down across the full width. Low
  // gravity and a long tick budget keep it hanging in the air for the rest of
  // the screen's life, which is what stops the moment feeling "over" at 1s.
  timers.push(
    window.setTimeout(() => {
      fire({
        ...baseDefaults,
        particleCount: 70,
        startVelocity: 0,
        gravity: 0.35,
        decay: 0.97,
        ticks: 420,
        scalar: 0.75,
        spread: 180,
        origin: { x: 0.5, y: -0.1 },
      });
    }, 1400),
  );

  return () => timers.forEach((t) => window.clearTimeout(t));
}

export default function WelcomeScreen() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const shouldShow = useMemo(() => {
    if (dismissed) return false;
    if (!user) return false;
    if (user.role !== 'CANDIDATE' && user.role !== 'EMPLOYER') {
      return false;
    }
    if (typeof window === 'undefined') return false;
    // Don't show until onboarding is explicitly complete (or skipped).
    // Vendors have no onboarding wizard so this check passes for them.
    // The `_skipped` flag is USER-scoped (`<base>_<userId>_skipped`) —
    // it used to be browser-global, which made this gate pass for brand-
    // new accounts on any browser where a PREVIOUS account had finished
    // onboarding (the welcomed-key below was always user-scoped, so the
    // welcome screen fired while the wizard was silently skipped).
    const onboardingKeyBase = ONBOARDING_STORAGE_KEY[user.role];
    if (onboardingKeyBase && !wasOnboardingSkipped(`${onboardingKeyBase}_${user.id}`)) {
      return false;
    }
    try {
      const key = `${STORAGE_KEY_PREFIX}_${user.role}_${user.id}`;
      return window.localStorage.getItem(key) !== '1';
    } catch {
      // localStorage can throw in private-mode Safari or with a full
      // quota — silently no-op.
      return false;
    }
  }, [user, dismissed]);

  // Side-effects: confetti, body-scroll lock, Escape-to-close,
  // auto-dismiss timer. All scoped to the `shouldShow` lifetime.
  useEffect(() => {
    if (!shouldShow) return;

    /* Confetti renders on a DEDICATED canvas mounted inside this overlay,
       not canvas-confetti's global one. The global canvas is `position:fixed`
       with z-index auto, and this overlay is z-[200] — a positioned element
       with a real z-index always paints above an auto one, so the default
       canvas would be buried behind the backdrop. Scoping it here also means
       it tears down with the screen instead of lingering on <body>. */
    const canvas = canvasRef.current;
    const fire: FireConfetti = canvas
      ? confetti.create(canvas, { resize: true, useWorker: true })
      : confetti;

    const stopConfetti = fireConfettiCelebration(fire);
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', onKey);

    const timer = window.setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      stopConfetti();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
    // handleDismiss is stable per render (closure over user+setDismissed);
    // we intentionally re-run this effect only when shouldShow flips so
    // the confetti / timer don't fire on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow]);

  const handleDismiss = () => {
    if (user && typeof window !== 'undefined') {
      try {
        const key = `${STORAGE_KEY_PREFIX}_${user.role}_${user.id}`;
        window.localStorage.setItem(key, '1');
      } catch {
        // Same private-mode guard as the read above.
      }
    }
    setDismissed(true);
  };

  if (typeof window === 'undefined') return null;
  if (!user) return null;

  const name = getDisplayName(user.firstName, user.lastName, user.email);
  const greeting = GREETING;
  const tagline = ROLE_TAGLINES[user.role] || 'Welcome to Hire Adda.';

  return createPortal(
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="welcome-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          /* Deep navy base rather than the flat primary gradient — it gives the
             aurora blobs and the gold crest something to sit against. */
          className="fixed inset-0 z-[200] overflow-hidden bg-[#071b3d]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-greeting"
          onClick={handleDismiss}
        >
          {/* ── Backdrop stack ── */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {/* Brand wash */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary-dark)] via-[var(--primary)] to-[#0a2f66] opacity-95" />
            {/* Drifting aurora blobs */}
            <div className="animate-aurora absolute top-1/4 left-1/4 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]/30 blur-3xl motion-reduce:animate-none" />
            <div className="animate-aurora-slow absolute right-1/4 bottom-1/4 h-[32rem] w-[32rem] translate-x-1/2 translate-y-1/2 rounded-full bg-[var(--secondary)]/25 blur-3xl motion-reduce:animate-none" />
            <div className="absolute top-1/2 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
            {/* Fine dot lattice — adds texture so the gradient doesn't band */}
            <div
              className="absolute inset-0 opacity-[0.16]"
              style={{
                backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
                backgroundSize: '26px 26px',
              }}
            />
            {/* Overhead light shaft */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.22),transparent_65%)]" />
            {/* Vignette — pulls focus to the centre column */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(3,12,30,0.55)_100%)]" />
          </div>

          {/* Confetti canvas — above the backdrop, below the content. */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
            aria-hidden="true"
          />

          {/*
            Click handler on the inner column stops propagation so a
            click on the content doesn't trigger the backdrop dismiss.
            The CTA button still dismisses via its own handler.
          */}
          <div
            className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 18 }}
              className="mb-8"
            >
              <WelcomeCrest role={user.role} />
            </motion.div>

            <motion.h1
              id="welcome-greeting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-bold text-white sm:text-5xl"
            >
              {greeting},
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 bg-gradient-to-r from-white via-[#ffe9c7] to-white bg-clip-text text-5xl font-extrabold text-transparent sm:text-7xl"
            >
              {name}!
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75, duration: 0.6 }}
              className="mt-6 max-w-md text-lg text-white/85 sm:text-xl"
            >
              {tagline}
            </motion.p>

            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.5 }}
              onClick={handleDismiss}
              className="group mt-12 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[var(--primary)] shadow-2xl transition-all hover:scale-105 hover:bg-white focus:ring-4 focus:ring-white/40 focus:outline-none"
            >
              Continue to dashboard
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.4 }}
              className="mt-6 text-xs text-white/50"
            >
              Press Esc or tap anywhere to dismiss
            </motion.p>
          </div>

          {/*
            Auto-dismiss progress bar at the bottom. Linear scale-X
            animation matches the AUTO_DISMISS_MS timer above; if either
            changes, both should be updated together.
          */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
            style={{ transformOrigin: 'left' }}
            className="absolute bottom-0 left-0 z-10 h-1 w-full bg-gradient-to-r from-[var(--secondary)] via-[#ffd700] to-white"
            aria-hidden="true"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
