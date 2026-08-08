'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import BrandIcon from '@/components/common/BrandIcon';
import { CONSENT_VISIBILITY_EVENT } from '@/components/common/CookieConsent';
import { cn } from '@/lib/utils';

/**
 * WhatsAppChannelCta — sticky "join our WhatsApp channel" widget, bottom-left
 * of public marketing pages.
 *
 * BEHAVIOUR
 *   · Opens expanded, then auto-collapses after 10s.
 *   · Collapsed it is a slim tab flush with the bottom edge, carrying a live
 *     pulse so it keeps drawing the eye.
 *   · Hovering the collapsed tab re-opens it; leaving collapses it again.
 *   · An explicit chevron button collapses it while expanded.
 *
 * WHY THE MODULE-LEVEL `introPlayed` FLAG
 * The 10s intro must play once per page LOAD, not once per route change —
 * replaying it on every navigation would be maddening. Mounting in the root
 * layout keeps React state across client navigation, but this widget also
 * unmounts whenever the user visits an auth/dashboard route (see HIDDEN_PREFIXES)
 * and would replay on return. A module-scoped flag survives that unmount/remount
 * yet resets on a real page load, which is exactly the requested semantics.
 * It is only ever written on the client, and its initial value matches on
 * server and client, so first paint hydrates cleanly.
 */
let introPlayed = false;

const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb7CVhWLdQebO4oa5G2G';

/** Height of the always-visible collapsed tab. Also the collapse offset. */
const TAB_HEIGHT = '3.25rem';

/**
 * Route prefixes that must NOT show the widget: the auth flow (per product
 * direction) and every signed-in app area, which is not a "public page".
 * Matched on segment boundaries so `/aboutx` can never match `/about`.
 */
const HIDDEN_PREFIXES = [
  '/auth',
  '/candidate',
  '/employer',
  '/admin',
  '/super-admin',
  '/billing',
  '/notifications',
  '/portal',
  '/offline',
];

/**
 * Bespoke illustration — a broadcast channel pushing job cards out to
 * subscribers. Drawn inline rather than shipped as an asset so it stays crisp
 * and costs no extra request. `#25D366` is the WhatsApp brand green, used here
 * for GRAPHICS only — never behind small text, where it fails contrast.
 */
