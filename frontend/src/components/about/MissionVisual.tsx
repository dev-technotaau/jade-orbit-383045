/**
 * MissionVisual — a presentational, pure-SVG/CSS panel used on the About page
 * in place of the founder quote card (temporarily hidden). It illustrates the
 * mission — bridging talent and companies — with a hand-authored inline SVG
 * (a candidate card + a company card linked by a central "connection" badge)
 * sitting on a soft brand gradient wash with blurred accent glows. Crisp at any
 * size, zero image weight, themed to the design system. Server-safe (no client
 * features), matching the visual language of the homepage's "Hire your way"
 * cards and the How-It-Works browser mock.
 */
export default function MissionVisual() {
  return (
    <div className="from-primary-light/70 relative flex min-h-[24rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br via-white to-white p-6 sm:p-8">
      {/* Blurred brand glows for depth */}
      <div
        aria-hidden="true"
        className="bg-primary/20 absolute -top-12 -right-10 h-56 w-56 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-secondary/10 absolute -bottom-14 -left-10 h-52 w-52 rounded-full blur-3xl"
      />

      {/* Illustration — bridging talent & companies */}
      <svg
        viewBox="0 0 400 300"
        className="relative w-full max-w-md"
        fill="none"
        role="img"
        aria-label="Hire Adda connecting talent with companies"
      >
        <defs>
          <linearGradient id="mv-badge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e5caf" />
          </linearGradient>
          <linearGradient id="mv-avatar" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>

        {/* Connectors — dashed "bridge" lines from each card up to the badge */}
        <path
          d="M99 116 C 140 92, 164 88, 184 82"
          stroke="#bfdbfe"
          strokeWidth="2.5"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
        <path
          d="M301 116 C 260 92, 236 88, 216 82"
          stroke="#bfdbfe"
          strokeWidth="2.5"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />

        {/* Left — candidate card */}
        <g>
          <rect
            x="24"
            y="112"
            width="150"
            height="160"
            rx="18"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          <circle cx="60" cy="150" r="17" fill="url(#mv-avatar)" />
          <rect x="88" y="141" width="62" height="9" rx="4.5" fill="#0f172a" opacity="0.78" />
          <rect x="88" y="157" width="40" height="7" rx="3.5" fill="#93c5fd" />
          <rect x="44" y="186" width="106" height="8" rx="4" fill="#eef2f7" />
          <rect x="44" y="202" width="84" height="8" rx="4" fill="#eef2f7" />
          <rect x="44" y="224" width="46" height="16" rx="8" fill="#dbeafe" />
          <rect x="96" y="224" width="36" height="16" rx="8" fill="#eff6ff" stroke="#bfdbfe" />
        </g>

        {/* Right — company card */}
        <g>
          <rect
            x="226"
            y="112"
            width="150"
            height="160"
            rx="18"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          {/* Logo tile + building glyph */}
          <rect x="248" y="142" width="40" height="40" rx="11" fill="url(#mv-badge)" />
          <rect x="260" y="152" width="16" height="20" rx="1.5" fill="#ffffff" />
          <rect x="263" y="156" width="3.5" height="3.5" fill="#3b82f6" />
          <rect x="270.5" y="156" width="3.5" height="3.5" fill="#3b82f6" />
          <rect x="263" y="163" width="3.5" height="3.5" fill="#3b82f6" />
          <rect x="270.5" y="163" width="3.5" height="3.5" fill="#3b82f6" />
          <rect x="300" y="146" width="56" height="9" rx="4.5" fill="#0f172a" opacity="0.78" />
          <rect x="300" y="162" width="38" height="7" rx="3.5" fill="#93c5fd" />
          <rect x="248" y="196" width="108" height="8" rx="4" fill="#eef2f7" />
          <rect x="248" y="212" width="84" height="8" rx="4" fill="#eef2f7" />
          {/* Verified chip */}
          <rect x="248" y="232" width="74" height="18" rx="9" fill="#dcfce7" />
          <path
            d="M258 241l4 4 7-8"
            stroke="#16a34a"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="276" y="237" width="38" height="7" rx="3.5" fill="#86efac" />
        </g>

        {/* Central connection badge (sits above the gap, bridging both cards) */}
        <circle cx="200" cy="66" r="42" fill="#ffffff" />
        <circle cx="200" cy="66" r="34" fill="url(#mv-badge)" />
        {/* Link glyph — two nodes joined */}
        <circle cx="186" cy="66" r="7" fill="#ffffff" />
        <circle cx="214" cy="66" r="7" fill="#ffffff" />
        <rect x="189" y="63" width="22" height="6" rx="3" fill="#ffffff" />

        {/* Floating accents for life */}
        <circle cx="344" cy="52" r="4" fill="#f5880a" />
        <circle cx="58" cy="58" r="3.5" fill="#0ea5e9" />
        <circle cx="200" cy="16" r="3" fill="#93c5fd" />
      </svg>

      <p className="relative mt-4 text-center text-sm font-medium text-[var(--text-secondary)]">
        Connecting India&apos;s talent with the companies that need them.
      </p>
    </div>
  );
}
