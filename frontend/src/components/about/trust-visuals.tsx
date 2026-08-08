import type { ReactNode } from 'react';

/**
 * Trust & Security pillar illustrations for the About page.
 *
 * Hand-authored inline SVG rather than icons or image assets: each one depicts
 * the specific thing its card claims (a tokenised card behind a shield, a GST
 * invoice with its CGST/SGST/IGST split, the actual payment rails we accept),
 * which a generic lucide glyph cannot do.
 *
 * NOT a client module on purpose — the About page is a Server Component, so
 * this ships zero JS. That also means no `useId()` for the gradient ids; the
 * static ids below are safe because each illustration renders exactly once per
 * page. If one of these is ever reused on the same page, namespace the ids
 * first or the duplicate <defs> will collide.
 *
 * No ambient animation — motion is hover-only, so the section costs nothing
 * while it sits off screen.
 */

type ToneKey = 'primary' | 'emerald' | 'amber';

const TONES: Record<ToneKey, { wash: string; glow: string; bar: string }> = {
  primary: {
    wash: 'from-primary-50 to-white',
    glow: 'bg-primary/25',
    bar: 'from-primary to-accent',
  },
  emerald: {
    wash: 'from-emerald-50 to-white',
    glow: 'bg-emerald-400/25',
    bar: 'from-emerald-500 to-teal-500',
  },
  amber: {
    wash: 'from-secondary-50 to-white',
    glow: 'bg-secondary/25',
    bar: 'from-secondary to-amber-400',
  },
};

const SVG_PROPS = {
  viewBox: '0 0 320 112',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  className: 'h-full w-full',
  preserveAspectRatio: 'xMidYMid slice',
  'aria-hidden': true,
} as const;

/** Masked card digits — 8 dots then the last four in the clear. */
const DIGIT_DOTS = [188, 195, 202, 209, 221, 228, 235, 242];

/**
 * Bank-grade encryption — a shield/padlock guarding a card whose PAN is
 * masked down to the last four, which is literally all we store.
 */
export function EncryptionArt() {
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="ta-enc-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b7cd0" />
          <stop offset="1" stopColor="#1e5caf" />
        </linearGradient>
        <linearGradient id="ta-enc-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf1fa" />
        </linearGradient>
      </defs>

      {/* guard rings */}
      <circle cx="104" cy="56" r="54" stroke="#1e5caf" strokeOpacity="0.09" />
      <circle cx="104" cy="56" r="42" stroke="#1e5caf" strokeOpacity="0.13" />

      {/* tokenised card */}
      <rect
        x="176"
        y="28"
        width="126"
        height="78"
        rx="11"
        fill="url(#ta-enc-card)"
        stroke="#d6e3f3"
      />
      <rect x="176" y="40" width="126" height="9" fill="#1e5caf" fillOpacity="0.13" />
      <rect x="188" y="60" width="18" height="13" rx="3" fill="#f5880a" fillOpacity="0.8" />
      {DIGIT_DOTS.map((x) => (
        <circle key={x} cx={x} cy="86" r="2.1" fill="#9db2cb" />
      ))}
      <text
        x="254"
        y="90"
        fontSize="11"
        fontWeight="700"
        fill="#1e5caf"
        fontFamily="inherit"
        letterSpacing="0.5"
      >
        4242
      </text>

      {/* shield */}
      <path
        d="M104 14 L141 27 V56 C141 80 124 93 104 100 C84 93 67 80 67 56 V27 Z"
        fill="url(#ta-enc-shield)"
      />
      <path
        d="M104 21 L134 32 V56 C134 76 120 87 104 93 C88 87 74 76 74 56 V32 Z"
        stroke="#ffffff"
        strokeOpacity="0.28"
      />
      {/* padlock */}
      <path
        d="M96 53 v-8 a8 8 0 0 1 16 0 v8"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="90" y="53" width="28" height="22" rx="5" fill="#ffffff" />
      <circle cx="104" cy="61" r="3" fill="#1e5caf" />
      <rect x="102.8" y="62" width="2.4" height="7" rx="1.2" fill="#1e5caf" />

      {/* TLS pill + ciphertext stream */}
      <rect x="14" y="38" width="42" height="20" rx="10" fill="#ffffff" stroke="#d6e3f3" />
      <text
        x="35"
        y="52"
        fontSize="9"
        fontWeight="700"
        fill="#1e5caf"
        textAnchor="middle"
        fontFamily="inherit"
      >
        TLS
      </text>
      <g fill="#1e5caf" fillOpacity="0.32">
        <rect x="14" y="68" width="17" height="4" rx="2" />
        <rect x="35" y="68" width="9" height="4" rx="2" />
        <rect x="48" y="68" width="13" height="4" rx="2" />
        <rect x="14" y="78" width="10" height="4" rx="2" />
        <rect x="28" y="78" width="19" height="4" rx="2" />
      </g>
    </svg>
  );
}

/**
 * GST-compliant invoicing — a tax invoice showing the three-way
 * CGST/SGST/IGST split and a verified seal.
 */