function ChannelArt() {
  return (
    <svg
      viewBox="0 0 280 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wa-cta-phone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9f8ef" />
        </linearGradient>
        <linearGradient id="wa-cta-bubble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25D366" />
          <stop offset="1" stopColor="#128C7E" />
        </linearGradient>
      </defs>

      {/* broadcast arcs radiating from the channel mark */}
      <g stroke="#25D366" strokeOpacity="0.32" strokeLinecap="round" fill="none">
        <path d="M74 48a26 26 0 0 1 0-26" strokeWidth="2.5" />
        <path d="M66 54a38 38 0 0 1 0-38" strokeWidth="2" strokeOpacity="0.22" />
        <path d="M58 60a50 50 0 0 1 0-50" strokeWidth="2" strokeOpacity="0.14" />
      </g>

      {/* Channel mark.
          GEOMETRY NOTE: the bubble is built symmetrically about the disc's
          centre line (x=96) and its tail points straight down, so the glyph
          cannot drift off-centre. The previous path ran x83..103 — centred on
          93, i.e. 3px left of the disc — while the dots were spaced about
          95.5, which pushed the right-hand dot to within 0.9px of the bubble
          edge and read as clipping. Body x84..108 / y37..55 with the tail to
          y59 gives a glyph bbox centred on exactly (96, 48). */}
      <circle cx="96" cy="48" r="25" fill="url(#wa-cta-bubble)" />
      <path
        d="M88 37h16a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-4l-4 4-4-4h-4a4 4 0 0 1-4-4V41a4 4 0 0 1 4-4z"
        fill="#ffffff"
      />
      {/* Dots centred on the body's own centre (96, 46) with 5.3px of
          clearance to each inner edge — no crowding at either end. */}
      <circle cx="91" cy="46" r="1.7" fill="#128C7E" />
      <circle cx="96" cy="46" r="1.7" fill="#128C7E" />
      <circle cx="101" cy="46" r="1.7" fill="#128C7E" />

      {/* subscriber phone with incoming job cards */}
      <rect
        x="150"
        y="10"
        width="104"
        height="76"
        rx="12"
        fill="url(#wa-cta-phone)"
        stroke="#bfe8d0"
      />
      <rect x="162" y="22" width="52" height="6" rx="3" fill="#128C7E" fillOpacity="0.35" />
      <rect x="162" y="38" width="80" height="14" rx="7" fill="#ffffff" stroke="#d3ecdd" />
      <circle cx="171" cy="45" r="4" fill="#25D366" />
      <rect x="180" y="42" width="40" height="5" rx="2.5" fill="#c9dbd2" />
      <rect x="162" y="58" width="80" height="14" rx="7" fill="#ffffff" stroke="#d3ecdd" />
      <circle cx="171" cy="65" r="4" fill="#128C7E" />
      <rect x="180" y="62" width="30" height="5" rx="2.5" fill="#c9dbd2" />

      {/* motes travelling from the mark toward the phone */}
      <circle cx="128" cy="34" r="3" fill="#25D366" fillOpacity="0.75" />
      <circle cx="138" cy="52" r="2.2" fill="#128C7E" fillOpacity="0.6" />
      <circle cx="130" cy="66" r="2.6" fill="#25D366" fillOpacity="0.45" />

      {/* verified tick, mirroring the channel badge */}
      <circle cx="112" cy="30" r="9" fill="#ffffff" stroke="#bfe8d0" />
      <path
        d="M108 30.2l2.6 2.6 5.2-5.6"
        stroke="#128C7E"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WhatsAppChannelCta() {
  const pathname = usePathname() ?? '/';
  const [expanded, setExpanded] = useState(!introPlayed);
  const [introDone, setIntroDone] = useState(introPlayed);
  // The cookie banner is a full-width bar on the same bottom edge at a higher
  // z-index, so it would simply bury this widget. Stand down while it is up.
  const [consentUp, setConsentUp] = useState(false);
  const hoveringRef = useRef(false);

  useEffect(() => {
    if (introPlayed) return;
    const timer = setTimeout(() => {
      introPlayed = true;
      setIntroDone(true);
      // Don't yank the panel away from under someone who is reading it.
      if (!hoveringRef.current) setExpanded(false);
    }, 10_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    /* Purely event-driven, deliberately. Seeding from the consent cookie
       during render would diverge between server (no cookie access) and
       client and break hydration, and seeding inside this effect trips
       react-hooks/set-state-in-effect. Defaulting to "banner down" is correct
       either way: CookieConsent broadcasts its state on mount, and only
       raises the banner 1.5s later when consent is missing. */
    const onVisibility = (e: Event) => {
      setConsentUp(Boolean((e as CustomEvent<{ visible: boolean }>).detail?.visible));
    };
    window.addEventListener(CONSENT_VISIBILITY_EVENT, onVisibility);
    return () => window.removeEventListener(CONSENT_VISIBILITY_EVENT, onVisibility);
  }, []);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden || consentUp) return null;

  const collapseNow = () => {
    introPlayed = true;
    setIntroDone(true);
    setExpanded(false);
  };

  return (
    <div
      // `left-6` mirrors BackToTop's `right-6`, so the two floating controls sit
      // at an identical inset. `bottom-0` (not `bottom-6`) because this one is
      // meant to be attached to the viewport edge, unlike the floating button.
      /* `pb-[env(safe-area-inset-bottom)]` keeps the tab clear of the iOS home
         indicator, where a plain `bottom-0` element sits underneath it and
         reads as "pushed too far down". Resolves to 0px everywhere else, so
         desktop is unchanged and the widget stays flush. */
      className="fixed bottom-0 left-6 z-40 w-[19.5rem] max-w-[calc(100vw-3rem)] pb-[env(safe-area-inset-bottom)] print:hidden"
      onMouseEnter={() => {
        hoveringRef.current = true;
        setExpanded(true);
      }}
      onMouseLeave={() => {
        hoveringRef.current = false;
        // During the intro the timer still owns the close, so only take over
        // once it has fired.
        if (introDone) setExpanded(false);
      }}
    >
      <div
        className={cn(
          'origin-bottom transition-transform duration-500 ease-out motion-reduce:transition-none',
        )}
        style={{ transform: expanded ? 'translateY(0)' : `translateY(calc(100% - ${TAB_HEIGHT}))` }}
      >
        <div className="overflow-hidden rounded-t-2xl bg-white shadow-[0_-2px_6px_rgba(15,23,42,0.06),0_-16px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-[#cbe9d7]">
          {/* ── Handle. MUST be the FIRST child: the wrapper is pinned to
                `bottom-0`, so as the panel slides down it is the TOP edge that
                survives on screen. With the handle last it slid off with the
                rest and left nothing visible. ── */}
          <div
            className="flex items-center gap-2.5 border-b border-[#dcf0e5] bg-gradient-to-r from-[#f2fbf6] to-white px-4"
            style={{ height: TAB_HEIGHT }}
          >
            <span className="relative flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#25D366]">
              <BrandIcon name="whatsapp" size={16} className="text-white" title="WhatsApp" />
              {/* Live pulse — the collapsed tab's ambient motion. Only while
                  collapsed, so an open panel isn't needlessly animating. */}
              {!expanded && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-60 motion-reduce:hidden"
                />
              )}
            </span>
            <span className="flex-1 text-[13px] font-bold text-[#0b4a3f]">
              Join WhatsApp Channel
            </span>
            {/* Doubles as the collapse control while open and the expand
                control on touch devices, which never fire hover. */}
            <button
              type="button"
              onClick={expanded ? collapseNow : () => setExpanded(true)}
              aria-label={
                expanded ? 'Minimise WhatsApp channel invite' : 'Open WhatsApp channel invite'
              }
              aria-expanded={expanded}
              className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[#128C7E] transition-colors hover:bg-[#dcf6e6] hover:text-[#075E54]"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronUp
                  className="animate-blink h-4 w-4 motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </button>
          </div>

          {/* ── Body — slides below the fold when collapsed. ── */}
          <div className="relative h-24 overflow-hidden bg-gradient-to-br from-[#e9f8ef] via-white to-[#dcf6e6]">
            <ChannelArt />
          </div>
          <div className="px-4 pt-3 pb-4">
            <p className="text-sm font-bold text-[var(--text)]">Hire Adda on WhatsApp</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              Fresh jobs and hiring updates delivered the moment they go live.
            </p>
            {/* Vivid brand green with a near-black label. White-on-#25D366 is
                only 1.98:1 and fails WCAG outright; dark-on-green keeps the
                recognisable WhatsApp colour and measures 7.90:1. */}
            <a
              href={CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-[#04291d] shadow-sm transition-colors hover:bg-[#1fbe5b]"
            >
              <BrandIcon name="whatsapp" size={17} title="WhatsApp" />
              Join the channel
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
