/**
 * plan-detail-art — hand-authored empty-state illustrations for the
 * /billing/plans surfaces.
 *
 * Deliberately a PLAIN module (no `'use client'`) so a Server Component could
 * render these too. That rules out `useId()`, so gradient ids are static and
 * hand-namespaced — safe because each of these renders AT MOST ONCE per page
 * (they are empty states; if one is showing, the populated branch is not).
 *
 * Authored at viewBox 220×140 — taller than the `plan-visuals` bands, because
 * an empty state sits in the middle of a wide card and needs vertical presence
 * rather than a shallow strip. Brand palette only: primary #1e5caf,
 * secondary #f5880a, accent #0ea5e9.
 *
 * Composition rules learned from screenshotting a first pass, which dissolved
 * into pale mush at real size:
 *   · shapes NEVER overlap ambiguously — each silhouette is fully readable,
 *   · strokes are ≥ #c2d2e6, not the #dbe4ef used for interior filler,
 *   · exactly ONE saturated brand mark per piece, so the eye has an anchor,
 *   · no hand-drawn glyphs (a bezier "₹" read as a garbled Z) — only shapes.
 */

/** Shared filler tones, so both pieces sit in the same visual register. */
const LINE = '#dfe7f1'; // interior text/filler bars
const EDGE = '#c2d2e6'; // card outlines
const EDGE_SOFT = '#d6e0ec'; // secondary outlines, one step back

/**
 * EmptyPlansArt — two filed plan rows with an empty dashed slot above them and
 * a primary "+" in the slot: there is a place for your plan, it just isn't
 * filled yet. Rows are separated with clear air so nothing reads as a smear.
 */
export function EmptyPlansArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 140"
      fill="none"
      className={className}
      role="img"
      aria-label="An empty plan slot above two filed plans"
    >
      <defs>
        <linearGradient id="pda-empty-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8f0fb" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pda-empty-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e5caf" />
        </linearGradient>
      </defs>

      {/* Backdrop wash + ground, so the stack is seated rather than floating */}
      <rect x="10" y="4" width="200" height="118" rx="18" fill="url(#pda-empty-sky)" />
      <ellipse cx="110" cy="128" rx="66" ry="7" fill="#dde5ef" />

      {/* ---- Empty slot (front, dashed) ---- */}
      <rect
        x="30"
        y="16"
        width="160"
        height="40"
        rx="12"
        fill="#ffffff"
        stroke="#8fb3e0"
        strokeWidth="2"
        strokeDasharray="8 7"
      />
      {/* The one saturated mark: centred in the slot, touching nothing */}
      <circle cx="110" cy="36" r="14" fill="url(#pda-empty-badge)" />
      <path d="M110 29v14M103 36h14" stroke="#ffffff" strokeWidth="2.75" strokeLinecap="round" />

      {/* ---- Filed plan row 1 ---- */}
      <rect
        x="30"
        y="66"
        width="160"
        height="30"
        rx="10"
        fill="#ffffff"
        stroke={EDGE}
        strokeWidth="1.75"
      />
      <circle cx="48" cy="81" r="7" fill="#bfd6f2" />
      <rect x="63" y="74" width="58" height="5" rx="2.5" fill={LINE} />
      <rect x="63" y="84" width="34" height="4" rx="2" fill="#ecf1f8" />
      <rect x="150" y="77" width="24" height="7" rx="3.5" fill="#e6eef8" />

      {/* ---- Filed plan row 2 (one step back) ---- */}
      <rect
        x="38"
        y="104"
        width="144"
        height="14"
        rx="7"
        fill="#ffffff"
        stroke={EDGE_SOFT}
        strokeWidth="1.5"
      />
      <circle cx="52" cy="111" r="4" fill="#d3e2f5" />
      <rect x="63" y="109" width="44" height="4" rx="2" fill="#ecf1f8" />

      {/* Two quiet sparks, well clear of every edge */}
      <circle cx="200" cy="18" r="3" fill="#f5880a" opacity="0.7" />
      <circle cx="18" cy="34" r="2.5" fill="#0ea5e9" opacity="0.65" />
    </svg>
  );
}

