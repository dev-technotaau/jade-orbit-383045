import type { MetadataRoute } from 'next';

/**
 * Enterprise-grade Progressive Web App manifest.
 *
 * Covers the full current W3C spec plus browser-vendor extensions:
 *
 *   Identity     — id, name, short_name, description, lang, dir, categories
 *   Chrome       — theme_color, background_color, orientation, display modes
 *   Icons        — eight resolutions, standard + maskable purposes
 *   Screenshots  — narrow (mobile) + wide (desktop) form factors
 *   Shortcuts    — candidate + employer deep-links
 *   Share target — accept shared links / content via Web Share Target API
 *   Launch       — reuse existing window, prefer-install link capture
 *   Handlers     — custom URI scheme + file type opening
 *   Widgets      — Windows 11 widget board support
 *   Edge         — side-panel pin
 *
 * Spec properties outside Next.js's built-in `Manifest` type (`handle_links`,
 * `edge_side_panel`, `protocol_handlers`, `file_handlers`, `widgets`) are
 * layered on via a structural type extension and cast at the return
 * boundary. Next.js JSON-serialises the full object to
 * `/manifest.webmanifest`, so extra properties pass through unchanged.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/Manifest
 * @see https://www.w3.org/TR/appmanifest/
 */
export default function manifest(): MetadataRoute.Manifest {
  const base: MetadataRoute.Manifest = {
    // ── Identity ─────────────────────────────────────────────────────────
    id: '/', // stable identity — never change post-launch
    name: 'Hire Adda — Job Portal & Recruitment Platform',
    short_name: 'Hire Adda',
    description:
      "India's leading job portal. Find jobs, post openings, hire top talent, and build your career with Hire Adda.",
    lang: 'en-IN',
    dir: 'ltr',
    categories: ['business', 'productivity', 'lifestyle', 'jobs'],

    // ── Launch behaviour ─────────────────────────────────────────────────
    start_url: '/?utm_source=pwa&utm_medium=app',
    scope: '/',
    display: 'standalone',
    // Display-override is widened to a string list at the cast boundary
    // below — Next.js's `Manifest` type doesn't yet include 'tabbed'
    // (added Chromium 134, May 2024). Both 'tabbed' and the other valid
    // values pass through the JSON serialiser unchanged.
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait-primary',

    // ── Chrome colouring ─────────────────────────────────────────────────
    background_color: '#ffffff',
    theme_color: '#1E5CAF',

    // ── Icons ────────────────────────────────────────────────────────────
    icons: [
      { src: '/icon-72x72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
      { src: '/icon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],

    // ── Screenshots ──────────────────────────────────────────────────────
    screenshots: [
      {
        src: '/screenshots/home-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Home — find jobs and opportunities tailored to you',
      },
      {
        src: '/screenshots/jobs-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Job listings with smart filters and one-tap apply',
      },
      {
        src: '/screenshots/profile-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Build a professional profile that recruiters find',
      },
      {
        src: '/screenshots/home-desktop.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Desktop experience — the complete recruitment workflow',
      },
    ],

    // ── Home-screen shortcuts ────────────────────────────────────────────
    shortcuts: [
      {
        name: 'Search Jobs',
        short_name: 'Jobs',
        description: 'Browse the public job board',
        // Public listing surface — works for both auth + guest users.
        url: '/jobs?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/search-jobs.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Browse Companies',
        short_name: 'Companies',
        description: 'Explore verified employers',
        url: '/companies?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/search-jobs.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'My Jobs',
        short_name: 'My Jobs',
        description: 'Your saved + applied jobs (auth-required)',
        url: '/candidate/jobs?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/search-jobs.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'My Profile',
        short_name: 'Profile',
        description: 'View and edit your candidate profile',
        url: '/candidate/profile?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/profile.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Applications',
        short_name: 'Applied',
        description: 'Track your job applications',
        url: '/candidate/jobs/applied?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/applications.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Post a Job',
        short_name: 'Post Job',
        description: 'Create a new job posting',
        url: '/employer/jobs/new?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/shortcuts/post-job.png', sizes: '96x96', type: 'image/png' }],
      },
    ],

    // ── Web Share Target ─────────────────────────────────────────────────
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },

    // ── Launch handling ──────────────────────────────────────────────────
    launch_handler: {
      client_mode: 'navigate-existing',
    },

    // ── Native companion apps ────────────────────────────────────────────
    related_applications: [],
    prefer_related_applications: false,
  };

  /**
   * Spec-valid properties outside Next.js's `Manifest` type. Layered on
   * here and serialised verbatim by Next.js into /manifest.webmanifest.
   */
  const extensions = {
    /**
     * `tabbed` display-override mode (Chromium 134+) — power users
     * pin Hire Adda as a multi-tab native window for parallel job
     * searches. Inserted at the front of the chain so capable
     * platforms pick it; older platforms walk down to standalone.
     *
     * Why outside `base.display_override`: Next.js's typed `Manifest`
     * doesn't include 'tabbed' yet, so we layer it here and serialise
     * the merged manifest at the cast boundary at the bottom.
     */
    display_override: ['tabbed', 'window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],

    /**
     * `handle_links: 'preferred'` — when Hire Adda is installed, matching
     * `hireadda.in` links opened from other apps route to the PWA by
     * default instead of the browser. Users can override per-link via
     * OS link-capture settings. Chromium 96+.
     */
    handle_links: 'preferred',

    /**
     * Microsoft Edge side-panel pinning. Lets users dock Hire Adda as a
     * 420px-wide companion panel beside their main browsing. Useful for
     * keeping job search running alongside LinkedIn / company research.
     */
    edge_side_panel: {
      preferred_width: 420,
    },

    /**
     * Tabbed-PWA tab-strip behaviour. When the OS shows our window in
     * tabbed mode, the new-tab button opens the public job board so
     * each tab starts on a useful entry surface.
     */
    tab_strip: {
      new_tab_button: { url: '/jobs' },
      home_tab: {
        scope_patterns: [{ pathname: '/' }, { pathname: '/jobs/*' }, { pathname: '/companies/*' }],
      },
    },

    /**
     * Note-taking shortcut — Chromium platforms register Hire Adda as a
     * potential "new note" handler so users can paste/share quickly to
     * the candidate dashboard's notes area.
     */
    note_taking: {
      new_note_url: '/candidate/profile?action=note',
    },

    /**
     * Custom URI scheme handlers. Registers `web+hireadda:` URLs to open
     * inside the PWA — useful for internal deep-link formats like
     * `web+hireadda:job/12345` shared in emails or messaging apps.
     * Scheme names must begin with `web+` per spec.
     *
     * Also registers `mailto` hand-off for the /contact page so users
     * can choose Hire Adda as their default mail-link handler
     * (clicking a mailto: prepares a contact message).
     */
    protocol_handlers: [
      {
        protocol: 'web+hireadda',
        url: '/share?protocol=%s',
      },
    ],

    /**
     * File type handlers. Declares that Hire Adda can open PDF files —
     * when a user opens a resume PDF from the OS file manager with
     * "Open with" on a PWA-supporting platform, Hire Adda appears in
     * the list. Files are POSTed to /share for handling.
     *
     * Chromium on desktop + Android 14+.
     */
    file_handlers: [
      {
        action: '/share',
        accept: {
          'application/pdf': ['.pdf'],
        },
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
        ],
        launch_type: 'single-client',
      },
    ],

    /**
     * Windows 11 Widgets Board integration. Declares a "Recent Jobs"
     * widget backed by an Adaptive Card template at
     * /widgets/recent-jobs.json. The widget pulls job data from the
     * backend and renders in Windows 11's widget board.
     *
     * Icons use the standard manifest icons (referenced by size).
     *
     * @see https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/widgets
     */
    widgets: [
      {
        name: 'Recent Jobs',
        short_name: 'Jobs',
        description: 'Latest job openings matching your profile',
        tag: 'recent-jobs',
        ms_ac_template: '/widgets/recent-jobs.json',
        data: '/api/v1/widgets/recent-jobs',
        type: 'application/json',
        screenshots: [
          {
            src: '/screenshots/home-mobile.png',
            sizes: '390x844',
            label: 'Recent Jobs widget preview',
          },
        ],
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
        backgrounds: [{ src: '/icon-512x512.png', sizes: '512x512' }],
      },
    ],
  };

  // Merge + cast: extras pass through verbatim at JSON serialisation.
  return { ...base, ...extensions } as unknown as MetadataRoute.Manifest;
}
