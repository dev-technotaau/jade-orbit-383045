import type { MetadataRoute } from 'next';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || 'TechnoTaau';

/**
 * Installable PWA manifest.
 *
 * The host platform's version was 311 lines covering the full W3C spec plus
 * vendor extensions — job-board screenshots, candidate/employer deep-link
 * shortcuts, a Web Share Target, protocol and file handlers, Windows 11
 * widgets backed by `/api/v1/widgets/recent-jobs`, and an Edge side-panel pin.
 * Every one of those pointed at a route or endpoint that no longer exists.
 *
 * What an operator tool actually needs: install it, launch it standalone, and
 * jump straight to a section. Name and colours are brand-driven so each
 * deployment installs under its own identity.
 *
 * `id` is deliberately '/' and must never change — browsers key an installed
 * app's identity off it, and changing it orphans existing installs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND,
    short_name: BRAND,
    description: 'WhatsApp Business inbox, templates and campaigns.',
    categories: ['business', 'productivity'],
    lang: 'en',
    dir: 'ltr',

    start_url: '/whatsapp',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#1e5caf',

    icons: [
      { src: '/icon-72x72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
      { src: '/icon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable variants let Android crop to its adaptive-icon shape without
      // clipping the mark.
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

    shortcuts: [
      { name: 'Inbox', short_name: 'Inbox', description: 'Open conversations', url: '/whatsapp' },
      {
        name: 'Campaigns',
        short_name: 'Campaigns',
        description: 'Broadcasts and sequences',
        url: '/whatsapp/campaigns',
      },
      {
        name: 'Templates',
        short_name: 'Templates',
        description: 'Message templates',
        url: '/whatsapp/templates',
      },
    ],
  };
}