export function InvoiceArt() {
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="ta-inv-doc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef7f2" />
        </linearGradient>
      </defs>

      {/* document */}
      <rect x="92" y="10" width="130" height="94" rx="9" fill="url(#ta-inv-doc)" stroke="#cfe3d8" />
      <text x="106" y="32" fontSize="9" fontWeight="700" fill="#0f766e" fontFamily="inherit">
        TAX INVOICE
      </text>
      <rect x="106" y="38" width="46" height="4" rx="2" fill="#cbd5e1" />
      <rect x="106" y="48" width="102" height="1" fill="#e2e8f0" />

      {/* line items */}
      <rect x="106" y="56" width="64" height="5" rx="2.5" fill="#d5dfea" />
      <rect x="186" y="56" width="22" height="5" rx="2.5" fill="#d5dfea" />
      <rect x="106" y="67" width="52" height="5" rx="2.5" fill="#d5dfea" />
      <rect x="186" y="67" width="22" height="5" rx="2.5" fill="#d5dfea" />

      {/* CGST / SGST / IGST split */}
      <rect x="106" y="82" width="30" height="7" rx="3.5" fill="#1e5caf" fillOpacity="0.55" />
      <rect x="140" y="82" width="30" height="7" rx="3.5" fill="#0ea5e9" fillOpacity="0.55" />
      <rect x="174" y="82" width="34" height="7" rx="3.5" fill="#10b981" fillOpacity="0.6" />

      {/* rupee total badge */}
      <rect x="18" y="30" width="52" height="30" rx="9" fill="#ffffff" stroke="#cfe3d8" />
      <text
        x="44"
        y="50"
        fontSize="15"
        fontWeight="700"
        fill="#0f766e"
        textAnchor="middle"
        fontFamily="inherit"
      >
        &#8377;
      </text>
      <rect x="18" y="68" width="52" height="5" rx="2.5" fill="#10b981" fillOpacity="0.3" />
      <rect x="18" y="79" width="34" height="5" rx="2.5" fill="#10b981" fillOpacity="0.2" />

      {/* verified seal */}
      <circle cx="238" cy="76" r="21" fill="#10b981" />
      <circle cx="238" cy="76" r="16" stroke="#ffffff" strokeOpacity="0.45" />
      <path
        d="M230 76.5 l5.5 5.5 L247 70.5"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* PDF tag */}
      <rect x="246" y="20" width="40" height="18" rx="9" fill="#ffffff" stroke="#cfe3d8" />
      <text
        x="266"
        y="33"
        fontSize="8.5"
        fontWeight="700"
        fill="#0f766e"
        textAnchor="middle"
        fontFamily="inherit"
      >
        PDF
      </text>
    </svg>
  );
}

/** Tiles for the payment-rails illustration. */
const RAILS: { x: number; y: number; label: string; fill: string }[] = [
  { x: 176, y: 20, label: 'UPI', fill: '#f5880a' },
  { x: 240, y: 20, label: 'Net', fill: '#1e5caf' },
  { x: 176, y: 62, label: 'Wallet', fill: '#0ea5e9' },
  { x: 240, y: 62, label: 'EMI', fill: '#10b981' },
];

/** Every payment method — a card plus the four other rails we accept. */
export function PaymentMethodsArt() {
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id="ta-pay-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e5caf" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      {/* hero card */}
      <rect x="20" y="24" width="132" height="80" rx="12" fill="url(#ta-pay-card)" />
      <rect x="20" y="42" width="132" height="11" fill="#0f172a" fillOpacity="0.28" />
      <rect x="34" y="64" width="20" height="15" rx="3.5" fill="#f5c877" />
      <rect x="34" y="64" width="20" height="15" rx="3.5" stroke="#ffffff" strokeOpacity="0.35" />
      <g fill="#ffffff" fillOpacity="0.75">
        <rect x="64" y="70" width="16" height="4" rx="2" />
        <rect x="84" y="70" width="16" height="4" rx="2" />
        <rect x="104" y="70" width="16" height="4" rx="2" />
      </g>
      <rect x="34" y="88" width="42" height="4" rx="2" fill="#ffffff" fillOpacity="0.45" />
      {/* contactless mark */}
      <g stroke="#ffffff" strokeOpacity="0.65" strokeLinecap="round">
        <path d="M126 62 a9 9 0 0 1 0 12" />
        <path d="M132 58 a15 15 0 0 1 0 20" />
      </g>

      {/* the other rails */}
      {RAILS.map((r) => (
        <g key={r.label}>
          <rect x={r.x} y={r.y} width="60" height="34" rx="9" fill="#ffffff" stroke="#d9e3ee" />
          <rect x={r.x + 10} y={r.y + 13} width="7" height="7" rx="2" fill={r.fill} />
          <text
            x={r.x + 23}
            y={r.y + 21}
            fontSize="9.5"
            fontWeight="700"
            fill="#334155"
            fontFamily="inherit"
          >
            {r.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Shared shell — art band over copy, with a hover lift and a wiping accent
 * bar. The bar sits at z-10 so it paints above the band.
 */
export function TrustPillarCard({
  tone,
  art,
  title,
  children,
}: {
  tone: ToneKey;
  art: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <article className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <span
        className={`absolute inset-x-0 top-0 z-10 h-1 origin-left scale-x-0 bg-gradient-to-r transition-transform duration-300 group-hover:scale-x-100 ${t.bar}`}
      />
      <div className={`relative h-28 overflow-hidden bg-gradient-to-br ${t.wash}`}>
        <span className={`absolute -top-10 -right-8 h-28 w-28 rounded-full blur-2xl ${t.glow}`} />
        <div className="relative h-full w-full">{art}</div>
        {/* fades the band into the copy area so the art doesn't end on a hard line */}
        <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>
      <div className="p-6">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">{title}</h3>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{children}</p>
      </div>
    </article>
  );
}
