import BrandIcon from '@/components/common/BrandIcon';
import Tooltip from '@/components/ui/Tooltip';

/**
 * Sitewide floating WhatsApp button.
 *
 * Sits directly above `BackToTop` in the bottom-right stack and is
 * deliberately the same 44×44 (`h-11 w-11`) size, so the two read as one
 * control column. The only behavioural difference is visibility:
 * BackToTop fades in past 400px of scroll, this one is always visible.
 *
 * Positioning: BackToTop is `bottom-6` (1.5rem) and 2.75rem tall, so it
 * occupies 1.5rem→4.25rem from the bottom. `bottom-20` (5rem) leaves a
 * 0.75rem gap between them and keeps both clear of the viewport edge.
 *
 * Mounted in `PublicLayout`'s `PublicChrome` — NOT in the root layout
 * where BackToTop lives. That placement is what scopes it to public
 * marketing pages: `InAppChrome` (the dashboard-chrome swap that
 * PublicLayout performs for logged-in candidates/employers on /pricing,
 * /vendors and company-detail routes) never renders it, and neither does
 * DashboardLayout.
 *
 * Not a client component: it is a static external link with no state.
 * `Tooltip` carries its own `'use client'`, so the boundary starts there.
 */

/** Same destination as the contact page's WhatsApp card used to point at. */
const WHATSAPP_URL = 'https://wa.me/918054050551';

export default function WhatsAppFloatingButton() {
  return (
    <Tooltip content="Chat with us on WhatsApp">
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        // `#25D366` is WhatsApp's official brand green — the same value
        // BrandIcon's BRAND_COLOURS registry holds for this slug. Hard-coded
        // rather than themed: a brand button that changes colour with our
        // palette stops being recognisable as WhatsApp.
        className="fixed right-6 bottom-20 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <BrandIcon name="whatsapp" className="h-5.5 w-5.5 text-white" />
      </a>
    </Tooltip>
  );
}