/**
 * NoPaymentsArt — a receipt with a perforated foot whose total line is still
 * blank, flanked by a card and a coin stack: the plumbing for payment exists,
 * there just is no charge on record. Card stripe is the single brand anchor.
 */
export function NoPaymentsArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 140"
      fill="none"
      className={className}
      role="img"
      aria-label="A receipt with a blank total, beside a card and coins"
    >
      <defs>
        <linearGradient id="pda-pay-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf0f8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pda-pay-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e5caf" />
        </linearGradient>
      </defs>

      <rect x="10" y="4" width="200" height="118" rx="18" fill="url(#pda-pay-sky)" />
      <ellipse cx="110" cy="128" rx="60" ry="7" fill="#dde5ef" />

      {/* ---- Receipt: straight top, perforated foot ---- */}
      <path
        d="M76 14h68a6 6 0 016 6v82l-8.5 6-8.5-6-8.5 6-8.5-6-8.5 6-8.5-6-8.5 6-8.5-6V20a6 6 0 016-6z"
        fill="#ffffff"
        stroke={EDGE}
        strokeWidth="1.75"
      />
      {/* Header: title bar + rule */}
      <rect x="88" y="26" width="38" height="7" rx="3.5" fill="#b9cbe3" />
      <line x1="88" y1="42" x2="144" y2="42" stroke="#e4eaf2" strokeWidth="1.5" />
      {/* Line items — label left, amount right */}
      <rect x="88" y="50" width="30" height="4" rx="2" fill={LINE} />
      <rect x="128" y="50" width="16" height="4" rx="2" fill="#ecf1f8" />
      <rect x="88" y="61" width="24" height="4" rx="2" fill={LINE} />
      <rect x="128" y="61" width="16" height="4" rx="2" fill="#ecf1f8" />
      <line x1="88" y1="74" x2="144" y2="74" stroke="#e4eaf2" strokeWidth="1.5" />
      {/* Total row — deliberately blank */}
      <rect x="88" y="82" width="24" height="5" rx="2.5" fill="#c8d6e8" />
      <rect
        x="120"
        y="79"
        width="26"
        height="12"
        rx="6"
        fill="#ffffff"
        stroke="#b9cbe3"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />

      {/* ---- Card, tilted in from the left. The brand anchor. ---- */}
      <g transform="rotate(-10 46 76)">
        <rect
          x="20"
          y="58"
          width="52"
          height="34"
          rx="7"
          fill="#ffffff"
          stroke={EDGE}
          strokeWidth="1.75"
        />
        <rect x="20" y="66" width="52" height="8" fill="url(#pda-pay-card)" />
        <rect x="26" y="80" width="18" height="4" rx="2" fill="#dfe7f1" />
        <rect x="49" y="80" width="10" height="4" rx="2" fill="#ecf1f8" />
      </g>

      {/* ---- Coin stack on the right: value exists, none of it spent here ---- */}
      <g>
        <ellipse
          cx="176"
          cy="96"
          rx="18"
          ry="6.5"
          fill="#e3ecf7"
          stroke={EDGE_SOFT}
          strokeWidth="1.5"
        />
        <ellipse
          cx="176"
          cy="86"
          rx="18"
          ry="6.5"
          fill="#eef4fb"
          stroke={EDGE_SOFT}
          strokeWidth="1.5"
        />
        <ellipse
          cx="176"
          cy="76"
          rx="18"
          ry="6.5"
          fill="#ffffff"
          stroke={EDGE}
          strokeWidth="1.75"
        />
        <rect x="168" y="73.5" width="16" height="2.5" rx="1.25" fill="#c8d6e8" />
      </g>
    </svg>
  );
}
