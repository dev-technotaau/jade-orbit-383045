import { BadgeCheck, Check, Lock, MapPin, Search, Sparkles } from 'lucide-react';

/**
 * BrowserMock — a pure-CSS/SVG "product in action" device window for the
 * How-It-Works section (in place of a screenshot asset). Built from tokens and
 * shapes only, so it is crisp at any size and ships zero image weight.
 *
 * WHY REAL CONTENT, NOT SKELETON BARS
 * The previous version drew grey placeholder rectangles where the job title,
 * company and salary belong. That reads as a *loading state*, not a product —
 * it undersold the thing the section is trying to explain. Every bar is now
 * real (if illustrative) copy: titles, employers, Indian salary bands, cities.
 *
 * WHY IT SHOWS ALL THREE STEPS
 * The section promises "three simple steps" but the old mock only depicted
 * step 2 (search). The floating profile-strength card maps to step 1 (create
 * your profile), the ranked results with match scores to step 2 (discover),
 * and the "Application sent" toast to step 3 (get hired).
 *
 * NO AMBIENT ANIMATION — deliberate. Everything here is static at rest, with
 * motion only under :hover. This section sits directly below the hero, which
 * already carries the GSAP showcase; adding an always-on CSS animation would
 * cost frames on every scroll for decoration nobody is looking at. Hover-only
 * effects are free until the pointer arrives.
 *
 * Presentational — no client features, so this stays a Server Component.
 */
const JOBS = [
  {
    mark: 'TN',
    title: 'Senior Frontend Engineer',
    company: 'TechNova',
    meta: 'Bengaluru · ₹18–26 LPA',
    match: 96,
    tile: 'from-primary to-accent',
  },
  {
    mark: 'LL',
    title: 'Product Designer',
    company: 'Lumen Labs',
    meta: 'Pune · ₹12–18 LPA',
    match: 91,
    tile: 'from-amber-500 to-orange-500',
  },
  {
    mark: 'FL',
    title: 'Data Analyst',
    company: 'Finlytics',
    meta: 'Gurugram · ₹8–14 LPA',
    match: 88,
    tile: 'from-emerald-500 to-teal-500',
  },
];

export default function BrowserMock() {
  return (
    <div
      role="img"
      aria-label="Preview of the Hire Adda job search experience: a profile strength card, ranked job matches, and a sent application confirmation."
      className="group relative mx-auto w-full max-w-lg"
    >
      {/* Layered glow — two blobs in brand hues rather than one flat wash, so
          the window sits in light instead of on a grey halo. */}
      <div
        aria-hidden="true"
        className="bg-primary/15 absolute -inset-6 rounded-[2.5rem] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-accent/10 absolute -top-8 -right-8 h-40 w-40 rounded-full blur-3xl"
      />

      {/* ── Floating card — STEP 1: profile created & parsed ── */}
      {/* Offsets are tuned so the card clears the chrome. The card is ~54px
          tall, so -top-12 (-48px) leaves only ~6px overlapping the window —
          enough to read as layered on top of the device, while the traffic
          lights and URL pill (which start 12px into the chrome) stay fully
          visible. A shallower offset hid them. */}
      <div className="absolute -top-12 -left-6 z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3 py-2.5 shadow-[0_2px_4px_rgba(15,23,42,0.05),0_12px_28px_-10px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80 backdrop-blur-sm sm:flex">
        <span className="from-primary to-primary-dark flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br text-white">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] font-bold text-[var(--text)]">Resume parsed</span>
          <span className="text-primary block text-[10px] font-semibold">Profile 92% complete</span>
        </span>
      </div>

      {/* ── The device window ── */}
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_48px_-16px_rgba(15,23,42,0.30)] ring-1 ring-slate-200">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-100/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#f87171] ring-1 ring-black/5" />
          <span className="h-3 w-3 rounded-full bg-[#fbbf24] ring-1 ring-black/5" />
          <span className="h-3 w-3 rounded-full bg-[#34d399] ring-1 ring-black/5" />
          <div className="ml-3 flex flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] text-[var(--text-muted)] ring-1 ring-slate-200">
            <Lock className="h-2.5 w-2.5 flex-none text-emerald-500" aria-hidden="true" />
            hireadda.in/jobs
          </div>
        </div>

        {/* Viewport — faint tint so the white result cards lift off it */}
        <div className="space-y-3 bg-slate-50/70 p-4">
          {/* Search bar with real query text, not a grey bar */}
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
            <Search className="text-primary h-4 w-4 flex-none" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[var(--text)]">Frontend Developer</span>
            <span className="h-4 w-px flex-none bg-slate-200" />
            <MapPin className="h-3 w-3 flex-none text-[var(--text-muted)]" aria-hidden="true" />
            <span className="text-[11px] text-[var(--text-muted)]">Bengaluru</span>
            <span className="bg-primary ml-auto rounded-md px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
              Search
            </span>
          </div>

          {/* Filter chips — first one reads as the applied filter */}
          <div className="flex items-center gap-2">
            <span className="bg-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
              Remote
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
            {['Full-time', '0–2 yrs'].map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-slate-200"
              >
                {chip}
              </span>
            ))}
            <span className="ml-auto text-[10px] font-medium text-[var(--text-muted)]">
              248 jobs
            </span>
          </div>

          {/* Ranked results */}
          {JOBS.map((job) => (
            <div
              key={job.mark}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition-transform duration-300 group-hover:-translate-y-px"
            >
              {/* Company monogram instead of an anonymous gradient square */}
              <span
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-sm ${job.tile}`}
              >
                {job.mark}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-center gap-1">
                  <span className="truncate text-[11.5px] font-bold text-[var(--text)]">
                    {job.title}
                  </span>
                  <BadgeCheck className="text-primary h-3 w-3 flex-none" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  {job.company}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">
                  {job.meta}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
                    job.match >= 90
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-primary-light text-primary ring-primary/20 ring-1'
                  }`}
                >
                  {job.match}% match
                </span>
                <span className="bg-primary/10 text-primary rounded-md px-2.5 py-1 text-[10px] font-semibold">
                  Apply
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Floating toast — STEP 3: applied & tracked ── */}
      {/* Same reasoning as the card above: -bottom-12 leaves ~6px of overlap,
          which lands inside the viewport's own 16px bottom padding rather
          than on the last result row's Apply button. */}
      <div className="absolute -right-6 -bottom-12 z-20 hidden items-center gap-2.5 rounded-xl bg-white/95 px-3 py-2.5 shadow-[0_2px_4px_rgba(15,23,42,0.05),0_12px_28px_-10px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80 backdrop-blur-sm sm:flex">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] font-bold text-[var(--text)]">Application sent</span>
          <span className="block text-[10px] font-semibold text-emerald-600">
            Shortlisted · 2 days
          </span>
        </span>
      </div>
    </div>
  );
}
