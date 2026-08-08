/**
 * ValuesCompass — the single large illustration for the About page's
 * "Our Values" section.
 *
 * WHY A COMPASS. The section's own copy calls these "the principles that guide
 * everything we do", so a compass is the literal metaphor rather than arbitrary
 * decoration: four cardinal points, one for each value, around a fixed centre.
 *
 * WHY ONE BIG PIECE INSTEAD OF FOUR SMALL ONES. The sections directly above
 * (Trust & Security) and below (Built for how India hires) are both card grids
 * with per-card art. Repeating that a third time is what made the page feel
 * monotonous, so this section deliberately carries a single composition beside
 * an unboxed list.
 *
 * NOT a client module — the About page is a Server Component, so this ships
 * zero JS. Gradient ids are static, which is safe because it renders once per
 * page; namespace them if it is ever reused on the same page.
 */

const CX = 200;
const CY = 200;

/** Cardinal placements, clockwise from north, matching the list's 01–04 order. */
const POINTS = [
  { key: 'innovation', x: CX, y: 48, tone: '#f5880a' },
  { key: 'trust', x: 352, y: CY, tone: '#1e5caf' },
  { key: 'inclusion', x: CX, y: 352, tone: '#0ea5e9' },
  { key: 'excellence', x: 48, y: CY, tone: '#10b981' },
] as const;

/** Regular star polygon, used for the Excellence glyph and the centre spark. */
function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** One half of a compass point, so each reads as a shaded 3D blade. */
function blade(tipX: number, tipY: number, sideX: number, sideY: number): string {
  return `M${tipX} ${tipY} L${sideX} ${sideY} L${CX} ${CY} Z`;
}

function Glyph({ point }: { point: (typeof POINTS)[number] }) {
  const { x, y, tone, key } = point;
  const line = { stroke: tone, strokeWidth: 2, strokeLinecap: 'round' as const };

  if (key === 'innovation') {
    // Lightbulb — idea, invention.
    return (
      <g>
        <circle cx={x} cy={y - 2} r="7" fill="none" {...line} />
        <rect x={x - 3.5} y={y + 5.5} width="7" height="2.6" rx="1.3" fill={tone} />
        <rect x={x - 2.5} y={y + 9.5} width="5" height="2.2" rx="1.1" fill={tone} />
        <path d={`M${x} ${y - 13.5} v-3.5`} {...line} />
        <path d={`M${x - 9.5} ${y - 8.5} l-3 -2`} {...line} />
        <path d={`M${x + 9.5} ${y - 8.5} l3 -2`} {...line} />
      </g>
    );
  }
  if (key === 'trust') {
    // Shield + tick — verification.
    return (
      <g>
        <path
          d={`M${x} ${y - 12} l9.5 3.7 v6.6 c0 6.4-4.2 10.2-9.5 12.4 -5.3-2.2-9.5-6-9.5-12.4 v-6.6 z`}
          fill={tone}
        />
        <path
          d={`M${x - 4} ${y + 0.5} l3 3 l5.5-6`}
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    );
  }
  if (key === 'inclusion') {
    // Three figures — equal access for everyone.
    return (
      <g>
        <circle cx={x} cy={y - 6} r="4.2" fill={tone} />
        <path d={`M${x - 6.5} ${y + 3} a6.5 6.5 0 0 1 13 0`} fill={tone} />
        <circle cx={x - 10.5} cy={y - 1} r="3.2" fill={tone} fillOpacity="0.55" />
        <path d={`M${x - 15} ${y + 7} a4.5 4.5 0 0 1 9 0`} fill={tone} fillOpacity="0.55" />
        <circle cx={x + 10.5} cy={y - 1} r="3.2" fill={tone} fillOpacity="0.55" />
        <path d={`M${x + 6} ${y + 7} a4.5 4.5 0 0 1 9 0`} fill={tone} fillOpacity="0.55" />
      </g>
    );
  }
  // Excellence — star.
  return <path d={starPath(x, y, 11.5, 4.8)} fill={tone} />;
}

export default function ValuesCompass() {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full max-w-md"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="vc-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#1e5caf" stopOpacity="0.13" />
          <stop offset="0.6" stopColor="#0ea5e9" stopOpacity="0.06" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vc-hub" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b7cd0" />
          <stop offset="1" stopColor="#1e5caf" />
        </linearGradient>
      </defs>

      <circle cx={CX} cy={CY} r="196" fill="url(#vc-glow)" />

      {/* Bezel ticks — every 4th is a major mark on a cardinal/ordinal. */}
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i * Math.PI * 2) / 48 - Math.PI / 2;
        const major = i % 6 === 0;
        const r1 = major ? 158 : 164;
        return (
          <line
            key={i}
            x1={(CX + Math.cos(a) * r1).toFixed(2)}
            y1={(CY + Math.sin(a) * r1).toFixed(2)}
            x2={(CX + Math.cos(a) * 172).toFixed(2)}
            y2={(CY + Math.sin(a) * 172).toFixed(2)}
            stroke="#1e5caf"
            strokeOpacity={major ? 0.34 : 0.15}
            strokeWidth={major ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}

      <circle cx={CX} cy={CY} r="152" stroke="#1e5caf" strokeOpacity="0.16" />
      <circle cx={CX} cy={CY} r="112" stroke="#1e5caf" strokeOpacity="0.13" strokeDasharray="3 7" />

      {/* Ordinal (diagonal) blades — shorter, quieter. */}
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180 - Math.PI / 2;
        const p = (deg * Math.PI) / 180 - Math.PI / 2 + Math.PI / 2;
        return (
          <path
            key={deg}
            d={blade(
              +(CX + Math.cos(a) * 66).toFixed(2),
              +(CY + Math.sin(a) * 66).toFixed(2),
              +(CX + Math.cos(p) * 9).toFixed(2),
              +(CY + Math.sin(p) * 9).toFixed(2),
            )}
            fill="#1e5caf"
            fillOpacity="0.14"
          />
        );
      })}

      {/* Cardinal blades — split light/dark so each point reads dimensional. */}
      {[
        { tip: [CX, 100], a: [CX - 10, CY], b: [CX + 10, CY] },
        { tip: [300, CY], a: [CX, CY - 10], b: [CX, CY + 10] },
        { tip: [CX, 300], a: [CX + 10, CY], b: [CX - 10, CY] },
        { tip: [100, CY], a: [CX, CY + 10], b: [CX, CY - 10] },
      ].map((p, i) => (
        <g key={i}>
          <path d={blade(p.tip[0], p.tip[1], p.a[0], p.a[1])} fill="#1e5caf" fillOpacity="0.85" />
          <path d={blade(p.tip[0], p.tip[1], p.b[0], p.b[1])} fill="#9ec0e8" fillOpacity="0.9" />
        </g>
      ))}

      {/* Centre hub */}
      <circle cx={CX} cy={CY} r="34" fill="#ffffff" />
      <circle cx={CX} cy={CY} r="27" fill="url(#vc-hub)" />
      <circle cx={CX} cy={CY} r="27" stroke="#ffffff" strokeOpacity="0.3" />
      <path d={starPath(CX, CY, 13, 4.6, 4)} fill="#ffffff" />

      {/* Value badges, seated on the r=152 ring */}
      {POINTS.map((p) => (
        <g key={p.key}>
          {/* white knock-out so the bezel ring doesn't run through the badge */}
          <circle cx={p.x} cy={p.y} r="31" fill="#ffffff" />
          <circle
            cx={p.x}
            cy={p.y}
            r="30"
            fill={p.tone}
            fillOpacity="0.09"
            stroke={p.tone}
            strokeOpacity="0.38"
            strokeWidth="1.5"
          />
          <Glyph point={p} />
        </g>
      ))}
    </svg>
  );
}
